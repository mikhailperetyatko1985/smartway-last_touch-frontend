import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ensureToggleButton,
  updateToggleButton,
  resolveToggleButtonHost,
  STF_TOGGLE_BTN_ID,
} from '../../../src/timelineFilter/button';

// Кнопка (§5.4) в СТРОКЕ ТУЛБАРА истории amoCRM: fallback-цепочка якорей
// tab-bar (#history_settings, ряд табов) → toolbar-row (.feed-compose) → legacy-scroller (scroller-inner),
// идемпотентность по id, состояния filtered («Показать скрытые (N)») ↔ allShown («Скрыть (N)»).

// Живая разметка деталки сделки: .notes-wrapper > .feed-compose(ряд тулбара) > #history_settings(табы).
// withF5Button — сторонняя кнопка F5-виджета «ссылки на чаты» в том же ряду (есть не на всех аккаунтах):
// при её наличии зазор между табами и ней меньше ширины пилюли → позиция row-corner.
function buildToolbar(withF5Button = false): { notesWrapper: HTMLElement; compose: HTMLElement; settings: HTMLElement; tipHolder: HTMLElement } {
  const notesWrapper = document.createElement('div');
  notesWrapper.className = 'notes-wrapper';
  const scroller = document.createElement('div');
  scroller.className = 'notes-wrapper__scroller custom-scroll';
  const compose = document.createElement('div');
  compose.className = 'feed-compose minimized';
  const settings = document.createElement('div');
  settings.id = 'history_settings';
  const ul = document.createElement('ul');
  ['все', 'задачи', 'примечания', 'письма', 'звонки', 'чаты'].forEach((text, i) => {
    const li = document.createElement('li');
    li.className = i === 0 ? 'itm-all act' : 'itm';
    li.textContent = text;
    ul.appendChild(li);
  });
  settings.appendChild(ul);
  const tipHolder = document.createElement('div');
  tipHolder.className = 'js-tip-holder';
  compose.appendChild(settings);
  compose.appendChild(tipHolder);
  if (withF5Button) {
    const f5 = document.createElement('div');
    f5.id = 'f5_custom_export_button_hider_btn';
    f5.className = 'active';
    f5.textContent = 'ссылки на чаты';
    compose.appendChild(f5);
  }
  notesWrapper.appendChild(scroller);
  notesWrapper.appendChild(compose);
  document.body.appendChild(notesWrapper);
  return { notesWrapper, compose, settings, tipHolder };
}

// Старая разметка (legacy): кнопка в скролл-контенте перед .js-notes
function buildLegacyScroller(): { scroller: HTMLElement; notesList: HTMLElement } {
  const scroller = document.createElement('div');
  scroller.className = 'notes-wrapper__scroller-inner';
  const loadMore = document.createElement('div');
  loadMore.className = 'notes-wrapper__load-more';
  const notesList = document.createElement('div');
  notesList.className = 'notes-wrapper__notes js-notes';
  scroller.appendChild(loadMore);
  scroller.appendChild(notesList);
  document.body.appendChild(scroller);
  return { scroller, notesList };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('resolveToggleButtonHost: fallback-цепочка якорей', () => {
  it('есть #history_settings, рядом нет сторонних кнопок → tab-bar (контейнер — сам таб-бар)', () => {
    const { settings } = buildToolbar();

    const host = resolveToggleButtonHost();

    expect(host).not.toBeNull();
    expect(host!.kind).toBe('tab-bar');
    // containing block = #history_settings: left:calc(100% + 6px) = правее табов, а не правее всего ряда
    expect(host!.container).toBe(settings);
    expect(host!.refBefore).toBeNull();
  });

  it('есть #history_settings и в ряду стоит «ссылки на чаты» → row-corner (box .feed-compose, зазор < ширины пилюли)', () => {
    const { compose } = buildToolbar(true);

    const host = resolveToggleButtonHost();

    expect(host).not.toBeNull();
    expect(host!.kind).toBe('row-corner');
    expect(host!.container).toBe(compose); // правый нижний угол box ряда — свободная зона справа от блока ввода
    expect(host!.refBefore).toBeNull();
  });

  it('табов нет, но есть .feed-compose → toolbar-row (append в конец ряда)', () => {
    const { compose } = buildToolbar();
    document.getElementById('history_settings')!.remove();

    const host = resolveToggleButtonHost();

    expect(host).not.toBeNull();
    expect(host!.kind).toBe('toolbar-row');
    expect(host!.container).toBe(compose);
    expect(host!.refBefore).toBeNull();
  });

  it('ряда тулбара нет, есть scroller-inner → legacy-scroller (перед .js-notes)', () => {
    const { scroller, notesList } = buildLegacyScroller();

    const host = resolveToggleButtonHost();

    expect(host).not.toBeNull();
    expect(host!.kind).toBe('legacy-scroller');
    expect(host!.container).toBe(scroller);
    expect(host!.refBefore).toBe(notesList); // перед списком, как раньше
  });

  it('legacy без .js-notes (список ещё не отрендерился) → refBefore null (append)', () => {
    const { scroller } = buildLegacyScroller();
    document.querySelector('.notes-wrapper__notes.js-notes')!.remove();

    const host = resolveToggleButtonHost()!;

    expect(host.kind).toBe('legacy-scroller');
    expect(host.refBefore).toBeNull();
  });

  it('якорей нет → null (кнопка не вставляется, диагностика — в index.ts)', () => {
    document.body.innerHTML = '<div class="unrelated"></div>';
    expect(resolveToggleButtonHost()).toBeNull();
  });
});

describe('ensureToggleButton: идемпотентная инъекция в хост', () => {
  it('создаётся внутри #history_settings (правее табов); повторный вызов — та же нода, один экземпляр', () => {
    buildToolbar();
    const onToggle = vi.fn();
    const host = resolveToggleButtonHost()!;

    const first = ensureToggleButton(host, onToggle);
    expect(first).not.toBeNull();
    expect(document.getElementById(STF_TOGGLE_BTN_ID)).toBe(first);
    const settings = document.getElementById('history_settings')!;
    expect(first!.parentElement).toBe(settings); // containing block — сам таб-бар (position:absolute)
    expect(first!.previousElementSibling).toBe(settings.firstElementChild); // после <ul> с табами
    // Стиль под tab-bar: абсолютное позиционирование правее табов
    expect(first!.style.cssText).toContain('left: calc(100% + 6px)');

    expect(ensureToggleButton(resolveToggleButtonHost()!, onToggle)).toBe(first);
    expect(document.querySelectorAll(`#${STF_TOGGLE_BTN_ID}`).length).toBe(1);
  });

  it('amo пересобрал ряд (старый контейнер уничтожен): кнопка создаётся заново в новом таб-баре', () => {
    buildToolbar();
    const firstHost = resolveToggleButtonHost()!;
    ensureToggleButton(firstHost, vi.fn())!;
    expect(document.getElementById(STF_TOGGLE_BTN_ID)).not.toBeNull();

    // Пересборка деталки: .notes-wrapper заменяется целиком — старый хост и кнопка уходят из DOM
    document.body.innerHTML = '';
    buildToolbar();

    const created = ensureToggleButton(resolveToggleButtonHost()!, vi.fn())!;
    expect(created.id).toBe(STF_TOGGLE_BTN_ID);
    expect(created.parentElement).toBe(document.querySelector('.notes-wrapper #history_settings'));
  });

  it('amo пересобрал ряд, но кнопка выжила (переиспользование нод): переезжает в новый контейнер с сохранением состояния', () => {
    buildToolbar();
    const onToggle = vi.fn();
    ensureToggleButton(resolveToggleButtonHost()!, onToggle)!;
    updateToggleButton(document.getElementById(STF_TOGGLE_BTN_ID)!, 'allShown', 7);

    // Частичная пересборка: старый compose вырван из DOM, но amo держит кнопку жива (переиспользует ноды) —
    // в DOM она возвращается как «сирота», getElementById её находит
    const button = document.getElementById(STF_TOGGLE_BTN_ID)!;
    document.querySelector('.notes-wrapper')!.remove();
    document.body.appendChild(button);
    buildToolbar();

    const moved = ensureToggleButton(resolveToggleButtonHost()!, onToggle)!;

    expect(moved).toBe(button); // та же нода — состояние сохранено
    expect(moved.parentElement).toBe(document.querySelector('.notes-wrapper #history_settings'));
    expect(moved.dataset.stfState).toBe('allShown');
  });

  it('появилась сторонняя «ссылки на чаты» после инъекции: переезд tab-bar → row-corner с сохранением состояния', () => {
    const { compose } = buildToolbar();
    const onToggle = vi.fn();
    ensureToggleButton(resolveToggleButtonHost()!, onToggle)!;
    let button = document.getElementById(STF_TOGGLE_BTN_ID)!;
    expect(button.parentElement).toBe(document.getElementById('history_settings'));
    updateToggleButton(button, 'filtered', 42);

    // F5-виджет доотрисовал свою кнопку в ряд (живой сценарий: она появляется после табов)
    const f5 = document.createElement('div');
    f5.id = 'f5_custom_export_button_hider_btn';
    compose.appendChild(f5);

    button = ensureToggleButton(resolveToggleButtonHost()!, onToggle)!;
    expect(button.parentElement).toBe(compose); // row-corner: box ряда, правый нижний угол под рядом
    expect(button.dataset.stfHostKind).toBe('row-corner');
    expect(button.dataset.stfState).toBe('filtered'); // состояние переживает переезд
    expect(button.textContent).toBe('Показать скрытые (42)');

    button.click();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('смена вида хоста (legacy → tab-bar): кнопка переезжает, стиль пересобирается под новый ряд', () => {
    const onToggle = vi.fn();
    buildLegacyScroller();
    ensureToggleButton(resolveToggleButtonHost()!, onToggle)!;
    let button = document.getElementById(STF_TOGGLE_BTN_ID)!;
    expect(button.dataset.stfHostKind).toBe('legacy-scroller');

    // amo дорендерил таб-бар (или другой аккаунт): хост сменился по цепочке
    const notesWrapper = document.createElement('div');
    notesWrapper.className = 'notes-wrapper';
    const compose = document.createElement('div');
    compose.className = 'feed-compose minimized';
    const settings = document.createElement('div');
    settings.id = 'history_settings';
    compose.appendChild(settings);
    notesWrapper.appendChild(compose);
    document.body.appendChild(notesWrapper);

    button = ensureToggleButton(resolveToggleButtonHost()!, onToggle)!;
    expect(button).toBe(document.getElementById(STF_TOGGLE_BTN_ID));
    expect(button.parentElement).toBe(settings); // tab-bar: контейнер — сам таб-бар, а не ряд
    expect(button.dataset.stfHostKind).toBe('tab-bar');
  });

  it('клик вызывает onToggle ровно один раз (двойная проводка исключена)', () => {
    buildToolbar();
    const onToggle = vi.fn();
    ensureToggleButton(resolveToggleButtonHost()!, onToggle);
    ensureToggleButton(resolveToggleButtonHost()!, onToggle); // повторный ensure — не дублирует хендлер

    document.getElementById(STF_TOGGLE_BTN_ID)!.click();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('host=null → null, кнопка не создаётся', () => {
    expect(ensureToggleButton(null, vi.fn())).toBeNull();
    expect(document.getElementById(STF_TOGGLE_BTN_ID)).toBeNull();
  });
});

describe('button: состояния и счётчик скрытых', () => {
  it('filtered → «Показать скрытые (N)», allShown → «Скрыть (N)» (сколько скроется при возврате)', () => {
    buildToolbar();
    ensureToggleButton(resolveToggleButtonHost()!, vi.fn());
    const button = document.getElementById(STF_TOGGLE_BTN_ID)!;

    updateToggleButton(button, 'filtered', 0);
    expect(button.dataset.stfState).toBe('filtered');
    expect(button.textContent).toBe('Показать скрытые (0)');

    updateToggleButton(button, 'filtered', 329);
    expect(button.textContent).toBe('Показать скрытые (329)');

    // allShown: N = перспективный счётчик (processList в allShown считает dry-run'ом classify)
    updateToggleButton(button, 'allShown', 176);
    expect(button.dataset.stfState).toBe('allShown');
    expect(button.textContent).toBe('Скрыть (176)');

    // Возврат в filtered — счётчик реально скрытых снова в тексте
    updateToggleButton(button, 'filtered', 176);
    expect(button.textContent).toBe('Показать скрытые (176)');
  });

  it('updateToggleButton(null) — no-op (кнопка ещё не создана)', () => {
    expect(() => updateToggleButton(null, 'filtered', 3)).not.toThrow();
  });

  it('стартовый лейбл до первого processAndPaint — «Показать скрытые (0)»', () => {
    buildToolbar();
    const button = ensureToggleButton(resolveToggleButtonHost()!, vi.fn())!;
    expect(button.textContent).toBe('Показать скрытые (0)');
  });
});
