import { useAmoCrmStore } from 'stores/useAmoCrmStore';
import { ILastTouchSettingsApi } from 'interfaces/ILastTouchSettingsApi';
import { ILastTouchSettingsPayload, ILastTouchSettingsResponse } from 'interfaces/ILastTouchSettings';
import { MethodsEnum } from 'enums/MethodsEnum';

const api = {
  settings: '/api/last-touch/settings',
};

const { getWidget, sendRequest } = useAmoCrmStore();
const onError = (text: string) => getWidget.value?.app.notifications.show_message_error({
  header: 'Ошибка',
  text,
});
const onSuccess = (text: string) => getWidget.value?.app.notifications.show_message({
  header: 'Успешно',
  text: text,
  date: Date.now(),
  icon: '',
});

export class LastTouchSettingsError extends Error {
  readonly code: '403' | '422' | 'network';

  constructor(code: '403' | '422' | 'network', message: string) {
    super(message);
    this.name = 'LastTouchSettingsError';
    this.code = code;
  }
}

interface IJqXhrLike {
  status?: number;
  responseText?: string;
}

interface IValidationErrorResponse {
  errors?: { last_touch_settings?: unknown[] };
  message?: unknown;
}

export class LastTouchSettingsApi implements ILastTouchSettingsApi {
  private readonly host: string;

  constructor(host: string) {
    this.host = host;
  }

  async get(): Promise<ILastTouchSettingsResponse> {
    try {
      const response = await sendRequest(this.host + api.settings, MethodsEnum.get);
      return response as ILastTouchSettingsResponse;
    } catch (e) {
      this.handleError(e, 'Ошибка при загрузке настроек последнего касания, попробуйте позже.');
    }
  }

  async save(payload: ILastTouchSettingsPayload): Promise<ILastTouchSettingsPayload> {
    try {
      const response = await sendRequest(this.host + api.settings, MethodsEnum.put, JSON.stringify(payload));
      onSuccess('Настройки последнего касания сохранены');
      return response as ILastTouchSettingsPayload;
    } catch (e) {
      this.handleError(e, 'Не удалось сохранить настройки последнего касания, попробуйте позже.');
    }
  }

  private handleError(e: unknown, fallback: string): never {
    const jqXhr = e as IJqXhrLike;
    const status = jqXhr?.status;
    const responseText = jqXhr?.responseText;

    if (status === 403) {
      const err = new LastTouchSettingsError('403', 'Сохранение доступно только администраторам аккаунта');
      onError(err.message);
      throw err;
    }

    if (status === 422) {
      try {
        const parsed: IValidationErrorResponse = JSON.parse(responseText ?? '');
        let item: unknown = parsed?.errors?.last_touch_settings?.[0];
        if (Array.isArray(item)) {
          item = item[0];
        }

        let text: string;
        if (item !== undefined && item !== null) {
          text = String(item);
        } else if (parsed?.message) {
          text = String(parsed.message);
        } else {
          text = fallback;
        }

        const err = new LastTouchSettingsError('422', text);
        onError(err.message);
        throw err;
      } catch (parseError) {
        if (parseError instanceof LastTouchSettingsError) {
          throw parseError;
        }
        // JSON.parse упал — считаем сетевой ошибкой
        const err = new LastTouchSettingsError('network', fallback);
        onError(err.message);
        throw err;
      }
    }

    const err = new LastTouchSettingsError('network', fallback);
    onError(err.message);
    throw err;
  }
}
