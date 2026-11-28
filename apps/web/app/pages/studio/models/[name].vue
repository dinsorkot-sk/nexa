<script setup lang="ts">
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'
import { computed, reactive, ref, watch } from 'vue'
import { z } from 'zod'
import type { StudioField, StudioModel } from '../../../composables/useStudioApi'
import { getStudioApiErrorMessage, useStudioApi } from '../../../composables/useStudioApi'

defineOptions({ name: 'StudioModelDesignerPage' })

type FieldType =
  | 'char' | 'text' | 'integer' | 'float' | 'monetary' | 'boolean' | 'date' | 'datetime'
  | 'selection' | 'json' | 'many2one' | 'one2many' | 'many2many' | 'reference'
type ViewType = 'list' | 'form'

interface StudioMixinsResponse {
  available: { name: string; description: string }[]
  attached: { model: string; mixin: string }[]
}

interface ViewNode {
  tag: string
  attrs?: Record<string, unknown>
  children?: ViewNode[]
}

interface ResolvedStudioView {
  xmlId: string | null
  arch: ViewNode
}

const fieldTypes: { label: string; value: FieldType }[] = [
  { label: 'Text', value: 'char' },
  { label: 'Long text', value: 'text' },
  { label: 'Integer', value: 'integer' },
  { label: 'Decimal', value: 'float' },
  { label: 'Monetary', value: 'monetary' },
  { label: 'Boolean', value: 'boolean' },
  { label: 'Date', value: 'date' },
  { label: 'Date and time', value: 'datetime' },
  { label: 'Selection', value: 'selection' },
  { label: 'JSON', value: 'json' },
  { label: 'Many to one', value: 'many2one' },
  { label: 'One to many', value: 'one2many' },
  { label: 'Many to many', value: 'many2many' },
  { label: 'Reference', value: 'reference' },
]

const route = useRoute()
const studioApi = useStudioApi()
const modelName = computed(() => String(route.params.name))
const model = ref<StudioModel | null>(null)
const mixinData = ref<StudioMixinsResponse>({ available: [], attached: [] })
const primaryViews = ref<Record<ViewType, ResolvedStudioView | null>>({ list: null, form: null })
const loading = ref(true)
const loadError = ref('')
const actionError = ref('')
const notice = ref('')
const addFieldOpen = ref(false)
const addFieldPending = ref(false)
const addFieldError = ref('')
const viewType = ref<ViewType>('list')
const previewMode = ref<ViewType>('list')
const viewFields = ref<string[]>([])
const selectedViewField = ref('')
const selectedMixin = ref('')
const mixinPending = ref(false)
const viewConfirmOpen = ref(false)
const viewPending = ref(false)
const viewError = ref('')

const fieldState = reactive({
  name: '',
  label: '',
  type: 'char' as FieldType,
  comodel: '',
  inverseName: '',
  selectionOptions: '',
  required: false,
  unique: false,
  translated: false,
})

const fieldSchema = z.object({
  name: z.string()
    .regex(/^x_[a-z0-9_]+$/, 'Use a field name starting with x_.')
    .max(63, 'Field name must be 63 characters or fewer.'),
  label: z.string().max(120, 'Label must be 120 characters or fewer.'),
  type: z.enum(['char', 'text', 'integer', 'float', 'monetary', 'boolean', 'date', 'datetime', 'selection', 'json', 'many2one', 'one2many', 'many2many', 'reference']),
  comodel: z.string(),
  inverseName: z.string().max(63, 'Inverse field name must be 63 characters or fewer.'),
  selectionOptions: z.string(),
  required: z.boolean(),
  unique: z.boolean(),
  translated: z.boolean(),
}).superRefine((field, context) => {
  if (['many2one', 'one2many', 'many2many'].includes(field.type) && !field.comodel.trim()) {
    context.addIssue({ code: 'custom', path: ['comodel'], message: 'Enter the related model name.' })
  }
  if (field.type === 'one2many' && !/^[a-z][a-z0-9_]*$/.test(field.inverseName)) {
    context.addIssue({ code: 'custom', path: ['inverseName'], message: 'Enter a valid inverse field name.' })
  }
  if (field.type === 'selection') {
    const choices = field.selectionOptions.split(',').map((item) => item.trim()).filter(Boolean)
    if (!choices.length || choices.some((item) => !/^[^=]{1,40}=.{1,80}$/.test(item))) {
      context.addIssue({ code: 'custom', path: ['selectionOptions'], message: 'Enter options as key=Label, separated by commas.' })
    }
  }
  if (field.translated && !['char', 'text'].includes(field.type)) {
    context.addIssue({ code: 'custom', path: ['translated'], message: 'Translation is available for text fields only.' })
  }
})

watch(() => fieldState.type, (type) => {
  if (!['char', 'text'].includes(type)) fieldState.translated = false
  if (type !== 'selection') fieldState.selectionOptions = ''
  if (!['many2one', 'one2many', 'many2many'].includes(type)) fieldState.comodel = ''
  if (type !== 'one2many') fieldState.inverseName = ''
})

const fieldColumns: TableColumn<StudioField>[] = [
  { accessorKey: 'name', header: 'Field' },
  { accessorKey: 'type', header: 'Type' },
  { accessorKey: 'string', header: 'Label' },
  { accessorKey: 'required', header: 'Required' },
]

const attachedMixins = computed(() =>
  mixinData.value.attached.filter((entry) => entry.model === modelName.value),
)
const availableMixins = computed(() => {
  const attached = new Set(attachedMixins.value.map((entry) => entry.mixin))
  return mixinData.value.available.filter((entry) => !attached.has(entry.name))
})
const viewFieldOptions = computed(() =>
  (model.value?.fields ?? [])
    .filter((field) => !viewFields.value.includes(field.name))
    .map((field) => ({ label: `${field.string} (${field.name})`, value: field.name })),
)
const previewColumns = computed<TableColumn<Record<string, string>>[]>(() =>
  viewFields.value.map((name) => ({
    accessorKey: name,
    header: model.value?.fields.find((field) => field.name === name)?.string ?? name,
  })),
)
const previewFormFields = computed(() =>
  viewFields.value.map((name) => model.value?.fields.find((field) => field.name === name))
    .filter((field): field is StudioField => field !== undefined),
)
const existingView = computed(() => primaryViews.value[viewType.value])
const canSaveView = computed(() =>
  !!model.value && !existingView.value?.xmlId && viewFields.value.length > 0 && !viewPending.value,
)

function fieldNamesInView(node: ViewNode): string[] {
  const names: string[] = []
  if (node.tag === 'field' && typeof node.attrs?.name === 'string') names.push(node.attrs.name)
  for (const child of node.children ?? []) names.push(...fieldNamesInView(child))
  return [...new Set(names)]
}

async function loadView(type: ViewType): Promise<ResolvedStudioView> {
  return studioApi.request<ResolvedStudioView>(`ui/view/${encodeURIComponent(modelName.value)}/${type}`)
}

async function loadPage() {
  loading.value = true
  loadError.value = ''
  actionError.value = ''
  try {
    const [models, mixins, listView, formView] = await Promise.all([
      studioApi.request<{ models: StudioModel[] }>('studio/models'),
      studioApi.request<StudioMixinsResponse>('studio/mixins'),
      loadView('list'),
      loadView('form'),
    ])
    model.value = models.models.find((entry) => entry.name === modelName.value) ?? null
    mixinData.value = mixins
    primaryViews.value = { list: listView, form: formView }
    if (!model.value) {
      loadError.value = `Custom model '${modelName.value}' was not found.`
      return
    }
    viewFields.value = fieldNamesInView(primaryViews.value[viewType.value]?.arch ?? listView.arch)
  } catch (error) {
    loadError.value = getStudioApiErrorMessage(error)
  } finally {
    loading.value = false
  }
}

function resetFieldForm() {
  Object.assign(fieldState, {
    name: '',
    label: '',
    type: 'char',
    comodel: '',
    inverseName: '',
    selectionOptions: '',
    required: false,
    unique: false,
    translated: false,
  })
  addFieldError.value = ''
}

function openAddField() {
  resetFieldForm()
  addFieldOpen.value = true
}

function selectionPairs(value: string): [string, string][] {
  return value.split(',').map((item) => item.trim()).filter(Boolean).map((item) => {
    const separator = item.indexOf('=')
    return [item.slice(0, separator).trim(), item.slice(separator + 1).trim()]
  })
}

async function addField(event: FormSubmitEvent<z.infer<typeof fieldSchema>>) {
  addFieldPending.value = true
  addFieldError.value = ''
  try {
    const data = event.data
    const body = {
      model: modelName.value,
      name: data.name,
      type: data.type,
      ...(data.label.trim() ? { label: data.label.trim() } : {}),
      ...(data.required && data.type !== 'one2many' ? { required: true } : {}),
      ...(data.unique ? { unique: true } : {}),
      ...(data.translated && ['char', 'text'].includes(data.type) ? { translate: true } : {}),
      ...(['many2one', 'one2many', 'many2many'].includes(data.type) ? { comodel: data.comodel.trim() } : {}),
      ...(data.type === 'one2many' ? { inverseName: data.inverseName } : {}),
      ...(data.type === 'selection' ? { selection: selectionPairs(data.selectionOptions) } : {}),
    }
    await studioApi.request('studio/field', { method: 'POST', body })
    addFieldOpen.value = false
    notice.value = `Field '${data.name}' was added.`
    await loadPage()
  } catch (error) {
    addFieldError.value = getStudioApiErrorMessage(error)
  } finally {
    addFieldPending.value = false
  }
}

async function attachMixin() {
  if (!selectedMixin.value) return
  mixinPending.value = true
  actionError.value = ''
  try {
    await studioApi.request('studio/mixin/attach', {
      method: 'POST',
      body: { model: modelName.value, mixin: selectedMixin.value },
    })
    notice.value = `Mixin '${selectedMixin.value}' was attached.`
    selectedMixin.value = ''
    await loadPage()
  } catch (error) {
    actionError.value = getStudioApiErrorMessage(error)
  } finally {
    mixinPending.value = false
  }
}

function moveViewField(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= viewFields.value.length) return
  const fields = [...viewFields.value]
  ;[fields[index], fields[target]] = [fields[target]!, fields[index]!]
  viewFields.value = fields
}

function addViewField() {
  if (!selectedViewField.value || viewFields.value.includes(selectedViewField.value)) return
  viewFields.value = [...viewFields.value, selectedViewField.value]
  selectedViewField.value = ''
}

function removeViewField(name: string) {
  viewFields.value = viewFields.value.filter((field) => field !== name)
}

async function savePrimaryView() {
  if (!canSaveView.value || !model.value) return
  viewPending.value = true
  viewError.value = ''
  const viewName = `x_${model.value.name.slice(2)}_${viewType.value}`
  try {
    await studioApi.request('studio/view', {
      method: 'POST',
      body: {
        model: model.value.name,
        name: viewName,
        type: viewType.value,
        arch: {
          tag: viewType.value,
          children: viewFields.value.map((name) => ({ tag: 'field', attrs: { name } })),
        },
      },
    })
    viewConfirmOpen.value = false
    notice.value = `Primary ${viewType.value} view was created.`
    await loadPage()
  } catch (error) {
    viewError.value = getStudioApiErrorMessage(error)
  } finally {
    viewPending.value = false
  }
}

watch(viewType, async (type) => {
  previewMode.value = type
  viewError.value = ''
  try {
    const view = await loadView(type)
    primaryViews.value = { ...primaryViews.value, [type]: view }
    viewFields.value = fieldNamesInView(view.arch)
  } catch (error) {
    actionError.value = getStudioApiErrorMessage(error)
  }
})

watch(() => studioApi.session.value, (session) => {
  if (session) void loadPage()
}, { immediate: true })
</script>

<template>
  <div class="space-y-6">
      <UProgress v-if="loading" animation="carousel" aria-label="Loading model designer" />
      <UAlert
        v-if="loadError"
        color="error"
        variant="subtle"
        title="Could not load this model"
        :description="loadError"
      >
        <template #actions>
          <UButton label="Back to Studio" to="/studio" color="neutral" variant="outline" />
        </template>
      </UAlert>

      <template v-else-if="model && !loading">
        <UButton
          label="Back to Studio"
          icon="i-lucide-arrow-left"
          to="/studio"
          color="neutral"
          variant="ghost"
        />
        <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p class="text-sm text-muted">
              MODEL
            </p>
            <h1 class="text-2xl font-semibold text-highlighted">
              {{ model.name }}
            </h1>
            <p class="mt-1 text-muted">
              {{ model.description || 'No description' }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton label="Add field" icon="i-lucide-plus" @click="openAddField" />
            <UButton label="Save model" icon="i-lucide-save" color="neutral" variant="outline" disabled />
          </div>
        </header>

        <UAlert
          color="info"
          variant="subtle"
          title="Model details are read-only"
          description="The current API can create models but cannot update their name or description."
        />
        <UAlert
          v-if="notice"
          color="success"
          variant="subtle"
          title="Studio updated"
          :description="notice"
        />
        <UAlert
          v-if="actionError"
          color="error"
          variant="subtle"
          title="Studio action failed"
          :description="actionError"
        />

        <UPageGrid>
          <UPageCard title="Fields" description="Fields defined on this model.">
            <p class="text-3xl font-semibold text-highlighted">
              {{ model.fields.length }}
            </p>
          </UPageCard>
          <UPageCard title="List view" :description="primaryViews.list?.xmlId ?? 'No saved primary view'">
            <UBadge :color="primaryViews.list?.xmlId ? 'success' : 'neutral'" variant="subtle">
              {{ primaryViews.list?.xmlId ? 'Configured' : 'Generated default' }}
            </UBadge>
          </UPageCard>
          <UPageCard title="Form view" :description="primaryViews.form?.xmlId ?? 'No saved primary view'">
            <UBadge :color="primaryViews.form?.xmlId ? 'success' : 'neutral'" variant="subtle">
              {{ primaryViews.form?.xmlId ? 'Configured' : 'Generated default' }}
            </UBadge>
          </UPageCard>
        </UPageGrid>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="font-semibold text-highlighted">
                  Fields
                </h2>
                <p class="text-sm text-muted">
                  Existing fields are read-only; add fields through the supported Studio API.
                </p>
              </div>
              <UButton label="Add field" icon="i-lucide-plus" color="neutral" variant="outline" @click="openAddField" />
            </div>
          </template>

          <UTable
            v-if="model.fields.length"
            :data="model.fields"
            :columns="fieldColumns"
            class="rounded-lg ring ring-default"
          >
            <template #required-cell="{ row }">
              <UBadge :color="row.original.required ? 'primary' : 'neutral'" variant="subtle">
                {{ row.original.required ? 'Required' : 'Optional' }}
              </UBadge>
            </template>
          </UTable>
          <UEmpty
            v-else
            icon="i-lucide-list-plus"
            title="No fields yet"
            description="Add a field to start building this model."
          >
            <UButton label="Add field" icon="i-lucide-plus" @click="openAddField" />
          </UEmpty>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 class="font-semibold text-highlighted">
                  Mixins
                </h2>
                <p class="text-sm text-muted">
                  Add supported behaviors to this custom model.
                </p>
              </div>
              <div class="flex gap-2">
                <USelect
                  v-model="selectedMixin"
                  :items="availableMixins.map((mixin) => ({ label: mixin.name, value: mixin.name }))"
                  placeholder="Select a mixin"
                  :disabled="!availableMixins.length || mixinPending"
                  class="w-56"
                />
                <UButton
                  label="Attach"
                  icon="i-lucide-link"
                  :disabled="!selectedMixin"
                  :loading="mixinPending"
                  @click="attachMixin"
                />
              </div>
            </div>
          </template>
          <div v-if="attachedMixins.length" class="flex flex-wrap gap-2">
            <UBadge v-for="mixin in attachedMixins" :key="mixin.mixin" color="neutral" variant="subtle">
              {{ mixin.mixin }}
            </UBadge>
          </div>
          <UEmpty
            v-else
            icon="i-lucide-puzzle"
            title="No mixins attached"
            description="Attaching a mixin can add behavior and fields to this model."
          />
        </UCard>

        <UCard>
          <template #header>
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 class="font-semibold text-highlighted">
                  Primary view designer
                </h2>
                <p class="text-sm text-muted">
                  Create a primary list or form view. Saved views cannot be edited from this UI yet.
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <USelect v-model="viewType" :items="[{ label: 'List', value: 'list' }, { label: 'Form', value: 'form' }]" class="w-32" />
                <USelect v-model="previewMode" :items="[{ label: 'Preview list', value: 'list' }, { label: 'Preview form', value: 'form' }]" class="w-40" />
              </div>
            </div>
          </template>

          <UAlert
            v-if="existingView?.xmlId"
            color="info"
            variant="subtle"
            title="Primary view already exists"
            :description="`Saved view: ${existingView.xmlId}. The current API does not provide a view-edit operation.`"
            class="mb-4"
          />
          <div class="grid gap-6 xl:grid-cols-2">
            <section class="space-y-3">
              <div class="flex flex-wrap items-center gap-2">
                <USelect
                  v-model="selectedViewField"
                  :items="viewFieldOptions"
                  placeholder="Add a field"
                  :disabled="!viewFieldOptions.length || !!existingView?.xmlId"
                  class="min-w-52 flex-1"
                />
                <UButton
                  label="Add to view"
                  icon="i-lucide-plus"
                  :disabled="!selectedViewField || !!existingView?.xmlId"
                  @click="addViewField"
                />
              </div>
              <div v-if="viewFields.length" class="space-y-2">
                <UCard v-for="(field, index) in viewFields" :key="field" class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate font-medium text-highlighted">
                      {{ model.fields.find((item) => item.name === field)?.string ?? field }}
                    </p>
                    <p class="truncate text-xs text-muted">
                      {{ field }}
                    </p>
                  </div>
                  <div class="flex shrink-0 gap-1">
                    <UButton
                      :aria-label="`Move ${field} up`"
                      icon="i-lucide-arrow-up"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      :disabled="index === 0 || !!existingView?.xmlId"
                      @click="moveViewField(index, -1)"
                    />
                    <UButton
                      :aria-label="`Move ${field} down`"
                      icon="i-lucide-arrow-down"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      :disabled="index === viewFields.length - 1 || !!existingView?.xmlId"
                      @click="moveViewField(index, 1)"
                    />
                    <UButton
                      :aria-label="`Remove ${field}`"
                      icon="i-lucide-x"
                      size="xs"
                      color="error"
                      variant="ghost"
                      :disabled="!!existingView?.xmlId"
                      @click="removeViewField(field)"
                    />
                  </div>
                </UCard>
              </div>
              <UEmpty
                v-else
                icon="i-lucide-layout-list"
                title="No fields in this view"
                description="Choose fields above to build the view."
              />
              <UButton
                label="Save primary view"
                icon="i-lucide-save"
                :disabled="!canSaveView"
                @click="viewConfirmOpen = true"
              />
            </section>

            <UCard>
              <template #header>
                <h3 class="font-medium text-highlighted">
                  {{ previewMode === 'list' ? 'List preview' : 'Form preview' }}
                </h3>
              </template>
              <UTable
                v-if="previewMode === 'list'"
                :data="[]"
                :columns="previewColumns"
                empty="Preview only. Tenant records are not loaded here."
              />
              <UForm v-else :state="{}" class="space-y-4">
                <UFormField
                  v-for="field in previewFormFields"
                  :key="field.name"
                  :label="field.string"
                  :name="field.name"
                >
                  <UInput :placeholder="field.name" disabled class="w-full" />
                </UFormField>
                <UEmpty
                  v-if="!previewFormFields.length"
                  icon="i-lucide-rows-3"
                  title="No fields to preview"
                  description="Add fields to the view first."
                />
              </UForm>
            </UCard>
          </div>
        </UCard>

        <UModal v-model:open="addFieldOpen" title="Add field" :description="`Add a field to ${model.name}.`">
          <template #body>
            <UAlert
              v-if="addFieldError"
              color="error"
              variant="subtle"
              title="Field was not added"
              :description="addFieldError"
              class="mb-4"
            />
            <UAlert
              color="warning"
              variant="subtle"
              title="Field visibility groups are not configurable here"
              description="The current API does not provide a group catalog or read-visibility controls. Avoid storing confidential data in custom fields until access configuration is available."
              class="mb-4"
            />
            <UForm :schema="fieldSchema" :state="fieldState" class="space-y-4" @submit="addField">
              <div class="grid gap-4 sm:grid-cols-2">
                <UFormField label="Technical name" name="name" required>
                  <UInput v-model="fieldState.name" placeholder="x_contact_id" class="w-full" />
                </UFormField>
                <UFormField label="Label" name="label">
                  <UInput v-model="fieldState.label" placeholder="Contact" class="w-full" />
                </UFormField>
                <UFormField label="Type" name="type" required>
                  <USelect v-model="fieldState.type" :items="fieldTypes" class="w-full" />
                </UFormField>
                <UFormField
                  v-if="['many2one', 'one2many', 'many2many'].includes(fieldState.type)"
                  label="Related model"
                  name="comodel"
                  required
                >
                  <UInput v-model="fieldState.comodel" placeholder="res.partner or x_contact" class="w-full" />
                </UFormField>
                <UFormField v-if="fieldState.type === 'one2many'" label="Inverse many-to-one field" name="inverseName" required>
                  <UInput v-model="fieldState.inverseName" placeholder="x_order_id" class="w-full" />
                </UFormField>
                <UFormField v-if="fieldState.type === 'selection'" label="Choices (key=Label)" name="selectionOptions" required>
                  <UInput v-model="fieldState.selectionOptions" placeholder="draft=Draft,active=Active" class="w-full" />
                </UFormField>
              </div>
              <div class="flex flex-wrap gap-x-6 gap-y-3">
                <UCheckbox v-model="fieldState.required" label="Required" :disabled="fieldState.type === 'one2many'" />
                <UCheckbox v-model="fieldState.unique" label="Unique" />
                <UCheckbox
                  v-model="fieldState.translated"
                  label="Translated"
                  :disabled="!['char', 'text'].includes(fieldState.type)"
                />
              </div>
              <div class="flex justify-end gap-2">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="addFieldOpen = false" />
                <UButton type="submit" label="Add field" :loading="addFieldPending" />
              </div>
            </UForm>
          </template>
        </UModal>

        <UModal v-model:open="viewConfirmOpen" title="Create primary view" :description="`Save the ${viewType} view for ${model.name}?`">
          <template #body>
            <UAlert
              v-if="viewError"
              color="error"
              variant="subtle"
              title="View was not saved"
              :description="viewError"
              class="mb-4"
            />
            <p class="text-sm text-muted">
              A primary view can only be created once. The current API does not support editing or removing it afterward.
            </p>
            <div class="mt-4 flex justify-end gap-2">
              <UButton label="Cancel" color="neutral" variant="ghost" @click="viewConfirmOpen = false" />
              <UButton label="Create view" :loading="viewPending" @click="savePrimaryView" />
            </div>
          </template>
        </UModal>
      </template>
  </div>
</template>
