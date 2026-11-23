<script setup lang="ts">
import { displayValue, type FieldInfo } from '~/utils/engine'

// One input per engine field type. one2many is read-only in v1 (shown as linked names).
const props = defineProps<{
  name: string
  field: FieldInfo
  disabled?: boolean
  names?: Map<number, string>
  error?: string
}>()
const value = defineModel<unknown>({ required: true })

const ro = computed(() => props.disabled || props.field.readonly)
const selectionItems = computed(() => (props.field.selection ?? []).map(([v, label]) => ({ label, value: v })))

const text = computed({
  get: () => (value.value ?? '') as string,
  set: (v: string) => { value.value = v },
})
const num = computed({
  get: () => (value.value === null || value.value === undefined ? '' : String(value.value)),
  set: (v: string) => { value.value = v === '' ? null : Number(v) },
})
const bool = computed({
  get: () => Boolean(value.value),
  set: (v: boolean) => { value.value = v },
})
const sel = computed({
  get: () => (value.value ?? undefined) as string | undefined,
  set: (v: string | undefined) => { value.value = v ?? null },
})
const rel = computed({
  get: () => value.value as number | number[] | null,
  set: (v: number | number[] | null) => { value.value = v },
})
const dateText = computed({
  get: () => (typeof value.value === 'string' ? value.value.slice(0, props.field.type === 'date' ? 10 : 16) : ''),
  set: (v: string) => { value.value = v || null },
})
</script>

<template>
  <UFormField
    :label="props.field.string"
    :name="props.name"
    :required="props.field.required && !ro"
    :help="props.field.help"
    :error="props.error"
    :data-field="props.name"
    class="min-w-0"
  >
    <template v-if="props.field.type === 'boolean'">
      <USwitch v-model="bool" :disabled="ro" />
    </template>
    <UTextarea v-else-if="props.field.type === 'text' || props.field.type === 'html'" v-model="text" :disabled="ro" autoresize class="w-full" />
    <UInput
      v-else-if="['integer', 'float', 'monetary'].includes(props.field.type)"
     
      v-model="num"
      type="number"
      :step="props.field.type === 'integer' ? 1 : 'any'"
      inputmode="decimal"
      :disabled="ro"
      class="w-full"
    />
    <UInput v-else-if="props.field.type === 'date'" v-model="dateText" type="date" :disabled="ro" class="w-full" />
    <UInput v-else-if="props.field.type === 'datetime'" v-model="dateText" type="datetime-local" :disabled="ro" class="w-full" />
    <USelect v-else-if="props.field.type === 'selection'" v-model="sel" :items="selectionItems" :disabled="ro" placeholder="Select…" class="w-full" />
    <EngineRecordSelect
      v-else-if="props.field.type === 'many2one' || props.field.type === 'many2many'"
     
      v-model="rel"
      :comodel="props.field.comodel!"
      :multiple="props.field.type === 'many2many'"
      :disabled="ro"
    />
    <p v-else-if="props.field.type === 'one2many'" class="text-sm text-muted">
      {{ displayValue(props.field, value, props.names) || 'None' }}
    </p>
    <p v-else-if="props.field.type === 'json' || props.field.type === 'binary'" class="text-sm text-muted">
      Not editable here
    </p>
    <UInput v-else v-model="text" :disabled="ro" class="w-full" />
  </UFormField>
</template>
