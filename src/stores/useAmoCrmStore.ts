import { IWidget } from 'interfaces/IWidget';
import { IManagerApi } from 'interfaces/IManagerApi';
import { IApi } from 'interfaces/IApi';
import { reactive, computed } from 'vue';
import { ISettingsApi } from 'interfaces/ISettingsApi';
import { IPipelineApi } from 'interfaces/IPipelineApi';
import { IPrivilegesApi } from 'interfaces/IPrivilegesApi';
import { ILastTouchSettingsApi } from 'interfaces/ILastTouchSettingsApi';
import { ILastTouchInteractionsApi } from 'interfaces/ILastTouchInteractionsApi';

const instance = reactive({
    widget: null,
    api: null,
}) as { widget: IWidget|null, api: IApi|null };

export function useAmoCrmStore() {
    const isReady = computed(() => instance.widget && instance.api);
    const getWidget = computed<IWidget|null>(() => instance.widget);
    const getApi = computed<IApi|null>(() => instance.api);
    const showError = (text: string) => instance.widget?.app.notifications.show_message_error({ header: 'Внимание!', text });

    const setWidget = (widget: IWidget) => {
        instance.widget = widget;
    };
    const setApi = (
        managerApi: IManagerApi,
        settingsApi: ISettingsApi,
        pipelineApi: IPipelineApi,
        privilegesApi: IPrivilegesApi,
        lastTouchSettingsApi: ILastTouchSettingsApi,
        lastTouchInteractionsApi: ILastTouchInteractionsApi,
    ) => {
        instance.api = {
            managerApi: managerApi,
            settingsApi: settingsApi,
            pipelineApi: pipelineApi,
            privilegesApi: privilegesApi,
            lastTouchSettingsApi: lastTouchSettingsApi,
            lastTouchInteractionsApi: lastTouchInteractionsApi,
        };
    };

    const sendRequest = (url: string, method?: string, payload?: object|string, contentType?: string) => instance.widget?.$authorizedAjax({
        url,
        type: method ?? 'GET',
        data: payload || {},
        contentType: contentType || 'application/json',
    });

    return {
        isReady,
        getApi,
        getWidget,
        setWidget,
        setApi,
        showError,
        sendRequest,
    };
}
