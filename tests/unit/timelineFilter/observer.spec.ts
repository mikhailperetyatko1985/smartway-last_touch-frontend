import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createListObserver, STF_DEBOUNCE_MS } from '../../../src/timelineFilter/observer';

// Observer процесса (план §5.5): childList на .js-notes + debounce 250 мс; jsdom поддерживает MutationObserver.

let list: HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  list = document.createElement('div');
  list.className = 'notes-wrapper__notes js-notes';
  document.body.appendChild(list);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('observer: debounce и полный проход (smoke)', () => {
  it('мутация → один вызов processList после STF_DEBOUNCE_MS', async () => {
    const onProcess = vi.fn();
    const observer = createListObserver(list, onProcess);

    list.appendChild(document.createElement('div')); // childList-мутация
    expect(onProcess).not.toHaveBeenCalled(); // debounce ещё не истёк

    await vi.advanceTimersByTimeAsync(STF_DEBOUNCE_MS - 1);
    expect(onProcess).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onProcess).toHaveBeenCalledTimes(1);

    observer.disconnect();
  });

  it('всплеск мутаций (пересборка при догрузке) гасится в ОДИН проход', async () => {
    const onProcess = vi.fn();
    const observer = createListObserver(list, onProcess);

    // Имитация research §3: все узлы удалены и вставлены обратно за один цикл
    for (let i = 0; i < 10; i++) {
      list.appendChild(document.createElement('div'));
    }
    for (const child of Array.from(list.children)) {
      list.removeChild(child);
    }
    for (let i = 0; i < 12; i++) { // +2 «догруженных» события
      list.appendChild(document.createElement('div'));
    }

    await vi.advanceTimersByTimeAsync(STF_DEBOUNCE_MS);
    expect(onProcess).toHaveBeenCalledTimes(1); // ~360 мутаций в реальном DOM → 1 процесс

    observer.disconnect();
  });

  it('disconnect: последующие мутации не вызывают process', async () => {
    const onProcess = vi.fn();
    const observer = createListObserver(list, onProcess);
    observer.disconnect();

    list.appendChild(document.createElement('div'));
    await vi.advanceTimersByTimeAsync(STF_DEBOUNCE_MS * 3);
    expect(onProcess).not.toHaveBeenCalled();
  });

  it('target — наблюдаемый узел (для проверки identity при пересборке, §2.2)', () => {
    const onProcess = vi.fn();
    const observer = createListObserver(list, onProcess);
    expect(observer.target).toBe(list);
    observer.disconnect();
  });
});
