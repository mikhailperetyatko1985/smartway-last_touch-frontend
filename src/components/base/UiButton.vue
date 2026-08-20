<script setup lang="ts">
import {
    PropType,
} from 'vue';

defineProps({
    label: {
        type: String,
        required: true,
    },
    disabled: {
        type: Boolean,
        default: false,
    },
    type: {
        type: String as PropType<'button'|'submit'|'reset'>,
        default: 'button',
    },
});

const emit = defineEmits(['click']);

</script>
<template>
    <button
        :type="type"
        :class="[$style.container, { [$style.disabled]: disabled }]"
        :disabled="disabled"
        @click.stop="emit('click')"
    >
        <slot>
            {{ label }}
        </slot>
    </button>
</template>
<style module lang="css">
    .container {
        position: relative;
        display: inline-block;
        max-height: 38px;
        padding: 10px;
        font-size: 14px;
        font-weight: bold;
        line-height: 14px;
        white-space: nowrap;
        vertical-align: middle;
        text-decoration: none;
        color: #363b44;
        border: 1px solid #e8eaeb;
        border-radius: 3px;
        background: #ffffff;
        outline: none;
        cursor: pointer;
        -webkit-user-select: none;
        -moz-user-select: none;
        user-select: none;
    }
    .container:active {
        transform: translateY(1px);
    }
    .disabled {
        color: #92989b;
    }
</style>