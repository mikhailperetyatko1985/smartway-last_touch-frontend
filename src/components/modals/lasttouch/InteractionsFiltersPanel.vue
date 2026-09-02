<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { ILastTouchInteractionsFilters } from 'interfaces/ILastTouchInteractions';
import { TOUCH_TYPE_OPTIONS } from 'interfaces/ILastTouchInteractions';
import { parseIdList, formatIdList, countActiveFilters } from 'composables/useLastTouchInteractions';
// @ts-ignore
import UiFlexContainer from 'components/base/UiFlexContainer.vue';
// @ts-ignore
import UiInput from 'components/base/UiInput.vue';

type IdKey = 'lead' | 'manager' | 'contact';

const props = defineProps({
    filters: {
        type: Object as () => ILastTouchInteractionsFilters,
        required: true,
    },
    isLoading: {
        type: Boolean,
        default: false,
    },
});

const emit = defineEmits(['human-text', 'commit-ids', 'toggle-type', 'date-change', 'reset']);

const isOpen = ref(true);

// черновики id-полей: применяются только по blur/Enter после валидации
interface IdFieldState {
    draft: string;
    invalid: boolean;
}

const idFields = reactive<Record<IdKey, IdFieldState>>({
    lead: { draft: formatIdList(props.filters.leadIds), invalid: false },
    manager: { draft: formatIdList(props.filters.managerIds), invalid: false },
    contact: { draft: formatIdList(props.filters.contactIds), invalid: false },
});

const ID_TOKEN_RE = /^\d+$/;

// «мусор» в любом токене (abc, 1.5, -3) = невалидно; пустой ввод = валидно (фильтр выключен)
const validateIdInput = (input: string): boolean => {
    const tokens = input.split(/[\s,]+/).filter(t => t !== '');
    return tokens.every(t => ID_TOKEN_RE.test(t) && Number(t) > 0);
};

const commitIds = (key: IdKey): void => {
    if (props.isLoading) return;
    const field = idFields[key];
    const value = field.draft.trim();
    if (!value) {
        field.invalid = false;
        emit('commit-ids', key, []);
        return;
    }
    if (!validateIdInput(value)) {
        field.invalid = true;
        return;
    }
    const ids = parseIdList(value);
    field.invalid = false;
    field.draft = formatIdList(ids);
    emit('commit-ids', key, ids);
};

// внешний сброс/смена фильтров (resetFilters) синхронизируем с черновиками;
// обновляем только изменившееся поле, чтобы не затыкать незакоммиченный ввод в соседних
const prevApplied: Record<IdKey, string> = {
    lead: props.filters.leadIds.join(','),
    manager: props.filters.managerIds.join(','),
    contact: props.filters.contactIds.join(','),
};

watch(
    () => [props.filters.leadIds.join(','), props.filters.managerIds.join(','), props.filters.contactIds.join(',')],
    ([l, m, c]) => {
        if (l !== prevApplied.lead) {
            idFields.lead.draft = l;
            idFields.lead.invalid = false;
            prevApplied.lead = l;
        }
        if (m !== prevApplied.manager) {
            idFields.manager.draft = m;
            idFields.manager.invalid = false;
            prevApplied.manager = m;
        }
        if (c !== prevApplied.contact) {
            idFields.contact.draft = c;
            idFields.contact.invalid = false;
            prevApplied.contact = c;
        }
    },
);

const onHumanTextInput = (value: unknown): void => {
    if (!props.isLoading) {
        emit('human-text', String(value ?? ''));
    }
};

const toggleType = (value: string): void => {
    if (props.isLoading) return;
    emit('toggle-type', value);
};

type DateField = 'touchedAtFrom' | 'touchedAtTo' | 'createdAtFrom' | 'createdAtTo';

const onDateChange = (field: DateField, event: Event): void => {
    if (props.isLoading) return;
    const target = event.target as HTMLInputElement | null;
    emit('date-change', field, target ? target.value : '');
};

// активные группы фильтров (каждая группа считается один раз)
// при явном сбросе чистим черновики сразу (в т.ч. невалидные),
// иначе watch не тронет поля, у которых применённое значение и так пустое
const onResetClick = (): void => {
    if (props.isLoading) return;
    const keys: IdKey[] = ['lead', 'manager', 'contact'];
    for (const key of keys) {
        idFields[key].draft = '';
        idFields[key].invalid = false;
    }
    emit('reset');
};

const activeCount = computed<number>(() => countActiveFilters(props.filters));

const filterWord = computed<string>(() => {
    const n100 = activeCount.value % 100;
    const n10 = n100 % 10;
    if (n10 > 1 && n10 < 5 && (n100 < 12 || n100 > 14)) {
        return 'активных';
    }
    if (n10 === 1 && (n100 !== 11)) {
        return 'активный';
    }
    return 'активных';
});
</script>

<template>
    <div :class="$style.panel">
        <div :class="$style.header">
            <button type="button" :class="$style.headerBtn" :aria-expanded="String(isOpen)" @click="isOpen = !isOpen">
                <span :class="[$style.chevron, { [$style.chevronOpen]: isOpen }]">▸</span>
                <span :class="$style.title">Фильтры</span>
                <span v-if="activeCount > 0" :class="$style.badge">{{ activeCount }} {{ filterWord }}</span>
            </button>
            <!-- сброс доступен и в свёрнутом виде, если есть активные фильтры -->
            <button
                v-if="activeCount > 0"
                type="button"
                :class="$style.resetLink"
                :disabled="isLoading"
                @click="onResetClick"
            >Сбросить</button>
        </div>

        <div v-show="isOpen" :class="$style.body">
            <!-- Поиск по описанию -->
            <div :class="$style.searchWrap">
                <ui-input
                    :model-value="filters.humanText"
                    type="text"
                    placeholder="Поиск по описанию…"
                    :disabled="isLoading"
                    :class="$style.searchInput"
                    @update:model-value="onHumanTextInput"
                />
                <button
                    v-if="filters.humanText"
                    type="button"
                    :class="$style.clearBtn"
                    aria-label="Очистить поиск"
                    @click="emit('human-text', '')"
                >✕</button>
            </div>

            <!-- Id-фильтры -->
            <div :class="$style.idGrid">
                <label :class="$style.field">
                    <span :class="$style.label">Lead</span>
                    <input
                        type="text"
                        v-model="idFields.lead.draft"
                        placeholder="Id через запятую"
                        autocomplete="off"
                        :disabled="isLoading"
                        :class="[$style.idInput, { [$style.invalid]: idFields.lead.invalid }]"
                        @blur="commitIds('lead')"
                        @keydown.enter.prevent="commitIds('lead')"
                    />
                </label>
                <label :class="$style.field">
                    <span :class="$style.label">Manager</span>
                    <input
                        type="text"
                        v-model="idFields.manager.draft"
                        placeholder="Id через запятую"
                        autocomplete="off"
                        :disabled="isLoading"
                        :class="[$style.idInput, { [$style.invalid]: idFields.manager.invalid }]"
                        @blur="commitIds('manager')"
                        @keydown.enter.prevent="commitIds('manager')"
                    />
                </label>
                <label :class="$style.field">
                    <span :class="$style.label">Contact</span>
                    <input
                        type="text"
                        v-model="idFields.contact.draft"
                        placeholder="Id через запятую"
                        autocomplete="off"
                        :disabled="isLoading"
                        :class="[$style.idInput, { [$style.invalid]: idFields.contact.invalid }]"
                        @blur="commitIds('contact')"
                        @keydown.enter.prevent="commitIds('contact')"
                    />
                </label>
            </div>

            <!-- Типы касаний -->
            <div :class="$style.field">
                <span :class="$style.label">Тип касания</span>
                <div :class="$style.chips">
                    <button
                        v-for="option in TOUCH_TYPE_OPTIONS"
                        :key="option.value"
                        type="button"
                        :disabled="isLoading"
                        :class="[$style.chip, { [$style.chipActive]: filters.touchTypes.includes(option.value) }]"
                        @click="toggleType(option.value)"
                    >{{ option.labelRu }}</button>
                </div>
            </div>

            <!-- Диапазоны дат -->
            <div :class="$style.datesRow">
                <div :class="$style.dateGroup">
                    <span :class="$style.label">Дата касания</span>
                    <ui-flex-container gap="g4" align-items="center">
                        <input
                            type="date"
                            aria-label="Дата касания, от"
                            :value="filters.touchedAtFrom"
                            :disabled="isLoading"
                            :class="$style.dateInput"
                            @change="onDateChange('touchedAtFrom', $event)"
                        />
                        <span :class="$style.dash">—</span>
                        <input
                            type="date"
                            aria-label="Дата касания, до"
                            :value="filters.touchedAtTo"
                            :disabled="isLoading"
                            :class="$style.dateInput"
                            @change="onDateChange('touchedAtTo', $event)"
                        />
                    </ui-flex-container>
                </div>
                <div :class="$style.dateGroup">
                    <span :class="$style.label">Создано</span>
                    <ui-flex-container gap="g4" align-items="center">
                        <input
                            type="date"
                            aria-label="Создано, от"
                            :value="filters.createdAtFrom"
                            :disabled="isLoading"
                            :class="$style.dateInput"
                            @change="onDateChange('createdAtFrom', $event)"
                        />
                        <span :class="$style.dash">—</span>
                        <input
                            type="date"
                            aria-label="Создано, до"
                            :value="filters.createdAtTo"
                            :disabled="isLoading"
                            :class="$style.dateInput"
                            @change="onDateChange('createdAtTo', $event)"
                        />
                    </ui-flex-container>
                </div>
            </div>
        </div>
    </div>
</template>

<style module lang="css">
.panel {
    border: 1px solid #e8eaeb;
    border-radius: 4px;
    background: #fafbfc;
    width: 100%;
    box-sizing: border-box;
}

.header {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    box-sizing: border-box;
    padding: 8px 12px;
}

.headerBtn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: #363b44;
    background: transparent;
    border: none;
    cursor: pointer;
    user-select: none;
    text-align: left;
}

.headerBtn:focus-visible {
    outline: 2px solid #21a6d8;
    outline-offset: -2px;
}

.resetLink {
    margin-left: auto;
    padding: 4px 2px;
    font-size: 12px;
    line-height: 1;
    color: #9da5b0;
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: none;
    transition: color 120ms ease, text-decoration-color 120ms ease;
}

.resetLink:hover:not(:disabled) {
    color: #363b44;
    text-decoration: underline;
}

.resetLink:focus-visible {
    outline: 2px solid #21a6d8;
    outline-offset: 2px;
}

.resetLink:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.chevron {
    display: inline-block;
    font-size: 10px;
    color: #9da5b0;
    transform: rotate(0deg);
    transition: transform 120ms ease;
}

.chevronOpen {
    transform: rotate(90deg);
}

.title {
    letter-spacing: 0.02em;
}

.badge {
    padding: 2px 8px;
    font-size: 12px;
    font-weight: 600;
    color: #363b44;
    background: #e6f7ff;
    border: 1px solid #cfe3ee;
    border-radius: 12px;
}

.body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 4px 12px 12px;
}

.searchWrap {
    position: relative;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
}

.searchInput {
    /* класс пробрасывается на корневой <input> UiInput (single-root);
       box-sizing/padding-right не заданы в .textInput — конфликтов каскада нет */
    padding-right: 30px;
    box-sizing: border-box;
}

.clearBtn {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    background: none;
    border: none;
    color: #9da5b0;
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
}

.clearBtn:hover {
    color: #363b44;
}

.clearBtn:focus-visible {
    outline: 2px solid #21a6d8;
    outline-offset: 0;
}

.label {
    display: block;
    font-size: 12px;
    color: #9da5b0;
    margin-bottom: 4px;
}

.idGrid {
    display: grid;
    grid-template-columns: repeat(3, minmax(160px, 1fr));
    gap: 8px;
}

.field {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.idInput {
    line-height: 18px;
    padding: 5px 6px;
    border: 1px solid #c5c5c5;
    border-radius: 3px;
    font-size: 14px;
    width: 100%;
    box-sizing: border-box;
    background: #fff;
}

.idInput:focus-visible {
    outline: 2px solid #21a6d8;
    outline-offset: 0;
}

.invalid {
    border-color: #ff3b30;
    background: #fff1f0;
}

.chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.chip {
    padding: 4px 10px;
    border: 1px solid #e8eaeb;
    border-radius: 3px;
    cursor: pointer;
    font-size: 13px;
    color: #363b44;
    background: #fff;
    user-select: none;
    transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}

.chip:hover {
    background: #f5f5f5;
}

.chip:focus-visible {
    outline: 2px solid #21a6d8;
    outline-offset: 1px;
}

.chipActive,
.chipActive:hover {
    background: #363b44;
    border-color: #363b44;
    color: #fff;
}

.chip:disabled {
    cursor: not-allowed;
    opacity: 0.6;
}

.datesRow {
    display: grid;
    grid-template-columns: repeat(2, minmax(240px, 1fr));
    gap: 8px 16px;
}

.dateGroup {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.dash {
    color: #9da5b0;
    flex-shrink: 0;
}

.dateInput {
    line-height: 18px;
    padding: 5px 6px;
    border: 1px solid #c5c5c5;
    border-radius: 3px;
    font-size: 14px;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    background: #fff;
}

.dateInput:focus-visible {
    outline: 2px solid #21a6d8;
    outline-offset: 0;
}

@media (max-width: 720px) {
    .idGrid {
        grid-template-columns: 1fr;
    }

    .datesRow {
        grid-template-columns: 1fr;
    }
}
</style>
