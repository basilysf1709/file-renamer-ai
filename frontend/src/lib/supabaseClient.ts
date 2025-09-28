import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY as string

if (!SUPABASE_URL || !SUPABASE_KEY) {
  // eslint-disable-next-line no-console
  console.warn('Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_KEY')
}

export const supabase = createClient(SUPABASE_URL || '', SUPABASE_KEY || '') 