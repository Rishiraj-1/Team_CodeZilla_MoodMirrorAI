"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import Image from "next/image"
import { getFirebaseIfConfigured } from "@/components/firebase-client"

const nav = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/mirror", label: "Mirror" },
  { href: "/reports", label: "Reports" },
  { href: "/analytics", label: "Analytics" },
  { href: "/digital-twin", label: "Your Digital Twin" },
  { href: "/support", label: "Support Network" },
  { href: "/profile", label: "You" },
  { href: "/privacy", label: "Privacy" },
]

export function SiteHeader() {
  const pathname = usePathname()
  const [profile, setProfile] = useState<{ name?: string | null; photoURL?: string | null } | null>(null)

  useEffect(() => {
    const fb = getFirebaseIfConfigured()
    if (!fb?.getAuthSafe) return
    const { auth } = fb.getAuthSafe()
    if (!auth) return
    let unsub: (() => void) | undefined
    ;(async () => {
      const { onAuthStateChanged } = await import("firebase/auth")
      unsub = onAuthStateChanged(auth, (u) => {
        setProfile(u ? { name: u.displayName, photoURL: u.photoURL } : null)
      })
    })()
    return () => {
      if (unsub) unsub()
    }
  }, [])

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/60 shadow-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="font-semibold tracking-tight text-xl" aria-label="MoodMirror Home">
          <span className="text-primary">Mood</span>
          <span className="text-accent">Mirror</span>
        </Link>
        <nav className="flex items-center gap-1" aria-label="Main navigation">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname === item.href ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
          <Link href="/login" className="ml-2">
            <Button className="rounded-full h-9 px-4">
              {profile ? (
                <span className="flex items-center gap-2">
                  {profile.photoURL ? (
                    <Image
                      src={profile.photoURL || "/placeholder.svg"}
                      alt="Profile"
                      width={20}
                      height={20}
                      className="rounded-full"
                      unoptimized
                    />
                  ) : (
                    <span className="inline-block h-5 w-5 rounded-full bg-muted" aria-hidden />
                  )}
                  <span className="hidden sm:inline">{profile.name || "Account"}</span>
                </span>
              ) : (
                "Login"
              )}
            </Button>
          </Link>
        </nav>
      </div>
    </header>
  )
}
