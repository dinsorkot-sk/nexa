<script setup lang="ts">
import { computed } from 'vue';
import NxAvatar from './NxAvatar.vue';

export interface NxAvatarGroupItem {
  name: string;
  src?: string;
}

/** The mockup's AvatarGroup section: overlapping avatars at two sizes, with a "+N" counter when there are more. */
const props = withDefaults(defineProps<{
  items: NxAvatarGroupItem[];
  max?: number;
  size?: 'sm' | 'md';
  label: string;
}>(), { max: 4, size: 'md' });

const visible = computed(() => props.items.slice(0, Math.max(0, props.max)));
const remaining = computed(() => Math.max(0, props.items.length - visible.value.length));
const counterSize: Record<'sm' | 'md', string> = { sm: 'size-6 text-[11px]', md: 'size-8 text-[11px]' };
</script>

<template>
  <div
    role="group"
    :aria-label="label"
    class="flex items-center -space-x-2"
  >
    <NxAvatar
      v-for="(item, index) in visible"
      :key="`${item.name}-${index}`"
      :name="item.name"
      :src="item.src"
      :size="size"
      class="ring-2 ring-ui-bg"
    />
    <span
      v-if="remaining"
      :class="['inline-flex shrink-0 items-center justify-center rounded-full bg-ui-bg-accented font-medium text-ui-text-toned ring-2 ring-ui-bg', counterSize[size]]"
      :aria-label="`${remaining} more`"
    >+{{ remaining }}</span>
  </div>
</template>
