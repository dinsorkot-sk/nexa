<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'default' });

const { t } = useI18n();
const { entity } = useMetadata();
const toast = useToast();

const route = useRoute();
const moduleKey = route.params.module as string;
const entityName = route.params.entity as string;
const meta = computed(() => entity(moduleKey, entityName));

const step = ref(0);
const mapped = ref<Record<string, string | null>>({
  plate: 'plateNo',
  brand: 'brand',
  model: 'model',
  year: 'year',
  driver: 'assignedDriverId',
  unused: null,
});

const steps = [t('import.steps.upload'), t('import.steps.mapping'), t('import.steps.preview'), t('import.steps.result')];

const readyCount = computed(() => fixtureCsv.columns.filter((c) => c.status === 'ready').length);

function next() {
  if (step.value < 3) step.value += 1;
  else {
    toast.add({ title: t('import.doneToast'), color: 'success' });
    navigateTo(`/m/${moduleKey}/${entityName}`);
  }
}

function back() {
  if (step.value > 0) step.value -= 1;
}

const previewAll = ref(true);
const previewRows = computed(() => (previewAll.value ? fixtureCsv.preview.issues : fixtureCsv.preview.issues));
</script>

<template>
  <div class="flex flex-col gap-4">
    <NxPageHeader icon="i-lucide-upload" :title="t('import.title', { entity: meta?.label ?? entityName })" :description="t('import.description')">
      <template #actions>
        <UButton variant="ghost" :label="t('common.cancel')" :to="`/m/${moduleKey}/${entityName}`" />
      </template>
    </NxPageHeader>

    <UStepper v-model="step" :items="steps" :ui="{ step: { separator: 'flex-1' } }" class="px-1" />

    <UCard class="rounded-xl" :ui="{ body: { padding: 'p-6' } }">
      <!-- step 1: upload -->
      <div v-if="step === 0" class="flex flex-col gap-4">
        <UFileUpload accept=".csv" :max-size="10 * 1024 * 1024">
          <template #default>
            <div class="flex flex-col items-center gap-2 py-8 text-center">
              <UIcon name="i-lucide-file-up" class="size-8 text-muted" />
              <p class="text-nexa-body-strong text-highlighted">{{ t('import.upload.dropzone') }}</p>
              <p class="text-nexa-small text-muted">{{ t('import.upload.hint') }}</p>
            </div>
          </template>
        </UFileUpload>
        <div class="flex items-center gap-2 rounded-lg border border-default bg-[--ui-bg-muted] px-3 py-2">
          <UIcon name="i-lucide-file-text" class="size-4 text-muted" />
          <p class="text-nexa-body text-default">{{ fixtureCsv.fileName }}</p>
          <span class="ms-auto text-nexa-small text-muted">{{ t('import.upload.summary', { rows: fixtureCsv.rows, kb: fixtureCsv.sizeKb }) }}</span>
        </div>
      </div>

      <!-- step 2: mapping -->
      <div v-else-if="step === 1" class="flex flex-col gap-4">
        <div class="overflow-x-auto rounded-xl border border-default">
          <table class="min-w-full">
            <thead>
              <tr class="border-b border-default bg-[--ui-bg-muted]">
                <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('import.mapping.csvColumn') }}</th>
                <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('import.mapping.sample') }}</th>
                <th class="px-3 py-2 text-start text-nexa-caption font-medium text-muted">{{ t('import.mapping.field') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="col in fixtureCsv.columns" :key="col.csv" class="border-b border-default last:border-b-0">
                <td class="px-3 py-2 font-mono text-nexa-mono-small">{{ col.csv }}</td>
                <td class="px-3 py-2 text-nexa-body text-muted">{{ col.sample }}</td>
                <td class="px-3 py-2">
                  <USelect
                    v-if="col.field !== null || col.status !== 'skipped'"
                    v-model="mapped[col.csv]"
                    :items="[
                      ...(meta?.fields ?? []).map((f) => ({ label: f.label, value: f.name })),
                      { label: t('import.mapping.dontImport'), value: '' },
                    ]"
                    class="w-56"
                  />
                  <span v-else class="text-nexa-body text-dimmed">{{ t('import.mapping.dontImport') }}</span>
                  <p v-if="col.note" class="text-nexa-caption text-dimmed">{{ col.note }}</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UBadge color="success" variant="soft" size="sm">{{ t('import.mapping.ready', { n: readyCount }) }}</UBadge>
          <UBadge color="warning" variant="soft" size="sm">{{ t('import.mapping.buddhistWarning') }}</UBadge>
        </div>
      </div>

      <!-- step 3: preview -->
      <div v-else-if="step === 2" class="flex flex-col gap-4">
        <div class="flex items-center gap-2">
          <UTabs v-model="previewAll" variant="pill" size="sm" :items="[{ label: t('common.all'), value: true }, { label: t('import.preview.issues'), value: false }]" />
          <span class="ms-auto text-nexa-small text-muted">{{ t('import.preview.readyCount', { n: fixtureCsv.preview.ready }) }}</span>
        </div>
        <div class="flex flex-col rounded-xl border border-default">
          <div v-for="issue in previewRows" :key="issue.row" class="flex items-center gap-3 border-b border-default px-3 py-2 last:border-b-0">
            <UBadge :color="issue.code === 409 ? 'error' : 'warning'" variant="soft" size="sm">{{ issue.code }}</UBadge>
            <div class="min-w-0 flex-1">
              <p class="text-nexa-body-medium text-highlighted">{{ issue.issue }}</p>
              <p class="truncate text-nexa-small text-muted">{{ issue.detail }}</p>
            </div>
            <span class="text-nexa-caption text-dimmed">#{{ issue.row }}</span>
          </div>
        </div>
        <UAlert color="info" variant="soft" :description="t('import.preview.yearInterpreted')" />
      </div>

      <!-- step 4: result -->
      <div v-else class="flex flex-col items-center gap-4 py-8 text-center">
        <span class="inline-flex size-12 items-center justify-center rounded-full bg-[--ui-success-soft] text-[--ui-success-text]">
          <UIcon name="i-lucide-check" class="size-6" />
        </span>
        <p class="text-nexa-title text-highlighted">
          {{ t('import.result.success', { n: fixtureCsv.result.success }) }} ·
          <span class="text-muted">{{ t('import.result.skipped', { n: fixtureCsv.result.skipped }) }}</span> ·
          <span class="text-error">{{ t('import.result.failed', { n: fixtureCsv.result.failed }) }}</span>
        </p>
        <p class="text-nexa-small text-muted">{{ t('import.result.duration', { ms: fixtureCsv.result.durationMs }) }}</p>
        <UButton variant="outline" icon="i-lucide-download" :label="t('import.result.downloadReport')" />
      </div>
    </UCard>

    <div class="flex items-center justify-between">
      <UButton variant="ghost" :disabled="step === 0" :label="t('common.back')" @click="back" />
      <UButton color="primary" :label="step === 3 ? t('common.finish') : t('common.next')" :icon="step === 3 ? 'i-lucide-check' : 'i-lucide-arrow-right'" trailing @click="next" />
    </div>
  </div>
</template>
