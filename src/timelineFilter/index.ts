import { IWidget } from 'interfaces/IWidget';
import { getCurrentLeadId, clearStfResolveCache, resolveTargets } from './resolver';
import type { IStfResolution } from './resolver';
import { processList, unhideAll, isEventWrapper } from './hider';
import { collectAuthors } from './classifier';
import { ensureToggleButton, updateToggleButton, resolveToggleButtonHost, STF_TOGGLE_BTN_ID } from './button';
import type { STFViewMode, IStfButtonHost } from './button';
import { createListObserver } from './observer';
import type { IStfListObserver } from './observer';
import { checkStfAnchors, stfCanaryOnProcess, stfCanaryIsDisabled, stfCanaryDeactivate, pushStfDiagnostic } from './canary';
import {
  STF_CACHE_TTL_MS,
  STF_SETTINGS_CACHE_KEY,
  STF_TARGET_USERS_CACHE_KEY,
  readStfSettingsCache,
  writeStfSettingsCache,
  readStfTargetUsersEntry,
  writeStfTargetUsersEntry,
  resetStfTargetUsersCache,
  stfDeduplicate,
  stfStorageKey,
  readStfJson,
  writeStfJson,
} from './cache';

// Точка входа модуля (план §5.1): на деталке сделки (current_entity === 'leads' && is_card)
// идемпотентно ставит маркер [STF] и разворачивает runtime: резолв → кнопка + observer → processList.
// Никакого фильтрующего кода до получения cfg+targetIds (§5.2). Весь модуль изолирован (R11):
// вызывается из render() одним try/catch'ем, на остальных сущностях — тишина.

interface IAmoCrmData {
  current_entity?: string;
  is_card?: boolean;
}

const LEAD_ENTITY = 'leads';
const MARKED_VALUE = 'mounted';
const SAFETY_TICK_MS = 1000; // §5.1.2: страховка на случай перерендера блока истории без повторного render()
const BOOTSTRAP_TICK_MS = 500; // H1-фикс: наблюдатель URL, НЕ зависящий от callback'а amo render()
const NOTES_LIST_SELECTOR = '.notes-wrapper__notes.js-notes';

type StfPhase = 'idle' | 'resolving' | 'active' | 'inactive' | 'disabled';
type StfMountTrigger = 'render' | 'url-watch';

interface IStfRuntime {
  phase: StfPhase;
  leadId: string | null; // текущая карточка по URL (SPA-переходы, §5.1.2)
  activeLeadId: string | null; // карточка с активным фильтром
  resolution: IStfResolution | null;
  viewMode: STFViewMode; // состояние кнопки (дефолт filtered, §5.4)
  listEl: Element | null; // наблюдаемый узел списка (стабилен при догрузке, research §3)
  observer: IStfListObserver | null;
  hiddenCount: number;
  epoch: number; // защита от гонки: результат резолва устаревшей карточки отбрасывается
  tickTimer: ReturnType<typeof setInterval> | null;
  authorLogLeadId: string | null; // H4-диагностика: одноразовый лог собранных авторов на карточку
  buttonHostKind: string | null; // вид хоста кнопки (tab-bar/toolbar-row/legacy-scroller) — для лога при смене
  hostMissingLoggedLeadId: string | null; // диагностика «хост не найден» — не чаще раза на карточку
}

const runtime: IStfRuntime = {
  phase: 'idle',
  leadId: null,
  activeLeadId: null,
  resolution: null,
  viewMode: 'filtered',
  listEl: null,
  observer: null,
  hiddenCount: 0,
  epoch: 0,
  tickTimer: null,
  authorLogLeadId: null,
  buttonHostKind: null,
  hostMissingLoggedLeadId: null,
};

// Глобальный наблюдатель URL (H1-фикс): один интервал на жизнь страницы. render() amoCRM — НЕ надёжный
// триггер (SPA-переход на деталку из списка может не вызвать render(), либо прийти со stale AMOCRM.data),
// поэтому наличие /leads/detail/{id} в pathname — единственный источник истины «мы на деталке сделки».
let bootstrapTimer: ReturnType<typeof setInterval> | null = null;

function getAmoCrmData(widget: IWidget): IAmoCrmData | null {
  const amocrm = widget.amocrm as { data?: IAmoCrmData } | null;
  return amocrm?.data ?? null;
}

function isLeadCard(data: IAmoCrmData | null): boolean {
  return data?.current_entity === LEAD_ENTITY && !!data.is_card;
}

// Маркер [STF] на <html>: mounted (деталка найдена) → active / inactive (резолв).
export function mountTimelineFilter(widget: IWidget): void {
  const data = getAmoCrmData(widget);

  if (!isLeadCard(data)) {
    handleLeaveLeadDetail(); // ситуационная страховка (подэтап F-2) — уход с деталки
    return;
  }

  startFromUrl('render');
}

// H1-фикс: старт модуля по URL, НЕ зависящий от свежего AMOCRM.data. render() может не прийти
// (SPA) или прийти со stale data — pathname уже проверен вызывающим (mountTimelineFilter через
// isLeadCard / bootstrapFromUrl через getCurrentLeadId), здесь остаётся только canary-гейт и старт.
function startFromUrl(trigger: StfMountTrigger): void {
  if (stfCanaryIsDisabled()) {
    // Этап 5: canary деактивировал модуль на TTL (24 ч), в т.ч. после перезагрузки страницы —
    // persisted-флаг читается ДО любой mount-работы, активация не стартует, тишина.
    return;
  }

  markMounted(trigger);

  const leadId = getCurrentLeadId();
  onLeadIdChanged(leadId); // новая карточка → (re)резолв; та же активная карточка → no-op (идемпотентность)
  ensureTickStarted();     // §5.1.2: страховочный интервал переживает SPA-переходы и пересборки
}

// H1-фикс: лёгкий глобальный наблюдатель смены URL — дешёвый периодический тик (500 мс) по pathname,
// надёжнее popstate/MutationObserver для SPA amoCRM (pushState без событий). На /leads/detail/{id} —
// старт (идемпотентно по leadId), на уходе — teardown. Один интервал на жизнь страницы: нет утечек и
// двойных инстансов; после canary-деактивации тишина держится до TTL, затем «свежий старт» сам.
export function startStfBootstrap(): void {
  if (bootstrapTimer !== null) {
    return; // идемпотентность: повторно не заводим
  }

  console.info(`[STF] bootstrap armed: URL watcher every ${BOOTSTRAP_TICK_MS}ms (render-independent)`);
  bootstrapFromUrl(); // немедленный первый проход — пользователь мог зайти на деталку до инициализации
  bootstrapTimer = setInterval(bootstrapFromUrl, BOOTSTRAP_TICK_MS);
}

export function stopStfBootstrap(): void {
  if (bootstrapTimer !== null) {
    clearInterval(bootstrapTimer);
    bootstrapTimer = null;
  }
}

function bootstrapFromUrl(): void {
  const leadId = getCurrentLeadId();
  if (leadId === null) {
    handleLeaveLeadDetail(); // не на деталке сделки — quiet (no-op, когда модуль ещё idle)
    return;
  }

  // Устойчивые состояния для ЭТОЙ карточки — повторный старт не нужен: без этой защиты каждый тик
  // в phase='inactive' запускал бы новый резолв (amo v4 GET на каждом тике = сетевой спам). Повторные
  // резолвы по смене настроек/этапа по-прежнему приходят через render() amo — семантика §5.2 сохранена.
  if ((runtime.phase === 'active' && runtime.activeLeadId === leadId) || runtime.phase === 'resolving') {
    return;
  }
  if (runtime.phase === 'inactive' && runtime.leadId === leadId) {
    return; // уже резолвили и в quiet — ждём смену URL или render() amo
  }

  startFromUrl('url-watch');
}

// Ситуационная страховка (подэтап F-2): render() пришёл с is_card=false (карточку закрыли,
// уход в список) или на странице другой сущности — полный teardown состояния. onLeadIdChanged(null)
// дополнительно блокирует in-flight резолв через race-guard (runtime.leadId становится null).
function handleLeaveLeadDetail(): void {
  if (runtime.phase === 'disabled') {
    return; // canary-деактивация: состояние уже разобрано, тишина держится по TTL
  }
  if (runtime.phase === 'idle' && runtime.leadId === null) {
    return; // разбирать нечего — модуль ещё ни разу не стартал
  }
  onLeadIdChanged(null);
}

function markMounted(trigger: StfMountTrigger): void {
  const root = document.documentElement;

  if (root.dataset.stfTimelineFilter) {
    return; // идемпотентность: маркер уже стоит (render()/bootstrap вызываются при каждом перерисовывании)
  }

  root.dataset.stfTimelineFilter = MARKED_VALUE;
  console.log(`[STF] timeline-filter: lead card detected (trigger=${trigger}), marker set`);
}

function setPhase(phase: StfPhase): void {
  runtime.phase = phase;
  const root = document.documentElement;

  if (phase === 'active') {
    root.dataset.stfTimelineFilter = 'active';
    console.log('[STF] timeline-filter: active, filtering enabled');
  } else if (phase === 'inactive') {
    root.dataset.stfTimelineFilter = 'inactive';
    console.log('[STF] timeline-filter: inactive (no active funnel config), quiet mode');
  } else if (phase === 'disabled') {
    root.dataset.stfTimelineFilter = 'disabled';
    console.log('[STF] timeline-filter: disabled by canary, quiet until TTL expires');
  } else {
    root.dataset.stfTimelineFilter = MARKED_VALUE; // mounted/resolving — маркер без активации
  }
}

function ensureTickStarted(): void {
  if (runtime.tickTimer !== null) {
    return;
  }
  runtime.tickTimer = setInterval(tick, SAFETY_TICK_MS);
}

// SPA-переход между карточками / уход с деталки (§5.1.2). Повторный render() ТОЙ ЖЕ активной
// карточки — no-op (одна выборка на открытие, §5.2); но inactive/resolving по той же leadId
// разрешает повторный резолв: перерисовка amo при смене этапа вызывает render() → фильтр обязан
// пересчитать актуальность по текущему status_id (§5.2).
function onLeadIdChanged(leadId: string | null): void {
  const prevLeadId = runtime.leadId;
  const sameCard = prevLeadId === leadId;
  if (sameCard && ((runtime.phase === 'active' && runtime.activeLeadId === leadId) || runtime.phase === 'resolving')) {
    return; // активная/в-полёте карточка уже обработана
  }
  if (sameCard && !leadId && runtime.phase === 'inactive') {
    return; // уже в тихом режиме без URL — повторный render() не меняет состояния
  }

  runtime.leadId = leadId;

  if (!leadId) {
    // H3-диагностика: различаем «мы УШЛИ с деталки (URL сменился/карточка закрыта)» от canary-провала
    // «не нашли DOM-якоря» — в ring-buffer попадает явная причина teardown'а, а не тишина.
    if ((runtime.phase === 'active' || runtime.phase === 'resolving') && prevLeadId !== null) {
      console.info(`[STF] left lead detail (lead ${prevLeadId}) — teardown, quiet mode (URL change, not anchors)`);
      pushStfDiagnostic('leave lead detail: teardown on URL change (NOT an anchor failure)', prevLeadId);
    }
    teardownRuntime();
    setPhase('inactive'); // покинули деталку сделки — тихий режим
    return;
  }

  runtime.epoch++;
  teardownRuntime();
  void startResolve(leadId);
}

async function startResolve(leadId: string): Promise<void> {
  const epoch = runtime.epoch;

  setPhase('resolving');
  // Никакого фильтрующего кода до получения cfg+targetIds (§5.2)
  let resolution: IStfResolution | null;
  try {
    resolution = await resolveTargets(leadId); // гейты внутри, исключений не бросает
  } catch (e) {
    console.warn('[STF] resolve failed', e);
    resolution = null;
  }

  // Гонка: во время запроса карточка сменилась — результат отбрасываем (новый резолв уже идёт)
  if (epoch !== runtime.epoch || runtime.leadId !== leadId) {
    return;
  }

  if (!resolution) {
    setPhase('inactive'); // null: виджет молчит, показ без фильтра (маркер [STF] inactive)
    return;
  }

  activate(resolution);
}

function activate(resolution: IStfResolution): void {
  runtime.resolution = resolution;
  runtime.activeLeadId = runtime.leadId;
  runtime.viewMode = 'filtered'; // новая карточка — свежее состояние «фильтр включён» (§5.4)
  setPhase('active');

  ensureAttached(); // блок истории может появиться асинхронно — дождаемся в страховочном интервале
}

// Кнопка + observer + первый processList (§5.4/§5.5). Идемпотентно: вызывается из activate()
// и с каждого тика; если amo уже пересобрал список (list-узел заменён) — переподключаемся.
// Хост кнопки НЕ зависит от якорей списка: ряд тулбара (#history_settings / .feed-compose) может
// появиться раньше scroller'а или на аккаунте, где старый скролл-якорь отсутствует (симптом
// «кнопка не видна»): инъекция в строку табов идёт независимо, observer ждёт список.
function ensureAttached(): boolean {
  paintToggleButtonHost();

  const listEl = document.querySelector(NOTES_LIST_SELECTOR) as Element | null;
  if (!listEl) {
    return false; // блок «История» ещё не отрендерился (асинхронно) — тик опрашивает дальше
  }

  runtime.listEl = listEl;

  const needsReprocess = !runtime.observer || runtime.observer.target !== listEl;
  if (needsReprocess) {
    attachObserver(listEl);
    processAndPaint(); // первый проход / проход после замены list-узла (§2.2: разделители регенерируются)
  }

  return true;
}

// Разрешение хоста кнопки + диагностика вживую (задача «кнопка не видна»): при смене вида хоста —
// console.info с точным якорем, при отсутствии ВСЕХ кандидатов на активной карточке — console.warn +
// diagnostic в ring-buffer (не чаще раза на карточку: страховочный тик 1 с не спамит).
function paintToggleButtonHost(): void {
  const host: IStfButtonHost | null = resolveToggleButtonHost();

  if (!host) {
    if (runtime.phase === 'active' && runtime.hostMissingLoggedLeadId !== runtime.leadId) {
      console.warn('[STF] toggle button host: NOT FOUND — no #history_settings / .feed-compose / '
        + '.notes-wrapper__scroller-inner in DOM; timeline block may not be rendered yet or markup changed');
      pushStfDiagnostic('toggle button host not found (tab-bar/toolbar-row/scroller all missing)', runtime.leadId);
      runtime.hostMissingLoggedLeadId = runtime.leadId;
    }
    if (runtime.buttonHostKind !== null) {
      console.info(`[STF] toggle button host: ${runtime.buttonHostKind} → gone (DOM re-render, waiting)`);
      runtime.buttonHostKind = null; // возврат хоста залоггируется заново
    }
    return;
  }

  if (host.kind !== runtime.buttonHostKind) {
    const containerCls = String(host.container.className).slice(0, 60);
    console.info(`[STF] toggle button host: ${host.kind} (${host.container.tagName.toLowerCase()}${containerCls ? '.' + containerCls : ''})`);
    runtime.buttonHostKind = host.kind;
  }

  ensureToggleButton(host, handleToggle);
}

function attachObserver(listEl: Element): void {
  if (runtime.observer && runtime.observer.target === listEl) {
    return; // уже наблюдаем этот узел (нода стабилен при догрузке, research §3)
  }
  if (runtime.observer) {
    runtime.observer.disconnect();
  }
  runtime.observer = createListObserver(listEl, processAndPaint);
}

// Полный идемпотентный проход: canary-чек якорей (Этап 5) → classify+apply по wrapper'ам →
// pass разделителей; в allShown — только пересчёт счётчика без скрытий (§5.4). Счётчик — в тексте кнопки.
function processAndPaint(): void {
  const listEl = runtime.listEl;
  const resolution = runtime.resolution;

  if (!listEl || !resolution) {
    return;
  }

  // Canary (Этап 5, R1): чек-лист якорей на каждом processList — после N подряд провальных
  // прогонов тихая деактивация (unhideAll + кнопка/observer/tick сняты + diagnostic).
  if (stfCanaryOnProcess(checkStfAnchors(listEl), runtime.leadId)) {
    deactivateByCanary();
    return;
  }

  const result = processList(listEl, resolution.cfg, resolution.targetIds, runtime.viewMode);
  runtime.hiddenCount = result.hiddenCount;
  updateToggleButton(findButton(), runtime.viewMode, runtime.hiddenCount);

  logAuthorDiagnosticsOnce(); // H4: одноразово на карточку — лог собранных авторов vs targetIds
}

// H4-диагностика (одноразовая на leadId): если amo перестала отдавать числовые id авторов в нужных
// селекторах, collectAuthors даст пусто → ВСЕ события с авторами уйдут в hide (или hide_no_author),
// и симптом будет «фильтр всё прячет/ничего не делает». Логируем фактические authorIds/targetIds при
// активации: по строке [STF] timeline DOM видно, нашла ли сборка авторов реальную разметку.
function logAuthorDiagnosticsOnce(): void {
  const listEl = runtime.listEl;
  if (!listEl || !runtime.leadId || runtime.authorLogLeadId === runtime.leadId) {
    return; // ещё не отрендерился / уже залогировано для этой карточки
  }
  runtime.authorLogLeadId = runtime.leadId;

  let wrappers = 0;
  const authors = new Set<number>();
  for (const child of Array.from(listEl.children)) {
    if (!isEventWrapper(child)) {
      continue;
    }
    wrappers++;
    collectAuthors(child).forEach((id) => authors.add(id));
  }

  const targetIds = runtime.resolution?.targetIds ?? new Set<number>();
  console.info(
    `[STF] timeline DOM (lead ${runtime.leadId}): ${wrappers} events, `
    + `authors [${[...authors].join(', ') || '∅'}], targets [${[...targetIds].slice(0, 12).join(', ')}] total=${targetIds.size}`,
  );

  if (wrappers > 0 && authors.size === 0) {
    console.warn('[STF] NO numeric author ids collected from timeline DOM — amo markup may have changed '
      + '(check .feed-note__amojo-user[data-id] / div.n-avatar[id])');
    pushStfDiagnostic('no numeric author ids in timeline DOM (markup change?)', runtime.leadId);
  }
}

function stopTick(): void {
  if (runtime.tickTimer !== null) {
    clearInterval(runtime.tickTimer);
    runtime.tickTimer = null;
  }
}

// Этап 5: canary-деактивация — восстановить всё скрытое (unhideAll), снять кнопку, остановить
// observer и тики; phase='disabled' → тишина на странице и после перезагрузки до истечения TTL.
function deactivateByCanary(): void {
  stfCanaryDeactivate({
    listEl: runtime.listEl,
    disconnectObserver: () => {
      if (runtime.observer) {
        runtime.observer.disconnect();
        runtime.observer = null;
      }
    },
    stopTick,
  });

  runtime.activeLeadId = null;
  runtime.leadId = null;
  runtime.resolution = null;
  runtime.listEl = null;
  runtime.hiddenCount = 0;
  runtime.viewMode = 'filtered';
  setPhase('disabled');
}

function findButton(): HTMLElement | null {
  return document.getElementById(STF_TOGGLE_BTN_ID) as HTMLElement | null;
}

// Клик по кнопке (§5.4): allShown — снять ВСЕ наши скрытия (wrapper'ы+разделители), observer не
// фильтрует новые порции; обратно — полный перепроход процессом.
function handleToggle(): void {
  if (!runtime.resolution || !runtime.listEl) {
    return;
  }

  runtime.viewMode = runtime.viewMode === 'filtered' ? 'allShown' : 'filtered';
  processAndPaint(); // allShown → unhideAll+счётчик 0; filtered → полный проход classify+separators
}

// Страховочный тик (§5.1.2): проверяет наличие кнопки/list/observer и восстанавливает идемпотентно.
function tick(): void {
  if (runtime.phase === 'disabled') {
    return; // Этап 5: после canary-деактивации тишина (тик в норме уже остановлен)
  }

  const leadId = getCurrentLeadId();
  if (leadId !== runtime.leadId) {
    onLeadIdChanged(leadId); // SPA-переход без повторного render() / уход с деталки
    return;
  }

  if (!runtime.resolution || runtime.phase !== 'active') {
    return; // quiet/resolving — восстанавливать нечего (блок истории дождётся activate/tick)
  }

  ensureAttached(); // блок ещё не появился → false, повторим на следующем тике; узел заменён → переподключение
}

// Смена карточки/покидание деталки: observer отключается, наши скрытия с старого списка снимаются
// (чтобы в осколке DOM amo ничего не осталось), кнопка убирается.
function teardownRuntime(): void {
  if (runtime.observer) {
    runtime.observer.disconnect();
    runtime.observer = null;
  }

  if (runtime.listEl?.isConnected) {
    unhideAll(runtime.listEl);
  }

  const button = document.getElementById(STF_TOGGLE_BTN_ID);
  if (button && button.dataset.stfState) {
    button.remove();
  }

  runtime.activeLeadId = null;
  runtime.resolution = null;
  runtime.listEl = null;
  runtime.hiddenCount = 0;
  runtime.viewMode = 'filtered';
  runtime.authorLogLeadId = null; // новая карточка — одноразовая H4-диагностика авторов заново
  runtime.buttonHostKind = null; // диагностика хоста кнопки — заново на следующей карточке
  runtime.hostMissingLoggedLeadId = null;
}

// Явный shutdown lifecycle (подэтап F-2): остановка interval/observer/teardown + полный сброс
// состояния (включая resolve-кэш на время жизни маунта, §5.2). Идемпотентен: повторные вызовы —
// no-op; после destroy() mountTimelineFilter() делает «свежий» re-mount. Из src/index.js не
// вызывается (ограничение минимальной правки проводки) — seam для тестов/обёрток установки.
export function destroyTimelineFilter(): void {
  stopTick();
  stopStfBootstrap(); // H1-фикс: наблюдатель URL тоже часть lifecycle (no-op, если не запущен)
  teardownRuntime(); // observer + unhideAll(старый список) + кнопка + сброс полей runtime
  clearStfResolveCache();

  runtime.phase = 'idle';
  runtime.leadId = null;
  delete document.documentElement.dataset.stfTimelineFilter; // маркер — re-mount стартует с нуля
}

// --- Публичные seams и экспорты модуля (подэтапы D/E) ---
// startStfBootstrap/stopStfBootstrap — объявлены выше как export function (H1-фикс: наблюдатель URL).
export { loadTimelineFilterSettings, saveTimelineFilterSettings } from './settingsProvider';
export { loadTargetUsers } from './targetUsersProvider';
export { classify, collectAuthors, isSystem, isPinned, toIntOrNull } from './classifier';
export type { STFVerdict } from './classifier';
export { hideNode, showNode, processWrappers, processSeparators, unhideAll, processList } from './hider';
export type { IStfProcessResult } from './hider';
export { ensureToggleButton, updateToggleButton, resolveToggleButtonHost, STF_TOGGLE_BTN_ID } from './button';
export type { STFViewMode, IStfButtonHost, STFButtonHostKind } from './button';
export { createListObserver, STF_DEBOUNCE_MS } from './observer';
export type { IStfListObserver } from './observer';
export { resolveTargets, getCurrentLeadId, clearStfResolveCache, extractStfLead } from './resolver';
export type { IStfResolution, ILeadSnapshot } from './resolver';

// Тестовые/сервисные утилиты кеша (Этапы C/D)
export {
  STF_CACHE_TTL_MS,
  STF_SETTINGS_CACHE_KEY,
  STF_TARGET_USERS_CACHE_KEY,
  readStfSettingsCache,
  writeStfSettingsCache,
  readStfTargetUsersEntry,
  writeStfTargetUsersEntry,
  resetStfTargetUsersCache,
  stfDeduplicate,
  stfStorageKey,
  readStfJson,
  writeStfJson,
};

// Canary (Этап 5): регрессионная защита от переверстки amo (R1) — тихая деактивация + diagnostic
export {
  checkStfAnchors,
  stfCanaryOnProcess,
  stfCanaryIsDisabled,
  stfCanaryDeactivate,
  pushStfDiagnostic,
} from './canary';
export type { STFAnchorsStatus, IStfDeactivateContext } from './canary';
export {
  STF_CANARY_CACHE_KEY,
  STF_DIAGNOSTICS_KEY,
  STF_CANARY_FAIL_LIMIT,
  STF_CANARY_TTL_MS,
} from './canary';
