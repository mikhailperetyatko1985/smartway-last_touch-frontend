<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
//@ts-ignore
import SettingsSetTemporaryTokenModal from 'components/modals/SettingsSetTemporaryTokenModal.vue';
import { useAmoCrmStore } from 'stores/useAmoCrmStore';
//@ts-ignore
import UiFlexContainer from 'components/base/UiFlexContainer.vue';
//@ts-ignore
import UiLoadingText from 'components/base/UiLoadingText.vue';
import { ISettingsList } from 'interfaces/ISettingsList';
import { Nullable } from 'types/language';
//@ts-ignore
import SettingsSetLongLivedTokenModal from 'components/modals/SettingsSetLongLivedTokenModal.vue';
//@ts-ignore
import UiButton from 'components/base/UiButton.vue';
import { closeModal, container as WidgetContainerModal, openModal } from 'jenesius-vue-modal';
//@ts-ignore
import UiText from 'components/base/UiText.vue';
const isOpenSetOauthModal = ref(false);
const isOpenSetLongLivedModal = ref(false);

const { getApi, showError } = useAmoCrmStore();
const pendingStatus = reactive({
    settings: true,
});
const settings = ref<Nullable<ISettingsList>>(null);

const getSettings = async () => {
    //@ts-ignore
    if (!getApi.value) {
        showError('Что-то пошло не так, как мы задумывали, повторите запрос позднее');
        return;
    }

    pendingStatus.settings = true;
    try {
        settings.value = await getApi.value?.settingsApi.list();
    } finally {
        pendingStatus.settings = false;
    }
}

const isLoading = computed(() => Object.values(pendingStatus).some(isPendingStatus => isPendingStatus));

watch(
    () => isOpenSetLongLivedModal.value,
    async (value) => {
        if (!value) return;
        const modal = await openModal(SettingsSetLongLivedTokenModal, {
            'expired-at': settings.value?.token_expired_at || '',
        });
        modal.onclose = () => {
            isOpenSetLongLivedModal.value = false
        };
        modal.on('close', () => {
            closeModal();
        });
        modal.on('apply', () => {
            closeModal();
            getSettings();
        });
    },
);

watch(
    () => isOpenSetOauthModal.value,
    async (value) => {
        if (!value) return;
        const modal = await openModal(SettingsSetTemporaryTokenModal, {
            'expired-at': settings.value?.token_expired_at || '',
        });
        modal.on('close', () => {
            closeModal();
        });
        modal.on('apply', () => {
            closeModal();
            getSettings();
        });
        modal.onclose = () => {
            isOpenSetOauthModal.value = false;
        };
    },
);

getSettings();

</script>
<template>
    <ui-flex-container
        v-if="isLoading"
        direction="col"
    >
        <ui-loading-text text="Загрузка" />
    </ui-flex-container>
    <ui-flex-container
        v-else
        direction="col"
        row-gap="rg12"
    >
        <ui-text v-if="settings?.token_expired_at" underscore="solid">
            Установленный токен доступа истекает: {{ settings?.token_expired_at || '-' }}
        </ui-text>
        <ui-text v-else underscore="solid">
            Токен доступа не установлен или просрочен! Вы можете настроить долгосрочный или временный токен доступа, взяв данные из вкладки "Ключи и доступы".
        </ui-text>
        <ui-flex-container align-items="center">
            <ui-text text="Доступные опции настроек" />
        </ui-flex-container>
        <ui-button label="Установить долгосрочный токен доступа" @click="isOpenSetLongLivedModal = true" />
        <ui-button label="Установить временный токен доступа" @click="isOpenSetOauthModal = true" />
        <widget-container-modal :class="$style.modalContainer" />
    </ui-flex-container>
</template>
<style module lang="css">
.modalContainer{
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1;
    background-color: #3e3e3e21;
}
</style>
