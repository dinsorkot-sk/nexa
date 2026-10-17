<script setup lang="ts">
withDefaults(defineProps<{
  path: string;
  status: 'added' | 'changed' | 'removed';
  before?: string;
  after?: string;
}>(), {
  before: undefined,
  after: undefined,
});
</script>

<template>
  <div class="grid grid-cols-[6rem_minmax(8rem,1fr)_minmax(8rem,1fr)] gap-3 border-b border-ui-border px-3 py-2 text-xs last:border-b-0">
    <span
      :class="[
        'font-medium capitalize',
        status === 'added' && 'text-ui-success-text',
        status === 'changed' && 'text-ui-info-text',
        status === 'removed' && 'text-ui-error-text',
      ]"
    >{{ status }}</span>
    <code class="truncate text-ui-text-highlighted">{{ path }}</code>
    <div class="min-w-0 text-ui-text-toned">
      <span
        v-if="before"
        class="mr-2 line-through text-ui-text-muted"
      >{{ before }}</span>
      <span v-if="after">{{ after }}</span>
    </div>
  </div>
</template>
