import {
  App,
  Component,
  createApp,
  h,
  ComponentObjectPropsOptions,
} from 'vue';
import { createPinia } from 'pinia';

export const mountComponent = (
  component: Component,
  props: ComponentObjectPropsOptions,
  targetElement: Element,
): App => {
  const pinia = createPinia();
  const app = createApp({
    render: () => h(component, props),
  });
  app.use(pinia)
  app.mount(targetElement);
  return app;
}