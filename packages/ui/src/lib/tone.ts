/**
 * The mockup's tone table (nexa.figcraft, generator `tone()` in `comp_base.py`): every Color x Variant pair
 * maps to the fill, hover, border, label, icon and focus-ring a component uses. Buttons, IconButtons, Badges
 * and Alerts all read from this one table so the four components stay consistent.
 *
 * Labels on translucent tints use the highlighted text token, and solid fills use `on-solid`: the mockup's own
 * white label fails WCAG AA on those fills (see tokens.css and test/tokens.test.ts).
 *
 * The class strings are written out literally and not built by string concatenation, because Tailwind only sees
 * class names that appear in the source it scans.
 */
export type NxColor = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral';
export type NxVariant = 'solid' | 'outline' | 'soft' | 'subtle' | 'ghost' | 'link';
export type NxSize = 'sm' | 'md' | 'lg';

export interface NxTone {
  /** Background fill. Empty for the variants that sit on the surface (ghost, outline, link). */
  surface: string;
  /** Fill or border change on hover. */
  hover: string;
  /** Inset border. Empty for the variants that have no border. */
  border: string;
  /** Label colour. */
  label: string;
  /** Icon colour inside the control. */
  icon: string;
  /** Focus-visible ring colour, without the ring width. */
  ring: string;
}

const tones: Record<NxColor, Record<NxVariant, NxTone>> = {
  primary: {
    solid: { surface: 'bg-ui-primary', hover: 'hover:bg-ui-primary-hover', border: '', label: 'text-ui-on-solid', icon: 'text-ui-on-solid', ring: 'focus-visible:ring-ui-primary' },
    outline: { surface: '', hover: 'hover:bg-ui-primary-soft', border: 'ring-1 ring-inset ring-ui-primary-outline', label: 'text-ui-text-highlighted', icon: 'text-ui-primary-text', ring: 'focus-visible:ring-ui-primary' },
    soft: { surface: 'bg-ui-primary-soft', hover: 'hover:bg-ui-primary-soft-hover', border: '', label: 'text-ui-text-highlighted', icon: 'text-ui-primary-text', ring: 'focus-visible:ring-ui-primary' },
    subtle: { surface: 'bg-ui-primary-soft', hover: 'hover:bg-ui-primary-soft-hover', border: 'ring-1 ring-inset ring-ui-primary-ring', label: 'text-ui-text-highlighted', icon: 'text-ui-primary-text', ring: 'focus-visible:ring-ui-primary' },
    ghost: { surface: '', hover: 'hover:bg-ui-primary-soft', border: '', label: 'text-ui-primary-text', icon: 'text-ui-primary-text', ring: 'focus-visible:ring-ui-primary' },
    link: { surface: '', hover: '', border: '', label: 'text-ui-primary-text', icon: 'text-ui-primary-text', ring: 'focus-visible:ring-ui-primary' },
  },
  secondary: {
    solid: { surface: 'bg-ui-secondary', hover: 'hover:bg-ui-secondary-hover', border: '', label: 'text-ui-on-solid', icon: 'text-ui-on-solid', ring: 'focus-visible:ring-ui-secondary' },
    outline: { surface: '', hover: 'hover:bg-ui-secondary-soft', border: 'ring-1 ring-inset ring-ui-secondary-outline', label: 'text-ui-text-highlighted', icon: 'text-ui-secondary-text', ring: 'focus-visible:ring-ui-secondary' },
    soft: { surface: 'bg-ui-secondary-soft', hover: 'hover:bg-ui-secondary-soft-hover', border: '', label: 'text-ui-text-highlighted', icon: 'text-ui-secondary-text', ring: 'focus-visible:ring-ui-secondary' },
    subtle: { surface: 'bg-ui-secondary-soft', hover: 'hover:bg-ui-secondary-soft-hover', border: 'ring-1 ring-inset ring-ui-secondary-ring', label: 'text-ui-text-highlighted', icon: 'text-ui-secondary-text', ring: 'focus-visible:ring-ui-secondary' },
    ghost: { surface: '', hover: 'hover:bg-ui-secondary-soft', border: '', label: 'text-ui-secondary-text', icon: 'text-ui-secondary-text', ring: 'focus-visible:ring-ui-secondary' },
    link: { surface: '', hover: '', border: '', label: 'text-ui-secondary-text', icon: 'text-ui-secondary-text', ring: 'focus-visible:ring-ui-secondary' },
  },
  success: {
    solid: { surface: 'bg-ui-success', hover: 'hover:bg-ui-success-hover', border: '', label: 'text-ui-on-solid', icon: 'text-ui-on-solid', ring: 'focus-visible:ring-ui-success' },
    outline: { surface: '', hover: 'hover:bg-ui-success-soft', border: 'ring-1 ring-inset ring-ui-success-outline', label: 'text-ui-text-highlighted', icon: 'text-ui-success-text', ring: 'focus-visible:ring-ui-success' },
    soft: { surface: 'bg-ui-success-soft', hover: 'hover:bg-ui-success-soft-hover', border: '', label: 'text-ui-text-highlighted', icon: 'text-ui-success-text', ring: 'focus-visible:ring-ui-success' },
    subtle: { surface: 'bg-ui-success-soft', hover: 'hover:bg-ui-success-soft-hover', border: 'ring-1 ring-inset ring-ui-success-ring', label: 'text-ui-text-highlighted', icon: 'text-ui-success-text', ring: 'focus-visible:ring-ui-success' },
    ghost: { surface: '', hover: 'hover:bg-ui-success-soft', border: '', label: 'text-ui-success-text', icon: 'text-ui-success-text', ring: 'focus-visible:ring-ui-success' },
    link: { surface: '', hover: '', border: '', label: 'text-ui-success-text', icon: 'text-ui-success-text', ring: 'focus-visible:ring-ui-success' },
  },
  info: {
    solid: { surface: 'bg-ui-info', hover: 'hover:bg-ui-info-hover', border: '', label: 'text-ui-on-solid', icon: 'text-ui-on-solid', ring: 'focus-visible:ring-ui-info' },
    outline: { surface: '', hover: 'hover:bg-ui-info-soft', border: 'ring-1 ring-inset ring-ui-info-outline', label: 'text-ui-text-highlighted', icon: 'text-ui-info-text', ring: 'focus-visible:ring-ui-info' },
    soft: { surface: 'bg-ui-info-soft', hover: 'hover:bg-ui-info-soft-hover', border: '', label: 'text-ui-text-highlighted', icon: 'text-ui-info-text', ring: 'focus-visible:ring-ui-info' },
    subtle: { surface: 'bg-ui-info-soft', hover: 'hover:bg-ui-info-soft-hover', border: 'ring-1 ring-inset ring-ui-info-ring', label: 'text-ui-text-highlighted', icon: 'text-ui-info-text', ring: 'focus-visible:ring-ui-info' },
    ghost: { surface: '', hover: 'hover:bg-ui-info-soft', border: '', label: 'text-ui-info-text', icon: 'text-ui-info-text', ring: 'focus-visible:ring-ui-info' },
    link: { surface: '', hover: '', border: '', label: 'text-ui-info-text', icon: 'text-ui-info-text', ring: 'focus-visible:ring-ui-info' },
  },
  warning: {
    // Warning text is too light for an icon on a plain surface, so icons use the highlighted token.
    solid: { surface: 'bg-ui-warning', hover: 'hover:bg-ui-warning-hover', border: '', label: 'text-ui-on-solid', icon: 'text-ui-on-solid', ring: 'focus-visible:ring-ui-warning' },
    outline: { surface: '', hover: 'hover:bg-ui-warning-soft', border: 'ring-1 ring-inset ring-ui-warning-outline', label: 'text-ui-text-highlighted', icon: 'text-ui-text-highlighted', ring: 'focus-visible:ring-ui-warning' },
    soft: { surface: 'bg-ui-warning-soft', hover: 'hover:bg-ui-warning-soft-hover', border: '', label: 'text-ui-text-highlighted', icon: 'text-ui-text-highlighted', ring: 'focus-visible:ring-ui-warning' },
    subtle: { surface: 'bg-ui-warning-soft', hover: 'hover:bg-ui-warning-soft-hover', border: 'ring-1 ring-inset ring-ui-warning-ring', label: 'text-ui-text-highlighted', icon: 'text-ui-text-highlighted', ring: 'focus-visible:ring-ui-warning' },
    ghost: { surface: '', hover: 'hover:bg-ui-warning-soft', border: '', label: 'text-ui-warning-text', icon: 'text-ui-text-highlighted', ring: 'focus-visible:ring-ui-warning' },
    link: { surface: '', hover: '', border: '', label: 'text-ui-warning-text', icon: 'text-ui-text-highlighted', ring: 'focus-visible:ring-ui-warning' },
  },
  error: {
    solid: { surface: 'bg-ui-error', hover: 'hover:bg-ui-error-hover', border: '', label: 'text-ui-on-solid', icon: 'text-ui-on-solid', ring: 'focus-visible:ring-ui-error' },
    outline: { surface: '', hover: 'hover:bg-ui-error-soft', border: 'ring-1 ring-inset ring-ui-error-outline', label: 'text-ui-text-highlighted', icon: 'text-ui-error-text', ring: 'focus-visible:ring-ui-error' },
    soft: { surface: 'bg-ui-error-soft', hover: 'hover:bg-ui-error-soft-hover', border: '', label: 'text-ui-text-highlighted', icon: 'text-ui-error-text', ring: 'focus-visible:ring-ui-error' },
    subtle: { surface: 'bg-ui-error-soft', hover: 'hover:bg-ui-error-soft-hover', border: 'ring-1 ring-inset ring-ui-error-ring', label: 'text-ui-text-highlighted', icon: 'text-ui-error-text', ring: 'focus-visible:ring-ui-error' },
    ghost: { surface: '', hover: 'hover:bg-ui-error-soft', border: '', label: 'text-ui-error-text', icon: 'text-ui-error-text', ring: 'focus-visible:ring-ui-error' },
    link: { surface: '', hover: '', border: '', label: 'text-ui-error-text', icon: 'text-ui-error-text', ring: 'focus-visible:ring-ui-error' },
  },
  neutral: {
    solid: { surface: 'bg-ui-bg-inverted', hover: 'hover:bg-ui-neutral-hover', border: '', label: 'text-ui-text-inverted', icon: 'text-ui-text-inverted', ring: 'focus-visible:ring-ui-ring' },
    outline: { surface: 'bg-ui-bg', hover: 'hover:bg-ui-bg-elevated', border: 'ring-1 ring-inset ring-ui-border-accented', label: 'text-ui-text-toned', icon: 'text-ui-text-toned', ring: 'focus-visible:ring-ui-ring' },
    soft: { surface: 'bg-ui-bg-elevated', hover: 'hover:bg-ui-bg-accented', border: '', label: 'text-ui-text-highlighted', icon: 'text-ui-text-toned', ring: 'focus-visible:ring-ui-ring' },
    subtle: { surface: 'bg-ui-bg-elevated', hover: 'hover:bg-ui-bg-accented', border: 'ring-1 ring-inset ring-ui-border-accented', label: 'text-ui-text-highlighted', icon: 'text-ui-text-toned', ring: 'focus-visible:ring-ui-ring' },
    ghost: { surface: '', hover: 'hover:bg-ui-bg-elevated', border: '', label: 'text-ui-text-toned', icon: 'text-ui-text-toned', ring: 'focus-visible:ring-ui-ring' },
    link: { surface: '', hover: '', border: '', label: 'text-ui-text-muted', icon: 'text-ui-text-muted', ring: 'focus-visible:ring-ui-ring' },
  },
};

/** Tone for a Color x Variant pair. Every pair is defined; the table is the mockup's tone table. */
export function tone(color: NxColor, variant: NxVariant): NxTone {
  return tones[color][variant];
}

/**
 * Background of the Badge / Indicator dot: the Solid variants paint it with the label colour, the others with
 * the colour itself (neutral falls back to the muted text token). Written out literally for Tailwind.
 */
const dots: Record<NxColor, Record<'solid' | 'plain', string>> = {
  primary: { solid: 'bg-ui-on-solid', plain: 'bg-ui-primary' },
  secondary: { solid: 'bg-ui-on-solid', plain: 'bg-ui-secondary' },
  success: { solid: 'bg-ui-on-solid', plain: 'bg-ui-success' },
  info: { solid: 'bg-ui-on-solid', plain: 'bg-ui-info' },
  warning: { solid: 'bg-ui-on-solid', plain: 'bg-ui-warning' },
  error: { solid: 'bg-ui-on-solid', plain: 'bg-ui-error' },
  neutral: { solid: 'bg-ui-text-inverted', plain: 'bg-ui-text-muted' },
};

export function dotColor(color: NxColor, variant: NxVariant = 'solid'): string {
  return dots[color][variant === 'solid' ? 'solid' : 'plain'];
}

/** Fill and label for the Indicator's notification dot or count badge. */
const indicators: Record<NxColor, { fill: string; label: string }> = {
  primary: { fill: 'bg-ui-primary', label: 'text-ui-on-solid' },
  secondary: { fill: 'bg-ui-secondary', label: 'text-ui-on-solid' },
  success: { fill: 'bg-ui-success', label: 'text-ui-on-solid' },
  info: { fill: 'bg-ui-info', label: 'text-ui-on-solid' },
  warning: { fill: 'bg-ui-warning', label: 'text-ui-on-solid' },
  error: { fill: 'bg-ui-error', label: 'text-ui-on-solid' },
  neutral: { fill: 'bg-ui-bg-inverted', label: 'text-ui-text-inverted' },
};

export function indicatorTone(color: NxColor): { fill: string; label: string } {
  return indicators[color];
}

export const nxColors: NxColor[] = ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral'];
export const nxVariants: NxVariant[] = ['solid', 'outline', 'soft', 'subtle', 'ghost', 'link'];
export const nxSizes: NxSize[] = ['sm', 'md', 'lg'];
