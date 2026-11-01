<script setup lang="ts">
import { buildSchema } from '@nexa/schema';

definePageMeta({ middleware: 'auth', layout: 'default' });

const route = useRoute();
const { t } = useI18n();
const { entity, modules } = useMetadata();
const { slug } = useTenant();
const { user } = useAuth();
const toast = useToast();

const moduleKey = route.params.module as string;
const entityName = route.params.entity as string;
const meta = computed(() => entity(moduleKey, entityName));

const formFields = computed(() => meta.value?.fields.filter((f) => !['formula', 'computed'].includes(f.logicalType)) ?? []);
const calculatedFields = computed(() => meta.value?.fields.filter((f) => ['formula', 'computed'].includes(f.logicalType)) ?? []);

const formState = ref<Record<string, unknown>>({});
const formError = ref<Record<string, string>>({});
const keepDraft = ref(true);
const saving = ref(false);
const dirty = ref(false);
const confirmLeave = ref(false);
const pendingRoute = ref<string | null>(null);

const moduleName = computed(() => modules.value.find((m) => m.key === moduleKey)?.name ?? moduleKey);
const draftKey = computed(() => `nexa:draft:${slug.value}:${user.value?.id ?? 'anon'}:${entityName}:new`);

const existingPlate = computed(() => (meta.value?.records ?? []).map((r) => String(r.plateNo ?? '').toLowerCase()));

watch(() => formState.value.plateNo, (v) => {
  if (typeof v === 'string' && existingPlate.value.includes(v.trim().toLowerCase())) {
    formError.value.plateNo = t('form.uniqueError', { value: v, record: 'VH-0001' });
  } else {
    delete formError.value.plateNo;
  }
});

// restore draft
onMounted(() => {
  try {
    const saved = localStorage.getItem(draftKey.value);
    if (saved) {
      const parsed = JSON.parse(saved) as { state: Record<string, unknown> };
      formState.value = parsed.state ?? {};
    }
  } catch { /* ignore corrupt draft */ }
});

// autosave every 5s
const { pause } = useIntervalFn(() => {
  if (dirty.value && keepDraft.value) {
    localStorage.setItem(draftKey.value, JSON.stringify({ state: formState.value, savedAt: new Date().toISOString() }));
  }
}, 5000);

watch(formState, () => { dirty.value = true; }, { deep: true });

function clearDraft() {
  localStorage.removeItem(draftKey.value);
}

async function submit() {
  const schema = buildSchema(formFields.value);
  const parsed = schema.safeParse(formState.value);
  if (!parsed.success) {
    formError.value = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key) formError.value[String(key)] = t('form.invalid');
    }
    return;
  }
  saving.value = true;
  await new Promise((r) => setTimeout(r, 800));
  saving.value = false;
  dirty.value = false;
  clearDraft();
  toast.add({ title: t('form.savedToast'), color: 'success' });
  navigateTo(`/m/${moduleKey}/${entityName}/rec_new`);
}

// unsaved changes guard
onBeforeRouteLeave((to) => {
  if (!dirty.value) return true;
  pendingRoute.value = to.fullPath;
  confirmLeave.value = true;
  return false;
});

useEventListener(window, 'beforeunload', (e: BeforeUnloadEvent) => {
  if (dirty.value) e.preventDefault();
});

function discardAndLeave() {
  dirty.value = false;
  confirmLeave.value = false;
  if (pendingRoute.value) navigateTo(pendingRoute.value);
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <NxPageHeader :icon="'i-lucide-plus'" :title="t('form.createTitle', { entity: meta?.label ?? entityName })" :description="`${moduleName} · ${t('form.statusInitial')}`">
      <template #actions>
        <UButton variant="ghost" :label="t('common.cancel')" :to="`/m/${moduleKey}/${entityName}`" />
        <UButton color="primary" :loading="saving" :label="saving ? t('form.saving') : t('common.save')" @click="submit" />
      </template>
    </NxPageHeader>

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <UCard class="rounded-xl xl:col-span-2" :ui="{ body: { padding: 'p-6' } }">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <NxFieldInput v-for="f in formFields" :key="f.id" :field="f" v-model="formState[f.name]" :error="formError[f.name]" />
        </div>

        <div v-if="calculatedFields.length" class="mt-6 flex flex-col gap-4 border-t border-default pt-4">
          <div v-for="f in calculatedFields" :key="f.id" class="flex flex-col gap-1">
            <NxFieldInput :field="f" :model-value="undefined" />
            <p v-if="f.formula" class="flex items-center gap-1.5 font-mono text-nexa-mono-small text-dimmed">
              <UIcon name="i-lucide-function-square" class="size-3.5" />
              {{ f.formula }}
            </p>
          </div>
        </div>
      </UCard>

      <div class="flex flex-col gap-4">
        <UCard class="rounded-xl" :ui="{ body: { padding: 'p-4' } }">
          <template #header>
            <p class="text-nexa-subheading text-highlighted">{{ t('form.saveStatus') }}</p>
          </template>
          <div class="flex flex-col gap-2">
            <p v-if="saving" class="flex items-center gap-2 text-nexa-body text-muted">
              <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
              {{ t('form.saving') }}
            </p>
            <p v-else class="flex items-center gap-2 text-nexa-body text-muted">
              <UIcon name="i-lucide-check-circle-2" class="size-4 text-[--ui-success]" />
              {{ t('form.savedState') }}
            </p>
            <UCheckbox v-model="keepDraft" :label="t('form.keepDraft')" />
            <p class="text-nexa-caption text-dimmed">{{ t('form.draftHint') }}</p>
          </div>
        </UCard>

        <UCard class="rounded-xl" :ui="{ body: { padding: 'p-4' } }">
          <template #header>
            <p class="text-nexa-subheading text-highlighted">{{ t('form.workflowState') }}</p>
          </template>
          <UBadge color="neutral" variant="soft" size="md">{{ t('form.initialState') }}</UBadge>
        </UCard>

        <UAlert color="info" variant="soft" :title="t('form.imageUrlTitle')" :description="t('form.imageUrlHint')" />
      </div>
    </div>

    <UModal v-model="confirmLeave" :title="t('form.unsavedTitle')" :description="t('form.unsavedHint')" :ui="{ content: 'max-w-sm' }">
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" :label="t('common.keepEditing')" @click="confirmLeave = false" />
        <UButton color="error" variant="solid" :label="t('common.discard')" @click="discardAndLeave" />
      </div>
    </UModal>
  </div>
</template>
