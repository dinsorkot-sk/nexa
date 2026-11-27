export interface StudioSession {
  accessToken: string
  expiresAt: string
  tenant: string
  login: string
}

export interface StudioField {
  name: string
  type: string
  string: string
  comodel?: string
  required: boolean
  unique?: boolean
}

export interface StudioModel {
  name: string
  description?: string
  fields: StudioField[]
}

interface LoginResponse {
  accessToken: string
  expiresAt: string
}

interface StudioRequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
}

function responseStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  if ('statusCode' in error && typeof error.statusCode === 'number') return error.statusCode
  if ('status' in error && typeof error.status === 'number') return error.status
  return undefined
}

function errorMessageValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string').join(', ')
  return undefined
}

export function getStudioApiErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    if ('data' in error && typeof error.data === 'object' && error.data !== null) {
      if ('message' in error.data) {
        const message = errorMessageValue(error.data.message)
        if (message) return message
      }
      if ('error' in error.data) {
        const message = errorMessageValue(error.data.error)
        if (message) return message
        if (typeof error.data.error === 'object' && error.data.error !== null && 'message' in error.data.error) {
          const nestedMessage = errorMessageValue(error.data.error.message)
          if (nestedMessage) return nestedMessage
        }
      }
    }
    if ('message' in error && typeof error.message === 'string' && error.message) return error.message
  }
  return 'The request could not be completed. Please try again.'
}

export function useStudioApi() {
  const session = useState<StudioSession | null>('nexa-studio-session', () => null)

  async function request<T>(path: string, options: StudioRequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {}
    if (session.value) headers.Authorization = `Bearer ${session.value.accessToken}`

    try {
      return await $fetch<T>(`/api/${path}`, { ...options, headers })
    } catch (error) {
      if (responseStatus(error) === 401) session.value = null
      throw error
    }
  }

  async function login(credentials: { tenant: string; login: string; password: string }): Promise<void> {
    const result = await $fetch<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: credentials,
    })
    session.value = {
      accessToken: result.accessToken,
      expiresAt: result.expiresAt,
      tenant: credentials.tenant,
      login: credentials.login,
    }
  }

  async function logout(): Promise<void> {
    if (!session.value) return
    try {
      await request<{ ok: boolean }>('auth/logout', { method: 'POST' })
    } finally {
      session.value = null
    }
  }

  return { session, request, login, logout }
}
