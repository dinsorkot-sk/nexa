export interface Session {
  userId: string;
  tenantId: string;
  name: string;
  roleIds: string[];
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  roleIds: string[];
}

export function useSession() {
  const session = useState<Session | null>('nexa-session', () => null);
  const loaded = useState('nexa-session-loaded', () => false);

  async function load(force = false) {
    if (loaded.value && !force) return session.value;
    try {
      session.value = await api<Session>('/auth/me');
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      session.value = null;
    }
    loaded.value = true;
    return session.value;
  }

  /** Resolves to the organizations to choose from when the account belongs to several, else null once signed in. */
  async function login(email: string, password: string, organizationId?: string): Promise<Organization[] | null> {
    try {
      await api('/auth/login', { method: 'POST', body: { email, password, ...(organizationId ? { organizationId } : {}) } });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ORGANIZATION_REQUIRED') return error.details as Organization[];
      throw error;
    }
    await load(true);
    return null;
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    session.value = null;
  }

  return { session, load, login, logout };
}
