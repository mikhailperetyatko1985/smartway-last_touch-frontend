<script setup lang="ts">
import {
    ref,
    watch,
} from 'vue';
// @ts-ignore
import UiButton from 'components/base/UiButton.vue';
// @ts-ignore
import UiFlexContainer from 'components/base/UiFlexContainer.vue';
// @ts-ignore
import UiText from 'components/base/UiText.vue';
// @ts-ignore
import { useAmoCrmStore } from 'stores/useAmoCrmStore';
//@ts-ignore
import UiInput from 'components/base/UiInput.vue';
//@ts-ignore
import UiModalContainer from 'components/base/UiModalContainer.vue';

const { getApi, showError, getWidget } = useAmoCrmStore();

const isLoading = ref(false);

const props = defineProps({
    expiredAt: {
        type: String,
        default: '',
    },
});

const code = ref<string>('');
const request = async () => {
    if (!getApi.value) {
        showError('Что-то пошло не так, как мы задумывали, повторите запрос позднее');
        return;
    }

    if (!code.value.length) {
        showError('Необходимо ввести код');
        return;
    }

    isLoading.value = true;
    try {
        await getApi.value.settingsApi.oauth(
            code.value,
            // @ts-ignore
            getWidget.value?.amocrm?.widgets?.system?.domain,
        );
        emit('apply');
    } finally {
        isLoading.value = false;
    }
};

const onAccept = () => {
    if (isLoading.value) return;
    request();
    close();
};
const onCancel = () => {
    if (isLoading.value) return;
    emit('close');
    close();
};
const onClose = () => {
    if (isLoading.value) return;
    emit('close');
    close();
};

const emit = defineEmits(['apply', 'close', 'cancel', 'update:modelValue']);
watch(
    () => code.value,
    (code) => emit('update:modelValue', code),
);
//@ts-ignore
setTimeout(() => modal.value?.resize());

</script>
<template>
    <ui-modal-container @close="onClose">
        <ui-flex-container
            direction="col"
            gap="g16"
            padding="p4"
        >
            <ui-text
                text="Введите код авторизации, действующий 20 минут"
                size="fs400"
            />
            <ui-input v-model="code" />
            <ui-text v-if="expiredAt?.length">
                Установленный токен доступа действителен до {{ expiredAt }}
            </ui-text>
            <ui-flex-container gap="g16">
                <ui-button
                    label="Сохранить"
                    :disabled="isLoading || !code"
                    @click="onAccept"
                />
                <ui-button
                    label="Отмена"
                    :disabled="isLoading"
                    @click="onCancel"
                />
            </ui-flex-container>
        </ui-flex-container>
    </ui-modal-container>
</template>

