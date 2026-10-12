<template>
  <div :class="cn('grid gap-1.5', props.class)">
    <label
      :for="inputId"
      class="flex items-center gap-1 text-sm font-medium text-foreground"
    >
      <span>{{ label }}</span>
      <span
        v-if="required"
        class="text-danger-soft-foreground"
        :title="t('common.required')"
        aria-hidden="true"
      >*</span>
      <span
        v-if="required"
        class="sr-only"
      >({{ t('common.required') }})</span>
    </label>
    <slot
      :id="inputId"
      :described-by="describedBy"
      :invalid="Boolean(error)"
    />
    <p
      v-if="helpText && !error"
      :id="helpId"
      class="text-sm text-foreground-muted"
    >
      {{ helpText }}
    </p>
    <p
      v-if="error"
      :id="errorId"
      role="alert"
      class="text-sm font-medium text-danger-soft-foreground"
    >
      {{ error }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { cn } from '../cn';

const props = defineProps<{ label: string; helpText?: string; error?: string; required?: boolean; id?: string; class?: string }>();
const { t } = useI18n();

const generated = useId();
const inputId = computed(() => props.id ?? `field-${generated}`);
const helpId = computed(() => `${inputId.value}-help`);
const errorId = computed(() => `${inputId.value}-error`);
/** Slot users bind this to aria-describedby so a screen reader announces the hint or the error with the control. */
const describedBy = computed(() => (props.error ? errorId.value : props.helpText ? helpId.value : undefined));
</script>
