<script setup lang="ts">
import { ref } from 'vue';
import { useNxMessages } from '../lib/locale';

const props = withDefaults(defineProps<{
  code: string;
  language?: string;
  copyable?: boolean;
}>(), {
  language: undefined,
  copyable: false,
});

const emit = defineEmits<{ 'copy-error': [error: unknown] }>();
const copied = ref(false);
const messages = useNxMessages();

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
  <div class="overflow-hidden rounded-ui border border-ui-border bg-ui-bg-inverted text-ui-text-inverted">
    <div
      v-if="language || copyable"
      class="flex items-center justify-between gap-3 border-b border-ui-text-inverted/15 px-3 py-2 text-xs text-ui-text-inverted/75"
    >
      <span>{{ language }}</span>
      <button
        v-if="copyable"
        type="button"
        class="rounded px-2 py-1 outline-none hover:bg-ui-text-inverted/10 focus-visible:ring-2 focus-visible:ring-ui-primary"
        @click="copy"
      >
        {{ copied ? messages.copied : messages.copy }}
      </button>
    </div>
    <pre class="max-h-[32rem] overflow-auto p-4 text-xs leading-5"><code>{{ code }}</code></pre>
  </div>
</template>
