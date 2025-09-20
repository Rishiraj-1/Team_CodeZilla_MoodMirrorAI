import type React from "react"
import type { Metadata } from "next"
import "./globals.css"
import { Geist, Geist_Mono } from "next/font/google"

const geistSans = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-sans",
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
})

export const metadata: Metadata = {
  title: "v0 App",
  description: "Created with v0",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="bg-background text-foreground font-sans antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-sm"
        >
          Skip to content
        </a>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.__PUBLIC_ENV = {
                NEXT_PUBLIC_FIREBASE_API_KEY: ${JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "")},
                NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: ${JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "")},
                NEXT_PUBLIC_FIREBASE_PROJECT_ID: ${JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "")},
                NEXT_PUBLIC_FIREBASE_APP_ID: ${JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "")}
              };
            `,
          }}
        />
        {children}
      </body>
    </html>
  )
}
