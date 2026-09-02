<script setup lang="ts">
import { computed } from 'vue';
import type { ILastTouchInteraction } from 'interfaces/ILastTouchInteractions';
import { TOUCH_TYPE_OPTIONS } from 'interfaces/ILastTouchInteractions';
import type { LastTouchSortDir, LastTouchSortField } from 'constants/lastTouch';
import { LAST_TOUCH_TABLE_COLUMNS } from 'constants/lastTouch';

const props = defineProps({
    items: {
        type: Array as () => ILastTouchInteraction[],
        default: () => [],
    },
    isLoading: {
        type: Boolean,
        default: false,
    },
    hasActiveFilters: {
        type: Boolean,
        default: false,
    },
    total: {
        type: Number,
        default: 0,
    },
    page: {
        type: Number,
        default: 1,
    },
    lastPage: {
        type: Number,
        default: 1,
    },
    perPage: {
        type: Number,
        default: 50,
    },
    // Активная сортировка (null = базовая сортировка бэкенда) — для индикатора в шапке
    sortBy: {
        type: String as () => LastTouchSortField | null,
        default: null,
    },
    sortDir: {
        type: String as () => LastTouchSortDir,
        default: 'asc',
    },
});

const emit = defineEmits(['go-page', 'set-per-page', 'sort-change']);

// --- сортировка: клик по шапке -> родитель переключает asc -> desc -> off (цикл живёт в composable) ---
const onSortClick = (field: LastTouchSortField): void => {
    if (props.isLoading) return;
    emit('sort-change', field);
};

const isSortedBy = (colKey: LastTouchSortField): boolean => props.sortBy === colKey;

const ariaSortOf = (colKey: LastTouchSortField): 'ascending' | 'descending' | undefined => {
    if (!isSortedBy(colKey)) return undefined;
    return props.sortDir === 'asc' ? 'ascending' : 'descending';
};

// --- форматирование дат (локальное время, dd.MM.yyyy HH:mm / dd.MM HH:mm) ---
const pad2 = (n: number): string => String(n).padStart(2, '0');

const parseIso = (value: string): Date | null => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const formatTouchedAt = (iso: string): string => {
    const d = parseIso(iso);
    if (!d) return iso || '—';
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const formatCreatedAt = (iso: string): string => {
    const d = parseIso(iso);
    if (!d) return iso || '—';
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const touchTypeLabel = (value: string): string => {
    const found = TOUCH_TYPE_OPTIONS.find(option => option.value === value);
    return found ? found.labelRu : value;
};

// --- пагинация: компактное окно 1 … 4 [5] 6 … 10 ---
type PageToken = number | 'gap';

const safeLastPage = computed<number>(() => Math.max(1, props.lastPage));
const currentPage = computed<number>(() => Math.min(Math.max(1, props.page), safeLastPage.value));

const pageWindow = computed<PageToken[]>(() => {
    const last = safeLastPage.value;
    const current = currentPage.value;
    if (last <= 7) {
        return Array.from({ length: last }, (_, i) => i + 1);
    }
    const tokens: PageToken[] = [1];
    const from = Math.max(2, current - 1);
    const to = Math.min(last - 1, current + 1);
    if (from > 2) {
        tokens.push('gap');
    }
    for (let i = from; i <= to; i++) {
        tokens.push(i);
    }
    if (to < last - 1) {
        tokens.push('gap');
    }
    tokens.push(last);
    return tokens;
});

const canPrev = computed<boolean>(() => currentPage.value > 1);
const canNext = computed<boolean>(() => currentPage.value < safeLastPage.value);

const onGoPage = (n: number): void => {
    if (props.isLoading || n === props.page) return;
    emit('go-page', n);
};

const perPageOptions = computed<number[]>(() => {
    const base = [20, 50, 100, 200];
    return base.includes(props.perPage) ? base : [...base, props.perPage].sort((a, b) => a - b);
});

const onPerPageChange = (event: Event): void => {
    if (props.isLoading) return;
    const select = event.target as HTMLSelectElement | null;
    const value = Number(select ? select.value : '');
    if (!Number.isFinite(value)) return;
    if (value !== props.perPage) {
        emit('set-per-page', value);
    }
};

const SKELETON_ROWS = 8;
</script>

<template>
    <div :class="$style.root">
        <!-- Прокручиваемая область таблицы: sticky-шапка, зебра, скролл по X -->
        <div :class="[$style.tableScroll, { [$style.dimmed]: isLoading && items.length > 0 }]">
            <table :class="$style.table">
                <thead>
                    <tr>
                        <!-- Шапка кликабельна: клик переключает asc -> desc -> off (без сортировки) -->
                        <th
                            v-for="col in LAST_TOUCH_TABLE_COLUMNS"
                            :key="col.key"
                            :class="[
                                $style.th,
                                $style.thSortable,
                                { [$style.thDesc]: col.key === 'human_text', [$style.thActive]: isSortedBy(col.key) },
                            ]"
                            :aria-sort="ariaSortOf(col.key)"
                            @click="onSortClick(col.key)"
                        >
                            {{ col.labelRu }}<span v-if="isSortedBy(col.key)" :class="$style.sortArrow">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
                        </th>
                    </tr>
                </thead>

                <!-- Skeleton при загрузке -->
                <tbody v-if="isLoading">
                    <tr v-for="row in SKELETON_ROWS" :key="`skel-${row}`" :class="$style.skelRow">
                        <td v-for="col in 7" :key="col">
                            <div :class="$style.skeletonCell" />
                        </td>
                    </tr>
                </tbody>

                <!-- Пустое состояние -->
                <tbody v-else-if="items.length === 0">
                    <tr>
                        <td colspan="7" :class="$style.emptyCell">
                            Нет данных
                            <span v-if="hasActiveFilters" :class="$style.emptyHint">Измените фильтры</span>
                        </td>
                    </tr>
                </tbody>

                <!-- Данные -->
                <tbody v-else>
                    <tr v-for="item in items" :key="item.id">
                        <td :class="$style.tdNum">{{ formatTouchedAt(item.touched_at) }}</td>
                        <td :class="$style.descCell" :title="item.human_text">{{ item.human_text || '—' }}</td>
                        <td :class="$style.tdPlain">{{ touchTypeLabel(item.touch_type) }}</td>
                        <td :class="$style.tdNum">{{ item.lead_id }}</td>
                        <td :class="$style.tdNum">{{ item.manager_id }}</td>
                        <td :class="$style.tdNum">{{ item.contact_id }}</td>
                        <td :class="$style.tdNum">{{ formatCreatedAt(item.created_at) }}</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Пагинация: всегда видна под таблицей -->
        <div :class="$style.footer">
            <span :class="$style.total">Всего: {{ total }}</span>
            <div :class="$style.controls">
                <label :class="$style.perPageLabel">
                    На страницу
                    <select
                        aria-label="Количество строк на странице"
                        :value="perPage"
                        :disabled="isLoading"
                        :class="$style.perPageSelect"
                        @change="onPerPageChange($event)"
                    >
                        <option v-for="n in perPageOptions" :key="n" :value="n">{{ n }}</option>
                    </select>
                </label>
                <nav :class="$style.pages" aria-label="Страницы">
                    <button
                        type="button"
                        :class="$style.pageBtn"
                        :disabled="isLoading || !canPrev"
                        @click="onGoPage(currentPage - 1)"
                    >‹ Пред</button>
                    <template v-for="(token, index) in pageWindow" :key="`${index}-${String(token)}`">
                        <span v-if="token === 'gap'" :class="$style.gap">…</span>
                        <button
                            v-else
                            type="button"
                            :class="[$style.pageBtn, $style.pageNum, { [$style.pageCurrent]: token === currentPage }]"
                            :disabled="isLoading"
                            @click="onGoPage(token)"
                        >{{ token }}</button>
                    </template>
                    <button
                        type="button"
                        :class="$style.pageBtn"
                        :disabled="isLoading || !canNext"
                        @click="onGoPage(currentPage + 1)"
                    >Стр ›</button>
                </nav>
            </div>
        </div>
    </div>
</template>

<style module lang="css">
.root {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1 1 auto;
    min-height: 0;
}

.tableScroll {
    overflow: auto;
    border: 1px solid #e8eaeb;
    border-radius: 4px;
    background: #fff;
    min-height: 96px;
    transition: opacity 120ms ease;
}

.dimmed {
    opacity: 0.55;
}

.table {
    width: 100%;
    min-width: 860px;
    border-collapse: collapse;
    font-size: 13px;
    color: #26282c;
}

.th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 8px 12px;
    text-align: left;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: #363b44;
    background: #fff;
    box-shadow: inset 0 -1px 0 #e8eaeb;
    white-space: nowrap;
}

.thDesc {
    min-width: 240px;
}

/* кликабельная шапка: pointer + лёгкий hover-подсветка, активный столбец — акцентный цвет */
.thSortable {
    cursor: pointer;
    user-select: none;
    transition: color 120ms ease;
}

.thSortable:hover {
    color: #0b6fa3;
}

.thActive,
.thActive:hover {
    color: #0b6fa3;
}

.sortArrow {
    display: inline-block;
    margin-left: 4px;
    font-size: 10px;
    line-height: 1;
}

.tdNum {
    padding: 8px 12px;
    border-bottom: 1px solid #f0f2f4;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
}

.tdPlain {
    padding: 8px 12px;
    border-bottom: 1px solid #f0f2f4;
    white-space: nowrap;
}

.descCell {
    padding: 8px 12px;
    border-bottom: 1px solid #f0f2f4;
    min-width: 240px;
    word-break: break-word;
    overflow-wrap: anywhere;
}

tbody tr {
    transition: background-color 120ms ease;
}

tbody tr:nth-child(even) {
    background: #fafbfc;
}

tbody tr:hover {
    background: #f5f7fa;
}

.skelRow td {
    padding: 10px 12px;
    border-bottom: 1px solid #f0f2f4;
}

.skeletonCell {
    height: 12px;
    border-radius: 3px;
    background: linear-gradient(90deg, #ececec 25%, #f5f5f5 37%, #ececec 63%);
    background-size: 400% 100%;
    animation: ltiSkeletonPulse 1.4s ease infinite;
}

@keyframes ltiSkeletonPulse {
    0% {
        background-position: 100% 50%;
    }
    100% {
        background-position: 0 50%;
    }
}

.emptyCell {
    padding: 32px 16px;
    text-align: center;
    color: #9da5b0;
    font-size: 14px;
}

.emptyHint {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: #c1c7cd;
}

.footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
    flex-wrap: wrap;
}

.total {
    font-size: 13px;
    color: #9da5b0;
    white-space: nowrap;
}

.controls {
    display: flex;
    align-items: center;
    gap: 8px 16px;
    flex-wrap: wrap;
}

.perPageLabel {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #9da5b0;
    white-space: nowrap;
}

.perPageSelect {
    line-height: 18px;
    padding: 4px 6px;
    border: 1px solid #c5c5c5;
    border-radius: 3px;
    font-size: 13px;
    background: #fff;
    color: #26282c;
    cursor: pointer;
}

.perPageSelect:focus-visible {
    outline: 2px solid #21a6d8;
    outline-offset: 0;
}

.perPageSelect:disabled {
    background: #f5f5f5;
    color: #92989b;
    cursor: not-allowed;
}

.pages {
    display: flex;
    align-items: center;
    gap: 4px;
}

.pageBtn {
    min-width: 28px;
    height: 28px;
    padding: 0 8px;
    font-size: 13px;
    color: #363b44;
    background: #fff;
    border: 1px solid #e8eaeb;
    border-radius: 3px;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 120ms ease, border-color 120ms ease;
}

.pageBtn:hover:not(:disabled) {
    background: #f5f5f5;
}

.pageBtn:focus-visible {
    outline: 2px solid #21a6d8;
    outline-offset: 1px;
}

.pageBtn:disabled {
    color: #c1c7cd;
    cursor: not-allowed;
}

.pageNum {
    padding: 0 6px;
}

.pageCurrent,
.pageCurrent:hover:not(:disabled) {
    background: #e6f7ff;
    border-color: #21a6d8;
    color: #0b6fa3;
    font-weight: 600;
}

.gap {
    padding: 0 2px;
    color: #9da5b0;
    user-select: none;
}
</style>
