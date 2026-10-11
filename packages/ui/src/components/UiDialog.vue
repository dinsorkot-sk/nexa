<template>
  <DialogRoot v-model:open="open">
    <DialogTrigger as-child>
      <slot name="trigger" />
    </DialogTrigger>
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-overlay" />
      <DialogContent class="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6 text-foreground shadow-lg focus:outline-none">
        <DialogTitle class="text-lg font-semibold">
          <slot name="title" />
        </DialogTitle>
        <DialogDescription
          v-if="$slots.description"
          class="mt-2 text-sm text-foreground-muted"
        >
          <slot name="description" />
        </DialogDescription>
        <div class="mt-5">
          <slot />
        </div>
        <DialogClose
          class="absolute right-4 top-4 rounded p-1 text-foreground-subtle hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :aria-label="t('dialog.close')"
        >
          ×
        </DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogTrigger } from 'radix-vue';

/** `modelValue` is optional: without it the dialog keeps its own open state, so the `trigger` slot alone can open it. */
const props = withDefaults(defineProps<{ modelValue?: boolean }>(), {
  // Vue turns an absent boolean prop into false; undefined is what lets the component tell "not controlled" from "closed".
  modelValue: undefined,
});
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
