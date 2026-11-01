import * as React from 'react';
import { cn } from '@nexa/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
}

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium',
        variant === 'primary' ? 'bg-black text-white' : 'bg-gray-100 text-black',
        className,
      )}
      {...props}
    />
  );
}
