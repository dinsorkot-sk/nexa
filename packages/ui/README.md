# @nexa/ui

Vue 3 components for Nexa. Import the stylesheet once in the app; components consume the shared tokens and support the `.dark` class.

```ts
import '@nexa/ui/styles.css';
```

The tokens come from the Figma mockup `mockup/Nexa.figcraft` and are exposed as CSS variables, so the same values drive
both this package's `Nx*` components and the `@nuxt/ui` v4 components that are available alongside them. `@nuxt/ui`
is wired as a Vite plugin (not a Nuxt module), so the package stays a plain Vue library and needs no Nuxt host app:

```ts
// vite.config.ts
import ui from '@nuxt/ui/vite';

export default defineConfig({
  plugins: [ui({ router: false, ui: { colors: { primary: 'green', neutral: 'slate' } } })],
});
```

Set the locale from the root component's setup so it is provided to descendant controls:

```vue
<script setup lang="ts">
import { provideNxLocale } from '@nexa/ui';

provideNxLocale('en'); // or 'th'
</script>
```

The package accepts data and callbacks as props/events. It does not call the SDK or persist application data.

## How the components are built

`NxButton`, `NxIconButton`, `NxBadge`, `NxCard`, `NxAvatar`, `NxAlert`, `NxProgress`, `NxInput`, `NxTextarea`, `NxSwitch`,
`NxSelect`, `NxPopover`, `NxTooltip`, `NxAccordion` and `NxTabs` are rendered by the matching Nuxt UI v4 component, with
the mockup's own classes handed over through Nuxt UI's `ui` prop. Nuxt UI therefore owns the markup, the disabled and
loading behaviour, the focus handling, the keyboard interaction and the accessibility wiring, while the rendered
element keeps the mockup's colours, heights and radius.

`NxCommandPalette` stays this package's own, because Nuxt UI's palette owns its search field, whose leading icon
resolves through Iconify; this package draws Lucide components directly. It does take Nuxt UI's fuzzy search, the same
`useFuse` composable Nuxt UI's own palette uses, so a partial or misspelled term still finds its command.

The remaining components are this package's own, because Nuxt UI has no equivalent for them, or because adopting it
would break a contract this package keeps:

| Component | Why it stays here |
| --- | --- |
| `NxCheckbox`, `NxRadio` | Nuxt UI draws the check and the radio dot through Iconify, which resolves at runtime through the Iconify API unless the consuming app sets `icon.clientBundle`. That setting is build time and does not travel with this package, so the marks would break offline. This package draws Lucide components directly. |
| `NxModal`, `NxSlideover` | Nuxt UI builds the dialog content through a reusable template, which detaches slot content from the dialog context. A Reka `DialogTitle` or `DialogClose` inside a slot then cannot resolve the dialog context, and this package's modal needs both, plus its own icon slot. |
| `NxDatePicker` | Nuxt UI v4 has no date picker. `UInputDate` is a date field without a calendar and `UCalendar` is a calendar without the field, so the two halves of this component are not available as one. |
| `NxCombobox` | This package's combobox searches on the server through `loadOptions`, with a request sequence and an abort controller. Nuxt UI's select menu filters a list it already holds. |
| `NxSkeleton` | Nuxt UI's skeleton is a live region (`role="alert"`), which is wrong for a decorative placeholder. |
| `NxSeparator` | This package already emits the correct `role` and `aria-orientation`. |
| `NxFieldWrapper` | This package's contract is that the caller owns the control's `id`; Nuxt UI's form field generates its own. |
| `NxToast`, `NxToaster` | Reka's toast root needs a provider ancestor, and this package's toast is documented as usable on its own. |


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
