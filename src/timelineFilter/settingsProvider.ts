import { useAmoCrmStore } from 'stores/useAmoCrmStore';
import { IFilterSettings, ITimelineFilterSettingsResponse } from 'interfaces/ITimelineFilterSettings';
import { TimelineFilterSettingsError } from 'drivers/backend/TimelineFilterSettingsApi';
import { readStfSettingsCache, writeStfSettingsCache, stfDeduplicate } from './cache';

const DEDUP_KEY = 'timeline-filter:settings';

const { getApi } = useAmoCrmStore();

/**
 * Seam для этапов D/E (план §5.1): чтение настроек timeline-фильтра через SWR-кеш.
 * - свежая запись в кеше → отдача без запроса;
 * - stale/miss → запрос к backend, при успехе свежий ответ пишется в кеш и возвращается;
 * - backend недоступен + есть stale → stale БЕЗ ошибок (тихая деградация);
 * - backend недоступен + кеш пуст → null (виджет молчит, показ без фильтра).
 */
export async function loadTimelineFilterSettings(): Promise<ITimelineFilterSettingsResponse | null> {
  const api = getApi.value;
  if (!api) {
    return null;
  }

  const cached = readStfSettingsCache();
  if (cached && !cached.stale) {
    return cached.response;
  }

  try {
    const response = await stfDeduplicate(DEDUP_KEY, () => api.timelineFilterSettingsApi.get());
    writeStfSettingsCache(response);
    return response;
  } catch {
    if (cached) {
      return cached.response; // stale-while-revalidate: отдаём устаревшее тихо
    }
    return null;
  }
}

/**
 * Seam для Этапа 2b: PUT — полная замена funnels. При успехе нормализованный ответ
 * пишется в кеш (план §5.1). Ошибки не глотаем — модалка настроек показывает своё
 * состояние ошибки по тексту TimelineFilterSettingsError (паттерн useLastTouchSettings).
 */
export async function saveTimelineFilterSettings(payload: IFilterSettings): Promise<IFilterSettings> {
  const api = getApi.value;
  if (!api) {
    throw new TimelineFilterSettingsError('network', 'API виджета не инициализирован');
  }

  // Дедуп здесь намеренно НЕ применяется: последовательные PUT'ы с разными телами
  // обязаны выполниться каждый (в отличие от идемпотентного GET).
  const settings = await api.timelineFilterSettingsApi.save(payload);
  writeStfSettingsCache({ saved: true, settings });
  return settings;
}
