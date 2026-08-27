<script setup lang="ts">
import { computed } from 'vue';
import type { PropType } from 'vue';
import { ICustomField } from 'interfaces/ICustomField';
import { CustomFieldsTypeEnum } from 'enums/CustomFieldsTypeEnum';
// @ts-ignore
import UiSearchableSelect from 'components/base/UiSearchableSelect.vue';

const props = defineProps({
    fields: {
        type: Array as PropType<ICustomField[]>,
        required: true,
    },
    modelValue: {
        type: Number as PropType<number | null>,
        default: null,
    },
});

const emit = defineEmits(['update:modelValue']);

// Показываем ТОЛЬКО поля типа text (хранят id менеджера — доп. ответственный).
const options = computed(() =>
    props.fields
        .filter(f => f.type === CustomFieldsTypeEnum.text)
        .map(f => ({ value: f.id, label: f.name })),
);

// Поле удалено/неизвестно — значение не трогаем, показываем warning-чип.
const isUnknownField = computed<boolean>(() => {
    const value = props.modelValue;
    if (value === null) return false;
    return !options.value.some(o => o.value === value);
});

const handleFieldChange = (value: number | string | null): void => {
    emit('update:modelValue', typeof value === 'number' ? value : null);
};
</script>

<template>
    <div :class="$style.card">
        <div :class="$style.title">ДОП. ОТВЕТСТВЕННЫЙ</div>
        <div :class="$style.hint">Поле типа «текст» с id менеджера. Если задано — подменяет базового ответственного сделки.</div>

        <div :class="$style.controls">
            <span v-if="isUnknownField" :class="$style.warningChip">Поле №{{ modelValue }}</span>

            <ui-searchable-select
                v-if="options.length"
                :model-value="modelValue"
                :options="options"
                :clearable="true"
                placeholder="Без подмены"
                @update:model-value="handleFieldChange"
            />

            <div v-else-if="!isUnknownField" :class="$style.emptyHint">Доступные поля типа «текст» не найдены.</div>
        </div>
    </div>
</template>

<style module lang="css">
.card {
    background: #fff;
    border: 1px solid #e8eaeb;
    border-radius: 4px;
    padding: 12px;
    box-sizing: border-box;
    width: 100%;
}

.title {
    font-size: 12px;
    font-weight: 600;
    color: #363b44;
    margin-bottom: 4px;
}

.hint {
    font-size: 12px;
    color: #9da5b0;
    line-height: 1.4;
    margin-bottom: 8px;
}

.controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.warningChip {
    align-self: flex-start;
    padding: 4px 10px;
    border: 1px solid #ffe58f;
    border-radius: 12px;
    background: #fffbe6;
    color: #ad6800;
    font-size: 13px;
}

.emptyHint {
    font-size: 13px;
    color: #9da5b0;
    padding: 4px 0;
}
</style>
