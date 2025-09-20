'use client'
import { useSession } from '@/store/useSession'
import { initPicker } from '@/lib/google'
import { useState } from 'react'
import { Search, FolderOpen, Bot, AlertCircle, CheckCircle, Loader2, Command } from 'lucide-react'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_BASE!

export default function Page() {
  const { accessToken, folderId, files, suggestions, set } = useSession()
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [recursive, setRecursive] = useState(false)
  const [authError, setAuthError] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)

  async function signIn() {
    setAuthError('')
    try {
      const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        scope: 'https://www.googleapis.com/auth/drive',
        callback: (resp: any) => {
          console.log('Token received:', resp)
          if (resp.error) {
            setAuthError(`Authentication error: ${resp.error}`)
            return
          }
          set({ accessToken: resp.access_token })
        },
        error_callback: (error: any) => {
          console.error('Auth error:', error)
          if (error.type === 'access_denied') {
            setAuthError('Access denied. The app is in testing mode. Please add your email as a test user in Google Cloud Console.')
          } else {
            setAuthError(`Authentication failed: ${error.type}`)
          }
        }
      })
      tokenClient.requestAccessToken()
    } catch (error) {
      setAuthError(`Sign-in failed: ${error}`)
    }
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-gray-900">Drive AI Renamer</h1>
          <p className="text-gray-600">Intelligently rename your Google Drive images with AI</p>
        </div>

        {/* Authentication Error */}
        {authError && (
          <div className="bg-white border border-red-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-800">Authentication Issue</h3>
                <p className="text-red-700 mt-1">{authError}</p>
                <div className="mt-3 text-sm text-red-600">
                  <strong>Quick Fix:</strong>
                  <ol className="list-decimal list-inside mt-2 space-y-1">
                    <li>Go to <a href="https://console.cloud.google.com/" target="_blank" className="underline">Google Cloud Console</a></li>
                    <li>Navigate to <strong>APIs & Services</strong> → <strong>OAuth consent screen</strong></li>
                    <li>Scroll to <strong>Test users</strong> section</li>
                    <li>Click <strong>+ ADD USERS</strong> and add your email</li>
                    <li>Click <strong>Save</strong></li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sign In Button */}
        {!accessToken && (
          <div className="text-center">
            <button 
              onClick={signIn}
              className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <CheckCircle className="w-5 h-5 mr-2" />
              Sign In with Google
            </button>
          </div>
        )}

        {accessToken && (
          <div className="space-y-6">
            {/* Success Message */}
            <div className="bg-white border border-green-200 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="text-green-800 font-medium">Successfully signed in!</span>
              </div>
            </div>

            {/* Search Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Search Images</h2>
              
              {/* Search Input */}
              <div className={`
                relative w-full bg-white rounded-lg border transition-all duration-200 ease-out mb-4
                ${isSearchFocused 
                  ? 'border-blue-500 shadow-lg shadow-blue-500/20 ring-4 ring-blue-500/10' 
                  : 'border-gray-200 shadow-sm hover:border-gray-300 hover:shadow-md'
                }
              `}>
                <div className="flex items-center px-4 py-3">
                  <Search 
                    className={`
                      w-5 h-5 mr-3 transition-colors duration-200
                      ${isSearchFocused ? 'text-blue-500' : 'text-gray-400'}
                    `}
                  />
                  <input
                    type="text"
                    placeholder="Search for images (e.g., 'vacation photos', 'screenshots')"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => setIsSearchFocused(false)}
                    className="flex-1 text-gray-900 placeholder-gray-500 bg-transparent outline-none text-sm font-medium"
                  />
                  <div className="flex items-center space-x-1 text-xs text-gray-400">
                    <kbd className="px-2 py-1 bg-gray-100 rounded text-gray-600 font-mono">
                      <Command className="w-3 h-3 inline mr-1" />
                      S
                    </kbd>
                  </div>
                </div>
              </div>

              <button 
                onClick={searchImages}
                disabled={isSearching || !searchQuery.trim()}
                className="w-full px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isSearching ? (
                  <div className="flex items-center justify-center">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Searching...
                  </div>
                ) : (
                  'Search Images'
                )}
              </button>
            </div>

            {/* Folder Selection */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Or Select Folder</h2>
              
              <div className="space-y-4">
                <button 
                  onClick={pickFolder}
                  className="w-full flex items-center justify-center px-4 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
                >
                  <FolderOpen className="w-5 h-5 mr-2" />
                  Pick Folder
                </button>
                
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={recursive}
                    onChange={(e) => setRecursive(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-gray-700">Include subfolders (recursive)</span>
                </label>
                
                {folderId && (
                  <button 
                    onClick={listImages}
                    disabled={isSearching}
                    className="w-full px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSearching ? (
                      <div className="flex items-center justify-center">
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Loading...
                      </div>
                    ) : (
                      'List Images'
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Results and Actions */}
            {files.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">
                    Found {files.length} Images
                  </h2>
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
                    {files.length} files
                  </span>
                </div>
                
                <button 
                  onClick={suggestAndRenameAll}
                  disabled={isProcessing}
                  className="w-full px-6 py-4 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {isProcessing ? (
                    <div className="flex items-center justify-center">
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Processing Images...
                    </div>
                  ) : (
                    <div className="flex items-center justify-center">
                      <Bot className="w-5 h-5 mr-2" />
                      AI Rename All {files.length} Images
                    </div>
                  )}
                </button>
                
                <p className="text-sm text-gray-600 mt-3 text-center">
                  This will generate AI suggestions and rename all images automatically.
                </p>
              </div>
            )}

            {/* Files Preview */}
            {files.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Images Preview</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {files.slice(0, 12).map((file: any) => (
                    <div key={file.id} className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                      <div className="font-medium text-gray-900 truncate">{file.name}</div>
                      <div className="text-sm text-gray-500 mt-1">{file.mimeType}</div>
                    </div>
                  ))}
                </div>
                {files.length > 12 && (
                  <p className="text-gray-500 text-sm mt-4 text-center">
                    ... and {files.length - 12} more images
                  </p>
                )}
              </div>
            )}

            {/* Suggestions Preview */}
            {suggestions.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Suggestions</h2>
                <div className="space-y-3">
                  {suggestions.slice(0, 10).map((item: any) => (
                    <div key={item.id} className="p-4 border border-gray-200 rounded-lg">
                      <div className="font-medium text-gray-900">{item.old_name}</div>
                      {item.error ? (
                        <div className="text-red-600 text-sm mt-1 flex items-center">
                          <AlertCircle className="w-4 h-4 mr-1" />
                          Error: {item.error}
                        </div>
                      ) : (
                        <div className="text-green-600 text-sm mt-1 flex items-center">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          → {item.suggested_name}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
