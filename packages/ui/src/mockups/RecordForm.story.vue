<script setup lang="ts">
/**
 * Mockup: Record Form (create / edit vehicle)
 * Purpose: Metadata-driven form using MetaForm with the real FieldDefinition shape.
 *
 * @nexa/ui primitives: MetaForm, UiCard, UiButton, UiBadge, UiAlert
 */
import { ref } from 'vue';
import UiCard from '../components/UiCard.vue';
import UiButton from '../components/UiButton.vue';
import UiBadge from '../components/UiBadge.vue';
import UiAlert from '../components/UiAlert.vue';
import MetaForm from '../components/MetaForm.vue';
import { vehicleForm, vehicleFields, vehicleRows } from './_fixtures';

const existing = vehicleRows[0];

// Field-level errors the server would return for a duplicate plate.
const duplicateErrors = ref<Record<string, string>>({
  plate: 'This plate is already registered.',
  dailyRate: 'Rate must be between 0 and 100000.',
});

const submitting = ref(false);
function submit() {
  submitting.value = true;
  setTimeout(() => (submitting.value = false), 600);
}

const backToList = () => console.log('cancel');
</script>

<template>
  <Story
    title="Mockups/RecordForm"
    group="Mockups"
  >
    <Variant title="Create">
      <div class="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 class="text-2xl font-semibold">New vehicle</h1>
          <p class="mt-1 text-sm text-foreground-muted">Fields come from the Vehicle entity definition.</p>
        </div>

        <UiCard class="p-6">
          <MetaForm
            :form="vehicleForm"
            :fields="vehicleFields"
            :submitting="submitting"
            :cancel="backToList"
            @submit="submit"
          />
        </UiCard>
      </div>
    </Variant>

    <Variant title="Edit">
      <div class="mx-auto max-w-3xl space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-semibold">กข-1234</h1>
            <p class="mt-1 text-sm text-foreground-muted">Toyota Altis · version 3</p>
          </div>
          <UiButton variant="danger">Archive</UiButton>
        </div>

        <UiCard class="p-6">
          <MetaForm
            :form="vehicleForm"
            :fields="vehicleFields"
            :initial-data="existing.data"
            :version="existing.version"
            submit-label="Save changes"
            :cancel="backToList"
            :submitting="submitting"
            @submit="submit"
          />
        </UiCard>
      </div>
    </Variant>

    <Variant title="Validation Errors">
      <div class="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 class="text-2xl font-semibold">New vehicle</h1>
          <p class="mt-1 text-sm text-foreground-muted">Entered values are preserved when the server rejects them.</p>
        </div>

        <UiCard class="p-6">
          <MetaForm
            :form="vehicleForm"
            :fields="vehicleFields"
            :initial-data="{ plate: 'กข-1234', make: 'Toyota', dailyRate: 999999 }"
            :field-errors="duplicateErrors"
            form-error="2 fields need attention before this vehicle can be saved."
          />
        </UiCard>
      </div>
    </Variant>

    <Variant title="Stale Record / Conflict">
      <div class="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 class="text-2xl font-semibold">กข-1234</h1>
          <p class="mt-1 text-sm text-foreground-muted">Someone else saved this vehicle while you were editing.</p>
        </div>

        <UiCard class="p-6">
          <UiAlert
            tone="danger"
            class="mb-4"
          >
            This record was updated by Nok a minute ago. Reload to see their changes, or overwrite with your version.
          </UiAlert>

          <MetaForm
            :form="vehicleForm"
            :fields="vehicleFields"
            :initial-data="{ ...existing.data, mileage: 45310 }"
            :version="existing.version"
            submit-label="Overwrite"
            :cancel="backToList"
          />
        </UiCard>
      </div>
    </Variant>

    <Variant title="Read-only (viewer role)">
      <div class="mx-auto max-w-3xl space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-semibold">กข-1234</h1>
            <div class="mt-1 flex items-center gap-2">
              <p class="text-sm text-foreground-muted">Toyota Altis</p>
              <UiBadge tone="neutral">Viewer</UiBadge>
            </div>
          </div>
        </div>

        <UiCard class="p-6">
          <MetaForm
            :form="vehicleForm"
            :fields="vehicleFields"
            :initial-data="existing.data"
            readonly
          />
        </UiCard>
      </div>
    </Variant>
  </Story>
</template>