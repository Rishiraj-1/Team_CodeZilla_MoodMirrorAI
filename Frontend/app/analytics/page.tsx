"use client"

import { useEffect, useMemo, useState } from "react"
import { SiteHeader } from "@/components/site-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getAnalytics, type AnalyticsResponse } from "@/utils/api"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from "recharts"

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] // matches Python weekday()
const EMOTION_COLORS: Record<string, string> = {
  Happy: "#10b981",
  Calm: "#06b6d4",
  Neutral: "#94a3b8",
  Sad: "#6366f1",
  Anxious: "#f59e0b",
  Angry: "#ef4444",
}

function fmtHour(h: number) {
  const hh = ((h + 11) % 12) + 1
  const ampm = h >= 12 ? "PM" : "AM"
  return `${hh}${ampm}`
}

// Map a stress 0..100 value to an HSL background.
function heatColor(v: number | null, max: number) {
  if (v === null || v === undefined) return "transparent"
  // Scale by the max OR 100 (whichever larger) so colors don't lie.
  const scale = Math.max(max, 60, 1)
  const t = Math.min(1, v / scale)
  // 200 (cool) -> 0 (red)
  const hue = 200 - 200 * t
  const lightness = 90 - 35 * t
  return `hsl(${hue}, 80%, ${lightness}%)`
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(28)

  async function load(d = days) {
    setLoading(true)
    setError(null)
    try {
      const a = await getAnalytics(d)
      setData(a)
    } catch (e: any) {
      setError(e?.message || "Could not load analytics.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(days)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  const trendData = useMemo(() => {
    return (data?.weekly_resilience ?? []).map((w) => ({
      week: new Date(w.week_start).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      score: w.score ?? null,
      samples: w.samples,
    }))
  }, [data])

  const crisisChart = useMemo(() => {
    return (data?.crisis_per_day ?? []).map((d) => ({
      date: new Date(d.date).toLocaleDateString(undefined, {
        month: "numeric",
        day: "numeric",
      }),
      count: d.count,
    }))
  }, [data])

  const emotionRows = useMemo(() => {
    const shift = data?.emotion_shift
    if (!shift) return []
    const keys = new Set<string>([
      ...Object.keys(shift.this_week || {}),
      ...Object.keys(shift.last_week || {}),
    ])
    return Array.from(keys).map((k) => ({
      emotion: k,
      this: shift.this_week?.[k] ?? 0,
      last: shift.last_week?.[k] ?? 0,
      delta: shift.delta?.[k] ?? 0,
    })).sort((a, b) => b.this - a.this)
  }, [data])

  if (loading) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl px-4 py-6">
          <Card className="rounded-xl shadow-sm">
            <CardContent className="grid h-48 place-items-center text-sm text-muted-foreground">
              Crunching your numbers...
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
              <Button onClick={() => load(days)} className="rounded-full">
                Retry
              </Button>
            </CardContent>
          </Card>
        </main>
      </>
    )
  }

  if (!data?.sufficient_data) {
    const have = data?.n_readings ?? 0
    const need = data?.min_required ?? 5
    return (
      <>
        <SiteHeader />
        <main className="mx-auto w-full max-w-3xl px-4 py-6">
          <Card className="rounded-xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Analytics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Analytics needs at least {need} readings to compute trustworthy trends.
              </p>
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="text-xs text-muted-foreground">Readings so far</div>
                <div className="mt-1 text-2xl font-semibold">
                  {have}{" "}
                  <span className="text-base font-normal text-muted-foreground">/ {need}</span>
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

  const me = data.mirror_effectiveness
  const recovery = data.recovery_time_minutes
  const heatmapMax = data.heatmap_max ?? 0

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6">
        {/* Header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold leading-tight">Analytics</h1>
            <p className="text-sm text-muted-foreground">
              {data.n_readings} readings over the last {data.window_days} days. All numbers are
              computed from your real check-ins.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-full border bg-card p-1">
            {[7, 14, 28].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-full px-3 py-1.5 text-xs ${
                  days === d
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Top row: weekly resilience + mirror effectiveness + recovery time */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Card className="rounded-xl shadow-sm md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Weekly resilience trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48 rounded-xl border bg-muted/20 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-muted-foreground/20"
                    />
                    <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(v: any, k: any, ctx: any) => {
                        const samples = ctx?.payload?.samples ?? 0
                        return [`${v ?? "—"} (${samples} samples)`, "Resilience"]
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="hsl(var(--primary))"
                      strokeWidth={3}
                      dot={{ r: 5 }}
                      connectNulls={false}
                      name="Resilience"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                Each point is a separate computation of the resilience formula on that week's
                check-ins. Weeks with no data show as gaps.
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Mirror effectiveness</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {me ? (
                <>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Avg stress drop after a chat
                    </div>
                    <div
                      className={`mt-1 text-3xl font-bold ${
                        me.avg_drop > 0
                          ? "text-emerald-600"
                          : me.avg_drop < 0
                            ? "text-red-600"
                            : "text-foreground"
                      }`}
                    >
                      {me.avg_drop > 0 ? "−" : me.avg_drop < 0 ? "+" : ""}
                      {Math.abs(me.avg_drop)}
                      <span className="ml-1 text-base font-normal text-muted-foreground">
                        pts
                      </span>
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-2 text-xs text-muted-foreground">
                    Across <strong className="text-foreground">{me.samples}</strong> chat{me.samples === 1 ? "" : "s"} with readings in both the 6h before and 6h after.
                    Range {me.min_drop} to {me.max_drop} pts.
                  </div>
                </>
              ) : (
                <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                  Not enough Mirror chats with readings nearby yet. Talk to Mirror after a
                  check-in to start measuring impact.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Heatmap */}
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Stress by day & hour</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-separate" style={{ borderSpacing: "2px" }}>
                <thead>
                  <tr>
                    <th className="w-12"></th>
                    {Array.from({ length: 24 }, (_, h) => (
                      <th
                        key={h}
                        className="text-[10px] font-normal text-muted-foreground"
                        style={{ minWidth: 18 }}
                      >
                        {h % 3 === 0 ? fmtHour(h) : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAY_LABELS.map((label, d) => (
                    <tr key={label}>
                      <td className="pr-2 text-right text-xs text-muted-foreground">{label}</td>
                      {Array.from({ length: 24 }, (_, h) => {
                        const v = data.heatmap?.[d]?.[h] ?? null
                        const bg = heatColor(v, heatmapMax)
                        return (
                          <td
                            key={h}
                            className="rounded-sm border border-muted/40"
                            style={{
                              backgroundColor: bg,
                              minWidth: 18,
                              height: 22,
                            }}
                            title={
                              v === null
                                ? `${label} ${fmtHour(h)} — no data`
                                : `${label} ${fmtHour(h)} — avg stress ${v}`
                            }
                          />
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>Cooler = calmer.</span>
              <span className="inline-flex items-center gap-1">
                <span
                  className="inline-block h-3 w-6 rounded-sm"
                  style={{ background: "hsl(200, 80%, 90%)" }}
                />
                low stress
              </span>
              <span className="inline-flex items-center gap-1">
                <span
                  className="inline-block h-3 w-6 rounded-sm"
                  style={{ background: "hsl(0, 80%, 55%)" }}
                />
                high stress
              </span>
              <span className="ml-auto">
                Empty cells = no check-ins at that time.
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Bottom row: emotion shift + crisis sparkline + recovery time */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Card className="rounded-xl shadow-sm md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">This week vs last week</CardTitle>
            </CardHeader>
            <CardContent>
              {emotionRows.length === 0 ? (
                <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                  Not enough recent readings to compare.
                </div>
              ) : (
                <ul className="space-y-2">
                  {emotionRows.map((r) => {
                    const max = Math.max(r.this, r.last, 1)
                    const color = EMOTION_COLORS[r.emotion] ?? "hsl(var(--primary))"
                    return (
                      <li key={r.emotion} className="rounded-lg border bg-muted/10 p-2">
                        <div className="flex items-center justify-between text-sm">
                          <div className="font-medium">{r.emotion}</div>
                          <div className="text-xs text-muted-foreground">
                            this {r.this}% · last {r.last}%
                            <span
                              className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                r.delta > 0
                                  ? "bg-emerald-100 text-emerald-700"
                                  : r.delta < 0
                                    ? "bg-red-100 text-red-700"
                                    : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {r.delta > 0 ? "+" : ""}
                              {r.delta} pp
                            </span>
                          </div>
                        </div>
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          <div className="h-2 w-full rounded-full bg-muted">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${(r.this / max) * 100}%`,
                                backgroundColor: color,
                              }}
                            />
                          </div>
                          <div className="h-2 w-full rounded-full bg-muted">
                            <div
                              className="h-full rounded-full opacity-50"
                              style={{
                                width: `${(r.last / max) * 100}%`,
                                backgroundColor: color,
                              }}
                            />
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
              <div className="mt-3 text-[11px] text-muted-foreground">
                Top bar = this week. Faded bar = previous 7 days.
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Recovery</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-xs text-muted-foreground">
                  Median time from a stress peak to dropping below 50
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {recovery?.median_min != null ? `${recovery.median_min} min` : "—"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Across {recovery?.samples ?? 0} measured cycle{recovery?.samples === 1 ? "" : "s"}
                  {recovery?.samples === 0 ? "" : ". Peaks that never recovered are excluded."}
                </div>
              </div>

              <div>
                <div className="text-xs text-muted-foreground mb-1">Crisis events / day</div>
                <div className="h-24 rounded-lg border bg-muted/20 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={crisisChart}>
                      <Tooltip cursor={{ fill: "hsl(var(--muted))" }} />
                      <Bar dataKey="count" fill="#ef4444" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Logged events of level &gt;= elevated.
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  )
}
