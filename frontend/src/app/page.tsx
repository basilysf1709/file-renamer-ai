'use client'
import { useSession } from '@/store/useSession'
import { initPicker } from '@/lib/google'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_BASE!

export default function Page() {
  const { accessToken, folderId, files, suggestions, set } = useSession()

  async function signIn() {
    // @ts-ignore
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      scope: 'https://www.googleapis.com/auth/drive',
      callback: (resp: any) => set({ accessToken: resp.access_token })
    })
    tokenClient.requestAccessToken()
  }

  function pickFolder() {
    if (!accessToken) return alert('Sign in first')
    initPicker(accessToken, (fid) => set({ folderId: fid }))
  }

  async function listImages() {
    const r = await fetch(`${BACKEND}/list_images`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken, folder_id: folderId })
    })
    const j = await r.json()
    set({ files: j.files })
  }

  async function suggest() {
    const r = await fetch(`${BACKEND}/suggest_names`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken, files })
    })
    const j = await r.json()
    set({ suggestions: j.items })
  }

  async function renameAll() {
    const items = suggestions
      .filter((x: any) => !x.error)
      .map((x: any) => ({ id: x.id, new_name: x.suggested_name }))
    const r = await fetch(`${BACKEND}/rename`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken, items })
    })
    const j = await r.json()
    alert('Rename done: ' + JSON.stringify(j.results.slice(0,3)) + ' ...')
    await listImages()
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-semibold">Drive AI Renamer</h1>
      <div className="flex gap-2">
        <button 
          onClick={signIn}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Sign In
        </button>
        <button 
          onClick={pickFolder}
          disabled={!accessToken}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
        >
          Pick Folder
        </button>
        <button 
          onClick={listImages}
          disabled={!folderId}
          className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400"
        >
          List Images
        </button>
        <button 
          onClick={suggest}
          disabled={files.length === 0}
          className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:bg-gray-400"
        >
          Suggest Names
        </button>
        <button 
          onClick={renameAll}
          disabled={suggestions.length === 0}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
        >
          Rename All
        </button>
      </div>
      
      {folderId && (
        <div className="p-4 bg-blue-50 rounded">
          <strong>Selected Folder:</strong> {folderId}
        </div>
      )}
      
      {files.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Images ({files.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {files.slice(0, 6).map((file: any) => (
              <div key={file.id} className="p-3 border rounded bg-white">
                <div className="font-medium truncate">{file.name}</div>
                <div className="text-sm text-gray-500">{file.mimeType}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Suggestions</h2>
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
    </main>
  )
}
