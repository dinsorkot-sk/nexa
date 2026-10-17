<script setup lang="ts">
withDefaults(defineProps<{
  label: string;
  name: string;
  type: string;
  required?: boolean;
  readonly?: boolean;
  position?: number;
}>(), {
  required: false,
  readonly: false,
  position: undefined,
});

const emit = defineEmits<{ configure: [] }>();
</script>

<template>
  <div class="grid grid-cols-[2rem_minmax(0,1fr)_8rem_auto] items-center gap-3 border-b border-ui-border px-3 py-2.5 text-sm last:border-b-0">
    <span
      v-if="position !== undefined"
      class="text-xs tabular-nums text-ui-text-muted"
    >{{ position + 1 }}</span>
    <div class="min-w-0">
      <p class="truncate font-medium text-ui-text-highlighted">
        {{ label }}<span
          v-if="required"
          aria-hidden="true"
          class="ml-0.5 text-ui-error-text"
        >*</span>
      </p>
      <p class="truncate text-xs text-ui-text-muted">
        {{ name }}
      </p>
    </div>
    <span class="truncate text-xs text-ui-text-toned">{{ type }}</span>
    <div class="flex items-center gap-2">
      <span
        v-if="readonly"
        class="text-xs text-ui-text-muted"
      >Read only</span>
      <button
        type="button"
        class="rounded px-2 py-1 text-xs font-medium text-ui-primary-text outline-none hover:bg-ui-primary/10 focus-visible:ring-2 focus-visible:ring-ui-primary"
        @click="emit('configure')"
      >
        <slot name="action">
          Configure
        </slot>
      </button>
    </div>
  </div>
</template>
