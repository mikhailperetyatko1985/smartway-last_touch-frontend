import { ref, shallowRef, computed } from 'vue';
import { useAmoCrmStore } from 'stores/useAmoCrmStore';
import { ILastTouchFormState } from 'interfaces/ILastTouchSettings';
import { IPipeline } from 'interfaces/IPipeline';
import { ICustomField } from 'interfaces/ICustomField';
import { fromApiResponse, toApiPayload, isFormDirty } from 'helpers/lastTouchSettingsMapper';
import { LastTouchSettingsError } from 'drivers/backend/LastTouchSettingsApi';

const { getApi } = useAmoCrmStore();

const emptyForm = (): ILastTouchFormState => ({
  funnels: [],
  customFieldId: null,
});

const cloneForm = (f: ILastTouchFormState): ILastTouchFormState => ({
  funnels: f.funnels.map((entry) => ({
    pipelineId: entry.pipelineId,
    statusIds: [...entry.statusIds],
    callStatuses: [...entry.callStatuses],
    minCallDurations: { ...entry.minCallDurations },
    disabledTouchTypes: [...entry.disabledTouchTypes],
    responsibleCustomFieldId: entry.responsibleCustomFieldId,
  })),
  customFieldId: f.customFieldId,
});

export function useLastTouchSettings() {
  const form = ref<ILastTouchFormState>(emptyForm());
  let baseline: ILastTouchFormState = emptyForm();
  const isLoading = ref(false);
  const isSaving = ref(false);
  const apiError = ref<{ title: string; text: string } | null>(null);
  const pipelines = shallowRef<IPipeline[]>([]);
  const customFields = shallowRef<ICustomField[]>([]);
  const isDirty = computed(() => isFormDirty(form.value, baseline));

  const loadCustomFields = async (): Promise<void> => {
    if (customFields.value.length > 0) {
      return;
    }
    const api = getApi.value;
    if (!api) {
      return;
    }
    try {
      customFields.value = await api.pipelineApi.leadsCustomFields();
    } catch {
      // оставляем пустым — не роняем вызывающий load, кеш держится в драйвере
    }
  };

  const load = async (): Promise<void> => {
    const api = getApi.value;
    if (!api) {
      apiError.value = { title: 'Ошибка загрузки', text: 'Не удалось загрузить настройки последнего касания, попробуйте позже.' };
      return;
    }
    isLoading.value = true;
    apiError.value = null;
    try {
      const [response, pipelineList] = await Promise.all([
        api.lastTouchSettingsApi.get(),
        api.pipelineApi.list(),
      ]);
      form.value = fromApiResponse(response.settings);
      baseline = cloneForm(form.value);
      pipelines.value = pipelineList;
      await loadCustomFields();
    } catch {
      apiError.value = { title: 'Ошибка загрузки', text: 'Не удалось загрузить настройки последнего касания, попробуйте позже.' };
    } finally {
      isLoading.value = false;
    }
  };

  const save = async (): Promise<boolean> => {
    const api = getApi.value;
    if (!api) {
      apiError.value = { title: 'Не удалось сохранить настройки', text: 'Произошла непредвиденная ошибка, попробуйте позже.' };
      return false;
    }
    const payload = toApiPayload(form.value);
    isSaving.value = true;
    apiError.value = null;
    try {
      const saved = await api.lastTouchSettingsApi.save(payload);
      form.value = fromApiResponse(saved);
      baseline = cloneForm(form.value);
      return true;
    } catch (e) {
      if (e instanceof LastTouchSettingsError) {
        apiError.value = { title: 'Не удалось сохранить настройки', text: e.message };
      } else {
        apiError.value = { title: 'Не удалось сохранить настройки', text: 'Произошла непредвиденная ошибка, попробуйте позже.' };
      }
      return false;
    } finally {
      isSaving.value = false;
    }
  };

  const resetToBaseline = (): void => {
    form.value = cloneForm(baseline);
    apiError.value = null;
  };

  const clearError = (): void => {
    apiError.value = null;
  };

  return {
    form,
    pipelines,
    customFields,
    isLoading,
    isSaving,
    apiError,
    isDirty,
    load,
    save,
    resetToBaseline,
    loadCustomFields,
    clearError,
  };
}
