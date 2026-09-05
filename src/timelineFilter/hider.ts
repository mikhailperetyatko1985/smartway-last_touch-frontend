import { IFunnelFilterSettings } from 'interfaces/ITimelineFilterSettings';
import { classify, STFVerdict } from './classifier';

// Механизм скрытия (план §5.4): display:none !important + dataset-метка на ноде.
// Не удаляем из DOM и не трогаем классы amo — dataset «stfHidden» наш единственный след.
// Скрытие wrapper'ов переживает пересборку списка (ноды те же объекты, research §3).

export const STF_HIDDEN_FLAG = '1';

const WRAPPER_CLASS = 'feed-note-wrapper';
const SEPARATOR_CLASS = 'note-time-label__wrapper';

// Прямые дети .js-notes — div'ы (research §1: «Все 346 детей — div»), поэтому HTMLElement на рантайме
// гарантирован; сигнатуры публичных функций принимают Element (DOM API), каст один раз здесь.
function stfDataset(node: Element): DOMStringMap {
  return (node as HTMLElement).dataset;
}

function stfStyle(node: Element): CSSStyleDeclaration {
  return (node as HTMLElement).style;
}

export function isEventWrapper(el: Element): boolean {
  return el.classList.contains(WRAPPER_CLASS);
}

export function isSeparator(el: Element): boolean {
  return el.classList.contains(SEPARATOR_CLASS);
}

// Идемпотентно: повторный hide уже скрытой ноды — no-op.
// setProperty заменяет исходный inline display amo (block/flex) нашим правилом, поэтому
// предыдущее значение сохраняем в dataset.stfPrevDisplay и восстанавливаем при show —
// иначе у показанного события потерялся бы layout amo (например display:flex у звонков).
export function hideNode(node: Element): void {
  const dataset = stfDataset(node);
  if (dataset.stfHidden === STF_HIDDEN_FLAG) {
    return;
  }
  const style = stfStyle(node);
  dataset.stfPrevDisplay = style.display ?? '';
  style.setProperty('display', 'none', 'important');
  dataset.stfHidden = STF_HIDDEN_FLAG;
}

// Идемпотентно и безопасно: снимаем ТОЛЬКО своё правило по нашей метке — чужие inline-стили
// amo (placeholder-height у pinned, display:flex у звонков) не трогаем.
export function showNode(node: Element): void {
  const dataset = stfDataset(node);
  if (dataset.stfHidden !== STF_HIDDEN_FLAG) {
    return;
  }
  const style = stfStyle(node);
  const prevDisplay = dataset.stfPrevDisplay;
  delete dataset.stfPrevDisplay;
  if (prevDisplay) {
    style.setProperty('display', prevDisplay);
  } else {
    style.removeProperty('display');
  }
  delete dataset.stfHidden;
}

// Полный проход по прямым детям-событиям (R5: часть узлов без data-id → событийно-ориентированная
// логика не годится). Возвращает число скрытых wrapper'ов.
export function processWrappers(
  listEl: Element,
  cfg: IFunnelFilterSettings,
  targetIds: Set<number>,
): number {
  let hiddenCount = 0;
  const children = listEl.children;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!isEventWrapper(child)) {
      continue; // разделители/прочее — второй проход, чужое не трогаем
    }
    const verdict: STFVerdict = classify(child, cfg, targetIds);
    if (verdict === 'hide') {
      hideNode(child);
      hiddenCount++;
    } else {
      showNode(child);
    }
  }

  return hiddenCount;
}

// ВТОРОЙ ПРОХОД по разделителям — ВСЕГДА с нуля (research §3: ноды разделителей регенерируются
// при каждой пересборке, состояние на них НЕ сохраняется). Алгоритм research §6 «снизу вверх»:
// разделитель видим, если между ним и СЛЕДУЮЩИМ разделителем ниже есть хотя бы один видимый wrapper.
export function processSeparators(listEl: Element): void {
  const children = Array.from(listEl.children);
  let sectionHasVisibleWrapper = false;

  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i];

    if (isSeparator(child)) {
      if (sectionHasVisibleWrapper) {
        showNode(child);
      } else {
        hideNode(child);
      }
      // Разделитель — граница секции: для разделителей выше считаются только их собственные wrapper'ы
      sectionHasVisibleWrapper = false;
    } else if (isEventWrapper(child)) {
      if (stfDataset(child).stfHidden !== STF_HIDDEN_FLAG) {
        sectionHasVisibleWrapper = true;
      }
    }
  }
}

// «Показать все события»: снять ВСЕ наши скрытия — wrapper'ы и разделители (§5.4)
export function unhideAll(listEl: Element): void {
  const children = listEl.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (isEventWrapper(child) || isSeparator(child)) {
      showNode(child);
    }
  }
}

export interface IStfProcessResult {
  // filtered — реально скрыто; allShown — сколько СКРОЕТСЯ при повторном применении фильтра
  // (dry-run classify без изменений DOM) — счётчик кнопки «Скрыть (N)» (§5.4).
  hiddenCount: number;
  totalWrappers: number;
  mode: 'filtered' | 'allShown';
}

// processList (план §5.5): полный проход по list.children → classify+apply, затем pass по разделителям.
// В allShown — снятие скрытий + пересчёт «перспективного» счётчика без новых скрытий (§5.4). Идемпотентно.
export function processList(
  listEl: Element,
  cfg: IFunnelFilterSettings,
  targetIds: Set<number>,
  mode: 'filtered' | 'allShown',
): IStfProcessResult {
  const children = listEl.children;

  if (mode === 'allShown') {
    unhideAll(listEl);
    let totalWrappers = 0;
    let prospectiveHiddenCount = 0;
    for (let i = 0; i < children.length; i++) {
      if (!isEventWrapper(children[i])) {
        continue;
      }
      totalWrappers++;
      if (classify(children[i], cfg, targetIds) === 'hide') {
        prospectiveHiddenCount++; // «Скрыть (N)»: сколько уйдёт в скрытие при возврате в filtered
      }
    }
    return { hiddenCount: prospectiveHiddenCount, totalWrappers, mode };
  }

  const hiddenCount = processWrappers(listEl, cfg, targetIds);
  let totalWrappers = 0;
  for (let i = 0; i < children.length; i++) {
    if (isEventWrapper(children[i])) {
      totalWrappers++;
    }
  }

  processSeparators(listEl);

  return { hiddenCount, totalWrappers, mode };
}
