import { useAmoCrmStore } from 'stores/useAmoCrmStore';
import { ITimelineTargetUsersApi } from 'interfaces/ITimelineTargetUsersApi';
import { ITargetUsersResponse, ISyncAcceptedResponse, ISyncStatus } from 'interfaces/ITimelineTargetUsers';
import { MethodsEnum } from 'enums/MethodsEnum';

const api = {
  targetUsers: '/api/timeline-filter/target-users',
  sync: '/api/timeline-filter/users/sync',
  syncStatus: '/api/timeline-filter/users/sync-status',
};

// Тихий драйвер (без amo-уведомлений) — см. TimelineFilterSettingsApi.

const { sendRequest } = useAmoCrmStore();

export class TimelineTargetUsersError extends Error {
  readonly code: 'not_synced' | 'already_running' | '422' | 'network';

  constructor(code: 'not_synced' | 'already_running' | '422' | 'network', message: string) {
    super(message);
    this.name = 'TimelineTargetUsersError';
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

export class TimelineTargetUsersApi implements ITimelineTargetUsersApi {
  private readonly host: string;

  constructor(host: string) {
    this.host = host;
  }

  // Чтение только из БД-снапшота backend (без обращений к амо), план §4.3
  async get(responsibleUserId: number): Promise<ITargetUsersResponse> {
    try {
      const response = await sendRequest(
        this.host + api.targetUsers,
        MethodsEnum.get,
        { responsible_user_id: responsibleUserId },
      );
      return response as ITargetUsersResponse;
    } catch (e) {
      this.handleError(e, 'Не удалось получить целевых менеджеров', 'not_synced');
    }
  }

  async startSync(): Promise<ISyncAcceptedResponse> {
    try {
      const response = await sendRequest(this.host + api.sync, MethodsEnum.post);
      return response as ISyncAcceptedResponse;
    } catch (e) {
      this.handleError(e, 'Не удалось запустить синхронизацию сотрудников и групп', 'already_running');
    }
  }

  async syncStatus(): Promise<ISyncStatus> {
    try {
      const response = await sendRequest(this.host + api.syncStatus, MethodsEnum.get);
      return response as ISyncStatus;
    } catch (e) {
      this.handleError(e, 'Не удалось получить статус синхронизации');
    }
  }

  private handleError(
    e: unknown,
    fallback: string,
    conflictCode?: 'not_synced' | 'already_running',
  ): never {
    const jqXhr = e as IJqXhrLike;
    const status = jqXhr?.status;
    const responseText = jqXhr?.responseText;

    if (status === 409 && conflictCode) {
      const text = conflictCode === 'not_synced'
        ? 'Иерархия сотрудников не синхронизирована — нажмите «Синхронизировать сотрудников и группы»'
        : 'Синхронизация уже выполняется';
      throw new TimelineTargetUsersError(conflictCode, text);
    }

    if (status === 422) {
      let text: string | null = null;
      try {
        const parsed: IValidationErrorResponse = JSON.parse(responseText ?? '');
        for (const value of Object.values(parsed?.errors ?? {})) {
          // первое сообщение из любого поля errors
          const item = Array.isArray(value) ? value[0] : value;
          if (item !== undefined && item !== null) {
            text = String(item);
            break;
          }
        }

        if (!text && parsed?.message) {
          text = String(parsed.message);
        }
      } catch {
        // JSON.parse упал — оставляем fallback
      }

      throw new TimelineTargetUsersError('422', text ?? fallback);
    }

    throw new TimelineTargetUsersError('network', fallback);
  }
}
