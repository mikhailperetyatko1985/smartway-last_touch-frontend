<script setup lang="ts">
import {
    FlexDirectionOptions,
    FlexHeightOptions,
    FlexWidthOptions,
    FlexRadiusOptions,
    FlexBGOptions,
    FlexPaddingOptions,
    FlexGapOptions,
    FlexColGapOptions,
    FlexRowGapOptions,
    FlexAlignItemsOptions,
    FlexAlignContentOptions,
    FlexAlignSelfOptions,
    FlexJustifyItemsOptions,
    FlexJustifyContentOptions,
    FlexJustifySelfOptions,
    FlexWrapOptions,
} from 'types/ui';

withDefaults(defineProps<{
    direction?: FlexDirectionOptions;
    height?: FlexHeightOptions;
    width?: FlexWidthOptions;
    radius?: FlexRadiusOptions;
    bg?: FlexBGOptions;
    padding?: FlexPaddingOptions;
    paddingInline?: FlexPaddingOptions;
    paddingBlock?: FlexPaddingOptions;
    gap?: FlexGapOptions;
    colGap?: FlexColGapOptions;
    rowGap?: FlexRowGapOptions;
    alignItems?: FlexAlignItemsOptions;
    alignContent?: FlexAlignContentOptions;
    alignSelf?: FlexAlignSelfOptions;
    justifyItems?: FlexJustifyItemsOptions;
    justifyContent?: FlexJustifyContentOptions;
    justifySelf?: FlexJustifySelfOptions;
    wrap?: FlexWrapOptions;
    grow?: boolean;
}>(), {
    direction: '',
    radius: 'r8',
    alignItems: '',
    alignContent: '',
    alignSelf: '',
    justifyItems: '',
    justifyContent: '',
    justifySelf: '',
    wrap: '',
    height: '',
    width: '',
    bg: '',
    padding: '',
    paddingInline: '',
    paddingBlock: '',
    gap: '',
    colGap: '',
    rowGap: '',
    grow: false,
});
</script>
<template>
    <div
        :class="[
      $style.container,
      $style[direction],
      $style[height],
      $style[width],
      $style[radius],
      $style[bg],
      $style[padding],
      $style[paddingInline],
      $style[paddingBlock],
      $style[gap],
      $style[colGap],
      $style[rowGap],
      {
        [$style.wrap]: !!wrap,
        [$style.grow]: !!grow,
        [$style['align-items']]: !!alignItems,
        [$style['align-self']]: !!alignSelf,
        [$style['align-content']]: !!alignContent,
        [$style['justify-items']]: !!justifyItems,
        [$style['justify-content']]: !!justifyContent,
        [$style['justify-self']]: !!justifySelf,
      }
    ]"
        :style="{
      'align-items': alignItems || undefined,
      'align-self': alignSelf || undefined,
      'align-content': alignContent || undefined,
      'justify-items': justifyItems || undefined,
      'justify-content': justifyContent || undefined,
      'justify-self': justifySelf || undefined,
      'flex-wrap': wrap || undefined,
    }"
    >
        <slot />
    </div>
</template>

<style module lang="css">
.container {
    display: flex;
}

.col {
    flex-direction: column;
}

.reverse {
    flex-direction: row-reverse;
}

.col-reverse {
    flex-direction: column-reverse;
}

.hfull {
    height: 100%;
}

.wfull {
    width: 100%;
}

.r0 {
    border-radius: 0;
}

.r2 {
    border-radius: 2px;
}

.r4 {
    border-radius: 4px;
}

.r6 {
    border-radius: 6px;
}

.r8 {
    border-radius: 8px;
}

.r16 {
    border-radius: 16px;
}

.default {
    background-color: #fff;
}

.grow {
    flex-grow: 1;
}

/* Padding classes */
.p2 { padding: 2px; }
.p4 { padding: 4px; }
.p6 { padding: 6px; }
.p8 { padding: 8px; }
.p12 { padding: 12px; }
.p16 { padding: 16px; }
.p20 { padding: 20px; }
.p24 { padding: 24px; }
.p28 { padding: 28px; }
.p32 { padding: 32px; }
.p48 { padding: 48px; }
.p64 { padding: 64px; }

/* Padding inline classes */
.pi2 { padding-inline: 2px; }
.pi4 { padding-inline: 4px; }
.pi6 { padding-inline: 6px; }
.pi8 { padding-inline: 8px; }
.pi12 { padding-inline: 12px; }
.pi16 { padding-inline: 16px; }
.pi20 { padding-inline: 20px; }
.pi24 { padding-inline: 24px; }
.pi28 { padding-inline: 28px; }
.pi32 { padding-inline: 32px; }
.pi48 { padding-inline: 48px; }
.pi64 { padding-inline: 64px; }

/* Padding block classes */
.pb2 { padding-block: 2px; }
.pb4 { padding-block: 4px; }
.pb6 { padding-block: 6px; }
.pb8 { padding-block: 8px; }
.pb12 { padding-block: 12px; }
.pb16 { padding-block: 16px; }
.pb20 { padding-block: 20px; }
.pb24 { padding-block: 24px; }
.pb28 { padding-block: 28px; }
.pb32 { padding-block: 32px; }
.pb48 { padding-block: 48px; }
.pb64 { padding-block: 64px; }

/* Gap classes */
.g2 { gap: 2px; }
.g4 { gap: 4px; }
.g6 { gap: 6px; }
.g8 { gap: 8px; }
.g12 { gap: 12px; }
.g16 { gap: 16px; }
.g20 { gap: 20px; }
.g24 { gap: 24px; }
.g28 { gap: 28px; }
.g32 { gap: 32px; }
.g48 { gap: 48px; }
.g64 { gap: 64px; }

/* Column gap classes */
.cg2 { column-gap: 2px; }
.cg4 { column-gap: 4px; }
.cg6 { column-gap: 6px; }
.cg8 { column-gap: 8px; }
.cg12 { column-gap: 12px; }
.cg16 { column-gap: 16px; }
.cg20 { column-gap: 20px; }
.cg24 { column-gap: 24px; }
.cg28 { column-gap: 28px; }
.cg32 { column-gap: 32px; }
.cg48 { column-gap: 48px; }
.cg64 { column-gap: 64px; }

/* Row gap classes */
.rg2 { row-gap: 2px; }
.rg4 { row-gap: 4px; }
.rg6 { row-gap: 6px; }
.rg8 { row-gap: 8px; }
.rg12 { row-gap: 12px; }
.rg16 { row-gap: 16px; }
.rg20 { row-gap: 20px; }
.rg24 { row-gap: 24px; }
.rg28 { row-gap: 28px; }
.rg32 { row-gap: 32px; }
.rg48 { row-gap: 48px; }
.rg64 { row-gap: 64px; }

/* Align classes */
.align-items { align-items: v-bind(alignItems); }
.align-self { align-self: v-bind(alignSelf); }
.align-content { align-content: v-bind(alignContent); }
.justify-items { justify-items: v-bind(justifyItems); }
.justify-content { justify-content: v-bind(justifyContent); }
.justify-self { justify-self: v-bind(justifySelf); }
.wrap { flex-wrap: v-bind(wrap); }

</style>
