<script setup lang="ts">
import { Check, Copy } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useNxMessages } from '../lib/locale';
import NxIconButton from './NxIconButton.vue';

/**
 * The mockup's CodeBlock section: an always-dark panel for formulas and package JSON, with the file name, a copy
 * button and one numbered line per row.
 */
const props = withDefaults(defineProps<{
  code: string;
  /** Shown in the header; `language` is kept as a fallback for older callers. */
  filename?: string;
  language?: string;
  label?: string;
  copyable?: boolean;
  lineNumbers?: boolean;
}>(), {
  filename: undefined,
  language: undefined,
  label: undefined,
  copyable: false,
  lineNumbers: true,
});

const emit = defineEmits<{ 'copy-error': [error: unknown] }>();
const copied = ref(false);
const messages = useNxMessages();

const header = computed(() => props.filename ?? props.language);
const lines = computed(() => props.code.replace(/\n$/, '').split('\n'));

async function copy() {
  try {
    await navigator.clipboard.writeText(props.code);
    copied.value = true;
    window.setTimeout(() => { copied.value = false; }, 1500);
  } catch (error) {
    emit('copy-error', error);
  }
}
</script>

<template>
  <div class="overflow-hidden rounded-ui-lg bg-ui-bg-inverted text-ui-text-inverted">
    <div
      v-if="header || copyable"
      class="flex items-center gap-3 border-b border-ui-text-muted/30 px-4 py-2"
    >
      <span class="min-w-0 flex-1 truncate text-xs text-ui-text-inverted/60">{{ header }}</span>
      <NxIconButton
        v-if="copyable"
        :icon="copied ? Check : Copy"
        :label="copied ? messages.copied : messages.copy"
        size="sm"
        @click="copy"
      />
    </div>
    <pre
      :aria-label="label"
      class="flex max-h-[32rem] flex-col gap-0.5 overflow-auto px-4 py-3 font-mono text-[13px] leading-5"
    ><div
      v-for="(line, index) in lines"
      :key="index"
      class="flex gap-3"
    ><span
      v-if="lineNumbers"
      aria-hidden="true"
      class="w-4 shrink-0 select-none text-right text-xs text-ui-text-dimmed"
    >{{ index + 1 }}</span><code class="whitespace-pre text-ui-text-inverted">{{ line === '' ? ' ' : line }}</code></div></pre>
  </div>
</template>
