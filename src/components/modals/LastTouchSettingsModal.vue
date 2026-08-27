<script setup lang="ts">
import { onMounted } from 'vue';
import { useLastTouchSettings } from 'composables/useLastTouchSettings';
// @ts-ignore
import UiModalContainer from 'components/base/UiModalContainer.vue';
// @ts-ignore
import UiButton from 'components/base/UiButton.vue';
// @ts-ignore
import UiText from 'components/base/UiText.vue';
// @ts-ignore
import UiFlexContainer from 'components/base/UiFlexContainer.vue';
// @ts-ignore
import LastTouchFunnelsSection from 'components/modals/lasttouch/LastTouchFunnelsSection.vue';
// @ts-ignore
import LastTouchCustomFieldSection from 'components/modals/lasttouch/LastTouchCustomFieldSection.vue';

const { form, pipelines, customFields, isLoading, isSaving, apiError, load, save, resetToBaseline, clearError } = useLastTouchSettings();

const emit = defineEmits(['apply', 'close']);

onMounted(load);

const onSave = async (): Promise<void> => {
    if (isSaving.value) return;
    const ok = await save();
    if (ok) emit('apply');
};

// Отмена — без сохранения: сбрасываем локальные несохранённые изменения.
const onCancel = (): void => {
    if (isSaving.value) return;
    resetToBaseline();
    emit('close');
};

const onClose = (): void => {
    if (isSaving.value) return;
    emit('close');
};
</script>
<template>
    <ui-modal-container @close="onClose">
        <ui-flex-container direction="col" row-gap="rg12">
            <ui-text text="Настройки последнего касания" size="fs400" weight="fw600" />
            <ui-text text="Настройки задаются в разрезе воронок" size="fs100" />
        </ui-flex-container>

        <!-- Прокручиваемая область: skeleton или баннер + секции -->
        <div :class="$style.scrollArea">
            <ui-flex-container v-if="isLoading" direction="col" row-gap="rg12">
                <div v-for="n in 4" :key="n" :class="$style.skeleton" />
            </ui-flex-container>

            <template v-else>
                <div v-if="apiError" :class="$style.banner">
                    <div :class="$style.bannerBody">
                        <div :class="$style.bannerTitle">{{ apiError?.title }}</div>
                        <div :class="$style.bannerText">{{ apiError?.text }}</div>
                    </div>
                    <span :class="$style.bannerClose" @click="clearError">✕</span>
                </div>

                <ui-flex-container direction="col" row-gap="rg12">
                    <last-touch-funnels-section
                        :pipelines="pipelines"
                        :custom-fields="customFields"
                        :model-value="form.funnels"
                        @update:model-value="form.funnels = $event"
                    />
                    <last-touch-custom-field-section
                        :fields="customFields"
                        :model-value="form.customFieldId"
                        @update:model-value="form.customFieldId = $event"
                    />
                </ui-flex-container>
            </template>
        </div>

        <!-- Футер с кнопками всегда виден поверх скролла -->
        <ui-flex-container
            v-if="!isLoading"
            justify-content="flex-end"
            gap="g8"
            :class="$style.footer"
        >
            <ui-button
                label="Отмена"
                :disabled="isSaving"
                @click="onCancel"
            />
            <ui-button
                :label="isSaving ? 'Сохранение...' : 'Сохранить'"
                :disabled="isSaving"
                @click="onSave"
            />
        </ui-flex-container>
    </ui-modal-container>
</template>

<style module lang="css">
.scrollArea {
    overflow-y: auto;
    max-height: 65vh;
    min-height: 0;
    padding-right: 4px;
}

.skeleton {
    height: 56px;
    border-radius: 4px;
    background: linear-gradient(90deg, #ececec 25%, #f5f5f5 37%, #ececec 63%);
    background-size: 400% 100%;
    animation: skeletonPulse 1.4s ease infinite;
}

@keyframes skeletonPulse {
    0% {
        background-position: 100% 50%;
    }
    100% {
        background-position: 0 50%;
    }
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

.bannerClose {
    cursor: pointer;
    color: #b23b3b;
    font-size: 14px;
    line-height: 1;
    padding: 2px;
}

.footer {
    margin-top: 16px;
}
</style>
