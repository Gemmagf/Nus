// ── GET /health ── Operabilitat Massiu: health check automàtic
export async function healthRoutes(fastify) {
  fastify.get('/', async (request, reply) => {
    return {
      status:    'ok',
      service:   'ernest-api',
      version:   '1.0.0',
      timestamp: new Date().toISOString(),
      uptime:    process.uptime()
    }
  })
}
