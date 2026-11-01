import { ApiError } from '../utils/error';

export function useApi() {
  const { $api } = useNuxtApp();

  async function req<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
    try {
      return await $api[method.toLowerCase() as 'get']<T>(path, body === undefined ? undefined : { body });
    } catch (e) {
      throw ApiError.from(e);
    }
  }

  return {
    get: <T>(path: string) => req<T>('GET', path),
    post: <T>(path: string, body?: unknown) => req<T>('POST', path, body),
    patch: <T>(path: string, body?: unknown) => req<T>('PATCH', path, body),
    del: <T>(path: string) => req<T>('DELETE', path),
  };
}
