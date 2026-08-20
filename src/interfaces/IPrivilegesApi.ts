import { IPrivilegesList } from 'interfaces/IPrivilegesList';

export interface IPrivilegesApi {
  list: () => Promise<IPrivilegesList>;
}