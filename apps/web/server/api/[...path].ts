// Forwards /api/** to the engine API, keeping method, body and the X-Nexa-* headers.
// Only clean relative paths below /api/ are forwarded (no dot segments, no encoded slashes).
export default defineEventHandler((event) => {
  const raw = getRouterParam(event, 'path', { decode: false }) ?? ''
  const segments = raw.split('/')
  if (!raw || segments.some((s) => !s || s === '.' || s === '..' || /%2f|%5c|%2e/i.test(s))) {
    throw createError({ statusCode: 400, statusMessage: 'Bad API path' })
  }
  const { apiBase } = useRuntimeConfig(event)
  const target = new URL(`${apiBase}/api/${raw}${getRequestURL(event).search}`)
  if (!target.pathname.startsWith('/api/')) throw createError({ statusCode: 400, statusMessage: 'Bad API path' })
  return proxyRequest(event, target.toString())
})
