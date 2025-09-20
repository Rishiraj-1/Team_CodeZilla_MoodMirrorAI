"use client"

import type React from "react"
import { useEffect, useState } from "react"
import i18next from "i18next"
import { I18nextProvider } from "react-i18next"
import { initI18n } from "@/lib/i18n"

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    initI18n()
    if (i18next.isInitialized) {
      setReady(true)
      return
    }
    const onInit = () => setReady(true)
    i18next.on("initialized", onInit)
    return () => {
      i18next.off("initialized", onInit)
    }
  }, [])

  if (!ready) {
    return (
      <div className="sr-only" aria-live="polite">
        Loading…
      </div>
    )
  }

  return <I18nextProvider i18n={i18next}>{children}</I18nextProvider>
}
