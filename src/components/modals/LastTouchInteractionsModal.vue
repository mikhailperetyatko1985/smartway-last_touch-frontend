<script setup lang="ts">
import { computed, onMounted } from 'vue';
import type { ILastTouchInteractionsFilters } from 'interfaces/ILastTouchInteractions';
import { useLastTouchInteractions, countActiveFilters } from 'composables/useLastTouchInteractions';
// @ts-ignore
import UiModalContainer from 'components/base/UiModalContainer.vue';
// @ts-ignore
import UiFlexContainer from 'components/base/UiFlexContainer.vue';
// @ts-ignore
import UiText from 'components/base/UiText.vue';
// @ts-ignore
import InteractionsFiltersPanel from 'components/modals/lasttouch/InteractionsFiltersPanel.vue';
// @ts-ignore
import InteractionsTable from 'components/modals/lasttouch/InteractionsTable.vue';

const {
    filters, page, perPage, items, isLoading, errorBanner, total, lastPage,
    fetchPage, setHumanText, applyFilters, resetFilters, goPage, setPerPage, clearError,
} = useLastTouchInteractions();

const emit = defineEmits(['close']);

onMounted(fetchPage);

// --- обработчики панели фильтров (state живёт в composable) ---
type IdKey = 'lead' | 'manager' | 'contact';

type IdFieldKey = 'leadIds' | 'managerIds' | 'contactIds';

const ID_FIELD_MAP: Record<IdKey, IdFieldKey> = {
    lead: 'leadIds',
    manager: 'managerIds',
    contact: 'contactIds',
};

const onCommitIds = (key: string, ids: number[]): void => {
    const field = ID_FIELD_MAP[key as IdKey];
    if (!field) return;
    const current = filters.value[field] as number[];
    const changed = current.length !== ids.length || current.some((v, i) => v !== ids[i]);
    if (changed) {
        filters.value[field] = ids;
        applyFilters();
    }
};

const onToggleType = (value: string): void => {
    const current = filters.value.touchTypes;
    filters.value.touchTypes = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value];
    applyFilters();
};

type DateFieldKey = 'touchedAtFrom' | 'touchedAtTo' | 'createdAtFrom' | 'createdAtTo';

const DATE_FIELDS: ReadonlyArray<DateFieldKey> = [
    'touchedAtFrom', 'touchedAtTo', 'createdAtFrom', 'createdAtTo',
];

const onDateChange = (field: string, value: string): void => {
    if (!DATE_FIELDS.includes(field as DateFieldKey)) return;
    filters.value[field as DateFieldKey] = value;
    applyFilters();
};

// текст меняется сразу (v-model поля), перезапрос — debounce внутри composable
const onHumanText = (text: string): void => {
    setHumanText(text);
};

const hasActiveFilters = computed<boolean>(() => countActiveFilters(filters.value) > 0);
</script>

<template>
    <ui-modal-container :class="$style.modalRoot" @close="emit('close')">
        <!-- Шапка: заголовок + встроенная в контейнер кнопка закрыть -->
        <ui-flex-container direction="col" row-gap="rg12">
            <ui-text text="История последних касаний" size="fs400" weight="fw600" />
        </ui-flex-container>

        <!-- Баннер ошибки с ретраем -->
        <div v-if="errorBanner" :class="$style.banner">
            <div :class="$style.bannerBody">
                <div :class="$style.bannerTitle">{{ errorBanner?.title }}</div>
                <div :class="$style.bannerText">{{ errorBanner?.text }}</div>
            </div>
            <button type="button" :class="$style.retryBtn" @click="fetchPage()">Повторить</button>
            <span :class="$style.bannerClose" aria-label="Скрыть ошибку" @click="clearError()">✕</span>
        </div>

        <!-- Панель фильтров -->
        <interactions-filters-panel
            :filters="filters"
            :is-loading="isLoading"
            @human-text="onHumanText"
            @commit-ids="onCommitIds"
            @toggle-type="onToggleType"
            @date-change="onDateChange"
            @reset="resetFilters"
        />

        <!-- Таблица + пагинация -->
        <interactions-table
            :items="items"
            :is-loading="isLoading"
            :has-active-filters="hasActiveFilters"
            :total="total"
            :page="page"
            :last-page="lastPage"
            :per-page="perPage"
            @go-page="goPage"
            @set-per-page="setPerPage"
        />
    </ui-modal-container>
</template>

<style module lang="css">
.modalRoot {
    width: 90vw;
    max-width: 1280px;
    height: 65vh;
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

.retryBtn {
    flex-shrink: 0;
    padding: 4px 10px;
    font-size: 12px;
    line-height: 1.4;
    color: #c22f2f;
    background: #fff;
    border: 1px solid #ffa39e;
    border-radius: 3px;
    cursor: pointer;
    transition: background-color 120ms ease, color 120ms ease;
}

.retryBtn:hover {
    background: #ffe7e5;
}

.retryBtn:focus-visible {
    outline: 2px solid #ff8a84;
    outline-offset: 1px;
}

.bannerClose {
    cursor: pointer;
    color: #b23b3b;
    font-size: 14px;
    line-height: 1;
    padding: 2px;
}
</style>
