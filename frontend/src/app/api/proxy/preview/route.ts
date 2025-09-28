import { NextRequest } from 'next/server'
import sharp from 'sharp'

export const runtime = 'nodejs'

async function upscaleFileIfNeeded(file: File): Promise<File> {
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const meta = await sharp(buf).metadata()
    const w = meta.width || 0
    const h = meta.height || 0
    if (!w || !h) return file

    // Ensure shortest side >= 224
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
    const u8 = new Uint8Array(out)
    const blob = new Blob([u8], { type: file.type })
    return new File([blob], file.name, { type: file.type })
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

    const formData = await req.formData()
    const origFile = formData.get('file') as File | null
    const prompt = formData.get('prompt')

    const fd = new FormData()
    if (origFile) {
      const upscaled = await upscaleFileIfNeeded(origFile)
      fd.append('file', upscaled)
    }
    if (typeof prompt === 'string') fd.append('prompt', prompt)

    const upstream = await fetch(`${backendBase}/v1/preview`, {
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