<script setup lang="ts">
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'
import { computed, reactive, ref, watch } from 'vue'
import { z } from 'zod'
import type { StudioModel } from '../../composables/useStudioApi'
import { getStudioApiErrorMessage, useStudioApi } from '../../composables/useStudioApi'

defineOptions({ name: 'StudioHomePage' })

const studioApi = useStudioApi()
const models = ref<StudioModel[]>([])
const loading = ref(false)
const loadError = ref('')
const createOpen = ref(false)
const createPending = ref(false)
const createError = ref('')
const state = reactive({ name: '', description: '' })
const schema = z.object({
  name: z.string()
    .regex(/^x_[a-z0-9_]+$/, 'Use a technical name starting with x_.')
    .max(63, 'Model name must be 63 characters or fewer.'),
  description: z.string().max(200, 'Description must be 200 characters or fewer.'),
})

const columns: TableColumn<StudioModel>[] = [
  { accessorKey: 'name', header: 'Technical name' },
  { accessorKey: 'description', header: 'Description' },
  {
    id: 'fields',
    header: 'Fields',
    cell: ({ row }) => row.original.fields.length,
  },
  { id: 'open', header: '' },
]

const fieldCount = computed(() => models.value.reduce((sum, model) => sum + model.fields.length, 0))

async function loadModels() {
  loading.value = true
  loadError.value = ''
  try {
    const result = await studioApi.request<{ models: StudioModel[] }>('studio/models')
    models.value = result.models
  } catch (error) {
    loadError.value = getStudioApiErrorMessage(error)
  } finally {
    loading.value = false
  }
}

async function createModel(event: FormSubmitEvent<z.infer<typeof schema>>) {
  createPending.value = true
  createError.value = ''
  try {
    await studioApi.request<{ model: string }>('studio/model', {
      method: 'POST',
      body: event.data,
    })
    createOpen.value = false
    await navigateTo(`/studio/models/${encodeURIComponent(event.data.name)}`)
  } catch (error) {
    createError.value = getStudioApiErrorMessage(error)
  } finally {
    createPending.value = false
  }
}

watch(() => studioApi.session.value, (session) => {
  if (session) void loadModels()
}, { immediate: true })
</script>

<template>
  <div class="space-y-6">
      <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 class="text-2xl font-semibold text-highlighted">
            Studio
          </h1>
          <p class="mt-1 text-sm text-muted">
            Configure custom models, fields, and primary views for this tenant.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton label="New model" icon="i-lucide-plus" @click="createOpen = true" />
          <div class="flex flex-col items-end gap-1">
            <UButton
              label="Install Thai pack"
              icon="i-lucide-package-plus"
              color="neutral"
              variant="outline"
              disabled
            />
            <span class="text-xs text-muted">
              Company setup and pack installation are not available yet.
            </span>
          </div>
        </div>
      </header>

      <UAlert
        v-if="loadError"
        color="error"
        variant="subtle"
        title="Could not load Studio models"
        :description="loadError"
      />

      <UProgress v-if="loading" animation="carousel" aria-label="Loading Studio models" />

      <UPageGrid>
        <UPageCard title="Models" description="Custom models configured in this tenant.">
          <p class="text-3xl font-semibold text-highlighted">
            {{ loading ? '—' : models.length }}
          </p>
        </UPageCard>
        <UPageCard title="Fields" description="Fields defined on custom models.">
          <p class="text-3xl font-semibold text-highlighted">
            {{ loading ? '—' : fieldCount }}
          </p>
        </UPageCard>
        <UPageCard title="Roles" description="Role counts are not exposed by the current API.">
          <p class="text-3xl font-semibold text-muted">
            —
          </p>
        </UPageCard>
      </UPageGrid>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="font-semibold text-highlighted">
                Custom models
              </h2>
              <p class="text-sm text-muted">
                Select a model to manage its fields and primary views.
              </p>
            </div>
            <UButton
              v-if="models.length"
              label="New model"
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              @click="createOpen = true"
            />
          </div>
        </template>

        <UTable
          v-if="models.length"
          :data="models"
          :columns="columns"
          :loading="loading"
          class="rounded-lg ring ring-default"
        >
          <template #name-cell="{ row }">
            <NuxtLink
              :to="`/studio/models/${encodeURIComponent(row.original.name)}`"
              class="font-medium text-primary underline-offset-4 hover:underline"
            >
              {{ row.original.name }}
            </NuxtLink>
          </template>
          <template #open-cell="{ row }">
            <UButton
              :to="`/studio/models/${encodeURIComponent(row.original.name)}`"
              label="Open"
              size="sm"
              color="neutral"
              variant="ghost"
            />
          </template>
        </UTable>
        <UEmpty
          v-else-if="!loading && !loadError"
          icon="i-lucide-database"
          title="No custom models yet"
          description="Create a model to begin shaping this tenant's data."
        >
          <UButton label="New model" icon="i-lucide-plus" @click="createOpen = true" />
        </UEmpty>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold text-highlighted">
            Recent changes
          </h2>
        </template>
        <UEmpty
          icon="i-lucide-history"
          title="Change history is not available"
          description="The current API does not expose a Studio audit feed."
        />
      </UCard>

      <UModal v-model:open="createOpen" title="Create custom model" description="Create a model whose technical name begins with x_.">
        <template #body>
          <UAlert
            v-if="createError"
            color="error"
            variant="subtle"
            title="Model was not created"
            :description="createError"
            class="mb-4"
          />
          <UForm :schema="schema" :state="state" class="space-y-4" @submit="createModel">
            <UFormField label="Technical name" name="name" required>
              <UInput v-model="state.name" placeholder="x_project" class="w-full" />
            </UFormField>
            <UFormField label="Description" name="description">
              <UInput v-model="state.description" placeholder="Project" class="w-full" />
            </UFormField>
            <div class="flex justify-end gap-2">
              <UButton label="Cancel" color="neutral" variant="ghost" @click="createOpen = false" />
              <UButton type="submit" label="Create model" :loading="createPending" />
            </div>
          </UForm>
        </template>
      </UModal>
  </div>
</template>
