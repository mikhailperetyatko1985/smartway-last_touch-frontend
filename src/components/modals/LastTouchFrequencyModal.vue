<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useLastTouchFrequency, MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES } from 'composables/useLastTouchFrequency';
// @ts-ignore
import UiModalContainer from 'components/base/UiModalContainer.vue';
// @ts-ignore
import UiButton from 'components/base/UiButton.vue';
// @ts-ignore
import UiText from 'components/base/UiText.vue';
// @ts-ignore
import UiFlexContainer from 'components/base/UiFlexContainer.vue';

const {
    intervalMinutes,
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
} = useLastTouchFrequency();

const emit = defineEmits(['apply', 'close']);

const presets: number[] = [5, 10, 15, 20, 30, 60];

// Сырой ввод числового поля: не калечим ручной ввод, синхронизируем по кликам +/-/пресетам
const rawValue = ref('');

watch(
    intervalMinutes,
    (value) => {
        const trimmed = rawValue.value.trim();
        if (trimmed !== '' && Number(trimmed) === value) return;
        rawValue.value = value === null ? '' : String(value);
    },
);

const onRawInput = (event: Event): void => {
    const target = event.target as HTMLInputElement;
    rawValue.value = target.value;
    const trimmed = target.value.trim();
    if (trimmed === '') {
        intervalMinutes.value = null;
        return;
    }
    const parsed = Number(trimmed);
    intervalMinutes.value = Number.isNaN(parsed) ? null : parsed;
};

const isPresetActive = (preset: number): boolean => intervalMinutes.value === preset;

const selectPreset = (preset: number): void => {
    if (isSaving.value) return;
    intervalMinutes.value = preset;
};

onMounted(load);

const saveDisabled = computed(() => isSaving.value || !isDirty.value || !isValidInput.value);

const onSave = async (): Promise<void> => {
    if (saveDisabled.value) return;
    const ok = await save();
    if (ok) emit('apply');
};

// Отмена — без сохранения: сбрасываем локальные несохранённые изменения.
const onCancel = (): void => {
    if (isSaving.value) return;
    resetToBaseline();
    emit('close');
};

// Закрытие (крестик/фон) блокируется во время сохранения.
const onClose = (): void => {
    if (isSaving.value) return;
    emit('close');
};
</script>
<template>
    <ui-modal-container @close="onClose">
        <ui-flex-container direction="col" row-gap="rg8">
            <ui-text text="Частота сбора данных" size="fs400" weight="fw600" />
            <ui-text text="Как часто запускается расчёт последнего касания" size="fs100" />
        </ui-flex-container>

        <!-- Прокручиваемая область: skeleton или баннер + секции -->
        <div :class="$style.scrollArea">
            <ui-flex-container v-if="isLoading" direction="col" row-gap="rg12">
                <div v-for="n in 3" :key="n" :class="$style.skeleton" />
            </ui-flex-container>

            <template v-else>
                <div v-if="apiError" :class="$style.banner">
                    <div :class="$style.bannerBody">
                        <div :class="$style.bannerTitle">{{ apiError?.title }}</div>
                        <div :class="$style.bannerText">{{ apiError?.text }}</div>
                    </div>
                    <span :class="$style.bannerClose" @click="clearError">✕</span>
                </div>

                <ui-flex-container direction="col" row-gap="rg12">
                    <div :class="$style.card">
                        <div :class="$style.cardTitle">БЫСТРЫЙ ВЫБОР</div>
                        <div :class="$style.presetsGroup" role="radiogroup" aria-label="Быстрый выбор интервала, минут">
                            <label
                                v-for="preset in presets"
                                :key="preset"
                                :class="[$style.preset, { [$style.presetSelected]: isPresetActive(preset) }]"
                            >
                                <input
                                    type="radio"
                                    name="last-touch-frequency-preset"
                                    :class="$style.presetRadio"
                                    :value="preset"
                                    :checked="isPresetActive(preset)"
                                    @change="selectPreset(preset)"
                                />
                                <span :class="$style.presetValue">{{ preset }}</span>
                                <span :class="$style.presetUnit">мин</span>
                            </label>
                        </div>
                    </div>

                    <div :class="$style.card">
                        <div :class="$style.cardTitle">СВОЙ ИНТЕРВАЛ</div>
                        <div :class="$style.stepperRow">
                            <div :class="[$style.stepper, { [$style.stepperInvalid]: validationMessage }]">
                                <button type="button" :class="$style.stepBtn" aria-label="Уменьшить интервал на 5 минут" @click="stepInterval(-1)">−</button>
                                <input
                                    :class="$style.numberInput"
                                    type="number"
                                    :min="MIN_INTERVAL_MINUTES"
                                    :max="MAX_INTERVAL_MINUTES"
                                    step="5"
                                    inputmode="numeric"
                                    autocomplete="off"
                                    aria-label="Интервал сбора в минутах"
                                    :value="rawValue"
                                    @input="onRawInput"
                                />
                                <button type="button" :class="$style.stepBtn" aria-label="Увеличить интервал на 5 минут" @click="stepInterval(1)">+</button>
                            </div>
                            <span :class="$style.unit">мин</span>
                        </div>
                        <div v-if="validationMessage" :class="$style.inlineHint">{{ validationMessage }}</div>
                    </div>

                    <div :class="$style.previewCard">
                        <div :class="$style.previewRow">
                            <span :class="$style.previewLabel">Окно сбора</span>
                            <span :class="$style.previewValue"><b>{{ previewWindowMinutes ?? '—' }}</b> мин</span>
                        </div>
                        <p :class="$style.previewHint">окно перекрывает интервал на 50% — пропущенный запуск покрывается соседними</p>
                    </div>

                    <div v-if="intervalMinutes === MIN_INTERVAL_MINUTES" :class="$style.warning">
                        Частые прогоны увеличивают нагрузку на amoCRM API
                    </div>
                </ui-flex-container>
            </template>
        </div>

        <!-- Футер с кнопками всегда виден поверх скролла -->
        <ui-flex-container v-if="!isLoading" justify-content="flex-end" gap="g8" :class="$style.footer">
            <ui-button label="Отмена" :disabled="isSaving" @click="onCancel" />
            <ui-button :label="isSaving ? 'Сохранение...' : 'Сохранить'" :disabled="saveDisabled" @click="onSave" />
        </ui-flex-container>
    </ui-modal-container>
</template>

<style module lang="css">
.scrollArea {
    overflow-y: auto;
    max-height: 65vh;
    min-height: 0;
    padding-right: 4px;
}

.skeleton {
    height: 56px;
    border-radius: 4px;
    background: linear-gradient(90deg, #ececec 25%, #f5f5f5 37%, #ececec 63%);
    background-size: 400% 100%;
    animation: skeletonPulse 1.4s ease infinite;
}

@keyframes skeletonPulse {
    0% {
        background-position: 100% 50%;
    }
    100% {
        background-position: 0 50%;
    }
}

.banner {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    background: #fff1f0;
    border: 1px solid #ffa39e;
    border-radius: 4px;
    padding: 10px 12px;
}

.bannerBody {
    flex: 1;
}

.bannerTitle {
    font-size: 13px;
    font-weight: 600;
    color: #ff3b30;
}

.bannerText {
    font-size: 13px;
    color: #b23b3b;
    line-height: 1.4;
}

.bannerClose {
    cursor: pointer;
    color: #b23b3b;
    font-size: 14px;
    line-height: 1;
    padding: 2px;
}

.card {
    background: #fff;
    border: 1px solid #e8eaeb;
    border-radius: 4px;
    padding: 16px;
    box-sizing: border-box;
    width: 100%;
}

.cardTitle {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: #363b44;
    margin-bottom: 12px;
}

.presetsGroup {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.preset {
    position: relative;
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    padding: 7px 14px;
    border: 1px solid #e8eaeb;
    border-radius: 999px;
    background: #fff;
    cursor: pointer;
    user-select: none;
    transition: border-color 120ms ease, background-color 120ms ease;
}

.preset:hover {
    border-color: #cfe3ee;
    background: #f0f9fd;
}

.presetSelected {
    border-color: #21a6d8;
    background: #e6f7ff;
}

.presetSelected .presetValue {
    color: #0b6fa3;
}

.preset:focus-within {
    outline: 2px solid #21a6d8;
    outline-offset: 2px;
}

.presetRadio {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
}

.presetValue {
    font-size: 14px;
    font-weight: 600;
    line-height: 1;
    color: #363b44;
}

.presetUnit {
    font-size: 12px;
    line-height: 1;
    color: #9da5b0;
}

.stepperRow {
    display: flex;
    align-items: center;
    gap: 8px;
}

.stepper {
    display: inline-flex;
    align-items: stretch;
    border: 1px solid #c5c5c5;
    border-radius: 4px;
    background: #fff;
    overflow: hidden;
    transition: border-color 120ms ease, box-shadow 120ms ease;
}

.stepper:focus-within {
    border-color: #21a6d8;
    box-shadow: 0 0 0 2px rgba(33, 166, 216, 0.2);
    outline: none;
}

.stepperInvalid {
    border-color: #ff3b30;
    background: #fff1f0;
}

.stepBtn {
    width: 40px;
    padding: 8px 0;
    font-size: 18px;
    font-weight: 600;
    line-height: 1;
    color: #363b44;
    background: #fafafa;
    border: none;
    cursor: pointer;
    user-select: none;
    transition: background-color 120ms ease;
}

.stepBtn:first-of-type {
    border-right: 1px solid #e0e0e0;
}

.stepBtn:last-of-type {
    border-left: 1px solid #e0e0e0;
}

.stepBtn:hover {
    background: #ececec;
}

.stepBtn:active {
    background: #e2e2e2;
}

.numberInput {
    width: 64px;
    box-sizing: border-box;
    padding: 8px 6px;
    font-size: 15px;
    font-weight: 600;
    text-align: center;
    color: #363b44;
    background: transparent;
    border: none;
    outline: none;
    -moz-appearance: textfield;
    appearance: textfield;
}

.numberInput::-webkit-outer-spin-button,
.numberInput::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
}

.unit {
    font-size: 14px;
    color: #9da5b0;
}

.inlineHint {
    margin-top: 8px;
    font-size: 12px;
    line-height: 1.4;
    color: #c22f2f;
}

.previewCard {
    background: #f0f9fd;
    border: 1px solid #cfe3ee;
    border-radius: 4px;
    padding: 12px 16px;
    box-sizing: border-box;
    width: 100%;
}

.previewRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.previewLabel {
    font-size: 13px;
    font-weight: 600;
    color: #363b44;
}

.previewValue {
    font-size: 16px;
    color: #363b44;
}

.previewHint {
    margin: 6px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: #9da5b0;
}

.warning {
    background: #fffbe6;
    border: 1px solid #ffe58f;
    border-radius: 4px;
    padding: 8px 12px;
    box-sizing: border-box;
    width: 100%;
    font-size: 12px;
    line-height: 1.4;
    color: #ad6800;
}

.footer {
    margin-top: 16px;
}
</style>
