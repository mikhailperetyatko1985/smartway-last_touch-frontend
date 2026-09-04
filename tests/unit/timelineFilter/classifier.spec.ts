import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { classify, collectAuthors, toIntOrNull } from '../../../src/timelineFilter/classifier';
import type { STFVerdict } from '../../../src/timelineFilter/classifier';
import type { IFunnelFilterSettings } from '../../../src/interfaces/ITimelineFilterSettings';

// Фикстуры + канонический target set и cfg — tests/fixtures/timeline/README.md (сделка 42661594)

const FIXTURES_DIR = path.resolve(process.cwd(), 'tests', 'fixtures', 'timeline');

const TARGET_B = new Set([10722265, 10136549, 12830901, 13159601]); // ответственный + гипотетическая группа
const TARGET_A = new Set([10722265]); // только ответственный сделки

function makeCfg(overrides: Partial<IFunnelFilterSettings> = {}): IFunnelFilterSettings {
  return {
    pipeline_id: 1,
    status_ids: [1],
    mode: 'base',
    custom_field_id: null,
    hide_system: true,
    hide_pinned_no_target: false,
    hide_no_author: true,
    ...overrides,
  };
}

function loadFixture(name: string): Element {
  const html = fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
  document.body.innerHTML = html;
  // Каждый файл фикстуры — один прямой ребёнок .notes-wrapper__notes.js-notes (README)
  const el = document.body.firstElementChild;
  if (!el) {
    throw new Error(`fixture ${name}: пустой outerHTML`);
  }
  return el;
}

// Ожидаемые вердикты по README (target B + дефолтный cfg: hide_system/hide_no_author=true, hide_pinned=false)
const EXPECTED_VERDICTS: Record<string, STFVerdict> = {
  note_with_author: 'show',
  note_no_author: 'hide',
  pinned_note: 'show',
  system_lead_created: 'hide',
  system_field_changed_plain: 'hide', // R4: system бьёт автора
  system_field_changed_grouped: 'hide',
  system_contact_created: 'hide', // R4
  system_tag_event: 'hide',
  system_service_message: 'hide',
  system_main_user_changed_plain: 'hide',
  system_lead_status_changed_with_author: 'hide', // R4
  call_in_out_with_author: 'show',
  call_in_out_grouped_complex: 'show', // Q2: целевой в субвью
  mail_message: 'hide', // нет числовых авторов → no-author
  task_with_author: 'show',
  task_no_author: 'hide',
  amojo_message: 'show', // автор = div.n-avatar[id], UUID-чипы не считаются
  undefined_grouped_complex_talks: 'show', // Q2 по рекурсии (10136549 в субвью)
  opened_talks: 'hide',
};

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('classifier: вердикты по фикстурам (target B, дефолтный cfg)', () => {
  for (const [fixture, expected] of Object.entries(EXPECTED_VERDICTS)) {
    it(`${fixture}.html → ${expected.toUpperCase()}`, () => {
      const wrapper = loadFixture(`${fixture}.html`);
      expect(wrapper.classList.contains('feed-note-wrapper')).toBe(true);
      expect(classify(wrapper, makeCfg(), TARGET_B)).toBe(expected);
    });
  }

  it('separator_date_label.html — не событие: классификатор по нему не вызывается (контекстный второй проход)', () => {
    const separator = loadFixture('separator_date_label.html');
    expect(separator.classList.contains('note-time-label__wrapper')).toBe(true);
    expect(separator.classList.contains('feed-note-wrapper')).toBe(false);
  });
});

describe('classifier: target set A={10722265} (только ответственный)', () => {
  it.each([
    'call_in_out_grouped_complex.html', // субвью только с 12830901/12499693 → HIDE
    'undefined_grouped_complex_talks.html', // 10136549 ∉ A; внешний 69264322 никогда не target
    'amojo_message.html', // avatar 12830901 ∉ A
    'task_with_author.html', // 10136549/12830901 ∉ A
  ])('%s → HIDE', (fixture) => {
    const wrapper = loadFixture(fixture);
    expect(classify(wrapper, makeCfg(), TARGET_A)).toBe('hide');
  });
});

describe('classifier: вариации cfg hide_* (README «Тестовые сценарии»)', () => {
  // Сценарий 3: hideSystem:false переворачивает ВСЕ system-фикстуры в SHOW. Правило system —
  // безусловное короткое замыкание приоритета 2 (research §6 / POC shouldHide `if isSystem →
  // return !!hideSystem`), подтверждено dry-run'ом §5 количественно. Примечание README фикстур
  // про «no-author для system при hide_system=false» противоречит финальному алгоритму и отклонено
  // в пользу research (источник истины); расхождение зафиксировано в отчёте подэтапа E.
  it.each([
    'system_field_changed_plain.html',
    'system_contact_created.html',
    'system_lead_status_changed_with_author.html',
    'system_main_user_changed_plain.html',
    'system_lead_created.html',
    'system_field_changed_grouped.html',
    'system_tag_event.html',
    'system_service_message.html',
  ])('%s + hide_system=false → SHOW (правило system безусловное)', (fixture) => {
    const wrapper = loadFixture(fixture);
    expect(classify(wrapper, makeCfg({ hide_system: false }), TARGET_B)).toBe('show');
  });

  // Р4 в обе стороны: hide_system=true скрывает system-события даже с целевым автором
  it.each([
    'system_field_changed_plain.html',
    'system_contact_created.html',
    'system_lead_status_changed_with_author.html',
  ])('%s + hide_system=true → HIDE даже с целевым автором (R4)', (fixture) => {
    const wrapper = loadFixture(fixture);
    expect(classify(wrapper, makeCfg({ hide_system: true }), TARGET_B)).toBe('hide');
  });

  // Сценарий 4: hideNoAuthor:false — почта/задачи/opened_talks/заметки без авторов → SHOW
  it.each([
    'mail_message.html',
    'task_no_author.html',
    'opened_talks.html',
    'note_no_author.html',
  ])('%s + hide_no_author=false → SHOW', (fixture) => {
    const wrapper = loadFixture(fixture);
    expect(classify(wrapper, makeCfg({ hide_no_author: false }), TARGET_B)).toBe('show');
  });

  // Сценарий 5: pinned с НЕцелевым автором — дефолт SHOW, при hide_pinned=true → HIDE по авторам
  it.each([false, true])('pinned_note с нецелевым автором + hide_pinned_no_target=%s', (hidePinned) => {
    const wrapper = loadFixture('pinned_note.html');
    // Вариант из README: целевой автор 10722265 → нецелевой 9999999 (чипы и дубль control-user_state)
    wrapper.querySelectorAll<HTMLElement>('.feed-note__amojo-user[data-id="10722265"]')
      .forEach((chip) => chip.setAttribute('data-id', '9999999'));

    const expected: STFVerdict = hidePinned ? 'hide' : 'show';
    expect(classify(wrapper, makeCfg({ hide_pinned_no_target: hidePinned }), TARGET_B)).toBe(expected);
  });

  it('pinned БЕЗ автора → SHOW при дефолте (правило pinned первее no-author)', () => {
    const wrapper = loadFixture('note_no_author.html');
    // Склеенный вариант: -note без автора + pinned-overlay как прямой ребёнок wrapper'а (research §2)
    const overlay = document.createElement('div');
    overlay.className = 'js-note js-note-pinned feed-note-fixer';
    wrapper.appendChild(overlay);

    expect(classify(wrapper, makeCfg(), TARGET_B)).toBe('show'); // дефолт hide_pinned_no_target=false
    expect(classify(wrapper, makeCfg({ hide_no_author: false }), TARGET_B)).toBe('show'); // и при любом no-author
  });
});

describe('classifier: сбор авторов (UUID отсекаются, Set-дедуп)', () => {
  it('note_with_author: вложенный дубль control-user_state[data-id] не дублирует автора', () => {
    const wrapper = loadFixture('note_with_author.html');
    expect(collectAuthors(wrapper)).toEqual(new Set([10722265]));
  });

  it('call_in_out_grouped_complex: рекурсивный сбор по 7 субвью, дедуп множествами (id 12830901 — многократно)', () => {
    const wrapper = loadFixture('call_in_out_grouped_complex.html');
    const authors = collectAuthors(wrapper);
    expect(authors.has(12830901)).toBe(true);
    expect(authors.has(12499693)).toBe(true);
    // Внешний «Алексей» без числового user_id не попадает в Set (research §2, R15)
    expect(authors.size).toBe(2);
  });

  it('amojo_message: UUID-чипы НЕ считаются авторами — только div.n-avatar[id]', () => {
    const wrapper = loadFixture('amojo_message.html');
    expect(collectAuthors(wrapper)).toEqual(new Set([12830901]));

    // Уберём числовой avatar — останутся лишь UUID data-id → авторов нет вообще
    wrapper.querySelectorAll<HTMLElement>('div.n-avatar[id]').forEach((a) => a.remove());
    expect(collectAuthors(wrapper).size).toBe(0);
    expect(classify(wrapper, makeCfg(), TARGET_B)).toBe('hide'); // падает в no-author
  });

  it('undefined_grouped_complex_talks: внешний участник чата 69264322 собирается как числовой id (но никогда не target)', () => {
    const wrapper = loadFixture('undefined_grouped_complex_talks.html');
    expect(collectAuthors(wrapper)).toEqual(new Set([69264322, 10136549]));
  });

  it.each([
    ['10722265', 10722265],
    [' 42 ', 42],
    ['1440c681-e5a4-4fb0-be98-4706e6315c07', null], // UUID чата
    ['opened-talk-75637', null], // беседа
    ['01kqfatbn74fzw7cap7n085nqw', null], // base62 id заметки
    ['', null],
  ])('toIntOrNull(%s) = %o', (raw, expected) => {
    expect(toIntOrNull(raw)).toBe(expected);
  });

  it('mail_message: data-thread_id/data-message_id НЕ являются авторами', () => {
    const wrapper = loadFixture('mail_message.html');
    expect(collectAuthors(wrapper).size).toBe(0);
  });
});
