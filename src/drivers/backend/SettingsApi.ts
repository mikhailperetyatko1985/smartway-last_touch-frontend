import { useAmoCrmStore } from 'stores/useAmoCrmStore';
import { ISettingsApi } from 'interfaces/ISettingsApi';
import { ISettingsList } from 'interfaces/ISettingsList';
import { MethodsEnum } from 'enums/MethodsEnum';

const api = {
  list: '/api/settings',
  checkToken: '/api/settings/check',
  oauth: '/api/oauth/code',
  longLivedToken: '/api/settings/long-lived',
  clearCache: '/api/settings/clear-account-cache',
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

interface IResponseCheck {
  token: boolean,
  'technical-pipeline': boolean,
  'leads-properties': boolean,
  sequences: boolean,
}

interface ICacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // TTL в миллисекундах, хранится в кеше для гибкости
}

const CACHE_KEY = 'settings_api_check_token';
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 час по умолчанию
const CHECK_TOKEN_CACHE_TTL_MS = 60 * 60 * 1000; // 1 час для checkToken

export class SettingsApi implements ISettingsApi {
  private readonly host: string;

  constructor(host: string) {
    this.host = host;
  }

  private getCachedData<T>(key: string): T | null {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) return null;

      const entry: ICacheEntry<T> = JSON.parse(cached);
      const now = Date.now();

      // Используем TTL из записи кеша
      if (now - entry.timestamp > entry.ttl) {
        localStorage.removeItem(key);
        return null;
      }

      return entry.data;
    } catch {
      return null;
    }
  }

  private setCachedData<T>(key: string, data: T, ttl: number = DEFAULT_CACHE_TTL_MS): void {
    try {
      const entry: ICacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl, // Сохраняем TTL в кеше
      };
      localStorage.setItem(key, JSON.stringify(entry));
    } catch {
      // Игнорируем ошибки localStorage
    }
  }

  async list(): Promise<ISettingsList> {
    try {
      const response = await sendRequest(this.host + api.list, MethodsEnum.get);
      return response as ISettingsList;
    } catch (e) {
      onError('Ошибка при получении списка настроек, попробуйте позже.');
      throw e;
    }
  }

  async checkToken(): Promise<void> {
    // Проверяем кеш
    const cached = this.getCachedData<IResponseCheck>(CACHE_KEY);
    if (cached) {
      // Используем кешированные данные
      if (!cached.token) {
        onError(getWidget?.value?.name + ': токен устарел или не установлен. Пожалуйста, установите актуальный токен доступа');
      }

      if (getWidget.value) {
        getWidget.value.settingsCorrected = true;
      }
      return;
    }

    try {
      const response = await sendRequest(this.host + api.checkToken, MethodsEnum.get) as IResponseCheck;

      // Сохраняем в кеш с указанием TTL
      this.setCachedData(CACHE_KEY, response, CHECK_TOKEN_CACHE_TTL_MS);

      if (!response.token) {
        onError(getWidget?.value?.name + ': токен устарел или не установлен. Пожалуйста, установите актуальный токен доступа');
      }

      if (getWidget.value) {
        getWidget.value.settingsCorrected = true;
      }

    } catch (e) {
      onError('Ошибка при проверке токена, попробуйте позже.');
      throw e;
    }
  }

  async oauth(code: string, referer: string): Promise<boolean> {
    try {
      const response = await sendRequest(this.host + api.oauth, MethodsEnum.get, { code, referer });
      response
        ? onSuccess('Временный токен сохранен успешно.')
        : onError('Не удалось сохранить временный токен, попробуйте позже.');

      return response as boolean;
    } catch (e) {
      onError('Ошибка при сохранении временного токена, попробуйте позже.');
      throw e;
    }
  }

  async longLivedToken(token: string): Promise<boolean> {
    try {
      const response = await sendRequest(this.host + api.longLivedToken, MethodsEnum.patch, JSON.stringify({ token }));
      response
        ? onSuccess('Токен доступа сохранен успешно.')
        : onError('Не удалось сохранить токен доступа, попробуйте позже.');
      return response as boolean;
    } catch (e) {
      onError('Ошибка при сохранении временного токена, попробуйте позже.');
      throw e;
    }
  }

  async clearCache(): Promise<boolean> {
    try {
      const response = await sendRequest(
          this.host + api.clearCache,
          MethodsEnum.post,
      );
      response
          ? onSuccess('Кеш сброшен успешно.')
          : onError('Не удалось сбросить кеш, попробуйте позже.');
      return response as boolean;
    } catch (e) {
      onError('Не удалось сбросить кеш, попробуйте позже.');
      throw e;
    }
  }
}