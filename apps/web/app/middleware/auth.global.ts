export default defineNuxtRouteMiddleware((to) => {
  const { session } = useSession()
  if (!session.value && to.path !== '/login') return navigateTo({ path: '/login', query: { next: to.fullPath } })
})
