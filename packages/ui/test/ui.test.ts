import { describe, it, expect } from 'vitest';
import { cn } from '../src/index';

describe('@nexa/ui utilities', () => {
  it('merges tailwind class names correctly', () => {
    const result = cn('px-2 py-1', 'bg-blue-500', { 'text-white': true, 'text-black': false });
    expect(result).toBe('px-2 py-1 bg-blue-500 text-white');
  });

  it('resolves tailwind conflicts with twMerge', () => {
    const result = cn('p-4', 'p-2');
    expect(result).toBe('p-2');
  });
});
