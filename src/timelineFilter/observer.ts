// MutationObserver процесса (план §5.5): ТОЛЬКО childList на .notes-wrapper__notes —
// без subtree/attributes (amo-fixers переписывают inline-стили при скролле → шум, research §2).

export const STF_DEBOUNCE_MS = 250;

export interface IStfListObserver {
  target: Element | null;
  disconnect(): void;
}

// Идемпотентный full-pass (processList) через debounce ~250 мс: пересборка при догрузке —
// всплеск ~360 removed+added-мутаций, дебаунс гасит его в один проход.
export function createListObserver(listEl: Element, onProcess: () => void): IStfListObserver {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const mo = new MutationObserver(() => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      onProcess();
    }, STF_DEBOUNCE_MS);
  });

  mo.observe(listEl, { childList: true });

  return {
    target: listEl,
    disconnect(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      mo.disconnect();
    },
  };
}
