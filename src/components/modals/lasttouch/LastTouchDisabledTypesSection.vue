<script setup lang="ts">
import { computed } from 'vue';
import type { PropType } from 'vue';
import { TOGGLEABLE_TOUCH_TYPES } from 'constants/lastTouch';
// @ts-ignore
import UiSwitch from 'components/base/UiSwitch.vue';

const props = defineProps({
    modelValue: {
        type: Array as PropType<string[]>,
        required: true,
    },
});

const emit = defineEmits(['update:modelValue']);

const disabledSet = computed<Set<string>>(() => new Set(props.modelValue));

// switch включён, если тип НЕ в списке отключённых.
const isEnabled = (value: string): boolean => !disabledSet.value.has(value);

const getTypeLabel = (value: string): string => {
    const meta = TOGGLEABLE_TOUCH_TYPES.find(t => t.value === value);
    return meta?.labelRu ?? value;
};

// Новый массив строится в каноническом порядке TOGGLEABLE_TOUCH_TYPES — без дублей.
const handleToggle = (value: string) => (enabled: boolean): void => {
    const current = props.modelValue;
    const nextDisabled = TOGGLEABLE_TOUCH_TYPES.map(t => t.value).filter(v => {
        if (v === value) return !enabled;
        return current.includes(v);
    });
    emit('update:modelValue', nextDisabled);
};

// Единая сетка на все типы, flow «столбец за столбцом»: каждый столбец
// заполняется сверху вниз до конца и только затем начинается следующий.
const COLUMNS = 3;

const gridStyle = computed<Record<string, string>>(() => ({
    gridTemplateRows: `repeat(${Math.ceil(TOGGLEABLE_TOUCH_TYPES.length / COLUMNS)}, max-content)`,
}));
</script>

<template>
    <div :class="$style.card">
        <div :class="$style.title">ТИПЫ КАСАНИЙ</div>
        <div :class="$style.hint">Выключенный тип не считается касанием.</div>

        <div :class="$style.typeGrid" :style="gridStyle">
            <!-- label не используется: он дублирует клик по button-свитчеру в части браузеров -->
            <div
                v-for="type in TOGGLEABLE_TOUCH_TYPES"
                :key="type.value"
                :class="$style.typeRow"
                @click="handleToggle(type.value)(!isEnabled(type.value))"
            >
                <span :class="$style.typeName">{{ getTypeLabel(type.value) }}</span>
                <ui-switch
                    :model-value="isEnabled(type.value)"
                    @update:model-value="handleToggle(type.value)"
                />
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

.typeGrid {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: 6px 32px;
}

.typeRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 3px 4px;
    border-radius: 3px;
    cursor: pointer;
}

.typeRow:hover {
    background: #f5f7f9;
}

.typeName {
    font-size: 13px;
    color: #363b44;
}
</style>
