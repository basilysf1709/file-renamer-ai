'use client'
import { useSession } from '@/store/useSession'
import { initPicker } from '@/lib/google'
import { useState } from 'react'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_BASE!

export default function Page() {
  const { accessToken, folderId, files, suggestions, set } = useSession()
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [recursive, setRecursive] = useState(false)

  async function signIn() {
    const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      scope: 'https://www.googleapis.com/auth/drive',
      callback: (resp: any) => {
        console.log('Token received:', resp)
        set({ accessToken: resp.access_token })
      }
    })
    tokenClient.requestAccessToken()
  }

  function pickFolder() {
    if (!accessToken) return alert('Sign in first')
    initPicker(accessToken, (fid) => set({ folderId: fid }))
  }

  async function searchImages() {
    if (!accessToken) return alert('Sign in first')
    if (!searchQuery.trim()) return alert('Enter a search query')
    
    setIsSearching(true)
    try {
      const r = await fetch(`${BACKEND}/search_images`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          access_token: accessToken, 
          search_query: searchQuery,
          max_results: 50
        })
      })
      const j = await r.json()
      set({ files: j.files })
    } catch (error) {
      alert('Search failed: ' + error)
    } finally {
      setIsSearching(false)
    }
  }

  async function listImages() {
    if (!accessToken || !folderId) return alert('Sign in and select folder first')
    
    setIsSearching(true)
    try {
      const r = await fetch(`${BACKEND}/list_images`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          access_token: accessToken, 
          folder_id: folderId,
          recursive: recursive
        })
      })
      const j = await r.json()
      set({ files: j.files })
    } catch (error) {
      alert('Failed to list images: ' + error)
    } finally {
      setIsSearching(false)
    }
  }

  async function suggestAndRenameAll() {
    if (files.length === 0) return alert('No images to process')
    
    setIsProcessing(true)
    try {
      // Generate suggestions
      const suggestRes = await fetch(`${BACKEND}/suggest_names`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken, files })
      })
      const suggestions = await suggestRes.json()
      set({ suggestions: suggestions.items })
      
      // Rename all files
      const items = suggestions.items
        .filter((x: any) => !x.error)
        .map((x: any) => ({ id: x.id, new_name: x.suggested_name }))
      
      if (items.length === 0) {
        alert('No valid suggestions to rename')
        return
      }
      
      const renameRes = await fetch(`${BACKEND}/rename`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken, items })
      })
      const renameResults = await renameRes.json()
      
      const successCount = renameResults.results.filter((r: any) => !r.error).length
      const errorCount = renameResults.results.filter((r: any) => r.error).length
      
      alert(`Rename completed!\n✅ Success: ${successCount}\n❌ Errors: ${errorCount}`)
      
      // Refresh the file list
      if (folderId) {
        await listImages()
      } else if (searchQuery) {
        await searchImages()
      }
      
    } catch (error) {
      alert('Processing failed: ' + error)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-semibold">Drive AI Renamer</h1>
      
      {!accessToken && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
          <h2 className="font-semibold text-yellow-800">Setup Required</h2>
          <p className="text-yellow-700">
            Make sure you've added your Google Client ID to the environment variables.
            The application uses Google Identity Services (GIS) for authentication.
          </p>
        </div>
      )}
      
      {/* Authentication */}
      <div className="flex gap-2">
        <button 
          onClick={signIn}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Sign In with Google
        </button>
      </div>
      
      {accessToken && (
        <>
          {/* Search Section */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Search Images</h2>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Search for images (e.g., 'vacation photos', 'screenshots')"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button 
                onClick={searchImages}
                disabled={isSearching || !searchQuery.trim()}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400"
              >
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </div>
          </div>
          
          {/* Folder Selection Section */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Or Select Folder</h2>
            <div className="flex gap-2 mb-4">
              <button 
                onClick={pickFolder}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Pick Folder
              </button>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={recursive}
                  onChange={(e) => setRecursive(e.target.checked)}
                />
                <span>Include subfolders (recursive)</span>
              </label>
            </div>
            {folderId && (
              <button 
                onClick={listImages}
                disabled={isSearching}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400"
              >
                {isSearching ? 'Loading...' : 'List Images'}
              </button>
            )}
          </div>
          
          {/* Bulk Processing */}
          {files.length > 0 && (
            <div className="p-4 bg-orange-50 rounded-lg">
              <h2 className="text-xl font-semibold mb-4">
                Found {files.length} Images
              </h2>
              <button 
                onClick={suggestAndRenameAll}
                disabled={isProcessing}
                className="px-6 py-3 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400 font-semibold"
              >
                {isProcessing ? 'Processing...' : `🤖 AI Rename All ${files.length} Images`}
              </button>
              <p className="text-sm text-gray-600 mt-2">
                This will generate AI suggestions and rename all images automatically.
              </p>
            </div>
          )}
          
          {/* Status */}
          {accessToken && (
            <div className="p-4 bg-green-50 border border-green-200 rounded">
              <strong>✅ Signed in successfully!</strong>
            </div>
          )}
          
          {folderId && (
            <div className="p-4 bg-blue-50 rounded">
              <strong>Selected Folder:</strong> {folderId}
            </div>
          )}
          
          {/* Files Preview */}
          {files.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Images ({files.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {files.slice(0, 12).map((file: any) => (
                  <div key={file.id} className="p-3 border rounded bg-white">
                    <div className="font-medium truncate">{file.name}</div>
                    <div className="text-sm text-gray-500">{file.mimeType}</div>
                  </div>
                ))}
              </div>
              {files.length > 12 && (
                <p className="text-gray-500 text-sm">... and {files.length - 12} more</p>
              )}
            </div>
          )}
          
          {/* Suggestions Preview */}
          {suggestions.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Recent Suggestions</h2>
              <div className="space-y-2">
                {suggestions.slice(0, 10).map((item: any) => (
                  <div key={item.id} className="p-3 border rounded bg-white">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{item.old_name}</div>
                        {item.error ? (
                          <div className="text-red-600 text-sm">Error: {item.error}</div>
                        ) : (
                          <div className="text-green-600 text-sm">→ {item.suggested_name}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  )
}
