import type { ApiResponse } from '@nexa/types';

export interface ClientOptions {
  baseUrl: string;
  getToken?: () => string | null;
}

export class ApiClient {
  constructor(private opts: ClientOptions) {}

  async get<T>(path: string): Promise<ApiResponse<T>> {
    const res = await fetch(`${this.opts.baseUrl}${path}`, {
      headers: this.headers(),
    });
    const data = (await res.json()) as T;
    return { data, status: res.status };
  }

  private headers(): HeadersInit {
    const token = this.opts.getToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}
