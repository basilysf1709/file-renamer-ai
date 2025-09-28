import { NextRequest } from 'next/server'
import sharp from 'sharp'

export const runtime = 'nodejs'

function getToken(req: NextRequest) {
  const h = req.headers.get('authorization') || ''
  const [, token] = h.split(' ')
  return token || ''
}

async function upscaleFileIfNeeded(file: File): Promise<File> {
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const meta = await sharp(buf).metadata()
    const w = meta.width || 0
    const h = meta.height || 0
    if (!w || !h) return file

    const minSide = 224
    const scale = Math.max(minSide / w, minSide / h, 1)
    const newW = Math.max(1, Math.ceil(w * scale))
    const newH = Math.max(1, Math.ceil(h * scale))

    let img = sharp(buf).resize({ width: newW, height: newH })
    const targetW = Math.ceil(newW / 28) * 28
    const targetH = Math.ceil(newH / 28) * 28
    const padRight = Math.max(0, targetW - newW)
    const padBottom = Math.max(0, targetH - newH)
    if (padRight || padBottom) {
      img = img.extend({ top: 0, left: 0, right: padRight, bottom: padBottom, background: { r: 255, g: 255, b: 255, alpha: 1 } })
    }
    const out = await img.toBuffer()
    return new File([out], file.name, { type: file.type })
  } catch {
    return file
  }
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

    // read files from incoming form data
    const formData = await req.formData()
    const incomingFiles = Array.from(formData.getAll('files')) as File[]
    const filesCount = incomingFiles.length

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

    // rebuild form data with upscaled files
    const fd = new FormData()
    for (const f of incomingFiles) {
      const up = await upscaleFileIfNeeded(f)
      fd.append('files', up)
    }
    const prompt = formData.get('prompt')
    if (typeof prompt === 'string') fd.append('prompt', prompt)

    // forward to backend
    const upstream = await fetch(`${backendBase}/v1/jobs/rename`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: fd
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