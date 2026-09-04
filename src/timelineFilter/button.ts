// Кнопка «Показать все события / Скрыть нерелевантные» (план §5.4, структура §2.2):
// инъекция в .notes-wrapper__scroller-inner ПЕРЕД .js-notes, идемпотентно по id="stf-toggle-btn".

export const STF_TOGGLE_BTN_ID = 'stf-toggle-btn';

export type STFViewMode = 'filtered' | 'allShown';

const BUTTON_STYLE = [
  'display: block',
  'margin: 8px auto',
  'padding: 6px 14px',
  'max-width: calc(100% - 32px)',
  'cursor: pointer',
  'font-size: 13px',
  'line-height: 1.4',
  'color: #1f2d3d',
  'background-color: #f5f7fa',
  'border: 1px solid #cfd6dd',
  'border-radius: 4px',
].join(';');

const wiredButtons = new WeakSet<HTMLElement>();

function createButton(): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = STF_TOGGLE_BTN_ID;
  button.dataset.stfState = 'filtered';
  button.style.cssText = BUTTON_STYLE;
  const label = document.createElement('span');
  label.textContent = 'Показать все события (0)';
  button.appendChild(label);
  return button;
}

// Идемпотентная инъекция: существующая кнопка переезжает в актуальный scroller-inner
// (amo может пересобрать блок без render()), новая создаётся один раз и получает клик-хендлер.
export function ensureToggleButton(
  scrollerInner: Element | null,
  notesList: Element | null,
  onToggle: () => void,
): HTMLElement | null {
  if (!scrollerInner) {
    return null;
  }

  let button = document.getElementById(STF_TOGGLE_BTN_ID) as HTMLElement | null;
  if (!button || !button.dataset.stfState) {
    // Чужой элемент с тем же id (крайне маловероятно) — не трогаем, создаём свою рядом
    button = createButton();
    scrollerInner.insertBefore(button, notesList && notesList.parentElement === scrollerInner ? notesList : null);
  } else if (button.parentElement !== scrollerInner) {
    const anchor = notesList && notesList.parentElement === scrollerInner ? notesList : null;
    scrollerInner.insertBefore(button, anchor);
  }

  if (!wiredButtons.has(button)) {
    button.addEventListener('click', () => onToggle());
    wiredButtons.add(button);
  }

  return button;
}

// Состояния (§5.4): filtered («Показать все события» + счётчик скрытых) ↔ allShown («Скрыть нерелевантные»)
export function updateToggleButton(
  button: HTMLElement | null,
  mode: STFViewMode,
  hiddenCount: number,
): void {
  if (!button) {
    return;
  }
  button.dataset.stfState = mode;
  const label = (button.querySelector('span') as HTMLElement | null) ?? button;
  label.textContent = mode === 'filtered'
    ? `Показать все события (${hiddenCount})`
    : 'Скрыть нерелевантные';
}
