<script setup lang="ts">
import { computed } from 'vue';
import type { PropType } from 'vue';
import { ICallDurationMap } from 'interfaces/ILastTouchSettings';
import { CALL_STATUSES, ICallStatusMeta } from 'constants/lastTouch';
// @ts-ignore
import UiInput from 'components/base/UiInput.vue';

interface ILastTouchCallValue {
  statuses: number[];
  durations: ICallDurationMap;
}

const props = defineProps({
    modelValue: {
        type: Object as PropType<ILastTouchCallValue>,
        required: true,
    },
});

const emit = defineEmits(['update:modelValue']);

const statusLabel = (meta: ICallStatusMeta): string => meta.labelRu ?? `Статус ${meta.value}`;

const enabledStatuses = computed<ICallStatusMeta[]>(() =>
    CALL_STATUSES.filter(s => props.modelValue.statuses.includes(s.value)),
);

const durationFor = (statusId: number): string => {
    const value = props.modelValue.durations[statusId];
    return value === undefined ? '' : String(value);
};

const emitState = (nextStatuses: number[], nextDurations: ICallDurationMap): void => {
    emit('update:modelValue', { statuses: nextStatuses, durations: nextDurations });
};

// §9.4: при снятии статуса его ключ удаляется из durations.
const toggleStatus = (statusId: number): void => {
    const enabled = props.modelValue.statuses.includes(statusId);
    const nextStatuses = enabled
        ? props.modelValue.statuses.filter(id => id !== statusId)
        : [...props.modelValue.statuses, statusId];
    const nextDurations: ICallDurationMap = { ...props.modelValue.durations };
    if (enabled) delete nextDurations[statusId];
    emitState(nextStatuses, nextDurations);
};

const handleDurationInput = (statusId: number) => (raw: unknown): void => {
    const text = typeof raw === 'string' ? raw.trim() : '';
    const nextDurations: ICallDurationMap = { ...props.modelValue.durations };
    if (text !== '') {
        const parsed = Number(text);
        if (Number.isInteger(parsed) && parsed >= 0) {
            nextDurations[statusId] = parsed;
        } else {
            delete nextDurations[statusId];
        }
    } else {
        delete nextDurations[statusId];
    }
    emitState([...props.modelValue.statuses], nextDurations);
};
</script>

<template>
    <div :class="$style.card">
        <div :class="$style.title">ЗВОНКИ</div>
        <div :class="$style.hint">Пусто = все статусы звонков считаются касаниями.</div>

        <div :class="$style.chips">
            <span
                v-for="status in CALL_STATUSES"
                :key="status.value"
                :class="[
                    $style.chip,
                    { [$style.selected]: props.modelValue.statuses.includes(status.value) },
                ]"
                @click="toggleStatus(status.value)"
            >{{ statusLabel(status) }}</span>
        </div>

        <div v-if="enabledStatuses.length" :class="$style.durations">
            <div
                v-for="status in enabledStatuses"
                :key="status.value"
                :class="$style.durationRow"
            >
                <span :class="$style.statusName">{{ statusLabel(status) }}</span>
                <div :class="$style.fieldWrap">
                    <label :class="$style.fieldLabel">мин. длительность (сек)</label>
                    <ui-input
                        type="number"
                        min="0"
                        placeholder="без лимита"
                        :model-value="durationFor(status.value)"
                        @update:model-value="handleDurationInput(status.value)"
                    />
                </div>
            </div>
        </div>
    </div>
</template>

<style module lang="css">
.card {
    background: #fff;
    border: 1px solid #e8eaeb;
    border-radius: 4px;
    padding: 16px;
    box-sizing: border-box;
    width: 100%;
}

.title {
    font-size: 13px;
    font-weight: 600;
    color: #363b44;
    margin-bottom: 4px;
}

.hint {
    font-size: 12px;
    color: #9da5b0;
    line-height: 1.4;
    margin-bottom: 12px;
}

.chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.chip {
    padding: 4px 10px;
    border: 1px solid #e8eaeb;
    border-radius: 12px;
    cursor: pointer;
    font-size: 13px;
    color: #363b44;
    background: #fff;
    user-select: none;
}

.chip:hover {
    background: #f5f5f5;
}

.selected {
    background: #e6f7ff;
    border-color: #21a6d8;
}

.durations {
    margin-top: 16px;
}

.durationRow {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
    margin-top: 8px;
}

.statusName {
    width: 190px;
    flex-shrink: 0;
    font-size: 13px;
    color: #363b44;
}

.fieldWrap {
    flex: 1;
    min-width: 0;
    max-width: 280px;
}

.fieldLabel {
    display: block;
    font-size: 12px;
    color: #9da5b0;
    line-height: 1.4;
    margin-bottom: 4px;
}
</style>
