<script setup lang="ts">
import { computed, onMounted } from 'vue';
import type { ILastTouchInteractionsFilters, ILastTouchInteractionsFiltersDraft } from 'interfaces/ILastTouchInteractions';
import type { LastTouchSortField } from 'constants/lastTouch';
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
    filters, sort, page, perPage, items, isLoading, errorBanner, total, lastPage,
    fetchPage, applyFilters, resetFilters, goPage, setPerPage, toggleSort, clearError,
} = useLastTouchInteractions();

const emit = defineEmits(['close']);

onMounted(fetchPage);

// --- обработчики панели фильтров (state живёт в composable) ---
// Панель держит единый черновик ВСЕХ фильтров и шлёт его только явным действием («Найти» / Enter):
// composable заменяет применённое состояние, сбрасывает на 1-ю страницу и запрашивает.
const onApplyFilters = (draft: ILastTouchInteractionsFiltersDraft): void => {
    applyFilters(draft);
};

// клик по шапке таблицы: цикл asc -> desc -> off живёт в composable (toggleSort)
const onSortChange = (field: LastTouchSortField): void => {
    toggleSort(field);
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
            @apply-filters="onApplyFilters"
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
            :sort-by="sort.sortBy"
            :sort-dir="sort.sortDir"
            @go-page="goPage"
            @set-per-page="setPerPage"
            @sort-change="onSortChange"
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
