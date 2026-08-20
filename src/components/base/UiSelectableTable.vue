<script setup lang="ts">
import {computed, onMounted, PropType, reactive, ref, watch} from 'vue';
//@ts-ignore
import UiText from 'components/base/UiText.vue';
//@ts-ignore
import UiFlexContainer from 'components/base/UiFlexContainer.vue';
//@ts-ignore
import UiInput from 'components/base/UiInput.vue';

interface IHeader {
    key: string;
    label: string;
    width: number;
}

const props = defineProps({
    modelValue: {
        type: [Array, Object],
        default: () => [],
    },
    items: {
        type: Array,
        required: true,
    },
    header: {
        type: Array as PropType<IHeader[]>,
        required: true,
    },
    id: {
        type: String,
        required: true,
    },
    isMultiple: {
        type: Boolean,
        default: false,
    }
});

const filter = reactive<any>({});
const filteredList = computed(() => {
    const items = [];
    for (let itemIndex in props.items) {
        const item = props.items[itemIndex] as any;
        let matches = 0;
        for (let headerIndex in props.header) {
            const key = props.header[headerIndex]?.key as string;
            const filterItem = filter[key];
            if (
                !filterItem?.length
                || item[key]?.toString().toLowerCase().indexOf(filterItem?.toLowerCase()) > -1
            ) {
                matches++;
            }
        }
        if (matches === props.header.length) {
            items.push(item);
        }

    }

    return items;
});
const emit = defineEmits(['update:modelValue']);
const selected = ref<any[]|any>(props.modelValue);
const isSelected = (item: any) => props.isMultiple
    ? selected.value.some((element: any) => element[props.id] === item[props.id])
    : selected.value?.[props.id] === item[props.id];
const selectedCached = computed(() => {
    let data = {} as any;
    for (let index in selected.value) {
        data[selected.value[index].id] = 1;
    }
    return data;
});
const onSelected = (item: any) => {
    if (isSelected(item)) {
        selected.value = selected.value.filter((element: any) => element[props.id] !== item[props.id]);
        return;
    }

    if (!props.isMultiple) {
        selected.value = [];
    }

    selected.value.push(item);
};
const selectedAmount = computed(() => props.isMultiple ? selected.value?.length : +selected.value?.[props.id]);
watch(
    () => selected.value,
    () => emit('update:modelValue', props.isMultiple ? selected.value : selected.value[0]),
);

const id = 'selectable-table-' + Date.now();
// таким костылем блокируем на странице сделок скролл вверх и его дальнейшую поломку
onMounted(() => document.getElementById(id)?.click());

</script>
<template>
    <ui-flex-container
        :class="$style.container"
        :id="id"
        ref="container"
        width="wfull"
        direction="col"
        row-gap="rg12"
    >
        <ui-flex-container>
            <ui-flex-container
                v-for="{key, label, width} in header"
                :style="{ width: width }"
                :key="key"
                row-gap="rg12"
                width="wfull"
                direction="col"
            >
                <ui-text :text="label" />
                <ui-flex-container width="wfull">
                    <ui-input v-model="filter[key]" />
                </ui-flex-container>
            </ui-flex-container>
        </ui-flex-container>
        <ui-flex-container :class="$style.items" radius="r0">
            <ui-flex-container
                v-for="{key, label, width} in header"
                :style="{ width: width}"
                :key="key"
                row-gap="rg12"
                width="wfull"
                direction="col"
            >
                <ui-text
                    v-for="(item, itemKey) in filteredList"
                    :key="itemKey"
                    :text="item[key]"
                    :class="[{[$style.selected]: selectedCached[item[props.id]]}, $style.item]"
                    @click="onSelected(item)"
                />
            </ui-flex-container>
        </ui-flex-container>
        <ui-flex-container v-if="selectedAmount">
            <ui-text weight="fw500" :text="`Выбрано всего: ${selectedAmount}`" />
        </ui-flex-container>
    </ui-flex-container>
</template>
<style module lang="css">
.container {
    height: 300px;
}
.items {
    overflow-y: scroll;
    overflow-x: hidden;
}
.item {
    cursor: pointer;
}
.selected {
    background-color: lightgray;
}
</style>
