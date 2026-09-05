import { useAmoCrmStore } from 'stores/useAmoCrmStore';
import { ITargetUsersResponse } from 'interfaces/ITimelineTargetUsers';
import { TimelineTargetUsersError } from 'drivers/backend/TimelineTargetUsersApi';
import { readStfTargetUsersEntry, writeStfTargetUsersEntry, stfDeduplicate } from './cache';
import { pushStfDiagnostic } from './canary';

const dedupKey = (responsibleUserId: number) => `timeline-filter:target-users:${responsibleUserId}`;

const { getApi } = useAmoCrmStore();

/**
 * Seam для Этапа E (план §5.2): резолв целевых менеджеров по responsible_user_id
 * через SWR-кеш и in-flight дедуп (несколько открытий деталки = 1 запрос).
 * - свежая запись → отдача без запроса (< 50 мс с тёплым кешем);
 * - stale/miss → один round-trip к НАШЕМУ backend, при успехе ответ пишется в кеш;
 * - backend недоступен + есть stale → stale БЕЗ ошибок (тихая деградация);
 * - 409 not_synced / сеть без кеша → null: виджет молчит, подсказка — в модалке.
 */
export async function loadTargetUsers(responsibleUserId: number): Promise<ITargetUsersResponse | null> {
  const api = getApi.value;
  if (!api) {
    console.warn('[STF] target-users: API store not initialized — quiet');
    pushStfDiagnostic('target-users: API store not initialized → null (quiet)', null);
    return null;
  }

  const cached = readStfTargetUsersEntry(responsibleUserId);
  if (cached && !cached.stale) {
    return cached.data;
  }

  try {
    const data = await stfDeduplicate(dedupKey(responsibleUserId), () => api.timelineTargetUsersApi.get(
      responsibleUserId,
    ));
    writeStfTargetUsersEntry(responsibleUserId, data);
    return data;
  } catch (e) {
    if (cached) {
      // E-риск 3 (план §5.2): SWR-stale остаётся, но известная причина 409 not_synced
      // фиксируется diagnostic-записью (ring-buffer stf_diagnostics_v1, без UI и toast'ов).
      if (e instanceof TimelineTargetUsersError && e.code === 'not_synced') {
        pushStfDiagnostic(
          `target-users: 409 not_synced, served stale cache for responsible ${responsibleUserId}`,
          null,
        );
      }
      return cached.data; // stale-while-revalidate: отдаём устаревшее тихо
    }

    // Шаг 1: без кеша ошибка раньше глоталась полностью — теперь причина (409 not_synced / network) видна.
    const detail = e instanceof TimelineTargetUsersError ? `${e.code}: ${e.message}` : String(e);
    console.warn(`[STF] target-users: load failed for responsible ${responsibleUserId} (${detail}), no cache → null`);
    pushStfDiagnostic(`target-users: load failed for responsible ${responsibleUserId} (${detail}), no cache`, null);
    return null;
  }
}
