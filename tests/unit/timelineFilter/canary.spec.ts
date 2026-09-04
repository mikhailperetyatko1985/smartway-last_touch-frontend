import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Canary (Этап 5 / R1): чек-лист якорей на каждом processList, счётчик провалов с persist,
// тихая деактивация после N подряд «переверсток» amo (unhideAll + кнопка/observer/tick сняты),
// ring-buffer диагностики без UI. Симуляция переверстки в jsdom: дети списка существуют, но
// несут не-якорные классы (ноды те же — как при identity-reuse пересборки, research §3).

import {
  checkStfAnchors,
  stfCanaryOnProcess,
  stfCanaryIsDisabled,
  stfCanaryDeactivate,
  pushStfDiagnostic,
  STF_CANARY_CACHE_KEY,
  STF_DIAGNOSTICS_KEY,
  STF_CANARY_FAIL_LIMIT,
  STF_CANARY_TTL_MS,
} from '../../../src/timelineFilter/canary';
import { processList } from '../../../src/timelineFilter/hider';
import { stfStorageKey } from '../../../src/timelineFilter/cache';
import type { IFunnelFilterSettings } from '../../../src/interfaces/ITimelineFilterSettings';

const CFG: IFunnelFilterSettings = {
  pipeline_id: 7,
  status_ids: [11],
  mode: 'base',
  custom_field_id: null,
  hide_system: true,
  hide_pinned_no_target: false,
  hide_no_author: true,
};

const TARGETS = new Set([10722265]); // target set из фикстур (research §5)

const CANARY_KEY = stfStorageKey(STF_CANARY_CACHE_KEY);
const DIAGNOSTICS_KEY = stfStorageKey(STF_DIAGNOSTICS_KEY);

// Реалистичный список: целевая заметка (show), задача без автора (hide при hide_no_author=true),
// system-событие (hide при hide_system=true), разделитель дат.
function buildAnchoredList(): HTMLElement {
  const list = document.createElement('div');
  list.className = 'notes-wrapper__notes js-notes';
  list.innerHTML = [
    '<div class="feed-note-wrapper feed-note-wrapper-note" data-id="n1">'
    + '<span class="feed-note__amojo-user" data-id="10722265">А</span></div>',
    '<div class="note-time-label__wrapper js-notes-timeline-point" data-point="Апрель"></div>',
    '<div class="feed-note-wrapper feed-note-wrapper-task" data-id="t1"></div>',
    '<div class="feed-note-wrapper feed-note-wrapper_system feed-note-wrapper_field_changed" data-id="f1"></div>',
  ].join('');
  document.body.appendChild(list);
  return list;
}

// «Переверстка» amo (R1): те же DOM-объекты, но классы больше не совпадают с якорями.
function simulateAmoRebuild(list: HTMLElement): void {
  for (let i = 0; i < list.children.length; i++) {
    list.children[i].className = 'amo-rebuilt-widget';
  }
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('checkStfAnchors: чек-лист якорей', () => {
  it('ок — прямой ребёнок с классом feed-note-wrapper* (подтипы)', () => {
    const list = buildAnchoredList();
    expect(checkStfAnchors(list)).toBe('ok');
  });

  it('R16: суффикс _grouped на system-капсуле тоже якорь (feed-note-wrapper*)', () => {
    const list = document.createElement('div');
    list.className = 'notes-wrapper__notes js-notes';
    list.innerHTML = '<div class="feed-note-wrapper feed-note-wrapper_system feed-note-wrapper_grouped"></div>';
    document.body.appendChild(list);
    expect(checkStfAnchors(list)).toBe('ok');
  });

  it('ок — только разделитель note-time-label__wrapper (без wrapper\'ов в моменте)', () => {
    const list = document.createElement('div');
    list.className = 'notes-wrapper__notes js-notes';
    list.innerHTML = '<div class="note-time-label__wrapper js-notes-timeline-point" data-point="Май"></div>';
    document.body.appendChild(list);
    expect(checkStfAnchors(list)).toBe('ok');
  });

  it('пустой список: children=0 → empty-list (не провал, R16)', () => {
    const list = buildAnchoredList();
    for (let i = list.children.length - 1; i >= 0; i--) {
      list.removeChild(list.children[i]);
    }
    expect(checkStfAnchors(list)).toBe('empty-list');
  });

  it('нет списка / узел отсоединён → no-list (не провал)', () => {
    const list = buildAnchoredList();
    list.remove();
    expect(checkStfAnchors(null)).toBe('no-list');
    expect(checkStfAnchors(list)).toBe('no-list');
  });

  it('list существует, children>0, но ни один класс-якорь не matches → anchors-missing', () => {
    const list = buildAnchoredList();
    simulateAmoRebuild(list);
    expect(checkStfAnchors(list)).toBe('anchors-missing');
  });

  it('не-якорные классы, начинающиеся похоже (feed-note-wrapperline), якорем не считаются', () => {
    const list = document.createElement('div');
    list.className = 'notes-wrapper__notes js-notes';
    list.innerHTML = '<div class="feed-note-wrapperline"></div>'; // prefix-совпадение строки className — ловушка
    document.body.appendChild(list);
    expect(checkStfAnchors(list)).toBe('anchors-missing');
  });
});

describe('canary: счётчик провалов и деактивация (N=5 подряд)', () => {
  it('5 провальных processList подряд → деактивация + unhideAll + снятие кнопки/observer/tick', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const list = buildAnchoredList();

    // Активный фильтр: часть событий скрыта (task без автора, system-событие) — как в боевом проходе
    const result = processList(list, CFG, TARGETS, 'filtered');
    expect(result.hiddenCount).toBeGreaterThan(0);

    // amo переверстала markup (ноды те же, классы — чужие)
    simulateAmoRebuild(list);

    let deactivatedAtRun: number | null = null;
    for (let run = 1; run <= STF_CANARY_FAIL_LIMIT; run++) {
      const deactivated = stfCanaryOnProcess(checkStfAnchors(list), '42661594');
      if (deactivated) {
        deactivatedAtRun = run;
        break;
      }
    }

    expect(deactivatedAtRun).toBe(STF_CANARY_FAIL_LIMIT); // только на 5-м подряд провале
    expect(warnSpy).toHaveBeenCalledWith('[STF] disabled: anchors not found');

    // Persist флага disabled + diagnostic в ring-buffer (без UI, R9)
    const record = JSON.parse(window.localStorage.getItem(CANARY_KEY) as string);
    expect(typeof record.disabledAt).toBe('number');
    expect(record.reason).toBe('anchors not found');
    expect(stfCanaryIsDisabled()).toBe(true);

    const diagnostics = JSON.parse(window.localStorage.getItem(DIAGNOSTICS_KEY) as string);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].leadId).toBe('42661594');
    expect(String(diagnostics[0].reason)).toContain('anchors not found');

    // Действия деактивации: всё восстановлено, кнопка снята, observer/tick остановлены
    const button = document.createElement('button');
    button.id = 'stf-toggle-btn';
    button.dataset.stfState = 'filtered';
    list.parentElement?.insertBefore(button, list);
    const disconnectObserver = vi.fn();
    const stopTick = vi.fn();

    stfCanaryDeactivate({ listEl: list, disconnectObserver, stopTick });

    for (let i = 0; i < list.children.length; i++) {
      const child = list.children[i] as HTMLElement;
      expect(child.dataset.stfHidden).toBeUndefined(); // метки скрытия сняты
      expect(child.style.getPropertyValue('display')).not.toBe('none'); // inline-правила amo восстановлены
    }
    expect(document.getElementById('stf-toggle-btn')).toBeNull();
    expect(disconnectObserver).toHaveBeenCalledTimes(1);
    expect(stopTick).toHaveBeenCalledTimes(1);
  });

  it('4 провала + успех → счётчик обнулён (5 подряд не накопились)', () => {
    const list = buildAnchoredList();
    processList(list, CFG, TARGETS, 'filtered'); // прогрев: часть скрыта
    simulateAmoRebuild(list);

    for (let run = 1; run <= STF_CANARY_FAIL_LIMIT - 1; run++) {
      expect(stfCanaryOnProcess(checkStfAnchors(list), '42661594')).toBe(false);
    }
    const midRecord = JSON.parse(window.localStorage.getItem(CANARY_KEY) as string);
    expect(midRecord.failCount).toBe(STF_CANARY_FAIL_LIMIT - 1);

    // amo вернула исходный markup — обычный успех обнуляет счётчик (порядок детей = порядок сборки)
    const restoredClasses = [
      'feed-note-wrapper feed-note-wrapper-note',
      'note-time-label__wrapper js-notes-timeline-point',
      'feed-note-wrapper feed-note-wrapper-task',
      'feed-note-wrapper feed-note-wrapper_system feed-note-wrapper_field_changed',
    ];
    for (let i = 0; i < list.children.length; i++) {
      (list.children[i] as HTMLElement).className = restoredClasses[i];
    }
    expect(checkStfAnchors(list)).toBe('ok');
    expect(stfCanaryOnProcess('ok', '42661594')).toBe(false);

    const resetRecord = JSON.parse(window.localStorage.getItem(CANARY_KEY) as string);
    expect(resetRecord.failCount).toBe(0); // обнулилось, а не «4 + 1»

    // и следующий провал считается с начала
    simulateAmoRebuild(list);
    expect(stfCanaryOnProcess(checkStfAnchors(list), '42661594')).toBe(false);
    const restarted = JSON.parse(window.localStorage.getItem(CANARY_KEY) as string);
    expect(restarted.failCount).toBe(1);
  });

  it('нейтральные статусы (no-list/empty-list, R16 «отсутствие в моменте») счётчик не трогают', () => {
    window.localStorage.setItem(CANARY_KEY, JSON.stringify({ failCount: 3 }));

    expect(stfCanaryOnProcess('no-list', null)).toBe(false);
    expect(stfCanaryOnProcess('empty-list', '42661594')).toBe(false);

    const record = JSON.parse(window.localStorage.getItem(CANARY_KEY) as string);
    expect(record.failCount).toBe(3); // без изменений
  });
});

describe('canary: persistence и TTL флага disabled (свежий старт через сутки)', () => {
  it('перезагрузка страницы не сбрасывает счётчик провалов (persist)', () => {
    // seed = LIMIT-3: «свежая» страница продолжает накопленное — деактивация на последнем из трёх
    window.localStorage.setItem(CANARY_KEY, JSON.stringify({ failCount: STF_CANARY_FAIL_LIMIT - 3 }));

    const outcomes = [1, 2, 3].map(() => stfCanaryOnProcess('anchors-missing', '42661594'));
    expect(outcomes).toEqual([false, false, true]);

    const record = JSON.parse(window.localStorage.getItem(CANARY_KEY) as string);
    expect(record.failCount).toBe(STF_CANARY_FAIL_LIMIT);
    expect(typeof record.disabledAt).toBe('number');
  });

  it('disabled в пределах TTL (24 ч) → модуль молчит, активация не стартует', () => {
    window.localStorage.setItem(CANARY_KEY, JSON.stringify({ disabledAt: Date.now() - 60_000 }));
    expect(stfCanaryIsDisabled()).toBe(true);
    // запись при этом не удаляется — TTL ещё действует
    expect(window.localStorage.getItem(CANARY_KEY)).not.toBeNull();
  });

  it('после истечения TTL → «свежий старт»: запись удалена, флаг сброшен', () => {
    window.localStorage.setItem(
      CANARY_KEY,
      JSON.stringify({ failCount: STF_CANARY_FAIL_LIMIT, disabledAt: Date.now() - STF_CANARY_TTL_MS - 1000 }),
    );

    expect(stfCanaryIsDisabled()).toBe(false); // TTL прошёл
    expect(window.localStorage.getItem(CANARY_KEY)).toBeNull(); // запись сгорела — свежий старт
    expect(stfCanaryOnProcess('anchors-missing', null)).toBe(false); // счётчик снова с нуля
  });

  it('повреждённая/чужая запись не ломает логику (тихая деградация)', () => {
    window.localStorage.setItem(CANARY_KEY, '{broken json');
    expect(stfCanaryIsDisabled()).toBe(false);
    expect(stfCanaryOnProcess('anchors-missing', null)).toBe(false);

    const record = JSON.parse(window.localStorage.getItem(CANARY_KEY) as string);
    expect(record.failCount).toBe(1); // пересчитана с нуля
  });
});

describe('diagnostics: ring-buffer stf_diagnostics_v1 (cap ~50)', () => {
  it('капает записи {t, leadId, reason} и отбрасывает старейшие за пределами cap', () => {
    for (let i = 1; i <= 52; i++) {
      pushStfDiagnostic(`reason-${i}`, `lead-${i}`);
    }

    const entries = JSON.parse(window.localStorage.getItem(DIAGNOSTICS_KEY) as string);
    expect(entries).toHaveLength(50); // cap ~50
    expect(entries[0].leadId).toBe('lead-3'); // две старейшие отброшены
    expect(entries[entries.length - 1]).toMatchObject({ leadId: 'lead-52', reason: 'reason-52' });
    for (const entry of entries) {
      expect(typeof entry.t).toBe('number');
    }
  });

  it('не перекрывает чужие/повреждённые данные — начинает новый buffer', () => {
    window.localStorage.setItem(DIAGNOSTICS_KEY, 'not-an-array');
    pushStfDiagnostic('canary: anchors not found — widget disabled', null);

    const entries = JSON.parse(window.localStorage.getItem(DIAGNOSTICS_KEY) as string);
    expect(entries).toHaveLength(1);
    expect(entries[0].reason).toBe('canary: anchors not found — widget disabled');
  });
});
