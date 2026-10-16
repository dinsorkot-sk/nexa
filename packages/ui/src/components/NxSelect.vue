<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next';
import { useId } from 'vue';
import { inputStyles } from '../lib/input';

export interface NxSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

defineOptions({ inheritAttrs: false });

withDefaults(defineProps<{
  modelValue?: string | null;
  options: NxSelectOption[];
  /** Shown as a disabled first option while nothing is selected. */
  placeholder?: string;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
}>(), { modelValue: undefined, placeholder: undefined, id: undefined, invalid: false, disabled: false });

const emit = defineEmits<{ 'update:modelValue': [value: string | undefined] }>();
const generatedId = useId();

function onChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  emit('update:modelValue', value === '' ? undefined : value);
}
</script>

<template>
  <div class="relative">
    <select
      :id="id ?? generatedId"
      :value="modelValue ?? ''"
      :disabled="disabled"
      v-bind="$attrs"
      :aria-invalid="invalid || undefined"
      :class="inputStyles({ invalid }) + ' appearance-none pr-9'"
      @change="onChange"
    >
      <option
        v-if="placeholder"
        value=""
        disabled
      >
        {{ placeholder }}
      </option>
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :disabled="option.disabled"
      >
        {{ option.label }}
      </option>
    </select>
    <ChevronDown
      aria-hidden="true"
      class="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ui-text-muted"
    />
  </div>
</template>
