import { useAmoCrmStore } from 'stores/useAmoCrmStore';
import { MethodsEnum } from 'enums/MethodsEnum';
import { IPrivilegesApi } from 'interfaces/IPrivilegesApi';
import { IPrivilegesList } from 'interfaces/IPrivilegesList';

const api = {
  list: '/api/privileges/current-user',
};

const { getWidget, sendRequest } = useAmoCrmStore();
const onError = (text: string) => getWidget.value?.app.notifications.show_message_error({
  header: 'Ошибка',
  text,
});

export class PrivilegesApi implements IPrivilegesApi {
  private readonly host: string;

  constructor(host: string) {
    this.host = host;
  }

  async list(): Promise<IPrivilegesList> {
    try {
      const response = await sendRequest(this.host + api.list, MethodsEnum.get);
      return response as IPrivilegesList;
    } catch (e) {
      onError('Ошибка при получении списка прав пользователя, попробуйте позже.');
      throw e;
    }
  }
}