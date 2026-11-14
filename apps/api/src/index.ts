import { createApp } from './app.js'

const app = createApp()
const port = Number(process.env.API_PORT ?? 8080)
const host = process.env.API_HOST ?? '127.0.0.1'

try {
  await app.listen({ host, port })
} catch (error) {
  app.log.error(error)
  process.exitCode = 1
}
