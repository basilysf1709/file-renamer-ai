'use client'
import { useSession } from '@/store/useSession'
import { initPicker } from '@/lib/google'
import { useMemo, useState } from 'react'
import { Search, Plus, SlidersHorizontal, FolderOpen, Bot, Image as ImageIcon } from 'lucide-react'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_BASE!

export default function Page() {
  const { accessToken, folderId, files, suggestions, set } = useSession()
  const [searchQuery, setSearchQuery] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [recursive, setRecursive] = useState(true)
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

  function pickFolder() {
    if (!accessToken) return alert('Sign in first')
    initPicker(accessToken, (fid) => set({ folderId: fid }))
  }

  async function doSearch() {
    if (!accessToken) return signIn()
    if (!searchQuery.trim()) return
    setIsBusy(true)
    try {
      const r = await fetch(`${BACKEND}/search_images`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken, search_query: searchQuery, max_results: 100 })
      })
      const j = await r.json()
      set({ files: j.files })
    } finally { setIsBusy(false) }
  }

  async function listImages() {
    if (!accessToken || !folderId) return
    setIsBusy(true)
    try {
      const r = await fetch(`${BACKEND}/list_images`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken, folder_id: folderId, recursive })
      })
      const j = await r.json()
      set({ files: j.files })
    } finally { setIsBusy(false) }
  }

  async function aiRenameAll() {
    if (!hasFiles) return
    setIsBusy(true)
    try {
      const sRes = await fetch(`${BACKEND}/suggest_names`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken, files })
      })
      const s = await sRes.json()
      set({ suggestions: s.items })
      const items = s.items.filter((x:any)=>!x.error).map((x:any)=>({ id: x.id, new_name: x.suggested_name }))
      if (items.length === 0) return
      const rRes = await fetch(`${BACKEND}/rename`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken, items })
      })
      await rRes.json()
      if (folderId) await listImages()
    } finally { setIsBusy(false) }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <div className="max-w-4xl mx-auto pt-16 pb-10 px-4 text-center">
        <div className="text-4xl md:text-5xl font-[var(--font-playfair)] leading-tight">
          How’s it going?
        </div>
        <p className="mt-3 text-gray-600">Rename Drive photos with AI. Search or pick a folder to begin.</p>
      </div>
      {/* {!accessToken && (
        <div className="flex justify-center -mt-2 mb-6">
          <button onClick={signIn} className="px-6 py-3 rounded-full bg-blue-600 text-white hover:bg-blue-700">
            Sign in with Google
          </button>
        </div>
      )} */}

      {/* Command Box */}
      <div className="max-w-3xl mx-auto px-4">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
          <div className="flex items-center px-4 py-3">
            <button className="w-9 h-9 grid place-items-center rounded-lg border border-gray-200 mr-2 hover:bg-gray-50"><Plus className="w-4 h-4"/></button>
            <button className="w-9 h-9 grid place-items-center rounded-lg border border-gray-200 mr-2 hover:bg-gray-50"><SlidersHorizontal className="w-4 h-4"/></button>
            <div className="flex-1 flex items-center">
              <Search className="w-5 h-5 text-gray-400 mr-3"/>
              <input value={searchQuery} onChange={(e)=>setSearchQuery(e.target.value)} onKeyDown={(e)=> e.key==='Enter' && doSearch()} placeholder="How can I help you today?" className="w-full bg-transparent outline-none text-gray-900 placeholder-gray-500" />
            </div>
            <button onClick={doSearch} className="ml-3 px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-black">Search</button>
          </div>
        </div>

        {/* Quick chips */}
        <div className="flex flex-wrap items-center gap-2 justify-center mt-4 text-sm">
          <button onClick={signIn} className="px-3 py-1.5 rounded-full border border-gray-200 hover:bg-gray-50">Sign in</button>
          <button onClick={pickFolder} className="px-3 py-1.5 rounded-full border border-gray-200 hover:bg-gray-50">Pick folder</button>
          <button onClick={listImages} className="px-3 py-1.5 rounded-full border border-gray-200 hover:bg-gray-50">List images</button>
          <button onClick={aiRenameAll} className="px-3 py-1.5 rounded-full border border-gray-200 hover:bg-gray-50">AI rename</button>
          <label className="px-3 py-1.5 rounded-full border border-gray-200 hover:bg-gray-50 cursor-pointer">
            <input type="checkbox" checked={recursive} onChange={(e)=>setRecursive(e.target.checked)} className="mr-2"/>
            Recursive
          </label>
        </div>
      </div>

      {/* Preview */}
      <div className="max-w-5xl mx-auto px-4 mt-10 pb-16">
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="font-medium text-gray-900 flex items-center gap-2"><ImageIcon className="w-5 h-5"/> Images {hasFiles ? `(${files.length})` : ''}</div>
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
            <div className="text-sm text-gray-500">Nothing yet. Try search or pick a folder.</div>
          )}
        </div>
      </div>
    </div>
  )
}
