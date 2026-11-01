import type { User } from '@nexa/types';

export function greet(user: User): string {
  return `Hello, ${user.name ?? user.email}`;
}

export const PLATFORMS = ['web', 'server', 'desktop', 'mobile'] as const;
