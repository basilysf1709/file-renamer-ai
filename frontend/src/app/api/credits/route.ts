import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const service = process.env.SUPABASE_SERVICE_KEY || ''
const supabase = createClient(url, service)

export const runtime = 'nodejs'

function getToken(req: NextRequest) {
  const h = req.headers.get('authorization') || ''
  const [, token] = h.split(' ')
  return token || ''
}

function envOk() {
  return Boolean(url && service)
}

async function getOrCreateProfile(userId: string, email?: string) {
  // Use array select + limit(1) to avoid single() coercion issues
  const sel = await supabase
    .from('profiles')
    .select('id, email, credits, created_at')
    .eq('id', userId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (sel.error) {
    console.error('profiles select error:', sel.error.message)
    throw new Error(sel.error.message)
  }

  const row = Array.isArray(sel.data) && sel.data.length > 0 ? sel.data[0] : null
  if (row) return row

  // Create default row with 10 credits
  const ins = await supabase
    .from('profiles')
    .upsert({ id: userId, email: email || null, credits: 10 }, { onConflict: 'id' })
    .select('id, email, credits, created_at')
    .limit(1)

  if (ins.error) {
    console.error('profiles upsert error:', ins.error.message)
    throw new Error(ins.error.message)
  }

  const created = Array.isArray(ins.data) && ins.data.length > 0 ? ins.data[0] : { id: userId, email, credits: 10 }
  return created
}

export async function GET(req: NextRequest) {
  try {
    if (!envOk()) {
      return new Response(JSON.stringify({ error: 'env_missing', detail: 'Supabase URL or SERVICE_KEY missing on server' }), { status: 500 })
    }

    const token = getToken(req)
    if (!token) return new Response(JSON.stringify({ error: 'missing_token' }), { status: 401 })

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: 'invalid_token', detail: userErr?.message || 'No user' }), { status: 401 })
    }

    const prof = await getOrCreateProfile(userRes.user.id, userRes.user.email || undefined)
    return new Response(JSON.stringify({ credits: prof?.credits ?? 0 }), { status: 200 })
  } catch (e: any) {
    console.error('GET /api/credits error:', e?.message)
    return new Response(JSON.stringify({ error: 'internal_error', detail: e?.message || 'Failed' }), { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!envOk()) {
      return new Response(JSON.stringify({ error: 'env_missing', detail: 'Supabase URL or SERVICE_KEY missing on server' }), { status: 500 })
    }

    const token = getToken(req)
    if (!token) return new Response(JSON.stringify({ error: 'missing_token' }), { status: 401 })

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: 'invalid_token', detail: userErr?.message || 'No user' }), { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const amount = Math.max(0, Number(body?.amount ?? 1))

    const prof = await getOrCreateProfile(userRes.user.id, userRes.user.email || undefined)

    const newCredits = Math.max(0, (prof?.credits ?? 0) - amount)
    const upd = await supabase
      .from('profiles')
      .update({ credits: newCredits })
      .eq('id', userRes.user.id)

    if (upd.error) {
      console.error('profiles update error:', upd.error.message)
      return new Response(JSON.stringify({ error: 'profiles_update_failed', detail: upd.error.message }), { status: 500 })
    }

    return new Response(JSON.stringify({ credits: newCredits }), { status: 200 })
  } catch (e: any) {
    console.error('POST /api/credits error:', e?.message)
    return new Response(JSON.stringify({ error: 'internal_error', detail: e?.message || 'Failed' }), { status: 500 })
  }
} 