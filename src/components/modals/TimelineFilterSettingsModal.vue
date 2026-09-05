<script setup lang="ts">
// @ts-ignore
import UiModalContainer from 'components/base/UiModalContainer.vue';
// @ts-ignore
import TimelineFilterSettingsSection from 'components/modals/timelinefilter/TimelineFilterSettingsSection.vue';

const emit = defineEmits(['apply', 'close']);

// Крестик контейнера — закрытие без сохранения (состояние черновика живёт в секции и сбрасывается вместе с unmount)
const onClose = (): void => {
    emit('close');
};
</script>
<template>
    <ui-modal-container @close="onClose">
        <!-- Прокручиваемая область: контента много (карточки сотрудников/групп + воронок) -->
        <div :class="$style.scrollArea">
            <timeline-filter-settings-section @saved="emit('apply')" />
        </div>
    </ui-modal-container>
</template>

<style module lang="css">
.scrollArea {
    overflow-y: auto;
    max-height: 65vh;
    min-height: 0;
    padding-right: 4px;
}
</style>
