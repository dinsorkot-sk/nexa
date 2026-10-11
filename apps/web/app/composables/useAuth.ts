import { createAuthController } from '../utils/auth-controller';
import type { AuthApi, Principal } from '../utils/auth-controller';

/**
 * Singleton auth state shared across pages. Delegates to the framework-free
 * auth controller and mirrors its principal into a reactive ref.
 */
export function useAuth() {
  const principal = useState<Principal | null>('nexa.principal', () => null);
  const loaded = useState<boolean>('nexa.principal.loaded', () => false);

  const api = useApiClient();
  const controller = createAuthController({
    me: () => api.auth.me.$get(),
    login: (input) => api.auth.login.$post({ json: input }),
    signup: (input) => api.auth.signup.$post({ json: input }),
    logout: () => api.auth.logout.$post(),
  } satisfies AuthApi);

  async function ensureLoaded() {
    if (!loaded.value) {
      await controller.refresh();
      principal.value = controller.principal;
      loaded.value = true;
    }
  }

  async function login(email: string, password: string) {
    const next = await controller.login({ email, password });
    principal.value = next;
    loaded.value = true;
  }

  async function signup(email: string, password: string, displayName?: string) {
    const next = await controller.signup({ email, password, displayName });
    principal.value = next;
    loaded.value = true;
  }

  async function logout() {
    await controller.logout();
    principal.value = null;
    loaded.value = false;
    await navigateTo('/login');
  }

  return { principal, ensureLoaded, login, signup, logout };
}
