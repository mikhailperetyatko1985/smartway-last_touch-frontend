<script setup lang="ts">
import {ref} from 'vue';
// @ts-ignore
import UiFlexContainer from 'components/base/UiFlexContainer.vue';

const emit = defineEmits(['close']);
</script>
<template>
    <ui-flex-container
        direction="col"
        gap="g16"
        padding="p28"
        :class="$style.container"
    >
        <ui-flex-container
            width="wfull"
            align-items="flex-end"
            direction="reverse"
        >
            <span
                :class="$style.iconContainer"
                class="icon icon-modal-close"
                @click.stop="emit('close')"
            />
        </ui-flex-container>
        <slot />
    </ui-flex-container>
</template>
<style module lang="css">
.container {
    background-color: white;
}
.iconContainer {
    cursor: pointer;
}
.icon {
    width: 13px;
    height: 14px;
    background-position: 0 -465px;
    background-image: url(https://statix.amocrm.ru/frontend/images/interface/sprite.png?aa7a421e06c4ea47135c0286d1f49a8853c8143229fdd9f0448f6569a3853683);
    background-repeat: no-repeat;
    display: block;
}
</style>