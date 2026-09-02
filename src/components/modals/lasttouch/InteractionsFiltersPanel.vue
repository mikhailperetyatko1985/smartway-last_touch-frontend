<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { ILastTouchInteractionsFilters, ILastTouchInteractionsFiltersDraft } from 'interfaces/ILastTouchInteractions';
import { TOUCH_TYPE_OPTIONS } from 'interfaces/ILastTouchInteractions';
import { formatIdList, countActiveFilters, isDraftEqualApplied } from 'composables/useLastTouchInteractions';
// @ts-ignore
import UiButton from 'components/base/UiButton.vue';
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

// Панель держит ЕДИНЫЙ черновик всех фильтров (draft), применённое состояние — в composable (filters).
// Запрос уходит только явным действием: «Найти» / Enter -> emit apply-filters; «Сбросить» -> emit reset.
// Ввод/выбор в любом поле панели запрос не запускает.
const emit = defineEmits(['apply-filters', 'reset']);

const isOpen = ref(true);

// Черновик: id-поля хранят сырой ввод (строки — для валидации и сохранения порядка токенов),
// остальные поля совпадают по типу с применённым состоянием. Применяется только «Найти».
const draft = reactive<ILastTouchInteractionsFiltersDraft>({
    humanText: props.filters.humanText,
    leadIds: formatIdList(props.filters.leadIds),
    managerIds: formatIdList(props.filters.managerIds),
    contactIds: formatIdList(props.filters.contactIds),
    touchTypes: [...props.filters.touchTypes],
    touchedAtFrom: props.filters.touchedAtFrom,
    touchedAtTo: props.filters.touchedAtTo,
    createdAtFrom: props.filters.createdAtFrom,
    createdAtTo: props.filters.createdAtTo,
});

// Состояние валидации id-полей — отдельно от черновика: это UI-фидбек, а не значение фильтра
const invalidIds = reactive<Record<IdKey, boolean>>({ lead: false, manager: false, contact: false });

const ID_KEYS: readonly IdKey[] = ['lead', 'manager', 'contact'];

type DraftIdField = 'leadIds' | 'managerIds' | 'contactIds';

const DRAFT_ID_FIELDS: Record<IdKey, DraftIdField> = {
    lead: 'leadIds',
    manager: 'managerIds',
    contact: 'contactIds',
};

const ID_TOKEN_RE = /^\d+$/;

// «мусор» в любом токене (abc, 1.5, -3) = невалидно; пустой ввод = валидно (фильтр выключен)
const validateIdInput = (input: string): boolean => {
    const tokens = input.split(/[\s,]+/).filter(t => t !== '');
    return tokens.every(t => ID_TOKEN_RE.test(t) && Number(t) > 0);
};

// blur / Enter в id-поле только валидируют черновик (подсветка ошибки) — запрос не запускают
const validateIdField = (key: IdKey): void => {
    invalidIds[key] = !validateIdInput(draft[DRAFT_ID_FIELDS[key]].trim());
};

// Внешние изменения применённого состояния (применение/сброс в composable) синхронизируем с черновиком.
// Полный пересбор безопасен: при изменении фильтров автозапроса нет, а после применения
// applied == нормализованному черновику — текст лишь приводится к канону ("1 2" -> "1, 2"),
// отметки валидации сбрасываются.
const syncDraftFromApplied = (): void => {
    const f = props.filters;
    draft.humanText = f.humanText;
    draft.leadIds = formatIdList(f.leadIds);
    draft.managerIds = formatIdList(f.managerIds);
    draft.contactIds = formatIdList(f.contactIds);
    draft.touchTypes = [...f.touchTypes];
    draft.touchedAtFrom = f.touchedAtFrom;
    draft.touchedAtTo = f.touchedAtTo;
    draft.createdAtFrom = f.createdAtFrom;
    draft.createdAtTo = f.createdAtTo;
    for (const key of ID_KEYS) {
        invalidIds[key] = false;
    }
};

watch(
    () => [
        props.filters.humanText,
        props.filters.leadIds.join(','),
        props.filters.managerIds.join(','),
        props.filters.contactIds.join(','),
        props.filters.touchTypes.join(','),
        props.filters.touchedAtFrom,
        props.filters.touchedAtTo,
        props.filters.createdAtFrom,
        props.filters.createdAtTo,
    ],
    syncDraftFromApplied,
);

// Черновик отличается от применённого после нормализации (trim/parseIdList) — «Найти» активна
const isDraftDirty = computed<boolean>(() => !isDraftEqualApplied(draft, props.filters));

const isApplyDisabled = computed<boolean>(() => props.isLoading || !isDraftDirty.value);

// «Сбросить» неактивна, когда сбрасывать нечего: нет применённых фильтров и черновик с ними совпадает
const isResetDisabled = computed<boolean>(
    () => props.isLoading || (!isDraftDirty.value && countActiveFilters(props.filters) === 0),
);

// «Найти» / Enter в поле поиска: валидируем id-поля; если все валидны — отправляем ВСЕ фильтры разом
// (снимок черновика). Невалидное id-поле подсвечивается, запрос НЕ уходит («мусор» не должен попасть на бэкенд).
const applyFilters = (): void => {
    if (isApplyDisabled.value) return;
    let allValid = true;
    for (const key of ID_KEYS) {
        const valid = validateIdInput(draft[DRAFT_ID_FIELDS[key]].trim());
        invalidIds[key] = !valid;
        if (!valid) {
            allValid = false;
        }
    }
    if (!allValid) return;
    emit('apply-filters', { ...draft, touchTypes: [...draft.touchTypes] });
};

// «Сбросить»: чистим черновик (в т.ч. незакоммиченный/невалидный ввод), затем composable
// чистит применённые фильтры + перезапрос без фильтров с page=1
const onResetClick = (): void => {
    if (props.isLoading) return;
    draft.humanText = '';
    draft.leadIds = '';
    draft.managerIds = '';
    draft.contactIds = '';
    draft.touchTypes = [];
    draft.touchedAtFrom = '';
    draft.touchedAtTo = '';
    draft.createdAtFrom = '';
    draft.createdAtTo = '';
    for (const key of ID_KEYS) {
        invalidIds[key] = false;
    }
    emit('reset');
};

// Чипы типов касаний меняют только черновик — запрос не запускается, пока не нажата «Найти»
const toggleType = (value: string): void => {
    const index = draft.touchTypes.indexOf(value);
    if (index === -1) {
        draft.touchTypes.push(value);
    } else {
        draft.touchTypes.splice(index, 1);
    }
};

type DateField = 'touchedAtFrom' | 'touchedAtTo' | 'createdAtFrom' | 'createdAtTo';

// Смена даты обновляет только черновик — запрос не запускается, пока не нажата «Найти»
const onDateChange = (field: DateField, event: Event): void => {
    const target = event.target as HTMLInputElement | null;
    draft[field] = target ? target.value : '';
};

// Ввод в поле поиска обновляет только черновик — запрос по «Найти» / Enter
const onSearchInput = (value: unknown): void => {
    draft.humanText = String(value ?? '');
};

// Крестик только очищает черновик — до нажатия «Найти» запрос не идёт
const clearSearchDraft = (): void => {
    draft.humanText = '';
};

// активные группы фильтров (каждая группа считается один раз) — счётчик по применённому состоянию
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
            <!-- Поиск по описанию: ввод не запрашивает; применяется «Найти» / Enter -->
            <div :class="$style.searchRow">
                <div :class="$style.searchWrap">
                    <ui-input
                        :model-value="draft.humanText"
                        type="text"
                        placeholder="Поиск по описанию…"
                        :disabled="isLoading"
                        :class="$style.searchInput"
                        @update:model-value="onSearchInput"
                        @keydown.enter.prevent="applyFilters"
                    />
                    <button
                        v-if="draft.humanText"
                        type="button"
                        :class="$style.clearBtn"
                        aria-label="Очистить поиск"
                        @click="clearSearchDraft"
                    >✕</button>
                </div>
            </div>

            <!-- Id-фильтры: ввод/blur только валидируют черновик, запрос — кнопкой «Найти» -->
            <div :class="$style.idGrid">
                <label :class="$style.field">
                    <span :class="$style.label">Сделка</span>
                    <input
                        type="text"
                        v-model="draft.leadIds"
                        placeholder="Id через запятую"
                        autocomplete="off"
                        :disabled="isLoading"
                        :class="[$style.idInput, { [$style.invalid]: invalidIds.lead }]"
                        @blur="validateIdField('lead')"
                        @keydown.enter.prevent="validateIdField('lead')"
                    />
                </label>
                <label :class="$style.field">
                    <span :class="$style.label">Менеджер</span>
                    <input
                        type="text"
                        v-model="draft.managerIds"
                        placeholder="Id через запятую"
                        autocomplete="off"
                        :disabled="isLoading"
                        :class="[$style.idInput, { [$style.invalid]: invalidIds.manager }]"
                        @blur="validateIdField('manager')"
                        @keydown.enter.prevent="validateIdField('manager')"
                    />
                </label>
                <label :class="$style.field">
                    <span :class="$style.label">Контакт</span>
                    <input
                        type="text"
                        v-model="draft.contactIds"
                        placeholder="Id через запятую"
                        autocomplete="off"
                        :disabled="isLoading"
                        :class="[$style.idInput, { [$style.invalid]: invalidIds.contact }]"
                        @blur="validateIdField('contact')"
                        @keydown.enter.prevent="validateIdField('contact')"
                    />
                </label>
            </div>

            <!-- Типы касаний: чипы меняют только черновик -->
            <div :class="$style.field">
                <span :class="$style.label">Тип касания</span>
                <div :class="$style.chips">
                    <button
                        v-for="option in TOUCH_TYPE_OPTIONS"
                        :key="option.value"
                        type="button"
                        :disabled="isLoading"
                        :class="[$style.chip, { [$style.chipActive]: draft.touchTypes.includes(option.value) }]"
                        @click="toggleType(option.value)"
                    >{{ option.labelRu }}</button>
                </div>
            </div>

            <!-- Диапазоны дат: смена обновляет только черновик -->
            <div :class="$style.datesRow">
                <div :class="$style.dateGroup">
                    <span :class="$style.label">Дата касания</span>
                    <ui-flex-container gap="g4" align-items="center">
                        <input
                            type="date"
                            aria-label="Дата касания, от"
                            :value="draft.touchedAtFrom"
                            :disabled="isLoading"
                            :class="$style.dateInput"
                            @change="onDateChange('touchedAtFrom', $event)"
                        />
                        <span :class="$style.dash">—</span>
                        <input
                            type="date"
                            aria-label="Дата касания, до"
                            :value="draft.touchedAtTo"
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
                            :value="draft.createdAtFrom"
                            :disabled="isLoading"
                            :class="$style.dateInput"
                            @change="onDateChange('createdAtFrom', $event)"
                        />
                        <span :class="$style.dash">—</span>
                        <input
                            type="date"
                            aria-label="Создано, до"
                            :value="draft.createdAtTo"
                            :disabled="isLoading"
                            :class="$style.dateInput"
                            @change="onDateChange('createdAtTo', $event)"
                        />
                    </ui-flex-container>
                </div>
            </div>

            <!-- Кнопки действий — отдельный блок внизу панели: «Найти» применяет все фильтры разом,
                 «Сбросить» чистит черновик и применённые фильтры -->
            <div :class="$style.actionsRow">
                <ui-button label="Найти" :class="$style.primaryBtn" :disabled="isApplyDisabled" @click="applyFilters" />
                <ui-button label="Сбросить" :disabled="isResetDisabled" @click="onResetClick" />
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

.searchRow {
    display: flex;
    align-items: center;
    gap: 8px;
}

.searchWrap {
    position: relative;
    flex: 1 1 auto;
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

/* Нижний блок действий: визуально отделён от полей фильтров */
.actionsRow {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 10px;
    border-top: 1px solid #e8eaeb;
}

/* «Найти» — primary (акцентный цвет виджета); специфичность выше, чем у .container UiButton */
.actionsRow .primaryBtn:not(:disabled) {
    color: #fff;
    background-color: #21a6d8;
    border-color: #21a6d8;
}

.actionsRow .primaryBtn:not(:disabled):hover {
    background-color: #1b8fbd;
    border-color: #1b8fbd;
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
