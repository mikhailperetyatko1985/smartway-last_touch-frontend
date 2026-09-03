import { useAmoCrmStore } from 'stores/useAmoCrmStore';
import { ICalculationIntervalApi } from 'interfaces/ICalculationIntervalApi';
import { ICalculationInterval } from 'interfaces/ICalculationInterval';
import { MethodsEnum } from 'enums/MethodsEnum';

const api = {
  calculationInterval: '/api/last-touch/calculation-interval',
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

export class LastTouchCalculationIntervalError extends Error {
  readonly code: '403' | '422' | 'network';

  constructor(code: '403' | '422' | 'network', message: string) {
    super(message);
    this.name = 'LastTouchCalculationIntervalError';
    this.code = code;
  }
}

interface IJqXhrLike {
  status?: number;
  responseText?: string;
}

interface IValidationErrorResponse {
  errors?: { interval_minutes?: unknown[] };
  message?: unknown;
}

export class LastTouchCalculationIntervalApi implements ICalculationIntervalApi {
  private readonly host: string;

  constructor(host: string) {
    this.host = host;
  }

  async get(): Promise<ICalculationInterval> {
    try {
      const response = await sendRequest(this.host + api.calculationInterval, MethodsEnum.get);
      return response as ICalculationInterval;
    } catch (e) {
      this.handleError(e, 'Ошибка при загрузке частоты сбора данных, попробуйте позже.');
    }
  }

  async save(intervalMinutes: number): Promise<ICalculationInterval> {
    try {
      const response = await sendRequest(this.host + api.calculationInterval, MethodsEnum.put, JSON.stringify({ interval_minutes: intervalMinutes }));
      onSuccess('Настройка частоты сохранена');
      return response as ICalculationInterval;
    } catch (e) {
      this.handleError(e, 'Не удалось сохранить частоту сбора данных, попробуйте позже.');
    }
  }

  private handleError(e: unknown, fallback: string): never {
    const jqXhr = e as IJqXhrLike;
    const status = jqXhr?.status;
    const responseText = jqXhr?.responseText;

    if (status === 403) {
      const err = new LastTouchCalculationIntervalError('403', 'Сохранение доступно только администраторам аккаунта');
      onError(err.message);
      throw err;
    }

    if (status === 422) {
      try {
        const parsed: IValidationErrorResponse = JSON.parse(responseText ?? '');
        let item: unknown = parsed?.errors?.interval_minutes?.[0];
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

        const err = new LastTouchCalculationIntervalError('422', text);
        onError(err.message);
        throw err;
      } catch (parseError) {
        if (parseError instanceof LastTouchCalculationIntervalError) {
          throw parseError;
        }
        // JSON.parse упал — считаем сетевой ошибкой
        const err = new LastTouchCalculationIntervalError('network', fallback);
        onError(err.message);
        throw err;
      }
    }

    const err = new LastTouchCalculationIntervalError('network', fallback);
    onError(err.message);
    throw err;
  }
}
