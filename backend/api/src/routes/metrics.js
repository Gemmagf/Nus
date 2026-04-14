// ============================================================
// metrics.js — Consulta mètriques i alertes
// GET /api/v1/metrics/:dogId/daily?from=&to=
// GET /api/v1/metrics/:dogId/baseline
// GET /api/v1/metrics/:dogId/alerts
// Massiu Soft SL
// ============================================================
import { supabase } from '../plugins/supabase.js'

export async function metricsRoutes(fastify) {

  // ── Helper: verificar propietat del gos ──────────────────
  async function ownsDog(userId, dogId) {
    const { data } = await supabase
      .from('dogs')
      .select('id')
      .eq('id', dogId)
      .eq('owner_id', userId)
      .single()
    return !!data
  }

  // GET /api/v1/metrics/:dogId/daily
  // Mètriques diàries per a un rang de dates
  fastify.get('/:dogId/daily', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (!await ownsDog(req.user.sub, req.params.dogId)) {
      return reply.code(403).send({ error: 'Accés denegat' })
    }

    const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
    const to   = req.query.to   || new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('daily_metrics')
      .select('*')
      .eq('dog_id', req.params.dogId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true })

    if (error) return reply.code(500).send({ error: error.message })
    return data
  })

  // GET /api/v1/metrics/:dogId/baseline
  // Baselines actuals del gos
  fastify.get('/:dogId/baseline', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (!await ownsDog(req.user.sub, req.params.dogId)) {
      return reply.code(403).send({ error: 'Accés denegat' })
    }

    const { data, error } = await supabase
      .from('baselines')
      .select('*')
      .eq('dog_id', req.params.dogId)
      .order('metric')

    if (error) return reply.code(500).send({ error: error.message })
    return data
  })

  // GET /api/v1/metrics/:dogId/alerts
  // Alertes del gos (per defecte, no llegides)
  fastify.get('/:dogId/alerts', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (!await ownsDog(req.user.sub, req.params.dogId)) {
      return reply.code(403).send({ error: 'Accés denegat' })
    }

    const onlyUnread = req.query.unread !== 'false'
    let query = supabase
      .from('alerts')
      .select('*')
      .eq('dog_id', req.params.dogId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (onlyUnread) query = query.eq('is_read', false)

    const { data, error } = await query
    if (error) return reply.code(500).send({ error: error.message })
    return data
  })

  // PATCH /api/v1/metrics/:dogId/alerts/:alertId/read
  // Marcar alerta com a llegida
  fastify.patch('/:dogId/alerts/:alertId/read', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (!await ownsDog(req.user.sub, req.params.dogId)) {
      return reply.code(403).send({ error: 'Accés denegat' })
    }

    const { error } = await supabase
      .from('alerts')
      .update({ is_read: true })
      .eq('id', req.params.alertId)
      .eq('dog_id', req.params.dogId)

    if (error) return reply.code(500).send({ error: error.message })
    return { ok: true }
  })
}
