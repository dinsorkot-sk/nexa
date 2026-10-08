<template>
  <DialogRoot v-model:open="open">
    <DialogTrigger as-child>
      <slot name="trigger" />
    </DialogTrigger>
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/70" />
      <DialogContent class="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-700 bg-slate-900 p-6 text-slate-100 shadow-xl focus:outline-none">
        <DialogTitle class="text-lg font-semibold"><slot name="title" /></DialogTitle>
        <DialogDescription v-if="$slots.description" class="mt-2 text-sm text-slate-400"><slot name="description" /></DialogDescription>
        <div class="mt-5"><slot /></div>
        <DialogClose class="absolute right-4 top-4 rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close dialog">×</DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogTrigger } from 'radix-vue';

const props = defineProps<{ modelValue?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
const open = computed({
  get: () => props.modelValue ?? false,
  set: (value: boolean) => emit('update:modelValue', value),
});
</script>
