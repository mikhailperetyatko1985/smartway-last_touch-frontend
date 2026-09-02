export interface ITouchTypeMeta {
  value: string;
  labelRu: string;
}

// 12 допустимых типов касаний (значения = TouchTypes::TOGGLEABLE_TOUCH_TYPES)
export const TOGGLEABLE_TOUCH_TYPES: ITouchTypeMeta[] = [
  { value: 'incoming_call', labelRu: 'Звонок (вх.)' },
  { value: 'outgoing_call', labelRu: 'Звонок (исх.)' },
  { value: 'incoming_mail', labelRu: 'Письмо (вх.)' },
  { value: 'outgoing_mail', labelRu: 'Письмо (исх.)' },
  { value: 'incoming_chat_message', labelRu: 'Чат (вх.)' },
  { value: 'outgoing_chat_message', labelRu: 'Чат (исх.)' },
  { value: 'incoming_sms', labelRu: 'SMS (вх.)' },
  { value: 'outgoing_sms', labelRu: 'SMS (исх.)' },
  { value: 'common_note_added', labelRu: 'Заметка' },
  { value: 'attachment_note_added', labelRu: 'Файл' },
  { value: 'chat_reply', labelRu: 'Чат-ответ' },
  { value: 'chat_first', labelRu: 'Чат-первый' },
];

export interface ICallStatusMeta {
  value: number;   // 1..7
  labelRu: string;
}

// Статусы звонков amoCRM (зафиксированы пользователем)
export const CALL_STATUSES: ICallStatusMeta[] = [
  { value: 1, labelRu: 'Оставил сообщение' },
  { value: 2, labelRu: 'Перезвонить позже' },
  { value: 3, labelRu: 'Нет на месте' },
  { value: 4, labelRu: 'Разговор состоялся' },
  { value: 5, labelRu: 'Неверный номер' },
  { value: 6, labelRu: 'Не дозвонился' },
  { value: 7, labelRu: 'Номер занят' },
];

// Группировка типов для UI (только порядок отображения). values — из TOGGLEABLE_TOUCH_TYPES.
export interface ITouchTypeGroup {
  labelRu: string;
  values: string[];
}
export const TOUCH_TYPES_GROUPS: ITouchTypeGroup[] = [
  { labelRu: 'Звонки', values: ['incoming_call', 'outgoing_call'] },
  { labelRu: 'Почта', values: ['incoming_mail', 'outgoing_mail'] },
  { labelRu: 'Чат', values: ['incoming_chat_message', 'outgoing_chat_message', 'chat_reply', 'chat_first'] },
  { labelRu: 'SMS', values: ['incoming_sms', 'outgoing_sms'] },
  { labelRu: 'Заметки', values: ['common_note_added', 'attachment_note_added'] },
];

// --- Сортировка таблицы «История последних касаний» (GET /api/last-touch/interactions) ---

// Допустимые значения sort_by на бэкенде. Не отправляется -> базовая сортировка touched_at DESC, id DESC
export type LastTouchSortField =
  | 'id'
  | 'lead_id'
  | 'manager_id'
  | 'contact_id'
  | 'touch_type'
  | 'human_text'
  | 'touched_at'
  | 'created_at';

// Допустимые значения sort_dir
export type LastTouchSortDir = 'asc' | 'desc';

// Состояние сортировки: sortBy = null -> базовая сортировка бэкенда (sort_by/sort_dir не отправляются)
export interface ILastTouchInteractionsSort {
  sortBy: LastTouchSortField | null;
  sortDir: LastTouchSortDir;
}

// Колонки таблицы: key — имя поля sort_by на API, labelRu — текст заголовка.
// Единственный источник для рендера шапки и маппинга «UI-колонка -> sort_by».
export interface ILastTouchTableColumn {
  key: LastTouchSortField;
  labelRu: string;
}

export const LAST_TOUCH_TABLE_COLUMNS: readonly ILastTouchTableColumn[] = [
  { key: 'touched_at', labelRu: 'Дата касания' },
  { key: 'human_text', labelRu: 'Описание' },
  { key: 'touch_type', labelRu: 'Тип' },
  { key: 'lead_id', labelRu: 'Lead' },
  { key: 'manager_id', labelRu: 'Manager' },
  { key: 'contact_id', labelRu: 'Contact' },
  { key: 'created_at', labelRu: 'Создано' },
];
