export default defineNuxtRouteMiddleware((to) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated.value) {
    return navigateTo('/login', { replace: true });
  }
  if (to.path.startsWith('/login') || to.path.startsWith('/register') || to.path.startsWith('/select-org')) {
    return navigateTo('/', { replace: true });
  }
});
