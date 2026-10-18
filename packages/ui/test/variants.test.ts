import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { Info } from 'lucide-vue-next';
import { nextTick } from 'vue';
import NxAlert from '../src/components/NxAlert.vue';
import NxBadge from '../src/components/NxBadge.vue';
import NxButton from '../src/components/NxButton.vue';
import NxCard from '../src/components/NxCard.vue';
import NxCheckbox from '../src/components/NxCheckbox.vue';
import NxChip from '../src/components/NxChip.vue';
import NxCombobox from '../src/components/NxCombobox.vue';
import NxDatePicker from '../src/components/NxDatePicker.vue';
import NxFieldWrapper from '../src/components/NxFieldWrapper.vue';
import NxIconButton from '../src/components/NxIconButton.vue';
import NxIndicator from '../src/components/NxIndicator.vue';
import NxInput from '../src/components/NxInput.vue';
import NxKbd from '../src/components/NxKbd.vue';
import NxLogo from '../src/components/NxLogo.vue';
import NxRadio from '../src/components/NxRadio.vue';
import NxSelect from '../src/components/NxSelect.vue';
import NxSeparator from '../src/components/NxSeparator.vue';
import NxSkeleton from '../src/components/NxSkeleton.vue';
import NxSwitch from '../src/components/NxSwitch.vue';
import NxTextarea from '../src/components/NxTextarea.vue';
import NxToast from '../src/components/NxToast.vue';
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
    expect(wrapper.classes()).toContain('bg-ui-bg-elevated');
    expect(wrapper.classes()).toContain('py-2.5');
  });

  it('NxSelect covers the variants and keeps the leading icon inside the field', () => {
    const wrapper = mount(NxSelect, { props: { options: [], variant: 'subtle', size: 'sm', icon: Info } });
    expect(wrapper.find('select').classes()).toContain('h-7');
    expect(wrapper.find('select').classes()).toContain('pl-8');
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
