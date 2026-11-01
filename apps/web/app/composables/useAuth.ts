export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

/** Foundation demo user (fixture) — replaced by real session when backend sets cookie sessions. */
const DEMO_USER: AuthUser = {
  id: 'u_01hzdemo0000000000000001',
  email: 'somchai@loghoizon.local',
  name: 'Somchai J.',
  role: 'admin',
};

export function useAuth() {
  const token = useCookie('nexa_token', { sameSite: 'lax' });
  const user = useState<AuthUser | null>('auth:user', () => null);

  if (!user.value) {
    user.value = DEMO_USER;
  }

  const isAuthenticated = computed(() => user.value !== null);

  async function login(email: string, password: string, rememberMe = false) {
    const { $api } = useNuxtApp();
    const res = await $api.post<{ token: string; user: { id: string; email: string; name: string | null } }>('/auth/login', {
      body: { email, password },
    });
    token.value = res.token;
    if (rememberMe) {
      document.cookie = `nexa_token=${res.token}; max-age=${60 * 60 * 24 * 30}; path=/; samesite=lax`;
    }
    user.value = { id: res.user.id, email: res.user.email, name: res.user.name ?? res.user.email, role: 'member' };
  }

  async function register(name: string, email: string, password: string, organization: string) {
    const { $api } = useNuxtApp();
    await $api.post('/auth/register', { body: { email, password, name } });
    await $api.post('/tenants', { body: { slug: organization.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: organization } });
    await login(email, password);
  }

  function logout() {
    token.value = null;
    user.value = null;
    navigateTo('/login');
  }

  return {
    user: readonly(user),
    token: readonly(token),
    isAuthenticated,
    login,
    register,
    logout,
  };
}
