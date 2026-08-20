import { IAmoUser } from 'interfaces/IAmoUser';

export interface IWidget {
  amocrm: object,
  name: string,
  settingsCorrected: boolean,
  app: {
    notifications: {
      show_message: (params: { header: string, text: string, date: number, icon: string }) => void,
      show_message_error: (params: { header: string, text: string }) => void,
    },
  },
  isCurrentUserAdmin: boolean,
  currentUser: IAmoUser,
  inited: boolean,
  $authorizedAjax: (config: {url: string, type: string, data: object|string, contentType: string}) => Promise<any>,
  actionButtonMounted: boolean,
}

