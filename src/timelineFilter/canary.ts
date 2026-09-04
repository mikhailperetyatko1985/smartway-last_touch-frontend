import { showNode, STF_HIDDEN_FLAG } from './hider';
import { STF_TOGGLE_BTN_ID } from './button';
import { stfStorageKey, readStfJson, writeStfJson } from './cache';

// Canary (план §7 Этап 5 / риск R1): чек-лист якорей на каждом проходе processList.
// Если amo переверстала блок и семантические якори исчезли — после N подряд провальных прогонов
// тихая деактивация: unhideAll, кнопка снята, observer/tick остановлены, phase='disabled'.
// Без UI и toast'ов (R9): diagnostic только в console.warn + ring-buffer localStorage.

export const STF_CANARY_CACHE_KEY = 'stf_canary_v1'; // per-account scope `key:<hostname>` — как остальные stf-кеши
export const STF_DIAGNOSTICS_KEY = 'stf_diagnostics_v1';

// N подряд провальных processList → деактивация (DoD Этапа 5)
export const STF_CANARY_FAIL_LIMIT = 5;

// Флаг disabled живёт 24 ч, затем «свежий старт» (TTL в записи): переверстка amo обычно
// временна (релиз/откат UI), постоянный kill был бы слишком жёстким — через сутки модуль
// сам пробует снова. Чистка при заходе в settings-модалку не нужна: открытие настроек не
// доказывает восстановление якорей, правило держим одним и простым (TTL).
export const STF_CANARY_TTL_MS = 24 * 60 * 60 * 1000;

const DIAGNOSTICS_CAP = 50; // ring-buffer: не больше ~50 диагностических записей

const SEPARATOR_CLASS = 'note-time-label__wrapper';
const WRAPPER_CLASS_PREFIX = 'feed-note-wrapper'; // `feed-note-wrapper*`: базовый + подтипы + `_grouped` (R16)

interface IStfCanaryRecord {
  failCount: number; // подряд провальные прогоны (персистентно переживает перезагрузку страницы)
  disabledAt?: number; // epoch ms — ставится при деактивации, отсчёт TTL
  reason?: string;
}

interface IStfDiagnosticEntry {
  t: number; // timestamp
  leadId: string | null;
  reason: string;
}

export type STFAnchorsStatus = 'ok' | 'no-list' | 'empty-list' | 'anchors-missing';

// Якорь-токен `feed-note-wrapper*` по границе classList: сам токен либо продолжение через `_`/`-`
// (подтипы `-note`, `-call_in_out`, суффикс `_grouped` у свёрнутых system-капсул, R16).
// Подобные токены вроде `feed-note-wrapperline` якорем НЕ считаются.
function isWrapperAnchorToken(name: string): boolean {
  if (name === WRAPPER_CLASS_PREFIX) {
    return true;
  }
  const rest = name.slice(WRAPPER_CLASS_PREFIX.length);
  return rest.startsWith('-') || rest.startsWith('_');
}

// Якорь (research §2.2/§7, R16): класс-якорь на ПРЯМОМ ребёнке списка — токен `feed-note-wrapper*`
// или `note-time-label__wrapper`. Идём по classList-токенам, не по строке className.
function hasAnchorClass(el: Element): boolean {
  const classes = el.classList;
  for (let i = 0; i < classes.length; i++) {
    const name = classes[i];
    if (name === SEPARATOR_CLASS || isWrapperAnchorToken(name)) {
      return true;
    }
  }
  return false;
}

// Чек-лист якорей на каждом processList. «Допускать отсутствие в моменте» (R16): нет списка
// / список пуст — НЕ провал (блок истории рендерится асинхронно, при пересборке дети могут
// быть временно удалены). «Якоря не найдены» только когда list существует, children > 0, но ни
// один класс-якорь не matches — т.е. amo переверстала markup (R1).
export function checkStfAnchors(listEl: Element | null): STFAnchorsStatus {
  if (!listEl || !listEl.isConnected) {
    return 'no-list'; // блок «История» ещё не отрендерился / узел заменён — нейтрально
  }

  const children = listEl.children;
  if (children.length === 0) {
    return 'empty-list'; // список заполняется/пересобирается в моменте — нейтрально
  }

  for (let i = 0; i < children.length; i++) {
    if (hasAnchorClass(children[i])) {
      return 'ok';
    }
  }

  return 'anchors-missing';
}

// --- Диагностика: ring-buffer в localStorage stf_diagnostics_v1 (cap ~50), без UI и toast'ов (R9) ---

export function pushStfDiagnostic(reason: string, leadId: string | null): void {
  const key = stfStorageKey(STF_DIAGNOSTICS_KEY);
  let entries = readStfJson<IStfDiagnosticEntry[]>(key);
  if (!Array.isArray(entries)) {
    entries = [];
  }
  entries.push({ t: Date.now(), leadId, reason });
  while (entries.length > DIAGNOSTICS_CAP) {
    entries.shift(); // отбрасываем старейшие — ring-buffer cap ~50
  }
  writeStfJson(key, entries);
}

// --- Счётчик провалов + флаг disabled (persist в stf_canary_v1, per-account scope) ---

function canaryStorageKey(): string {
  return stfStorageKey(STF_CANARY_CACHE_KEY);
}

function readCanaryRecord(): IStfCanaryRecord | null {
  const record = readStfJson<IStfCanaryRecord>(canaryStorageKey());
  if (!record || typeof record !== 'object') {
    return null;
  }
  return record;
}

function getFailCount(): number {
  const record = readCanaryRecord();
  if (!record || typeof record.failCount !== 'number' || Number.isNaN(record.failCount)) {
    return 0;
  }
  return Math.max(0, Math.trunc(record.failCount));
}

// Читается ПЕРЕД mount-работой (в т.ч. после перезагрузки страницы): disabled в пределах TTL →
// модуль молчит полностью (активация не стартует). После истечения TTL — «свежий старт»: запись
// удаляется, счётчик и флаг сгорают.
export function stfCanaryIsDisabled(now: number = Date.now()): boolean {
  const record = readCanaryRecord();
  if (!record || typeof record.disabledAt !== 'number') {
    return false;
  }
  if (now - record.disabledAt < STF_CANARY_TTL_MS) {
    return true; // флаг жив — тишина до истечения TTL
  }
  try {
    window.localStorage.removeItem(canaryStorageKey());
  } catch {
    // localStorage недоступен — свежий старт только в памяти (записи и так нет/недоступна)
  }
  return false; // TTL прошёл — запись удалена, модуль может стартовать заново
}

// Вызывается из index.ts после каждого прохода processList со статусом checkStfAnchors().
// Возвращает true ТОЛЬКО когда деактивация наступила в этом вызове (N-й подряд провал).
export function stfCanaryOnProcess(status: STFAnchorsStatus, leadId: string | null): boolean {
  if (status === 'ok') {
    // Нормальный успех обнуляет счётчик (персистентно) — «5 подряд» не накапливаются через успехи
    if (getFailCount() > 0) {
      writeStfJson(canaryStorageKey(), { failCount: 0 });
    }
    return false;
  }

  if (status === 'no-list' || status === 'empty-list') {
    return false; // «отсутствие в моменте» допустимо (R16) — счётчик не трогается
  }

  const failCount = getFailCount() + 1;
  if (failCount < STF_CANARY_FAIL_LIMIT) {
    writeStfJson(canaryStorageKey(), { failCount });
    return false;
  }

  // N подряд провальных processList → деактивация: persist флага, diagnostic (R9 — без UI)
  writeStfJson(canaryStorageKey(), {
    failCount,
    disabledAt: Date.now(),
    reason: 'anchors not found',
  });
  console.warn('[STF] disabled: anchors not found');
  pushStfDiagnostic('canary: anchors not found — widget disabled', leadId);
  return true;
}

// Действия деактивации (вызывает index.ts, когда stfCanaryOnProcess вернул true): восстановить
// всё скрытое, снять кнопку, остановить observer/tick. Состояние runtime и phase обнуляет вызывающий.
export interface IStfDeactivateContext {
  listEl: Element | null;
  disconnectObserver(): void;
  stopTick(): void;
}

export function stfCanaryDeactivate(ctx: IStfDeactivateContext): void {
  if (ctx.listEl && ctx.listEl.isConnected) {
    // Восстановление по НАШЕЙ метке, а не по классам amo: в моменте R1 классы-якоря как раз
    // отсутствуют (amo переверстала), dataset/inline на тех же нодах переживают пересборку.
    const children = ctx.listEl.children;
    for (let i = 0; i < children.length; i++) {
      if ((children[i] as HTMLElement).dataset.stfHidden === STF_HIDDEN_FLAG) {
        showNode(children[i]); // inline-правило amo (display:flex и т.п.) возвращается через stfPrevDisplay
      }
    }
  }

  const button = document.getElementById(STF_TOGGLE_BTN_ID);
  if (button && button.dataset.stfState) {
    button.remove(); // наша кнопка — снимаем (чужие элементы с тем же id не трогаем, как и при инъекции)
  }

  ctx.disconnectObserver();
  ctx.stopTick();
}
