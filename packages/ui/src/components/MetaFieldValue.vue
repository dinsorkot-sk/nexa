<script setup lang="ts">
import { computed } from 'vue';
import type { FieldDefinition } from '@nexa/meta';
import { formatFieldValue } from '../render/format';

const props = defineProps<{
  field: FieldDefinition;
  value: unknown;
}>();

const display = computed(() => formatFieldValue(props.field, props.value));
</script>

<template>
  <span :class="display ? '' : 'text-neutral-400'">{{ display || '—' }}</span>
</template>
