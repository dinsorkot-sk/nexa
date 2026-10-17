<script setup lang="ts">
import { computed } from 'vue';
import NxAvatar from './NxAvatar.vue';

export interface NxAvatarGroupItem {
  name: string;
  src?: string;
}

const props = withDefaults(defineProps<{
  items: NxAvatarGroupItem[];
  max?: number;
  label: string;
}>(), { max: 4 });

const visible = computed(() => props.items.slice(0, Math.max(0, props.max)));
const remaining = computed(() => Math.max(0, props.items.length - visible.value.length));
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
      size="sm"
      class="ring-2 ring-ui-bg"
    />
    <span
      v-if="remaining"
      class="inline-flex size-6 items-center justify-center rounded-full bg-ui-bg-accented text-[10px] font-medium text-ui-text-toned ring-2 ring-ui-bg"
      :aria-label="`${remaining} more`"
    >+{{ remaining }}</span>
  </div>
</template>
