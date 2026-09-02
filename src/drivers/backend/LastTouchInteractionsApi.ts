import { useAmoCrmStore } from 'stores/useAmoCrmStore';
import { ILastTouchInteractionsApi } from 'interfaces/ILastTouchInteractionsApi';
import { ILastTouchInteractionsQuery, ILastTouchInteractionsResponse } from 'interfaces/ILastTouchInteractions';
import { MethodsEnum } from 'enums/MethodsEnum';

const api = {
  interactions: '/api/last-touch/interactions',
};

const { getWidget, sendRequest } = useAmoCrmStore();
const onError = (text: string) => getWidget.value?.app.notifications.show_message_error({
  header: 'Ошибка',
  text,
});

export class LastTouchInteractionsError extends Error {
  readonly code: '403' | '422' | 'network';

  constructor(code: '403' | '422' | 'network', message: string) {
    super(message);
    this.name = 'LastTouchInteractionsError';
    this.code = code;
  }
}

interface IJqXhrLike {
  status?: number;
  responseText?: string;
}

// errors — объект произвольной формы: любое поле -> список сообщений (или одно сообщение)
interface IValidationErrorResponse {
  errors?: Record<string, unknown>;
  message?: unknown;
}

export class LastTouchInteractionsApi implements ILastTouchInteractionsApi {
  private readonly host: string;

  constructor(host: string) {
    this.host = host;
  }

  async list(query: ILastTouchInteractionsQuery): Promise<ILastTouchInteractionsResponse> {
    try {
      const payload: Record<string, string | number> = {};
      if (query.leadIds?.length) {
        payload.lead_id = query.leadIds.join(',');
      }
      if (query.managerIds?.length) {
        payload.manager_id = query.managerIds.join(',');
      }
      if (query.contactIds?.length) {
        payload.contact_id = query.contactIds.join(',');
      }
      if (query.touchTypes?.length) {
        payload.touch_type = query.touchTypes.join(',');
      }
      // пустые строки / undefined не отправляем — фильтр выключен
      if (query.humanText) {
        payload.human_text = query.humanText;
      }
      if (query.touchedAtFrom) {
        payload.touched_at_from = query.touchedAtFrom;
      }
      if (query.touchedAtTo) {
        payload.touched_at_to = query.touchedAtTo;
      }
      if (query.createdAtFrom) {
        payload.created_at_from = query.createdAtFrom;
      }
      if (query.createdAtTo) {
        payload.created_at_to = query.createdAtTo;
      }
      if (query.page !== undefined && query.page >= 1) {
        payload.page = query.page;
      }
      if (query.perPage !== undefined && query.perPage >= 1) {
        payload.per_page = query.perPage;
      }
      // сортировка отправляется только когда активна — иначе бэкенд применяет базовую (touched_at DESC, id DESC)
      if (query.sortBy !== undefined) {
        payload.sort_by = query.sortBy;
        payload.sort_dir = query.sortDir ?? 'asc';
      }

      const response = await sendRequest(this.host + api.interactions, MethodsEnum.get, payload);
      return response as ILastTouchInteractionsResponse;
    } catch (e) {
      this.handleError(e, 'Ошибка при загрузке списка касаний, попробуйте позже.');
    }
  }

  private handleError(e: unknown, fallback: string): never {
    const jqXhr = e as IJqXhrLike;
    const status = jqXhr?.status;
    const responseText = jqXhr?.responseText;

    if (status === 401 || status === 403) {
      const err = new LastTouchInteractionsError('403', 'Нет доступа к списку касаний');
      onError(err.message);
      throw err;
    }

    if (status === 422) {
      try {
        const parsed: IValidationErrorResponse = JSON.parse(responseText ?? '');
        let text: string | null = null;
        for (const value of Object.values(parsed?.errors ?? {})) {
          // первое сообщение из любого поля errors
          const item = Array.isArray(value) ? value[0] : value;
          if (item !== undefined && item !== null) {
            text = String(item);
            break;
          }
        }

        let errText: string;
        if (text) {
          errText = text;
        } else if (parsed?.message) {
          errText = String(parsed.message);
        } else {
          errText = fallback;
        }

        const err = new LastTouchInteractionsError('422', errText);
        onError(err.message);
        throw err;
      } catch (parseError) {
        if (parseError instanceof LastTouchInteractionsError) {
          throw parseError;
        }
        // JSON.parse упал — считаем сетевой ошибкой
        const err = new LastTouchInteractionsError('network', fallback);
        onError(err.message);
        throw err;
      }
    }

    const err = new LastTouchInteractionsError('network', fallback);
    onError(err.message);
    throw err;
  }
}
