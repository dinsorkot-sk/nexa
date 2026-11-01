export default defineNuxtRouteMiddleware((to) => {
  const { slug } = useTenant();
  const routeTenant = (to.query.org as string | undefined) ?? slug.value;
  if (routeTenant && routeTenant !== slug.value) {
    useTenant().setTenant(routeTenant);
  }
});
