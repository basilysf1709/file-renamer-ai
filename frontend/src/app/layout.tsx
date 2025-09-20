import Script from 'next/script'
import './globals.css'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
        <Script src="https://apis.google.com/js/api.js" strategy="afterInteractive" />
      </head>
      <body className="min-h-screen bg-neutral-50">{children}</body>
    </html>
  )
}
