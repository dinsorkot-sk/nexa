<script setup lang="ts">
import { Upload } from 'lucide-vue-next';
import { computed, ref } from 'vue';

/**
 * Drop zone for the CSV import, as the mockup's FileUpload section: the dashed box turns primary on hover and
 * shows the error colours with its own message when invalid.
 */
const props = withDefaults(defineProps<{
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  label: string;
  hint?: string;
  invalid?: boolean;
}>(), {
  accept: undefined,
  multiple: false,
  disabled: false,
  hint: undefined,
  invalid: false,
});

const emit = defineEmits<{ select: [files: File[]] }>();
const input = ref<HTMLInputElement>();

const box = computed(() => (props.invalid
  ? 'border-ui-error bg-ui-bg hover:bg-ui-error-soft'
  : 'border-ui-border-accented bg-ui-bg hover:border-ui-primary hover:bg-ui-primary-soft'));

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
      :aria-invalid="invalid || undefined"
      @change="onChange"
    >
    <button
      type="button"
      :disabled="disabled"
      :class="[
        'flex w-full flex-col items-center justify-center gap-2 rounded-ui-lg border border-dashed px-6 py-8 text-center outline-none transition-colors duration-ui ease-ui-out focus-visible:ring-2 focus-visible:ring-ui-primary disabled:cursor-not-allowed disabled:opacity-50',
        box,
      ]"
      @click="input?.click()"
    >
      <Upload
        class="size-6"
        :class="invalid ? 'text-ui-error-text' : 'text-ui-text-muted'"
        aria-hidden="true"
      />
      <span class="text-sm font-medium text-ui-text-highlighted">{{ label }}</span>
      <span
        v-if="hint"
        class="text-xs"
        :class="invalid ? 'text-ui-error-text' : 'text-ui-text-muted'"
      >{{ hint }}</span>
    </button>
  </div>
</template>
