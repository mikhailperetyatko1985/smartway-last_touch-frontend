<script setup lang="ts">
import { computed } from 'vue';
import type { PropType } from 'vue';
import { IPipeline } from 'interfaces/IPipeline';
import { IFunnelEntry, ICallDurationMap } from 'interfaces/ILastTouchSettings';
import { ICustomField } from 'interfaces/ICustomField';
// @ts-ignore
import UiSearchableSelect from 'components/base/UiSearchableSelect.vue';
// @ts-ignore
import LastTouchCallStatusesSection from 'components/modals/lasttouch/LastTouchCallStatusesSection.vue';
// @ts-ignore
import LastTouchDisabledTypesSection from 'components/modals/lasttouch/LastTouchDisabledTypesSection.vue';
// @ts-ignore
import LastTouchResponsibleFieldSection from 'components/modals/lasttouch/LastTouchResponsibleFieldSection.vue';

const props = defineProps({
    pipelines: {
        type: Array as PropType<IPipeline[]>,
        default: () => [],
    },
    customFields: {
        type: Array as PropType<ICustomField[]>,
        default: () => [],
    },
    modelValue: {
        type: Array as PropType<IFunnelEntry[]>,
        required: true,
    },
});

const emit = defineEmits(['update:modelValue']);

interface IRowViewModel {
  entry: IFunnelEntry;
  index: number;
  pipeline?: IPipeline;
}

const pipelineList = computed<IPipeline[]>(() => props.pipelines ?? []);

const rowsView = computed<IRowViewModel[]>(() =>
    props.modelValue.map((entry, index): IRowViewModel => ({
        entry,
        index,
        pipeline: pipelineList.value.find(p => Number(p.id) === Number(entry.pipelineId)),
    })),
);

const canAddRow = computed<boolean>(() =>
    pipelineList.value.some(p => !props.modelValue.some(r => Number(r.pipelineId) === Number(p.id))),
);

// Опции строки = все воронки минус занятые в ДРУГИХ строках, включая свою текущую.
const getOptionsForRow = (index: number): { value: number; label: string }[] => {
    const current = props.modelValue[index];
    if (!current) return [];
    const currentId = Number(current.pipelineId);
    const takenByOthers = new Set<number>();
    props.modelValue.forEach((row, i) => {
        if (i !== index) takenByOthers.add(Number(row.pipelineId));
    });
    return pipelineList.value
        .map(p => ({ value: Number(p.id), label: p.name }))
        .filter(p => p.value === currentId || !takenByOthers.has(p.value));
};

const isStatusOn = (row: IFunnelEntry, statusId: number): boolean => row.statusIds.includes(Number(statusId));

const selectedCount = (row: IRowViewModel): number => row.entry.statusIds.length;

const missingStatusIds = (row: IRowViewModel): number[] => {
    if (!row.pipeline) return [];
    const known = new Set<number>(row.pipeline.statuses.map(s => Number(s.id)));
    return row.entry.statusIds.filter(id => !known.has(Number(id))).map(id => Number(id));
};

const toggleAllStatuses = (index: number, selectAll: boolean): void => {
    const row = props.modelValue[index];
    if (!row) return;
    const pipeline = rowsView.value[index]?.pipeline;
    const knownIds = pipeline ? pipeline.statuses.map(s => Number(s.id)) : [];
    const foreignIds = row.statusIds.filter(id => !knownIds.includes(Number(id)));
    const nextStatusIds = selectAll ? [...knownIds, ...foreignIds] : foreignIds;
    const nextRows = props.modelValue.map((r, i): IFunnelEntry => (i === index ? { ...r, statusIds: nextStatusIds } : r));
    emit('update:modelValue', nextRows);
};

const isAllSelected = (row: IRowViewModel): boolean =>
    !!row.pipeline && row.pipeline.statuses.length > 0 &&
    row.pipeline.statuses.every(s => row.entry.statusIds.includes(Number(s.id)));

const handlePipelineChange = (index: number) => (value: number | string | null): void => {
    if (value === null || value === undefined) {
        removeRow(index);
        return;
    }
    const pipelineId = Number(value);
    if (Number.isNaN(pipelineId)) {
        removeRow(index);
        return;
    }
    const nextRows = props.modelValue.map((row, i): IFunnelEntry => {
        if (i === index) {
            return { ...row, pipelineId, statusIds: [] };
        }
        return { ...row, statusIds: [...row.statusIds] };
    });
    emit('update:modelValue', nextRows);
};

const toggleStatus = (index: number, statusId: number): void => {
    const nextStatusId = Number(statusId);
    const nextRows = props.modelValue.map((row, i): IFunnelEntry => {
        if (i !== index) {
            return { ...row, statusIds: [...row.statusIds] };
        }
        const exists = row.statusIds.includes(nextStatusId);
        return {
            ...row,
            statusIds: exists ? row.statusIds.filter(id => id !== nextStatusId) : [...row.statusIds, nextStatusId],
        };
    });
    emit('update:modelValue', nextRows);
};

const removeRow = (index: number): void => {
    emit('update:modelValue', props.modelValue.filter((_, i) => i !== index));
};

const addRow = (): void => {
    const usedIds = new Set<number>(props.modelValue.map(r => Number(r.pipelineId)));
    const freePipeline = pipelineList.value.find(p => !usedIds.has(Number(p.id)));
    if (!freePipeline) return;
    emit('update:modelValue', [...props.modelValue, {
        pipelineId: Number(freePipeline.id),
        statusIds: [],
        callStatuses: [],
        minCallDurations: {},
        disabledTouchTypes: [],
        responsibleCustomFieldId: null,
    }]);
};

const callValue = (row: IRowViewModel): { statuses: number[]; durations: ICallDurationMap } => ({
    statuses: row.entry.callStatuses,
    durations: row.entry.minCallDurations,
});

const updateCall = (index: number, value: { statuses: number[]; durations: ICallDurationMap }): void => {
    emit('update:modelValue', props.modelValue.map((r, i): IFunnelEntry => (
        i === index
            ? { ...r, callStatuses: [...value.statuses], minCallDurations: { ...value.durations } }
            : r
    )));
};

const updateTypes = (index: number, value: string[]): void => {
    emit('update:modelValue', props.modelValue.map((r, i): IFunnelEntry => (
        i === index ? { ...r, disabledTouchTypes: [...value] } : r
    )));
};

const updateResponsible = (index: number, value: number | null): void => {
    emit('update:modelValue', props.modelValue.map((r, i): IFunnelEntry => (
        i === index ? { ...r, responsibleCustomFieldId: value } : r
    )));
};
</script>

<template>
    <div :class="$style.card">
        <div :class="$style.title">ВОРОНКИ И НАСТРОЙКИ</div>
        <div :class="$style.hint">Пусто = касания считаются по всем воронкам. Для каждой воронки настройте статусы, звонки, типы касаний и доп. ответственного.</div>

        <div v-if="!pipelineList.length" :class="$style.emptyHint">Нет доступных воронок.</div>

        <div
            v-for="row in rowsView"
            :key="row.index"
            :class="$style.funnelCard"
        >
            <div :class="$style.cardHeader">
                <div :class="$style.selectWrap">
                    <ui-searchable-select
                        v-if="row.pipeline"
                        :model-value="row.entry.pipelineId"
                        :options="getOptionsForRow(row.index)"
                        :clearable="false"
                        placeholder="Выберите воронку..."
                        @update:model-value="(v) => handlePipelineChange(row.index)(v)"
                    />
                    <span v-else :class="$style.warningChip">Воронка #{{ row.entry.pipelineId }} не найдена</span>
                </div>

                <button
                    type="button"
                    :class="$style.removeBtn"
                    @click="removeRow(row.index)"
                >Удалить</button>
            </div>

            <template v-if="row.pipeline">
                <div :class="$style.statusMeta">
                    <span :class="$style.statusCount">{{ selectedCount(row) }} из {{ row.pipeline.statuses.length }}</span>
                    <button
                        v-if="row.pipeline.statuses.length"
                        type="button"
                        :class="$style.statusAllBtn"
                        @click="toggleAllStatuses(row.index, !isAllSelected(row))"
                    >{{ isAllSelected(row) ? 'Сбросить' : 'Выбрать все' }}</button>
                </div>

                <div :class="$style.chips">
                    <span
                        v-for="status in row.pipeline.statuses"
                        :key="status.id"
                        :class="[$style.chip, { [$style.selected]: isStatusOn(row.entry, status.id) }]"
                        @click="toggleStatus(row.index, status.id)"
                    >{{ status.name }}</span>

                    <span
                        v-for="missingId in missingStatusIds(row)"
                        :key="`missing-${missingId}`"
                        :class="$style.chipMissing"
                        title="Этот статус удалён из воронки в amoCRM. Он не будет учитываться."
                        @click="toggleStatus(row.index, missingId)"
                    >Статус #{{ missingId }} (не найден)</span>
                </div>

                <div v-if="!row.entry.statusIds.length" :class="$style.rowWarn">
                    Отметьте хотя бы один статус — без статуса воронка не будет учитываться.
                </div>

                <div :class="$style.subSections">
                    <last-touch-call-statuses-section
                        :model-value="callValue(row)"
                        @update:model-value="(v) => updateCall(row.index, v)"
                    />
                    <last-touch-disabled-types-section
                        :model-value="row.entry.disabledTouchTypes"
                        @update:model-value="(v) => updateTypes(row.index, v)"
                    />
                    <last-touch-responsible-field-section
                        :fields="customFields"
                        :model-value="row.entry.responsibleCustomFieldId"
                        @update:model-value="(v) => updateResponsible(row.index, v)"
                    />
                </div>
            </template>
        </div>

        <button
            type="button"
            :class="[$style.addBtn, { [$style.addBtnDisabled]: !canAddRow }]"
            :disabled="!canAddRow"
            @click="addRow"
        >+ Добавить воронку</button>
    </div>
</template>

<style module lang="css">
.card {
    background: #fff;
    border: 1px solid #e8eaeb;
    border-radius: 4px;
    padding: 16px;
    box-sizing: border-box;
    width: 100%;
}

.title {
    font-size: 13px;
    font-weight: 600;
    color: #363b44;
    margin-bottom: 4px;
}

.hint {
    font-size: 12px;
    color: #9da5b0;
    line-height: 1.4;
    margin-bottom: 12px;
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

.removeBtn {
    flex-shrink: 0;
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    color: #c22f2f;
    background: transparent;
    border: 1px solid transparent;
    padding: 5px 8px;
    border-radius: 3px;
    user-select: none;
}

.removeBtn:hover {
    color: #a02424;
    background: #fff1f0;
    border-color: #ffa39e;
}

.rowWarn {
    font-size: 12px;
    color: #ff8a00;
    line-height: 1.4;
    margin-top: 6px;
}

.subSections {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 12px;
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
</style>
