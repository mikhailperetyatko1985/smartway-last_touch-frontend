<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps({
    modelValue: {
        default: null,
    },
    options: {
        type: Array as () => { value: number | string; label: string }[],
        default: () => [],
    },
    placeholder: {
        type: String,
        default: 'Выберите...',
    },
    disabled: {
        type: Boolean,
        default: false,
    },
    clearable: {
        type: Boolean,
        default: true,
    },
});

const emit = defineEmits(['update:modelValue']);

const isOpen = ref(false);
const searchQuery = ref('');
const triggerRef = ref<HTMLElement | null>(null);
const dropdownRef = ref<HTMLElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);
const dropdownStyle = ref<Record<string, string>>({});

const selectedLabel = computed(() => {
    const found = props.options.find(o => o.value === props.modelValue);
    return found ? found.label : props.placeholder;
});

const hasValue = computed(() => props.modelValue !== null && props.modelValue !== undefined);

const filteredOptions = computed(() => {
    if (!searchQuery.value) return props.options;
    const q = searchQuery.value.toLowerCase();
    return props.options.filter(o => String(o.label).toLowerCase().includes(q));
});

const updateDropdownPosition = () => {
    const rect = triggerRef.value?.getBoundingClientRect();
    if (!rect) return;
    dropdownStyle.value = {
        position: 'fixed',
        top: `${rect.bottom + 2}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        zIndex: '9999',
    };
};

const open = () => {
    if (props.disabled) return;
    updateDropdownPosition();
    isOpen.value = true;
    setTimeout(() => searchInputRef.value?.focus(), 10);
};

const close = () => {
    isOpen.value = false;
    searchQuery.value = '';
};

const toggle = () => {
    isOpen.value ? close() : open();
};

const select = (value: any) => {
    emit('update:modelValue', value);
    close();
};

const clear = (e: Event) => {
    e.stopPropagation();
    emit('update:modelValue', null);
};

const handleClickOutside = (e: MouseEvent) => {
    const target = e.target as Node;
    const insideTrigger = triggerRef.value?.contains(target);
    const insideDropdown = dropdownRef.value?.contains(target);
    if (!insideTrigger && !insideDropdown) {
        close();
    }
};

onMounted(() => document.addEventListener('mousedown', handleClickOutside));
onUnmounted(() => document.removeEventListener('mousedown', handleClickOutside));
</script>

<template>
    <div ref="triggerRef" :class="[$style.container, { [$style.disabled]: disabled, [$style.open]: isOpen }]">
        <div :class="$style.trigger" @click="toggle">
            <span :class="[{ [$style.placeholder]: !hasValue }]">{{ selectedLabel }}</span>
            <div :class="$style.icons">
                <span v-if="hasValue" :class="$style.clearBtn" @mousedown.stop="clear">✕</span>
                <span :class="[$style.arrow, { [$style.arrowOpen]: isOpen }]">▾</span>
            </div>
        </div>
        <Teleport to="body">
            <div
                v-if="isOpen"
                ref="dropdownRef"
                :class="$style.dropdown"
                :style="dropdownStyle"
            >
                <div :class="$style.searchWrap">
                    <input
                        ref="searchInputRef"
                        v-model="searchQuery"
                        type="text"
                        :class="$style.searchInput"
                        placeholder="Поиск..."
                    />
                </div>
                <div :class="$style.optionsList">
                    <div
                        v-for="option in filteredOptions"
                        :key="option.value"
                        :class="[$style.option, { [$style.selected]: option.value === modelValue }]"
                        @mousedown.prevent="() => select(option.value)"
                    >
                        {{ option.label }}
                    </div>
                    <div v-if="!filteredOptions.length" :class="$style.empty">Нет совпадений</div>
                </div>
            </div>
        </Teleport>
    </div>
</template>

<style module lang="css">
.container {
    position: relative;
    width: 100%;
    box-sizing: border-box;
}

.trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border: 1px solid #e8eaeb;
    background: white;
    padding: 5px 8px;
    cursor: pointer;
    min-height: 30px;
    font-size: 14px;
    color: #363b44;
    border-radius: 3px;
    user-select: none;
    box-sizing: border-box;
}

.open .trigger {
    border-color: #9da5b0;
}

.disabled .trigger {
    background: whitesmoke;
    cursor: not-allowed;
    color: gray;
}

.placeholder {
    color: #aaa;
}

.icons {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
}

.clearBtn {
    font-size: 11px;
    color: #999;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 2px;
    line-height: 1;
}

.clearBtn:hover {
    color: #555;
    background: #eee;
}

.arrow {
    font-size: 12px;
    color: #999;
    transition: transform 0.15s;
    display: inline-block;
    line-height: 1;
}

.arrowOpen {
    transform: rotate(180deg);
}

.dropdown {
    background: white;
    border: 1px solid #e8eaeb;
    border-radius: 3px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    display: flex;
    flex-direction: column;
    max-height: 280px;
    overflow: hidden;
}

.searchWrap {
    padding: 6px 8px;
    border-bottom: 1px solid #e8eaeb;
    flex-shrink: 0;
}

.searchInput {
    width: 100%;
    padding: 4px 8px;
    border: 1px solid #e8eaeb;
    border-radius: 3px;
    font-size: 13px;
    box-sizing: border-box;
    outline: none;
}

.searchInput:focus {
    border-color: #9da5b0;
}

.optionsList {
    overflow-y: auto;
    flex: 1;
}

.option {
    padding: 6px 10px;
    cursor: pointer;
    font-size: 14px;
    color: #363b44;
}

.option:hover {
    background: #f5f5f5;
}

.selected {
    background: #e6f7ff;
}

.empty {
    padding: 10px;
    text-align: center;
    color: #999;
    font-style: italic;
    font-size: 13px;
}
</style>
