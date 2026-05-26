"use client"

import { useEffect, useState } from "react"
import { SiteHeader } from "@/components/site-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  getConsent,
  updateConsent,
  getTransparencyLog,
  exportMyData,
  deleteAllMyData,
  type ConsentPrefs,
  type TransparencyItem,
} from "@/utils/api"

type Tab = "consent" | "transparency" | "data"

const CONSENT_DEFS: {
  key: keyof Omit<ConsentPrefs, "updated_at">
  label: string
  detail: string
  consequence: string
}[] = [
  {
    key: "allow_text",
    label: "Analyze text inputs",
    detail: "Required to use Quick Notes and Mirror chat.",
    consequence: "Off: text-mode analysis is skipped entirely.",
  },
  {
    key: "allow_voice",
    label: "Analyze voice clips",
    detail: "Required to use the voice recorder on the dashboard.",
    consequence: "Off: voice clips never leave the page.",
  },
  {
    key: "allow_face",
    label: "Analyze face frames",
    detail: "Required to use the camera on the dashboard.",
    consequence: "Off: camera frames never leave the page.",
  },
  {
    key: "allow_text_storage",
    label: "Keep raw text alongside analysis",
    detail:
      "When ON, your written words are stored alongside the emotion reading. When OFF, only metrics + emotion are kept.",
    consequence: "Off: trigger-word analysis in the Twin will have less to work with.",
  },
  {
    key: "allow_mirror_history",
    label: "Persist Mirror conversations",
    detail:
      "When ON, Mirror remembers your chats across sessions. When OFF, each turn still works but nothing is saved.",
    consequence: "Off: Mirror won't reference past conversations.",
  },
  {
    key: "allow_crisis_log",
    label: "Log crisis events",
    detail:
      "When ON, elevated/crisis-level moments are logged for the Reports & Twin. The crisis classifier still runs either way for safety.",
    consequence: "Off: severity score loses one of its strongest signals.",
  },
]

function Toggle({
  on,
  onChange,
  disabled,
  ariaLabel,
}: {
  on: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  ariaLabel: string
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        on ? "bg-primary" : "bg-muted"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-card shadow transition-transform ${
          on ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  )
}

function fmtTs(s?: string) {
  if (!s) return ""
  try {
    return new Date(s).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return s
  }
}

function emotionColor(e?: string) {
  switch (e) {
    case "Happy":
      return "bg-emerald-100 text-emerald-700"
    case "Calm":
      return "bg-cyan-100 text-cyan-700"
    case "Anxious":
      return "bg-amber-100 text-amber-700"
    case "Sad":
      return "bg-indigo-100 text-indigo-700"
    case "Angry":
      return "bg-red-100 text-red-700"
    default:
      return "bg-muted text-muted-foreground"
  }
}

export default function PrivacyPage() {
  const [tab, setTab] = useState<Tab>("consent")

  // Consent
  const [consent, setConsent] = useState<ConsentPrefs | null>(null)
  const [consentSaving, setConsentSaving] = useState<string | null>(null)
  const [consentError, setConsentError] = useState<string | null>(null)

  // Transparency
  const [items, setItems] = useState<TransparencyItem[] | null>(null)
  const [transparencyError, setTransparencyError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Data
  const [busyExport, setBusyExport] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [busyDelete, setBusyDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState("")
  const [deleteResults, setDeleteResults] = useState<Record<string, string> | null>(null)

  // Load consent + transparency on mount
  useEffect(() => {
    ;(async () => {
      try {
        const c = await getConsent()
        setConsent(c)
      } catch (e: any) {
        setConsentError(e?.message || "Could not load privacy settings")
      }
    })()
    ;(async () => {
      try {
        const t = await getTransparencyLog(30)
        setItems(t.items || [])
      } catch (e: any) {
        setTransparencyError(e?.message || "Could not load transparency log")
      }
    })()
  }, [])

  async function flipConsent(key: keyof ConsentPrefs, next: boolean) {
    if (!consent) return
    setConsentSaving(key as string)
    setConsentError(null)
    try {
      const updated = await updateConsent({ [key]: next } as Partial<ConsentPrefs>)
      setConsent(updated)
    } catch (e: any) {
      setConsentError(e?.message || "Failed to save")
    } finally {
      setConsentSaving(null)
    }
  }

  async function onExport() {
    setBusyExport(true)
    setExportError(null)
    try {
      await exportMyData()
    } catch (e: any) {
      setExportError(e?.message || "Export failed")
    } finally {
      setBusyExport(false)
    }
  }

  async function onDelete() {
    if (deleteConfirm !== "DELETE") return
    setBusyDelete(true)
    setDeleteError(null)
    try {
      const r = await deleteAllMyData("DELETE")
      setDeleteResults(r.results || {})
      // Refresh consent + transparency to reflect the wipe.
      try {
        const c = await getConsent()
        setConsent(c)
      } catch {
        /* ignore */
      }
      try {
        const t = await getTransparencyLog(30)
        setItems(t.items || [])
      } catch {
        /* ignore */
      }
    } catch (e: any) {
      setDeleteError(e?.message || "Delete failed")
    } finally {
      setBusyDelete(false)
      setDeleteOpen(false)
      setDeleteConfirm("")
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold leading-tight">Privacy &amp; Ethics</h1>
          <p className="text-sm text-muted-foreground">
            Your data, your choices. Toggles below have real consequences in the system, not just
            in the UI. The transparency log shows exactly what we said about you and why.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-full border bg-card p-1 w-fit">
          {(
            [
              { id: "consent", label: "Consent" },
              { id: "transparency", label: "Transparency" },
              { id: "data", label: "Your data" },
            ] as { id: Tab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full px-3 py-1.5 text-xs ${
                tab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* CONSENT */}
        {tab === "consent" ? (
          <Card className="rounded-xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">What we may do with your inputs</CardTitle>
              <CardDescription>
                Defaults are on. Disable anything that doesn't sit right.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {consentError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  {consentError}
                </div>
              ) : null}
              {!consent ? (
                <div className="text-sm text-muted-foreground">Loading...</div>
              ) : (
                <ul className="space-y-2">
                  {CONSENT_DEFS.map((d) => {
                    const on = consent[d.key] as boolean
                    return (
                      <li
                        key={d.key}
                        className="flex items-start gap-3 rounded-xl border bg-muted/10 p-3"
                      >
                        <Toggle
                          on={on}
                          onChange={(next) => flipConsent(d.key, next)}
                          disabled={consentSaving === (d.key as string)}
                          ariaLabel={d.label}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{d.label}</div>
                          <div className="text-xs text-muted-foreground">{d.detail}</div>
                          <div className="mt-1 text-[11px] text-amber-700">{d.consequence}</div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
              {consent?.updated_at ? (
                <div className="text-[11px] text-muted-foreground">
                  Last updated {fmtTs(consent.updated_at)}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {/* TRANSPARENCY */}
        {tab === "transparency" ? (
          <Card className="rounded-xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">What we said about you, and why</CardTitle>
              <CardDescription>
                Every reading the engine produced, with the same explanation we used internally.
                Nothing extra is kept; this just surfaces the existing record.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {transparencyError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  {transparencyError}
                </div>
              ) : null}
              {!items ? (
                <div className="text-sm text-muted-foreground">Loading...</div>
              ) : items.length === 0 ? (
                <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                  No readings yet. Once you check in, every reading will appear here with its full
                  reasoning.
                </div>
              ) : (
                <ul className="space-y-2">
                  {items.map((it) => {
                    const isOpen = expanded === it.id
                    const conf =
                      typeof it.confidence === "number" ? Math.round(it.confidence * 100) : null
                    const m = it.metrics
                    const cri = it.crisis
                    return (
                      <li key={it.id} className="overflow-hidden rounded-xl border">
                        <button
                          onClick={() => setExpanded(isOpen ? null : it.id)}
                          className="flex w-full items-center justify-between gap-3 bg-card px-3 py-2 text-left hover:bg-muted/30"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${emotionColor(
                                it.emotion,
                              )}`}
                            >
                              {it.emotion || "—"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {it.source} · {fmtTs(it.created_at)} · {conf ?? "—"}%
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {isOpen ? "Hide" : "Why?"}
                          </span>
                        </button>
                        {isOpen ? (
                          <div className="space-y-2 border-t bg-muted/20 px-3 py-3 text-sm">
                            {it.explanation ? (
                              <div>
                                <span className="mr-2 rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                  Reasoning
                                </span>
                                {it.explanation}
                              </div>
                            ) : null}
                            {m ? (
                              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                                <Cell label="Stress" value={m.stress_score} />
                                <Cell label="Burnout" value={m.burnout_risk} />
                                <Cell label="Cog. load" value={m.cognitive_load} />
                                <Cell label="Volatility" value={m.emotional_volatility} />
                                <Cell label="Crisis" value={m.crisis_probability} crisis />
                              </div>
                            ) : null}
                            {cri && cri.level && cri.level !== "none" ? (
                              <div className="rounded-lg border bg-card p-2 text-xs">
                                <span className="mr-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                  Crisis
                                </span>
                                <span className="font-medium">{cri.level}</span>
                                {cri.reasons?.length ? (
                                  <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                                    {cri.reasons.map((r: string, i: number) => (
                                      <li key={i}>{r}</li>
                                    ))}
                                  </ul>
                                ) : null}
                              </div>
                            ) : null}
                            {it.inputs ? (
                              <div className="text-[11px] text-muted-foreground">
                                Inputs used: text {it.inputs.has_text ? "✓" : "✗"} · voice{" "}
                                {it.inputs.has_voice ? "✓" : "✗"} · face{" "}
                                {it.inputs.has_face ? "✓" : "✗"}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}

        {/* DATA */}
        {tab === "data" ? (
          <Card className="rounded-xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Your data</CardTitle>
              <CardDescription>
                Take it with you, or delete it. We don't keep backups you can't reach.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="text-sm font-medium">Export everything</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Downloads a single JSON file containing readings, Mirror chats, crisis events,
                  support contacts, and your privacy preferences.
                </p>
                <div className="mt-3">
                  <Button onClick={onExport} disabled={busyExport} className="rounded-full">
                    {busyExport ? "Preparing..." : "Download my data"}
                  </Button>
                </div>
                {exportError ? (
                  <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                    {exportError}
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-red-200 bg-red-50/40 p-4">
                <div className="text-sm font-medium text-red-700">Delete everything</div>
                <p className="mt-1 text-xs text-red-700/80">
                  Wipes every record we hold for you across all features. This cannot be undone.
                </p>
                <div className="mt-3">
                  <Button
                    variant="destructive"
                    onClick={() => setDeleteOpen(true)}
                    className="rounded-full bg-red-600 hover:bg-red-700"
                  >
                    Delete my data
                  </Button>
                </div>
                {deleteError ? (
                  <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                    {deleteError}
                  </div>
                ) : null}
                {deleteResults ? (
                  <div className="mt-3 rounded-lg border bg-card p-2 text-xs">
                    <div className="font-medium">Deleted</div>
                    <ul className="mt-1 space-y-0.5 text-muted-foreground">
                      {Object.entries(deleteResults).map(([k, v]) => (
                        <li key={k}>
                          <span className="font-mono">{k}</span>: {v}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </main>

      {/* Delete confirm modal */}
      {deleteOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm deletion"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="absolute inset-0 bg-background/70 backdrop-blur"
            onClick={() => !busyDelete && setDeleteOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border bg-card shadow-2xl">
            <div className="border-b px-5 py-3">
              <div className="text-sm text-muted-foreground">Just to be sure</div>
              <div className="text-lg font-semibold">Delete all your MoodMirror data?</div>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm">
              <p className="text-muted-foreground">
                This wipes readings, Mirror chats, crisis events, support contacts, and your
                preferences. There's no recovery.
              </p>
              <div>
                <label className="text-xs text-muted-foreground" htmlFor="delete-confirm">
                  Type <span className="font-mono font-semibold text-foreground">DELETE</span>{" "}
                  to confirm
                </label>
                <Input
                  id="delete-confirm"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
              <Button
                variant="ghost"
                onClick={() => {
                  setDeleteOpen(false)
                  setDeleteConfirm("")
                }}
                disabled={busyDelete}
                className="rounded-full"
              >
                Cancel
              </Button>
              <Button
                onClick={onDelete}
                disabled={busyDelete || deleteConfirm !== "DELETE"}
                className="rounded-full bg-red-600 hover:bg-red-700"
              >
                {busyDelete ? "Deleting..." : "Delete everything"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function Cell({
  label,
  value,
  crisis,
}: {
  label: string
  value?: number
  crisis?: boolean
}) {
  const v = typeof value === "number" ? value : null
  const colorCls = crisis
    ? v != null && v >= 50
      ? "text-red-600"
      : v != null && v >= 20
        ? "text-amber-600"
        : "text-emerald-600"
    : v != null && v >= 70
      ? "text-red-600"
      : v != null && v >= 40
        ? "text-amber-600"
        : "text-emerald-600"
  return (
    <div className="rounded-lg border bg-card p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${colorCls}`}>{v ?? "—"}</div>
    </div>
  )
}
