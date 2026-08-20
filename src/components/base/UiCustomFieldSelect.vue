<script setup lang="ts">
import { ref, computed, watch } from 'vue';
// @ts-ignore
import UiTooltip from 'components/base/UiTooltip.vue';

interface CustomFieldOption {
    value: number;
    label: string;
}

interface SelectedCustomField {
    field_id: number;
    allow_empty_transfer?: boolean;
}

const props = defineProps({
    modelValue: {
        type: Array as () => SelectedCustomField[],
        default: () => [],
    },
    options: {
        type: Array as () => CustomFieldOption[],
        default: () => [],
    },
    disabled: {
        type: Boolean,
        default: false,
    },
    disabledOptions: {
        type: Array as () => number[],
        default: () => [],
    },
});

const emit = defineEmits(['update:modelValue']);

const searchQuery = ref('');
const tooltipVisible = ref(false);
const tooltipTargetElement = ref<HTMLElement | null>(null);
const activeTooltipId = ref<number | null>(null);
let tooltipTimeout: ReturnType<typeof setTimeout> | null = null;

/** Множество ID выбранных полей для быстрого поиска */
const selectedIds = computed(() => new Set(props.modelValue.map(f => f.field_id)));

/** Множество ID отключенных полей для быстрого поиска */
const disabledIds = computed(() => new Set(props.disabledOptions));

/** Проверить, отключено ли поле */
const isDisabled = (fieldId: number): boolean => disabledIds.value.has(fieldId);

/** Отфильтрованные опции по поисковому запросу */
const filteredOptions = computed(() => {
    if (!searchQuery.value) return props.options;
    const query = searchQuery.value.toLowerCase();
    return props.options.filter(option =>
        String(option.label).toLowerCase().includes(query)
    );
});

/** Проверить, выбрано ли поле */
const isSelected = (fieldId: number): boolean => selectedIds.value.has(fieldId);

/** Получить объект выбранного поля по ID */
const getSelectedField = (fieldId: number): SelectedCustomField | undefined =>
    props.modelValue.find(f => f.field_id === fieldId);

/** Переключить выбор поля */
const toggleField = (fieldId: number) => {
    if (props.disabled) return;
    if (isDisabled(fieldId)) return; // Нельзя выбрать отключенное поле

    const existingIndex = props.modelValue.findIndex(f => f.field_id === fieldId);

    if (existingIndex >= 0) {
        // Удаляем поле из выбранных (новый массив без этого элемента)
        const currentValue = props.modelValue.filter((_, i) => i !== existingIndex);
        emit('update:modelValue', currentValue);
    } else {
        // Добавляем поле с флагом false по умолчанию (новый массив с добавленным элементом)
        const currentValue = [...props.modelValue, { field_id: fieldId, allow_empty_transfer: false }];
        emit('update:modelValue', currentValue);
    }
};

/** Переключить флаг разрешения переноса пустого значения */
const toggleAllowEmptyTransfer = (fieldId: number) => {
    if (props.disabled) return;

    const currentValue = props.modelValue.map(f =>
        f.field_id === fieldId
            ? { ...f, allow_empty_transfer: !(f.allow_empty_transfer ?? false) }
            : { ...f }
    );

    emit('update:modelValue', currentValue);
};

/** Показать tooltip */
const showTooltip = (event: MouseEvent, fieldId: number) => {
    if (tooltipTimeout) clearTimeout(tooltipTimeout);

    const target = event.currentTarget as HTMLElement;
    tooltipTargetElement.value = target;
    activeTooltipId.value = fieldId;

    // Быстрая задержка 100ms
    tooltipTimeout = setTimeout(() => {
        tooltipVisible.value = true;
    }, 100);
};

/** Скрыть tooltip */
const hideTooltip = () => {
    if (tooltipTimeout) clearTimeout(tooltipTimeout);
    tooltipVisible.value = false;
    tooltipTargetElement.value = null;
    activeTooltipId.value = null;
};

/** Выбрать все поля */
const selectAll = () => {
    if (props.disabled) return;

    // Сохраняем существующие флаги для уже выбранных полей
    const existingFlags = new Map(props.modelValue.map(f => [f.field_id, f.allow_empty_transfer]));

    // Выбираем только не отключенные поля
    const allFields = props.options
        .filter(opt => !isDisabled(opt.value))
        .map(opt => ({
            field_id: opt.value,
            allow_empty_transfer: existingFlags.get(opt.value) ?? false,
        }));

    emit('update:modelValue', allFields);
};

/** Убрать все поля */
const deselectAll = () => {
    if (props.disabled) return;
    emit('update:modelValue', []);
};

/** Очистить поиск */
const clearSearch = () => {
    searchQuery.value = '';
};

/** Выбраны ли все поля (исключая отключенные) */
const isAllSelected = computed(() => {
    if (!props.options.length) return false;
    const availableOptions = props.options.filter(opt => !isDisabled(opt.value));
    if (!availableOptions.length) return false;
    return availableOptions.every(opt => selectedIds.value.has(opt.value));
});

/** Не выбрано ни одного поля */
const isNoneSelected = computed(() => props.modelValue.length === 0);

// Синхронизация при изменении опций (удаление невалидных выбранных полей)
watch(
    () => props.options,
    (newOptions) => {
        const validIds = new Set(newOptions.map(o => o.value));
        const filtered = props.modelValue.filter(f => validIds.has(f.field_id));
        if (filtered.length !== props.modelValue.length) {
            emit('update:modelValue', filtered);
        }
    },
    { deep: true }
);

// Синхронизация при изменении отключенных опций (удаление выбранных отключенных полей)
watch(
    () => props.disabledOptions,
    (newDisabledOptions) => {
        if (!newDisabledOptions.length) return;
        const disabledIdsSet = new Set(newDisabledOptions);
        const filtered = props.modelValue.filter(f => !disabledIdsSet.has(f.field_id));
        if (filtered.length !== props.modelValue.length) {
            emit('update:modelValue', filtered);
        }
    },
    { deep: true }
);
</script>

<template>
    <div :class="[$style.container, { [$style.disabled]: disabled }]">
        <!-- Поиск -->
        <div :class="$style.searchContainer">
            <input
                type="text"
                v-model="searchQuery"
                :class="$style.searchInput"
                placeholder="Поиск..."
                :disabled="disabled"
            />
            <button
                v-if="searchQuery"
                :class="$style.clearButton"
                @click="clearSearch"
                :disabled="disabled"
            >
                ✕
            </button>
        </div>

        <!-- Кнопки действий -->
        <div :class="$style.actionsContainer">
            <div
                :class="[$style.actionBtn, { [$style.active]: isAllSelected }]"
                @click="selectAll"
            >
                <input
                    type="checkbox"
                    :checked="isAllSelected"
                    :disabled="disabled"
                    @click.stop="selectAll"
                />
                <span>Выбрать все</span>
            </div>
            <div
                :class="[$style.actionBtn, { [$style.active]: isNoneSelected }]"
                @click="deselectAll"
            >
                <input
                    type="checkbox"
                    :checked="isNoneSelected"
                    :disabled="disabled"
                    @click.stop="deselectAll"
                />
                <span>Убрать все</span>
            </div>
        </div>

        <div :class="$style.divider"></div>

        <!-- Список полей -->
        <div :class="$style.optionsContainer">
            <div
                v-for="option in filteredOptions"
                :key="option.value"
                :class="[$style.optionRow, { [$style.selected]: isSelected(option.value), [$style.disabled]: isDisabled(option.value) }]"
            >
                <!-- Основной чекбокс выбора поля -->
                <div
                    :class="$style.mainCheckbox"
                    @click="toggleField(option.value)"
                >
                    <input
                        type="checkbox"
                        :checked="isSelected(option.value)"
                        :disabled="disabled || isDisabled(option.value)"
                        @click.stop
                    />
                    <span :class="$style.optionLabel">{{ option.label }}</span>
                </div>

                <!-- Дополнительный чекбокс для выбранных полей (опасная опция) - в одну линию -->
                <div
                    v-if="isSelected(option.value)"
                    :class="$style.dangerOption"
                    @click.stop="toggleAllowEmptyTransfer(option.value)"
                >
                    <input
                        type="checkbox"
                        :checked="getSelectedField(option.value)?.allow_empty_transfer"
                        :disabled="disabled"
                    />
                    <span
                        :class="$style.dangerIcon"
                        @mouseenter="showTooltip($event, option.value)"
                        @mouseleave="hideTooltip"
                    >
                        ⚠️
                    </span>
                </div>
            </div>

            <div v-if="filteredOptions.length === 0" :class="$style.noResults">
                Нет совпадений
            </div>
        </div>

        <!-- Сводка выбранных полей - только количество -->
        <div v-if="modelValue.length > 0" :class="$style.summary">
            <div :class="$style.summaryTitle">Выбрано полей: {{ modelValue.length }}</div>
        </div>
    </div>

    <!-- Tooltip в body (не обрезается контейнерами) -->
    <UiTooltip
        :visible="tooltipVisible"
        :target-element="tooltipTargetElement"
        tooltip-text="Разрешить перенос пустого значения"
        warning-text="Может привести к обнулению данных"
        :offset="60"
    />
</template>

<style module lang="css">
.container {
    width: 100%;
    border: 1px solid #e8eaeb;
    background: white;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    max-height: 400px;
}

.container.disabled {
    background: whitesmoke;
    cursor: not-allowed;
}

/* Поиск */
.searchContainer {
    display: flex;
    padding: 8px;
    border-bottom: 1px solid #e8eaeb;
    gap: 4px;
}

.searchInput {
    flex: 1;
    border: 1px solid #e8eaeb;
    padding: 6px 8px;
    font-size: 13px;
    outline: none;
}

.searchInput:focus {
    border-color: #4a86c8;
}

.clearButton {
    background: #f5f5f5;
    border: 1px solid #e8eaeb;
    padding: 6px 10px;
    cursor: pointer;
    font-size: 11px;
}

.clearButton:hover:not(:disabled) {
    background: #e8e8e8;
}

.clearButton:disabled {
    cursor: not-allowed;
    opacity: 0.5;
}

/* Действия */
.actionsContainer {
    display: flex;
    border-bottom: 1px solid #e8eaeb;
    background: #f9f9f9;
}

.actionBtn {
    flex: 1;
    padding: 8px 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 500;
}

.actionBtn:first-child {
    border-right: 1px solid #e8eaeb;
}

.actionBtn:hover:not(.disabled) {
    background: #f0f0f0;
}

.actionBtn.active {
    background: #e6f7ff;
}

.divider {
    height: 1px;
    background: #e8eaeb;
}

/* Список опций - строки */
.optionsContainer {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
}

.optionRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid #f0f0f0;
    cursor: pointer;
    transition: background 0.15s;
    gap: 12px;
}

.optionRow:last-child {
    border-bottom: none;
}

.optionRow:hover {
    background: #f5f5f5;
}

.optionRow.selected {
    background: #e6f7ff;
}

.optionRow.selected:hover {
    background: #d9edff;
}

.optionRow.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: #f5f5f5;
}

.optionRow.disabled:hover {
    background: #f5f5f5;
}

.optionRow.disabled .optionLabel {
    color: #999;
}

.mainCheckbox {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
}

.optionLabel {
    font-size: 13px;
    color: #363b44;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* Опасная опция - в одну линию справа */
.dangerOption {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: #fffbeb;
    border: 1px solid #fcd34d;
    border-radius: 4px;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s;
}

.dangerOption:hover {
    background: #fef3c7;
}

.dangerIcon {
    font-size: 14px;
    cursor: help;
}

.noResults {
    padding: 16px;
    text-align: center;
    color: #999;
    font-size: 13px;
}

/* Сводка - только количество выбранных полей */
.summary {
    border-top: 1px solid #e8eaeb;
    background: #f9fafb;
    padding: 8px 12px;
}

.summaryTitle {
    font-size: 12px;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
}

/* Disabled состояние */
.container.disabled .optionRow {
    cursor: not-allowed;
    opacity: 0.6;
}

.container.disabled .dangerOption {
    cursor: not-allowed;
}
</style>
