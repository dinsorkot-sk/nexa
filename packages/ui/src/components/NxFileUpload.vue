<script setup lang="ts">
import { ref } from 'vue';
import { Upload } from 'lucide-vue-next';

withDefaults(defineProps<{
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  label: string;
  hint?: string;
}>(), {
  accept: undefined,
  multiple: false,
  disabled: false,
  hint: undefined,
});

const emit = defineEmits<{ select: [files: File[]] }>();
const input = ref<HTMLInputElement>();

function onChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const files = Array.from(target.files ?? []);
  if (files.length) emit('select', files);
  target.value = '';
}
</script>

<template>
  <div>
    <input
      ref="input"
      type="file"
      class="sr-only"
      :accept="accept"
      :multiple="multiple"
      :disabled="disabled"
      @change="onChange"
    >
    <button
      type="button"
      :disabled="disabled"
      class="flex w-full flex-col items-center justify-center rounded-ui border border-dashed border-ui-border-accented bg-ui-bg-muted px-4 py-8 text-center outline-none hover:bg-ui-bg-elevated focus-visible:ring-2 focus-visible:ring-ui-primary disabled:cursor-not-allowed disabled:opacity-50"
      @click="input?.click()"
    >
      <Upload
        class="size-5 text-ui-text-muted"
        aria-hidden="true"
      />
      <span class="mt-2 text-sm font-medium text-ui-text-highlighted">{{ label }}</span>
      <span
        v-if="hint"
        class="mt-1 text-xs text-ui-text-muted"
      >{{ hint }}</span>
    </button>
  </div>
</template>
