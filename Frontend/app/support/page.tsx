"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { SiteHeader } from "@/components/site-header"
import {
  addSupportContact,
  getSupportContacts,
  deleteSupportContact,
  getSupportReport,
  type SupportReport,
} from "@/utils/api"

type Contact = { id?: string; name: string; phone: string; created_at?: string }
type Audience = "friend" | "family" | "therapist"

const AUDIENCE_LABELS: Record<Audience, string> = {
  friend: "Friend",
  family: "Family",
  therapist: "Therapist",
}

const SEVERITY_CLASSES: Record<string, { bar: string; bg: string; text: string; ring: string }> = {
  green: {
    bar: "bg-emerald-500",
    bg: "bg-emerald-50 border-emerald-200",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
  },
  amber: {
    bar: "bg-amber-500",
    bg: "bg-amber-50 border-amber-200",
    text: "text-amber-700",
    ring: "ring-amber-200",
  },
  red: {
    bar: "bg-red-500",
    bg: "bg-red-50 border-red-200",
    text: "text-red-700",
    ring: "ring-red-200",
  },
  unknown: {
    bar: "bg-muted",
    bg: "bg-muted/30 border",
    text: "text-muted-foreground",
    ring: "ring-muted",
  },
}

function severityLabel(level: string) {
  switch (level) {
    case "red":
      return "Heavy week"
    case "amber":
      return "Watch closely"
    case "green":
      return "Steady"
    default:
      return "Not enough data"
  }
}

function smsHref(phone?: string, body?: string) {
  const b = encodeURIComponent(body || "")
  if (phone) return `sms:${phone.replace(/\s+/g, "")}?body=${b}`
  return `sms:?body=${b}`
}

function whatsappHref(phone?: string, body?: string) {
  const b = encodeURIComponent(body || "")
  const cleaned = (phone || "").replace(/[^\d+]/g, "")
  return cleaned ? `https://wa.me/${cleaned.replace(/^\+/, "")}?text=${b}` : `https://wa.me/?text=${b}`
}

export default function SupportPage() {
  // Contacts
  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [contactsError, setContactsError] = useState<string | null>(null)

  // Wellbeing report
  const [report, setReport] = useState<SupportReport | null>(null)
  const [reportLoading, setReportLoading] = useState(true)
  const [reportError, setReportError] = useState<string | null>(null)

  // Active audience tab
  const [tab, setTab] = useState<Audience>("friend")

  // Per-contact share modal
  const [shareFor, setShareFor] = useState<Contact | null>(null)
  const [shareAudience, setShareAudience] = useState<Audience>("friend")
  const [shareText, setShareText] = useState<string>("")
  const [copied, setCopied] = useState(false)

  // Load contacts
  useEffect(() => {
    ;(async () => {
      try {
        const data = await getSupportContacts()
        const arr = Array.isArray(data)
          ? data
          : Object.entries(data || {}).map(([id, v]: any) => ({ id, ...(v as any) }))
        setContacts(arr)
      } catch {
        setContactsError("Could not load contacts. Are you signed in?")
        setContacts([])
      }
    })()
  }, [])

  // Load wellbeing report
  async function loadReport() {
    setReportLoading(true)
    setReportError(null)
    try {
      const r = await getSupportReport()
      setReport(r)
    } catch (e: any) {
      setReportError(e?.message || "Could not generate the wellbeing report.")
    } finally {
      setReportLoading(false)
    }
  }
  useEffect(() => {
    loadReport()
  }, [])

  async function onAdd() {
    if (!name.trim() || !phone.trim()) return
    try {
      const res = await addSupportContact(name.trim(), phone.trim())
      setContacts((prev) => [
        { id: res?.id, name: name.trim(), phone: phone.trim() },
        ...(prev || []),
      ])
      setName("")
      setPhone("")
    } catch {
      setContactsError("Failed to add contact")
    }
  }

  async function onRemove(contactId: string) {
    try {
      await deleteSupportContact(contactId)
      setContacts((prev) => prev?.filter((c) => c.id !== contactId) || [])
    } catch {
      setContactsError("Failed to remove contact")
    }
  }

  // Pull the right narrative per audience.
  const summary = report?.summary
  const narrative: string = useMemo(() => {
    if (!summary) return ""
    return tab === "friend"
      ? summary.for_friend
      : tab === "family"
        ? summary.for_family
        : summary.for_therapist
  }, [summary, tab])

  const suggested = useMemo(() => {
    return (report?.suggested_actions ?? []).filter((a) => a.audience === tab)
  }, [report, tab])

  // Open share modal pre-filled with the friend narrative by default.
  function openShare(c: Contact) {
    setShareFor(c)
    const a: Audience = "friend"
    setShareAudience(a)
    setShareText(summary?.for_friend || "")
    setCopied(false)
  }
  function pickShareAudience(a: Audience) {
    setShareAudience(a)
    if (!summary) return
    setShareText(
      a === "friend" ? summary.for_friend : a === "family" ? summary.for_family : summary.for_therapist,
    )
    setCopied(false)
  }
  async function copyShare() {
    if (!shareText) return
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  const sev = report?.severity
  const sevClasses = SEVERITY_CLASSES[sev?.level || "unknown"]

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
        {/* Severity card */}
        <Card className={`rounded-xl shadow-sm border ${sevClasses.bg}`}>
          <CardContent className="p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Wellbeing severity
                </div>
                <div className={`mt-1 text-2xl font-bold ${sevClasses.text}`}>
                  {severityLabel(sev?.level || "unknown")}
                </div>
                <div className="text-sm text-muted-foreground">
                  {reportLoading
                    ? "Computing from your last 14 days..."
                    : sev?.sufficient_data
                      ? `Composite score ${sev?.score}/100 from ${sev?.context?.n_readings} check-ins.`
                      : `Need ${sev?.context?.min_required ?? 5} check-ins; have ${sev?.context?.n_readings ?? 0}.`}
                </div>
              </div>

              {sev?.sufficient_data ? (
                <div className="w-full md:w-72">
                  <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full transition-all ${sevClasses.bar}`}
                      style={{ width: `${sev?.score ?? 0}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
                    <span>Steady</span>
                    <span>Watch</span>
                    <span>Heavy</span>
                  </div>
                </div>
              ) : null}
            </div>

            {sev?.sufficient_data && (sev.factors?.length ?? 0) > 0 ? (
              <ul className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                {sev.factors.map((f, i) => (
                  <li
                    key={i}
                    className="rounded-lg border bg-card/60 px-3 py-2 text-xs text-muted-foreground"
                  >
                    <span className="mr-1">·</span>
                    {f}
                  </li>
                ))}
              </ul>
            ) : null}

            {reportError ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                {reportError}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={loadReport}
                  className="ml-3 rounded-full"
                >
                  Retry
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Wellbeing narrative + audience tabs */}
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <CardTitle className="text-base">Share your wellbeing picture</CardTitle>
              <CardDescription>
                A short, AI-drafted summary of your last 14 days, written differently for each kind of
                person you might share it with.
              </CardDescription>
            </div>
            <div className="flex items-center gap-1 rounded-full border bg-card p-1">
              {(["friend", "family", "therapist"] as Audience[]).map((a) => (
                <button
                  key={a}
                  onClick={() => setTab(a)}
                  className={`rounded-full px-3 py-1.5 text-xs ${
                    tab === a
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {AUDIENCE_LABELS[a]}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary?._degraded ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
                AI narrative is degraded; using a profile-grounded fallback.
              </div>
            ) : null}

            <div className="rounded-xl border bg-muted/20 p-4 text-sm leading-relaxed whitespace-pre-wrap">
              {reportLoading ? (
                <span className="text-muted-foreground">Drafting...</span>
              ) : narrative ? (
                narrative
              ) : (
                <span className="text-muted-foreground">No narrative available yet.</span>
              )}
            </div>

            {suggested.length > 0 ? (
              <div className="rounded-lg border bg-muted/10 p-3">
                <div className="text-xs font-medium text-muted-foreground">
                  Suggested action
                </div>
                <ul className="mt-1 space-y-1 text-sm">
                  {suggested.map((a, i) => (
                    <li key={i} className="text-foreground">
                      → {a.action}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  if (!narrative) return
                  try {
                    await navigator.clipboard.writeText(narrative)
                  } catch {
                    /* ignore */
                  }
                }}
                disabled={!narrative}
                className="rounded-full"
              >
                Copy text
              </Button>
              <a
                href={smsHref(undefined, narrative)}
                className={`rounded-full border px-3 py-1.5 text-sm hover:bg-muted ${
                  narrative ? "" : "pointer-events-none opacity-50"
                }`}
              >
                Open SMS
              </a>
              <a
                href={whatsappHref(undefined, narrative)}
                target="_blank"
                rel="noopener noreferrer"
                className={`rounded-full border px-3 py-1.5 text-sm hover:bg-muted ${
                  narrative ? "" : "pointer-events-none opacity-50"
                }`}
              >
                Open WhatsApp
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Trusted contacts */}
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Trusted contacts</CardTitle>
            <CardDescription>
              Pick someone to share the right version of your wellbeing summary with.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {contactsError ? (
              <div className="text-sm text-red-600">{contactsError}</div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="sm:w-60"
              />
              <Input
                placeholder="Phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="sm:w-60"
              />
              <Button onClick={onAdd}>Add contact</Button>
            </div>

            {contacts === null ? (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                Loading...
              </div>
            ) : contacts.length === 0 ? (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                No contacts yet. Add someone you trust to start.
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {contacts.map((c) => (
                  <li key={c.id || c.phone} className="rounded-lg border bg-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{c.name}</div>
                        <div className="truncate text-sm text-muted-foreground">{c.phone}</div>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openShare(c)}
                          aria-label={`Share with ${c.name}`}
                          className="rounded-full"
                        >
                          Share
                        </Button>
                        {c.id ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onRemove(c.id!)}
                            className="rounded-full text-red-600 hover:bg-red-50 hover:text-red-700"
                            aria-label={`Remove ${c.name}`}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Share modal */}
      {shareFor ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Share with ${shareFor.name}`}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="absolute inset-0 bg-background/70 backdrop-blur"
            onClick={() => setShareFor(null)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border bg-card shadow-2xl">
            <div className="border-b px-5 py-3">
              <div className="text-sm text-muted-foreground">Share with</div>
              <div className="text-lg font-semibold">{shareFor.name}</div>
              <div className="text-xs text-muted-foreground">{shareFor.phone}</div>
            </div>

            <div className="space-y-3 px-5 py-4">
              <div className="flex items-center gap-1 rounded-full border bg-card p-1">
                {(["friend", "family", "therapist"] as Audience[]).map((a) => (
                  <button
                    key={a}
                    onClick={() => pickShareAudience(a)}
                    className={`rounded-full px-3 py-1.5 text-xs ${
                      shareAudience === a
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {AUDIENCE_LABELS[a]}
                  </button>
                ))}
              </div>

              <textarea
                value={shareText}
                onChange={(e) => setShareText(e.target.value)}
                rows={6}
                className="w-full rounded-md border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                placeholder="Edit your message before sending..."
              />

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <a
                  href={`tel:${shareFor.phone.replace(/\s+/g, "")}`}
                  className="rounded-lg border bg-card px-3 py-2 text-center text-sm hover:bg-muted"
                >
                  Call
                </a>
                <a
                  href={smsHref(shareFor.phone, shareText)}
                  className="rounded-lg border bg-card px-3 py-2 text-center text-sm hover:bg-muted"
                >
                  SMS
                </a>
                <a
                  href={whatsappHref(shareFor.phone, shareText)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border bg-card px-3 py-2 text-center text-sm hover:bg-muted"
                >
                  WhatsApp
                </a>
              </div>
              <Button onClick={copyShare} variant="outline" size="sm" className="rounded-full">
                {copied ? "Copied" : "Copy text"}
              </Button>
            </div>

            <div className="flex justify-end border-t px-5 py-3">
              <Button onClick={() => setShareFor(null)} variant="ghost" className="rounded-full">
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
