<script setup lang="ts">
import { ref } from "vue";

const props = defineProps({
    modelValue: {
        required: true,
    },
    type: {
        type: String,
        default: 'text',
    },
    autocomplete: {
        type: Boolean,
        default: false,
    },
    placeholder: {
        type: String,
        default: '',
    },
    disabled: {
        type: Boolean,
        default: false,
    },
});

const emit = defineEmits(['update:modelValue']);

</script>
<template>
    <input
        :value="props.modelValue"
        :class="$style.textInput"
        :type="type"
        :placeholder="placeholder"
        :autocomplete="autocomplete ? 'on' : 'off'"
        :disabled="disabled"
        @input="emit('update:modelValue', $event?.target?.value)"
    >
</template>
<style module lang="css">
.textInput {
    line-height: 18px;
    padding-bottom: 5px;
    padding-left: 6px;
    padding-top: 5px;
    border: 1px solid #c5c5c5;
    width: 100%;
    font-size: 16px;
}
</style>