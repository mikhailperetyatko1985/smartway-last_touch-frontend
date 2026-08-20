import { computed, reactive } from 'vue';

const triggerInstance = reactive({
  target: Date.now(),
});

export function useTriggerStore() {
  const trigger = () => triggerInstance.target = Date.now();
  const computedTrigger = computed(() => triggerInstance.target);

  return {
    trigger,
    computedTrigger,
  };
}