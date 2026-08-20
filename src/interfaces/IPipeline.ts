import { IPipelineStatus } from 'interfaces/IPipelineStatus';

export interface IPipeline {
  id: number,
  name: string,
  statuses: IPipelineStatus[],
}
