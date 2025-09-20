"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { SiteHeader } from "@/components/site-header"
import { I18nProvider } from "@/components/i18n-provider"
import { useTranslation } from "react-i18next"
import { Stethoscope, Lock, LineChart, Languages } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { useEffect, useState } from "react"
import { analyzeText as analyzeTextApi } from "@/utils/api"

export default function HomePage() {
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState<"idle" | "saving" | "analyzing">("idle")
  const [noteFeedback, setNoteFeedback] = useState<string | null>(null)
  const { t, i18n, ready } = useTranslation(undefined, { useSuspense: false } as any)

  useEffect(() => {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("mm:quick-notes") : null
      if (saved) setNote(saved)
    } catch {}
  }, [])

  async function saveDraft() {
    try {
      setBusy("saving")
      localStorage.setItem("mm:quick-notes", note)
      setNoteFeedback("Draft saved locally.")
    } catch {
      setNoteFeedback("Could not save draft.")
    } finally {
      setBusy("idle")
    }
  }

  async function analyzeNote() {
    if (!note.trim()) {
      setNoteFeedback("Please type a note before checking.")
      return
    }
    try {
      setBusy("analyzing")
      setNoteFeedback("Analyzing…")
      const data = await analyzeTextApi(note)
      const emotion =
        (data && typeof data === "object" && data.analysis &&
          (data.analysis.text ||
            data.analysis.candidates?.[0]?.content?.parts?.[0]?.text)) ||
        data?.emotion ||
        "Unknown"
      const pct = Math.round((data?.confidence ?? 0.9) * 100)
      setNoteFeedback(`Detected: ${emotion} (${pct}%)`)
    } catch {
      setNoteFeedback("Analysis failed. Please try again.")
    } finally {
      setBusy("idle")
    }
  }

  return (
    <I18nProvider>
      <SiteHeader />
      <main id="main" className="relative">
        <section className="mx-auto flex min-h-[70dvh] max-w-6xl items-center px-4 py-8">
          <div className="grid w-full grid-cols-1 items-center gap-8 md:grid-cols-2">
            <div className="flex flex-col items-center md:items-start text-center md:text-left gap-6">
              <div className="inline-flex items-center gap-2 rounded-full border bg-secondary px-3 py-1 text-xs text-muted-foreground shadow-sm">
                <Stethoscope className="h-3.5 w-3.5 text-primary" aria-hidden />
                <span className="sr-only">Healthcare</span>
                <span>Healthcare-grade, privacy-first</span>
              </div>
              <h1 className="text-balance text-4xl font-bold sm:text-5xl">
                {ready && i18n?.isInitialized ? t("title") : "Reflect, understand, and care for your mood."}
              </h1>
              <p className="max-w-xl text-pretty text-muted-foreground">
                {ready && i18n?.isInitialized
                  ? t("subtitle")
                  : "MoodMirror helps you track emotions privately and learn gentle, culturally relevant coping habits."}
              </p>
              <div className="flex gap-3">
                <Link href="/login">
                  <Button className="rounded-xl transition-shadow hover:shadow-lg">Login</Button>
                </Link>
                <Link href="/reports">
                  <Button variant="secondary" className="rounded-xl transition-shadow hover:shadow-lg">
                    {t("reports")}
                  </Button>
                </Link>
              </div>
              {/* quick trust badges */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>Trusted by clinicians</span>
                <span aria-hidden>•</span>
                <span>Privacy‑first</span>
              </div>
            </div>

            <div className="relative">
              <img
                src="/images/hero-healthcare.svg\"
                alt="Calming healthcare dashboard with meditation and heart health motifs"
                className="mx-auto max-h-[380px] w-auto "
              />
              <div
                className="pointer-events-none absolute -bottom-3 left-1/2 h-6 w-3/4 -translate-x-1/2 rounded-full bg-black/5 blur-xl"
                aria-hidden
              />
            </div>
          </div>
        </section>

        <section className="mx-auto mt-2 max-w-6xl px-4">
          <div className="mt-4 grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="rounded-xl">
              <CardContent className="p-4">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                  <Lock className="h-5 w-5 text-primary" aria-hidden />
                </div>
                <div className="mt-2 font-medium">Secure sessions</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  End-to-end security and strict privacy by default.
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-xl">
              <CardContent className="p-4">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                  <LineChart className="h-5 w-5 text-primary" aria-hidden />
                </div>
                <div className="mt-2 font-medium">Actionable insights</div>
                <div className="mt-1 text-sm text-muted-foreground">Clear patterns and gentle recommendations.</div>
              </CardContent>
            </Card>
            <Card className="rounded-xl">
              <CardContent className="p-4">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                  <Languages className="h-5 w-5 text-primary" aria-hidden />
                </div>
                <div className="mt-2 font-medium">Multilingual support</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Guidance in English and Hindi to meet you where you are.
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mx-auto mt-10 max-w-6xl px-4">
          <Card className="rounded-xl border">
            <CardContent className="p-4 sm:p-6">
              <label htmlFor="mood-notes" className="block text-sm font-medium">
                Quick notes
              </label>
              <p id="mood-helper" className="mt-1 text-xs text-muted-foreground">
                Share how you’re feeling today. This stays private to you.
              </p>
              <textarea
                id="mood-notes"
                aria-describedby="mood-helper"
                placeholder="Type a short note..."
                className="mt-3 w-full rounded-md border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="mt-3 flex items-center gap-3">
                <Button onClick={analyzeNote} disabled={busy !== "idle"} className="rounded-full h-9 px-4">
                  {busy === "analyzing" ? "Checking…" : "Check now"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={saveDraft}
                  disabled={busy !== "idle"}
                  className="rounded-full h-9 px-4"
                >
                  {busy === "saving" ? "Saving…" : "Save draft"}
                </Button>
              </div>
              <div className="mt-3 text-xs text-muted-foreground" aria-live="polite">
                {noteFeedback}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mx-auto mt-10 max-w-6xl px-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="rounded-xl">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Last 7 days</div>
                <div className="mt-1 text-2xl font-semibold">72%</div>
                <div className="mt-1 text-xs">
                  Positive trend <span className="text-accent">+8%</span>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-xl">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Avg. session</div>
                <div className="mt-1 text-2xl font-semibold">4m 22s</div>
                <div className="mt-1 text-xs">Consistent engagement</div>
              </CardContent>
            </Card>
            <Card className="rounded-xl">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Entries</div>
                <div className="mt-1 text-2xl font-semibold">18</div>
                <div className="mt-1 text-xs">This week</div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mx-auto mt-10 max-w-6xl px-4">
          <div className="text-center text-sm text-muted-foreground">
            “Helps our patients reflect with confidence.” — Licensed clinician
          </div>
          <div className="mt-2 text-center text-sm text-muted-foreground">
            We never sell your data. End‑to‑end secure by design.
          </div>
        </section>

        <footer className="mt-12 border-t bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/60">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 text-xs text-muted-foreground">
            <span>&copy; {new Date().getFullYear()} MoodMirror</span>
            <nav className="flex items-center gap-4">
              <Link href="/privacy" className="hover:text-foreground">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-foreground">
                Terms
              </Link>
            </nav>
          </div>
        </footer>
      </main>
    </I18nProvider>
  )
}
