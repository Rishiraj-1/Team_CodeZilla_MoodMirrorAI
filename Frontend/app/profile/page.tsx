"use client"

import { useEffect, useState } from "react"
import { SiteHeader } from "@/components/site-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getProfile, updateProfile, type ProfilePrefs } from "@/utils/api"

type Group<K extends keyof ProfilePrefs> = {
  key: K
  title: string
  hint: string
  options: { value: ProfilePrefs[K]; label: string; sub?: string }[]
}

const GROUPS = [
  {
    key: "language" as const,
    title: "Language",
    hint: "Which language should Mirror reply in?",
    options: [
      { value: "en" as const, label: "English (international)" },
      { value: "en-IN" as const, label: "Indian English" },
      { value: "hi" as const, label: "Hindi / Hinglish" },
    ],
  },
  {
    key: "culture" as const,
    title: "Cultural context",
    hint: "Helps us pick coping practices that fit your life.",
    options: [
      { value: "none" as const, label: "Not specified", sub: "Generic suggestions only." },
      {
        value: "indian" as const,
        label: "Indian",
        sub: "Pranayama, family check-ins, simple home rituals.",
      },
      {
        value: "western" as const,
        label: "Western",
        sub: "Mindfulness, journaling, cognitive reframing.",
      },
      {
        value: "east-asian" as const,
        label: "East Asian",
        sub: "Self-compassion + collective context.",
      },
    ],
  },
  {
    key: "age_band" as const,
    title: "Age band",
    hint: "Tunes the tone — never pried or used clinically.",
    options: [
      { value: "teen" as const, label: "Teen" },
      { value: "adult" as const, label: "Adult" },
      { value: "senior" as const, label: "Older adult" },
    ],
  },
  {
    key: "spirituality" as const,
    title: "Spiritual context",
    hint:
      "Optional. If set, Mirror may gently reference simple personal practices when relevant. Never preachy.",
    options: [
      { value: "none" as const, label: "Not specified" },
      { value: "spiritual" as const, label: "Spiritual but not religious" },
      { value: "hindu" as const, label: "Hindu" },
      { value: "muslim" as const, label: "Muslim" },
      { value: "christian" as const, label: "Christian" },
      { value: "sikh" as const, label: "Sikh" },
      { value: "buddhist" as const, label: "Buddhist" },
    ],
  },
] satisfies Group<keyof ProfilePrefs>[]

export default function ProfilePage() {
  const [prefs, setPrefs] = useState<ProfilePrefs | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const p = await getProfile()
        setPrefs(p)
      } catch (e: any) {
        setError(e?.message || "Could not load profile")
      }
    })()
  }, [])

  async function pick<K extends keyof ProfilePrefs>(key: K, value: ProfilePrefs[K]) {
    setSavingKey(key as string)
    setError(null)
    try {
      const updated = await updateProfile({ [key]: value } as Partial<ProfilePrefs>)
      setPrefs(updated)
      setSavedAt(updated.updated_at || new Date().toISOString())
    } catch (e: any) {
      setError(e?.message || "Failed to save")
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold leading-tight">Personalization</h1>
          <p className="text-sm text-muted-foreground">
            These settings shift how Mirror talks to you, what coping practices the Twin
            recommends, and which helplines we surface in a crisis. Skip whatever doesn't apply.
          </p>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {error}
          </div>
        ) : null}

        {!prefs ? (
          <Card className="rounded-xl shadow-sm">
            <CardContent className="grid h-32 place-items-center text-sm text-muted-foreground">
              Loading...
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {GROUPS.map((g) => (
              <Card key={g.key as string} className="rounded-xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">{g.title}</CardTitle>
                  <CardDescription>{g.hint}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {g.options.map((o) => {
                      const opt = o as { value: any; label: string; sub?: string }
                      const selected = prefs[g.key] === opt.value
                      const isSaving = savingKey === (g.key as string)
                      return (
                        <li key={String(opt.value)}>
                          <button
                            onClick={() => pick(g.key, opt.value as ProfilePrefs[typeof g.key])}
                            disabled={isSaving}
                            className={`w-full rounded-xl border p-3 text-left text-sm transition-colors ${
                              selected
                                ? "border-primary bg-primary/10"
                                : "bg-card hover:bg-muted/40"
                            } ${isSaving ? "opacity-60" : ""}`}
                            aria-pressed={selected}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">{opt.label}</span>
                              {selected ? (
                                <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase text-primary-foreground">
                                  selected
                                </span>
                              ) : null}
                            </div>
                            {opt.sub ? (
                              <div className="mt-1 text-xs text-muted-foreground">{opt.sub}</div>
                            ) : null}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {savedAt ? (
          <div className="text-[11px] text-muted-foreground">
            Saved {new Date(savedAt).toLocaleString()}
          </div>
        ) : null}

        <Card className="rounded-xl border-dashed shadow-none">
          <CardContent className="space-y-1 p-4 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">What we don't store</div>
            <ul className="list-disc pl-4">
              <li>No personality test results.</li>
              <li>No auto-detection from your text or face — you pick what you share.</li>
              <li>You can change or clear any of this any time. /privacy can wipe it all.</li>
            </ul>
          </CardContent>
        </Card>
      </main>
    </>
  )
}
