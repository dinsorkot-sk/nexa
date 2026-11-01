<script setup lang="ts">
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();
const { t } = useI18n();
const router = useRouter();
const { modules, vehicle, driver, maintenance, fuel } = useMetadata();
const { colorMode } = useNexa();
const { slug } = useTenant();

interface PaletteItem { id: string; label: string; description?: string; icon: string; to?: string; kbds?: string[]; command?: 'theme' }

const recordItems = computed(() => {
  const items: PaletteItem[] = [];
  for (const e of [vehicle(), driver(), maintenance(), fuel()]) {
    for (const rec of e.records.slice(0, 5)) {
      const display = String(rec[e.displayField] ?? rec.code ?? rec.id);
      items.push({
        id: `rec-${rec.id}`,
        label: display,
        description: e.label,
        icon: 'i-lucide-file-text',
        to: `/m/vehicle/${e.name}/${rec.id}`,
      });
    }
  }
  return items;
});

const pageItems = computed<PaletteItem[]>(() => [
  { id: 'pg-home', label: t('nav.home'), icon: 'i-lucide-home', to: '/' },
  { id: 'pg-settings', label: t('nav.settings'), icon: 'i-lucide-settings', to: '/settings' },
  { id: 'pg-builder', label: t('nav.modules'), icon: 'i-lucide-box', to: '/builder/modules' },
  { id: 'pg-templates', label: t('nav.templates'), icon: 'i-lucide-layout-template', to: '/builder/templates' },
  ...modules.value.flatMap((m) => m.entities.map((e) => ({
    id: `pg-${m.key}-${e.name}`,
    label: `${m.name} · ${e.label}`,
    icon: m.icon,
    to: `/m/${m.key}/${e.name}`,
  }))),
]);

const commandItems = computed<PaletteItem[]>(() => [
  { id: 'cmd-new-vehicle', label: t('command.newVehicle'), description: 'vehicle', icon: 'i-lucide-plus', kbds: ['N', 'V'], to: '/m/vehicle/vehicle/new' },
  { id: 'cmd-import', label: t('command.importCsv'), description: 'vehicle', icon: 'i-lucide-upload', to: '/m/vehicle/vehicle/import' },
  { id: 'cmd-theme', label: t('command.toggleTheme'), icon: colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon', kbds: ['Ctrl', 'Shift', 'L'], command: 'theme' },
]);

const groups = computed(() => [
  {
    id: 'goto',
    label: t('command.goTo'),
    items: [
      ...pageItems.value.map((i) => ({ ...i, onSelect: () => closeAndGo(i.to!) })),
      ...recordItems.value.map((i) => ({ ...i, onSelect: () => closeAndGo(i.to!) })),
    ],
  },
  {
    id: 'commands',
    label: t('command.commands'),
    items: commandItems.value.map((i) => ({
      ...i,
      onSelect: () => {
        if (i.command === 'theme') {
          colorMode.preference = colorMode.preference === 'dark' ? 'light' : 'dark';
        } else if (i.to) {
          closeAndGo(i.to);
          return;
        }
        emit('update:open', false);
      },
    })),
  },
]);

function closeAndGo(to: string) {
  emit('update:open', false);
  router.push(to);
}
</script>

<template>
  <UModal v-model:open="props.open" :ui="{ content: 'max-w-lg' }">
    <UCommandPalette :groups="groups" :placeholder="t('command.placeholder')" autofocus />
  </UModal>
</template>
