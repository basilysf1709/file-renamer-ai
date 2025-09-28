"use client"

import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleAuthError = (e: any) => setError(e?.message || 'Authentication error')

  async function upsertProfile(startingCredits = 10) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) return
      // Create or keep existing credits
      const { error } = await supabase.from('profiles').upsert(
        { id: user.id, email: user.email, credits: startingCredits },
        { onConflict: 'id' }
      )
      if (error) console.warn('Profile upsert warning:', error.message)
    } catch (e) {
      console.warn('Profile upsert error:', (e as any)?.message)
    }
  }

  async function signInEmail() {
    setLoading(true); setMessage(null); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) handleAuthError(error)
    else setMessage('Signed in')
    setLoading(false)
    await upsertProfile()
  }

  async function signUpEmail() {
    setLoading(true); setMessage(null); setError(null)
    try {
      const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}` : undefined
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo }
      })
      if (error) return handleAuthError(error)
      if (data.user) setMessage('Check your email to confirm sign up')
      else setMessage('Sign up email sent (check your inbox)')
    } catch (e: any) {
      handleAuthError(e)
    } finally {
      setLoading(false)
    }
  }

  async function resetPassword() {
    setLoading(true); setMessage(null); setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined
    })
    if (error) handleAuthError(error)
    else setMessage('Password reset email sent')
    setLoading(false)
  }

  async function signInWithGoogle() {
    setLoading(true); setMessage(null); setError(null)
    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    try { console.log('[auth] signInWithGoogle init', { host: typeof window !== 'undefined' ? window.location.host : 'ssr', mode: isLocal ? 'localhost-redirect' : 'default-callback' }) } catch {}
    let err: any = null
    if (isLocal) {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'http://localhost:3000/' } })
      err = error
    } else {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' })
      err = error
    }
    if (err) {
      try { console.error('[auth] Google sign-in error', err.message) } catch {}
      handleAuthError(err)
    } else {
      try { console.log('[auth] Google OAuth initiated') } catch {}
    }
    setLoading(false)
  }

  async function signOut() {
    setLoading(true); setMessage(null); setError(null)
    const { error } = await supabase.auth.signOut()
    if (error) handleAuthError(error)
    else setMessage('Signed out')
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-white">
      <div className="w-full max-w-md border rounded-2xl p-6">
        {/* <div className="text-xl font-medium mb-4">Sign in</div> */}
        {message && <div className="mb-3 text-green-600 text-sm">{message}</div>}
        {error && <div className="mb-3 text-red-600 text-sm">{error}</div>}

        <div className="space-y-3">
          {/*
          <input
            className="w-full border rounded-md px-3 py-2 text-sm"
            type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}
          />
          <input
            className="w-full border rounded-md px-3 py-2 text-sm"
            type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={signInEmail} disabled={loading} className="flex-1 px-3 py-2 rounded-md bg-gray-900 text-white disabled:opacity-50">Sign in</button>
            <button onClick={signUpEmail} disabled={loading} className="flex-1 px-3 py-2 rounded-md border">Sign up</button>
          </div>
          <button onClick={resetPassword} disabled={loading || !email} className="text-xs text-gray-600 hover:underline text-left">Forgot password?</button>
          */}
          <div className="h-px bg-gray-200 my-2" />
          <button onClick={signInWithGoogle} disabled={loading} className="w-full px-3 py-2 rounded-md border">Continue with Google</button>
          {/* <button onClick={signOut} disabled={loading} className="w-full px-3 py-2 rounded-md border">Sign out</button> */}
        </div>
      </div>
    </div>
  )
} 