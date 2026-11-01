<script setup lang="ts">
withDefaults(defineProps<{
  label: string;
  icon?: string;
  color?: 'primary' | 'neutral';
}>(), { icon: undefined, color: 'neutral' });

const emit = defineEmits<{ remove: [] }>();
</script>

<template>
  <UBadge :color="color" variant="soft" size="md" class="gap-1.5 py-1">
    <template v-if="icon" #leading>
      <UIcon :name="icon" class="size-3.5" />
    </template>
    {{ label }}
    <template #trailing>
      <UButton icon="i-lucide-x" variant="ghost" size="xs" square class="-me-1" :aria-label="label" @click.stop="emit('remove')" />
    </template>
  </UBadge>
</template>
