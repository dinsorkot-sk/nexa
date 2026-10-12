<script setup lang="ts">
/**
 * Mockup: Definition Editor (entity / field / relation forms)
 * Purpose: Show how entity, field, and relation editors look using @nexa/ui
 * primitives. These are the forms the rebuilt web app will use.
 *
 * @nexa/ui primitives: UiCard, UiButton, UiInput, UiSelect, UiSwitch,
 *   UiCheckbox, UiFieldWrapper, UiBadge, UiAlert, UiDialog
 */
import { ref } from 'vue';
import UiCard from '../components/UiCard.vue';
import UiButton from '../components/UiButton.vue';
import UiInput from '../components/UiInput.vue';
import UiSelect from '../components/UiSelect.vue';
import UiSwitch from '../components/UiSwitch.vue';
import UiCheckbox from '../components/UiCheckbox.vue';
import UiBadge from '../components/UiBadge.vue';
import UiAlert from '../components/UiAlert.vue';
import UiDialog from '../components/UiDialog.vue';
import UiFieldWrapper from '../components/UiFieldWrapper.vue';

const entityName = ref('Vehicle');
const entityPlural = ref('Vehicles');
const entityDescription = ref('Fleet vehicles available for rental.');

const fieldName = ref('plate');
const fieldLabel = ref('Plate');
const fieldType = ref('text');
const fieldRequired = ref(true);
const fieldUnique = ref(true);
const fieldSearchable = ref(true);
const fieldHidden = ref(false);

const relationName = ref('Maintenance history');
const relationSource = ref('vehicle');
const relationTarget = ref('maintenance');
const relationType = ref('one-to-many');

const showArchiveDialog = ref(false);
</script>

<template>
  <Story
    title="Mockups/DefinitionEditor"
    group="Mockups"
  >
    <Variant title="Entity Form">
      <div class="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 class="text-2xl font-semibold">Edit entity</h1>
          <p class="mt-1 text-sm text-foreground-muted">Entity identity and display settings.</p>
        </div>

        <UiCard class="p-6">
          <form class="space-y-4">
            <UiFieldWrapper
              id="entity-name"
              label="Name"
              required
            >
              <template #default="{ id, describedBy }">
                <UiInput
                  :id="id"
                  v-model="entityName"
                  :aria-describedby="describedBy"
                />
              </template>
            </UiFieldWrapper>

            <UiFieldWrapper
              id="entity-plural"
              label="Plural label"
              required
            >
              <template #default="{ id, describedBy }">
                <UiInput
                  :id="id"
                  v-model="entityPlural"
                  :aria-describedby="describedBy"
                />
              </template>
            </UiFieldWrapper>

            <UiFieldWrapper
              id="entity-description"
              label="Description"
            >
              <template #default="{ id, describedBy }">
                <UiInput
                  :id="id"
                  v-model="entityDescription"
                  :aria-describedby="describedBy"
                />
              </template>
            </UiFieldWrapper>

            <div class="flex items-center gap-2 pt-2">
              <UiButton type="submit">Save entity</UiButton>
              <UiButton
                type="button"
                variant="secondary"
              >
                Cancel
              </UiButton>
            </div>
          </form>
        </UiCard>
      </div>
    </Variant>

    <Variant title="Field Form">
      <div class="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 class="text-2xl font-semibold">Edit field</h1>
          <p class="mt-1 text-sm text-foreground-muted">Field identity, type, and behavior.</p>
        </div>

        <UiCard class="p-6">
          <form class="space-y-4">
            <div class="grid gap-4 sm:grid-cols-2">
              <UiFieldWrapper
                id="field-name"
                label="Name"
                required
              >
                <template #default="{ id, describedBy }">
                  <UiInput
                    :id="id"
                    v-model="fieldName"
                    :aria-describedby="describedBy"
                  />
                </template>
              </UiFieldWrapper>

              <UiFieldWrapper
                id="field-label"
                label="Label"
                required
              >
                <template #default="{ id, describedBy }">
                  <UiInput
                    :id="id"
                    v-model="fieldLabel"
                    :aria-describedby="describedBy"
                  />
                </template>
              </UiFieldWrapper>
            </div>

            <UiFieldWrapper
              id="field-type"
              label="Type"
              required
            >
              <template #default="{ id, describedBy }">
                <UiSelect
                  :id="id"
                  v-model="fieldType"
                  :aria-describedby="describedBy"
                >
                  <option value="text">Text</option>
                  <option value="longText">Long text</option>
                  <option value="integer">Integer</option>
                  <option value="decimal">Decimal</option>
                  <option value="currency">Currency</option>
                  <option value="date">Date</option>
                  <option value="datetime">DateTime</option>
                  <option value="select">Select</option>
                  <option value="multiSelect">Multi-select</option>
                  <option value="boolean">Boolean</option>
                  <option value="reference">Reference</option>
                </UiSelect>
              </template>
            </UiFieldWrapper>

            <div class="grid gap-4 sm:grid-cols-2">
              <UiFieldWrapper
                id="field-required"
                label="Required"
              >
                <template #default="{ id }">
                  <UiSwitch
                    :id="id"
                    v-model="fieldRequired"
                  />
                </template>
              </UiFieldWrapper>

              <UiFieldWrapper
                id="field-unique"
                label="Unique"
              >
                <template #default="{ id }">
                  <UiSwitch
                    :id="id"
                    v-model="fieldUnique"
                  />
                </template>
              </UiFieldWrapper>

              <UiFieldWrapper
                id="field-searchable"
                label="Searchable"
              >
                <template #default="{ id }">
                  <UiSwitch
                    :id="id"
                    v-model="fieldSearchable"
                  />
                </template>
              </UiFieldWrapper>

              <UiFieldWrapper
                id="field-hidden"
                label="Hidden"
              >
                <template #default="{ id }">
                  <UiSwitch
                    :id="id"
                    v-model="fieldHidden"
                  />
                </template>
              </UiFieldWrapper>
            </div>

            <div class="flex items-center gap-2 pt-2">
              <UiButton type="submit">Save field</UiButton>
              <UiButton
                type="button"
                variant="secondary"
              >
                Cancel
              </UiButton>
            </div>
          </form>
        </UiCard>
      </div>
    </Variant>

    <Variant title="Relation Form">
      <div class="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 class="text-2xl font-semibold">Edit relation</h1>
          <p class="mt-1 text-sm text-foreground-muted">Link between two entities.</p>
        </div>

        <UiCard class="p-6">
          <form class="space-y-4">
            <UiFieldWrapper
              id="relation-name"
              label="Name"
              required
            >
              <template #default="{ id, describedBy }">
                <UiInput
                  :id="id"
                  v-model="relationName"
                  :aria-describedby="describedBy"
                />
              </template>
            </UiFieldWrapper>

            <div class="grid gap-4 sm:grid-cols-2">
              <UiFieldWrapper
                id="relation-source"
                label="Source entity"
                required
              >
                <template #default="{ id, describedBy }">
                  <UiSelect
                    :id="id"
                    v-model="relationSource"
                    :aria-describedby="describedBy"
                  >
                    <option value="vehicle">Vehicle</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="rental">Rental</option>
                  </UiSelect>
                </template>
              </UiFieldWrapper>

              <UiFieldWrapper
                id="relation-target"
                label="Target entity"
                required
              >
                <template #default="{ id, describedBy }">
                  <UiSelect
                    :id="id"
                    v-model="relationTarget"
                    :aria-describedby="describedBy"
                  >
                    <option value="maintenance">Maintenance</option>
                    <option value="rental">Rental</option>
                    <option value="vehicle">Vehicle</option>
                  </UiSelect>
                </template>
              </UiFieldWrapper>
            </div>

            <UiFieldWrapper
              id="relation-type"
              label="Cardinality"
              required
            >
              <template #default="{ id, describedBy }">
                <UiSelect
                  :id="id"
                  v-model="relationType"
                  :aria-describedby="describedBy"
                >
                  <option value="one-to-many">One-to-many</option>
                  <option value="many-to-one">Many-to-one</option>
                  <option value="many-to-many">Many-to-many</option>
                </UiSelect>
              </template>
            </UiFieldWrapper>

            <div class="flex items-center gap-2 pt-2">
              <UiButton type="submit">Save relation</UiButton>
              <UiButton
                type="button"
                variant="secondary"
              >
                Cancel
              </UiButton>
            </div>
          </form>
        </UiCard>
      </div>
    </Variant>

    <Variant title="Archive Module Dialog">
      <div class="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 class="text-2xl font-semibold">Fleet Management</h1>
          <p class="mt-1 text-sm text-foreground-muted">Archive this module and all its data.</p>
        </div>

        <UiCard class="p-6">
          <UiAlert
            tone="warning"
            class="mb-4"
          >
            Archiving will hide this module from all users. This action cannot be undone.
          </UiAlert>

          <div class="flex items-center gap-2">
            <UiButton
              variant="danger"
              @click="showArchiveDialog = true"
            >
              Archive module
            </UiButton>
            <UiButton variant="secondary">
              Cancel
            </UiButton>
          </div>
        </UiCard>

        <UiDialog v-model="showArchiveDialog">
          <template #title>
            Archive Fleet Management?
          </template>
          <template #description>
            This will permanently archive the module, all entities, fields, and records. This action cannot be undone.
          </template>
          <div class="flex items-center justify-end gap-2">
            <UiButton
              variant="secondary"
              @click="showArchiveDialog = false"
            >
              Cancel
            </UiButton>
            <UiButton
              variant="danger"
              @click="showArchiveDialog = false"
            >
              Archive
            </UiButton>
          </div>
        </UiDialog>
      </div>
    </Variant>
  </Story>
</template>