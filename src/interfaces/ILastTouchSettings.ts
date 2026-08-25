// UI-форма (camelCase)
export interface IFunnelEntry {
  pipelineId: number;
  statusIds: number[];
}
// status (id звонка) -> минимальная длительность в сек
export type ICallDurationMap = Record<number, number>;

export interface ILastTouchFormState {
  funnels: IFunnelEntry[];              // [] = фильтр выключен
  callStatuses: number[];               // [] = все статусы звонков
  minCallDurations: ICallDurationMap;   // {} = без лимитов; ключи только из callStatuses
  customFieldId: number | null;         // null = запись в поле выключена
  disabledTouchTypes: string[];         // [] = все типы включены
}

// JSON-форма API (snake_case); «не задано» = null
export interface ILastTouchSettingsPayload {
  funnels: { pipeline_id: number; status_ids: number[] }[] | null;
  call_statuses: number[] | null;
  min_call_duration_sec_by_status: Record<string, number> | null;
  custom_field_id: number | null;
  disabled_touch_types: string[] | null;
}

export interface ILastTouchSettingsResponse {
  saved: boolean;
  settings: ILastTouchSettingsPayload;
}
