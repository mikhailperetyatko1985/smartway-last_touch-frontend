// Кнопка «Показать скрытые (N) / Скрыть (N)» (план §5.4): инъекция в СТРОКУ ТУЛБАРА истории amoCRM —
// тот же ряд, где табы фильтра и сторонние кнопки тулбара. Живая разметка деталки сделки (amoCRM, 2026-09,
// проверено read-only через devtools на деталке 42661594):
//   .notes-wrapper(overflow:hidden) > .feed-compose(position:absolute — строка внизу блока, flex nowrap;
//     видимый ряд кнопок формируется отрицательными смещениями детей и ВЫХОДИТ НАД box ряда)
//     ├─ #history_settings(position:absolute; top:-26px — видимый ряд табов: ul > li.itm «все/задачи/…»)
//     ├─ .feed-compose__inner(блок ввода «Примечание:», занимает левую часть box)
//     └─ сторонние кнопки в ряду (напр. #f5_custom_export_button_hider_btn «ссылки на чаты», z-index 1000,
//        правый край ряда — между табами и ним зазор 43–160px в зависимости от ширины окна: полного места НЕТ)
// Позиции (без ломки flex-потока ряда — всё абсолютно):
//   tab-bar    — внутри #history_settings, left:calc(100% + 6px); top:3px — сразу правее табов, вровень с li;
//                containing block = сам #history_settings (position:absolute), поэтому 100% = ширина таб-бара.
//   row-corner — тот же случай НО когда ряд уже занят кнопкой «ссылки на чаты» (зазор < ширины кнопки):
//                компактная пилюля в свободной зоне box .feed-compose — правый нижний угол под рядом
//                (top:16px; right:12px — справа от блока ввода, ниже сторонних кнопок ряда);
//   toolbar-row — таб-бара нет вовсе: правый край того же видимого ряда (top:-26px = уровень таб-ряда);
//   legacy-scroller — и ряда нет: старый хост в скролл-контенте перед .js-notes (деградация, не тишина).

export const STF_TOGGLE_BTN_ID = 'stf-toggle-btn';

export type STFViewMode = 'filtered' | 'allShown';

export type STFButtonHostKind = 'tab-bar' | 'row-corner' | 'toolbar-row' | 'legacy-scroller';

// Якоря (живая разметка amoCRM):
const TAB_BAR_SELECTOR = '.notes-wrapper #history_settings'; // контейнер таб-бара — первичный якорь
const TOOLBAR_ROW_SELECTOR = '.notes-wrapper .feed-compose'; // сам ряд тулбара — fallback 1
const LEGACY_SCROLLER_SELECTOR = '.notes-wrapper__scroller-inner'; // старый хост (скролл-контент) — fallback 2
const NOTES_LIST_SELECTOR = '.notes-wrapper__notes.js-notes';

// Сторонняя кнопка F5-виджета «ссылки на чаты» в том же ряду: её наличие переключает позицию tab-bar → row-corner
// (детерминированно по наличию в DOM, без геометрии — jsdom-тестируемо). Если виджет изменит id — кнопка
// останется в tab-bar (возможное перекрытие) — заметим по диагностике вида хоста в консоли.
const F5_CHAT_LINKS_BTN_ID = 'f5_custom_export_button_hider_btn';

export interface IStfButtonHost {
  kind: STFButtonHostKind;
  container: Element; // родитель, в который вставляется кнопка (и containing block для position:absolute)
  refBefore: Element | null; // референс insertBefore (null — appendChild)
}

// Разрешение хоста кнопки по fallback-цепочке. Чистая DOM-функция без console (диагностика — в index.ts):
//   1. #history_settings найден → tab-bar (внутри таб-бара, правее табов); если рядом уже стоит кнопка
//      «ссылки на чаты» и места на всю пилюлю нет → row-corner (правый нижний угол box ряда под рядом);
//   2. иначе .feed-compose есть → toolbar-row (или row-corner при той же сторонней кнопке);
//   3. иначе старый хост: scroller-inner перед .js-notes.
export function resolveToggleButtonHost(): IStfButtonHost | null {
  const tabBar = document.querySelector(TAB_BAR_SELECTOR);
  if (tabBar && tabBar.parentElement) {
    // containing block кнопки — сам #history_settings (position:absolute): left:calc(100% + 6px) = правее табов.
    // Если в ряду уже есть «ссылки на чаты» — зазор между табами и ней меньше ширины пилюли (43–160px против
    // ~120–155px) → переносим в свободный правый нижний угол box .feed-compose.
    if (document.getElementById(F5_CHAT_LINKS_BTN_ID)) {
      return { kind: 'row-corner', container: tabBar.parentElement, refBefore: null };
    }
    return { kind: 'tab-bar', container: tabBar, refBefore: null };
  }

  const row = document.querySelector(TOOLBAR_ROW_SELECTOR);
  if (row) {
    if (document.getElementById(F5_CHAT_LINKS_BTN_ID)) {
      return { kind: 'row-corner', container: row, refBefore: null };
    }
    return { kind: 'toolbar-row', container: row, refBefore: null };
  }

  const scrollerInner = document.querySelector(LEGACY_SCROLLER_SELECTOR);
  if (scrollerInner) {
    const notesList = document.querySelector(NOTES_LIST_SELECTOR);
    const refBefore = notesList && notesList.parentElement === scrollerInner ? notesList : null;
    return { kind: 'legacy-scroller', container: scrollerInner, refBefore };
  }

  return null; // якорей нет — блок истории ещё не отрендерился / разметка неизвестна (диагностика в index.ts)
}

// Общая «пилюля» вторичной кнопки ряда amoCRM (#d5d8db — цвет кнопок ряда, см. табы li.itm и «ссылки на чаты»).
const PILL_COMMON_STYLE = [
  'box-sizing: border-box',
  'display: inline-flex',
  'align-items: center',
  'flex: none',
  'cursor: pointer',
  'line-height: 1',
  'white-space: nowrap',
  'color: #363b44',
  'background-color: #d5d8db',
  'border: none',
  'border-radius: 5px',
  'font-family: inherit',
].join(';');

// Полный стиль по виду хоста (размер + позиционирование): при смене вида cssText пересобирается целиком.
const BUTTON_KIND_STYLE: Record<STFButtonHostKind, string> = {
  // Внутри #history_settings: правее таб-бара, вертикально вровень с li-табами (top:3px ≈ margin-top ul).
  'tab-bar': `${PILL_COMMON_STYLE};height: 22px; padding: 0 8px; font-size: 12px; position: absolute; left: calc(100% + 6px); top: 3px; z-index: 5;`,
  // Компактная (font 11 / padding 6 → ~120px под «Показать скрытые (N)»): влезает в свободную зону box ряда
  // справа от блока ввода «Примечание:» и ниже сторонних кнопок ряда, без перекрытий.
  'row-corner': `${PILL_COMMON_STYLE};height: 20px; padding: 0 6px; font-size: 11px; position: absolute; top: 16px; right: 12px; z-index: 5;`,
  // Табов нет, но ряд есть — правый край того же видимого ряда (top:-26px = уровень таб-ряда).
  'toolbar-row': `${PILL_COMMON_STYLE};height: 22px; padding: 0 8px; font-size: 12px; position: absolute; top: -26px; right: 10px; z-index: 5;`,
  // Legacy: скролл-контент над списком — центрированная строка (старое поведение как запасной вариант).
  'legacy-scroller': `display: flex; ${PILL_COMMON_STYLE};height: 22px; padding: 0 8px; font-size: 12px; position: relative; margin: 8px auto; width: max-content;`,
};

const wiredButtons = new WeakSet<HTMLElement>();

function createButton(): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = STF_TOGGLE_BTN_ID;
  button.dataset.stfState = 'filtered';
  const label = document.createElement('span');
  label.textContent = 'Показать скрытые (0)';
  button.appendChild(label);
  return button;
}

function applyButtonStyle(button: HTMLElement, kind: STFButtonHostKind): void {
  button.style.cssText = BUTTON_KIND_STYLE[kind];
}

// Идемпотентная инъекция в хост (по STF_TOGGLE_BTN_ID). Существующая наша кнопка переезжает при смене
// контейнера/вида хоста (amo пересобрал ряд / появилась сторонняя кнопка), состояние dataset.stfState
// и клик-хендлер сохраняются.
export function ensureToggleButton(
  host: IStfButtonHost | null,
  onToggle: () => void,
): HTMLElement | null {
  if (!host) {
    return null; // якорей нет — тик опрашивает дальше (диагностика в index.ts)
  }

  let button = document.getElementById(STF_TOGGLE_BTN_ID) as HTMLElement | null;
  if (!button || !button.dataset.stfState) {
    // Чужой элемент с тем же id (крайне маловероятно) — не трогаем, создаём свою в хосте
    const created = createButton();
    applyButtonStyle(created, host.kind);
    created.dataset.stfHostKind = host.kind;
    host.container.insertBefore(created, host.refBefore);
    button = created;
  } else if (button.parentElement !== host.container || button.dataset.stfHostKind !== host.kind) {
    // amo пересобрал ряд / хост сменился по цепочке — переезд с сохранением состояния и хендлера
    applyButtonStyle(button, host.kind);
    button.dataset.stfHostKind = host.kind;
    host.container.insertBefore(button, host.refBefore);
  }

  if (!wiredButtons.has(button)) {
    button.addEventListener('click', () => onToggle());
    wiredButtons.add(button);
  }

  return button;
}

// Состояния (§5.4): filtered — «Показать скрытые (N)» (N = скрыто сейчас),
// allShown — «Скрыть (N)» (N = сколько скроется при повторном применении фильтра).
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
    ? `Показать скрытые (${hiddenCount})`
    : `Скрыть (${hiddenCount})`;
}
