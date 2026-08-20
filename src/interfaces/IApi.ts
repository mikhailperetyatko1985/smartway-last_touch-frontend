import { IManagerApi } from 'interfaces/IManagerApi';
import { ISettingsApi } from 'interfaces/ISettingsApi';
import { IPipelineApi } from 'interfaces/IPipelineApi';
import { IPrivilegesApi } from 'interfaces/IPrivilegesApi';

export interface IApi {
  managerApi: IManagerApi,
  settingsApi: ISettingsApi,
  pipelineApi: IPipelineApi,
  privilegesApi: IPrivilegesApi,
}

