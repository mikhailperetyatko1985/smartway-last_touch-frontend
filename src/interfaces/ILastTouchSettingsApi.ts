import { ILastTouchSettingsPayload, ILastTouchSettingsResponse } from 'interfaces/ILastTouchSettings';

export interface ILastTouchSettingsApi {
  get(): Promise<ILastTouchSettingsResponse>;
  save(payload: ILastTouchSettingsPayload): Promise<ILastTouchSettingsPayload>;
}
