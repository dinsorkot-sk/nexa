<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <slot name="trigger" />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        :side-offset="6"
        :align="align"
        :class="cn('z-50 w-72 rounded-lg border border-border bg-surface p-4 text-sm text-foreground shadow-lg focus:outline-none', props.class)"
      >
        <slot />
        <PopoverClose
          v-if="closable"
          class="absolute right-2 top-2 rounded p-1 text-foreground-subtle hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :aria-label="t('common.close')"
        >
          ×
        </PopoverClose>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { PopoverClose, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'radix-vue';
import { cn } from '../cn';

const props = withDefaults(defineProps<{
  /** Optional. Without it the popover keeps its own open state, so it works with just a trigger. */
  modelValue?: boolean;
  align?: 'start' | 'center' | 'end';
  closable?: boolean;
  class?: string;
}>(), { modelValue: undefined, align: 'center', closable: false, class: undefined });

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
const { t } = useI18n();
const inner = ref(false);
const open = computed({
  get: () => props.modelValue ?? inner.value,
  set: (value: boolean) => {
    inner.value = value;
    emit('update:modelValue', value);
  },
});
</script>
