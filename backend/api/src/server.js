// ============================================================
// server.js — Fastify API server Ernest
// Massiu Soft SL
// ============================================================
import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import jwt from '@fastify/jwt'
import { ingestRoutes } from './routes/ingest.js'
import { dogsRoutes } from './routes/dogs.js'
import { metricsRoutes } from './routes/metrics.js'
import { healthRoutes } from './routes/health.js'

// ── Sentry (monitoratge d'errors) ────────────────────────────
// Activat automàticament si SENTRY_DSN és present.
// Configura a: https://sentry.io → Ernest-API → Settings → DSN
let Sentry = null
if (process.env.SENTRY_DSN) {
  try {
    const sentryModule = await import('@sentry/node')
    Sentry = sentryModule
    Sentry.init({
      dsn:              process.env.SENTRY_DSN,
      environment:      process.env.NODE_ENV || 'production',
      release:          `ernest-api@${process.env.npm_package_version || '1.0.0'}`,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      // No enviar dades d'usuari sense consentiment
      beforeSend(event) {
        if (event.request?.data) delete event.request.data
        return event
      }
    })
    console.log('[Sentry] Inicialitzat correctament')
  } catch {
    console.warn('[Sentry] Mòdul no instal·lat — afegeix @sentry/node a dependencies')
  }
}

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty' }
      : undefined
  }
})

// ── Plugins ──────────────────────────────────────────────────
await fastify.register(cors, {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
})

await fastify.register(rateLimit, {
  max: 200,
  timeWindow: '1 minute'
})

await fastify.register(jwt, {
  secret: process.env.SUPABASE_JWT_SECRET || 'dev-secret-change-in-prod'
})

// ── Decorators ───────────────────────────────────────────────
// Verificar JWT de Supabase en routes protegides
fastify.decorate('authenticate', async (request, reply) => {
  try {
    await request.jwtVerify()
  } catch (err) {
    reply.code(401).send({ error: 'Unauthorized' })
  }
})

// ── Routes ───────────────────────────────────────────────────
await fastify.register(healthRoutes,  { prefix: '/health' })
await fastify.register(ingestRoutes,  { prefix: '/api/v1/ingest' })
await fastify.register(dogsRoutes,    { prefix: '/api/v1/dogs' })
await fastify.register(metricsRoutes, { prefix: '/api/v1/metrics' })

// ── Error handler global (Sentry) ────────────────────────────
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error({ err: error, url: request.url }, 'Unhandled error')
  if (Sentry) Sentry.captureException(error)
  reply.code(error.statusCode || 500).send({
    error:   error.message || 'Internal Server Error',
    code:    error.code
  })
})

// ── Start ────────────────────────────────────────────────────
const port = parseInt(process.env.PORT || '3001')
const host = process.env.HOST || '0.0.0.0'

try {
  await fastify.listen({ port, host })
  console.log(`Ernest API running on http://${host}:${port}`)
} catch (err) {
  if (Sentry) Sentry.captureException(err)
  fastify.log.error(err)
  process.exit(1)
}
