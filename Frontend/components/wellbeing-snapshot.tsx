"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { EngineMetrics } from "./emotion-card"

type Props = {
  metrics?: EngineMetrics
  emotion?: string
  explanation?: string
  source?: string
  at?: number
}

type MetricSpec = {
  key: keyof EngineMetrics
  label: string
  hint: string
  // Higher value = more concerning, so we color toward red as it grows.
  invert?: boolean
}

const METRICS: MetricSpec[] = [
  { key: "stress_score", label: "Stress", hint: "Acute stress signal in current inputs." },
  { key: "burnout_risk", label: "Burnout risk", hint: "Sustained stress pattern over recent history." },
  { key: "cognitive_load", label: "Cognitive load", hint: "Mental fatigue and scattered focus." },
  { key: "emotional_volatility", label: "Volatility", hint: "How much your stress swings between readings." },
  { key: "crisis_probability", label: "Crisis signal", hint: "Conservative probability of immediate distress." },
]

function severityClasses(value: number, isCrisis = false) {
  // Crisis is shown stricter -- any non-trivial value is amber/red.
  if (isCrisis) {
    if (value >= 50) return { bar: "bg-red-500", text: "text-red-600" }
    if (value >= 20) return { bar: "bg-amber-500", text: "text-amber-600" }
    return { bar: "bg-emerald-500", text: "text-emerald-600" }
  }
  if (value >= 70) return { bar: "bg-red-500", text: "text-red-600" }
  if (value >= 40) return { bar: "bg-amber-500", text: "text-amber-600" }
  return { bar: "bg-emerald-500", text: "text-emerald-600" }
}

export function WellbeingSnapshot({ metrics, emotion, explanation, source, at }: Props) {
  if (!metrics) {
    return (
      <Card className="rounded-xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Wellbeing Snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border bg-muted/30 p-6 text-sm text-muted-foreground">
            No reading yet. Send a text, record voice, or start the camera to see your fused wellbeing
            signal here.
          </div>
        </CardContent>
      </Card>
    )
  }

  const ts = at ? new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null

  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Wellbeing Snapshot</CardTitle>
        <div className="text-xs text-muted-foreground">
          {source ? <span className="mr-2 rounded bg-secondary px-1.5 py-0.5">{source}</span> : null}
          {emotion ? <span className="font-medium text-foreground">{emotion}</span> : null}
          {ts ? <span className="ml-2">{ts}</span> : null}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {METRICS.map((m) => {
            const value = Math.max(0, Math.min(100, Number(metrics[m.key] ?? 0)))
            const isCrisis = m.key === "crisis_probability"
            const sev = severityClasses(value, isCrisis)
            return (
              <div key={m.key} className="rounded-xl border bg-muted/20 p-3">
                <div className="flex items-baseline justify-between">
                  <div className="text-xs text-muted-foreground">{m.label}</div>
                  <div className={`text-base font-semibold ${sev.text}`}>{value}</div>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full ${sev.bar} transition-all`}
                    style={{ width: `${value}%` }}
                  />
                </div>
                <div className="mt-2 text-[11px] leading-snug text-muted-foreground">{m.hint}</div>
              </div>
            )
          })}
        </div>

        {explanation ? (
          <div className="mt-4 rounded-xl border bg-muted/20 p-3 text-sm">
            <span className="mr-2 rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
              Why
            </span>
            {explanation}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
