// ============================================================
// src/lib/supabase.ts — Client Supabase per al dashboard web
// Massiu Soft SL
// ============================================================
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[Ernest] Variables VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY no definides. Utilitza .env local.')
}

export const supabase = createClient(
  SUPABASE_URL  ?? 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY ?? 'placeholder-key'
)
