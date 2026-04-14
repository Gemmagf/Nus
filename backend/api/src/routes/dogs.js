// ============================================================
// dogs.js — CRUD gossos
// GET /api/v1/dogs
// POST /api/v1/dogs
// GET /api/v1/dogs/:id
// PATCH /api/v1/dogs/:id
// Massiu Soft SL
// ============================================================
import { z } from 'zod'
import { supabase } from '../plugins/supabase.js'

const DogCreateSchema = z.object({
  name:       z.string().min(1).max(50),
  breed:      z.string().max(100).optional(),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  weight_kg:  z.number().min(0.5).max(100).optional(),
  device_id:  z.string().optional()
})

export async function dogsRoutes(fastify) {

  // GET /api/v1/dogs — Llistar els gossos de l'usuari
  fastify.get('/', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { data, error } = await supabase
      .from('dogs')
      .select('*, device_health(last_seen_at, battery_pct, is_online)')
      .eq('owner_id', req.user.sub)
      .eq('is_active', true)
      .order('created_at')

    if (error) return reply.code(500).send({ error: error.message })
    return data
  })

  // POST /api/v1/dogs — Crear un gos nou
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const parsed = DogCreateSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    const { data, error } = await supabase
      .from('dogs')
      .insert({ ...parsed.data, owner_id: req.user.sub })
      .select()
      .single()

    if (error) return reply.code(500).send({ error: error.message })
    return reply.code(201).send(data)
  })

  // GET /api/v1/dogs/:id — Detall d'un gos
  fastify.get('/:id', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { data, error } = await supabase
      .from('dogs')
      .select('*, device_health(*)')
      .eq('id', req.params.id)
      .eq('owner_id', req.user.sub)
      .single()

    if (error || !data) return reply.code(404).send({ error: 'Gos no trobat' })
    return data
  })

  // PATCH /api/v1/dogs/:id — Actualitzar dades d'un gos
  fastify.patch('/:id', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const parsed = DogCreateSchema.partial().safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    const { data, error } = await supabase
      .from('dogs')
      .update(parsed.data)
      .eq('id', req.params.id)
      .eq('owner_id', req.user.sub)
      .select()
      .single()

    if (error || !data) return reply.code(404).send({ error: 'Gos no trobat' })
    return data
  })
}
