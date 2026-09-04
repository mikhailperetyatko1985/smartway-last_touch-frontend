import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { processList, unhideAll, hideNode, showNode } from '../../../src/timelineFilter/hider';
import type { IStfProcessResult } from '../../../src/timelineFilter/hider';
import type { IFunnelFilterSettings } from '../../../src/interfaces/ITimelineFilterSettings';

// Механизм скрытия + разделители (план §5.4): идемпотентность, пересборка DOM,
// «второй проход ВСЕГДА с нуля» для регенерирующихся нода-разделителей (research §3).

const FIXTURES_DIR = path.resolve(process.cwd(), 'tests', 'fixtures', 'timeline');

const TARGET_B = new Set([10722265, 10136549, 12830901, 13159601]);
const CFG: IFunnelFilterSettings = {
  pipeline_id: 1,
  status_ids: [1],
  mode: 'base',
  custom_field_id: null,
  hide_system: true,
  hide_pinned_no_target: false,
  hide_no_author: true,
};

function fixtureFragment(name: string): Element {
  const html = fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
  document.body.innerHTML = html;
  const el = document.body.firstElementChild!;
  document.body.innerHTML = '';
  return el.cloneNode(true) as Element; // клон: нода фикстуры переиспользуется между тестами
}

function makeSeparator(point = 'Апрель'): Element {
  // Разделители регенерируются amo как НОВЫЕ узлы (research §3) — создаём «свежие»
  const sep = document.createElement('div');
  sep.className = 'note-time-label__wrapper js-notes-timeline-point';
  sep.dataset.point = point;
  const label = document.createElement('div');
  label.className = 'note-time-label';
  label.textContent = point;
  sep.appendChild(label);
  return sep;
}

function buildList(children: Element[]): HTMLElement {
  const list = document.createElement('div');
  list.className = 'notes-wrapper__notes js-notes';
  children.forEach((child) => list.appendChild(child));
  document.body.appendChild(list);
  return list;
}

const isHiddenByStf = (el: Element): boolean => el.dataset.stfHidden === '1' && el.style.display === 'none' && el.style.getPropertyPriority('display') === 'important';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('hider: hide/show идемпотентны и не трогаем стили amo', () => {
  it('hideNode: display:none !important + dataset.stfHidden=1; повторный hide — no-op', () => {
    const node = fixtureFragment('note_with_author.html');
    document.body.appendChild(node);

    hideNode(node);
    expect(isHiddenByStf(node)).toBe(true);
    // Исходный inline-стиль amo (display: block) заменён нашим правилом, но height/прочее не тронуто
    expect(node.style.height).toBe('');

    const before = node.outerHTML;
    hideNode(node);
    expect(node.outerHTML).toBe(before); // идемпотентность — ноль изменений DOM
  });

  it('showNode: снимает ТОЛЬКО своё правило по метке (amo-стили не трогаем)', () => {
    const node = fixtureFragment('pinned_note.html'); // style="display: block; height: 206px;" у amo
    document.body.appendChild(node);

    expect(node.style.height).toBe('206px');
    hideNode(node);
    showNode(node);
    expect(node.dataset.stfHidden).toBeUndefined();
    expect(node.style.display).toBe('block'); // исходный inline display amo восстановлен
    expect(node.style.height).toBe('206px'); // placeholder-height (R14) не тронут

    // show без нашей метки — no-op даже для чужой ноды с amo-стилями
    const clean = fixtureFragment('call_in_out_with_author.html');
    document.body.appendChild(clean);
    const before = clean.outerHTML;
    showNode(clean);
    expect(clean.outerHTML).toBe(before);
  });
});

describe('hider: processList — полный проход, разделители, идемпотентность', () => {
  it('сценарий README #6: [separator, hidden-wrapper, separator] → первый разделитель HIDE', () => {
    const list = buildList([
      makeSeparator('Апрель'),
      fixtureFragment('note_no_author.html'), // hide (no-author)
      makeSeparator('Май'),
      fixtureFragment('note_with_author.html'), // show (target-match)
      makeSeparator('Июнь'), // хвост: секция пуста → hide
    ]);

    const result: IStfProcessResult = processList(list, CFG, TARGET_B, 'filtered');

    expect(result.hiddenCount).toBe(1);
    expect(result.totalWrappers).toBe(2);

    const children = Array.from(list.children);
    expect(isHiddenByStf(children[0] as Element)).toBe(true); // sep «Апрель»: до «Май» только hidden wrapper
    expect((children[1] as Element).dataset.stfHidden).toBe('1');
    expect(isHiddenByStf(children[2] as Element)).toBe(false); // sep «Май»: ниже есть видимый note_with_author
    expect(isHiddenByStf(children[4] as Element)).toBe(true); // sep «Июнь»: секция пуста
  });

  it('идемпотентность: повторный processList даёт идентичное состояние (счётчик стабилен)', () => {
    const list = buildList([
      makeSeparator(),
      fixtureFragment('system_contact_created.html'), // hide (R4)
      fixtureFragment('call_in_out_with_author.html'), // show
      makeSeparator(),
    ]);

    const first = processList(list, CFG, TARGET_B, 'filtered');
    const snapshotAfterFirst = list.innerHTML;

    for (let i = 0; i < 3; i++) {
      expect(processList(list, CFG, TARGET_B, 'filtered')).toEqual(first);
    }
    expect(list.innerHTML).toBe(snapshotAfterFirst); // ноль лишних мутаций на повторных проходах
    expect(first.hiddenCount).toBe(1);
  });

  it('симуляция пересборки при догрузке: wrapper-ноды те же объекты, разделители — НОВЫЕ → вердикты не меняются', () => {
    // [sep0 | hidden,hidden | sep1 | shown,shown] → sep0 HIDE (до следующего только скрытые), sep1 SHOW
    const list = buildList([
      makeSeparator(),
      fixtureFragment('note_no_author.html'), // hide (no-author)
      fixtureFragment('system_lead_created.html'), // hide (system)
      makeSeparator(),
      fixtureFragment('task_with_author.html'), // show
      fixtureFragment('amojo_message.html'), // show
    ]);

    const before = processList(list, CFG, TARGET_B, 'filtered');
    expect(before.hiddenCount).toBe(2);

    // amoCRM при догрузке: все прямые дети удаляются и вставляются обратно (research §3):
    // wrapper'ы — ТЕМИ ЖЕ DOM-объектами (identity reuse), разделители — НОВЫМИ узлами
    const wrappers = Array.from(list.children)
      .filter((c) => c.classList.contains('feed-note-wrapper')) as Element[];
    expect(wrappers.length).toBe(4);
    for (const child of Array.from(list.children)) {
      list.removeChild(child); // ~360 removed+added-мутаций, дебаунс observer'а это гасит
    }
    // Повторная вставка: wrapper-ноды те же объекты на тех же позициях, разделители — «свежие»
    list.appendChild(makeSeparator());
    list.appendChild(wrappers[0]);
    list.appendChild(wrappers[1]);
    list.appendChild(makeSeparator());
    list.appendChild(wrappers[2]);
    list.appendChild(wrappers[3]);

    // Состояние wrapper'ов пережило пересборку (dataset/inline на ноде); разделители — пересчёт с нуля
    const after = processList(list, CFG, TARGET_B, 'filtered');
    expect(after).toEqual(before);

    const children = Array.from(list.children) as Element[];
    expect(isHiddenByStf(children[0])).toBe(true); // sep0: до следующего разделителя — только скрытые wrapper'ы
    expect((children[1] as Element).dataset.stfHidden).toBe('1');
    expect((children[2] as Element).dataset.stfHidden).toBe('1');
    expect(isHiddenByStf(children[3])).toBe(false); // sep1: ниже есть видимые wrapper'ы
    expect((children[4] as Element).dataset.stfHidden).toBeUndefined();
    expect((children[5] as Element).dataset.stfHidden).toBeUndefined();

    // Повторная пересборка ещё раз (циклы догрузки) — результат стабилен
    for (const child of Array.from(list.children)) {
      list.removeChild(child);
    }
    list.appendChild(makeSeparator());
    list.appendChild(wrappers[0]);
    list.appendChild(wrappers[1]);
    list.appendChild(makeSeparator());
    list.appendChild(wrappers[2]);
    list.appendChild(wrappers[3]);
    expect(processList(list, CFG, TARGET_B, 'filtered')).toEqual(before);
  });

  it('allShown: все wrapper-ы и разделители видны, счётчик 0; возврат в filtered — полный перепроход', () => {
    const list = buildList([
      makeSeparator(),
      fixtureFragment('note_no_author.html'),
      makeSeparator(),
      fixtureFragment('call_in_out_with_author.html'),
    ]);

    const filteredResult = processList(list, CFG, TARGET_B, 'filtered');
    expect(filteredResult.hiddenCount).toBe(1);

    // Кнопка «Показать все события» (handleToggle → allShown)
    unhideAll(list);
    const allShownResult = processList(list, CFG, TARGET_B, 'allShown');
    expect(allShownResult.hiddenCount).toBe(0);
    for (const child of Array.from(list.children)) {
      expect((child as Element).dataset.stfHidden).toBeUndefined();
      expect((child as Element).style.display).not.toBe('none');
    }

    // observer в allShown не фильтрует: новые порции приходят — только пересчёт счётчика без скрытий
    list.appendChild(fixtureFragment('note_no_author.html'));
    const appended = processList(list, CFG, TARGET_B, 'allShown');
    expect(appended.hiddenCount).toBe(0);
    expect((list.lastElementChild as Element).dataset.stfHidden).toBeUndefined();

    // Кнопка «Скрыть нерелевантные» — полный перепроход восстанавливает исходные вердикты
    const back = processList(list, CFG, TARGET_B, 'filtered');
    expect(back.hiddenCount).toBe(2);
  });
});
