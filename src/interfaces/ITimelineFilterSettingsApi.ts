import { IFilterSettings, ITimelineFilterSettingsResponse } from 'interfaces/ITimelineFilterSettings';

export interface ITimelineFilterSettingsApi {
  // GET /api/timeline-filter/settings → {saved, settings}
  get(): Promise<ITimelineFilterSettingsResponse>;
  // PUT /api/timeline-filter/settings — полная замена funnels → нормализованные funnels
  save(payload: IFilterSettings): Promise<IFilterSettings>;
}
