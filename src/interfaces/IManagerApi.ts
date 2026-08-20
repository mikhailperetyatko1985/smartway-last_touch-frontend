import { IResponsibleManager } from 'interfaces/IResponsibleManager';
import { AccountRelationsExtraModel } from 'enums/AccountRelationsExtraModel';
import { IAccount } from 'interfaces/Account/IAccount';
import { IUserGroup } from 'interfaces/Account/IUserGroup';

export interface IManagerApi {
  list: () => Promise<IResponsibleManager[]>;
  get: (id: number) => Promise<IResponsibleManager|null>;
  account: (extraModel: AccountRelationsExtraModel | null) => Promise<IAccount | null>;
  userGroups: () => Promise<IUserGroup[]>;
}