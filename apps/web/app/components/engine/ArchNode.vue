<script setup lang="ts">
import type { FieldInfo, RecordValues, ViewNode } from '~/utils/engine'

// Recursive renderer of form view arch: form/sheet/group/notebook/page/separator/label/field.
const props = defineProps<{
  node: ViewNode
  fields: Record<string, FieldInfo>
  values: RecordValues
  disabled?: boolean
  names: Map<string, Map<number, string>>
  errors?: Record<string, string>
}>()
const emit = defineEmits<{ change: [name: string] }>()

const attrs = computed(() => props.node.attrs ?? {})
const title = computed(() => (typeof attrs.value.string === 'string' ? attrs.value.string : undefined))
const tabs = computed(() => (props.node.children ?? [])
  .filter((c) => c.tag === 'page')
  .map((c, i) => ({ label: typeof c.attrs?.string === 'string' ? c.attrs.string : `Page ${i + 1}`, value: String(i), node: c })))

function update(name: string, v: unknown) {
  // eslint-disable-next-line vue/no-mutating-props -- values is the form's reactive state object
  props.values[name] = v
  emit('change', name)
}
</script>

<template>
  <template v-if="props.node.tag === 'field'">
    <EngineFieldInput
      v-if="props.fields[String(attrs.name)]"
      :name="String(attrs.name)"
      :field="props.fields[String(attrs.name)]!"
      :model-value="props.values[String(attrs.name)]"
      :disabled="props.disabled"
      :error="props.errors?.[String(attrs.name)]"
      :names="props.fields[String(attrs.name)]!.comodel ? props.names.get(props.fields[String(attrs.name)]!.comodel!) : undefined"
      @update:model-value="(v: unknown) => update(String(attrs.name), v)"
    />
  </template>

  <fieldset v-else-if="props.node.tag === 'group'" class="min-w-0 space-y-4">
    <legend v-if="title" class="mb-2 text-sm font-semibold text-highlighted">{{ title }}</legend>
    <div class="grid gap-4 sm:grid-cols-2">
      <EngineArchNode
        v-for="(c, i) in props.node.children ?? []"
        :key="i"
        :node="c"
        :fields="props.fields"
        :values="props.values"
        :disabled="props.disabled"
        :names="props.names"
        :errors="props.errors"
        @change="(n: string) => emit('change', n)"
      />
    </div>
  </fieldset>

  <UTabs v-else-if="props.node.tag === 'notebook'" :items="tabs" class="w-full">
    <template #content="{ item }">
      <div class="space-y-6 pt-4">
        <EngineArchNode
          v-for="(c, i) in (item as { node: ViewNode }).node.children ?? []"
          :key="i"
          :node="c"
          :fields="props.fields"
          :values="props.values"
          :disabled="props.disabled"
          :names="props.names"
          :errors="props.errors"
          @change="(n: string) => emit('change', n)"
        />
      </div>
    </template>
  </UTabs>

  <USeparator v-else-if="props.node.tag === 'separator'" :label="title" />
  <p v-else-if="props.node.tag === 'label'" class="text-sm text-muted">{{ title }}</p>

  <!-- form, sheet and unknown containers: render children in order -->
  <div v-else class="space-y-6">
    <EngineArchNode
      v-for="(c, i) in props.node.children ?? []"
      :key="i"
      :node="c"
      :fields="props.fields"
      :values="props.values"
      :disabled="props.disabled"
      :names="props.names"
      :errors="props.errors"
      @change="(n: string) => emit('change', n)"
    />
  </div>
</template>
