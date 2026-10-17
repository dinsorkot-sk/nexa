<script setup lang="ts">
withDefaults(defineProps<{
  actor: string;
  action: string;
  time: string;
  description?: string;
  kind?: 'create' | 'update' | 'status' | 'comment';
  oldValue?: string;
  newValue?: string;
}>(), {
  description: undefined,
  kind: 'update',
  oldValue: undefined,
  newValue: undefined,
});
</script>

<template>
  <article class="flex gap-3">
    <span
      aria-hidden="true"
      :class="[
        'mt-1.5 size-2 shrink-0 rounded-full ring-4 ring-ui-bg',
        kind === 'create' && 'bg-ui-success',
        kind === 'update' && 'bg-ui-info',
        kind === 'status' && 'bg-ui-warning',
        kind === 'comment' && 'bg-ui-primary',
      ]"
    />
    <div class="min-w-0 flex-1">
      <p class="text-sm text-ui-text">
        <span class="font-medium text-ui-text-highlighted">{{ actor }}</span>
        {{ action }}
      </p>
      <p
        v-if="description"
        class="mt-1 text-sm text-ui-text-toned"
      >
        {{ description }}
      </p>
      <p
        v-if="oldValue !== undefined || newValue !== undefined"
        class="mt-1 flex flex-wrap items-center gap-2 text-xs text-ui-text-muted"
      >
        <span class="line-through">{{ oldValue || '—' }}</span>
        <span aria-hidden="true">→</span>
        <span class="font-medium text-ui-text-toned">{{ newValue || '—' }}</span>
      </p>
      <time
        :datetime="time"
        class="mt-1 block text-xs text-ui-text-muted"
      >{{ time }}</time>
    </div>
    <slot name="trailing" />
  </article>
</template>
