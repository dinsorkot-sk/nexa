import { tv } from 'tailwind-variants';

/**
 * Shared look for NxButton and NxIconButton. The colours are the mockup's Button variants. Solid fills use the
 * `on-solid` label colour (see tokens.css): the mockup's white label fails WCAG AA on these fills.
 */
export const buttonStyles = tv({
  base: 'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-ui font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ui-primary focus-visible:ring-offset-2 focus-visible:ring-offset-ui-bg disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  variants: {
    color: {
      primary: 'bg-ui-primary text-ui-on-solid hover:bg-ui-primary/90',
      secondary: 'bg-ui-primary/15 text-ui-text-highlighted hover:bg-ui-primary/25',
      neutral: 'bg-ui-bg text-ui-text-toned ring-1 ring-inset ring-ui-border-accented hover:bg-ui-bg-elevated',
      ghost: 'text-ui-text-toned hover:bg-ui-bg-elevated',
      danger: 'bg-ui-error text-ui-on-solid hover:bg-ui-error/90',
    },
    size: {
      sm: 'h-7 px-2.5 text-xs',
      md: 'h-9 px-3.5 text-sm',
    },
    iconOnly: {
      true: 'px-0',
      false: '',
    },
  },
  compoundVariants: [
    { size: 'sm', iconOnly: true, class: 'w-7' },
    { size: 'md', iconOnly: true, class: 'w-9' },
  ],
  defaultVariants: {
    color: 'primary',
    size: 'md',
    iconOnly: false,
  },
});

export type ButtonColor = 'primary' | 'secondary' | 'neutral' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';
