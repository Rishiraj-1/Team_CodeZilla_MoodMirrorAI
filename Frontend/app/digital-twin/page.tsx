"use client"

import { useEffect, useMemo, useState } from "react"
import { SiteHeader } from "@/components/site-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { loadReports } from "@/utils/report-store"
import { getCopingSuggestion } from "@/utils/coping-suggestions"
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"

type MoodStats = {
  mostFrequentMood: string | null
}

function computeMoodStats(dominantMoods: string[]): MoodStats {
  if (dominantMoods.length === 0) return { mostFrequentMood: null }
  const counts = new Map<string, number>()
  for (const m of dominantMoods) counts.set(m, (counts.get(m) || 0) + 1)
  let best: string = dominantMoods[0]
  let bestCount = 0
  counts.forEach((c, k) => {
    if (c > bestCount) {
      best = k
      bestCount = c
    }
  })
  return { mostFrequentMood: best }
}

function triggersForMood(mood: string | null): string[] {
  switch (mood) {
    case "Anxious":
      return ["Work/Study pressure", "Uncertainty", "Social expectations"]
    case "Sad":
      return ["Loneliness", "Fatigue", "Low sunlight or inactivity"]
    case "Angry":
      return ["Conflicts", "Unmet expectations", "Overload"]
    case "Calm":
      return ["Routine", "Supportive family time", "Adequate sleep"]
    case "Happy":
      return ["Quality time with family", "Exercise/Yoga", "Small wins"]
    default:
      return ["Irregular routine", "Screen overuse", "Low hydration"]
  }
}

function habitsForMood(mood: string | null): string[] {
  switch (mood) {
    case "Anxious":
      return ["5–10 min Anulom-Vilom", "Box-breathing (4-4-4-4)", "Short family check‑in"]
    case "Sad":
      return ["15 min morning walk", "3 gratitude notes", "Call a loved one"]
    case "Angry":
      return ["Slow breathing for 3 min", "Short stretch or Surya Namaskar", "Pause & reframe"]
    case "Calm":
      return ["Maintain routine", "Light yoga flow", "Hydrate regularly"]
    case "Happy":
      return ["Share the good moment", "Keep sleep schedule", "Mindful breathing 3 min"]
    default:
      return ["3 min mindful breathing", "2 glasses of water", "Brief family chat"]
  }
}

type Forecast = {
  riskLevel: "High" | "Medium" | "Low"
  daysUntilCrisis: number
  suggestionEn: string
  suggestionHi: string
}

function forecastFromMood(mood: string | null, seed: number): Forecast {
  // Simple heuristic: map moods to average confidence-like scores
  const moodScore =
    mood === "Happy" || mood === "Calm"
      ? 25
      : mood === "Neutral"
        ? 45
        : mood === "Sad"
          ? 65
          : mood === "Anxious" || mood === "Angry"
            ? 75
            : 50

  let riskLevel: Forecast["riskLevel"]
  let daysUntilCrisis: number
  if (moodScore >= 70) {
    riskLevel = "High"
    daysUntilCrisis = 1 + (seed % 2)
  } else if (moodScore >= 40) {
    riskLevel = "Medium"
    daysUntilCrisis = 3 + (seed % 3)
  } else {
    riskLevel = "Low"
    daysUntilCrisis = 5 + (seed % 3)
  }

  const s = getCopingSuggestion({ riskLevel, seed })
  return {
    riskLevel,
    daysUntilCrisis,
    suggestionEn: s.en,
    suggestionHi: s.hi,
  }
}

function buildSevenDaySeries(mood: string | null, seed: number): { day: string; risk: number }[] {
  // base risk from mood
  const base =
    mood === "Happy" || mood === "Calm"
      ? 25
      : mood === "Neutral"
        ? 45
        : mood === "Sad"
          ? 60
          : mood === "Anxious" || mood === "Angry"
            ? 75
            : 50
  const series: { day: string; risk: number }[] = []
  for (let i = 1; i <= 7; i++) {
    // small daily variation using seed and day index
    const jitter = ((Math.sin((seed + i) * 1.3) + Math.cos((seed + i) * 0.7)) / 2) * 6
    const val = Math.max(0, Math.min(100, Math.round(base + jitter)))
    series.push({ day: `Day ${i}`, risk: val })
  }
  return series
}

export default function DigitalTwinPage() {
  const [dominantMoods, setDominantMoods] = useState<string[]>([])

  useEffect(() => {
    // read most recent 30 reports for snapshot
    const reports = loadReports().slice(0, 30)
    setDominantMoods(reports.map((r) => r.dominantMood))
  }, [])

  const stats = useMemo(() => computeMoodStats(dominantMoods), [dominantMoods])
  const forecast = useMemo(() => forecastFromMood(stats.mostFrequentMood, dominantMoods.length), [stats, dominantMoods])

  const commonTriggers = useMemo(() => triggersForMood(stats.mostFrequentMood), [stats])
  const helpfulHabits = useMemo(() => habitsForMood(stats.mostFrequentMood), [stats])

  const forecastSeries = useMemo(
    () => buildSevenDaySeries(stats.mostFrequentMood, dominantMoods.length),
    [stats.mostFrequentMood, dominantMoods.length],
  )

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Your Digital Twin</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground">Most frequent mood</p>
                <p className="mt-1 text-lg font-semibold">{stats.mostFrequentMood ?? "Not enough data yet"}</p>
              </div>

              <div className="rounded-xl border bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground">Common triggers</p>
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {commonTriggers.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground">Helpful coping habits</p>
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {helpfulHabits.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground">7-Day Forecast</p>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Risk Level</div>
                    <div className="mt-1 text-lg font-semibold">{forecast.riskLevel}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Predicted days until crisis</div>
                    <div className="mt-1 text-lg font-semibold">{forecast.daysUntilCrisis} days</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Coping suggestion</div>
                    <div className="mt-1 space-y-1">
                      <p className="text-sm" lang="en">
                        <span className="mr-2 rounded bg-secondary px-1.5 py-0.5 text-xs">EN</span>
                        {forecast.suggestionEn}
                      </p>
                      <p className="text-sm" lang="hi">
                        <span className="mr-2 rounded bg-secondary px-1.5 py-0.5 text-xs">हिं</span>
                        {forecast.suggestionHi}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-2 text-sm font-medium text-muted-foreground">7-Day Forecast Trend</div>
              {forecastSeries.length ? (
                <div className="h-64 rounded-xl border bg-muted/20 p-3" aria-label="7-day risk forecast chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={forecastSeries}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted-foreground/20" />
                      <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="risk"
                        stroke="hsl(var(--primary))"
                        fill="hsl(var(--primary))"
                        fillOpacity={0.15}
                        strokeWidth={2}
                        name="Risk"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="rounded-xl border bg-muted/30 p-6 text-sm text-muted-foreground">
                  Not enough data yet to estimate the next 7 days. Add a few daily reports to see your forecast trend.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  )
}
