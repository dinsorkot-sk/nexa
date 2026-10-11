<template>
  <div class="grid gap-1.5">
    <UiInput
      :id="id"
      type="url"
      inputmode="url"
      :model-value="modelValue ?? ''"
      :disabled="disabled"
      :placeholder="placeholder ?? 'https://'"
      :aria-invalid="invalid || undefined"
      :aria-describedby="describedBy"
      @update:model-value="onInput"
    />
    <p class="text-xs text-foreground-muted">
      {{ t(kind === 'image' ? 'link.imageNote' : 'link.fileNote') }}
    </p>
    <img
      v-if="kind === 'image' && preview"
      :src="preview"
      :alt="t('link.previewAlt')"
      referrerpolicy="no-referrer"
      loading="lazy"
      class="max-h-40 max-w-full rounded-md border border-border object-contain"
      @error="failed = true"
    >
    <p
      v-if="kind === 'image' && modelValue && !preview"
      class="text-xs text-danger-soft-foreground"
      role="alert"
    >
      {{ t('link.invalid') }}
    </p>
    <p
      v-else-if="kind === 'image' && preview && failed"
      class="text-xs text-danger-soft-foreground"
      role="alert"
    >
      {{ t('link.previewFailed') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { safeHref } from '../render/safe-url';
import UiInput from './UiInput.vue';

const props = withDefaults(defineProps<{
  modelValue?: string | null;
  /** `file` shows a note; `image` also shows a preview when the address is a valid http(s) URL. */
  kind: 'file' | 'image';
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  describedBy?: string;
  placeholder?: string;
}>(), { modelValue: undefined, disabled: false, invalid: false, id: undefined, describedBy: undefined, placeholder: undefined });

const emit = defineEmits<{ 'update:modelValue': [value: string | undefined] }>();
const { t } = useI18n();

const failed = ref(false);
/** Only an http(s) address is ever used as an image source. */
const preview = computed(() => safeHref(props.modelValue));
watch(() => props.modelValue, () => { failed.value = false; });

function onInput(value: string | number) {
  const text = String(value).trim();
  emit('update:modelValue', text === '' ? undefined : text);
}
</script>
