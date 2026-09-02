import { ITouchTypeMeta, TOGGLEABLE_TOUCH_TYPES, LastTouchSortDir, LastTouchSortField } from 'constants/lastTouch';

// Строка касания (snake_case как в JSON-ответе бэкенда)
export interface ILastTouchInteraction {
  id: number;
  lead_id: number;
  manager_id: number;
  contact_id: number;
  touch_type: string;
  human_text: string;
  touched_at: string;   // ISO8601
  created_at: string;   // ISO8601
}

export interface ILastTouchInteractionsMeta {
  total: number;
  per_page: number;
  current_page: number;
  last_page: number;
}

export interface ILastTouchInteractionsResponse {
  data: ILastTouchInteraction[];
  meta: ILastTouchInteractionsMeta;
}

// Состояние фильтров; пустые массивы / '' = фильтр выключен
export interface ILastTouchInteractionsFilters {
  leadIds: number[];
  managerIds: number[];
  contactIds: number[];
  touchTypes: string[];
  humanText: string;
  touchedAtFrom: string;
  touchedAtTo: string;
  createdAtFrom: string;
  createdAtTo: string;
}

// Запрос (camelCase); даты — 'YYYY-MM-DD' или 'YYYY-MM-DD HH:MM:SS', пустое значение = фильтр выключен
export interface ILastTouchInteractionsQuery {
  leadIds?: number[];        // [] / undefined = без фильтра
  managerIds?: number[];     // [] / undefined = без фильтра
  contactIds?: number[];     // [] / undefined = без фильтра
  touchTypes?: string[];     // [] / undefined = без фильтра; значения из TOUCH_TYPE_OPTIONS
  humanText?: string;        // подстрока для LIKE, '' = без фильтра (max 500)
  touchedAtFrom?: string;
  touchedAtTo?: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  page?: number;             // >=1, default 1
  perPage?: number;          // 1..200, default 50
  sortBy?: LastTouchSortField;   // undefined = базовая сортировка бэкенда (touched_at DESC, id DESC)
  sortDir?: LastTouchSortDir;    // учитывается только вместе с sortBy, default asc
}

// Допустимые touch_type + русские лейблы — тот же справочник, что и в constants/lastTouch (TouchTypes::TOGGLEABLE_TOUCH_TYPES)
export const TOUCH_TYPE_OPTIONS: readonly ITouchTypeMeta[] = TOGGLEABLE_TOUCH_TYPES;
