import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' })
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || ''

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
)

async function addCreditsByUserId(userId: string, credits: number) {
  const { data: row } = await supabase.from('profiles').select('credits').eq('id', userId).limit(1)
  const current = Array.isArray(row) && row.length ? (row[0].credits ?? 0) : 0
  const newCredits = current + credits
  await supabase.from('profiles').upsert({ id: userId, credits: newCredits }, { onConflict: 'id' })
}

async function addCreditsByEmail(email: string, credits: number) {
  const sel = await supabase.from('profiles').select('id, credits').eq('email', email).limit(1)
  if (sel.error) throw new Error(sel.error.message)
  if (Array.isArray(sel.data) && sel.data.length) {
    const { id, credits: cur } = sel.data[0]
    const newCredits = (cur ?? 0) + credits
    await supabase.from('profiles').update({ credits: newCredits }).eq('id', id)
  } else {
    // create a new profile row with starting credits
    await supabase.from('profiles').insert({ email, credits })
  }
}

function creditsFromAmount(amountCents?: number) {
  const amt = Number(amountCents || 0)
  if (amt >= 10000) return 10000 // $100
  if (amt >= 1000) return 1000   // $10 or more
  return 0
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature') || ''
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret)
  } catch (err: any) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = (session.metadata as any)?.user_id
        const credits = creditsFromAmount(session.amount_total || undefined)
        if (credits > 0) {
          if (userId) {
            await addCreditsByUserId(userId, credits)
          } else if (session.customer) {
            const cust = typeof session.customer === 'string' ? await stripe.customers.retrieve(session.customer) : session.customer
            const email = (cust as Stripe.Customer).email
            if (email) await addCreditsByEmail(email, credits)
          }
        }
        break
      }
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        const credits = creditsFromAmount(invoice.amount_paid || undefined)
        if (credits > 0) {
          const userId = (invoice.subscription_details as any)?.metadata?.user_id || (invoice.metadata as any)?.user_id
          if (userId) {
            await addCreditsByUserId(userId, credits)
          } else if (invoice.customer) {
            const cust = typeof invoice.customer === 'string' ? await stripe.customers.retrieve(invoice.customer) : invoice.customer
            const email = (cust as Stripe.Customer).email
            if (email) await addCreditsByEmail(email, credits)
          }
        }
        break
      }
      default:
        break
    }
    return new Response(JSON.stringify({ received: true }), { status: 200 })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Failed' }), { status: 500 })
  }
} 