"use client"

import { useEffect, useMemo, useState } from "react"
import { SiteHeader } from "@/components/site-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getDigitalTwin, type TwinResponse } from "@/utils/api"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts"

// ----- helpers --------------------------------------------------------------

function ResilienceArc({ score }: { score: number }) {
  // Simple SVG semicircle gauge. 0..100 -> 0..180deg.
  const angle = (Math.max(0, Math.min(100, score)) / 100) * 180
  const radius = 80
  const cx = 100
  const cy = 100
  // Polar to cartesian for the arc endpoint
  const rad = (Math.PI * (180 - angle)) / 180
  const x = cx + radius * Math.cos(rad)
  const y = cy - radius * Math.sin(rad)
  const largeArc = angle > 180 ? 1 : 0

  const color =
    score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444"

  return (
    <svg viewBox="0 0 200 110" className="w-full max-w-xs" aria-label={`Resilience score ${score}`}>
      {/* Background track */}
      <path
        d={`M 20 100 A ${radius} ${radius} 0 0 1 180 100`}
        stroke="hsl(var(--muted))"
        strokeWidth="14"
        fill="none"
        strokeLinecap="round"
      />
      {/* Filled arc */}
      <path
        d={`M 20 100 A ${radius} ${radius} 0 ${largeArc} 1 ${x} ${y}`}
        stroke={color}
        strokeWidth="14"
        fill="none"
        strokeLinecap="round"
      />
      <text
        x="100"
        y="85"
        textAnchor="middle"
        className="fill-foreground"
        fontSize="34"
        fontWeight="700"
      >
        {score}
      </text>
      <text
        x="100"
        y="105"
        textAnchor="middle"
        className="fill-muted-foreground"
        fontSize="12"
      >
        / 100
      </text>
    </svg>
  )
}

function RiskTag({ risk }: { risk: "low" | "medium" | "high" }) {
  const cls =
    risk === "high"
      ? "bg-red-100 text-red-700"
      : risk === "medium"
        ? "bg-amber-100 text-amber-700"
        : "bg-emerald-100 text-emerald-700"
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${cls}`}>
      {risk}
    </span>
  )
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function dayLabel(dateStr: string) {
  try {
    const d = new Date(dateStr)
    return DAY_LABELS[d.getDay()]
  } catch {
    return ""
  }
}

function fmtHour(h: number | null | undefined) {
  if (h === null || h === undefined) return "—"
  const hh = ((h + 11) % 12) + 1
  const ampm = h >= 12 ? "PM" : "AM"
  return `${hh}${ampm}`
}

function categoryEmoji(c: string) {
  switch (c) {
    case "breathing":
      return "🫁"
    case "journaling":
      return "📓"
    case "social":
      return "🤝"
    case "sleep":
      return "🌙"
    case "movement":
      return "🚶"
    case "professional":
      return "🩺"
    default:
      return "✨"
  }
}

// ----- page -----------------------------------------------------------------

export default function DigitalTwinPage() {
  const [data, setData] = useState<TwinResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const d = await getDigitalTwin()
      setData(d)
    } catch (e: any) {
      setError(e?.message || "Could not load your Digital Twin.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const sparkline = useMemo(() => {
    const s = data?.profile?.stress_sparkline || []
    return s.map((d) => ({
      day: dayLabel(d.date),
      stress: d.avg_stress ?? 0,
      hasData: d.samples > 0,
    }))
  }, [data])

  if (loading) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl px-4 py-6">
          <Card className="rounded-xl shadow-sm">
            <CardContent className="grid h-48 place-items-center text-sm text-muted-foreground">
              Loading your Digital Twin...
            </CardContent>
          </Card>
        </main>
      </>
    )
  }

  if (error) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl px-4 py-6">
          <Card className="rounded-xl shadow-sm">
            <CardContent className="space-y-3 py-6">
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
              <Button onClick={load} className="rounded-full">Retry</Button>
            </CardContent>
          </Card>
        </main>
      </>
    )
  }

  const profile = data?.profile
  const insights = data?.insights

  // Empty / insufficient-data state
  if (!profile?.sufficient_data) {
    const have = profile?.n_readings ?? 0
    const need = profile?.min_required ?? 5
    return (
      <>
        <SiteHeader />
        <main className="mx-auto w-full max-w-3xl px-4 py-6">
          <Card className="rounded-xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Your Digital Twin</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Your Twin learns from your check-ins. We keep it grounded in real numbers
                instead of guessing, so it needs at least {need} readings before showing
                a profile.
              </p>
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="text-xs text-muted-foreground">Readings so far</div>
                <div className="mt-1 text-2xl font-semibold">
                  {have} <span className="text-base font-normal text-muted-foreground">/ {need}</span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.min(100, (have / need) * 100)}%` }}
                  />
                </div>
              </div>
              <Button asChild className="rounded-full">
                <a href="/dashboard">Open the dashboard to check in</a>
              </Button>
            </CardContent>
          </Card>
        </main>
      </>
    )
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6">
        {/* Hero */}
        <Card className="rounded-xl shadow-sm">
          <CardContent className="grid grid-cols-1 gap-6 p-6 md:grid-cols-3">
            <div className="flex flex-col items-center justify-center md:items-start">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Resilience score
              </div>
              <ResilienceArc score={profile.resilience_score ?? 0} />
              <div className="text-xs text-muted-foreground">
                Computed from stress, recovery speed, crisis history, and consistency.
              </div>
            </div>

            <div className="md:col-span-2 space-y-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Where you are right now
              </div>
              <div className="text-xl font-semibold leading-tight">
                {insights?.headline || `Mostly ${profile.dominant_emotion}, avg stress ${profile.avg_stress}/100.`}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Dominant" value={profile.dominant_emotion ?? "—"} />
                <Stat label="Avg stress" value={`${profile.avg_stress ?? 0}`} />
                <Stat label="Volatility" value={`${profile.volatility ?? 0}`} />
                <Stat label="Streak" value={`${profile.streak_days ?? 0} d`} />
              </div>
              {insights?._degraded ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
                  AI narrative service is degraded; insights below are computed from your numbers without language modeling.
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Insights */}
        {insights?.insights?.length ? (
          <Card className="rounded-xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">What we noticed</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {insights.insights.map((it, i) => (
                <div key={i} className="rounded-xl border bg-muted/20 p-3">
                  <div className="text-sm font-medium">{it.title}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{it.detail}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {/* Forecast strip */}
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">7-day risk forecast</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {(insights?.forecast ?? []).map((f) => {
                const bg =
                  f.risk === "high"
                    ? "bg-red-50 border-red-200"
                    : f.risk === "medium"
                      ? "bg-amber-50 border-amber-200"
                      : "bg-emerald-50 border-emerald-200"
                return (
                  <div
                    key={f.day_offset}
                    className={`rounded-xl border p-3 text-center ${bg}`}
                    title={f.reason}
                  >
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {dayLabel(f.date)}
                    </div>
                    <div className="mt-1">
                      <RiskTag risk={f.risk} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              {(insights?.forecast ?? [])
                .filter((f) => f.risk !== "low")
                .slice(0, 3)
                .map((f) => (
                  <div key={f.day_offset} className="rounded-lg border bg-muted/20 p-2">
                    <span className="mr-2 font-medium text-foreground">
                      {dayLabel(f.date)}:
                    </span>
                    {f.reason}
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        {/* Trend + signals */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Card className="rounded-xl shadow-sm md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Last 7 days, daily avg stress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-56 rounded-xl border bg-muted/20 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparkline}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted-foreground/20" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="stress"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.15}
                      strokeWidth={2}
                      name="Avg stress"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Signals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row k="Best hour" v={fmtHour(profile.best_hour)} hint="When you tend to feel calmest" />
              <Row k="Worst hour" v={fmtHour(profile.worst_hour)} hint="When stress tends to peak" />
              <Row
                k="Recovery speed"
                v={profile.recovery_speed != null ? `−${profile.recovery_speed}/step` : "—"}
                hint="Avg drop after a high-stress reading"
              />
              <Row
                k="Crisis events"
                v={`${profile.crisis_count ?? 0} in ${profile.window_days}d`}
                hint="Logged level >= elevated"
              />
              <Row k="Burnout (avg)" v={`${profile.avg_burnout ?? 0}/100`} />
              <div>
                <div className="text-xs text-muted-foreground">Trigger words</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(profile.trigger_words ?? []).length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      Not enough text yet to surface patterns.
                    </span>
                  ) : (
                    (profile.trigger_words ?? []).map((w) => (
                      <span
                        key={w}
                        className="rounded-full bg-muted px-2 py-0.5 text-[11px]"
                      >
                        {w}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recommendations */}
        {insights?.recommendations?.length ? (
          <Card className="rounded-xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Personalized for you</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {insights.recommendations.map((r, i) => (
                <div key={i} className="rounded-xl border bg-muted/20 p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl" aria-hidden>
                      {categoryEmoji(r.category)}
                    </span>
                    <div className="text-sm font-medium">{r.title}</div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{r.why}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </main>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold">{value}</div>
    </div>
  )
}

function Row({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/20 p-2">
      <div>
        <div className="text-xs text-muted-foreground">{k}</div>
        {hint ? <div className="text-[11px] text-muted-foreground/80">{hint}</div> : null}
      </div>
      <div className="text-sm font-medium">{v}</div>
    </div>
  )
}
