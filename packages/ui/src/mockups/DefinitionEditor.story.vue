<script setup lang="ts">
/**
 * Mockup: Definition editor (Builder). Directus-style: a field editor split into task groups
 * (identity → type & options → validation → behavior), a live "how users see it" preview, and
 * an explicit Source / Type / Target relation editor. Options shown are only those in
 * FieldOptionsSchema; field types are the real FieldTypeSchema values, grouped for scanning.
 */
import { computed, ref } from 'vue';
import { ArrowRight, Check } from 'lucide-vue-next';
import type { FieldType } from '@nexa/meta';
import UiButton from '../components/UiButton.vue';
import UiInput from '../components/UiInput.vue';
import UiSelect from '../components/UiSelect.vue';
import UiSwitch from '../components/UiSwitch.vue';
import UiAlert from '../components/UiAlert.vue';
import UiBadge from '../components/UiBadge.vue';
import UiFieldWrapper from '../components/UiFieldWrapper.vue';
import MockShell from './parts/MockShell.vue';
import { relationTypeLabel, sampleEntities } from './parts/data';

const typeGroups: Array<{ label: string; types: Array<{ type: FieldType; label: string }> }> = [
  { label: 'Text', types: [{ type: 'text', label: 'Text' }, { type: 'longText', label: 'Long text' }, { type: 'email', label: 'Email' }, { type: 'phone', label: 'Phone' }, { type: 'url', label: 'URL' }] },
  { label: 'Numbers', types: [{ type: 'integer', label: 'Integer' }, { type: 'number', label: 'Number' }, { type: 'decimal', label: 'Decimal' }, { type: 'currency', label: 'Currency' }, { type: 'percentage', label: 'Percentage' }] },
  { label: 'Date & time', types: [{ type: 'date', label: 'Date' }, { type: 'datetime', label: 'Date & time' }, { type: 'time', label: 'Time' }] },
  { label: 'Choice', types: [{ type: 'boolean', label: 'Yes / No' }, { type: 'select', label: 'Select' }, { type: 'multiSelect', label: 'Multi-select' }] },
  { label: 'Linked & computed', types: [{ type: 'reference', label: 'Reference' }, { type: 'formula', label: 'Formula' }, { type: 'computed', label: 'Computed' }, { type: 'autoNumber', label: 'Auto number' }] },
  { label: 'Other', types: [{ type: 'file', label: 'File link' }, { type: 'image', label: 'Image link' }, { type: 'json', label: 'JSON' }] },
];

const type = ref<FieldType>('text');
const label = ref('Plate');
const name = ref('plate');
const helpText = ref('Registration plate as printed on the vehicle.');
const flags = ref({ required: true, unique: true, searchable: true, sortable: true, filterable: true, hidden: false, readonly: false });
const flagRows: Array<{ key: keyof typeof flags.value; title: string; hint: string }> = [
  { key: 'required', title: 'Required', hint: 'A record cannot be saved without a value.' },
  { key: 'unique', title: 'Unique', hint: 'No two records can share the same value.' },
  { key: 'searchable', title: 'Searchable', hint: 'Included when users search the table.' },
  { key: 'sortable', title: 'Sortable', hint: 'Columns can be sorted by this field.' },
  { key: 'filterable', title: 'Filterable', hint: 'Can be used in record filters.' },
  { key: 'readonly', title: 'Read-only', hint: 'Shown but cannot be edited in forms.' },
  { key: 'hidden', title: 'Hidden', hint: 'Omitted from every API response.' },
];
const isStatus = ref(false);
const isNumeric = computed(() => ['integer', 'number', 'decimal', 'currency', 'percentage'].includes(type.value));
const isText = computed(() => ['text', 'longText'].includes(type.value));
const isChoice = computed(() => ['select', 'multiSelect'].includes(type.value));
const choices = ref([{ value: 'available', label: 'Available' }, { value: 'rented', label: 'Rented' }, { value: 'maintenance', label: 'Maintenance' }]);
const typeLabel = computed(() => typeGroups.flatMap((g) => g.types).find((t) => t.type === type.value)?.label ?? type.value);
// Names already used on Vehicle in the sample definition (the real check runs on the server).
const takenNames = ['plate', 'make', 'model', 'dailyRate', 'status'];
const errors = computed<Partial<Record<string, string>>>(() => {
  const n = name.value.trim();
  if (!n) return { name: 'Name is required.' };
  if (takenNames.includes(n)) return { name: `A field named “${n}” already exists on Vehicle.` };
  return {};
});
// Sample-only: nothing is persisted, so the outcome is stated instead of implied.
const saved = ref(false);
// Preview maps the chosen type to the input a user would actually see.
const previewInput = computed(() => {
  if (isChoice.value) return 'choice';
  if (type.value === 'boolean') return 'boolean';
  if (type.value === 'longText') return 'textarea';
  if (isNumeric.value) return 'number';
  if (['date', 'datetime', 'time'].includes(type.value)) return type.value;
  if (type.value === 'formula' || type.value === 'computed' || type.value === 'autoNumber') return 'readonly';
  return 'text';
});

// Relation editor
const relName = ref('Maintenance history');
const relSource = ref('vehicle');
const relTarget = ref('maintenance');
const relType = ref<'oneToOne' | 'oneToMany' | 'manyToOne' | 'manyToMany'>('oneToMany');
const sourceLabel = computed(() => sampleEntities.find((e) => e.id === relSource.value)?.label ?? '');
const targetLabel = computed(() => sampleEntities.find((e) => e.id === relTarget.value)?.label ?? '');
const selfMany = computed(() => relSource.value === relTarget.value && relType.value === 'manyToMany');
const sentence = computed(() => ({
  oneToOne: `Each ${sourceLabel.value} links to at most one ${targetLabel.value}, and the reverse.`,
  oneToMany: `One ${sourceLabel.value} can have many ${targetLabel.value} records; each ${targetLabel.value} belongs to one ${sourceLabel.value}.`,
  manyToOne: `Many ${sourceLabel.value} records can point to one ${targetLabel.value}.`,
  manyToMany: `${sourceLabel.value} and ${targetLabel.value} records can each link to many of the other.`,
}[relType.value]));

function trySave() {
  saved.value = Object.keys(errors.value).length === 0;
}
</script>

<template>
  <Story
    title="Mockups/DefinitionEditor"
    group="Mockups"
  >
    <Variant title="Field editor">
      <MockShell
        active="modules"
        title="Edit field"
        description="Changes apply to every record of this entity once the module is enabled."
        :crumbs="['Modules', 'Fleet Management', 'Vehicle']"
      >
        <template #actions>
          <UiButton color="neutral">
            Cancel
          </UiButton>
          <UiButton @click="trySave">
            Save field
          </UiButton>
        </template>

        <UiAlert
          v-if="errors.name"
          tone="danger"
        >
          1 field needs attention before this definition can be saved.
        </UiAlert>

        <UiAlert
          v-else-if="saved"
          tone="neutral"
        >
          Sample only: nothing was saved. A valid name passes the check here; the server enforces it on save.
        </UiAlert>
        <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <form
            class="space-y-10"
            @submit.prevent="trySave"
          >
            <!-- 1 Identity -->
            <section aria-labelledby="g1">
              <h2
                id="g1"
                class="text-base font-semibold"
              >
                1 · Identity
              </h2>
              <p class="mb-4 text-sm text-foreground-muted">
                How the field is named for users and for the API.
              </p>
              <div class="grid gap-4 sm:grid-cols-2">
                <UiFieldWrapper
                  label="Label"
                  required
                  help-text="Shown on forms and column headers."
                >
                  <template #default="{ id, describedBy }">
                    <UiInput
                      :id="id"
                      v-model="label"
                      :aria-describedby="describedBy"
                    />
                  </template>
                </UiFieldWrapper>
                <UiFieldWrapper
                  label="Name"
                  required
                  :error="errors.name"
                  help-text="Used by the API. Cannot change after records exist."
                >
                  <template #default="{ id, describedBy, invalid }">
                    <UiInput
                      :id="id"
                      v-model="name"
                      class="font-mono"
                      :aria-invalid="invalid || undefined"
                      :aria-describedby="describedBy"
                    />
                  </template>
                </UiFieldWrapper>
              </div>
              <UiFieldWrapper
                class="mt-4"
                label="Help text"
              >
                <template #default="{ id }">
                  <UiInput
                    :id="id"
                    v-model="helpText"
                  />
                </template>
              </UiFieldWrapper>
            </section>

            <!-- 2 Type -->
            <section aria-labelledby="g2">
              <h2
                id="g2"
                class="text-base font-semibold"
              >
                2 · Type & options
              </h2>
              <p class="mb-4 text-sm text-foreground-muted">
                Pick what kind of value this field stores.
              </p>
              <div
                class="space-y-3"
                role="radiogroup"
                aria-label="Field type"
              >
                <div
                  v-for="g in typeGroups"
                  :key="g.label"
                  class="grid gap-2 sm:grid-cols-[130px_1fr] sm:items-center"
                >
                  <p class="text-xs font-semibold uppercase tracking-wider text-foreground-subtle">
                    {{ g.label }}
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="t in g.types"
                      :key="t.type"
                      type="button"
                      role="radio"
                      :aria-checked="type === t.type"
                      :class="[
                        'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        type === t.type ? 'border-primary bg-success-soft font-medium text-success-soft-foreground' : 'border-border bg-surface text-foreground-muted hover:border-border-strong hover:text-foreground',
                      ]"
                      @click="type = t.type"
                    >
                      <Check
                        v-if="type === t.type"
                        class="size-3.5"
                        aria-hidden="true"
                      />{{ t.label }}
                    </button>
                  </div>
                </div>
              </div>

              <div
                v-if="isChoice"
                class="mt-5 rounded-lg border border-border bg-surface p-4"
              >
                <p class="text-sm font-medium">
                  Choices
                </p>
                <p class="mb-3 text-xs text-foreground-muted">
                  At least one; values must be unique.
                </p>
                <ul class="space-y-2">
                  <li
                    v-for="(c, i) in choices"
                    :key="i"
                    class="grid grid-cols-2 gap-2"
                  >
                    <UiInput
                      v-model="c.label"
                      :aria-label="`Choice ${i + 1} label`"
                    />
                    <UiInput
                      v-model="c.value"
                      class="font-mono"
                      :aria-label="`Choice ${i + 1} value`"
                    />
                  </li>
                </ul>
                <div class="mt-3 flex items-center justify-between">
                  <UiButton
                    size="sm"
                    color="neutral"
                    @click="choices.push({ value: '', label: '' })"
                  >
                    Add choice
                  </UiButton>
                  <label class="flex items-center gap-2 text-sm"><UiSwitch v-model="isStatus" />Use as status field</label>
                </div>
              </div>
              <p
                v-else-if="type === 'reference'"
                class="mt-5 rounded-lg border border-border bg-surface p-4 text-sm text-foreground-muted"
              >
                Pick the entity this field points to. Records show the target’s label.
              </p>
              <p
                v-else-if="type === 'formula' || type === 'computed'"
                class="mt-5 rounded-lg border border-border bg-surface p-4 text-sm text-foreground-muted"
              >
                Calculated automatically from an expression. Formula cycles are rejected when you save.
              </p>
            </section>

            <!-- 3 Validation -->
            <section aria-labelledby="g3">
              <h2
                id="g3"
                class="text-base font-semibold"
              >
                3 · Validation
              </h2>
              <p class="mb-4 text-sm text-foreground-muted">
                Rules the server enforces on every write.
              </p>
              <div class="grid gap-4 sm:grid-cols-2">
                <UiFieldWrapper
                  v-if="isNumeric"
                  label="Minimum"
                >
                  <template #default="{ id }">
                    <UiInput
                      :id="id"
                      type="number"
                    />
                  </template>
                </UiFieldWrapper>
                <UiFieldWrapper
                  v-if="isNumeric"
                  label="Maximum"
                >
                  <template #default="{ id }">
                    <UiInput
                      :id="id"
                      type="number"
                    />
                  </template>
                </UiFieldWrapper>
                <UiFieldWrapper
                  v-if="isText"
                  class="sm:col-span-2"
                  label="Pattern (regex)"
                  help-text="Optional. Example: ^[ก-ฮ]{1,2}-\d{1,4}$"
                >
                  <template #default="{ id, describedBy }">
                    <UiInput
                      :id="id"
                      class="font-mono"
                      :aria-describedby="describedBy"
                    />
                  </template>
                </UiFieldWrapper>
              </div>
              <ul class="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                <li
                  v-for="row in flagRows.slice(0, 2)"
                  :key="row.key"
                  class="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div>
                    <p class="text-sm font-medium">
                      {{ row.title }}
                    </p><p class="text-xs text-foreground-muted">
                      {{ row.hint }}
                    </p>
                  </div>
                  <UiSwitch
                    v-model="flags[row.key]"
                    :aria-label="row.title"
                  />
                </li>
              </ul>
            </section>

            <!-- 4 Behavior -->
            <section aria-labelledby="g4">
              <h2
                id="g4"
                class="text-base font-semibold"
              >
                4 · Behavior
              </h2>
              <p class="mb-4 text-sm text-foreground-muted">
                Where and how users can work with the field.
              </p>
              <ul class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                <li
                  v-for="row in flagRows.slice(2)"
                  :key="row.key"
                  class="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div>
                    <p class="text-sm font-medium">
                      {{ row.title }}
                    </p><p class="text-xs text-foreground-muted">
                      {{ row.hint }}
                    </p>
                  </div>
                  <UiSwitch
                    v-model="flags[row.key]"
                    :aria-label="row.title"
                  />
                </li>
              </ul>
            </section>
          </form>

          <!-- Live preview -->
          <aside
            class="h-fit space-y-3 lg:sticky lg:top-4"
            aria-label="Preview"
          >
            <p class="text-xs font-semibold uppercase tracking-wider text-foreground-subtle">
              How users will see it
            </p>
            <div class="space-y-3 rounded-xl border border-border bg-surface p-4">
              <UiFieldWrapper
                :label="label || 'Untitled'"
                :required="flags.required"
                :help-text="helpText"
              >
                <template #default="{ id, describedBy }">
                  <UiSwitch
                    v-if="previewInput === 'boolean'"
                    :id="id"
                    :aria-describedby="describedBy"
                    :disabled="flags.readonly"
                  />
                  <textarea
                    v-else-if="previewInput === 'textarea'"
                    :id="id"
                    :aria-describedby="describedBy"
                    :disabled="flags.readonly"
                    rows="3"
                    placeholder="Sample value"
                    class="flex w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <UiSelect
                    v-else-if="previewInput === 'choice'"
                    :id="id"
                    :aria-describedby="describedBy"
                    :disabled="flags.readonly"
                  >
                    <option value="">
                      Choose…
                    </option>
                    <option
                      v-for="c in choices"
                      :key="c.value"
                      :value="c.value"
                    >
                      {{ c.label }}
                    </option>
                  </UiSelect>
                  <UiInput
                    v-else-if="previewInput === 'number'"
                    :id="id"
                    type="number"
                    :aria-describedby="describedBy"
                    :disabled="flags.readonly"
                    placeholder="0"
                  />
                  <UiInput
                    v-else-if="previewInput === 'date' || previewInput === 'datetime' || previewInput === 'time'"
                    :id="id"
                    :type="previewInput === 'date' ? 'date' : previewInput === 'time' ? 'time' : 'datetime-local'"
                    :aria-describedby="describedBy"
                    :disabled="flags.readonly"
                  />
                  <p
                    v-else-if="previewInput === 'readonly'"
                    :id="id"
                    :aria-describedby="describedBy"
                    class="rounded-md border border-dashed border-border-strong px-3 py-2 text-sm text-foreground-muted"
                  >
                    Calculated by the server
                  </p>
                  <UiInput
                    v-else
                    :id="id"
                    :aria-describedby="describedBy"
                    :disabled="flags.readonly"
                    placeholder="Sample value"
                  />
                </template>
              </UiFieldWrapper>
            </div>
            <dl class="space-y-2 rounded-xl border border-border bg-surface p-4 text-sm">
              <div class="flex justify-between gap-3">
                <dt class="text-foreground-muted">
                  Type
                </dt><dd class="font-medium">
                  {{ typeLabel }}
                </dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-foreground-muted">
                  API name
                </dt><dd class="font-mono text-xs">
                  {{ name }}
                </dd>
              </div>
              <div class="flex flex-wrap gap-1.5 pt-1">
                <UiBadge
                  v-for="row in flagRows.filter((r) => flags[r.key])"
                  :key="row.key"
                >
                  {{ row.title }}
                </UiBadge>
              </div>
            </dl>
          </aside>
        </div>
      </MockShell>
    </Variant>

    <Variant title="Relation editor">
      <MockShell
        active="modules"
        title="New relation"
        description="Link two entities so records can reference each other."
        :crumbs="['Modules', 'Fleet Management', 'Relations']"
      >
        <template #actions>
          <UiButton color="neutral">
            Cancel
          </UiButton>
          <UiButton :disabled="selfMany">
            Save relation
          </UiButton>
        </template>

        <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <form
            class="space-y-5"
            @submit.prevent
          >
            <UiFieldWrapper
              label="Name"
              required
            >
              <template #default="{ id }">
                <UiInput
                  :id="id"
                  v-model="relName"
                />
              </template>
            </UiFieldWrapper>
            <UiFieldWrapper
              label="Source entity"
              required
              help-text="The entity that owns the link."
            >
              <template #default="{ id, describedBy }">
                <UiSelect
                  :id="id"
                  v-model="relSource"
                  :aria-describedby="describedBy"
                >
                  <option
                    v-for="e in sampleEntities"
                    :key="e.id"
                    :value="e.id"
                  >
                    {{ e.label }}
                  </option>
                </UiSelect>
              </template>
            </UiFieldWrapper>
            <UiFieldWrapper
              label="Relation type"
              required
            >
              <template #default="{ id }">
                <UiSelect
                  :id="id"
                  v-model="relType"
                >
                  <option
                    v-for="(text, key) in relationTypeLabel"
                    :key="key"
                    :value="key"
                  >
                    {{ text }}
                  </option>
                </UiSelect>
              </template>
            </UiFieldWrapper>
            <UiFieldWrapper
              label="Target entity"
              required
              :error="selfMany ? 'An entity cannot have a many-to-many relation to itself.' : undefined"
            >
              <template #default="{ id, describedBy, invalid }">
                <UiSelect
                  :id="id"
                  v-model="relTarget"
                  :aria-invalid="invalid || undefined"
                  :aria-describedby="describedBy"
                >
                  <option
                    v-for="e in sampleEntities"
                    :key="e.id"
                    :value="e.id"
                  >
                    {{ e.label }}
                  </option>
                </UiSelect>
              </template>
            </UiFieldWrapper>
            <UiFieldWrapper
              label="When a record is deleted"
              help-text="Restrict blocks deleting a record that still has links."
            >
              <template #default="{ id, describedBy }">
                <UiSelect
                  :id="id"
                  :aria-describedby="describedBy"
                >
                  <option value="restrict">
                    Restrict
                  </option>
                  <option value="cascade">
                    Cascade (delete linked records)
                  </option>
                </UiSelect>
              </template>
            </UiFieldWrapper>
          </form>

          <aside
            class="h-fit space-y-4 rounded-xl border border-border bg-surface p-5"
            aria-label="Relation summary"
          >
            <p class="text-xs font-semibold uppercase tracking-wider text-foreground-subtle">
              Summary
            </p>
            <div class="flex items-center justify-between gap-3 rounded-lg bg-background p-4">
              <div class="text-center">
                <p class="text-[11px] uppercase tracking-wider text-foreground-subtle">
                  Source
                </p><p class="font-semibold">
                  {{ sourceLabel }}
                </p>
              </div>
              <div class="flex flex-col items-center gap-1">
                <UiBadge tone="success">
                  {{ relationTypeLabel[relType] }}
                </UiBadge><ArrowRight
                  class="size-4 text-foreground-subtle"
                  aria-hidden="true"
                />
              </div>
              <div class="text-center">
                <p class="text-[11px] uppercase tracking-wider text-foreground-subtle">
                  Target
                </p><p class="font-semibold">
                  {{ targetLabel }}
                </p>
              </div>
            </div>
            <p class="text-sm text-foreground-muted">
              {{ sentence }}
            </p>
            <UiAlert tone="neutral">
              Relations can only be changed while the module is a draft or in review.
            </UiAlert>
          </aside>
        </div>
      </MockShell>
    </Variant>
  </Story>
</template>
