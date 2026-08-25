<script setup lang="ts">
const props = defineProps({
    modelValue: {
        type: Boolean,
        required: true,
    },
    disabled: {
        type: Boolean,
        default: false,
    },
});

const emit = defineEmits(['update:modelValue']);

const toggle = (): void => {
    if (props.disabled) {
        return;
    }

    emit('update:modelValue', !props.modelValue);
};
</script>
<template>
    <button
        type="button"
        role="switch"
        :aria-checked="modelValue"
        :class="[
            $style.container,
            { [$style.active]: modelValue, [$style.disabled]: disabled },
        ]"
        :disabled="disabled"
        @click.stop="toggle"
    >
        <span :class="$style.thumb" />
    </button>
</template>
<style module lang="css">
    .container {
        position: relative;
        display: inline-block;
        width: 28px;
        height: 16px;
        padding: 0;
        border: none;
        border-radius: 8px;
        background-color: #c5c5c5;
        outline: none;
        cursor: pointer;
        transition: background-color 0.15s ease;
        -webkit-user-select: none;
        -moz-user-select: none;
        user-select: none;
    }

    .container:focus-visible {
        outline: 2px solid #21a6d8;
        outline-offset: 2px;
    }

    .active {
        background-color: #21a6d8;
    }

    .thumb {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background-color: #ffffff;
        transition: transform 0.15s ease;
    }

    .active .thumb {
        transform: translateX(12px);
    }

    .disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
</style>
