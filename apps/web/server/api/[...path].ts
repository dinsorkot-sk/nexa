import { createError, getRouterParam, proxyRequest } from 'h3'

function isAllowedApiPath(path: string): boolean {
  return path === 'auth/login'
    || path === 'auth/logout'
    || path === 'studio/models'
    || path === 'studio/model'
    || path === 'studio/field'
    || path === 'studio/view'
    || path === 'studio/mixins'
    || path === 'studio/mixin/attach'
    || /^ui\/view\/[a-z][a-z0-9_.]*\/(list|form)$/.test(path)
}

export default defineEventHandler((event) => {
  const path = getRouterParam(event, 'path')
  if (!path || !isAllowedApiPath(path)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const apiBase = useRuntimeConfig(event).apiBase.replace(/\/+$/, '')
  return proxyRequest(event, `${apiBase}/${path}`)
})
