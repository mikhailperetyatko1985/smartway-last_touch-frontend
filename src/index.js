import { mountComponent } from 'helpers/vueHelper';
import { AmoManagerApi } from 'drivers/amo/AmoManagerApi';
import { useAmoCrmStore } from "stores/useAmoCrmStore";
import { SettingsApi } from 'drivers/backend/SettingsApi';
import Settings from 'components/modals/Settings.vue';
import { AmoPipelineApi } from 'drivers/amo/AmoPipelineApi';
import { PrivilegesApi } from 'drivers/backend/PrivilegesApi';
import { LastTouchSettingsApi } from 'drivers/backend/LastTouchSettingsApi';
import env from './env';

let ModalClass = null;

function Widget() {
  const widget = this;
  window.mountedVue = {};

  const host = env.host;

  // eslint-disable-next-line no-undef
  widget.amocrm = AMOCRM;
  widget.settingsCorrected = false;
  widget.settingsComponentId = 'smartway-settings-modal';
  widget.settingsComponentApp = null;
  widget.isActive = () => Object.values(this.amocrm?.widgets?.list ?? {})
    ?.find((widget) => widget.name === env.widget_name)
    ?.params.active === 'Y';
  // eslint-disable-next-line no-undef
  widget.app = APP;
  widget.currentUser = widget.amocrm?.constant('user');
  widget.inited = false;
  widget.settingsMounted = false;
  widget.modalClass = ModalClass;
  widget.domObservers = {
    notesWrapper: null,
  };
  widget.actionButtonMounted = false;
  widget.settingsObserver = null;
  widget.filterObserver = null;
  const { setWidget, setApi } = useAmoCrmStore();
  setWidget(widget);
  setApi(
    new AmoManagerApi(),
    new SettingsApi(host),
    new AmoPipelineApi(),
    new PrivilegesApi(host),
    new LastTouchSettingsApi(host),
  );

  widget.name = env.widget_name;

  widget.callbacks = {
    async render() {
      return true;
    },

    unMountSettingsComponent() {
      document.querySelector(`#${widget.settingsComponentId}`)?.remove();
      $('.widget_settings_block')?.show();
      widget.settingsMounted = false;
      try {
        widget.settingsComponentApp?.unmount();
      } catch {
        //
      }
    },

    mountSettingsComponent() {
      if (widget.settingsMounted) return true;

      $('.widget_settings_block')?.hide();
      const saveButton = $('button.js-widget-save');
      saveButton?.removeAttr('data-onsave-destroy-modal');
      // В обязательном порядке должен быть клик на этой кнопке
      // (сохранение настроек, в которых нет нужды),
      // иначе код виджета не будет интегрирован в Амо и будет доступен только на странице настроек
      saveButton?.click();
      saveButton?.hide();

      const vueContainer = document.createElement('div');
      vueContainer.id = widget.settingsComponentId;
      const parentContainer = $('.widget-settings__desc-space')
      parentContainer[0]?.appendChild(vueContainer);
      widget.settingsComponentApp = mountComponent(
        Settings,
        {},
        vueContainer
      );
      widget.settingsMounted = true;

      return true;
    },

    init() {
      widget.inited = true;
      return true;
    },

    async settings() {
      widget.callbacks.unMountSettingsComponent();

      if (widget.settingsObserver) {
        widget.settingsObserver.disconnect();
      }

      widget.settingsObserver = new MutationObserver(mutationRecords => {
        if (
          mutationRecords.some(
            (record) => record.addedNodes
              ?.entries()
              ?.find((elements) =>
                elements.find((element) => element.textContent === 'Установить')
              )
          )
          && widget.settingsMounted
        ) {
          widget.callbacks.unMountSettingsComponent();
          return;
        }

        if (
          mutationRecords.some(
            (record) => record.addedNodes
              ?.entries()
              ?.find((elements) =>
                elements.find((element) => element.textContent === 'Отключить')
              )
          )
          && !widget.settingsMounted
        ) {
          widget.callbacks.mountSettingsComponent();
        }
      });

      // наблюдать за всем, кроме атрибутов
      widget.settingsObserver.observe(document.querySelector('.widget-settings__base-space'), {
        childList: true,
        subtree: true, // и более глубокими потомками
      });

      // Скрываем лишние части модалки
      $('.widget_settings_block__input_field')?.hide();
      $('.widget_settings_block__controls.widget_settings_block__controls_top')?.hide();

      if (widget.isActive()) {
        widget.callbacks.mountSettingsComponent();
      }

      return true;
    },

    async onSave() {
      return true;
    },

    bind_actions() {
      return true;
    },

    async destroy() {
      if (widget.filterObserver) {
        widget.filterObserver.disconnect();
      }
      return true;
    },

    dpSettings() {
      return true;
    },
  };

  return widget;
}

// eslint-disable-next-line no-undef
global.define(['lib/components/base/modal'], (Modal) => {
  ModalClass = Modal;
  return Widget;
});
