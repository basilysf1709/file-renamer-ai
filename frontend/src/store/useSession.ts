import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type S = {
  accessToken?: string
  folderId?: string
  files: any[]
  suggestions: any[]
  userCredits?: number
  userEmail?: string
  set: (p: Partial<S>) => void
}

export const useSession = create<S>()(persist((set, get) => ({
  files: [],
  suggestions: [],
  set: (p) => set(p)
}), {
  name: 'renamer-session',
  partialize: (s) => ({ accessToken: s.accessToken, folderId: s.folderId })
}))
