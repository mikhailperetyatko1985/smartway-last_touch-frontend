import { ref, computed } from 'vue';
import { useAmoCrmStore } from 'stores/useAmoCrmStore';
import { ILastTouchInteraction, ILastTouchInteractionsFilters, ILastTouchInteractionsMeta, ILastTouchInteractionsQuery } from 'interfaces/ILastTouchInteractions';

const { getApi } = useAmoCrmStore();

const HUMAN_TEXT_DEBOUNCE_MS = 400;
const DEFAULT_PER_PAGE = 50;
const MIN_PER_PAGE = 1;
const MAX_PER_PAGE = 200;

// "1, 2 3,4" -> [1, 2, 3, 4]; только целые > 0, дубли уходят (сохраняем порядок первого вхождения)
export const parseIdList = (input: string): number[] => {
  const seen = new Set<number>();
  for (const raw of input.split(/[\s,]+/)) {
    if (!raw) {
      continue;
    }
    const id = Number(raw);
    if (Number.isInteger(id) && id > 0) {
      seen.add(id);
    }
  }
  return [...seen];
};

export const formatIdList = (ids: number[]): string => ids.join(', ');

// Число активных групп фильтров (каждая группа считается один раз) — для счётчика в UI
export const countActiveFilters = (f: ILastTouchInteractionsFilters): number => {
  let count = 0;
  if (f.humanText.trim()) count++;
  if (f.leadIds.length) count++;
  if (f.managerIds.length) count++;
  if (f.contactIds.length) count++;
  if (f.touchTypes.length) count++;
  if (f.touchedAtFrom || f.touchedAtTo) count++;
  if (f.createdAtFrom || f.createdAtTo) count++;
  return count;
};

const emptyFilters = (): ILastTouchInteractionsFilters => ({
  leadIds: [],
  managerIds: [],
  contactIds: [],
  touchTypes: [],
  humanText: '',
  touchedAtFrom: '',
  touchedAtTo: '',
  createdAtFrom: '',
  createdAtTo: '',
});

const cloneFilters = (f: ILastTouchInteractionsFilters): ILastTouchInteractionsFilters => ({
  leadIds: [...f.leadIds],
  managerIds: [...f.managerIds],
  contactIds: [...f.contactIds],
  touchTypes: [...f.touchTypes],
  humanText: f.humanText,
  touchedAtFrom: f.touchedAtFrom,
  touchedAtTo: f.touchedAtTo,
  createdAtFrom: f.createdAtFrom,
  createdAtTo: f.createdAtTo,
});

export function useLastTouchInteractions() {
  const filters = ref<ILastTouchInteractionsFilters>(emptyFilters());
  const page = ref(1);
  const perPage = ref(DEFAULT_PER_PAGE);
  const items = ref<ILastTouchInteraction[]>([]);
  const meta = ref<ILastTouchInteractionsMeta | null>(null);
  const isLoading = ref(false);
  const errorBanner = ref<{ title: string; text: string } | null>(null);

  // sequence-token: результат применяем только для самого свежего запроса,
  // устаревшие ответы (гонка дебаунса) не перезаписывают состояние
  let requestSeq = 0;
  let humanTextTimer: ReturnType<typeof setTimeout> | null = null;

  const total = computed(() => meta.value?.total ?? 0);
  const lastPage = computed(() => meta.value?.last_page ?? 1);

  const buildQuery = (): ILastTouchInteractionsQuery => {
    const f = filters.value;
    // пустые массивы/строки не отправляем — драйвер и так их игнорирует, но держим запрос чистым
    const query: ILastTouchInteractionsQuery = {
      page: page.value,
      perPage: perPage.value,
    };
    if (f.leadIds.length) {
      query.leadIds = [...f.leadIds];
    }
    if (f.managerIds.length) {
      query.managerIds = [...f.managerIds];
    }
    if (f.contactIds.length) {
      query.contactIds = [...f.contactIds];
    }
    if (f.touchTypes.length) {
      query.touchTypes = [...f.touchTypes];
    }
    const humanText = f.humanText.trim();
    if (humanText) {
      query.humanText = humanText;
    }
    if (f.touchedAtFrom) {
      query.touchedAtFrom = f.touchedAtFrom;
    }
    if (f.touchedAtTo) {
      query.touchedAtTo = f.touchedAtTo;
    }
    if (f.createdAtFrom) {
      query.createdAtFrom = f.createdAtFrom;
    }
    if (f.createdAtTo) {
      query.createdAtTo = f.createdAtTo;
    }
    return query;
  };

  const fetchPage = async (): Promise<void> => {
    // guard от параллельных запросов
    if (isLoading.value) {
      return;
    }
    const api = getApi.value?.lastTouchInteractionsApi;
    if (!api) {
      errorBanner.value = { title: 'Ошибка загрузки', text: 'Не удалось загрузить список касаний, попробуйте позже.' };
      items.value = [];
      meta.value = null;
      return;
    }
    const seq = ++requestSeq;
    isLoading.value = true;
    errorBanner.value = null;
    try {
      const response = await api.list(buildQuery());
      if (seq !== requestSeq) {
        // устаревший ответ — уже начался более свежий запрос
        return;
      }
      items.value = response.data;
      meta.value = response.meta;
    } catch (e) {
      if (seq !== requestSeq) {
        return;
      }
      const text = e instanceof Error ? e.message : 'Произошла непредвиденная ошибка, попробуйте позже.';
      errorBanner.value = { title: 'Ошибка загрузки', text };
      items.value = [];
      meta.value = null;
    } finally {
      if (seq === requestSeq) {
        isLoading.value = false;
      }
    }
  };

  const cancelHumanTextDebounce = (): void => {
    if (humanTextTimer !== null) {
      clearTimeout(humanTextTimer);
      humanTextTimer = null;
    }
  };

  // текст меняем сразу (для v-model поля), перезапрос — через debounce со сбросом page=1
  const setHumanText = (text: string): void => {
    filters.value.humanText = text;
    cancelHumanTextDebounce();
    humanTextTimer = setTimeout(() => {
      humanTextTimer = null;
      page.value = 1;
      fetchPage();
    }, HUMAN_TEXT_DEBOUNCE_MS);
  };

  // явный перезапрос без дебаунса (touchTypes/даты) — компонент вызывает сам после смены фильтра
  const applyFilters = (): void => {
    cancelHumanTextDebounce();
    page.value = 1;
    fetchPage();
  };

  // чистим все фильтры (perPage не трогаем), сбрасываем на первую страницу и грузим
  const resetFilters = (): void => {
    cancelHumanTextDebounce();
    filters.value = cloneFilters(emptyFilters());
    page.value = 1;
    fetchPage();
  };

  const goPage = (n: number): void => {
    if (!Number.isFinite(n) || n < 1) {
      return;
    }
    cancelHumanTextDebounce();
    page.value = Math.floor(n);
    fetchPage();
  };

  const setPerPage = (n: number): void => {
    const value = Math.round(n);
    if (!Number.isFinite(value) || value < MIN_PER_PAGE || value > MAX_PER_PAGE) {
      return;
    }
    cancelHumanTextDebounce();
    perPage.value = value;
    page.value = 1;
    fetchPage();
  };

  const clearError = (): void => {
    errorBanner.value = null;
  };

  return {
    filters,
    page,
    perPage,
    items,
    meta,
    isLoading,
    errorBanner,
    total,
    lastPage,
    fetchPage,
    setHumanText,
    applyFilters,
    resetFilters,
    goPage,
    setPerPage,
    clearError,
  };
}
