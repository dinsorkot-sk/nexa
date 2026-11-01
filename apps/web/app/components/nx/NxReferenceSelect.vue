<script setup lang="ts">
import type { FieldSpec } from '@nexa/types';
import { useDebounceFn } from '@vueuse/core';

const props = withDefaults(defineProps<{
  field: FieldSpec;
  modelValue?: string;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
}>(), { modelValue: '', placeholder: '', disabled: false, loading: false });

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const { t } = useI18n();
const { recordIds, recordLabel } = useMetadata();

const open = ref(false);
const search = ref('');
const loading = ref(false);

const results = computed(() => {
  if (!props.field.referenceEntity) return [];
  return recordIds(props.field.referenceEntity, search.value, 8).map((r) => ({ label: r.label, value: r.id }));
});

const selectedLabel = computed(() => {
  if (!props.modelValue || !props.field.referenceEntity) return '';
  return recordLabel(props.field.referenceEntity, props.modelValue);
});

const debouncedSearch = useDebounceFn((q: string) => {
  loading.value = true;
  search.value = q;
  setTimeout(() => { loading.value = false; }, 250);
}, 300);

function onSearch(event: Event) {
  debouncedSearch((event.target as HTMLInputElement).value);
}

function select(id: string) {
  emit('update:modelValue', id);
  open.value = false;
  search.value = '';
}

function clear() {
  emit('update:modelValue', '');
  open.value = false;
}
</script>

<template>
  <UPopover v-model:open="open" :popper="{ placement: 'bottom-start' }" class="w-full">
    <template #trigger>
      <UInput
        :model-value="selectedLabel"
        readonly
        :placeholder="placeholder || t('fields.referencePlaceholder')"
        :disabled="disabled"
        icon="i-lucide-search"
        class="w-full cursor-pointer"
        @click="open = true"
      >
        <template #trailing>
          <UIcon v-if="modelValue" name="i-lucide-x" class="size-4 cursor-pointer text-muted" @click.stop="clear" />
          <UIcon v-else name="i-lucide-chevron-down" class="size-4 text-muted" />
        </template>
      </UInput>
    </template>
    <div class="w-72 p-2">
      <UInput :model-value="search" :placeholder="t('fields.search')" autofocus class="mb-2" @update:model-value="onSearch">
        <template #leading>
          <UIcon name="i-lucide-search" class="size-4" />
        </template>
      </UInput>
      <div v-if="loading" class="flex flex-col gap-2 p-1">
        <USkeleton v-for="i in 3" :key="i" class="h-8 w-full rounded-md" />
      </div>
      <div v-else-if="results.length === 0" class="px-2 py-4 text-center text-nexa-body text-muted">
        {{ t('fields.noResults') }}
      </div>
      <div v-else class="flex flex-col">
        <UButton
          v-for="r in results"
          :key="r.value"
          variant="ghost"
          size="sm"
          class="w-full justify-start"
          :active="r.value === modelValue"
          @click="select(r.value)"
        >
          {{ r.label }}
        </UButton>
      </div>
    </div>
  </UPopover>
</template>
