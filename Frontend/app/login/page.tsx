"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { SiteHeader } from "@/components/site-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { getFirebaseIfConfigured, getFirebaseEnvSnapshot } from "@/components/firebase-client"
import { useRouter } from "next/navigation"

type UserInfo = { displayName: string | null; photoURL: string | null }

// Put helpers above the component so they don't re-create every render.
function parseFirebaseConfigText(input: string) {
  // Remove comments and extract the first {...} block if present.
  let text = (input || "").trim()
  // Strip block and line comments
  text = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  // If there's a JS assignment, keep only the object literal
  const first = text.indexOf("{")
  const last = text.lastIndexOf("}")
  if (first !== -1 && last !== -1 && last > first) {
    text = text.slice(first, last + 1)
  }
  // Normalize quotes and ensure keys are quoted
  text = text.replace(/'/g, '"').replace(/(\b[A-Za-z_]\w*)\s*:/g, '"$1":')
  // Remove trailing commas
  text = text.replace(/,\s*([}\]])/g, "$1")
  return JSON.parse(text)
}

export default function LoginPage() {
  const [envSnap, setEnvSnap] = useState(() => getFirebaseEnvSnapshot())
  useEffect(() => {
    // ensure we pick up window.__PUBLIC_ENV injected in layout.tsx after hydration
    setEnvSnap(getFirebaseEnvSnapshot())
  }, [])
  const missing = envSnap.missing
  const isConfigured = missing.length === 0

  const fb = useMemo(() => (isConfigured ? getFirebaseIfConfigured() : null), [isConfigured])

  const [user, setUser] = useState<UserInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const [cfgText, setCfgText] = useState("")
  const router = useRouter()

  function refreshEnv() {
    setEnvSnap(getFirebaseEnvSnapshot())
  }

  function saveLocalConfig() {
    try {
      const json = parseFirebaseConfigText(cfgText)
      const payload = {
        apiKey: json.apiKey || json.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: json.authDomain || json.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: json.projectId || json.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        appId: json.appId || json.NEXT_PUBLIC_FIREBASE_APP_ID,
      }
      if (!payload.apiKey || !payload.authDomain || !payload.projectId || !payload.appId) {
        setError("Config is incomplete. Include apiKey, authDomain, projectId, and appId.")
        return
      }
      localStorage.setItem("MM_PUBLIC_FIREBASE_CONFIG", JSON.stringify(payload))
      setError(null)
      setCfgText("")
      refreshEnv()
    } catch (e: any) {
      setError(
        'Invalid config. Paste either the Firebase web config JSON or the JS snippet like: const firebaseConfig = { apiKey: "...", authDomain: "...", projectId: "...", appId: "..." }',
      )
    }
  }

  useEffect(() => {
    if (!fb?.getAuthSafe) return
    const { auth, errorCode } = fb.getAuthSafe()
    if (!auth) {
      if (errorCode === "auth/invalid-api-key") {
        setError(
          "The Firebase API key is invalid. Verify NEXT_PUBLIC_FIREBASE_API_KEY in Project Settings matches your Firebase project's Web API key.",
        )
      }
      return
    }
    return auth.onAuthStateChanged((u) => {
      setUser(u ? { displayName: u.displayName, photoURL: u.photoURL } : null)
      // No redirect here. Visiting /login while signed-in shows account + logout.
    })
  }, [fb, router])

  useEffect(() => {
    if (!fb?.getAuthSafe) return
    const { auth } = fb.getAuthSafe()
    if (!auth) return
    ;(async () => {
      try {
        const { getRedirectResult } = await import("firebase/auth")
        const res = await getRedirectResult(auth)
        if (res?.user) {
          router.replace("/dashboard")
        }
      } catch {
        // ignore
      }
    })()
  }, [fb, router])

  async function googleSignIn() {
    setError(null)
    if (!isConfigured || !fb) {
      setError(
        "Firebase isn’t configured for this preview. Please add the required NEXT_PUBLIC_FIREBASE_* variables in Project Settings and reload.",
      )
      return
    }
    const { auth, errorCode } = fb.getAuthSafe()
    if (!auth) {
      if (errorCode === "auth/invalid-api-key") {
        setError(
          "The Firebase API key is invalid. Verify NEXT_PUBLIC_FIREBASE_API_KEY in Project Settings matches your Firebase project's Web API key.",
        )
      } else {
        setError(`Sign-in unavailable (${errorCode || "unknown"}).`)
      }
      return
    }

    setIsLoading(true)
    try {
      await fb.signInWithPopup(auth, fb.provider)
      router.replace("/dashboard")
    } catch (e: any) {
      const code = e?.code || e?.message || "unknown"
      if (code === "auth/popup-blocked") {
        try {
          await fb.signInWithRedirect(auth, fb.provider)
          return
        } catch (re: any) {
          const rcode = re?.code || re?.message || "unknown"
          setError(`Sign-in failed (${rcode}).`)
        }
      } else if (code === "auth/unauthorized-domain") {
        const host = currentHostname()
        setError(
          `This preview domain is not authorized in Firebase Authentication. Add "${host}" to Firebase → Authentication → Settings → Authorized domains, then try again.`,
        )
      } else if (code === "auth/invalid-api-key") {
        setError(
          "The Firebase API key is invalid. Verify NEXT_PUBLIC_FIREBASE_API_KEY in Project Settings matches your Firebase project's Web API key.",
        )
      } else {
        setError(`Sign-in failed (${code}).`)
      }
    } finally {
      setIsLoading(false)
    }
  }

  async function handleLogout() {
    setError(null)
    if (!isConfigured || !fb) return
    const { auth } = fb.getAuthSafe()
    if (!auth) return
    await fb.signOut(auth)
  }

  function copyDomain() {
    const host = currentHostname()
    if (!host) return
    navigator.clipboard?.writeText(host).catch(() => {})
  }

  function copyMissingList() {
    const text = missing.join("\n")
    if (!text) return
    navigator.clipboard?.writeText(text).catch(() => {})
  }

  function currentHostname() {
    if (typeof window === "undefined") return ""
    return window.location.hostname
  }

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto min-h-[70dvh] max-w-6xl px-4 py-8">
        {/* Hero + Form grid */}
        <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-2">
          {/* Left: purpose + trust */}
          <section className="flex flex-col gap-6 text-center md:text-left">
            <div className="inline-flex items-center justify-center md:justify-start gap-2 rounded-full border bg-secondary/10 px-3 py-1 text-xs text-muted-foreground shadow-sm">
              <span className="sr-only">Healthcare</span>
              <span className="font-medium text-secondary-foreground">Wellbeing • Privacy • Care</span>
            </div>
            <h1 className="text-balance text-4xl font-bold sm:text-5xl">Welcome to your wellbeing journey</h1>
            <p className="max-w-prose text-pretty text-muted-foreground">
              Track mood, reflect with guidance, and get culturally mindful suggestions in English and Hindi. Your data
              stays private and secure.
            </p>

            <ul className="grid gap-3 text-left">
              <li className="flex items-start gap-3">
                <span className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
                <span className="text-sm">Yoga, meditation, and family support suggestions tailored to you.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />
                <span className="text-sm">Simple, trustworthy design with multilingual guidance.</span>
              </li>
            </ul>

            <div className="relative mt-2">
              {/* <img
                src="/images/hero-healthcare.svg\"
                alt="Calming healthcare illustration representing reflection and wellbeing"
                className="mx-auto w-auto"
              /> */}
              <div
                className="pointer-events-none absolute -bottom-3 left-1/2 h-6 w-3/4 -translate-x-1/2 rounded-full bg-black/5 blur-xl"
                aria-hidden
              />
            </div>
          </section>

          {/* Right: Login Card */}
          <section className="mx-auto w-full max-w-sm">
            <Card className="w-full rounded-2xl shadow-sm transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-center">Login</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Show missing env guidance */}
                {!isConfigured && (
                  <Alert variant="destructive" role="alert" className="rounded-lg">
                    <AlertTitle>Firebase not configured</AlertTitle>
                    <AlertDescription className="space-y-3">
                      <p className="text-sm">
                        Add the following environment variables in Project Settings, then refresh this page:
                      </p>
                      <ul className="list-disc pl-5 text-xs">
                        {missing.map((k) => (
                          <li key={k}>
                            <code>{k}</code>
                          </li>
                        ))}
                      </ul>
                      <div className="flex items-center justify-between gap-2">
                        <code className="rounded bg-muted px-2 py-1 text-xs">{currentHostname()}</code>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={copyMissingList}>
                            Copy keys
                          </Button>
                          <Button variant="outline" size="sm" onClick={copyDomain}>
                            Copy domain
                          </Button>
                          <Button variant="secondary" size="sm" onClick={refreshEnv}>
                            Re-check
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2 rounded-md border bg-card p-3">
                        <p className="text-xs text-muted-foreground">
                          Or paste your Firebase web config JSON (preview-only fallback):
                        </p>
                        <textarea
                          className="w-full rounded-md border bg-background p-2 text-xs"
                          rows={4}
                          placeholder={
                            '{ "apiKey": "...", "authDomain": "...", "projectId": "...", "appId": "..." }\n\nor\n\n// comments ok\nconst firebaseConfig = { apiKey: "...", authDomain: "...", projectId: "...", appId: "..." };'
                          }
                          value={cfgText}
                          onChange={(e) => setCfgText(e.target.value)}
                        />
                        <div className="flex justify-end">
                          <Button size="sm" onClick={saveLocalConfig}>
                            Save locally
                          </Button>
                        </div>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {error && (
                  <Alert variant="destructive" role="alert" className="rounded-lg">
                    <AlertTitle>Authentication Issue</AlertTitle>
                    <AlertDescription className="space-y-2">
                      <p className="text-sm text-pretty">{error}</p>
                      <div className="flex items-center justify-between gap-2">
                        <code className="rounded bg-muted px-2 py-1 text-xs">{currentHostname()}</code>
                        <Button variant="outline" size="sm" onClick={copyDomain}>
                          Copy domain
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {!user ? (
                  <Button
                    onClick={googleSignIn}
                    className="w-full rounded-full h-10 px-4 transition-all hover:shadow-md active:scale-[0.99]"
                    disabled={isLoading}
                  >
                    {isLoading ? "Signing in..." : "Continue with Google"}
                  </Button>
                ) : (
                  <div className="flex items-center gap-3">
                    {user.photoURL ? (
                      <Image
                        src={user.photoURL || "/placeholder.svg?height=40&width=40&query=user%20avatar"}
                        alt="User photo"
                        width={40}
                        height={40}
                        className="rounded-full"
                        unoptimized
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-muted" aria-hidden />
                    )}
                    <div>
                      <div className="text-sm text-muted-foreground">Signed in as</div>
                      <div className="font-medium">{user.displayName ?? "User"}</div>
                    </div>
                  </div>
                )}
              </CardContent>
              <CardFooter>
                {user ? (
                  <Button
                    variant="secondary"
                    onClick={handleLogout}
                    className="w-full rounded-full h-10 px-4 transition-all hover:shadow-md active:scale-[0.99]"
                  >
                    Logout
                  </Button>
                ) : (
                  <div className="w-full text-center text-sm text-muted-foreground">
                    We only use your profile for this demo.
                  </div>
                )}
              </CardFooter>
            </Card>
          </section>
        </div>
      </main>
    </>
  )
}
