// Кто считается ответственным по событиям воронки (ТЗ Q1: выбор по воронке)
export type IFunnelFilterMode = 'off' | 'base' | 'custom';

// JSON-форма API (snake_case), план §3. Нормализация/валидация — на backend (Этап 2a).
export interface IFunnelFilterSettings {
  pipeline_id: number;
  status_ids: number[]; // непустой массив id стадий воронки, где фильтр АКТИВЕН;
                         // сделка вне этих стадий → виджет молчит (показ без фильтра)
  mode: IFunnelFilterMode;
  custom_field_id: number | null; // для mode=custom: id text/numeric поля с user_id доп. ответственного
  hide_system: boolean;           // технические события (смена полей, теги, этапы и т.д.)
  hide_pinned_no_target: boolean; // закрепленные без целевых менеджеров
  hide_no_author: boolean;        // события без идентифицируемого автора (боты, amojo-системные)
}

export interface IFilterSettings {
  funnels: IFunnelFilterSettings[] | null; // null/[] = виджет выключен везде
}

// GET /api/timeline-filter/settings → 200
export interface ITimelineFilterSettingsResponse {
  saved: boolean; // false — строки настроек нет (виджет выключен везде)
  settings: IFilterSettings;
}
