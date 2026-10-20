import { tone, type NxColor, type NxSize, type NxVariant } from './tone';

/**
 * Shared look for NxButton and NxIconButton, from the mockup's Button section: Color is the intent, Variant the
 * emphasis, Size the density. Heights, paddings, gaps, icon sizes and radii are the mockup's SIZES table.
 * Solid fills use the `on-solid` label colour (see tokens.css): the mockup's white label fails WCAG AA.
 */
export const buttonBase = 'inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition duration-ui-fast ease-ui-out outline-none focus-visible:ring-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-0';

export const buttonSizes: Record<NxSize, string> = {
  sm: 'h-7 gap-1.5 rounded-ui px-2.5 text-xs [&_svg]:size-3.5',
  md: 'h-9 gap-1.5 rounded-ui px-3 text-sm [&_svg]:size-4',
  lg: 'h-11 gap-2 rounded-ui-lg px-4 text-base [&_svg]:size-5',
};

export const iconButtonSizes: Record<NxSize, string> = {
  sm: 'size-7 rounded-ui [&_svg]:size-3.5',
  md: 'size-9 rounded-ui [&_svg]:size-4',
  lg: 'size-11 rounded-ui-lg [&_svg]:size-5',
};

/** The class list for a button. `iconOnly` switches to the square sizes used by NxIconButton. */
export function buttonClasses(color: NxColor, variant: NxVariant, size: NxSize, iconOnly = false): string {
  const t = tone(color, variant);
  const link = variant === 'link' ? 'hover:underline' : '';
  return [
    buttonBase,
    iconOnly ? iconButtonSizes[size] : buttonSizes[size],
    t.surface,
    t.hover,
    t.border,
    t.label,
    t.ring,
    link,
  ].filter(Boolean).join(' ');
}

export type ButtonColor = NxColor;
export type ButtonVariant = NxVariant;
export type ButtonSize = NxSize;
