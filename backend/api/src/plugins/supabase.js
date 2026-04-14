// ── Supabase client (service role — backend only) ─────────────
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY han d\'estar definits')
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
})
