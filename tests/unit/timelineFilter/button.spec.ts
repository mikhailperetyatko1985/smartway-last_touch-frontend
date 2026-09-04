import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureToggleButton, updateToggleButton, STF_TOGGLE_BTN_ID } from '../../../src/timelineFilter/button';

// Кнопка (§5.4): инъекция в .notes-wrapper__scroller-inner перед .js-notes, идемпотентно по id,
// состояния filtered ↔ allShown, счётчик скрытых в тексте.

function buildScroller(): { scroller: HTMLElement; notesList: HTMLElement } {
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

describe('button: идемпотентная инъекция', () => {
  it('создаётся в .notes-wrapper__scroller-inner ПЕРЕД .js-notes; повторный вызов — та же нода', () => {
    const { scroller, notesList } = buildScroller();
    const onToggle = vi.fn();

    const first = ensureToggleButton(scroller, notesList, onToggle);
    expect(first).not.toBeNull();
    expect(first!.id).toBe(STF_TOGGLE_BTN_ID);
    expect(first!.parentElement).toBe(scroller);
    // Перед .js-notes (load-more над списком остаётся выше кнопки — структура §2.2)
    expect(first!.nextElementSibling).toBe(notesList);

    const second = ensureToggleButton(scroller, notesList, onToggle);
    expect(second).toBe(first);
    expect(document.querySelectorAll(`#${STF_TOGGLE_BTN_ID}`).length).toBe(1);
  });

  it('amo пересобрал блок (старое поддерево с кнопкой уничтожено): новая кнопка ставится перед новым .js-notes', () => {
    const old = buildScroller();
    ensureToggleButton(old.scroller, old.notesList, vi.fn())!;

    // Пересборка без render(): amo заменяет контент деталки — старый scroller с кнопкой уходит из DOM
    old.scroller.remove();
    expect(document.getElementById(STF_TOGGLE_BTN_ID)).toBeNull();

    const fresh = buildScroller();
    const created = ensureToggleButton(fresh.scroller, fresh.notesList, vi.fn())!;

    expect(created.id).toBe(STF_TOGGLE_BTN_ID);
    expect(created.parentElement).toBe(fresh.scroller);
    expect(created.nextElementSibling).toBe(fresh.notesList); // снова перед .js-notes
    // Состояние после пересборки восстанавливает runtime процессом (processAndPaint → updateToggleButton):
    updateToggleButton(created, 'allShown', 0);
    expect(created.dataset.stfState).toBe('allShown');

    // Повторный ensure на том же блоке — идемпотентен
    expect(ensureToggleButton(fresh.scroller, fresh.notesList, vi.fn())).toBe(created);
  });

  it('кнопка выжила в другом scroller (частичная пересборка): переезжает перед новым .js-notes с сохранением состояния', () => {
    const old = buildScroller();
    const button = ensureToggleButton(old.scroller, old.notesList, vi.fn())!;
    updateToggleButton(button, 'allShown', 7);

    // Частичная пересборка: старый scroller вырван из DOM, но сама кнопка осталась жива (amo переиспользует ноды)
    const fresh = buildScroller();
    old.scroller.remove();
    document.body.appendChild(button); // «выживший» элемент вне актуального дерева

    const moved = ensureToggleButton(fresh.scroller, fresh.notesList, vi.fn())!;

    expect(moved).toBe(button); // та же нода — состояние сохранено
    expect(moved.parentElement).toBe(fresh.scroller);
    expect(moved.nextElementSibling).toBe(fresh.notesList);
    expect(moved.dataset.stfState).toBe('allShown');
  });

  it('клик вызывает onToggle ровно один раз (двойная проводка исключена)', () => {
    const { scroller, notesList } = buildScroller();
    const onToggle = vi.fn();

    ensureToggleButton(scroller, notesList, onToggle);
    ensureToggleButton(scroller, notesList, onToggle); // повторный ensure — не дублирует хендлер

    const button = document.getElementById(STF_TOGGLE_BTN_ID)!;
    button.click();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('button: состояния и счётчик скрытых', () => {
  it('filtered → «Показать все события (N)», allShown → «Скрыть нерелевантные»', () => {
    const { scroller, notesList } = buildScroller();
    const button = ensureToggleButton(scroller, notesList, vi.fn())!;

    updateToggleButton(button, 'filtered', 0);
    expect(button.dataset.stfState).toBe('filtered');
    expect(button.textContent).toBe('Показать все события (0)');

    updateToggleButton(button, 'filtered', 329);
    expect(button.textContent).toBe('Показать все события (329)');

    updateToggleButton(button, 'allShown', 0);
    expect(button.dataset.stfState).toBe('allShown');
    expect(button.textContent).toBe('Скрыть нерелевантные');
  });

  it('updateToggleButton(null) — no-op (кнопка ещё не создана)', () => {
    expect(() => updateToggleButton(null, 'filtered', 3)).not.toThrow();
  });
});
