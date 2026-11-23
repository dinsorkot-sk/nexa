<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { archFieldNames, displayValue, relationalIds, searchableFields, textSearchDomain } from '~/utils/engine'
import type { ActionInfo, RecordValues, ResolvedView } from '~/utils/engine'

defineOptions({ name: 'RecordListPage' })

const PAGE_SIZE = 40
const route = useRoute()
const router = useRouter()
const engine = useEngine()

// The URL is the single source of truth: /a/:action?page=&q=
const actionId = computed(() => String(route.params.action))
const page = computed(() => Math.max(1, Number(route.query.page ?? 1) || 1))
const q = computed(() => String(route.query.q ?? ''))

const action = ref<ActionInfo | null>(null)
const view = ref<ResolvedView | null>(null)
const searchView = ref<ResolvedView | null>(null)
const rows = ref<RecordValues[]>([])
const total = ref(0)
const names = ref(new Map<string, Map<number, string>>())
const loading = ref(true)
const error = ref<Error | null>(null)
const searchText = ref(q.value)
const heading = ref<HTMLElement | null>(null)

const fieldNames = computed(() => (view.value ? archFieldNames(view.value.arch) : []))
const NuxtLink = resolveComponent('NuxtLink')

const columns = computed<TableColumn<RecordValues>[]>(() => fieldNames.value.map((name, i) => {
  const f = view.value!.fields[name]
  return {
    id: name,
    header: f?.string ?? name,
    cell: ({ row }) => {
      const text = displayValue(f, row.original[name], f?.comodel ? names.value.get(f.comodel) : undefined)
      // the first column links to the record so rows are reachable by keyboard
      return i === 0
        ? h(NuxtLink, { to: `/a/${actionId.value}/${String(row.original.id)}`, class: 'font-medium text-primary hover:underline' }, () => text || `#${String(row.original.id)}`)
        : text
    },
  }
}))

let token = 0
let loadedAction = ''

/** Load metadata (when the action changed) and the current page; stale responses are dropped. */
async function load() {
  const mine = ++token
  const wanted = actionId.value
  loading.value = true
  error.value = null
  try {
    if (loadedAction !== wanted) {
      const a = await engine.action(wanted)
      const [v, s] = await Promise.all([engine.view(a.model!, 'list'), engine.view(a.model!, 'search').catch(() => null)])
      if (mine !== token) return
      action.value = a
      view.value = v
      searchView.value = s
      loadedAction = wanted
    }
    const text = textSearchDomain(searchableFields(searchView.value ?? view.value!), q.value)
    const res = await engine.searchRead(action.value!.model!, {
      domain: [...(action.value!.domain ?? []), ...text],
      fields: fieldNames.value,
      limit: PAGE_SIZE,
      offset: (page.value - 1) * PAGE_SIZE,
    })
    const map = new Map<string, Map<number, string>>()
    for (const [m, ids] of relationalIds(view.value!.fields, res.records)) map.set(m, await engine.displayNames(m, [...ids]))
    if (mine !== token) return
    rows.value = res.records
    total.value = res.length
    names.value = map
  } catch (e) {
    if (mine === token) error.value = e as Error
  } finally {
    if (mine === token) loading.value = false
  }
}

watch([actionId, page, q], ([a], [prevA]) => {
  if (a !== prevA) {
    loadedAction = ''
    searchText.value = q.value
    nextTick(() => heading.value?.focus())
  }
  load()
}, { immediate: true })

let timer: ReturnType<typeof setTimeout> | undefined
watch(searchText, (text) => {
  clearTimeout(timer)
  if (text === q.value) return
  timer = setTimeout(() => router.replace({ query: { ...route.query, q: text || undefined, page: undefined } }), 300)
})
onBeforeUnmount(() => clearTimeout(timer))

function goTo(p: number) {
  router.replace({ query: { ...route.query, page: p > 1 ? p : undefined } })
}

useHead(() => ({ title: action.value ? `${action.value.name} · Nexa` : 'Nexa' }))
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <h1 ref="heading" tabindex="-1" class="text-2xl font-semibold text-highlighted outline-none">{{ action?.name ?? 'Loading…' }}</h1>
      <UButton class="ms-auto" icon="i-lucide-plus" label="New" :to="`/a/${actionId}/new`" :disabled="!view" />
    </div>

    <UInput
      v-model="searchText"
      icon="i-lucide-search"
      placeholder="Search…"
      aria-label="Search records"
      class="w-full sm:max-w-sm"
      :disabled="!view"
    />

    <UAlert
      v-if="error"
      :color="error instanceof ApiError && error.forbidden ? 'warning' : 'error'"
      variant="subtle"
      :title="error instanceof ApiError && error.forbidden ? 'You do not have access' : 'Could not load records'"
      :description="error.message"
      :actions="[{ label: 'Retry', onClick: load }]"
      role="alert"
    />

    <div v-else class="overflow-x-auto">
      <NexaTable
        :data="rows"
        :columns="columns"
        :loading="loading"
        :empty="q ? 'No records match your search.' : 'No records yet. Choose New to create one.'"
        :aria-label="action?.name ?? 'Records'"
        :aria-busy="loading"
      />
    </div>

    <div v-if="total > PAGE_SIZE" class="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <span>{{ (page - 1) * PAGE_SIZE + 1 }}–{{ Math.min(page * PAGE_SIZE, total) }} of {{ total }}</span>
      <UPagination :page="page" :total="total" :items-per-page="PAGE_SIZE" @update:page="goTo" />
    </div>
    <p v-else-if="!loading && total" class="text-sm text-muted">{{ total }} record{{ total === 1 ? '' : 's' }}</p>
  </div>
</template>
