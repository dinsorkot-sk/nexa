export default defineNuxtRouteMiddleware(async (to) => {
  const { session, load } = useSession();
  await load();
  if (!session.value && to.path !== '/login') return navigateTo('/login');
  if (session.value && to.path === '/login') return navigateTo('/');
});
