import type { ActionInfo, MenuNode, RecordValues, ResolvedView } from '~/utils/engine'

/** Error returned by the engine API, with a message safe to show to users. */
export class ApiError extends Error {
  constructor(readonly status: number, readonly type: string, message: string) {
    super(message)
  }

  get forbidden() {
    return this.status === 403
  }

  get unauthorized() {
    return this.status === 401
  }
}

const FRIENDLY: Record<number, string> = {
  401: 'Your session is missing or has expired. Sign in again.',
  404: 'This record no longer exists. It may have been deleted.',
  500: 'Something went wrong on the server. Try again in a moment.',
}

export function useEngine() {
  const { session, signOut } = useSession()

  async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const s = session.value
    try {
      return await $fetch<T>(`/api/${path}`, {
        method,
        ...(body !== undefined ? { body } : {}),
        headers: s ? { 'x-nexa-tenant': s.tenant, 'x-nexa-uid': String(s.uid) } : {},
      })
    } catch (err: unknown) {
      const e = err as { statusCode?: number; data?: { error?: { type?: string; message?: string } } }
      const status = e.statusCode ?? 0
      const message = e.data?.error?.message
      if (status === 401) {
        signOut()
        await navigateTo('/login')
      }
      throw new ApiError(
        status,
        e.data?.error?.type ?? 'internal',
        status === 0 ? 'Cannot reach the server. Check your connection and try again.'
          : (status >= 500 || !message ? FRIENDLY[status] ?? FRIENDLY[500]! : message),
      )
    }
  }

  const rpc = <T>(model: string, method: string, body: unknown = {}) => request<T>('POST', `model/${model}/${method}`, body)

  /** Display names for record ids ("name" field, else "#id"). */
  async function displayNames(model: string, ids: number[]): Promise<Map<number, string>> {
    const out = new Map<number, string>()
    if (!ids.length) return out
    try {
      const { records } = await rpc<{ records: RecordValues[] }>(model, 'read', { ids, fields: ['name'] })
      for (const r of records) out.set(r.id as number, String(r.name ?? `#${String(r.id)}`))
    } catch {
      // no name field or no access: fall back to ids
    }
    return out
  }

  return {
    studioModels: () => request<{ models: { name: string; description?: string; fields: { name: string; type: string; string: string; comodel?: string }[] }[] }>('GET', 'studio/models'),
    studioCreateModel: (body: { name: string; description?: string }) => request<{ model: string }>('POST', 'studio/model', body),
    studioCreateField: (body: Record<string, unknown>) => request<{ model: string; field: string }>('POST', 'studio/field', body),
    studioCreateView: (body: Record<string, unknown>) => request<{ xmlId: string }>('POST', 'studio/view', body),
    searchRead: (model: string, body: unknown) => rpc<{ records: RecordValues[]; length: number }>(model, 'search_read', body),
    read: (model: string, ids: number[], fields?: string[]) =>
      rpc<{ records: RecordValues[] }>(model, 'read', { ids, ...(fields ? { fields } : {}) }),
    create: (model: string, values: RecordValues) => rpc<{ ids: number[] }>(model, 'create', { values }),
    write: (model: string, ids: number[], values: RecordValues) => rpc<{ ok: true }>(model, 'write', { ids, values }),
    unlink: (model: string, ids: number[]) => rpc<{ ok: true }>(model, 'unlink', { ids }),
    onchange: (model: string, values: RecordValues, field: string) => rpc<{ value: RecordValues }>(model, 'onchange', { values, field }),
    view: (model: string, type: string) => request<ResolvedView>('GET', `ui/view/${model}/${type}`),
    action: (xmlId: string) => request<ActionInfo>('GET', `ui/action/${xmlId}`),
    menus: () => request<{ menus: MenuNode[] }>('GET', 'ui/menus'),
    displayNames,
  }
}
