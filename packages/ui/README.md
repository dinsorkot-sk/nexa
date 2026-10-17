# @nexa/ui

Vue 3 components for Nexa. Import the stylesheet once in the app; components consume the shared tokens and support the `.dark` class.

```ts
import '@nexa/ui/styles.css';
```

Set the locale from the root component's setup so it is provided to descendant controls:

```vue
<script setup lang="ts">
import { provideNxLocale } from '@nexa/ui';

provideNxLocale('en'); // or 'th'
</script>
```

The package accepts data and callbacks as props/events. It does not call the SDK or persist application data.

## Records and fields

`NxTable` receives column definitions and rows. Sorting is controlled by the caller; `update:sort` contains the key and direction. Use `cell-{columnKey}` slots to render typed values.

```vue
<NxTable
  :columns="[{ key: 'name', label: 'Name', sortable: true }]"
  :rows="records"
  :sort="sort"
  @update:sort="loadRecords"
>
  <template #cell-name="{ value }">
    <NxLink :href="`/records/${value}`">{{ value }}</NxLink>
  </template>
</NxTable>
<NxPagination v-model="page" :total="total" :page-size="20" />
```

`NxFieldInput` and `NxFieldValue` cover every `FieldTypeSchema` field type. For reference fields, provide `loadOptions` and selected labels; the renderer does not fetch data itself.

`NxKanbanCard`, `NxCalendarView`, `NxCalendarDay`, and `NxCalendarEvent` provide data-driven record views. `NxFileUpload` emits selected `File` objects only; it does not upload them. Chart components (`NxBarChart`, `NxLineChart`, `NxDonutChart`) render the supplied data locally as SVG/HTML and have no chart-library dependency.

## Navigation and overlays

`NxSidebar`, `NxNavbar`, `NxPageHeader`, `NxOrgSwitcher`, `NxBreadcrumb`, `NxMenu`, `NxTabs`, and `NxSegment` accept caller-owned navigation state.

`NxModal`, `NxSlideover`, `NxPopover`, `NxAccordion`, and `NxCommandPalette` expose controlled state through `open` / `modelValue` props and update events. Command selection emits the selected command object; the caller performs the action.

## Builder and status components

The package also exports `NxStatCard`, `NxProgress`, `NxStepper`, `NxActivityItem`, `NxTimeline`, `NxBanner`, `NxAvatarGroup`, `NxEmptyState`, `NxIndicator`, `NxCodeBlock`, `NxFieldRow`, `NxFormulaEditor`, `NxWorkflowNode`, `NxWorkflowEdge`, `NxPermissionsTable`, `NxPermissionCell`, `NxDiffRow`, and `NxPackageDiff`.

See [`src/index.ts`](./src/index.ts) for the complete public export list and TypeScript prop types.
