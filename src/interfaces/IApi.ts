import { IManagerApi } from 'interfaces/IManagerApi';
import { ISettingsApi } from 'interfaces/ISettingsApi';
import { IPipelineApi } from 'interfaces/IPipelineApi';
import { IPrivilegesApi } from 'interfaces/IPrivilegesApi';
import { ILastTouchSettingsApi } from 'interfaces/ILastTouchSettingsApi';
import { ILastTouchInteractionsApi } from 'interfaces/ILastTouchInteractionsApi';
import { ICalculationIntervalApi } from 'interfaces/ICalculationIntervalApi';

export interface IApi {
  managerApi: IManagerApi,
  settingsApi: ISettingsApi,
  pipelineApi: IPipelineApi,
  privilegesApi: IPrivilegesApi,
  lastTouchSettingsApi: ILastTouchSettingsApi,
  lastTouchInteractionsApi: ILastTouchInteractionsApi,
  lastTouchCalculationIntervalApi: ICalculationIntervalApi,
}

