"use client"

import { useEffect, useState } from "react"

// We rely on your existing helper. If it isn't present, this will no-op gracefully.
let getAuthSafe: (() => import("firebase/auth").Auth | null) | undefined
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  // dynamic require to avoid SSR import errors if firebase isn't configured
  // @ts-ignore
} catch {
  /* ignore */
}

export function useFirebaseUser() {
  const [user, setUser] = useState<import("firebase/auth").User | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let unsub: (() => void) | undefined

    async function sub() {
      try {
        // lazy import to avoid blocking the render path
        const mod = await import("../components/firebase-client")
        // getAuthSafe returns null if not configured
        getAuthSafe = (mod as any).getAuthSafe || getAuthSafe
        const auth = getAuthSafe?.()
        if (!auth) {
          setReady(true)
          return
        }
        const { onAuthStateChanged } = await import("firebase/auth")
        unsub = onAuthStateChanged(auth, (u) => {
          setUser(u)
          setReady(true)
        })
      } catch {
        setReady(true)
      }
    }

    sub()
    return () => {
      if (unsub) unsub()
    }
  }, [])

  return { user, ready }
}
