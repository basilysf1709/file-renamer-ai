import { create } from 'zustand'

type S = {
  accessToken?: string
  folderId?: string
  files: any[]
  suggestions: any[]
  set: (p: Partial<S>) => void
}

export const useSession = create<S>((set) => ({
  files: [],
  suggestions: [],
  set: (p) => set(p)
}))
