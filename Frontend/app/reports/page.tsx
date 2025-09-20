"use client"

import { useEffect, useState } from "react"
import { SiteHeader } from "@/components/site-header"
import { ReportCard, type DailyReport } from "@/components/report-card"
import { loadReports } from "@/utils/report-store"
import { fetchMyReports } from "@/utils/api"

// Helper to normalize backend raw emotion text
function normalizeEmotionLabel(emotion: string) {
  if (!emotion) return "—"
  const e = emotion.trim().toLowerCase()
  const map: Record<string, string> = {
    happy: "Happy",
    joy: "Happy",
    joyful: "Happy",
    sad: "Sad",
    sadness: "Sad",
    angry: "Angry",
    anger: "Angry",
    neutral: "Neutral",
    fear: "Fear",
    fearful: "Fear",
    surprised: "Surprised",
    surprise: "Surprised",
    disgust: "Disgust",
    calm: "Calm",
    anxious: "Anxious",
    anxiety: "Anxious",
  }
  return map[e] ?? emotion
}

type BackendReport = {
  id: string
  source?: string
  text?: string
  created_at?: string
  analysis?: any
  suggestion?: any
}

function getSourceIcon(source: string) {
  switch (source) {
    case "Voice":
      return "🎤"
    case "Text":
      return "📝"
    case "Face":
      return "📷"
    default:
      return "🧠"
  }
}

function getSourceColor(source: string) {
  switch (source) {
    case "Voice":
      return "bg-blue-100 text-blue-700"
    case "Text":
      return "bg-green-100 text-green-700"
    case "Face":
      return "bg-purple-100 text-purple-700"
    default:
      return "bg-gray-100 text-gray-700"
  }
}

export default function ReportsPage() {
  const [localReports, setLocalReports] = useState<DailyReport[]>([])
  const [serverReports, setServerReports] = useState<BackendReport[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLocalReports(loadReports())
    ;(async () => {
      try {
        const data = await fetchMyReports()
        setServerReports(Array.isArray(data) ? data : [])
      } catch (e: any) {
        setError("Could not load server reports. Are you signed in?")
        setServerReports([])
      }
    })()
  }, [])

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <h1 className="mb-4 text-2xl font-bold">Reports</h1>

        <section className="mb-8">
          <h2 className="mb-2 text-lg font-semibold">Saved Locally</h2>
          {localReports.length === 0 ? (
            <div className="rounded-xl border bg-muted/30 p-6 text-sm text-muted-foreground">
              No local reports yet. Generate one from the Dashboard.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {localReports.map((r, i) => (
                <ReportCard key={i} report={r} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold">From Your Account</h2>
          {error ? (
            <div className="mb-3 text-sm text-red-600">{error}</div>
          ) : null}
          {serverReports === null ? (
            <div className="rounded-xl border bg-muted/30 p-6 text-sm text-muted-foreground">Loading…</div>
          ) : serverReports.length === 0 ? (
            <div className="rounded-xl border bg-muted/30 p-6 text-sm text-muted-foreground">
              No server reports yet. Analyze some text from the Dashboard.
            </div>
          ) : (
            <ul className="space-y-3">
              {serverReports.map((r) => {
                const dominantMood = normalizeEmotionLabel(
                  r.analysis?.emotion || r.analysis?.candidates?.[0]?.content?.parts?.[0]?.text || "Neutral"
                )
                // Handle both old and new suggestion formats
                const suggestionEn = r.suggestion?.text || r.suggestion?.parts?.[0]?.text || String(r.suggestion || "No suggestion provided.")

                const report: DailyReport = {
                  date: r.created_at ? new Date(r.created_at).toLocaleDateString() : "Unknown Date",
                  summary: r.text || `${r.source || "Analysis"} report - ${dominantMood} mood detected`,
                  crisisAlert: dominantMood === "Angry" || dominantMood === "Anxious" || dominantMood === "Sad",
                  suggestionEn: suggestionEn,
                  suggestionHi: "",
                  dominantMood: dominantMood,
                }
                return (
                  <div key={r.id} className="relative">
                    <ReportCard report={report} />
                    {r.source && (
                      <div className="absolute top-2 right-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${getSourceColor(r.source)}`}>
                          {getSourceIcon(r.source)} {r.source}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </ul>
          )}
        </section>
      </main>
    </>
  )
}
