import Script from 'next/script'
import './globals.css'
import { Inter, Playfair_Display } from 'next/font/google'
import Footer from '@/app/src/components/Footer'
import type { Metadata } from 'next'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair' })

export const metadata: Metadata = {
  title: 'File Renamer AI',
  description: 'Rename photos with AI. Smart, automatic photo organization.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <head>
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
        <Script src="https://apis.google.com/js/api.js" strategy="afterInteractive" />
      </head>
      <body className="min-h-screen bg-white text-gray-900 antialiased flex flex-col">
        {children}
        <Footer />
      </body>
    </html>
  )
}