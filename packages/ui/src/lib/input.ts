import { tv } from 'tailwind-variants';

/** Shared look for text-like controls: NxInput, NxTextarea and NxSelect. */
export const inputStyles = tv({
  base: 'block w-full rounded-ui border bg-ui-bg px-3 text-ui-text-highlighted outline-none transition-colors placeholder:text-ui-text-muted focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-ui-bg-muted',
  variants: {
    size: {
      sm: 'h-7 text-xs',
      md: 'h-9 text-sm',
    },
    invalid: {
      true: 'border-ui-error focus:ring-ui-error/50',
      false: 'border-ui-border-accented focus:ring-ui-primary/50',
    },
  },
  defaultVariants: { size: 'md', invalid: false },
});
