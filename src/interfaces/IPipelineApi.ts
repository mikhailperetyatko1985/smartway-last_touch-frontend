import { IPipeline } from 'interfaces/IPipeline';
import {ICustomField} from 'interfaces/ICustomField';

export interface IPipelineApi {
  list: () => Promise<IPipeline[]>;
  leadsCustomFields: () => Promise<ICustomField[]>;
}