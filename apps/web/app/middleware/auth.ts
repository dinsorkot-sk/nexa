/**
 * Guards authenticated Builder routes: resolves the principal once, then
 * redirects signed-out visitors to /login, preserving the requested path.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { principal, ensureLoaded } = useAuth();
  await ensureLoaded();
  if (!principal.value) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } });
  }
});
