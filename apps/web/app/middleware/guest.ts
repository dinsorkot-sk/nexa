export default defineNuxtRouteMiddleware((to) => {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated.value && to.path !== '/select-org') {
    return navigateTo('/', { replace: true });
  }
});
