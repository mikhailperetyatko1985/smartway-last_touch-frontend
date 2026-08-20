<script lang="ts" setup>
import { computed, useCssModule } from 'vue';
import {
  ColorOptions,
  UnderscoreOptions,
  FontSizeOptions,
  FontWeightsOptions,
  LineHeightOptions,
  LetterSizeOptions,
  DisplayOptions,
  CursorOptions,
  WrapOptions,
} from 'types/ui';

const props = withDefaults(defineProps<{
  text?: string | number;
  underscore?: UnderscoreOptions;
  color?: ColorOptions;
  size?: FontSizeOptions;
  weight?: FontWeightsOptions;
  line?: LineHeightOptions;
  letter?: LetterSizeOptions;
  cursor?: CursorOptions;
  wrap?: WrapOptions;
  display?: DisplayOptions;
}>(), {
  color: 'default',
  text: '',
  underscore: '',
  size: 'fs300',
  weight: '',
  line: '',
  letter: '',
  cursor: '',
  wrap: '',
  display: '',
});

const $style = useCssModule();
const classDisplay = computed(() => props.display);

</script>

<template>
    <span
        :class="[
          $style[weight],
          $style[cursor],
          $style[color],
          $style[size],
          $style[line],
          $style[underscore],
          $style[wrap],
          $style[letter],
          classDisplay,
        ]"
    >
        <slot>{{ text }}</slot>
    </span>
</template>

<style module lang="css">
.pointer {
  cursor: pointer;
}

.block {
  display: block;
}

.default {
  color: rgba(38, 40, 44, 1);
}

.fs50 {
  font-size: 10px;
}

.fs100 {
  font-size: 12px;
}

.fs200 {
  font-size: 14px;
}

.fs300 {
  font-size: 16px;
}

.fs400 {
  font-size: 20px;
}

.fs500 {
  font-size: 24px;
}

.fs600 {
  font-size: 28px;
}

.lh50 {
  line-height: 12px;
}

.lh100 {
  line-height: 16px;
}

.lh200 {
  line-height: 20px;
}

.lh300 {
  line-height: 24px;
}

.lh400 {
  line-height: 28px;
}

.lh500 {
  line-height: 32px;
}

.lh600 {
  line-height: 40px;
}

.fw400 {
  font-weight: 400;
}

.fw500 {
  font-weight: 500;
}

.fw600 {
  font-weight: 600;
}

.ls200 {
    letter-spacing: 0.015em;
}

.ls200 {
  letter-spacing: 0.025em;
}

.ls400 {
  letter-spacing: 0.015em;
}

.dotted {
  text-decoration: underline dotted;
  text-underline-position: under;
}

.dashed {
  text-decoration: underline dashed;
  text-underline-position: under;
}

.solid {
  text-decoration: underline solid;
  text-underline-position: under;
}

.nowrap {
  white-space: nowrap;
}

.balance {
  text-wrap: balance;
}
</style>
