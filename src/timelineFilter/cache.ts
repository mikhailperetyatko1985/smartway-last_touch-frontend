import { ITimelineFilterSettingsResponse } from 'interfaces/ITimelineFilterSettings';
import { ITargetUsersResponse } from 'interfaces/ITimelineTargetUsers';

// Базовые ключи кешей модуля (план §4.4/§5.1). Фактический ключ localStorage:
// `<baseKey>:<accountScope>` — per-account разделение для мультиаккаунтности:
// amoCRM-аккаунт идентифицируется по subdomain инсталляции (location.hostname),
// который синхронно доступен и уникален на аккаунт. Других localStorage-кешей
// в проекте нет, поэтому пер-аккаунтное разделение ключей ведёт этот модуль.

export const STF_SETTINGS_CACHE_KEY = 'stf_timeline_filter_settings_v1';
export const STF_TARGET_USERS_CACHE_KEY = 'stf_target_users_v1';

// ТЗ: TTL 30 минут (не больше)
export const STF_CACHE_TTL_MS = 30 * 60 * 1000;

interface IStfCacheEntry<T> {
  data: T;
  fetchedAt: number; // epoch ms
}

// stf_target_users_v1 хранит карту responsible_user_id → запись (план §4.4)
type ITargetUsersCacheMap = Record<string, IStfCacheEntry<ITargetUsersResponse>>;

function getAccountScope(): string {
  if (typeof window === 'undefined' || !window.location?.hostname) {
    return 'unknown';
  }
  return window.location.hostname;
}

function storageKey(baseKey: string): string {
  return `${baseKey}:${getAccountScope()}`;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch {
    // localStorage недоступен или запись повреждена — тихая деградация
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Игнорируем (квота/недоступность) — кеш оптимизация, не источник истины
  }
}

function isStale(fetchedAt: number): boolean {
  return Date.now() - fetchedAt > STF_CACHE_TTL_MS;
}

// --- Настройки фильтра timeline (одна запись на аккаунт) ---

export function readStfSettingsCache(): {
  response: ITimelineFilterSettingsResponse;
  stale: boolean;
} | null {
  const entry = readJson<IStfCacheEntry<ITimelineFilterSettingsResponse>>(
    storageKey(STF_SETTINGS_CACHE_KEY),
  );
  if (!entry || !entry.data) {
    return null;
  }
  return { response: entry.data, stale: isStale(entry.fetchedAt) };
}

// Запись свежего ответа после GET/PUT (план §5.1)
export function writeStfSettingsCache(response: ITimelineFilterSettingsResponse): void {
  writeJson(storageKey(STF_SETTINGS_CACHE_KEY), {
    data: response,
    fetchedAt: Date.now(),
  });
}

// --- Целевые пользователи (запись на каждого responsible_user_id) ---

export function readStfTargetUsersEntry(
  responsibleUserId: number,
): { data: ITargetUsersResponse; stale: boolean } | null {
  const map = readJson<ITargetUsersCacheMap>(storageKey(STF_TARGET_USERS_CACHE_KEY));
  const entry = map?.[String(responsibleUserId)];
  if (!entry || !entry.data) {
    return null;
  }
  return { data: entry.data, stale: isStale(entry.fetchedAt) };
}

export function writeStfTargetUsersEntry(
  responsibleUserId: number,
  data: ITargetUsersResponse,
): void {
  const key = storageKey(STF_TARGET_USERS_CACHE_KEY);
  const map = readJson<ITargetUsersCacheMap>(key) ?? {};
  map[String(responsibleUserId)] = { data, fetchedAt: Date.now() };
  writeJson(key, map);
}

// Локальный сброс кеша целевых пользователей после success-синка (план §4.4, шаг 3):
// в других браузерах отработает TTL ≤ 30 мин, backend к тому времени уже актуален.
export function resetStfTargetUsersCache(): void {
  try {
    window.localStorage.removeItem(storageKey(STF_TARGET_USERS_CACHE_KEY));
  } catch {
    // localStorage недоступен — сбрасывать нечего
  }
}

// --- Общие storage-примитивы (canary, Этап 5): per-account scope `baseKey:<hostname>` ---

export function stfStorageKey(baseKey: string): string {
  return storageKey(baseKey);
}

export function readStfJson<T>(key: string): T | null {
  return readJson(key);
}

export function writeStfJson(key: string, value: unknown): void {
  writeJson(key, value);
}

// --- In-flight дедупликация Promise (несколько открытий деталки = 1 запрос, план §4.4) ---

const inflightRequests = new Map<string, Promise<unknown>>();

export function stfDeduplicate<T>(key: string, task: () => Promise<T>): Promise<T> {
  const pending = inflightRequests.get(key);
  if (pending) {
    return pending as Promise<T>;
  }
  const promise = task().finally(() => {
    // Удаляем и после успеха, и после сбоя — повторный вызов начинает новый запрос
    inflightRequests.delete(key);
  });
  inflightRequests.set(key, promise);
  return promise;
}

