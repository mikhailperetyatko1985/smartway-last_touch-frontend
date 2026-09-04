import { IWidget } from 'interfaces/IWidget';
import { getCurrentLeadId, clearStfResolveCache, resolveTargets } from './resolver';
import type { IStfResolution } from './resolver';
import { processList, unhideAll } from './hider';
import { ensureToggleButton, updateToggleButton, STF_TOGGLE_BTN_ID } from './button';
import type { STFViewMode } from './button';
import { createListObserver } from './observer';
import type { IStfListObserver } from './observer';
import { checkStfAnchors, stfCanaryOnProcess, stfCanaryIsDisabled, stfCanaryDeactivate } from './canary';
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
const SCROLLER_SELECTOR = '.notes-wrapper__scroller-inner';
const NOTES_LIST_SELECTOR = '.notes-wrapper__notes.js-notes';

type StfPhase = 'idle' | 'resolving' | 'active' | 'inactive' | 'disabled';

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
};

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

  if (stfCanaryIsDisabled()) {
    // Этап 5: canary деактивировал модуль на TTL (24 ч), в т.ч. после перезагрузки страницы —
    // persisted-флаг читается ДО любой mount-работы, активация не стартует, тишина.
    return;
  }

  markMounted();

  const leadId = getCurrentLeadId();
  onLeadIdChanged(leadId); // новая карточка → (re)резолв; та же активная карточка → no-op
  ensureTickStarted();     // §5.1.2: страховочный интервал переживает SPA-переходы и пересборки
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

function markMounted(): void {
  const root = document.documentElement;

  if (root.dataset.stfTimelineFilter) {
    return; // идемпотентность: маркер уже стоит (render() вызывается при каждом перерисовывании)
  }

  root.dataset.stfTimelineFilter = MARKED_VALUE;
  console.log('[STF] timeline-filter: lead card detected, marker set');
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
  const sameCard = runtime.leadId === leadId;
  if (sameCard && ((runtime.phase === 'active' && runtime.activeLeadId === leadId) || runtime.phase === 'resolving')) {
    return; // активная/в-полёте карточка уже обработана
  }
  if (sameCard && !leadId && runtime.phase === 'inactive') {
    return; // уже в тихом режиме без URL — повторный render() не меняет состояния
  }

  runtime.leadId = leadId;

  if (!leadId) {
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
function ensureAttached(): boolean {
  const scrollerInner = document.querySelector(SCROLLER_SELECTOR);
  const listEl = document.querySelector(NOTES_LIST_SELECTOR) as Element | null;

  if (!scrollerInner || !listEl) {
    return false; // блок «История» ещё не отрендерился (асинхронно) — тик опрашивает дальше
  }

  runtime.listEl = listEl;
  ensureToggleButton(scrollerInner, listEl, handleToggle);

  const needsReprocess = !runtime.observer || runtime.observer.target !== listEl;
  if (needsReprocess) {
    attachObserver(listEl);
    processAndPaint(); // первый проход / проход после замены list-узла (§2.2: разделители регенерируются)
  }

  return true;
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
}

// Явный shutdown lifecycle (подэтап F-2): остановка interval/observer/teardown + полный сброс
// состояния (включая resolve-кэш на время жизни маунта, §5.2). Идемпотентен: повторные вызовы —
// no-op; после destroy() mountTimelineFilter() делает «свежий» re-mount. Из src/index.js не
// вызывается (ограничение минимальной правки проводки) — seam для тестов/обёрток установки.
export function destroyTimelineFilter(): void {
  stopTick();
  teardownRuntime(); // observer + unhideAll(старый список) + кнопка + сброс полей runtime
  clearStfResolveCache();

  runtime.phase = 'idle';
  runtime.leadId = null;
  delete document.documentElement.dataset.stfTimelineFilter; // маркер — re-mount стартует с нуля
}

// --- Публичные seams и экспорты модуля (подэтапы D/E) ---
export { loadTimelineFilterSettings, saveTimelineFilterSettings } from './settingsProvider';
export { loadTargetUsers } from './targetUsersProvider';
export { classify, collectAuthors, isSystem, isPinned, toIntOrNull } from './classifier';
export type { STFVerdict } from './classifier';
export { hideNode, showNode, processWrappers, processSeparators, unhideAll, processList } from './hider';
export type { IStfProcessResult } from './hider';
export { ensureToggleButton, updateToggleButton, STF_TOGGLE_BTN_ID } from './button';
export type { STFViewMode } from './button';
export { createListObserver, STF_DEBOUNCE_MS } from './observer';
export type { IStfListObserver } from './observer';
export { resolveTargets, getCurrentLeadId, clearStfResolveCache } from './resolver';
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
