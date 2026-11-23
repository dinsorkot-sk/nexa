<script setup lang="ts">
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'
import { reactive, ref } from 'vue'
import { z } from 'zod'

defineOptions({ name: 'NexaStarterPage' })

const schema = z.object({
  label: z.string().trim().min(1, 'Enter a label.'),
})

type Entry = z.infer<typeof schema>

const state = reactive<Entry>({ label: '' })
const dialogOpen = ref(false)
const entries = ref<Entry[]>([
  { label: 'Example entry' },
])
const columns: TableColumn<Entry>[] = [
  { accessorKey: 'label', header: 'Label' },
]

function addEntry(event: FormSubmitEvent<Entry>) {
  entries.value.push(event.data)
  state.label = ''
}
</script>

<template>
  <UContainer as="main" class="max-w-3xl space-y-10 py-12 sm:py-16">
    <header class="space-y-3">
      <h1 class="text-3xl font-semibold text-highlighted">
        Nexa Starter
      </h1>
      <p class="text-muted">
        Add an entry to try the starter form and table. Entries are stored on this page until you reload.
      </p>
    </header>

    <section aria-labelledby="form-heading" class="space-y-4">
      <h2 id="form-heading" class="text-lg font-semibold text-highlighted">
        Add an entry
      </h2>
      <NexaForm :schema="schema" :state="state" @submit="addEntry">
        <UFormField label="Label" name="label">
          <UInput v-model="state.label" class="w-full sm:max-w-sm" />
        </UFormField>
        <UButton type="submit" label="Add entry" />
      </NexaForm>
    </section>

    <section aria-labelledby="entries-heading" class="space-y-4">
      <h2 id="entries-heading" class="text-lg font-semibold text-highlighted">
        Entries
      </h2>
      <NexaTable :data="entries" :columns="columns" aria-labelledby="entries-heading" />
    </section>

    <NexaDialog
      v-model:open="dialogOpen"
      title="About this example"
      description="This dialog uses the shared Nexa UI layer."
    >
      <UButton label="About this example" color="neutral" variant="outline" />
      <template #body>
        <p class="text-muted">
          Press Escape or choose Done to close the dialog.
        </p>
      </template>
      <template #footer="{ close }">
        <UButton label="Done" @click="close" />
      </template>
    </NexaDialog>
  </UContainer>
</template>
