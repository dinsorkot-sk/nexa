<script setup lang="ts">
// many2one (single) / many2many (multiple) picker searching the comodel by name.
const props = defineProps<{
  comodel: string
  multiple?: boolean
  disabled?: boolean
}>()
const model = defineModel<number | number[] | null>({ required: true })
// USelectMenu uses undefined for "nothing selected"; the engine uses null
const selected = computed({
  get: () => model.value ?? undefined,
  set: (v: number | number[] | undefined) => { model.value = v ?? (props.multiple ? [] : null) },
})

const engine = useEngine()
const term = ref('')
const loading = ref(false)
const options = ref<{ label: string; value: number }[]>([])
const failed = ref(false)

async function search() {
  loading.value = true
  failed.value = false
  try {
    const selected = props.multiple ? (model.value as number[] ?? []) : model.value ? [model.value as number] : []
    const domain = term.value ? [['name', 'ilike', term.value]] : []
    const { records } = await engine.searchRead(props.comodel, { domain, fields: ['name'], limit: 20 })
    const found = records.map((r) => ({ label: String(r.name ?? `#${String(r.id)}`), value: r.id as number }))
    // keep the current selection visible even when it is not in the search page
    const missing = selected.filter((id) => !found.some((o) => o.value === id))
    const names = await engine.displayNames(props.comodel, missing)
    options.value = [...missing.map((id) => ({ label: names.get(id) ?? `#${id}`, value: id })), ...found]
  } catch {
    failed.value = true
    options.value = []
  } finally {
    loading.value = false
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
watch(term, () => {
  clearTimeout(timer)
  timer = setTimeout(search, 250)
})
onMounted(search)

// a value set from outside (onchange, reload) must show its label too
watch(model, async (v) => {
  const ids = v === null ? [] : Array.isArray(v) ? v : [v]
  const missing = ids.filter((id) => !options.value.some((o) => o.value === id))
  if (!missing.length) return
  const labels = await engine.displayNames(props.comodel, missing)
  options.value = [...missing.map((id) => ({ label: labels.get(id) ?? `#${id}`, value: id })), ...options.value]
})
</script>

<template>
  <USelectMenu
   
    v-model="selected"
    v-model:search-term="term"
    :items="options"
    value-key="value"
    :multiple="props.multiple"
    :loading="loading"
    :disabled="props.disabled"
    ignore-filter
    :placeholder="failed ? 'Options unavailable' : props.multiple ? 'Select…' : 'Select one…'"
    class="w-full"
  />
</template>
