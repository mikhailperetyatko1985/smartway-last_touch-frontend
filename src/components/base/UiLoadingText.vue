<script setup lang="ts">
import { ref } from 'vue';
//@ts-ignore
import UiText from 'components/base/UiText.vue';
//@ts-ignore
import UiFlexContainer from 'components/base/UiFlexContainer.vue';

const props = defineProps({
    text: {
        type: String,
        required: true,
    },
    interval: {
        type: Number,
        default: 500,
    },
});

let stage = '';
const loading = ref(props.text);

const animate = () => {
    if (stage.length < 3) {
        stage += '.';
    } else {
        stage = '';
    }

    loading.value = props.text + stage;
};

setInterval(() => animate(), props.interval);

</script>
<template>
    <ui-flex-container>
        <ui-text size="fs300" :text="loading" />
    </ui-flex-container>
</template>
