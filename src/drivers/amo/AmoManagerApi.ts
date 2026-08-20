import { IManagerApi } from 'interfaces/IManagerApi';
import axios from 'axios';
import { IResponsibleManager } from 'interfaces/IResponsibleManager';
import { useAmoCrmStore } from 'stores/useAmoCrmStore';
import { AccountRelationsExtraModel } from 'enums/AccountRelationsExtraModel';
import { IAccount } from 'interfaces/Account/IAccount';
import {IUserGroup} from "../../interfaces/Account/IUserGroup";

const api = {
  users: '/api/v4/users',
  account: '/api/v4/account',
};

interface IResponseUser {
  id: number;
  name: string,
  email: string,
  rights: {
    is_active: boolean,
  },
}
interface IResponseUsers {
  _embedded: {
    users: IResponseUser[],
  },
  _page_count: number,
}

const { getWidget } = useAmoCrmStore();

//@ts-ignore
if (!window.amo_api_cache) {
  //@ts-ignore
  window.amo_api_cache = {};
}

export class AmoManagerApi implements IManagerApi {
  async list(onlyActive = true): Promise<IResponsibleManager[]> {
    const cacheKey = onlyActive ? 'managers_active' : 'managers';
    //@ts-ignore
    if (window.amo_api_cache?.[cacheKey]?.ttl > Date.now()) {
      //@ts-ignore
      return window.amo_api_cache[cacheKey].data;
    }

    let page = 1;
    let hasNextPage = true;
    const limit = 250;
    let managers: IResponsibleManager[] = [];
    try {
      while (hasNextPage) {
        const {data} = await axios.get<IResponseUsers>(api.users, {params: {page, limit}});
        hasNextPage = page < data._page_count;
        page++;
        const currentManagers = data._embedded.users.map((item) => ({
          id: item.id,
          name: item.name,
          email: item.email,
          is_active: item.rights.is_active,
        }));
        managers = managers.concat(currentManagers);
      }
      const result = onlyActive ? managers.filter((manager) => manager.is_active) : managers;

      //@ts-ignore
      window.amo_api_cache[cacheKey] = {
        ttl: Date.now() + 30000,
        data: result,
      };
      return result;
    } catch (e) {
      getWidget.value?.app.notifications.show_message_error({ header: 'Произошла непредвиденная ошибка', text: '' });
      return [];
    }
  }

  async get(id: number): Promise<IResponsibleManager|null> {
    try {
      const { data } = await axios.get<IResponseUser>(`${api.users}/${id}`);
      return {
        id: data.id,
        name: data.name,
        email: data.email,
        is_active: data.rights.is_active,
      };
    } catch (e) {
      getWidget.value?.app.notifications.show_message_error({header: 'Произошла непредвиденная ошибка', text: ''});
      return null;
    }
  }

  async account(extraModel: AccountRelationsExtraModel | null = null): Promise<IAccount | null> {
    try {
      const { data } = await axios.get<IAccount>(`${api.account}`, {
        params: {
          with: extraModel,
        },
      });

      return data;
    } catch (e) {
      getWidget.value?.app.notifications.show_message_error({header: 'Произошла непредвиденная ошибка, попробуйте повторить позднее', text: ''});
      return null;
    }
  }

  async userGroups(): Promise<IUserGroup[]> {
    try {
      const account = await this.account(AccountRelationsExtraModel.usersGroups);

      return account?._embedded.users_groups || [];
    } catch (e) {
      getWidget.value?.app.notifications.show_message_error({header: 'Произошла непредвиденная ошибка, попробуйте повторить позднее', text: ''});
      return [];
    }
  }
}