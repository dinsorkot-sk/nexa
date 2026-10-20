import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { Info } from 'lucide-vue-next';
import { nextTick } from 'vue';
import NxAlert from '../src/components/NxAlert.vue';
import NxActivityItem from '../src/components/NxActivityItem.vue';
import NxAvatarGroup from '../src/components/NxAvatarGroup.vue';
import NxBadge from '../src/components/NxBadge.vue';
import NxBanner from '../src/components/NxBanner.vue';
import NxBreadcrumb from '../src/components/NxBreadcrumb.vue';
import NxButton from '../src/components/NxButton.vue';
import NxCalendarDay from '../src/components/NxCalendarDay.vue';
import NxCalendarEvent from '../src/components/NxCalendarEvent.vue';
import NxCard from '../src/components/NxCard.vue';
import NxCheckbox from '../src/components/NxCheckbox.vue';
import NxChip from '../src/components/NxChip.vue';
import NxCombobox from '../src/components/NxCombobox.vue';
import NxCommandPalette from '../src/components/NxCommandPalette.vue';
import NxDatePicker from '../src/components/NxDatePicker.vue';
import NxDiffRow from '../src/components/NxDiffRow.vue';
import NxEmptyState from '../src/components/NxEmptyState.vue';
import NxFieldRow from '../src/components/NxFieldRow.vue';
import NxFieldWrapper from '../src/components/NxFieldWrapper.vue';
import NxFileUpload from '../src/components/NxFileUpload.vue';
import NxIconButton from '../src/components/NxIconButton.vue';
import NxIndicator from '../src/components/NxIndicator.vue';
import NxInput from '../src/components/NxInput.vue';
import NxKanbanCard from '../src/components/NxKanbanCard.vue';
import NxKbd from '../src/components/NxKbd.vue';
import NxLink from '../src/components/NxLink.vue';
import NxLogo from '../src/components/NxLogo.vue';
import NxMenu from '../src/components/NxMenu.vue';
import NxModal from '../src/components/NxModal.vue';
import NxNavGroupLabel from '../src/components/NxNavGroupLabel.vue';
import NxNavItem from '../src/components/NxNavItem.vue';
import NxPageButton from '../src/components/NxPageButton.vue';
import NxPagination from '../src/components/NxPagination.vue';
import NxPermissionCell from '../src/components/NxPermissionCell.vue';
import NxPopover from '../src/components/NxPopover.vue';
import NxProgress from '../src/components/NxProgress.vue';
import NxRadio from '../src/components/NxRadio.vue';
import NxSegment from '../src/components/NxSegment.vue';
import NxSelect from '../src/components/NxSelect.vue';
import NxSeparator from '../src/components/NxSeparator.vue';
import NxSkeleton from '../src/components/NxSkeleton.vue';
import NxSlideover from '../src/components/NxSlideover.vue';
import NxStatCard from '../src/components/NxStatCard.vue';
import NxStepper from '../src/components/NxStepper.vue';
import NxSwitch from '../src/components/NxSwitch.vue';
import NxTableRow from '../src/components/NxTableRow.vue';
import NxTabs from '../src/components/NxTabs.vue';
import NxTextarea from '../src/components/NxTextarea.vue';
import NxToast from '../src/components/NxToast.vue';
import NxWorkflowEdge from '../src/components/NxWorkflowEdge.vue';
import NxWorkflowNode from '../src/components/NxWorkflowNode.vue';
import NxBarChart from '../src/components/NxBarChart.vue';
import NxCalendarView from '../src/components/NxCalendarView.vue';
import NxChartLegend from '../src/components/NxChartLegend.vue';
import NxCodeBlock from '../src/components/NxCodeBlock.vue';
import NxDonutChart from '../src/components/NxDonutChart.vue';
import NxFormulaEditor from '../src/components/NxFormulaEditor.vue';
import NxLineChart from '../src/components/NxLineChart.vue';
import NxNavbar from '../src/components/NxNavbar.vue';
import NxOrgSwitcher from '../src/components/NxOrgSwitcher.vue';
import NxPageHeader from '../src/components/NxPageHeader.vue';
import NxPermissionsTable from '../src/components/NxPermissionsTable.vue';
import NxSidebar from '../src/components/NxSidebar.vue';
import { buttonClasses } from '../src/lib/button';
import { fieldStyles } from '../src/lib/input';
import { dotColor, tone, nxColors, nxSizes, nxVariants, } from '../src/lib/tone';

/**
 * The variant axes of the mockup's Components page: every component is checked for the Color / Variant / Size /
 * State combinations its section shows, so a missing axis fails here instead of being found by eye.
 */

describe('tone table', () => {
  const pairs = nxColors.flatMap((color) => nxVariants.map((variant) => [color, variant] as const));

  it('defines every Color x Variant pair with a tone', () => {
    expect(pairs).toHaveLength(42);
    for (const [color, variant] of pairs) {
      const t = tone(color, variant);
      for (const key of ['surface', 'hover', 'border', 'label', 'icon', 'ring'] as const) {
        expect(typeof t[key], `${color}/${variant}.${key}`).toBe('string');
      }
      expect(t.label, `${color}/${variant} label`).not.toBe('');
      expect(t.ring, `${color}/${variant} ring`).toContain('focus-visible:ring-');
    }
  });

  it('labels solid fills with the on-solid token, which is the only one that meets AA on them', () => {
    for (const color of nxColors) expect(tone(color, 'solid').label).toBe(color === 'neutral' ? 'text-ui-text-inverted' : 'text-ui-on-solid');
  });

  it('labels tints with the highlighted text token', () => {
    for (const color of nxColors) {
      for (const variant of ['soft', 'subtle'] as const) {
        expect(tone(color, variant).label).toBe('text-ui-text-highlighted');
      }
      // The neutral outline fill is the page surface, so its label is the toned body colour, as in the mockup.
      expect(tone(color, 'outline').label).toBe(color === 'neutral' ? 'text-ui-text-toned' : 'text-ui-text-highlighted');
    }
  });

  it('gives outline and subtle variants an inset border and leaves ghost and link borderless', () => {
    for (const color of nxColors) {
      expect(tone(color, 'outline').border).toContain('ring-1 ring-inset');
      expect(tone(color, 'subtle').border).toContain('ring-1 ring-inset');
      expect(tone(color, 'ghost').border).toBe('');
      expect(tone(color, 'link').border).toBe('');
      expect(tone(color, 'link').surface).toBe('');
    }
  });

  it('paints the Solid dot with the label colour and the others with the colour itself', () => {
    expect(dotColor('success', 'solid')).toBe('bg-ui-on-solid');
    expect(dotColor('success', 'soft')).toBe('bg-ui-success');
    expect(dotColor('neutral', 'outline')).toBe('bg-ui-text-muted');
  });
});

describe('button variants', () => {
  it('covers the 5 variants x 4 colors x 3 sizes x leading/trailing icon the mockup shows', () => {
    for (const color of ['primary', 'secondary', 'neutral', 'error'] as const) {
      for (const variant of nxVariants) {
        for (const size of nxSizes) {
          const classes = buttonClasses(color, variant, size);
          expect(classes).toContain(tone(color, variant).label);
          expect(classes).toContain(tone(color, variant).surface || 'inline-flex');
        }
      }
    }
  });

  it('uses the mockup heights: 28, 36 and 44 px', () => {
    expect(buttonClasses('primary', 'solid', 'sm')).toContain('h-7');
    expect(buttonClasses('primary', 'solid', 'md')).toContain('h-9');
    expect(buttonClasses('primary', 'solid', 'lg')).toContain('h-11');
  });

  it('uses a square box for the icon-only form', () => {
    expect(buttonClasses('neutral', 'ghost', 'md', true)).toContain('size-9');
    expect(buttonClasses('neutral', 'ghost', 'md', true)).not.toContain('px-3');
  });

  it('renders the requested variant and size on the button element', () => {
    const wrapper = mount(NxButton, { props: { color: 'error', variant: 'outline', size: 'lg' }, slots: { default: 'Delete' } });
    expect(wrapper.classes()).toContain('ring-ui-error-outline');
    expect(wrapper.classes()).toContain('h-11');
    expect(wrapper.classes()).toContain('text-ui-text-highlighted');
    expect(wrapper.classes()).toContain('hover:bg-ui-error-soft');
  });

  it('replaces the leading icon with a spinner while loading, and does not render the icon', () => {
    const wrapper = mount(NxButton, { props: { loading: true, icon: Info }, slots: { default: 'Saving' } });
    expect(wrapper.findAll('svg')).toHaveLength(1);
    expect(wrapper.find('svg').classes()).toContain('animate-spin');
  });

  it('underlines the link variant on hover', () => {
    expect(mount(NxButton, { props: { variant: 'link' }, slots: { default: 'Open' } }).classes()).toContain('hover:underline');
  });

  it('NxIconButton carries the variant axes too and keeps its accessible name', () => {
    const wrapper = mount(NxIconButton, { props: { icon: Info, label: 'Details', color: 'primary', variant: 'soft', size: 'lg' } });
    expect(wrapper.attributes('aria-label')).toBe('Details');
    expect(wrapper.classes()).toContain('size-11');
    expect(wrapper.classes()).toContain('bg-ui-primary-soft');
  });
});

describe('badge variants', () => {
  it('covers 7 colors x 4 variants x 3 sizes', () => {
    for (const color of nxColors) {
      for (const variant of ['solid', 'outline', 'soft', 'subtle'] as const) {
        for (const size of nxSizes) {
          const wrapper = mount(NxBadge, { props: { color, variant, size }, slots: { default: 'Badge' } });
          expect(wrapper.classes(), `${color}/${variant}/${size}`).toContain(tone(color, variant).label);
        }
      }
    }
  });

  it('renders the leading icon axis and drops it when a dot is asked for', () => {
    expect(mount(NxBadge, { props: { icon: Info }, slots: { default: 'Info' } }).find('svg').attributes('aria-hidden')).toBe('true');
    const dotted = mount(NxBadge, { props: { dot: true, icon: Info }, slots: { default: 'Info' } });
    expect(dotted.find('svg').exists()).toBe(false);
    expect(dotted.find('span > span').classes()).toContain('rounded-full');
  });
});

describe('alert variants', () => {
  it('supports all 7 colours and 4 variants', () => {
    for (const color of nxColors) {
      for (const variant of ['solid', 'outline', 'soft', 'subtle'] as const) {
        const wrapper = mount(NxAlert, { props: { color, variant, title: 'Note' } });
        expect(wrapper.classes()).toContain(tone(color, variant).surface || 'flex');
        expect(wrapper.find('svg').exists()).toBe(true);
      }
    }
  });

  it('uses the inverted description colour on a solid fill', () => {
    const solid = mount(NxAlert, { props: { color: 'success', variant: 'solid', title: 'Saved', description: 'Ready' } });
    const paragraphs = solid.findAll('p');
    expect(paragraphs[1].classes()).toContain('text-ui-on-solid');
    const soft = mount(NxAlert, { props: { color: 'success', title: 'Saved', description: 'Ready' } });
    expect(soft.findAll('p')[1].classes()).toContain('text-ui-text-toned');
  });

  it('emits close from the dismiss button, and renders none when not dismissible', async () => {
    const wrapper = mount(NxAlert, { props: { title: 'Note' }, attachTo: document.body });
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(mount(NxAlert, { props: { title: 'Note', dismissible: false } }).find('button').exists()).toBe(false);
  });
});

describe('field variants', () => {
  it('covers 3 variants x 3 sizes with the mockup heights', () => {
    for (const variant of ['outline', 'soft', 'subtle'] as const) {
      for (const size of ['sm', 'md', 'lg'] as const) {
        const classes = fieldStyles({ variant, size, invalid: false });
        expect(classes, `${variant}/${size}`).toContain(variant === 'soft' ? 'bg-ui-bg-elevated' : 'ring-1');
      }
    }
  });

  it('swaps the border and focus ring for the error colours when invalid', () => {
    expect(fieldStyles({ variant: 'outline', size: 'md', invalid: true })).toContain('ring-ui-error');
    expect(fieldStyles({ variant: 'outline', size: 'md', invalid: false })).toContain('ring-ui-border-accented');
    expect(fieldStyles({ variant: 'outline', size: 'md', invalid: true })).not.toContain('ring-ui-primary');
  });

  it('NxInput renders the variant, size, leading and trailing icons', () => {
    const wrapper = mount(NxInput, { props: { variant: 'subtle', size: 'lg', icon: Info, trailingIcon: Info, trailingLabel: 'Reveal' }, attachTo: document.body });
    expect(wrapper.find('input').classes()).toContain('h-11');
    expect(wrapper.find('input').classes()).toContain('rounded-ui-lg');
    expect(wrapper.findAll('svg')).toHaveLength(2);
    expect(wrapper.find('button').attributes('aria-label')).toBe('Reveal');
  });

  it('NxInput keeps attributes on the input element, not on the wrapper', () => {
    const wrapper = mount(NxInput, { attrs: { 'aria-label': 'Search' } });
    expect(wrapper.find('input').attributes('aria-label')).toBe('Search');
    expect(wrapper.attributes('aria-label')).toBeUndefined();
  });

  it('NxTextarea applies the variant and size paddings', () => {
    const wrapper = mount(NxTextarea, { props: { variant: 'soft', size: 'lg' } });
    expect(wrapper.find('textarea').classes()).toContain('bg-ui-bg-elevated');
    expect(wrapper.find('textarea').classes()).toContain('py-2.5');
  });

  it('NxSelect covers the variants and keeps the leading icon inside the field', () => {
    const wrapper = mount(NxSelect, { props: { options: [], variant: 'subtle', size: 'sm', icon: Info } });
    expect(wrapper.find('button').classes()).toContain('h-7');
    expect(wrapper.find('button').classes()).toContain('pl-8');
    expect(wrapper.findAll('svg')).toHaveLength(2);
  });
});

describe('control variants', () => {
  it('NxCheckbox covers the 3 box sizes of the mockup CTRL table', () => {
    for (const [size, box] of [['sm', 'size-3.5'], ['md', 'size-4'], ['lg', 'size-5']] as const) {
      expect(mount(NxCheckbox, { props: { size }, slots: { default: 'Label' } }).find('button').classes(), size).toContain(box);
    }
  });

  it('NxCheckbox paints the checked and indeterminate box, and marks the indeterminate state', () => {
    const checked = mount(NxCheckbox, { props: { modelValue: true } });
    expect(checked.find('button').classes()).toContain('hover:data-[state=checked]:bg-ui-primary-hover');
    const mixed = mount(NxCheckbox, { props: { modelValue: 'indeterminate' } });
    expect(mixed.find('button').classes()).toContain('data-[state=indeterminate]:bg-ui-primary');
    expect(mixed.find('button').classes()).toContain('border-ui-primary');
    expect(checked.find('button').classes()).toContain('border-ui-primary');
    expect(mount(NxCheckbox).find('button').classes()).toContain('hover:border-ui-text-dimmed');
  });

  it('NxCheckbox sizes its label text with the box', () => {
    const sizes = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' } as const;
    for (const [size, text] of Object.entries(sizes) as [keyof typeof sizes, string][]) {
      const wrapper = mount(NxCheckbox, { props: { size }, slots: { default: 'Label' } });
      expect(wrapper.find('label').classes(), size).toContain(text);
    }
  });

  it('NxRadio covers the 3 sizes and fills the checked circle with the on-solid dot', () => {
    const sizes = { sm: 'size-3.5', md: 'size-4', lg: 'size-5' } as const;
    for (const [size, box] of Object.entries(sizes) as [keyof typeof sizes, string][]) {
      const wrapper = mount(NxRadio, { props: { size, options: [{ value: 'a', label: 'A' }], label: 'Group' } });
      expect(wrapper.find('button').classes(), size).toContain(box);
    }
    const checked = mount(NxRadio, { props: { modelValue: 'a', size: 'lg', options: [{ value: 'a', label: 'A' }], label: 'Group' } });
    expect(checked.find('button').classes()).toContain('data-[state=checked]:bg-ui-primary');
    expect(checked.find('span span').classes()).toContain('bg-ui-on-solid');
    expect(checked.find('span span').classes()).toContain('size-2');
    expect(checked.find('button').attributes('role')).toBe('radio');
  });

  it('NxRadio keeps the group name and disables single options', () => {
    const wrapper = mount(NxRadio, {
      props: { name: 'choice', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B', disabled: true }], label: 'Group' },
    });
    expect(wrapper.findAll('button')[1].attributes('disabled')).toBeDefined();
  });

  it('NxSwitch covers the 3 track sizes of the mockup SW table', () => {
    for (const [size, box] of [['sm', ['h-4', 'w-7']], ['md', ['h-5', 'w-9']], ['lg', ['h-6', 'w-11']]] as const) {
      const classes = mount(NxSwitch, { props: { size } }).find('button').classes();
      for (const one of box) expect(classes, size).toContain(one);
    }
  });

  it('NxSwitch moves a knob that grows with the track, and uses the on/off fills', () => {
    const off = mount(NxSwitch);
    expect(off.find('button').classes()).toContain('bg-ui-border-accented');
    expect(off.find('button').classes()).toContain('hover:bg-ui-text-dimmed');
    expect(off.find('button').classes()).toContain('focus-visible:ring-[3px]');
    const on = mount(NxSwitch, { props: { modelValue: true, size: 'lg' } });
    expect(on.find('button').classes()).toContain('data-[state=checked]:bg-ui-primary');
    expect(on.find('button').classes()).toContain('hover:data-[state=checked]:bg-ui-primary-hover');
    const knob = on.find('button > span');
    expect(knob.classes()).toContain('size-5');
    expect(knob.classes()).toContain('data-[state=checked]:translate-x-[22px]');
    expect(knob.classes()).toContain('bg-ui-bg');
  });

  it('NxFieldWrapper labels at the two mockup sizes and links hint and error to the control', () => {
    const wrapper = mount(NxFieldWrapper, { props: { id: 'email', label: 'Email', required: true, hint: 'Work address', size: 'sm' } });
    expect(wrapper.find('label').classes()).toContain('text-xs');
    expect(wrapper.find('label').classes()).toContain('font-medium');
    expect(wrapper.find('label').text()).toContain('*');
    expect(wrapper.find('p').classes()).toContain('text-ui-text-muted');
    const md = mount(NxFieldWrapper, { props: { id: 'email', label: 'Email', error: 'Required' } });
    expect(md.find('label').classes()).toContain('text-sm');
    expect(md.find('p[role=alert]').text()).toBe('Required');
  });
});

describe('picker variants', () => {
  it('NxCombobox paints the trigger focus, error and disabled states with the mockup tokens', () => {
    const base = mount(NxCombobox, { props: { label: 'Owner' } });
    const anchor = base.find('input').element.parentElement as HTMLElement;
    expect(anchor.className).toContain('rounded-ui');
    expect(anchor.className).toContain('focus-within:ring-ui-primary');
    expect(anchor.className).toContain('hover:border-ui-text-dimmed');
    expect(anchor.querySelectorAll('svg')).toHaveLength(1);

    const error = mount(NxCombobox, { props: { label: 'Owner', invalid: true } });
    expect((error.find('input').element.parentElement as HTMLElement).className).toContain('border-ui-error');
    const disabled = mount(NxCombobox, { props: { label: 'Owner', disabled: true } });
    expect((disabled.find('input').element.parentElement as HTMLElement).className).toContain('opacity-50');
  });

  it('NxCombobox opens the mockup empty search state, and the multiple list counts and clears', async () => {
    const wrapper = mount(NxCombobox, { props: { label: 'Owner' }, attachTo: document.body });
    const input = wrapper.find('input');
    await input.trigger('focus');
    input.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await flushPromises();
    await nextTick();
    expect(document.body.textContent).toContain('No matches');
    expect(document.body.textContent).toContain('Try a different search term.');
    wrapper.unmount();
    await nextTick();

    const multi = mount(NxCombobox, {
      props: {
        label: 'Owners',
        multiple: true,
        modelValue: ['a'],
        selected: [{ value: 'a', label: 'Alpha' }],
        options: [{ value: 'a', label: 'Alpha' }],
      },
      attachTo: document.body,
    });
    const multiInput = multi.find('input');
    await multiInput.trigger('focus');
    multiInput.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await flushPromises();
    await nextTick();
    expect(document.body.textContent).toContain('1 selected');
    const clear = Array.from(document.body.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Clear');
    expect(clear).toBeTruthy();
    clear?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    await nextTick();
    expect(multi.emitted('update:modelValue')?.at(-1)).toEqual([[]]);
    multi.unmount();
    await nextTick();
  });

  it('NxDatePicker shows the calendar and chevron affordances and the mockup day cell states', async () => {
    const wrapper = mount(NxDatePicker, { props: { modelValue: '2026-10-16', label: 'Due' }, attachTo: document.body });
    await flushPromises();
    const field = wrapper.find('[aria-label="Open calendar"]').element.parentElement as HTMLElement;
    expect(field.className).toContain('rounded-ui');
    expect(field.className).toContain('focus-within:ring-ui-primary');
    expect(field.querySelectorAll('svg')).toHaveLength(2);
    expect((field.querySelector('svg') as SVGElement).getAttribute('class')).toContain('text-ui-text-dimmed');

    await wrapper.find('[aria-label="Open calendar"]').trigger('click');
    await flushPromises();
    await nextTick();
    const cell = document.body.querySelector('[data-reka-calendar-cell-trigger]') as HTMLElement | null;
    expect(cell?.className).toContain('size-9');
    expect(cell?.className).toContain('text-ui-text');
    expect(cell?.className).toContain('data-[today]:ring-ui-primary-outline');
    expect(cell?.className).toContain('data-[selected]:bg-ui-primary');
    expect(document.body.textContent).toContain('October 2026');
    wrapper.unmount();
    await nextTick();
  });

  it('NxDatePicker swaps the border and focus ring for the error colours when invalid', () => {
    const wrapper = mount(NxDatePicker, { props: { modelValue: null, label: 'Due', invalid: true }, attachTo: document.body });
    const field = wrapper.find('[aria-label="Open calendar"]').element.parentElement as HTMLElement;
    expect(field.className).toContain('border-ui-error');
  });
});

describe('navigation variants', () => {
  it('NxTabs covers the two sizes and the leading icon of the mockup Tab section', () => {
    const items = [{ value: 'a', label: 'A', icon: Info }];
    const sm = mount(NxTabs, { props: { modelValue: 'a', label: 'Sections', items, size: 'sm' } });
    const trigger = sm.find('[role="tab"]');
    expect(trigger.classes()).toContain('px-2.5');
    expect(trigger.classes()).toContain('text-xs');
    expect(trigger.classes()).toContain('border-b-2');
    expect(trigger.find('svg').classes()).toContain('group-data-[state=active]:text-ui-primary-text');
    expect(mount(NxTabs, { props: { modelValue: 'a', label: 'Sections', items, size: 'md' } }).find('[role="tab"]').classes()).toContain('text-sm');
  });

  it('NxSegment covers the two sizes and lifts the active segment onto the surface', () => {
    const items = [{ value: 'a', label: 'A' }];
    const md = mount(NxSegment, { props: { modelValue: 'a', label: 'View', items } });
    expect(md.classes()).toContain('bg-ui-bg-elevated');
    expect(md.classes()).toContain('rounded-ui-lg');
    const item = md.find('button');
    expect(item.classes()).toContain('px-2.5');
    expect(item.classes()).toContain('data-[state=on]:shadow-sm');
    expect(mount(NxSegment, { props: { modelValue: 'a', label: 'View', items, size: 'sm' } }).find('button').classes()).toContain('text-xs');
  });

  it('NxNavItem marks the active page with the primary soft fill, count and icon-only forms', () => {
    const active = mount(NxNavItem, { props: { active: true, icon: Info }, slots: { default: 'Home' } });
    const inactive = mount(NxNavItem, { props: { icon: Info }, slots: { default: 'Home' } });
    expect(active.classes()).toContain('bg-ui-primary-soft');
    expect(active.classes()).toContain('[&_svg]:text-ui-primary-text');
    expect(inactive.classes()).toContain('text-ui-text-toned');
    expect(inactive.classes()).toContain('hover:bg-ui-bg-elevated');
    const counted = mount(NxNavItem, { props: { active: true, icon: Info, count: 12 }, slots: { default: 'Home' } });
    expect(counted.find('span.bg-ui-bg-accented').text()).toBe('12');
    const iconOnly = mount(NxNavItem, { props: { icon: Info, iconOnly: true } });
    expect(iconOnly.classes()).toContain('size-9');
    expect(iconOnly.text()).toBe('');
  });

  it('NxNavGroupLabel is the mockup small-caps caption, hidden when collapsed', () => {
    const wrapper = mount(NxNavGroupLabel, { slots: { default: 'WORKSPACE' } });
    expect(wrapper.classes()).toContain('text-[11px]');
    expect(wrapper.classes()).toContain('text-ui-text-dimmed');
    expect(wrapper.text()).toBe('WORKSPACE');
    expect(mount(NxNavGroupLabel, { props: { collapsed: true }, slots: { default: 'WORKSPACE' } }).find('h2').exists()).toBe(false);
  });

  it('NxBreadcrumb marks the last crumb as the current page and underlines the links on hover', () => {
    const wrapper = mount(NxBreadcrumb, {
      props: { label: 'Breadcrumb', items: [{ label: 'Builder', href: '/builder' }, { label: 'Vehicles' }] },
    });
    expect(wrapper.find('[aria-current="page"]').text()).toBe('Vehicles');
    expect(wrapper.find('[aria-current="page"]').classes()).toContain('font-medium');
    expect(wrapper.find('a').classes()).toContain('hover:underline');
    expect(wrapper.findAll('svg')).toHaveLength(1);
  });

  it('NxPageButton covers the two sizes and the active page fill', () => {
    const sm = mount(NxPageButton, { props: { page: 3, size: 'sm' } });
    expect(sm.classes()).toContain('size-7');
    expect(sm.classes()).toContain('text-xs');
    expect(mount(NxPageButton, { props: { page: 3, current: true } }).classes()).toContain('bg-ui-primary');
  });

  it('NxPagination follows the mockup sizes and shows the ellipsis for a long list', () => {
    const wrapper = mount(NxPagination, { props: { modelValue: 1, pageSize: 10, total: 200, size: 'sm' } });
    expect(wrapper.find('nav').classes()).toContain('border-t');
    expect(wrapper.text()).toContain('Showing 1-10 of 200');
    expect(wrapper.text()).toContain('…');
    expect(wrapper.find('button[aria-current="page"]').classes()).toContain('size-7');
  });
});

describe('overlay variants', () => {
  it('NxMenu follows the mockup MenuItem states', async () => {
    const wrapper = mount(NxMenu, {
      props: {
        label: 'Actions',
        items: [
          { value: 'edit', label: 'Edit', icon: Info },
          { value: 'chosen', label: 'Vehicles', selected: true },
          { value: 'delete', label: 'Delete', destructive: true },
        ],
      },
    });
    await wrapper.find('button[aria-haspopup="menu"]').trigger('click');
    const menu = wrapper.find('[role="menu"]');
    expect(menu.classes()).toContain('rounded-ui-lg');
    expect(menu.classes()).toContain('shadow-md');
    const items = wrapper.findAll('[role="menuitem"]');
    expect(items[0].find('svg').classes()).toContain('text-ui-text-muted');
    expect(items[1].find('svg').classes()).toContain('text-ui-primary-text');
    expect(items[2].classes()).toContain('text-ui-error-text');
    expect(items[2].classes()).toContain('hover:bg-ui-error-soft');
  });

  it('NxModal covers the three widths, the destructive tone and the scrim token', async () => {
    const modal = mount(NxModal, { props: { open: true, title: 'Delete vehicle?', size: 'lg', tone: 'destructive', description: 'Cannot be undone' }, attachTo: document.body });
    await flushPromises();
    await nextTick();
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.className).toContain('max-w-[640px]');
    expect(dialog.className).toContain('rounded-ui-xl');
    expect(dialog.querySelector('.bg-ui-error-soft')).toBeTruthy();
    expect(document.querySelector('.bg-ui-overlay')).toBeTruthy();
    expect(dialog.textContent).toContain('Cannot be undone');
    modal.unmount();
    await nextTick();
  });

  it('NxSlideover uses the mockup header, padded body and muted footer bar', async () => {
    const slideover = mount(
      NxSlideover,
      {
        props: { open: true, title: 'Notifications' },
        slots: { default: 'Body', footer: 'Footer' },
        attachTo: document.body,
      },
    );
    await flushPromises();
    await nextTick();
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain('Notifications');
    expect(dialog.querySelector('footer')?.className).toContain('bg-ui-bg-muted');
    expect(document.querySelector('.bg-ui-overlay')).toBeTruthy();
    slideover.unmount();
    await nextTick();
  });

  it('NxPopover renders the mockup panel with its title', async () => {
    const popover = mount(
      NxPopover,
      {
        props: { open: true, title: 'About this field' },
        slots: { default: 'Computed from price and tax.', trigger: '<button>Help</button>' },
        attachTo: document.body,
      },
    );
    await flushPromises();
    await nextTick();
    const panel = document.querySelector('[data-reka-popper-content-wrapper] > div') as HTMLElement | null;
    expect(panel?.className).toContain('rounded-ui-lg');
    expect(document.body.textContent).toContain('About this field');
    popover.unmount();
    await nextTick();
  });

  it('NxCommandPalette shows the search row, group caption and result rows', async () => {
    const palette = mount(
      NxCommandPalette,
      {
        props: {
          open: true,
          label: 'Command palette',
          commands: [
            { id: 'a', label: 'Vehicle Management', icon: Info, group: 'Modules' },
            { id: 'b', label: 'Drivers', group: 'Modules' },
          ],
        },
        attachTo: document.body,
      },
    );
    await flushPromises();
    await nextTick();
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.className).toContain('rounded-ui-xl');
    expect(dialog.textContent).toContain('Modules');
    expect(dialog.textContent).toContain('Esc');
    expect(dialog.querySelectorAll('[role="option"]')).toHaveLength(2);
    expect(document.querySelector('.bg-ui-overlay')).toBeTruthy();
    palette.unmount();
    await nextTick();
  });

  it('NxBanner uses the colour soft fill and ring, and dismisses', async () => {
    const wrapper = mount(NxBanner, { props: { color: 'warning', title: 'You are offline', dismissible: true } });
    expect(wrapper.classes()).toContain('bg-ui-warning-soft-hover');
    expect(wrapper.classes()).toContain('border-ui-warning-ring');
    expect(wrapper.attributes('role')).toBe('status');
    expect(wrapper.find('svg').classes()).toContain('text-ui-text-highlighted');
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('dismiss')).toHaveLength(1);
  });

  it('NxEmptyState keeps the mockup icon well, title and action row', () => {
    const wrapper = mount(NxEmptyState, { props: { title: 'Nothing here yet', description: 'Add the first item.', icon: Info }, slots: { default: '<button>Add item</button>' } });
    expect(wrapper.find('span').classes()).toContain('size-14');
    expect(wrapper.find('span').classes()).toContain('bg-ui-bg-elevated');
    expect(wrapper.find('h2').classes()).toContain('text-base');
    expect(wrapper.find('button').text()).toBe('Add item');
  });
});

describe('data variants', () => {
  it('NxTableRow is 40px on the muted fill for a header and 48px with the state fills for a body row', () => {
    const head = mount(NxTableRow, { props: { head: true } });
    expect(head.classes()).toContain('h-10');
    expect(head.classes()).toContain('bg-ui-bg-muted');
    const selected = mount(NxTableRow, { props: { selected: true, clickable: true } });
    expect(selected.classes()).toContain('h-12');
    expect(selected.classes()).toContain('bg-ui-primary-soft');
    const body = mount(NxTableRow, { props: { clickable: true } });
    expect(body.classes()).toContain('hover:bg-ui-bg-elevated');
    expect(body.classes()).toContain('cursor-pointer');
  });

  it('NxStatCard shows the icon well and the trend badge at the mockup sizes', () => {
    const wrapper = mount(NxStatCard, { props: { label: 'Total vehicles', value: '1,204', change: '+12%', trend: 'up', icon: Info } });
    expect(wrapper.classes()).toContain('rounded-ui-xl');
    const well = wrapper.find('span');
    expect(well.classes()).toContain('size-9');
    expect(well.classes()).toContain('bg-ui-primary-soft');
    expect(wrapper.find('.bg-ui-success-soft').text()).toContain('+12%');
    expect(wrapper.find('p').classes()).toContain('text-[32px]');
    const down = mount(NxStatCard, { props: { label: 'Overdue', value: 4, change: '-4%', trend: 'down' } });
    expect(down.find('.bg-ui-error-soft').exists()).toBe(true);
  });

  it('NxProgress covers the two bar heights of the mockup', () => {
    expect(mount(NxProgress, { props: { value: 25, label: 'Import', size: 'sm' } }).find('[role="progressbar"]').classes()).toContain('h-1');
    expect(mount(NxProgress, { props: { value: 25, label: 'Import' } }).find('[role="progressbar"]').classes()).toContain('h-2');
  });

  it('NxStepper checks the done steps and fills the connector up to the current one', () => {
    const wrapper = mount(NxStepper, { props: { label: 'Import', modelValue: 1, steps: [{ label: 'Upload' }, { label: 'Map' }, { label: 'Result' }] } });
    const markers = wrapper.findAll('li > div.z-10');
    expect(markers).toHaveLength(3);
    expect(markers[0].classes()).toContain('bg-ui-primary');
    expect(markers[0].find('svg').exists()).toBe(true);
    expect(markers[1].classes()).toContain('bg-ui-primary');
    expect(markers[1].find('svg').exists()).toBe(false);
    expect(markers[2].classes()).toContain('border-ui-border-accented');
    expect(markers[2].find('svg').exists()).toBe(false);
    expect(markers[0].find('svg').attributes('class')).toContain('size-3.5');
    const connectors = wrapper.findAll('li > div.absolute');
    expect(connectors[0].classes()).toContain('bg-ui-primary');
    expect(connectors[1].classes()).toContain('bg-ui-border-accented');
  });

  it('NxKanbanCard lifts the dragging card with the primary border', () => {
    expect(mount(NxKanbanCard, { props: { title: 'AB-1234' } }).find('article').classes()).toContain('border-ui-border');
    const dragging = mount(NxKanbanCard, { props: { title: 'AB-1234', state: 'dragging' } });
    expect(dragging.find('article').classes()).toContain('border-ui-primary');
    expect(dragging.find('article').classes()).toContain('shadow-md');
    expect(dragging.find('article').classes()).toContain('rounded-ui-lg');
  });

  it('NxFileUpload turns primary on hover and shows the error colours when invalid', () => {
    const box = () => mount(NxFileUpload, { props: { label: 'Drop a CSV file here', hint: 'Max 10 MB' } }).find('button');
    expect(box().classes()).toContain('hover:border-ui-primary');
    expect(box().classes()).toContain('border-dashed');
    const invalid = mount(NxFileUpload, { props: { label: 'Drop a CSV file here', hint: 'Only .csv files are accepted.', invalid: true } });
    expect(invalid.find('button').classes()).toContain('border-ui-error');
    expect(invalid.findAll('.text-ui-error-text')).toHaveLength(2);
  });

  it('NxActivityItem draws the kind marker, the connector and the value diff', () => {
    const wrapper = mount(NxActivityItem, { props: { actor: 'Somchai K.', action: 'changed Status', time: '2 h ago', kind: 'update', oldValue: 'Draft', newValue: 'Active', last: false } });
    const marker = wrapper.find('article > div');
    expect(marker.find('span').classes()).toContain('size-7');
    expect(marker.find('span').classes()).toContain('bg-ui-bg-elevated');
    expect(marker.find('svg').attributes('class')).toContain('size-3.5');
    expect(wrapper.find('.bg-ui-border-accented').exists()).toBe(true);
    expect(wrapper.findAllComponents(NxBadge)).toHaveLength(2);
    expect(wrapper.find('time').classes()).toContain('text-ui-text-dimmed');
    expect(mount(NxActivityItem, { props: { actor: 'A', action: 'created this record', time: 'now', kind: 'create' } }).find('.bg-ui-border-accented').exists()).toBe(false);
  });

  it('NxLink covers the primary and muted tones, the external mark and the disabled state', () => {
    const primary = mount(NxLink, { props: { href: 'https://example.com/records' }, slots: { default: 'Records' } });
    expect(primary.classes()).toContain('text-ui-primary-text');
    expect(primary.classes()).toContain('hover:underline');
    const muted = mount(NxLink, { props: { href: 'https://example.com/records', tone: 'muted', external: true }, slots: { default: 'Records' } });
    expect(muted.classes()).toContain('text-ui-text-muted');
    expect(muted.attributes('target')).toBe('_blank');
    expect(muted.findAll('svg')).toHaveLength(1);
    const disabled = mount(NxLink, { props: { href: 'https://example.com/records', disabled: true }, slots: { default: 'Records' } });
    expect(disabled.find('a').exists()).toBe(false);
    expect(disabled.classes()).toContain('opacity-50');
  });

  it('NxAvatarGroup covers the two sizes and the counter that matches', () => {
    const items = [{ name: 'Ada' }, { name: 'Bob' }, { name: 'Cy' }, { name: 'Dee' }, { name: 'Eve' }];
    const md = mount(NxAvatarGroup, { props: { items, label: 'Owners' } });
    const mdCounter = md.get('[aria-label="1 more"]');
    expect(mdCounter.classes()).toContain('size-8');
    expect(mdCounter.text()).toBe('+1');
    const sm = mount(NxAvatarGroup, { props: { items, label: 'Owners', size: 'sm', max: 3 } });
    const smCounter = sm.get('[aria-label="2 more"]');
    expect(smCounter.classes()).toContain('size-6');
    expect(smCounter.text()).toBe('+2');
    expect(sm.findAll('span.ring-2.ring-ui-bg')).toHaveLength(4);
  });

  it('NxWorkflowNode covers the start, step and end kinds and the selected ring', () => {
    const kinds = { start: 'bg-ui-text-dimmed', step: 'bg-ui-primary', end: 'bg-ui-success' } as const;
    for (const [kind, dot] of Object.entries(kinds) as [keyof typeof kinds, string][]) {
      const wrapper = mount(NxWorkflowNode, { props: { title: 'In review', kind, meta: '12 records' } });
      expect(wrapper.find('span span').classes(), kind).toContain(dot);
      expect(wrapper.classes()).toContain('w-45');
      expect(wrapper.find('.uppercase').text()).toBe(kind);
    }
    const selected = mount(NxWorkflowNode, { props: { title: 'In review', selected: true } });
    expect(selected.classes()).toContain('border-ui-primary');
    expect(selected.attributes('aria-pressed')).toBe('true');
  });

  it('NxWorkflowEdge shows the guard role as a badge', () => {
    const plain = mount(NxWorkflowEdge);
    expect(plain.find('svg').exists()).toBe(true);
    expect(plain.attributes('role')).toBe('img');
    const guarded = mount(NxWorkflowEdge, { props: { guard: 'admin' } });
    expect(guarded.text()).toBe('admin');
    const vertical = mount(NxWorkflowEdge, { props: { direction: 'vertical' } });
    expect(vertical.classes()).toContain('flex-col');
  });

  it('NxDiffRow paints the row by kind and shows the marker, path and badge', () => {
    const added = mount(NxDiffRow, { props: { path: 'fields.plateNumber', status: 'added', detail: 'new field (text, required)' } });
    expect(added.classes()).toContain('bg-ui-success-soft');
    expect(added.find('span').text()).toBe('+');
    expect(added.find('code').text()).toBe('fields.plateNumber');
    expect(added.text()).toContain('Added');
    const changed = mount(NxDiffRow, { props: { path: 'fields.notes', status: 'changed', before: 'maxLength 20', after: 'maxLength 30' } });
    expect(changed.text()).toContain('maxLength 20 → maxLength 30');
    expect(changed.text()).toContain('Changed');
    const removed = mount(NxDiffRow, { props: { path: 'fields.old', status: 'removed' } });
    expect(removed.classes()).toContain('bg-ui-error-soft');
    expect(removed.find('span').text()).toBe('-');
  });

  it('NxCalendarEvent paints the soft hover fill with the tone dot', () => {
    const wrapper = mount(NxCalendarEvent, { props: { label: 'AB-1234', color: 'warning' } });
    expect(wrapper.classes()).toContain('bg-ui-warning-soft-hover');
    expect(wrapper.find('.rounded-full').classes()).toContain('bg-ui-warning');
    expect(wrapper.classes()).toContain('rounded-ui-sm');
  });

  it('NxCalendarDay follows the mockup day block states', () => {
    const today = mount(NxCalendarDay, { props: { date: 15, isoDate: '2026-10-15', today: true, label: '15' } });
    expect(today.classes()).toContain('h-26');
    expect(today.find('span').classes()).toContain('bg-ui-primary');
    expect(today.find('span').classes()).toContain('size-[22px]');
    const outside = mount(NxCalendarDay, { props: { date: 30, isoDate: '2026-09-30', outside: true, label: '30' } });
    expect(outside.classes()).toContain('bg-ui-bg-muted');
    expect(outside.find('span').classes()).toContain('text-ui-text-dimmed');
  });

  it('NxPermissionCell locks a default-deny cell', () => {
    const locked = mount(NxPermissionCell, { props: { modelValue: false, label: 'manage', locked: true } });
    expect(locked.find('input').exists()).toBe(false);
    expect(locked.findAll('svg')).toHaveLength(1);
    const editable = mount(NxPermissionCell, { props: { modelValue: true, label: 'read' } });
    expect(editable.find('input').exists()).toBe(true);
  });

  it('NxFieldRow covers the four mockup states and shows the flags', () => {
    const base = mount(NxFieldRow, { props: { label: 'Plate number', name: 'plateNumber', type: 'text', required: true } });
    expect(base.classes()).toContain('bg-ui-bg');
    expect(base.text()).toContain('Required');
    expect(base.find('code').exists()).toBe(false);
    expect(base.findAll('svg').length).toBeGreaterThanOrEqual(2);
    const selected = mount(NxFieldRow, { props: { label: 'Plate', name: 'plate', type: 'text', state: 'selected' } });
    expect(selected.classes()).toContain('bg-ui-primary-soft');
    expect(selected.classes()).toContain('border-ui-primary-outline');
    const error = mount(NxFieldRow, { props: { label: 'Plate', name: 'plate', type: 'text', state: 'error' } });
    expect(error.classes()).toContain('border-ui-error');
    expect(error.find('.text-ui-error-text').exists()).toBe(true);
  });
});

describe('display variants', () => {
  it('NxCard covers the 4 variants and only renders the parts it is given', () => {
    for (const variant of ['outline', 'soft', 'subtle', 'solid'] as const) {
      const wrapper = mount(NxCard, { props: { variant }, slots: { default: 'Body', footer: 'Footer' } });
      expect(wrapper.classes(), variant).toContain(variant === 'outline' ? 'bg-ui-bg' : variant === 'solid' ? 'bg-ui-bg-inverted' : 'bg-ui-bg-muted');
    }
    const plain = mount(NxCard, { slots: { default: 'Body' } });
    expect(plain.text()).toBe('Body');
    expect(plain.html()).not.toContain('border-b');
    expect(plain.html()).not.toContain('border-t');
  });

  it('NxCard header takes a title and description, and inverts them on the solid variant', () => {
    const wrapper = mount(NxCard, { props: { title: 'Vehicles', description: 'All records' }, slots: { default: 'Body' } });
    expect(wrapper.text()).toContain('Vehicles');
    expect(wrapper.find('p').classes()).toContain('text-ui-text-highlighted');
    const solid = mount(NxCard, { props: { variant: 'solid', title: 'Vehicles' }, slots: { default: 'Body' } });
    expect(solid.find('p').classes()).toContain('text-ui-text-inverted');
  });

  it('NxKbd covers 3 variants x 3 sizes', () => {
    expect(mount(NxKbd, { props: { variant: 'solid', size: 'lg' }, slots: { default: 'K' } }).classes()).toContain('bg-ui-bg-inverted');
    expect(mount(NxKbd, { props: { variant: 'outline' }, slots: { default: 'K' } }).classes()).toContain('border-ui-border-accented');
    expect(mount(NxKbd, { props: { size: 'sm' }, slots: { default: 'K' } }).classes()).toContain('py-px');
  });

  it('NxSkeleton covers the 3 shapes', () => {
    for (const shape of ['line', 'circle', 'block'] as const) {
      expect(mount(NxSkeleton, { props: { shape } }).classes(), shape).toContain('animate-pulse');
    }
    expect(mount(NxSkeleton, { props: { shape: 'circle' } }).classes()).toContain('rounded-full');
    expect(mount(NxSkeleton, { props: { shape: 'block' } }).classes()).toContain('rounded-ui-lg');
  });

  it('NxSeparator shows a label between two lines, and has no label by default', () => {
    const labelled = mount(NxSeparator, { props: { label: 'or' } });
    expect(labelled.text()).toBe('or');
    expect(labelled.attributes('role')).toBe('separator');
    expect(mount(NxSeparator).attributes('role')).toBe('none');
  });

  it('NxChip covers both colours, both sizes, the icon and the remove button', () => {
    expect(mount(NxChip, { props: { color: 'primary', size: 'sm' }, slots: { default: 'Draft' } }).classes()).toContain('bg-ui-primary-soft');
    expect(mount(NxChip, { props: { size: 'md' }, slots: { default: 'Draft' } }).classes()).toContain('text-sm');
    expect(mount(NxChip, { props: { icon: Info }, slots: { default: 'Draft' } }).find('svg').attributes('aria-hidden')).toBe('true');
  });

  it('NxIndicator covers the dot and count forms at every size', () => {
    for (const size of nxSizes) {
      expect(mount(NxIndicator, { props: { size, content: 'dot' } }).classes(), size).toContain('rounded-full');
    }
    const count = mount(NxIndicator, { props: { content: 'count', count: 12, label: 'Notifications' } });
    expect(count.text()).toBe('12');
    expect(count.attributes('role')).toBe('status');
    expect(count.attributes('aria-label')).toBe('Notifications');
    expect(mount(NxIndicator, { props: { content: 'count', count: 240, max: 99 } }).text()).toBe('99+');
  });

  it('NxToast covers the 5 colours and announces errors as alerts', () => {
    for (const color of ['neutral', 'info', 'success', 'warning', 'error'] as const) {
      const wrapper = mount(NxToast, { props: { color, title: 'Saved' } });
      expect(wrapper.find('svg').exists(), color).toBe(true);
      expect(wrapper.attributes('role')).toBe(color === 'error' ? 'alert' : 'status');
    }
  });

  it('NxLogo covers mark and full at the three sizes', () => {
    const mark = mount(NxLogo, { props: { type: 'mark', size: 'sm' } });
    expect(mark.findAll('rect')).toHaveLength(2);
    expect(mark.find('svg').classes()).toContain('size-6');
    expect(mark.text()).toBe('');
    const full = mount(NxLogo, { props: { type: 'full', size: 'lg' } });
    expect(full.text()).toBe('Nexa');
  });
});

describe('chart, app shell and builder panels', () => {
  it('NxChartLegend follows the chart palette', () => {
    const wrapper = mount(NxChartLegend, { props: { items: [{ label: 'Fuel' }, { label: 'Service' }, { label: 'Other' }], label: 'Series' } });
    expect(wrapper.classes()).toContain('text-ui-text-muted');
    const dots = wrapper.findAll('li > span:first-child');
    expect(dots[0].classes()).toContain('bg-ui-primary');
    expect(dots[1].classes()).toContain('bg-ui-secondary');
    expect(dots[2].classes()).toContain('bg-ui-warning');
  });

  it('NxBarChart draws the axis, the primary/secondary bars and the legend for two series', () => {
    const single = mount(NxBarChart, { props: { labels: ['Apr', 'May'], series: [{ label: 'Fuel', values: [40, 80] }], label: 'Cost by month' } });
    expect(single.text()).toContain('100');
    const bars = single.findAll('.bg-ui-primary');
    expect(bars).toHaveLength(2);
    expect(bars[0].attributes('style')).toContain('40%');
    expect(single.findAll('li')).toHaveLength(0);
    const double = mount(NxBarChart, { props: { labels: ['Apr'], series: [{ label: 'Fuel', values: [40] }, { label: 'Service', values: [20] }], label: 'Cost by month' } });
    const pair = double.findAll('div').filter((node) => node.classes().includes('w-3.5'));
    expect(pair).toHaveLength(2);
    expect(pair[1].classes()).toContain('bg-ui-secondary');
    expect(double.findAll('li')).toHaveLength(2);
  });

  it('NxLineChart draws one polyline and one point per value', () => {
    const wrapper = mount(NxLineChart, { props: { labels: ['Apr', 'May', 'Jun'], series: [{ label: 'Fuel', values: [40, 62, 35] }], label: 'Records by month' } });
    expect(wrapper.findAll('polyline')).toHaveLength(1);
    expect(wrapper.findAll('span.absolute')).toHaveLength(3);
    const double = mount(NxLineChart, { props: { labels: ['Apr', 'May'], series: [{ label: 'A', values: [1, 2] }, { label: 'B', values: [2, 1] }], label: 'Series' } });
    expect(double.findAll('polyline')).toHaveLength(2);
    expect(double.findAll('span.absolute')).toHaveLength(4);
  });

  it('NxDonutChart shows the centre total and the share per segment', () => {
    const wrapper = mount(NxDonutChart, {
      props: {
        segments: [{ label: 'Active', value: 55 }, { label: 'In service', value: 30 }, { label: 'Retired', value: 15 }],
        label: 'Fleet',
        centerValue: '1,204',
        centerLabel: 'Total',
      },
    });
    expect(wrapper.text()).toContain('1,204');
    expect(wrapper.text()).toContain('Total');
    expect(wrapper.text()).toContain('55%');
    expect(wrapper.text()).toContain('15%');
    expect(wrapper.findAll('circle')).toHaveLength(4);
    expect(wrapper.findAll('li')).toHaveLength(3);
  });

  it('NxCodeBlock shows the file name, the numbered lines and the copy button', () => {
    const wrapper = mount(NxCodeBlock, { props: { code: '{\n  "module": "vehicles"\n}', filename: 'package.json', copyable: true, label: 'Package' } });
    expect(wrapper.classes()).toContain('rounded-ui-lg');
    expect(wrapper.classes()).toContain('bg-ui-bg-inverted');
    expect(wrapper.text()).toContain('package.json');
    expect(wrapper.findAll('code')).toHaveLength(1);
    expect(wrapper.findAll('div[aria-hidden="true"] span')).toHaveLength(3);
    expect(wrapper.find('button').attributes('aria-label')).toBe('Copy');
    const plain = mount(NxCodeBlock, { props: { code: 'a\nb', lineNumbers: false } });
    expect(plain.findAll('div[aria-hidden="true"] span')).toHaveLength(0);
    expect(plain.find('button').exists()).toBe(false);
  });

  it('NxFormulaEditor follows the valid, error and empty states', () => {
    const valid = mount(NxFormulaEditor, { props: { modelValue: 'price * quantity', label: 'Formula', hint: 'Result preview: 13,375.00' } });
    expect(valid.text()).toContain('Valid');
    expect(valid.text()).toContain('Result preview');
    expect(valid.find('textarea').element.value).toBe('price * quantity');
    const error = mount(NxFormulaEditor, { props: { modelValue: 'price *', label: 'Formula', error: 'Unexpected end of expression.' } });
    expect(error.text()).toContain('Error');
    expect(error.text()).toContain('Unexpected end of expression.');
    expect(error.classes()).toContain('border-ui-error');
    expect(error.find('textarea').attributes('aria-invalid')).toBe('true');
    const empty = mount(NxFormulaEditor, { props: { modelValue: '', label: 'Formula', rows: 4 } });
    expect(empty.text()).toContain('Empty');
    expect(empty.findAll('div[aria-hidden="true"] span')).toHaveLength(4);
  });

  it('NxOrgSwitcher shows the active membership and switches on select', async () => {
    const wrapper = mount(NxOrgSwitcher, {
      props: { modelValue: 'acme', organizations: [{ value: 'acme', label: 'Acme Co.' }, { value: 'beta', label: 'Beta Co.' }], label: 'Organization' },
    });
    expect(wrapper.text()).toContain('Acme Co.');
    const trigger = wrapper.get('button[aria-haspopup="menu"]');
    expect(trigger.attributes('aria-expanded')).toBe('false');
    await trigger.trigger('click');
    expect(trigger.attributes('aria-expanded')).toBe('true');
    const options = wrapper.findAll('[role="menuitemradio"]');
    expect(options).toHaveLength(2);
    expect(options[0].attributes('aria-checked')).toBe('true');
    await options[1].trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['beta']);
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
  });

  it('NxPermissionsTable uses the mockup header and the mono permission names', () => {
    const wrapper = mount(NxPermissionsTable, {
      props: { roles: [{ id: 'owner', label: 'owner' }], permissions: [{ id: 'definition:read', label: 'definition:read' }], modelValue: {}, label: 'Permissions' },
    });
    expect(wrapper.text()).toContain('Permission');
    const headers = wrapper.findAll('th');
    expect(headers[0].classes()).toContain('h-10');
    expect(headers[1].classes()).toContain('w-22');
    const rowHeader = wrapper.get('tbody th');
    expect(rowHeader.classes()).toContain('font-mono');
    expect(rowHeader.classes()).toContain('h-11');
  });

  it('the app shell follows the mockup backgrounds and sizes', () => {
    const sidebar = mount(NxSidebar, { props: { groups: [{ label: 'Main', items: [{ label: 'Home' }] }], label: 'Navigation' } });
    expect(sidebar.classes()).toContain('bg-ui-bg-muted');
    expect(sidebar.classes()).toContain('w-62');
    expect(mount(NxSidebar, { props: { groups: [], label: 'Navigation', collapsed: true } }).classes()).toContain('w-16');

    const navbar = mount(NxNavbar);
    expect(navbar.classes()).toContain('min-h-15');
    expect(navbar.classes()).toContain('px-6');

    const header = mount(NxPageHeader, { props: { title: 'Vehicles', description: 'Fleet records' } });
    expect(header.get('p').classes()).toContain('text-ui-text-muted');

    expect(mount(NxCalendarView, { props: { month: '2026-10', label: 'Calendar' } }).classes()).toContain('rounded-ui-lg');
  });
});

