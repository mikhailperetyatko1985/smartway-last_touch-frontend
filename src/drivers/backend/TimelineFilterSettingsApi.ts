import { useAmoCrmStore } from 'stores/useAmoCrmStore';
import { ITimelineFilterSettingsApi } from 'interfaces/ITimelineFilterSettingsApi';
import { IFilterSettings, ITimelineFilterSettingsResponse } from 'interfaces/ITimelineFilterSettings';
import { MethodsEnum } from 'enums/MethodsEnum';

const api = {
  settings: '/api/timeline-filter/settings',
};

// В отличие от LastTouch-драйверов этот намеренно тихий (без amo-уведомлений):
// runtime на деталке деградирует тихо (план §5.1, R9), а модалка настроек
// показывает собственные ошибки из текста бросаемого исключения (Этап 2b).

const { sendRequest } = useAmoCrmStore();

export class TimelineFilterSettingsError extends Error {
  readonly code: '403' | '422' | 'network';

  // Полная карта валидационных ошибок backend (ключи 'funnels.N.field', 'timeline_filter_settings') —
  // для показа 422 по полям/карточкам в модалке настроек (Этап 2b). Заполняется только при code='422'.
  readonly fieldErrors?: Record<string, string[]>;

  constructor(code: '403' | '422' | 'network', message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = 'TimelineFilterSettingsError';
    this.code = code;
    if (fieldErrors) {
      this.fieldErrors = fieldErrors;
    }
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

export class TimelineFilterSettingsApi implements ITimelineFilterSettingsApi {
  private readonly host: string;

  constructor(host: string) {
    this.host = host;
  }

  async get(): Promise<ITimelineFilterSettingsResponse> {
    try {
      const response = await sendRequest(this.host + api.settings, MethodsEnum.get);
      return response as ITimelineFilterSettingsResponse;
    } catch (e) {
      this.handleError(e, 'Не удалось загрузить настройки фильтра timeline');
    }
  }

  // PUT — полная замена всех воронок (semantika как у last-touch, R10)
  async save(payload: IFilterSettings): Promise<IFilterSettings> {
    try {
      const response = await sendRequest(
        this.host + api.settings,
        MethodsEnum.put,
        JSON.stringify(payload),
      );
      return response as IFilterSettings;
    } catch (e) {
      this.handleError(e, 'Не удалось сохранить настройки фильтра timeline');
    }
  }

  private handleError(e: unknown, fallback: string): never {
    const jqXhr = e as IJqXhrLike;
    const status = jqXhr?.status;
    const responseText = jqXhr?.responseText;

    if (status === 403) {
      throw new TimelineFilterSettingsError('403', 'Сохранение настроек доступно только администраторам аккаунта');
    }

    if (status === 422) {
      let text: string | null = null;
      const fieldErrors: Record<string, string[]> = {};
      try {
        const parsed: IValidationErrorResponse = JSON.parse(responseText ?? '');
        for (const [key, value] of Object.entries(parsed?.errors ?? {})) {
          // нормализуем поле в список сообщений; первое сообщение из любого поля — как раньше
          fieldErrors[key] = (Array.isArray(value) ? value : [value])
            .filter((item): item is string | number => item !== undefined && item !== null)
            .map(String);
          if (!text && fieldErrors[key].length > 0) {
            text = fieldErrors[key][0];
          }
        }

        if (!text && parsed?.message) {
          text = String(parsed.message);
        }
      } catch {
        // JSON.parse упал — оставляем fallback
      }

      throw new TimelineFilterSettingsError(
        '422',
        text ?? fallback,
        Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
      );
    }

    throw new TimelineFilterSettingsError('network', fallback);
  }
}
