"use client"

import { initializeApp, getApps } from "firebase/app"
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  signInWithRedirect,
  getRedirectResult,
} from "firebase/auth"

type FirebaseCfg = {
  apiKey?: string
  authDomain?: string
  projectId?: string
  appId?: string
}

declare global {
  // eslint-disable-next-line no-var
  var __PUBLIC_ENV:
    | undefined
    | {
        NEXT_PUBLIC_FIREBASE_API_KEY?: string
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?: string
        NEXT_PUBLIC_FIREBASE_PROJECT_ID?: string
        NEXT_PUBLIC_FIREBASE_APP_ID?: string
      }
  interface Window {
    __PUBLIC_ENV?: typeof globalThis.__PUBLIC_ENV
  }
}

function sanitize(v?: string) {
  return v ? v.trim().replace(/^['"]|['"]$/g, "") : undefined
}

function readLocalPublicConfig():
  | {
      NEXT_PUBLIC_FIREBASE_API_KEY?: string
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?: string
      NEXT_PUBLIC_FIREBASE_PROJECT_ID?: string
      NEXT_PUBLIC_FIREBASE_APP_ID?: string
    }
  | undefined {
  try {
    if (typeof window === "undefined") return undefined
    const raw =
      window.localStorage.getItem("MM_PUBLIC_FIREBASE_CONFIG") ||
      window.localStorage.getItem("NEXT_PUBLIC_FIREBASE_CONFIG") // legacy key
    if (!raw) return undefined
    const json = JSON.parse(raw)
    return {
      NEXT_PUBLIC_FIREBASE_API_KEY: sanitize(json.apiKey || json.NEXT_PUBLIC_FIREBASE_API_KEY),
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: sanitize(json.authDomain || json.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: sanitize(json.projectId || json.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
      NEXT_PUBLIC_FIREBASE_APP_ID: sanitize(json.appId || json.NEXT_PUBLIC_FIREBASE_APP_ID),
    }
  } catch {
    return undefined
  }
}

export function getFirebaseEnvSnapshot() {
  const pub = (typeof window !== "undefined" ? window.__PUBLIC_ENV : undefined) || globalThis.__PUBLIC_ENV
  const ls = readLocalPublicConfig()

  const values = {
    NEXT_PUBLIC_FIREBASE_API_KEY:
      sanitize(process.env.NEXT_PUBLIC_FIREBASE_API_KEY) ||
      sanitize(pub?.NEXT_PUBLIC_FIREBASE_API_KEY) ||
      sanitize(ls?.NEXT_PUBLIC_FIREBASE_API_KEY),
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
      sanitize(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) ||
      sanitize(pub?.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) ||
      sanitize(ls?.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    NEXT_PUBLIC_FIREBASE_PROJECT_ID:
      sanitize(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) ||
      sanitize(pub?.NEXT_PUBLIC_FIREBASE_PROJECT_ID) ||
      sanitize(ls?.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    NEXT_PUBLIC_FIREBASE_APP_ID:
      sanitize(process.env.NEXT_PUBLIC_FIREBASE_APP_ID) ||
      sanitize(pub?.NEXT_PUBLIC_FIREBASE_APP_ID) ||
      sanitize(ls?.NEXT_PUBLIC_FIREBASE_APP_ID),
  }

  const missing = Object.entries(values)
    .filter(([, v]) => !v)
    .map(([k]) => k)

  return { values, missing }
}

export function isFirebaseConfigValid(cfg: FirebaseCfg) {
  return Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId)
}

export function getFirebaseIfConfigured() {
  const config = getFirebaseConfig()

  if (!isFirebaseConfigValid(config)) {
    console.warn("[v0] Missing Firebase env vars. Check NEXT_PUBLIC_FIREBASE_* in Project Settings.")
    if (typeof window !== "undefined") {
      console.log("[v0] window.__PUBLIC_ENV snapshot:", {
        hasApiKey: !!window.__PUBLIC_ENV?.NEXT_PUBLIC_FIREBASE_API_KEY,
        hasAuthDomain: !!window.__PUBLIC_ENV?.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        hasProjectId: !!window.__PUBLIC_ENV?.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        hasAppId: !!window.__PUBLIC_ENV?.NEXT_PUBLIC_FIREBASE_APP_ID,
      })
      try {
        const ls = readLocalPublicConfig()
        console.log("[v0] localStorage config exists:", {
          hasApiKey: !!ls?.NEXT_PUBLIC_FIREBASE_API_KEY,
          hasAuthDomain: !!ls?.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          hasProjectId: !!ls?.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          hasAppId: !!ls?.NEXT_PUBLIC_FIREBASE_APP_ID,
        })
      } catch {}
    }
    return null
  }

  if (!getApps().length) {
    try {
      initializeApp({
        apiKey: config.apiKey!,
        authDomain: config.authDomain!,
        projectId: config.projectId!,
        appId: config.appId!,
      } as any)
    } catch {
      // ignore duplicate init
    }
  }

  const provider = new GoogleAuthProvider()

  const getAuthSafe = () => {
    try {
      const auth = getAuth()
      return { auth }
    } catch (e: any) {
      const code = e?.code || e?.message || "unknown"
      return { auth: null, errorCode: code, errorMessage: e?.message }
    }
  }

  return { provider, getAuthSafe, signInWithPopup, signOut, signInWithRedirect, getRedirectResult }
}

function getFirebaseConfig(): FirebaseCfg {
  const snap = getFirebaseEnvSnapshot()
  return {
    apiKey: snap.values.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: snap.values.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: snap.values.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: snap.values.NEXT_PUBLIC_FIREBASE_APP_ID,
  }
}
