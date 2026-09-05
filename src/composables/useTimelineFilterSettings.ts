import { computed, onBeforeUnmount, ref, shallowRef } from 'vue';
import { useAmoCrmStore } from 'stores/useAmoCrmStore';
import type { ICustomField } from 'interfaces/ICustomField';
import type { IFunnelFilterSettings } from 'interfaces/ITimelineFilterSettings';
import type { IPipeline } from 'interfaces/IPipeline';
import type { ISyncStatus } from 'interfaces/ITimelineTargetUsers';
import { CustomFieldsTypeEnum } from 'enums/CustomFieldsTypeEnum';
import { TimelineFilterSettingsError } from 'drivers/backend/TimelineFilterSettingsApi';
import { TimelineTargetUsersError } from 'drivers/backend/TimelineTargetUsersApi';
// относительный импорт: в webpack resolve алиасы только на конкретные директории (src не входит),
// а tsconfig baseUrl=src разрешает и тот, и другой вариант — относительный общий для обоих
import {
  loadTimelineFilterSettings,
  saveTimelineFilterSettings,
  resetStfTargetUsersCache,
} from '../timelineFilter';

// Цикл синхронизации (план §4.4): polling каждые 2.5 с, потолок ~2 мин
const SYNC_POLL_INTERVAL_MS = 2500;
const SYNC_POLL_TIMEOUT_MS = 120000;

const cloneFunnel = (f: IFunnelFilterSettings): IFunnelFilterSettings => ({
  pipeline_id: Number(f.pipeline_id) || 0,
  status_ids: [...(Array.isArray(f.status_ids) ? f.status_ids : [])],
  mode: f.mode ?? 'base',
  custom_field_id: typeof f.custom_field_id === 'number' && f.custom_field_id > 0
    ? f.custom_field_id
    : null,
  hide_system: !!f.hide_system,
  hide_pinned_no_target: !!f.hide_pinned_no_target,
  hide_no_author: !!f.hide_no_author,
});

// Ответ backend может приходить с недостающими/протухшими значениями — приводим к полному канону.
const normalizeFunnels = (raw: IFunnelFilterSettings[] | null): IFunnelFilterSettings[] => {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map(cloneFunnel)
    // дубли pipeline_id структурно невозможны (backend отклоняет), guard на случай сломанного ответа
    .filter((f, i, arr) => !arr.slice(0, i).some(o => o.pipeline_id === f.pipeline_id));
};

// Ключи errors backend: 'funnels.N.*' → конкретная карточка, остальное — глобальный текст
const parseFieldErrors = (errors?: Record<string, string[]>): {
  cards: Record<number, string>;
  globalText: string | null;
} => {
  const cards: Record<number, string> = {};
  const rest: string[] = [];
  for (const [key, messages] of Object.entries(errors ?? {})) {
    const text = messages?.[0];
    if (!text) continue;
    const match = /^funnels\.(\d+)\./.exec(key);
    if (match) {
      const idx = Number(match[1]);
      cards[idx] = cards[idx] ? `${cards[idx]} ${text}` : text;
    } else {
      rest.push(text);
    }
  }
  return { cards, globalText: rest.length > 0 ? Array.from(new Set(rest)).join(' ') : null };
};

export function useTimelineFilterSettings() {
  const { getApi, getWidget, showError } = useAmoCrmStore();

  // --- форма (черновик в JSON-форме API) ---
  const funnels = ref<IFunnelFilterSettings[]>([]);
  let baseline: IFunnelFilterSettings[] = [];
  const isLoading = ref(false);
  const isSaving = ref(false);
  const apiError = ref<{ title: string; text: string } | null>(null);
  // 422 по полям: индекс карточки → текст ошибки (парсинг 'funnels.N.*')
  const cardErrors = ref<Record<number, string>>({});
  // 403 на PUT — сохранение недоступно вообще
  const isForbidden = ref(false);
  // null = неизвестно (запрос прав ещё не пришёл/упал)
  const isAdmin = ref<boolean | null>(null);

  const pipelines = shallowRef<IPipeline[]>([]);
  const customFields = shallowRef<ICustomField[]>([]);

  // --- синхронизация «группы → пользователи» (план §4.4) ---
  const syncStatus = ref<ISyncStatus | null>(null);
  const isSyncBusy = ref(false);
  let syncPollTimer: number | null = null;
  let syncTickInFlight = false;

  // --- производные ---
  const usedPipelineIds = computed(() => new Set(funnels.value.map(f => Number(f.pipeline_id))));

  // pipeline-селектор карточки: только ещё НЕ добавленные воронки + своя текущая
  const getOptionsForFunnel = (index: number): { value: number; label: string }[] => {
    const currentId = Number(funnels.value[index]?.pipeline_id);
    return pipelines.value
      .filter(p => Number(p.id) === currentId || !usedPipelineIds.value.has(Number(p.id)))
      .map(p => ({ value: Number(p.id), label: p.name }));
  };

  const canAddFunnel = computed<boolean>(() =>
    pipelines.value.some(p => !usedPipelineIds.value.has(Number(p.id))),
  );

  // custom-поле: только text/numeric (хранят user_id доп. ответственного)
  const responsibleFieldOptions = computed<{ value: number; label: string }[]>(() =>
    customFields.value
      .filter(f => f.type === CustomFieldsTypeEnum.text || f.type === CustomFieldsTypeEnum.numeric)
      .map(f => ({ value: Number(f.id), label: f.name })),
  );

  const isRemoteSyncActive = computed<boolean>(
    () => syncStatus.value?.state === 'queued' || syncStatus.value?.state === 'running',
  );

  // «без синхронизации виджет не фильтрует» — покажем подсказку, если сина никогда не было
  const needsSyncHint = computed<boolean>(
    () => !syncStatus.value || !syncStatus.value.last_synced_at || syncStatus.value.state === 'idle',
  );

  const lastSyncedAtLabel = computed<string>(() => {
    const iso = syncStatus.value?.last_synced_at;
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  });

  const isDirty = computed<boolean>(
    () => JSON.stringify(funnels.value) !== JSON.stringify(baseline),
  );

  // --- уведомления (amoCRM, тот же канал, что в драйверах проекта) ---
  const notifySuccess = (text: string): void => {
    getWidget.value?.app.notifications.show_message({ header: 'Успешно', text, date: Date.now(), icon: '' });
  };

  // --- загрузка справочников и прав ---
  const loadPipelines = async (): Promise<void> => {
    const api = getApi.value;
    if (!api) return;
    try {
      pipelines.value = await api.pipelineApi.list();
    } catch {
      // драйвер сам показывает amo-уведомление и возвращает [] — не роняем load()
    }
  };

  const loadCustomFields = async (): Promise<void> => {
    if (customFields.value.length > 0) return; // кеш в драйвере (amo_api_cache, TTL 15 с)
    const api = getApi.value;
    if (!api) return;
    try {
      customFields.value = await api.pipelineApi.leadsCustomFields();
    } catch {
      // оставляем пустым — не роняем load(), кеш держится в драйвере
    }
  };

  const loadAdminStatus = async (): Promise<void> => {
    const api = getApi.value;
    if (!api) return;
    try {
      isAdmin.value = (await api.privilegesApi.list()).is_user_admin;
    } catch {
      // права не получены — оставляем null («неизвестно»): секция покажет причину отсутствия кнопки,
      // admin-only контролы при этом консервативно скрыты (isAdmin === true не выполнится)
    }
  };

  const fetchSyncStatus = async (): Promise<void> => {
    const api = getApi.value;
    if (!api) return;
    try {
      syncStatus.value = await api.timelineTargetUsersApi.syncStatus();
    } catch {
      // статус опциональная информация — тихо (баннер-подсказка отработает по needsSyncHint)
    }
  };

  // --- загрузка настроек (seam loadTimelineFilterSettings: SWR + тихая деградация) ---
  const load = async (): Promise<void> => {
    const api = getApi.value;
    isLoading.value = true;
    apiError.value = null;
    cardErrors.value = {};
    // параллельно с GET настроек — справочники, права и статус сина (все без бросания в load)
    void Promise.all([loadPipelines(), loadCustomFields(), loadAdminStatus(), fetchSyncStatus()]);
    try {
      if (!api) {
        throw new Error('API виджета не инициализирован');
      }
      const response = await loadTimelineFilterSettings();
      if (!response) {
        apiError.value = { title: 'Ошибка загрузки', text: 'Не удалось загрузить настройки фильтра timeline, попробуйте позже.' };
        return;
      }
      funnels.value = normalizeFunnels(response.settings?.funnels ?? null);
      baseline = funnels.value.map(cloneFunnel);
    } catch {
      apiError.value = { title: 'Ошибка загрузки', text: 'Не удалось загрузить настройки фильтра timeline, попробуйте позже.' };
    } finally {
      isLoading.value = false;
    }
  };

  // --- мутации черновика (иммутабельно) ---
  const patchFunnel = (index: number, patch: Partial<IFunnelFilterSettings>): void => {
    funnels.value = funnels.value.map((f, i) => (i === index ? { ...cloneFunnel(f), ...patch } : cloneFunnel(f)));
  };

  const addFunnel = (): void => {
    if (!canAddFunnel.value) return;
    // дефолты новой карточки: фильтр включён по базовому ответственному, все три hide-флага вкл.
    // (цель виджета — скрывать нерелевантные события; всё можно выключить на карточке)
    const free = pipelines.value.find(p => !usedPipelineIds.value.has(Number(p.id)));
    if (!free) return;
    funnels.value = [
      ...funnels.value,
      {
        pipeline_id: Number(free.id),
        status_ids: [],
        mode: 'base',
        custom_field_id: null,
        hide_system: true,
        hide_pinned_no_target: true,
        hide_no_author: true,
      },
    ];
  };

  const removeFunnel = (index: number): void => {
    funnels.value = funnels.value.filter((_, i) => i !== index);
  };

  const setPipeline = (index: number, pipelineId: number | null): void => {
    if (pipelineId === null || Number.isNaN(Number(pipelineId))) {
      removeFunnel(index); // снятие воронки из селектора = удаление карточки (паттерн last-touch)
      return;
    }
    patchFunnel(index, { pipeline_id: Number(pipelineId), status_ids: [] });
  };

  const toggleStatus = (index: number, statusId: number): void => {
    const row = funnels.value[index];
    if (!row) return;
    const id = Number(statusId);
    patchFunnel(index, {
      status_ids: row.status_ids.includes(id)
        ? row.status_ids.filter(s => s !== id)
        : [...row.status_ids, id],
    });
  };

  const setStatusesAll = (index: number, selectAll: boolean): void => {
    const row = funnels.value[index];
    if (!row) return;
    const pipeline = pipelines.value.find(p => Number(p.id) === Number(row.pipeline_id));
    const knownIds = pipeline ? pipeline.statuses.map(s => Number(s.id)) : [];
    // «выбрать все» — только стадии этой воронки (чужие id не трогаем, как в last-touch)
    patchFunnel(index, { status_ids: selectAll ? [...knownIds] : [] });
  };

  const setMode = (index: number, mode: IFunnelFilterSettings['mode']): void => {
    // при уходе с custom поле не сбрасываем — backend сам нормализует его в null
    patchFunnel(index, { mode });
  };

  const setCustomField = (index: number, fieldId: number | null): void => {
    patchFunnel(index, {
      custom_field_id: typeof fieldId === 'number' && fieldId > 0 ? fieldId : null,
    });
  };

  type HideFlagKey = 'hide_system' | 'hide_pinned_no_target' | 'hide_no_author';

  const setHideFlag = (index: number, key: HideFlagKey, value: boolean): void => {
    patchFunnel(index, { [key]: !!value });
  };

  // --- фронт-валидация перед PUT ---
  const validateForSave = (): { ok: boolean; cards: Record<number, string>; globalText: string | null } => {
    const cards: Record<number, string> = {};
    let globalText: string | null = null;

    // guard на дубли pipeline_id (структурно невозможны — селектор по не добавленным)
    const seen = new Set<number>();
    funnels.value.forEach((f, i) => {
      if (seen.has(Number(f.pipeline_id))) {
        cards[i] = `Воронка «${f.pipeline_id}» уже добавлена`;
      }
      seen.add(Number(f.pipeline_id));
    });

    funnels.value.forEach((f, i) => {
      if (f.status_ids.length === 0) {
        cards[i] = cards[i] ? `${cards[i]} Выберите хотя бы одну стадию.` : 'Выберите хотя бы одну стадию.';
      }
      if (f.mode === 'custom' && !f.custom_field_id) {
        cards[i] = cards[i]
          ? `${cards[i]} Для режима «Кастомное поле» выберите поле с user_id.`
          : 'Для режима «Кастомное поле» выберите поле с user_id.';
      }
    });

    return { ok: Object.keys(cards).length === 0 && !globalText, cards, globalText };
  };

  // --- сохранение (PUT — полная замена; кеш обновляется внутри seam saveTimelineFilterSettings) ---
  const save = async (): Promise<boolean> => {
    if (!getApi.value || isSaving.value) return false;
    const validation = validateForSave();
    cardErrors.value = validation.cards;
    apiError.value = validation.globalText
      ? { title: 'Не удалось сохранить настройки', text: validation.globalText }
      : null;
    if (!validation.ok) return false;

    isSaving.value = true;
    apiError.value = null;
    cardErrors.value = {};
    try {
      const saved = await saveTimelineFilterSettings({ funnels: funnels.value.length > 0 ? funnels.value : null });
      funnels.value = normalizeFunnels(saved?.funnels ?? null);
      baseline = funnels.value.map(cloneFunnel);
      notifySuccess('Настройки фильтра timeline сохранены');
      return true;
    } catch (e) {
      if (e instanceof TimelineFilterSettingsError) {
        if (e.code === '403') {
          isForbidden.value = true;
          isAdmin.value = false;
          apiError.value = { title: 'Нет доступа', text: e.message };
        } else if (e.code === '422') {
          const parsed = parseFieldErrors(e.fieldErrors);
          cardErrors.value = parsed.cards;
          apiError.value = {
            title: 'Не удалось сохранить настройки',
            text: parsed.globalText ?? e.message,
          };
        } else {
          apiError.value = { title: 'Не удалось сохранить настройки', text: e.message };
        }
      } else {
        apiError.value = { title: 'Не удалось сохранить настройки', text: 'Произошла непредвиденная ошибка, попробуйте позже.' };
      }
      return false;
    } finally {
      isSaving.value = false;
    }
  };

  const resetToBaseline = (): void => {
    funnels.value = baseline.map(cloneFunnel);
    apiError.value = null;
    cardErrors.value = {};
  };

  const clearError = (): void => {
    apiError.value = null;
  };

  // --- цикл синхронизации (план §4.4): startSync → polling syncStatus → терминал/таймаут ---
  const stopSyncPolling = (): void => {
    if (syncPollTimer !== null) {
      window.clearInterval(syncPollTimer);
      syncPollTimer = null;
    }
    syncTickInFlight = false;
  };

  onBeforeUnmount(stopSyncPolling);

  const startSyncCycle = async (): Promise<void> => {
    const api = getApi.value;
    if (!api || isSyncBusy.value) return;
    isSyncBusy.value = true;
    const startedAt = Date.now();

    try {
      await api.timelineTargetUsersApi.startSync();
      // оптимистичное состояние до первого тика polling (~2.5 с): last_synced_at/error сохраняем
      syncStatus.value = {
        ...(syncStatus.value ?? { state: 'idle', last_synced_at: null, error: null }),
        state: 'queued',
      };
    } catch (e) {
      if (e instanceof TimelineTargetUsersError && e.code === 'already_running') {
        // синк уже выполняется — без ошибки, сразу в polling отслеживания
      } else {
        showError(e instanceof Error ? e.message : 'Не удалось запустить синхронизацию сотрудников и групп');
        isSyncBusy.value = false;
        return;
      }
    }

    const tick = async (): Promise<void> => {
      if (syncTickInFlight) return; // предыдущий запрос ещё не вернулся — не дёргаем параллельно
      syncTickInFlight = true;
      try {
        if (Date.now() - startedAt >= SYNC_POLL_TIMEOUT_MS) {
          stopSyncPolling();
          isSyncBusy.value = false;
          showError('Не дождались статуса синхронизации — попробуйте повторить позже');
          return;
        }
        const status = await api.timelineTargetUsersApi.syncStatus();
        // цикл уже завершён (unmount/терминал) во время запроса — результат не применяем
        if (syncPollTimer === null && !isSyncBusy.value) {
          return;
        }
        syncStatus.value = status;
        if (status.state === 'success') {
          stopSyncPolling();
          isSyncBusy.value = false;
          resetStfTargetUsersCache(); // локальный сброс stf_target_users_v1 (план §4.4, шаг 3)
          notifySuccess('Синхронизация сотрудников и групп завершена');
        } else if (status.state === 'failed') {
          stopSyncPolling();
          isSyncBusy.value = false;
          showError(status.error || 'Синхронизация завершилась с ошибкой');
        }
        // queued|running — продолжаем polling до терминального состояния или потолка ~2 мин
      } catch {
        // сетевой срыв на одном тике — ждём следующего (потолок всё равно остановит цикл)
      } finally {
        syncTickInFlight = false;
      }
    };

    syncPollTimer = window.setInterval(() => { void tick(); }, SYNC_POLL_INTERVAL_MS);
  };

  return {
    funnels,
    pipelines,
    responsibleFieldOptions,
    isLoading,
    isSaving,
    apiError,
    cardErrors,
    isForbidden,
    isAdmin,
    canAddFunnel,
    isDirty,
    syncStatus,
    isSyncBusy,
    isRemoteSyncActive,
    needsSyncHint,
    lastSyncedAtLabel,
    load,
    save,
    resetToBaseline,
    clearError,
    addFunnel,
    removeFunnel,
    setPipeline,
    toggleStatus,
    setStatusesAll,
    setMode,
    setCustomField,
    setHideFlag,
    getOptionsForFunnel,
    startSyncCycle,
  };
}

export type HideFlagKey = 'hide_system' | 'hide_pinned_no_target' | 'hide_no_author';
