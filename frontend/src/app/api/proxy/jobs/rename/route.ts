import { NextRequest } from 'next/server'

export const runtime = 'nodejs'

function getToken(req: NextRequest) {
  const h = req.headers.get('authorization') || ''
  const [, token] = h.split(' ')
  return token || ''
}

export async function POST(req: NextRequest) {
  try {
    const backendBase = process.env.RENAMER_API_BASE
    const apiKey = process.env.JOB_PERSONAL_API_KEY

    if (!backendBase || !apiKey) {
      return new Response(JSON.stringify({ error: 'Server not configured' }), { status: 500 })
    }

    const token = getToken(req)
    if (!token) return new Response(JSON.stringify({ error: 'missing_token' }), { status: 401 })

    // read files count from incoming form data
    const formData = await req.formData()
    const filesCount = Array.from(formData.getAll('files')).length

    // check credits first
    const creditsRes = await fetch(new URL('/api/credits', req.url), {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!creditsRes.ok) {
      return new Response(JSON.stringify({ error: 'credits_check_failed' }), { status: 500 })
    }
    const { credits } = await creditsRes.json()
    if (typeof credits === 'number' && credits < filesCount) {
      return new Response(JSON.stringify({ error: 'insufficient_credits', need: filesCount, has: credits }), { status: 402 })
    }

    // forward to backend
    const upstream = await fetch(`${backendBase}/v1/jobs/rename`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: formData
    })

    const contentType = upstream.headers.get('content-type') || 'application/json'
    const body = await upstream.text()

    return new Response(body, {
      status: upstream.status,
      headers: { 'content-type': contentType }
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Proxy error' }), { status: 500 })
  }
} 