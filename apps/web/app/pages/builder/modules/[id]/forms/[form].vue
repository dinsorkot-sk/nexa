<script setup lang="ts">
import draggable from 'vuedraggable';
import { FIELD_TYPE_GROUPS } from '@nexa/types';

definePageMeta({ middleware: 'auth', layout: 'builder' });

const { t } = useI18n();
const vehicle = fixtureVehicleEntity();
const paletteGroups = FIELD_TYPE_GROUPS.slice(0, 4);
const canvasFields = ref(vehicle.fields.slice(0, 8));
const selectedId = ref(canvasFields.value[0]?.id ?? '');
const toast = useToast();

const sections = ['ข้อมูลทั่วไป', 'การซื้อ', 'การใช้งาน'];

function addToCanvas(type: import('@nexa/types').FieldLogicalType) {
  canvasFields.value.push({ id: `f_c_${Date.now()}`, name: `field_${canvasFields.value.length + 1}`, label: type, logicalType: type, nullable: true });
  toast.add({ title: t('builder.designer.fieldAdded'), color: 'success' });
}

const selected = computed(() => canvasFields.value.find((f) => f.id === selectedId.value) ?? null);
</script>

<template>
  <div class="flex h-full min-h-0">
    <!-- palette -->
    <div class="hidden w-56 shrink-0 flex-col gap-3 overflow-y-auto border-r border-default p-3 md:flex">
      <p class="text-nexa-caption font-medium text-dimmed uppercase">{{ t('builder.formDesigner.palette') }}</p>
      <div v-for="g in paletteGroups" :key="g.name" class="flex flex-col gap-1">
        <p class="text-nexa-caption text-dimmed">{{ g.name }}</p>
        <div class="flex flex-wrap gap-1">
          <UButton v-for="ty in g.types" :key="ty" size="xs" variant="outline" @click="addToCanvas(ty)">{{ ty }}</UButton>
        </div>
      </div>
    </div>

    <!-- canvas -->
    <div class="min-w-0 flex-1 overflow-y-auto p-4">
      <div v-for="section in sections" :key="section" class="mb-4">
        <p class="mb-2 text-nexa-caption font-medium text-dimmed uppercase">{{ section }}</p>
        <div class="grid grid-cols-2 gap-2">
          <draggable v-model="canvasFields" item-key="id" group="fields" :animation="150" class="contents">
            <template #item="{ element }">
              <div
                class="rounded-md border p-2"
                :class="element.id === selectedId ? 'border-[--ui-primary] bg-[--ui-primary-soft]' : 'border-default bg-default'"
                @click="selectedId = element.id"
              >
                <p class="truncate text-nexa-body-medium text-highlighted">{{ element.label }}</p>
                <p class="truncate font-mono text-nexa-mono-small text-dimmed">{{ element.name }} · {{ element.logicalType }}</p>
              </div>
            </template>
          </draggable>
        </div>
      </div>
    </div>

    <!-- properties -->
    <div class="hidden w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-default p-3 lg:flex">
      <p class="text-nexa-caption font-medium text-dimmed uppercase">{{ t('builder.designer.properties') }}</p>
      <template v-if="selected">
        <UFormField :label="t('builder.designer.displayName')"><UInput v-model="selected.label" /></UFormField>
        <UFormField :label="t('builder.designer.type')">
          <USelect v-model="selected.logicalType" :items="FIELD_TYPE_GROUPS.flatMap((g) => g.types).map((ty) => ({ label: ty, value: ty }))" />
        </UFormField>
        <UCheckbox v-model="selected.required" :label="t('builder.designer.required')" />
        <UCheckbox v-model="selected.readOnly" :label="t('builder.designer.readOnly')" />
      </template>
      <NxEmptyState v-else :icon="'i-lucide-mouse-pointer-click'" :title="t('builder.designer.selectField')" />
    </div>
  </div>
</template>
