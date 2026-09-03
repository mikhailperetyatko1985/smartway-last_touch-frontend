import { ref, computed } from 'vue';
import { useAmoCrmStore } from 'stores/useAmoCrmStore';
import { ICalculationInterval } from 'interfaces/ICalculationInterval';
import { LastTouchCalculationIntervalError } from 'drivers/backend/LastTouchCalculationIntervalApi';

const { getApi } = useAmoCrmStore();

export const MIN_INTERVAL_MINUTES = 5;
export const MAX_INTERVAL_MINUTES = 60;
export const INTERVAL_STEP_MINUTES = 5;

// Живое превью: зеркало формулы бэкенда (окно = ceil(интервал × 1.5))
const windowFromInterval = (minutes: number): number => Math.ceil(minutes * 1.5);

const clampToRange = (value: number): number => Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, value));

export function useLastTouchFrequency() {
  const initialIntervalMinutes = ref<number | null>(null);
  const intervalMinutes = ref<number | null>(null);
  // Окно из последнего ответа сервера (GET/PUT) — источник правды после сохранения
  const serverWindowMinutes = ref<number | null>(null);
  const isLoading = ref(false);
  const isSaving = ref(false);
  const apiError = ref<{ title: string; text: string } | null>(null);

  const isDirty = computed(
    () => intervalMinutes.value !== null
      && initialIntervalMinutes.value !== null
      && intervalMinutes.value !== initialIntervalMinutes.value,
  );

  const validationMessage = computed<string | null>(() => {
    const value = intervalMinutes.value;
    if (value === null) return 'Укажите интервал в минутах';
    if (!Number.isInteger(value)) return 'Только кратно 5 минут';
    if (value < MIN_INTERVAL_MINUTES || value > MAX_INTERVAL_MINUTES) {
      return `Допустимо от ${MIN_INTERVAL_MINUTES} до ${MAX_INTERVAL_MINUTES} минут`;
    }
    if (value % INTERVAL_STEP_MINUTES !== 0) return 'Только кратно 5 минут';
    return null;
  });

  const isValidInput = computed(() => validationMessage.value === null);

  // Живое превью окна: локальная формула для черновика, подтверждённое сервером — пока нет изменений
  const previewWindowMinutes = computed<number | null>(() => {
    const value = intervalMinutes.value;
    if (value === null || !Number.isFinite(value)) return null;
    if (!isDirty.value && serverWindowMinutes.value !== null) {
      return serverWindowMinutes.value;
    }
    return windowFromInterval(clampToRange(value));
  });

  const applyResponse = (response: ICalculationInterval): void => {
    initialIntervalMinutes.value = response.interval_minutes;
    intervalMinutes.value = response.interval_minutes;
    serverWindowMinutes.value = response.window_minutes;
  };

  const load = async (): Promise<void> => {
    const api = getApi.value;
    if (!api) {
      apiError.value = { title: 'Ошибка загрузки', text: 'Не удалось загрузить частоту сбора данных, попробуйте позже.' };
      return;
    }
    isLoading.value = true;
    apiError.value = null;
    try {
      applyResponse(await api.lastTouchCalculationIntervalApi.get());
    } catch {
      apiError.value = { title: 'Ошибка загрузки', text: 'Не удалось загрузить частоту сбора данных, попробуйте позже.' };
    } finally {
      isLoading.value = false;
    }
  };

  const save = async (): Promise<boolean> => {
    const api = getApi.value;
    if (!api) {
      apiError.value = { title: 'Не удалось сохранить частоту', text: 'Произошла непредвиденная ошибка, попробуйте позже.' };
      return false;
    }
    const value = intervalMinutes.value;
    if (value === null || !isValidInput.value) {
      return false;
    }
    isSaving.value = true;
    apiError.value = null;
    try {
      applyResponse(await api.lastTouchCalculationIntervalApi.save(value));
      return true;
    } catch (e) {
      if (e instanceof LastTouchCalculationIntervalError) {
        apiError.value = { title: 'Не удалось сохранить частоту', text: e.message };
      } else {
        apiError.value = { title: 'Не удалось сохранить частоту', text: 'Произошла непредвиденная ошибка, попробуйте позже.' };
      }
      return false;
    } finally {
      isSaving.value = false;
    }
  };

  // Кнопки +/−: текущее значение округляется к ближайшему кратному шага,
  // затем сдвиг ±5 с границами 5..60. Ручной ввод не трогаем — только валидация подсказкой.
  const stepInterval = (direction: 1 | -1): void => {
    if (isSaving.value) return;
    const current = intervalMinutes.value;
    const fallback = initialIntervalMinutes.value ?? MIN_INTERVAL_MINUTES;
    const baseRaw = typeof current === 'number' && Number.isFinite(current) ? current : fallback;
    const rounded = Math.round(baseRaw / INTERVAL_STEP_MINUTES) * INTERVAL_STEP_MINUTES;
    intervalMinutes.value = clampToRange(rounded + direction * INTERVAL_STEP_MINUTES);
  };

  const resetToBaseline = (): void => {
    intervalMinutes.value = initialIntervalMinutes.value;
    apiError.value = null;
  };

  const clearError = (): void => {
    apiError.value = null;
  };

  return {
    initialIntervalMinutes,
    intervalMinutes,
    serverWindowMinutes,
    previewWindowMinutes,
    validationMessage,
    isValidInput,
    isDirty,
    isLoading,
    isSaving,
    apiError,
    load,
    save,
    stepInterval,
    resetToBaseline,
    clearError,
  };
}
