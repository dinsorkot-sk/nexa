import { cn } from '@nexa/utils';
import type { JSX } from 'solid-js';

export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
}

export function Button(props: ButtonProps) {
  const { variant = 'primary', class: cls, ...rest } = props;
  return (
    <button
      class={cn(
        'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium',
        variant === 'primary' ? 'bg-black text-white' : 'bg-gray-100 text-black',
        cls,
      )}
      {...rest}
    />
  );
}