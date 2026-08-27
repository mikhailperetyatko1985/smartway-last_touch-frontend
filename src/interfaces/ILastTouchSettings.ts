// UI-форма (camelCase)
export interface IFunnelEntry {
  pipelineId: number;
  statusIds: number[];               // [] = воронка не учитывается (валидация не даст сохранить пустой список)
  callStatuses: number[];            // [] = все статусы звонков
  minCallDurations: ICallDurationMap; // {} = без лимитов; ключи только из callStatuses
  disabledTouchTypes: string[];      // [] = все типы включены
  responsibleCustomFieldId: number | null; // null = подмена ответственного выключена
}

// status (id звонка) -> минимальная длительность в сек
export type ICallDurationMap = Record<number, number>;

export interface ILastTouchFormState {
  funnels: IFunnelEntry[];           // [] = фильтр выключен
  customFieldId: number | null;      // null = запись даты выключена (глобальное поле записи даты)
}

// JSON-форма API (snake_case); «не задано» верхнеуровневых полей = null
export interface IFunnelEntryPayload {
  pipeline_id: number;
  status_ids: number[];
  call_statuses: number[];
  min_call_duration_sec_by_status: Record<string, number>;
  disabled_touch_types: string[];
  responsible_custom_field_id: number | null;
}

export interface ILastTouchSettingsPayload {
  funnels: IFunnelEntryPayload[] | null;
  custom_field_id: number | null;
}

export interface ILastTouchSettingsResponse {
  saved: boolean;
  settings: ILastTouchSettingsPayload;
}
