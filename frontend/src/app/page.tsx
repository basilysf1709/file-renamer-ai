'use client'
import { useSession } from '@/store/useSession'
import { initPicker } from '@/lib/google'
import { useEffect, useMemo, useState } from 'react'
import { Plus, SlidersHorizontal, Image as ImageIcon } from 'lucide-react'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_BASE!

export default function Page() {
  const { accessToken, folderId, files, suggestions, set } = useSession()
  const [isBusy, setIsBusy] = useState(false)
  const [recursive, setRecursive] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hasFiles = files.length > 0
  const preview = useMemo(()=> files.slice(0, 9), [files])

  function signIn() {
    const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      scope: 'https://www.googleapis.com/auth/drive',
      callback: (resp: any) => resp?.access_token && set({ accessToken: resp.access_token })
    })
    tokenClient.requestAccessToken()
  }

  async function listImages(folderIdOverride?: string) {
    const fid = folderIdOverride || folderId
    if (!accessToken || !fid) return
    setIsBusy(true)
    setError(null)
    try {
      const r = await fetch(`${BACKEND}/list_images`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken, folder_id: fid, recursive })
      })
      if (!r.ok) throw new Error(`list_images ${r.status}`)
      const j = await r.json()
      set({ files: j.files })
    } catch (e:any) {
      setError(e?.message || 'Failed to list images')
    } finally { setIsBusy(false) }
  }

  function pickFolder() {
    if (!accessToken) return alert('Sign in first')
    initPicker(accessToken, async (fid) => {
      set({ folderId: fid })
      await listImages(fid)
    })
  }

  useEffect(() => {
    if (accessToken && folderId && files.length === 0) {
      listImages()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, folderId])

  async function aiRenameAll() {
    if (!hasFiles) return
    setIsBusy(true)
    setError(null)
    try {
      const sRes = await fetch(`${BACKEND}/suggest_names`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken, files })
      })
      const s = await sRes.json()
      set({ suggestions: s.items })
      const errs = (s.items || []).filter((x:any)=>x.error)
      const many401 = errs.length > 0 && errs.every((x:any)=> String(x.error).includes('Gemini error 401') || String(x.error).includes('UNAUTHENTICATED'))
      if (many401) {
        setError('Gemini auth failed: use a Google AI Studio (Generative Language API) key on the backend.')
      }
    } catch (e:any) {
      setError(e?.message || 'AI rename failed')
    } finally { setIsBusy(false) }
  }

  async function downloadAll() {
    const items = (suggestions || []).filter((s:any)=>s.suggested_name).map((s:any)=>({ id: s.id, name: s.suggested_name }))
    if (items.length === 0) return
    setIsBusy(true)
    setError(null)
    try {
      const r = await fetch(`${BACKEND}/download_zip`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken, items })
      })
      if (!r.ok) throw new Error(`download_zip ${r.status}`)
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'renamed-images.zip'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e:any) {
      setError(e?.message || 'Download failed')
    } finally { setIsBusy(false) }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <div className="max-w-4xl mx-auto pt-16 pb-10 px-4 text-center">
        <div className="text-4xl md:text-5xl font-[var(--font-playfair)] leading-tight">
          How’s it going?
        </div>
        <p className="mt-3 text-gray-600">Rename Drive photos with AI. Pick a folder to begin.</p>
      </div>

      {/* Controls */}
      <div className="max-w-3xl mx-auto px-4">
        {/* <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
          <div className="flex items-center px-4 py-3">
            <button disabled={isBusy} className="w-9 h-9 grid place-items-center rounded-lg border border-gray-200 mr-2 hover:bg-gray-50 disabled:opacity-50"><Plus className="w-4 h-4"/></button>
            <button disabled={isBusy} className="w-9 h-9 grid place-items-center rounded-lg border border-gray-200 mr-2 hover:bg-gray-50 disabled:opacity-50"><SlidersHorizontal className="w-4 h-4"/></button>
            <div className="flex-1" />
          </div>
        </div> */}

        {/* Quick chips */}
        <div className="flex flex-wrap items-center gap-2 justify-center mt-4 text-sm">
          <button onClick={signIn} disabled={isBusy} className="px-3 py-1.5 rounded-full border border-gray-200 hover:bg-gray-50 disabled:opacity-50">Sign in</button>
          <button onClick={pickFolder} disabled={isBusy} className="px-3 py-1.5 rounded-full border border-gray-200 hover:bg-gray-50 disabled:opacity-50">Pick folder</button>
          <button onClick={aiRenameAll} disabled={isBusy || !hasFiles} className="px-3 py-1.5 rounded-full border border-gray-200 hover:bg-gray-50 disabled:opacity-50">AI rename</button>
          <label className="px-3 py-1.5 rounded-full border border-gray-200 hover:bg-gray-50 cursor-pointer">
            <input type="checkbox" disabled={isBusy} checked={recursive} onChange={(e)=>setRecursive(e.target.checked)} className="mr-2"/>
            Recursive
          </label>
        </div>

        {error && (
          <div className="mt-3 text-sm text-red-600 text-center">{error}</div>
        )}
      </div>

      {/* Preview */}
      <div className="max-w-5xl mx-auto px-4 mt-10 pb-16">
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="font-medium text-gray-900 flex items-center gap-2"><ImageIcon className="w-5 h-5"/> Images {hasFiles ? `(${files.length})` : ''}</div>
            {isBusy && <div className="text-sm text-gray-500">Loading…</div>}
          </div>
          {hasFiles ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {preview.map((f:any)=> (
                <div key={f.id} className="border border-gray-200 rounded-xl p-4">
                  <div className="font-medium text-gray-900 truncate">{f.name}</div>
                  <div className="text-sm text-gray-500 mt-1">{f.mimeType}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">{isBusy ? 'Loading images…' : 'Nothing yet. Pick a folder to load images.'}</div>
          )}

          {suggestions?.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium text-gray-900">Renamed files</div>
                <button onClick={downloadAll} disabled={isBusy} className="px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-black disabled:opacity-50">Download all</button>
              </div>
              <ul className="space-y-2">
                {suggestions.map((s:any)=> (
                  <li key={s.id} className="flex items-center justify-between border rounded-lg px-4 py-2">
                    <div className="min-w-0">
                      <div className="text-sm text-gray-500 truncate">{files.find((f:any)=>f.id===s.id)?.name}</div>
                      <div className="font-medium text-gray-900 truncate">{s.suggested_name || s.error}</div>
                    </div>
                    {s.suggested_name && (
                      <a href={`${BACKEND}/download?access_token=${encodeURIComponent(accessToken || '')}&id=${encodeURIComponent(s.id)}&name=${encodeURIComponent(s.suggested_name)}`} className="ml-4 px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-black">Download</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
