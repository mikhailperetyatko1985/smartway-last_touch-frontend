import { ref, computed } from 'vue';
import { useAmoCrmStore } from 'stores/useAmoCrmStore';
import { ILastTouchInteraction, ILastTouchInteractionsFilters, ILastTouchInteractionsFiltersDraft, ILastTouchInteractionsMeta, ILastTouchInteractionsQuery } from 'interfaces/ILastTouchInteractions';
import { ILastTouchInteractionsSort, LastTouchSortField } from 'constants/lastTouch';

const { getApi } = useAmoCrmStore();

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

// Черновик -> применённое состояние: id-текст нормализуется в number[], humanText — trim (см. ILastTouchInteractionsFiltersDraft)
export const draftToApplied = (d: ILastTouchInteractionsFiltersDraft): ILastTouchInteractionsFilters => ({
  leadIds: parseIdList(d.leadIds),
  managerIds: parseIdList(d.managerIds),
  contactIds: parseIdList(d.contactIds),
  touchTypes: [...d.touchTypes],
  humanText: d.humanText.trim(),
  touchedAtFrom: d.touchedAtFrom,
  touchedAtTo: d.touchedAtTo,
  createdAtFrom: d.createdAtFrom,
  createdAtTo: d.createdAtTo,
});

const sameNumberArray = (a: number[], b: number[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

// Порядок типов касаний в запросе не значим — сравниваем как множества
const sameStringSet = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
};

// Черновик идентичен применённому после нормализации (trim/parseIdList).
// Используется для disabled-состояния кнопки «Найти» и guard'а в applyFilters.
export const isDraftEqualApplied = (d: ILastTouchInteractionsFiltersDraft, f: ILastTouchInteractionsFilters): boolean => (
  d.humanText.trim() === f.humanText
    && sameNumberArray(parseIdList(d.leadIds), f.leadIds)
    && sameNumberArray(parseIdList(d.managerIds), f.managerIds)
    && sameNumberArray(parseIdList(d.contactIds), f.contactIds)
    && sameStringSet(d.touchTypes, f.touchTypes)
    && d.touchedAtFrom === f.touchedAtFrom
    && d.touchedAtTo === f.touchedAtTo
    && d.createdAtFrom === f.createdAtFrom
    && d.createdAtTo === f.createdAtTo
);

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

// Базовая сортировка бэкенда (touched_at DESC, id DESC) — параметры sort_by/sort_dir не отправляются
const emptySort = (): ILastTouchInteractionsSort => ({ sortBy: null, sortDir: 'asc' });

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
  const sort = ref<ILastTouchInteractionsSort>(emptySort());
  const page = ref(1);
  const perPage = ref(DEFAULT_PER_PAGE);
  const items = ref<ILastTouchInteraction[]>([]);
  const meta = ref<ILastTouchInteractionsMeta | null>(null);
  const isLoading = ref(false);
  const errorBanner = ref<{ title: string; text: string } | null>(null);

  // sequence-token: результат применяем только для самого свежего запроса,
  // устаревшие ответы не перезаписывают состояние
  let requestSeq = 0;

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
    // сортировка отправляется только когда активна — иначе бэкенд применяет базовую
    if (sort.value.sortBy !== null) {
      query.sortBy = sort.value.sortBy;
      query.sortDir = sort.value.sortDir;
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

  // Единственная точка применения фильтров («Найти» / Enter в панели): заменяет применённое
  // состояние черновиком, сбрасывает на 1-ю страницу и запрашивает. Изменение любого фильтра
  // без этого вызова запрос НЕ запускает (сортировка/пагинация — отдельные немедленные действия).
  const applyFilters = (draft: ILastTouchInteractionsFiltersDraft): void => {
    if (isDraftEqualApplied(draft, filters.value)) {
      return; // черновик совпадает с применённым после нормализации — перезапрос не нужен
    }
    filters.value = draftToApplied(draft);
    page.value = 1;
    fetchPage();
  };

  // чистим все фильтры (perPage не трогаем), сбрасываем на первую страницу и грузим
  const resetFilters = (): void => {
    filters.value = cloneFilters(emptyFilters());
    page.value = 1;
    fetchPage();
  };

  const goPage = (n: number): void => {
    if (!Number.isFinite(n) || n < 1) {
      return;
    }
    page.value = Math.floor(n);
    fetchPage();
  };

  const setPerPage = (n: number): void => {
    const value = Math.round(n);
    if (!Number.isFinite(value) || value < MIN_PER_PAGE || value > MAX_PER_PAGE) {
      return;
    }
    perPage.value = value;
    page.value = 1;
    fetchPage();
  };

  // Клик по шапке столбца: asc -> desc -> off (базовая сортировка бэкенда).
  // Другой столбец всегда начинает цикл с asc. Пагинация сбрасывается на 1-ю, как для фильтров.
  const toggleSort = (field: LastTouchSortField): void => {
    if (sort.value.sortBy === field) {
      sort.value = sort.value.sortDir === 'asc'
        ? { sortBy: field, sortDir: 'desc' }
        : emptySort();
    } else {
      sort.value = { sortBy: field, sortDir: 'asc' };
    }
    page.value = 1;
    fetchPage();
  };

  const clearError = (): void => {
    errorBanner.value = null;
  };

  return {
    filters,
    sort,
    page,
    perPage,
    items,
    meta,
    isLoading,
    errorBanner,
    total,
    lastPage,
    fetchPage,
    applyFilters,
    resetFilters,
    goPage,
    setPerPage,
    toggleSort,
    clearError,
  };
}
