<script setup lang="ts">
import draggable from 'vuedraggable';
import { FIELD_TYPE_GROUPS } from '@nexa/types';

definePageMeta({ middleware: 'auth', layout: 'builder' });

const route = useRoute();
const { t } = useI18n();
const vehicle = fixtureVehicleEntity();
const fields = ref(structuredClone(vehicle.fields));
const selectedId = ref(fields.value[1]?.id ?? '');
const pickerOpen = ref(false);
const pickerQuery = ref('');
const toast = useToast();

const selected = computed(() => fields.value.find((f) => f.id === selectedId.value) ?? null);

const pickerGroups = computed(() => {
  const q = pickerQuery.value.toLowerCase();
  return FIELD_TYPE_GROUPS.map((g) => ({
    ...g,
    types: g.types.filter((ty) => !q || ty.toLowerCase().includes(q)),
  })).filter((g) => g.types.length > 0);
});

function addField(type: import('@nexa/types').FieldLogicalType) {
  fields.value.push({
    id: `f_new_${Date.now()}`, name: `field_${fields.value.length + 1}`, label: type, logicalType: type, nullable: true,
  });
  pickerOpen.value = false;
  pickerQuery.value = '';
  toast.add({ title: t('builder.designer.fieldAdded'), color: 'success' });
}

const { slash } = useMagicKeys();
watch(slash, (v) => {
  if (v) pickerOpen.value = true;
});
</script>

<template>
  <div class="flex h-full min-h-0">
    <!-- entity list -->
    <div class="hidden w-60 shrink-0 flex-col gap-1 border-r border-default p-3 md:flex">
      <p class="px-2 pb-1 text-nexa-caption font-medium text-dimmed uppercase">{{ t('builder.designer.entities') }}</p>
      <UButton v-for="e in fixtureModules()[0].entities" :key="e.id" variant="ghost" size="sm" class="w-full justify-start" :active="e.name === 'vehicle'" :label="`${e.label} (${e.fields.length})`" />
    </div>

    <!-- field rows -->
    <div class="flex min-w-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
      <div class="flex items-center justify-between pb-1">
        <p class="text-nexa-caption font-medium text-dimmed uppercase">{{ t('builder.designer.fields') }}</p>
        <UButton icon="i-lucide-plus" variant="outline" size="sm" :label="t('builder.designer.addField')" @click="pickerOpen = true" />
      </div>
      <draggable v-model="fields" item-key="id" class="flex flex-col gap-1" :animation="150">
        <template #item="{ element }">
          <NxFieldRow :field="element" :selected="element.id === selectedId" @click="selectedId = element.id">
            <template #default>
              <UIcon name="i-lucide-pencil" class="size-3.5 text-dimmed" />
            </template>
          </NxFieldRow>
        </template>
      </draggable>
    </div>

    <!-- properties -->
    <div class="hidden w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-default p-3 lg:flex">
      <p class="text-nexa-caption font-medium text-dimmed uppercase">{{ t('builder.designer.properties') }}</p>
      <div v-if="selected" class="flex flex-col gap-3">
        <UFormField :label="t('builder.designer.displayName')">
          <UInput v-model="selected.label" />
        </UFormField>
        <UFormField :label="t('builder.designer.key')" :hint="t('builder.designer.keyHint')">
          <UInput :model-value="selected.name" disabled />
        </UFormField>
        <UFormField :label="t('builder.designer.type')">
          <USelect v-model="selected.logicalType" :items="FIELD_TYPE_GROUPS.flatMap((g) => g.types).map((ty) => ({ label: ty, value: ty }))" />
        </UFormField>
        <UCheckbox v-model="selected.required" :label="t('builder.designer.required')" />
        <UCheckbox v-model="selected.unique" :label="t('builder.designer.unique')" />
        <UCheckbox v-model="selected.hidden" :label="t('builder.designer.hidden')" />
        <UCheckbox v-model="selected.readOnly" :label="t('builder.designer.readOnly')" />
        <div class="grid grid-cols-2 gap-2">
          <UFormField :label="t('builder.designer.minLength')">
            <UInputNumber :model-value="selected.minLength ?? undefined" @update:model-value="selected.minLength = $event as number" />
          </UFormField>
          <UFormField :label="t('builder.designer.maxLength')">
            <UInputNumber :model-value="selected.maxLength ?? undefined" @update:model-value="selected.maxLength = $event as number" />
          </UFormField>
        </div>
        <UFormField :label="t('builder.designer.regex')">
          <UInput :model-value="selected.pattern ?? ''" @update:model-value="selected.pattern = $event" class="font-mono" />
        </UFormField>
      </div>
      <NxEmptyState v-else :icon="'i-lucide-mouse-pointer-click'" :title="t('builder.designer.selectField')" />
    </div>

    <!-- field type picker -->
    <UModal v-model="pickerOpen" :title="t('builder.designer.typePicker')" :ui="{ content: 'max-w-lg' }">
      <div class="flex flex-col gap-3">
        <UInput v-model="pickerQuery" :placeholder="t('builder.designer.searchTypes')" autofocus>
          <template #leading><UIcon name="i-lucide-search" class="size-4" /></template>
          <template #trailing><UKbd value="/" /></template>
        </UInput>
        <div v-for="g in pickerGroups" :key="g.name" class="flex flex-col gap-1">
          <p class="text-nexa-caption font-medium text-dimmed uppercase">{{ g.name }}</p>
          <div class="flex flex-wrap gap-1.5">
            <UButton v-for="ty in g.types" :key="ty" variant="outline" size="sm" @click="addField(ty)">{{ ty }}</UButton>
          </div>
        </div>
      </div>
    </UModal>
  </div>
</template>
