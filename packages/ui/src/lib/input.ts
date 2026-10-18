import { tv } from 'tailwind-variants';

/**
 * Shared look for text-like controls (NxInput, NxTextarea, NxSelect, NxCombobox), from the mockup's Input
 * section: three Variants, three Sizes and the Default/Hover/Focus/Error/Disabled states.
 *
 * The Error state replaces both the resting border and the focus ring colour, so `invalid` is matched together
 * with `variant` in compoundVariants rather than layered on top: two plain `ring-*` colours would otherwise be
 * resolved by stylesheet order instead of by state.
 */
export const fieldStyles = tv({
  base: 'block w-full bg-ui-bg text-ui-text-highlighted outline-none transition-[color,background-color,border-color,box-shadow] duration-ui-fast ease-ui-out placeholder:text-ui-text-dimmed disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-ui-bg-muted',
  variants: {
    variant: {
      outline: 'rounded-ui ring-1 ring-inset',
      soft: 'rounded-ui bg-ui-bg-elevated',
      subtle: 'rounded-ui bg-ui-bg-elevated ring-1 ring-inset',
    },
    size: {
      sm: 'text-xs [&_svg]:size-3.5',
      md: 'text-sm [&_svg]:size-4',
      lg: 'rounded-ui-lg text-base [&_svg]:size-5',
    },
    invalid: { true: '', false: '' },
  },
  compoundVariants: [
    { variant: 'outline', invalid: false, class: 'ring-ui-border-accented hover:ring-ui-text-dimmed focus:ring-2 focus:ring-ui-primary' },
    { variant: 'outline', invalid: true, class: 'ring-ui-error focus:ring-2 focus:ring-ui-error' },
    { variant: 'subtle', invalid: false, class: 'ring-ui-border-accented hover:ring-ui-text-dimmed focus:ring-2 focus:ring-ui-primary' },
    { variant: 'subtle', invalid: true, class: 'ring-ui-error focus:ring-2 focus:ring-ui-error' },
    { variant: 'soft', invalid: false, class: 'hover:bg-ui-bg-accented focus:bg-ui-bg focus:ring-2 focus:ring-ui-primary' },
    { variant: 'soft', invalid: true, class: 'ring-1 ring-ui-error focus:ring-2 focus:ring-ui-error' },
  ],
  defaultVariants: { variant: 'outline', size: 'md', invalid: false },
});

/** Box size of a control that has a fixed height: the mockup's FIELD table (28 / 36 / 44 px). */
export const fieldBox: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-7 px-2.5',
  md: 'h-9 px-3',
  lg: 'h-11 px-4',
};

/** Padding of a control that grows with its content (NxTextarea): same paddings, no fixed height. */
export const fieldArea: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'px-2.5 py-1.5',
  md: 'px-3 py-2',
  lg: 'px-4 py-2.5',
};

export type FieldVariant = 'outline' | 'soft' | 'subtle';
export type FieldSize = 'sm' | 'md' | 'lg';
