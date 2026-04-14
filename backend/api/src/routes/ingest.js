// ============================================================
// ingest.js — Ruta d'ingestió de dades del dispositiu BLE
// POST /api/v1/ingest/readings
// Massiu Soft SL
// ============================================================
import { z } from 'zod'
import { supabase } from '../plugins/supabase.js'

// Schema de validació d'un batch de lectures
const ReadingSchema = z.object({
  ts:           z.number().int(),       // Unix timestamp (s)
  acc_x:        z.number(),
  acc_y:        z.number(),
  acc_z:        z.number(),
  gyro_x:       z.number(),
  gyro_y:       z.number(),
  gyro_z:       z.number(),
  temp_surface: z.number().min(-10).max(50),
  battery_pct:  z.number().int().min(0).max(100),
  seq:          z.number().int().min(0).max(255)
})

const BatchSchema = z.object({
  dog_id:    z.string().uuid(),
  device_id: z.string(),
  readings:  z.array(ReadingSchema).min(1).max(200)
})

export async function ingestRoutes(fastify) {

  // POST /api/v1/ingest/readings
  // L'app mòbil envia un batch de lectures del dispositiu BLE
  fastify.post('/readings', {
    onRequest: [fastify.authenticate]
  }, async (request, reply) => {
    const userId = request.user.sub

    // Validar payload
    const parseResult = BatchSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Payload invàlid',
        details: parseResult.error.flatten()
      })
    }

    const { dog_id, device_id, readings } = parseResult.data

    // Verificar que el gos pertany a l'usuari autenticat
    const { data: dog, error: dogError } = await supabase
      .from('dogs')
      .select('id')
      .eq('id', dog_id)
      .eq('owner_id', userId)
      .single()

    if (dogError || !dog) {
      return reply.code(403).send({ error: 'Gos no trobat o accés denegat' })
    }

    // Convertir lectures al format de la taula
    const rows = readings.map(r => ({
      dog_id,
      ts:           new Date(r.ts * 1000).toISOString(),
      acc_x:        r.acc_x,
      acc_y:        r.acc_y,
      acc_z:        r.acc_z,
      gyro_x:       r.gyro_x,
      gyro_y:       r.gyro_y,
      gyro_z:       r.gyro_z,
      temp_surface: r.temp_surface,
      battery_pct:  r.battery_pct,
      seq:          r.seq
    }))

    // Inserir en batch (upsert per evitar duplicats per seq)
    const { error: insertError } = await supabase
      .from('sensor_readings')
      .upsert(rows, { onConflict: 'dog_id,ts', ignoreDuplicates: true })

    if (insertError) {
      fastify.log.error({ insertError }, 'Error inserint lectures')
      return reply.code(500).send({ error: 'Error guardant les dades' })
    }

    // Actualitzar device_health
    await supabase
      .from('device_health')
      .upsert({
        device_id,
        dog_id,
        last_seen_at: new Date().toISOString(),
        battery_pct: readings[readings.length - 1].battery_pct,
        is_online: true
      }, { onConflict: 'device_id' })

    return reply.code(201).send({
      ok:       true,
      ingested: rows.length
    })
  })
}
