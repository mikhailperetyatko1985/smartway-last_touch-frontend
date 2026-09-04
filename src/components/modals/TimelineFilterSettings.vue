<script setup lang="ts">
import { computed, onMounted } from 'vue';
import type { IFunnelFilterMode, IFunnelFilterSettings } from 'interfaces/ITimelineFilterSettings';
import type { IPipeline } from 'interfaces/IPipeline';
import { useTimelineFilterSettings } from 'composables/useTimelineFilterSettings';
// @ts-ignore
import UiFlexContainer from 'components/base/UiFlexContainer.vue';
// @ts-ignore
import UiLoadingText from 'components/base/UiLoadingText.vue';
// @ts-ignore
import UiButton from 'components/base/UiButton.vue';
// @ts-ignore
import UiSearchableSelect from 'components/base/UiSearchableSelect.vue';

const {
    funnels, pipelines, responsibleFieldOptions, isLoading, isSaving, apiError, cardErrors,
    isForbidden, isAdmin, canAddFunnel, isDirty, syncStatus, isSyncBusy, isRemoteSyncActive,
    needsSyncHint, lastSyncedAtLabel, load, save, resetToBaseline, clearError, addFunnel,
    removeFunnel, setPipeline, toggleStatus, setStatusesAll, setMode, setCustomField,
    setHideFlag, getOptionsForFunnel, startSyncCycle,
} = useTimelineFilterSettings();

onMounted(load);

const MODES: { value: IFunnelFilterMode; label: string }[] = [
    { value: 'off', label: 'Выключено' },
    { value: 'base', label: 'Ответственный сделки' },
    { value: 'custom', label: 'Кастомное поле' },
];

const HIDE_FLAGS = [
    { key: 'hide_system', label: 'Скрывать технические события (смена полей, теги, этапы, сервис-сообщения)' },
    { key: 'hide_pinned_no_target', label: 'Скрывать закреплённые без целевых менеджеров' },
    { key: 'hide_no_author', label: 'Скрывать события без идентифицируемого автора (боты, письма, задачи без чипа)' },
] as const;

interface IRowViewModel {
    funnel: IFunnelFilterSettings;
    index: number;
    pipeline?: IPipeline;
}

// view-модель строки + стадии, пропавшие из воронки после сохранения (chip «не найден»)
const rowsView = computed<IRowViewModel[]>(() => funnels.value.map((funnel, index) => {
    const pipeline = pipelines.value.find(p => Number(p.id) === Number(funnel.pipeline_id));
    return { funnel, index, pipeline };
}));

const missingStatusIds = (row: IRowViewModel): number[] => {
    if (!row.pipeline) {
        return [];
    }
    const known = new Set<number>(row.pipeline.statuses.map(s => Number(s.id)));
    return row.funnel.status_ids.filter(id => !known.has(Number(id))).map(id => Number(id));
};

const isAllSelected = (row: IRowViewModel): boolean =>
    !!row.pipeline && row.pipeline.statuses.length > 0
        && row.pipeline.statuses.every(s => row.funnel.status_ids.includes(Number(s.id)));

const syncStatusLabel = computed<string>(() => {
    if (!isSyncBusy.value) return '';
    const state = syncStatus.value?.state;
    return state === 'queued' ? 'Синхронизация в очереди…' : 'Синхронизация выполняется…';
});

const onPipelineChange = (index: number) => (value: number | string | null): void => {
    setPipeline(index, typeof value === 'number' ? value : null);
};

const onStatusToggle = (row: IRowViewModel) => (statusId: number): void => {
    toggleStatus(row.index, statusId);
};

const onModeChange = (index: number) => (value: IFunnelFilterMode | string): void => {
    if (value === 'off' || value === 'base' || value === 'custom') {
        setMode(index, value);
    }
};

const onCustomFieldChange = (index: number) => (value: number | string | null): void => {
    setCustomField(index, typeof value === 'number' ? value : null);
};

const onHideFlagChange = (index: number) => (key: (typeof HIDE_FLAGS)[number]['key']): (e: Event) => void => (e) => {
    setHideFlag(index, key, (e.target as HTMLInputElement).checked);
};
</script>

<template>
    <div :class="$style.root">
        <ui-flex-container direction="col" row-gap="rg12">
            <div :class="$style.title">ФИЛЬТР TIMELINE СОДЕЛКИ</div>
            <div :class="$style.hint">
                Виджет скрывает в истории сделки события, не относящиеся к целевым менеджерам.
                Работает только на выбранных стадиях добавленных воронок — вне них показ без фильтра.
            </div>

            <!-- синк «группы → пользователи»: источник данных для расчёта целевых менеджеров -->
            <div :class="$style.card">
                <div :class="$style.cardTitle">СОТРУДНИКИ И ГРУППЫ</div>
                <div :class="$style.hint">
                    Целевые менеджеры берутся из снапшота backend. Обновите его после изменений состава групп в amoCRM.
                </div>

                <div :class="$style.syncRow">
                    <span :class="$style.syncMeta">
                        Последняя синхронизация: {{ isLoading ? '…' : (lastSyncedAtLabel || 'не выполнялась') }}
                    </span>
                    <ui-button
                        v-if="isAdmin === true"
                        label="Синхронизировать сотрудников и группы"
                        :disabled="isSyncBusy"
                        @click="startSyncCycle()"
                    />
                </div>

                <div v-if="needsSyncHint && !isSyncBusy && !isLoading" :class="$style.infoBanner">
                    Без синхронизации виджет не фильтрует события — нажмите «Синхронизировать сотрудников и группы».
                </div>
                <div v-if="syncStatusLabel || isRemoteSyncActive" :class="$style.syncRunning">
                    {{ syncStatusLabel || 'Синхронизация уже выполняется…' }}
                </div>
            </div>

            <!-- карточки воронок -->
            <div :class="$style.card">
                <div :class="$style.cardTitle">ВОРОНКИ И НАСТРОЙКИ</div>
                <div :class="$style.hint">
                    Для каждой воронки: стадии, на которых фильтр активен (минимум одна), источник ответственного и правила скрытия.
                </div>

                <ui-flex-container v-if="isLoading" direction="col" row-gap="rg12">
                    <ui-loading-text text="Загрузка" />
                </ui-flex-container>

                <template v-else>
                    <div v-if="apiError" :class="$style.errorBanner">
                        <div :class="$style.bannerBody">
                            <div :class="$style.bannerTitle">{{ apiError?.title }}</div>
                            <div :class="$style.bannerText">{{ apiError?.text }}</div>
                        </div>
                        <span :class="$style.bannerClose" aria-label="Скрыть ошибку" @click="clearError()">✕</span>
                    </div>

                    <div v-if="!pipelines.length" :class="$style.emptyHint">Нет доступных воронок.</div>

                    <div v-for="row in rowsView" :key="row.index" :class="$style.funnelCard">
                        <div :class="$style.cardHeader">
                            <div :class="$style.selectWrap">
                                <ui-searchable-select
                                    v-if="row.pipeline"
                                    :model-value="row.funnel.pipeline_id"
                                    :options="getOptionsForFunnel(row.index)"
                                    :clearable="true"
                                    placeholder="Выберите воронку..."
                                    @update:model-value="onPipelineChange(row.index)($event)"
                                />
                                <span v-else :class="$style.warningChip">Воронка #{{ row.funnel.pipeline_id }} не найдена</span>
                            </div>
                            <button
                                type="button"
                                :class="$style.removeBtn"
                                @click="removeFunnel(row.index)"
                            >Удалить</button>
                        </div>

                        <template v-if="row.pipeline">
                            <div :class="$style.statusMeta">
                                <span :class="$style.statusCount">{{ row.funnel.status_ids.length }} из {{ row.pipeline.statuses.length }}</span>
                                <button
                                    v-if="row.pipeline.statuses.length"
                                    type="button"
                                    :class="$style.statusAllBtn"
                                    @click="setStatusesAll(row.index, !isAllSelected(row))"
                                >{{ isAllSelected(row) ? 'Сбросить' : 'Выбрать все' }}</button>
                            </div>

                            <div :class="$style.chips">
                                <span
                                    v-for="status in row.pipeline.statuses"
                                    :key="`st-${status.id}`"
                                    :class="[$style.chip, { [$style.selected]: row.funnel.status_ids.includes(Number(status.id)) }]"
                                    @click="onStatusToggle(row)(status.id)"
                                >{{ status.name }}</span>

                                <span
                                    v-for="missingId in missingStatusIds(row)"
                                    :key="`missing-${missingId}`"
                                    :class="$style.chipMissing"
                                    title="Этот статус удалён из воронки в amoCRM. Он не будет учитываться."
                                    @click="onStatusToggle(row)(missingId)"
                                >Статус #{{ missingId }} (не найден)</span>
                            </div>

                            <div v-if="!row.funnel.status_ids.length" :class="$style.rowWarn">
                                Отметьте хотя бы одну стадию — без стадий фильтр в этой воронке не работает.
                            </div>

                            <!-- источник ответственного (ТЗ Q1: выбор по воронке) -->
                            <div role="radiogroup" aria-label="Источник ответственного" :class="$style.radioGroup">
                                <label v-for="mode in MODES" :key="mode.value" :class="$style.radioLabel">
                                    <input
                                        type="radio"
                                        :name="`stf-funnel-mode-${row.index}`"
                                        :value="mode.value"
                                        :checked="row.funnel.mode === mode.value"
                                        @change="onModeChange(row.index)(mode.value)"
                                    >
                                    <span>{{ mode.label }}</span>
                                </label>
                            </div>

                            <template v-if="row.funnel.mode === 'custom'">
                                <div :class="$style.customFieldRow">
                                    <div v-if="responsibleFieldOptions.length" :class="$style.fieldSelectWrap">
                                        <ui-searchable-select
                                            :model-value="row.funnel.custom_field_id"
                                            :options="responsibleFieldOptions"
                                            placeholder="Выберите поле с user_id..."
                                            @update:model-value="onCustomFieldChange(row.index)($event)"
                                        />
                                    </div>
                                    <div v-else :class="$style.emptyHint">Доступные поля типа «текст/число» не найдены.</div>
                                </div>
                                <div :class="$style.hint">
                                    Поле должно содержать user_id дополнительного ответственного. Если в поле пусто или id не резолвится — используется базовый ответственный сделки.
                                </div>
                            </template>

                            <!-- правила скрытия (ТЗ Q3/Q4/Q5) -->
                            <div :class="$style.checkboxGroup">
                                <label v-for="flag in HIDE_FLAGS" :key="flag.key" :class="$style.checkboxLabel">
                                    <input
                                        type="checkbox"
                                        :checked="row.funnel[flag.key]"
                                        @change="onHideFlagChange(row.index)(flag.key)($event)"
                                    >
                                    <span>{{ flag.label }}</span>
                                </label>
                            </div>
                        </template>

                        <div v-if="cardErrors[row.index]" :class="$style.cardError">
                            {{ cardErrors[row.index] }}
                        </div>
                    </div>

                    <div v-if="!funnels.length" :class="$style.emptyHint">
                        Добавьте воронку — без настроек виджет не работает ни в одной воронке.
                    </div>

                    <button
                        type="button"
                        :class="[$style.addBtn, { [$style.addBtnDisabled]: !canAddFunnel }]"
                        :disabled="!canAddFunnel"
                        @click="addFunnel()"
                    >+ Добавить воронку</button>

                    <!-- футер: сброс + сохранение (скрыто при 403) -->
                    <div v-if="!isForbidden" :class="$style.footer">
                        <button
                            type="button"
                            :class="$style.linkBtn"
                            :disabled="!isDirty || isSaving"
                            @click="resetToBaseline()"
                        >Сбросить изменения</button>
                        <ui-button
                            :label="isSaving ? 'Сохранение...' : 'Сохранить'"
                            :disabled="isSaving"
                            @click="save()"
                        />
                    </div>
                    <div v-else :class="$style.forbiddenNote">
                        Сохранение настроек доступно только администраторам аккаунта.
                    </div>
                </template>
            </div>
        </ui-flex-container>
    </div>
</template>

<style module lang="css">
.root {
    width: 100%;
    box-sizing: border-box;
    padding-top: 16px;
}

.title {
    font-size: 13px;
    font-weight: 700;
    color: #363b44;
    letter-spacing: 0.2px;
}

.hint {
    font-size: 12px;
    color: #9da5b0;
    line-height: 1.4;
}

.card {
    background: #fff;
    border: 1px solid #e8eaeb;
    border-radius: 4px;
    padding: 16px;
    box-sizing: border-box;
    width: 100%;
}

.cardTitle {
    font-size: 13px;
    font-weight: 600;
    color: #363b44;
    margin-bottom: 4px;
}

.syncRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 8px;
    flex-wrap: wrap;
}

.syncMeta {
    font-size: 12px;
    color: #363b44;
}

.infoBanner {
    margin-top: 8px;
    padding: 8px 10px;
    background: #e6f7ff;
    border: 1px solid #91d5ff;
    border-radius: 4px;
    font-size: 12px;
    color: #0b6fa3;
    line-height: 1.4;
}

.syncRunning {
    margin-top: 8px;
    font-size: 12px;
    color: #21a6d8;
}

.emptyHint {
    font-size: 13px;
    color: #9da5b0;
    padding: 8px 0;
}

.funnelCard {
    margin-top: 10px;
    border: 1px solid #e8eaeb;
    border-radius: 4px;
    padding: 10px 12px;
    background: #fafbfc;
}

.cardHeader {
    display: flex;
    align-items: center;
    gap: 8px;
}

.selectWrap {
    flex: 1 1 auto;
    min-width: 0;
}

.warningChip {
    display: inline-block;
    padding: 4px 10px;
    border: 1px solid #ffe58f;
    border-radius: 12px;
    background: #fffbe6;
    color: #ad6800;
    font-size: 13px;
    line-height: 24px;
}

.statusMeta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 8px;
    font-size: 12px;
}

.statusCount {
    color: #9da5b0;
}

.statusAllBtn {
    flex-shrink: 0;
    display: inline-block;
    margin-left: auto;
    padding: 3px 10px;
    font-size: 12px;
    line-height: 1.4;
    color: #21a6d8;
    background: #fff;
    border: 1px solid #cfe3ee;
    border-radius: 3px;
    cursor: pointer;
    user-select: none;
}

.statusAllBtn:hover {
    background: #f0f9fd;
    border-color: #21a6d8;
}

.chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
}

.chip {
    max-width: 100%;
    padding: 4px 10px;
    border: 1px solid #e8eaeb;
    border-radius: 12px;
    cursor: pointer;
    font-size: 13px;
    color: #363b44;
    background: #fff;
    user-select: none;
}

.chip:hover {
    background: #f5f5f5;
}

.selected {
    background: #e6f7ff;
    border-color: #21a6d8;
    color: #0b6fa3;
}

.chipMissing {
    max-width: 100%;
    padding: 4px 10px;
    border: 1px dashed #ffc53d;
    border-radius: 12px;
    cursor: pointer;
    font-size: 13px;
    color: #ad6800;
    background: #fffbe6;
    user-select: none;
}

.chipMissing:hover {
    background: #fff7d6;
}

.rowWarn {
    font-size: 12px;
    color: #ff8a00;
    line-height: 1.4;
    margin-top: 6px;
}

.radioGroup {
    display: flex;
    gap: 16px;
    margin-top: 12px;
    flex-wrap: wrap;
}

.radioLabel {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #363b44;
    cursor: pointer;
    user-select: none;
}

.checkboxGroup {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 12px;
}

.checkboxLabel {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 13px;
    color: #363b44;
    cursor: pointer;
    user-select: none;
    line-height: 1.4;
}

.checkboxLabel input,
.radioLabel input {
    margin-top: 2px;
    accent-color: #21a6d8;
    flex-shrink: 0;
}

.customFieldRow {
    margin-top: 10px;
}

.fieldSelectWrap {
    max-width: 420px;
}

.cardError {
    margin-top: 8px;
    font-size: 12px;
    color: #ff3b30;
    line-height: 1.4;
}

.errorBanner {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-top: 8px;
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

.bannerClose {
    cursor: pointer;
    color: #b23b3b;
    font-size: 14px;
    line-height: 1;
    padding: 2px;
}

.addBtn {
    display: block;
    width: 100%;
    margin-top: 12px;
    padding: 9px 0;
    font-size: 13px;
    color: #21a6d8;
    background: transparent;
    border: 1px dashed #bcd7e5;
    border-radius: 4px;
    cursor: pointer;
}

.addBtn:hover {
    background: #f0f9fd;
    border-color: #21a6d8;
}

.addBtnDisabled {
    color: #b9c0cc;
    border-color: #e8eaeb;
    cursor: not-allowed;
    pointer-events: none;
}

.footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 16px;
    flex-wrap: wrap;
}

.linkBtn {
    font-size: 13px;
    color: #9da5b0;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 3px;
}

.linkBtn:hover:not(:disabled) {
    color: #21a6d8;
    background: #f0f9fd;
}

.linkBtn:disabled {
    color: #cfd4dc;
    cursor: not-allowed;
}

.forbiddenNote {
    margin-top: 12px;
    font-size: 12px;
    color: #ad6800;
    background: #fffbe6;
    border: 1px solid #ffe58f;
    border-radius: 4px;
    padding: 8px 10px;
}
</style>
