<script setup lang="ts">
const props = withDefaults(defineProps<{
  code: string | Record<string, unknown>;
  language?: 'formula' | 'json';
  maxHeight?: string;
}>(), { language: 'json', maxHeight: 'none' });

const copied = ref(false);

const lines = computed(() => {
  if (typeof props.code === 'string') return props.code.split('\n');
  if (props.language === 'formula') return String(props.code).split('\n');
  return JSON.stringify(props.code, null, 2).split('\n');
});

async function copy() {
  await navigator.clipboard.writeText(lines.value.join('\n'));
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 1500);
}
</script>

<template>
  <div class="relative overflow-hidden rounded-lg border border-default bg-[--ui-bg-muted]">
    <div class="flex items-center justify-between border-b border-default px-3 py-1.5">
      <span class="text-nexa-caption font-medium text-dimmed uppercase">{{ language }}</span>
      <UButton icon="i-lucide-copy" variant="ghost" size="xs" square :aria-label="t('common.copy')" @click="copy" />
    </div>
    <div class="overflow-auto p-3" :style="{ maxHeight }">
      <div class="flex gap-3 font-mono text-nexa-mono-small">
        <div v-if="language === 'formula'" class="select-none text-right text-dimmed" aria-hidden="true">
          <div v-for="(line, i) in lines" :key="i" class="leading-5">{{ i + 1 }}</div>
        </div>
        <pre class="min-w-0 flex-1 whitespace-pre-wrap break-all text-default">{{ lines.join('\n') }}</pre>
      </div>
    </div>
    <div v-if="copied" class="pointer-events-none absolute top-2 right-2 text-nexa-caption text-muted">{{ t('common.copied') }}</div>
  </div>
</template>
