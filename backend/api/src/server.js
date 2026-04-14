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

// ── Start ────────────────────────────────────────────────────
const port = parseInt(process.env.PORT || '3001')
const host = process.env.HOST || '0.0.0.0'

try {
  await fastify.listen({ port, host })
  console.log(`Ernest API running on http://${host}:${port}`)
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
