'use client'
import { useSession } from '@/store/useSession'
import { useEffect, useMemo, useState } from 'react'
import { Plus, SlidersHorizontal, Image as ImageIcon, Upload, Database, FolderOpen, Cloud, Cog } from 'lucide-react'
import JSZip from 'jszip'
import { supabase } from '../lib/supabaseClient'
import { useRef } from 'react'


const API_KEY = process.env.JOB_PERSONAL_API_KEY

export default function Page() {
  const [files, setFiles] = useState<File[]>([])
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [userCredits, setUserCredits] = useState<number>(10) // Default credits
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  const [progress, setProgress] = useState<{jobId?: string; completed: number; total: number; percent: number; latest?: any[]}>({ completed: 0, total: 0, percent: 0 })
  const hasFiles = files.length > 0
  const preview = useMemo(()=> files.slice(0, 10), [files])
  const hasMoreFiles = files.length > 10
  const [authReady, setAuthReady] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const MAX_FILES = 10


  useEffect(() => {
    // allow directory selection on browsers that support it
    if (fileInputRef.current) {
      try { fileInputRef.current.setAttribute('webkitdirectory', '') } catch {}
      try { fileInputRef.current.setAttribute('directory', '') } catch {}
    }
    let unsub: any
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      try { console.log('[auth] getSession', { hasSession: !!data.session, user: data.session?.user?.email }) } catch {}
      if (!data.session) {
        try { console.warn('[auth] no session, redirecting to /login') } catch {}
        if (typeof window !== 'undefined') window.location.href = '/login'
        return
      }
      setAuthReady(true)
      // Fetch credits
      const creditsRes = await fetch('/api/credits', {
        headers: { Authorization: `Bearer ${data.session.access_token}` }
      }).then(r=>{
        try { console.log('[auth] /api/credits status', r.status) } catch {}
        return r.ok ? r.json() : { credits: userCredits }
      }).catch((e)=>{ try { console.error('[auth] /api/credits error', e?.message) } catch {}; return { credits: userCredits } })
      if (typeof creditsRes?.credits === 'number') setUserCredits(creditsRes.credits)

      unsub = supabase.auth.onAuthStateChange(async (_event, session) => {
        try { console.log('[auth] onAuthStateChange', { hasSession: !!session }) } catch {}
        if (!session && typeof window !== 'undefined') window.location.href = '/login'
      })
    })()
    return () => { if (unsub && unsub.subscription) unsub.subscription.unsubscribe() }
  }, [])

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files || [])
    const imageFiles = selectedFiles.filter(file => file.type.startsWith('image/'))
    
    let list = imageFiles
    if (imageFiles.length > MAX_FILES) {
      list = imageFiles.slice(0, MAX_FILES)
      setError(`You can upload up to ${MAX_FILES} images at a time. Using the first ${MAX_FILES}.`)
    } else {
      setError(null)
    }
    
    setFiles(list)
    setSuggestions([]) // Clear previous results
  }

  function clearFiles() {
    setFiles([])
    setSuggestions([])
    setCurrentJobId(null)
    setError(null)
  }

  // Handle drag and drop for files
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  // Utilities for recursive folder traversal via drag & drop (webkit entries)
  const readFileFromEntry = (fileEntry: any) => new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject))
  const readEntries = (dirReader: any) => new Promise<any[]>((resolve) => dirReader.readEntries((entries: any[]) => resolve(entries), () => resolve([])))
  const traverseEntry = async (entry: any): Promise<File[]> => {
    if (!entry) return []
    if (entry.isFile) {
      try { const f = await readFileFromEntry(entry); return f.type.startsWith('image/') ? [f] : [] } catch { return [] }
    }
    if (entry.isDirectory) {
      const reader = entry.createReader()
      const out: File[] = []
      while (true) {
        const entries = await readEntries(reader)
        if (!entries || entries.length === 0) break
        for (const e of entries) {
          const sub = await traverseEntry(e)
          out.push(...sub)
        }
      }
      return out
    }
    return []
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    try {
      const dt = e.dataTransfer
      const items = Array.from(dt.items || [])
      let collected: File[] = []
      if (items.length && (items[0] as any).webkitGetAsEntry) {
        // Traverse directory entries
        for (const it of items) {
          if (it.kind !== 'file') continue
          const entry = (it as any).webkitGetAsEntry()
          if (entry) {
            const files = await traverseEntry(entry)
            collected.push(...files)
          } else {
            const f = it.getAsFile()
            if (f && f.type.startsWith('image/')) collected.push(f)
          }
          if (collected.length >= MAX_FILES) break
        }
        // Also include plain files to handle multi-file drops where entries may miss some
        const basicFiles = Array.from(dt.files || []).filter(f => f.type.startsWith('image/'))
        const seen = new Set(collected.map(f => `${f.name}:${f.size}:${(f as any).lastModified || 0}`))
        for (const f of basicFiles) {
          const key = `${f.name}:${f.size}:${(f as any).lastModified || 0}`
          if (!seen.has(key)) collected.push(f)
        }
      } else {
        // Fallback: plain files (no recursion)
        const droppedFiles = Array.from(dt.files || [])
        collected = droppedFiles.filter(file => file.type.startsWith('image/'))
      }
      if (collected.length === 0) {
        setError('No images found in the dropped folder')
        return
      }
      // Merge with existing selection and enforce cap
      let merged = [...files, ...collected]
      if (merged.length > MAX_FILES) {
        merged = merged.slice(0, MAX_FILES)
        setError(`You can upload up to ${MAX_FILES} images at a time. Using the first ${MAX_FILES}.`)
      } else {
        setError(null)
      }
      setFiles(merged)
      setSuggestions([])
    } catch (err: any) {
      setError(err?.message || 'Failed to read dropped folder')
    }
  }

  async function previewFirst() {
    if (files.length === 0) return
    setIsBusy(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', files[0])
      formData.append('prompt', 'Generate a short, descriptive filename that captures the main subject and context')
      const r = await fetch('/api/proxy/preview', { method: 'POST', body: formData })
      if (!r.ok) throw new Error(`preview ${r.status}`)
      const j = await r.json()
      setSuggestions([{ original: j.original, suggested_name: j.suggested }])
    } catch (e: any) {
      setError(e?.message || 'Preview failed')
    } finally { setIsBusy(false) }
  }

  async function aiRenameAllWithPrompt(userPrompt: string) {
    if (!hasFiles) return
    setIsBusy(true)
    setError(null)
    setProgress({ completed: 0, total: files.length, percent: 0 })
    
    try {
      const formData = new FormData()
      files.forEach(file => formData.append('files', file))
      formData.append('prompt', userPrompt)
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) {
        setError('Please sign in to continue')
        setIsBusy(false)
        return
      }
      const jobResponse = await fetch(`/api/proxy/jobs/rename`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      if (!jobResponse.ok) {
        if (jobResponse.status === 402) {
          setError('Please add credits to continue')
          setIsBusy(false)
          return
        }
        if (jobResponse.status === 401) {
          setError('Please sign in to continue')
          setIsBusy(false)
          return
        }
        throw new Error(`Request failed: ${jobResponse.status}`)
      }
      const jobData = await jobResponse.json()
      const jobId = jobData.job_id
      setCurrentJobId(jobId)
      setProgress(p => ({ ...p, jobId }))
      await pollJobWithProgress(jobId)
    } catch (e: any) {
      setError(e?.message || 'AI rename failed')
    } finally {
      setIsBusy(false)
    }
  }

  async function aiRenameAll() {
    await aiRenameAllWithPrompt('Generate professional, descriptive filenames for these images')
  }
  
  async function pollJobWithProgress(jobId: string) {
    const maxAttempts = 120 // up to 10 minutes
    let attempts = 0
    
    while (attempts < maxAttempts) {
      try {
        // progress
        const p = await fetch(`/api/proxy/jobs/${jobId}/progress`)
        if (p.ok) {
          const pj = await p.json()
          setProgress(prev => {
            const prevTotal = prev?.total || files.length
            const total = pj.total && pj.total > 0 ? pj.total : prevTotal
            const completed = Math.max(prev?.completed || 0, pj?.completed || 0)
            const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0
            return { jobId, completed, total, percent, latest: pj.latest_results }
          })
        }
        
        // results
        const r = await fetch(`/api/proxy/jobs/${jobId}/results`)
        if (r.ok) {
          const results = await r.json()
          if (results.status === 'completed' && results.results) {
            setSuggestions(results.results.map((x: any) => ({
              id: x.index,
              original: x.original,
              suggested_name: x.suggested,
              error: x.status === 'error' ? x.error : null
            })))
            // decrement credits server-side
            const { data } = await supabase.auth.getSession()
            const token = data.session?.access_token
            if (token) {
              const dec = await fetch('/api/credits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ amount: files.length })
              }).then(r=>r.ok?r.json():null).catch(()=>null)
              if (dec && typeof dec.credits === 'number') setUserCredits(dec.credits)
            }
            return
          }
        }
        
        await new Promise(res => setTimeout(res, 5000))
        attempts++
      } catch (e) {
        attempts++
        await new Promise(res => setTimeout(res, 3000))
      }
    }
    setError('Processing timed out. Please try again.')
  }



  async function downloadAll() {
    const valid = suggestions.filter(s => s.suggested_name && !s.error)
    if (valid.length === 0) return

    const zip = new JSZip()
    const folder = zip.folder('renamed')
    if (!folder) return

    const KNOWN_EXTS = ['jpg','jpeg','png','webp','gif','bmp','tiff','tif','heic','heif','svg']
    const stripKnownExt = (name: string) => {
      const trimmed = name.trim().replace(/\.+$/, '')
      const dot = trimmed.lastIndexOf('.')
      if (dot > 0) {
        const ext = trimmed.slice(dot + 1).toLowerCase()
        if (KNOWN_EXTS.includes(ext)) return trimmed.slice(0, dot)
      }
      return trimmed
    }

    for (const s of valid) {
      let file: File | undefined
      if (typeof (s as any).id === 'number' && files[(s as any).id]) {
        file = files[(s as any).id]
      } else {
        file = files.find(f => f.name === s.original)
      }
      if (!file) continue

      const arrayBuf = await file.arrayBuffer()
      const extFromName = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : undefined
      let extFromMime = file.type.split('/')[1]?.toLowerCase()
      if (extFromMime === 'jpeg') extFromMime = 'jpg'
      if (extFromMime === 'svg+xml') extFromMime = 'svg'
      const ext = (extFromName || extFromMime || 'jpg').replace(/[^a-z0-9]/g, '')
      const base = stripKnownExt(String(s.suggested_name || 'image'))
      const newName = `${base}.${ext}`

      folder.file(newName, arrayBuf)
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(zipBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'renamed-images.zip'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function buyCredits(amount: number) {
    const stripeUrl = amount === 1000 
      ? 'https://buy.stripe.com/4gM3cv4Tzecx3q60ia6oo05'  // $10/month -> 1k credits
      : 'https://buy.stripe.com/4gM8wP5XDc4p2m28OG6oo06'  // $100/month -> 10k credits
    
    window.open(stripeUrl, '_blank')
  }

  async function signOutSupabase() {
    await supabase.auth.signOut()
    if (typeof window !== 'undefined') window.location.href = '/login'
  }

  function manageBilling() {
    // Stripe customer portal for cancellations/management
    const portal = process.env.NEXT_PUBLIC_BILLING_PORTAL_URL || 'https://billing.stripe.com/p/login/6oUdR9fyd8Sd6Cifd46oo00'
    if (typeof window !== 'undefined') window.open(portal, '_blank')
  }

  return (
    <div className="min-h-screen bg-white">
      {!authReady ? (
        <div className="max-w-4xl mx-auto pt-24 px-4 text-center text-sm text-gray-500">Checking authentication…</div>
      ) : (
      <>
      {/* Hero */}
      <div className="max-w-4xl mx-auto pt-16 pb-10 px-4 text-center relative">
        <div className="absolute right-4 top-4">
          <div className="relative">
            <button onClick={() => setMenuOpen(v=>!v)} className="p-2 rounded-full border hover:bg-gray-50">
              <Cog className="w-5 h-5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-44 bg-white border rounded-lg shadow">
                <button onClick={manageBilling} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">Manage billing</button>
                <button onClick={signOutSupabase} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">Sign out</button>
              </div>
            )}
          </div>
        </div>
        <div className="text-4xl md:text-5xl font-[var(--font-playfair)] leading-tight">
          File Renamer AI
        </div>
        <p className="mt-3 text-gray-600">Rename photos with AI. Drop in a folder to begin.</p>
      </div>
      {/* Controls */}
      <div className="max-w-3xl mx-auto px-4">
        {/* Quick chips */}
        <div className="flex flex-wrap items-center gap-2 justify-center mt-4 text-sm">
          <label className="px-3 py-1.5 rounded-full border border-gray-200 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4 text-blue-500" />
            Select Images
            <input 
              type="file" 
              multiple 
              accept="image/*" 
              onChange={handleFileSelect}
              className="hidden"
              disabled={isBusy}
              ref={fileInputRef}
            />
          </label>
          {hasFiles && (
            <button onClick={clearFiles} disabled={isBusy} className="px-3 py-1.5 rounded-full border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
              Clear ({files.length})
            </button>
          )}
          <button onClick={previewFirst} disabled={isBusy || !hasFiles || files.length !== 1} className="px-3 py-1.5 rounded-full border border-gray-200 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2" title={files.length > 1 ? 'Select a single image to preview' : undefined}>
            <SlidersHorizontal className="w-4 h-4" />
            Preview First
          </button>
          <button onClick={() => aiRenameAll()} disabled={isBusy || !hasFiles} className="px-3 py-1.5 rounded-full border border-gray-200 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4" />
            Rename Files
          </button>
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-full border border-green-200 bg-green-50 text-green-700">
              {userCredits} credits
            </div>
            <button 
              onClick={() => buyCredits(1000)} 
              className="px-3 py-1.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
            >
              1k credits - $10/month
            </button>
            <button 
              onClick={() => buyCredits(10000)} 
              className="px-3 py-1.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
            >
              10k credits - $100/month
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 text-sm text-red-600 text-center">{error}</div>
        )}
      </div>

      {/* Preview */}
      <div className="max-w-5xl mx-auto px-4 mt-10 pb-16">
        <div 
          className={`bg-white border-2 border-dashed rounded-2xl p-6 transition-colors relative ${
            isDragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="font-medium text-gray-900 flex items-center gap-2">
              <ImageIcon className="w-5 h-5"/> 
              Images {hasFiles ? `(${files.length})` : ''}
            </div>
            {isBusy && (
              <div className="text-sm text-gray-500 flex items-center gap-3">
                {currentJobId ? (
                  <>
                    <div className="w-40 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div className="bg-blue-500 h-2" style={{ width: `${progress.percent}%` }} />
                    </div>
                    <span>{progress.completed}/{progress.total}</span>
                  </>
                ) : 'Loading…'}
              </div>
            )}
          </div>
          {hasFiles ? (
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {preview.map((file, index) => (
                  <div key={index} className="border border-gray-200 rounded-xl p-4">
                    <div className="font-medium text-gray-900 truncate">{file.name}</div>
                    <div className="text-sm text-gray-500 mt-1">{file.type}</div>
                    <div className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB</div>
                  </div>
                ))}
              </div>
              {hasMoreFiles && (
                <div className="mt-4 text-center">
                  <div className="text-sm text-gray-500">
                    ... and {files.length - 10} more files
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <div className="text-sm text-gray-500">
                {isBusy ? 'Processing images…' : 'Drop images (jpg, jpeg, png, webp, gif, bmp, tiff, heic, heif, svg) here or click "Select Images". Folders supported.'}
              </div>
            </div>
          )}

          {suggestions?.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium text-gray-900">Renamed files</div>
                <button onClick={downloadAll} disabled={isBusy} className="px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-black disabled:opacity-50">Download all</button>
              </div>
              <ul className="space-y-2">
                {suggestions.map((s, index) => (
                  <li key={index} className="flex items-center justify-between border rounded-lg px-4 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-gray-500 truncate">{s.original}</div>
                      <div className="font-medium text-gray-900 truncate">{s.suggested_name || s.error}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  )
}
