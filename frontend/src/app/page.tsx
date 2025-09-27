'use client'
import { useSession } from '@/store/useSession'
import { useEffect, useMemo, useState } from 'react'
import { Plus, SlidersHorizontal, Image as ImageIcon, Upload, Database, FolderOpen, Cloud } from 'lucide-react'


const API_KEY = process.env.JOB_PERSONAL_API_KEY

export default function Page() {
  const [files, setFiles] = useState<File[]>([])
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [userCredits, setUserCredits] = useState<number>(10) // Default credits
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  const hasFiles = files.length > 0
  const preview = useMemo(()=> files.slice(0, 10), [files])
  const hasMoreFiles = files.length > 10

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files || [])
    const imageFiles = selectedFiles.filter(file => file.type.startsWith('image/'))
    
    if (imageFiles.length !== selectedFiles.length) {
      setError('Only image files are supported')
    } else {
      setError(null)
    }
    
    setFiles(imageFiles)
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    const droppedFiles = Array.from(e.dataTransfer.files)
    const imageFiles = droppedFiles.filter(file => file.type.startsWith('image/'))
    
    if (imageFiles.length !== droppedFiles.length) {
      setError('Only image files are supported')
    } else {
      setError(null)
    }
    
    setFiles(imageFiles)
    setSuggestions([]) // Clear previous results
  }

  async function aiRenameAll() {
    if (!hasFiles) return
    setIsBusy(true)
    setError(null)
    
    try {
      // Create FormData for file upload
      const formData = new FormData()
      files.forEach(file => {
        formData.append('files', file)
      })
      formData.append('prompt', 'Generate professional, descriptive filenames for these images')
      
      // Submit batch job
      const jobResponse = await fetch(`${process.env.BACKEND_BASE}/v1/jobs/rename`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`
        },
        body: formData
      })
      
      if (!jobResponse.ok) {
        throw new Error(`Failed to create job: ${jobResponse.status}`)
      }
      
      const jobData = await jobResponse.json()
      const jobId = jobData.job_id
      setCurrentJobId(jobId)
      
      // Poll for results
      await pollJobResults(jobId)
      
    } catch (e: any) {
      setError(e?.message || 'AI rename failed')
    } finally { 
      setIsBusy(false) 
    }
  }
  
  async function pollJobResults(jobId: string) {
    const maxAttempts = 60 // 5 minutes max
    let attempts = 0
    
    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`${process.env.BACKEND_BASE}/v1/jobs/${jobId}/results`, {
          headers: {
            'Authorization': `Bearer ${API_KEY}`
          }
        })
        
        if (response.ok) {
          const results = await response.json()
          if (results.status === 'completed' && results.results) {
            setSuggestions(results.results.map((r: any) => ({
              id: r.index,
              original: r.original,
              suggested_name: r.suggested,
              error: r.status === 'error' ? r.error : null
            })))
            setUserCredits(prev => Math.max(0, prev - files.length))
            return
          }
        }
        
        // Wait 5 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 5000))
        attempts++
        
      } catch (e) {
        console.error('Polling error:', e)
        attempts++
      }
    }
    
    setError('Processing timed out. Please try again.')
  }



  async function downloadAll() {
    const validSuggestions = suggestions.filter(s => s.suggested_name && !s.error)
    if (validSuggestions.length === 0) return
    
    // Create a simple text file with the rename mappings
    const content = validSuggestions.map(s => 
      `${s.original} -> ${s.suggested_name}`
    ).join('\n')
    
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'rename-suggestions.txt'
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

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <div className="max-w-4xl mx-auto pt-16 pb-10 px-4 text-center">
        <div className="text-4xl md:text-5xl font-[var(--font-playfair)] leading-tight">
          File Renamer AI
        </div>
        <p className="mt-3 text-gray-600">Rename photos with AI. Pick a folder to begin.</p>
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
            />
          </label>
          {hasFiles && (
            <button onClick={clearFiles} disabled={isBusy} className="px-3 py-1.5 rounded-full border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
              Clear ({files.length})
            </button>
          )}
          <button onClick={aiRenameAll} disabled={isBusy || !hasFiles} className="px-3 py-1.5 rounded-full border border-gray-200 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2">
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
          className={`bg-white border-2 border-dashed rounded-2xl p-6 transition-colors ${
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
            {isBusy && <div className="text-sm text-gray-500">Loading…</div>}
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
                {isBusy ? 'Processing images…' : 'Drop image files here or click "Select Images" to upload.'}
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
    </div>
  )
}
