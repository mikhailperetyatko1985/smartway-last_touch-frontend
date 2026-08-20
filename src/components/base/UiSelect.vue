<script setup lang="ts">
import { ref, watch, computed } from 'vue';

const props = defineProps({
    modelValue: {
        required: true,
    },
    isMultiselect: {
        type: Boolean,
        default: false,
    },
    options: {
        type: Array<{value: number|string, label: string}>,
        default: () => [],
    },
    disabled: {
        type: Boolean,
        default: false,
    },
    useArrayForValues: {
        type: Boolean,
        default: false,
    },
    withActions: {
        type: Boolean,
        default: false,
    },
    withSearch: {
        type: Boolean,
        default: false,
    },
});

const emit = defineEmits(['update:modelValue']);
const currentValue = ref<any | any[]>(props.modelValue);
const searchQuery = ref('');

watch(
    () => props.modelValue,
    () => currentValue.value = props.modelValue,
);

watch(
    () => props.options,
    (newOptions) => {
        if (props.isMultiselect) {
            if (Array.isArray(currentValue.value) && currentValue.value.length > 0) {
                const valid = currentValue.value.filter((v: any) => newOptions.some(o => o.value === v));
                if (valid.length !== currentValue.value.length) {
                    currentValue.value = valid;
                    emit('update:modelValue', valid);
                }
            }
        } else {
            if (currentValue.value !== null && currentValue.value !== '' &&
                !newOptions.some(o => o.value === currentValue.value)) {
                currentValue.value = null;
                emit('update:modelValue', null);
            }
        }
    },
);

const isSelected = (value: string | number) => {
    return Array.isArray(currentValue.value) && currentValue.value.includes(value);
};

const toggleMultiOption = (value: string | number) => {
    if (props.disabled) return;

    const newValues = Array.isArray(currentValue.value) ? [...currentValue.value] : [];
    const index = newValues.indexOf(value);

    if (index === -1) {
        newValues.push(value);
    } else {
        newValues.splice(index, 1);
    }

    currentValue.value = newValues;
    emit('update:modelValue', newValues);
};

const filteredOptions = computed(() => {
    if (!searchQuery.value) return props.options;

    const query = searchQuery.value.toLowerCase();
    return props.options.filter(option =>
        String(option.label).toLowerCase().includes(query)
    );
});

const allOptionsValues = computed(() => props.options.map(option => option.value));

const isAllSelected = computed(() => {
    if (!Array.isArray(currentValue.value) || !props.options.length) return false;
    return props.options.every(option => currentValue.value.includes(option.value));
});

const isNoneSelected = computed(() => {
    if (!Array.isArray(currentValue.value)) return true;
    return currentValue.value.length === 0;
});

const selectAll = () => {
    if (props.disabled) return;

    const allValues = allOptionsValues.value;
    currentValue.value = [...allValues];
    emit('update:modelValue', currentValue.value);
};

const deselectAll = () => {
    if (props.disabled) return;

    currentValue.value = [];
    emit('update:modelValue', currentValue.value);
};

const clearSearch = () => {
    searchQuery.value = '';
};
</script>
<template>
    <!-- Single select mode -->
    <select
        v-if="!isMultiselect"
        v-model="currentValue"
        :class="[$style.select, { [$style.disabled]: disabled }]"
        :disabled="disabled"
        @change="emit('update:modelValue', useArrayForValues ? [currentValue] : currentValue)"
    >
        <option disabled value="">Выберите</option>
        <option
            v-for="option in options"
            :key="option.value"
            :value="option.value"
        >
            {{ option.label }}
        </option>
    </select>

    <!-- Multi select mode -->
    <div
        v-else
        :class="[$style.multipleSelect, { [$style.disabled]: disabled }]"
    >
        <template v-if="withSearch">
            <!-- Search input -->
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
        </template>

        <template v-if="withActions">
            <!-- Select All / Deselect All options -->
            <div :class="$style.multiSelectActions">
                <div
                    :class="[$style.multiSelectAction, { [$style.active]: isAllSelected }]"
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
                    :class="[$style.multiSelectAction, { [$style.active]: isNoneSelected }]"
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
        </template>

        <div :class="$style.optionsContainer">
            <div
                v-for="option in filteredOptions"
                :key="option.value"
                :class="[$style.multiOption, { [$style.selected]: isSelected(option.value) }]"
                @click="toggleMultiOption(option.value)"
            >
                <input
                    type="checkbox"
                    :checked="isSelected(option.value)"
                    :disabled="disabled"
                    @click.stop
                />
                <span>{{ option.label }}</span>
            </div>

            <div v-if="filteredOptions.length === 0" :class="$style.noResults">
                Нет совпадений
            </div>
        </div>
    </div>
</template>
<style module lang="css">
.select {
    width: 100%;
    border: 1px solid #e8eaeb;
    background-color: white;
    color: darkslategray;
    box-sizing: border-box;
}

.multipleSelect {
    width: 100%;
    min-height: 100px;
    max-height: 300px;
    border: 1px solid #e8eaeb;
    color: darkslategray;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
}

.optionsContainer {
    flex: 1;
    overflow-y: auto;
    width: 100%;
}

.multiOption {
    padding: 5px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    box-sizing: border-box;
}

.multiOption:hover {
    background-color: #f5f5f5;
}

.selected {
    background-color: #e6f7ff;
}

.disabled {
    background-color: whitesmoke;
    color: gray;
    cursor: not-allowed;
}

.disabled .multiOption {
    cursor: not-allowed;
}

.multiSelectActions {
    display: flex;
    border-bottom: 1px solid #e8eaeb;
    background-color: #f9f9f9;
    width: 100%;
    box-sizing: border-box;
}

.multiSelectAction {
    flex: 1;
    padding: 8px 5px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: bold;
}

.multiSelectAction:first-child {
    border-right: 1px solid #e8eaeb;
}

.multiSelectAction:hover {
    background-color: #f0f0f0;
}

.multiSelectAction.active {
    background-color: #e6f7ff;
}

.divider {
    height: 1px;
    background-color: #e8eaeb;
    width: 100%;
}

.searchContainer {
    position: relative;
    padding: 8px;
    border-bottom: 1px solid #e8eaeb;
    width: 100%;
    box-sizing: border-box;
}

.searchInput {
    width: 100%;
    padding: 6px 30px 6px 8px;
    border: 1px solid #e8eaeb;
    border-radius: 4px;
    font-size: 14px;
    box-sizing: border-box;
}

.searchInput:disabled {
    background-color: whitesmoke;
    cursor: not-allowed;
}

.clearButton {
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    cursor: pointer;
    color: #999;
    font-size: 14px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
}

.clearButton:hover {
    color: #666;
}

.clearButton:disabled {
    color: #ccc;
    cursor: not-allowed;
}

.noResults {
    padding: 10px;
    text-align: center;
    color: #999;
    font-style: italic;
    width: 100%;
    box-sizing: border-box;
}
</style>