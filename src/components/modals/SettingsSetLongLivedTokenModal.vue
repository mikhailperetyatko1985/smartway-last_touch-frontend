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
import UiModalContainer from "components/base/UiModalContainer.vue";

const { getApi, showError } = useAmoCrmStore();

const props = defineProps({
    expiredAt: {
        type: String,
        default: '',
    },
});

const isLoading = ref(false);
const updateToken = async () => {
    if (!getApi.value) {
        showError('Что-то пошло не так, как мы задумывали, повторите запрос позднее');
        return;
    }

    if (!token.value.length) {
        showError('Необходимо ввести токен');
        return;
    }
    isLoading.value = true;
    try {
        await getApi.value.settingsApi.longLivedToken(token.value);
        emit('apply');
    } finally {
        isLoading.value = false;
    }
};

const token = ref<string>('');

const onAccept = () => {
    if (isLoading.value) return;
    updateToken();
};
const onCancel = () => {
    if (isLoading.value) return;
    emit('close');
};
const onClose = () => {
    if (isLoading.value) return;
    emit('close');
};

const emit = defineEmits(['apply', 'close', 'cancel', 'update:modelValue']);
watch(
    () => token.value,
    (newToken) => emit('update:modelValue', newToken),
);

</script>
<template>
    <ui-modal-container @close="onClose">
        <ui-text
            text="Введите ранее созданный токен для авторизации в системе AmoCRM"
            size="fs400"
        />
        <ui-input v-model="token" />
        <ui-text
            v-if="expiredAt.length"
        >
            Срок действия токена истекает: {{ expiredAt }}
        </ui-text>

        <ui-flex-container gap="g16">
            <ui-button
                label="Сохранить"
                :disabled="isLoading || !token.length"
                @click="onAccept"
            />
            <ui-button
                label="Отмена"
                :disabled="isLoading"
                @click="onCancel"
            />
        </ui-flex-container>
    </ui-modal-container>
</template>
