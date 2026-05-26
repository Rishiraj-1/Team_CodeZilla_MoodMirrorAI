"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { BreathingCircle } from "./breathing-circle"
import { GroundingExercise } from "./grounding-exercise"
import { fetchWellbeingSummary, getSupportContacts, getHelplines, type Helpline } from "@/utils/api"

export type CrisisLevel = "none" | "watch" | "elevated" | "crisis"

type SupportContact = { id: string; name: string; phone: string }

const FALLBACK_HELPLINES: Helpline[] = [
  { label: "iCall", number: "9152987821", region: "India" },
  { label: "Vandrevala", number: "1860-2662-345", region: "India, 24/7" },
  { label: "AASRA", number: "9820466726", region: "India, 24/7" },
]

type Props = {
  open: boolean
  /** "crisis" -> full screen, urgent. "elevated" -> softer modal, dismissable. */
  level: Exclude<CrisisLevel, "none" | "watch">
  /** Brief explanation of why this opened, e.g. "from your message just now". */
  reason?: string
  onClose: () => void
}

/**
 * Full-screen calm pause. Deliberately not alarming:
 *   - soft gradient, not red
 *   - language is "pause with me", not "crisis detected"
 *   - dismissable -- the user is in control
 */
export function CrisisModal({ open, level, reason, onClose }: Props) {
  const [tab, setTab] = useState<"breathe" | "ground" | "reach">("breathe")
  const [contacts, setContacts] = useState<SupportContact[]>([])
  const [helplines, setHelplines] = useState<Helpline[]>(FALLBACK_HELPLINES)
  const [summary, setSummary] = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Fetch region-aware helplines as soon as the modal opens. Defaults
  // (India) are already shown, so this is a soft-upgrade.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    getHelplines()
      .then((res) => {
        if (cancelled) return
        if (Array.isArray(res?.helplines) && res.helplines.length > 0) {
          setHelplines(res.helplines)
        }
      })
      .catch(() => {
        // Keep fallback helplines silently.
      })
    return () => {
      cancelled = true
    }
  }, [open])

  // Load support contacts + wellbeing summary lazily when "Reach out" is opened.
  useEffect(() => {
    if (!open || tab !== "reach") return
    let cancelled = false
    setSummaryLoading(true)
    setSummaryError(null)
    Promise.all([
      getSupportContacts().catch(() => ({ contacts: [] as SupportContact[] })),
      fetchWellbeingSummary().catch((e) => ({ message: "", _err: e?.message })),
    ])
      .then(([contactsRes, summaryRes]: any[]) => {
        if (cancelled) return
        const list: SupportContact[] = Array.isArray(contactsRes?.contacts)
          ? contactsRes.contacts
          : Array.isArray(contactsRes)
            ? contactsRes
            : []
        setContacts(list)
        if (summaryRes?._err) setSummaryError(summaryRes._err)
        setSummary(
          summaryRes?.message ||
            "Hey -- I'm having a hard time today and could really use a kind voice. Could you call me, or sit with me for a bit?",
        )
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, tab])

  if (!open) return null

  async function copySummary() {
    if (!summary) return
    try {
      await navigator.clipboard.writeText(summary)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  function smsHref(phone?: string) {
    const body = encodeURIComponent(summary || "")
    if (phone) return `sms:${phone.replace(/\s+/g, "")}?body=${body}`
    return `sms:?body=${body}`
  }
  function whatsappHref(phone?: string) {
    const body = encodeURIComponent(summary || "")
    const cleaned = (phone || "").replace(/[^\d+]/g, "")
    return cleaned ? `https://wa.me/${cleaned.replace(/^\+/, "")}?text=${body}` : `https://wa.me/?text=${body}`
  }

  const isCrisis = level === "crisis"

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="A gentle pause"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Soft backdrop -- intentionally NOT red */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-emerald-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800"
      />
      <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="border-b bg-muted/30 px-5 py-4">
          <div className="text-sm font-medium text-muted-foreground">
            {isCrisis ? "A gentle pause" : "Slowing down for a moment"}
          </div>
          <div className="mt-1 text-lg font-semibold">
            I noticed something in what you shared. Let's take this slowly together.
          </div>
          {reason ? (
            <div className="mt-1 text-xs text-muted-foreground">{reason}</div>
          ) : null}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b px-3 py-2 text-sm">
          {(
            [
              { id: "breathe", label: "Breathe" },
              { id: "ground", label: "Ground yourself" },
              { id: "reach", label: "Reach out" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full px-3 py-1.5 transition-colors ${
                tab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="px-5 py-5">
          {tab === "breathe" ? (
            <div className="grid place-items-center py-6">
              <BreathingCircle />
            </div>
          ) : null}

          {tab === "ground" ? (
            <GroundingExercise onDone={() => setTab("breathe")} />
          ) : null}

          {tab === "reach" ? (
            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/30 p-3">
                <div className="text-xs font-medium text-muted-foreground">
                  Helplines
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {helplines.map((h) => (
                    <a
                      key={`${h.label}-${h.number}`}
                      href={`tel:${h.number.replace(/\s+/g, "")}`}
                      className="rounded-lg border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted"
                    >
                      <div className="font-medium">{h.label}</div>
                      <div className="text-xs text-muted-foreground">{h.number}</div>
                      <div className="text-[11px] text-muted-foreground">{h.region}</div>
                    </a>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border bg-muted/30 p-3">
                <div className="text-xs font-medium text-muted-foreground">
                  Tell someone you trust
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  We've drafted a short message you can send. Edit it however you like.
                </p>
                <textarea
                  value={summary ?? ""}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-md border bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  placeholder={summaryLoading ? "Drafting a message..." : "Type a message"}
                />
                {summaryError ? (
                  <div className="mt-1 text-[11px] text-amber-700">
                    Couldn't reach the AI; using a default message.
                  </div>
                ) : null}

                {contacts.length === 0 ? (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <a
                      href={smsHref()}
                      className="rounded-lg border bg-card px-3 py-2 text-center text-sm transition-colors hover:bg-muted"
                    >
                      Open SMS
                    </a>
                    <a
                      href={whatsappHref()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border bg-card px-3 py-2 text-center text-sm transition-colors hover:bg-muted"
                    >
                      Open WhatsApp
                    </a>
                    <button
                      onClick={copySummary}
                      className="rounded-lg border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted"
                    >
                      {copied ? "Copied" : "Copy text"}
                    </button>
                  </div>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {contacts.map((c) => (
                      <li
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-2"
                      >
                        <div className="text-sm">
                          <div className="font-medium">{c.name}</div>
                          <div className="text-xs text-muted-foreground">{c.phone}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            href={`tel:${c.phone.replace(/\s+/g, "")}`}
                            className="rounded-full border px-3 py-1 text-xs hover:bg-muted"
                          >
                            Call
                          </a>
                          <a
                            href={smsHref(c.phone)}
                            className="rounded-full border px-3 py-1 text-xs hover:bg-muted"
                          >
                            SMS
                          </a>
                          <a
                            href={whatsappHref(c.phone)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-full border px-3 py-1 text-xs hover:bg-muted"
                          >
                            WhatsApp
                          </a>
                        </div>
                      </li>
                    ))}
                    <li className="flex justify-end">
                      <button
                        onClick={copySummary}
                        className="rounded-full border px-3 py-1 text-xs hover:bg-muted"
                      >
                        {copied ? "Copied" : "Copy text"}
                      </button>
                    </li>
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t bg-muted/20 px-5 py-3">
          <div className="text-xs text-muted-foreground">
            You're in control. Stay as long as you'd like.
          </div>
          <Button onClick={onClose} variant="ghost" className="rounded-full">
            I'm okay for now
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Inline soft banner used for level=elevated where a full modal would be
 * too disruptive. Doesn't lock the screen; offers the same actions
 * one click away.
 */
export function CrisisInlineBanner({
  level,
  onOpen,
}: {
  level: CrisisLevel
  onOpen: () => void
}) {
  if (level === "none" || level === "watch") return null

  const isCrisis = level === "crisis"
  return (
    <div
      role="status"
      className={`rounded-xl border p-3 text-sm ${
        isCrisis
          ? "border-amber-300 bg-amber-50 text-amber-900"
          : "border-blue-200 bg-blue-50 text-blue-900"
      }`}
    >
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-medium">
            {isCrisis ? "Want to pause for a moment?" : "I noticed things feel heavy."}
          </div>
          <div className="text-xs opacity-80">
            We can breathe together, ground yourself, or reach someone you trust.
          </div>
        </div>
        <Button onClick={onOpen} size="sm" className="rounded-full">
          Open
        </Button>
      </div>
    </div>
  )
}
