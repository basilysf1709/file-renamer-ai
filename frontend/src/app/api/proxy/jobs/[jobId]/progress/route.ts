import { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  try {
    const backendBase = process.env.RENAMER_API_BASE
    const apiKey = process.env.JOB_PERSONAL_API_KEY

    if (!backendBase || !apiKey) {
      return new Response(JSON.stringify({ error: 'Server not configured' }), { status: 500 })
    }

    const { jobId } = await context.params

    const upstream = await fetch(`${backendBase}/v1/jobs/${jobId}/progress`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    })

    const contentType = upstream.headers.get('content-type') || 'application/json'
    const body = await upstream.text()

    return new Response(body, { status: upstream.status, headers: { 'content-type': contentType } })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Proxy error' }), { status: 500 })
  }
} 