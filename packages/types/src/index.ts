export interface User {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  createdAt: string;
}

export interface ApiResponse<T> {
  data: T;
  error?: string;
  status: number;
}

export type Platform = 'web' | 'server' | 'desktop' | 'mobile';

export * from './db';
export * from './tenant';
export * from './metadata';
