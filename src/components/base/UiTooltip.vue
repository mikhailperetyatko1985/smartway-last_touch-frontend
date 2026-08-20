<script setup lang="ts">
import { ref, computed } from 'vue';

interface Props {
    visible: boolean;
    targetElement?: HTMLElement | null;
    tooltipText: string;
    warningText?: string;
    offset?: number;
}

const props = withDefaults(defineProps<Props>(), {
    targetElement: null,
    warningText: '',
    offset: 50,
});

const tooltipPosition = computed(() => {
    if (!props.targetElement) {
        return { top: 0, left: 0 };
    }
    const rect = props.targetElement.getBoundingClientRect();
    return {
        top: rect.top - props.offset,
        left: rect.left + rect.width / 2,
    };
});
</script>

<template>
    <Teleport to="body">
        <div
            v-if="visible"
            :class="$style.tooltip"
            :style="{
                top: `${tooltipPosition.top}px`,
                left: `${tooltipPosition.left}px`,
            }"
        >
            {{ tooltipText }}<br />
            <span v-if="warningText" :class="$style.tooltipWarning">⚠️ {{ warningText }}</span>
            <div :class="$style.tooltipArrow"></div>
        </div>
    </Teleport>
</template>

<style module lang="css">
.tooltip {
    position: fixed;
    transform: translateX(-50%);
    background: #1f2937;
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    line-height: 1.4;
    z-index: 9999;
    max-width: 250px;
    text-align: center;
    pointer-events: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.tooltipWarning {
    color: #fcd34d;
}

.tooltipArrow {
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid #1f2937;
}
</style>
