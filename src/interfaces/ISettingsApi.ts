import { ISettingsList } from 'interfaces/ISettingsList';

export interface ISettingsApi {
  list: () => Promise<ISettingsList>;
  checkToken: () => Promise<void>;
  oauth: (code: string, referer: string) => Promise<boolean>;
  longLivedToken: (token: string) => Promise<boolean>;
  clearCache: () => Promise<boolean>;
}