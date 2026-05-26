"use client"

import { useEffect, useMemo, useState } from "react"
import { SiteHeader } from "@/components/site-header"
import { EmotionCard, type EmotionReading } from "@/components/emotion-card"
import { TextInput } from "@/components/text-input"
import { AudioCapture } from "@/components/audio-capture"
import { VideoCapture } from "@/components/video-capture"
import { EmotionChart } from "@/components/emotion-chart"
import { ReportCard, type DailyReport } from "@/components/report-card"
import { WellbeingSnapshot } from "@/components/wellbeing-snapshot"
import { CrisisModal, CrisisInlineBanner, type CrisisLevel } from "@/components/crisis-modal"
import { saveReport } from "@/utils/report-store"
import { fetchMyReports } from "@/utils/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getCopingSuggestion } from "@/utils/coping-suggestions"
import Link from "next/link"

export default function DashboardPage() {
  const [latest, setLatest] = useState<Record<EmotionReading["source"], EmotionReading | undefined>>({
    Text: undefined,
    Voice: undefined,
    Face: undefined,
    Multimodal: undefined,
  })
  const [latestAny, setLatestAny] = useState<EmotionReading | undefined>(undefined)
  const [series, setSeries] = useState<{ time: string; value: number }[]>([])
  const [report, setReport] = useState<DailyReport | null>(null)
  const [crisisOpen, setCrisisOpen] = useState(false)
  const [crisisReason, setCrisisReason] = useState<string | undefined>(undefined)

  const currentLevel: CrisisLevel = (latestAny?.crisis?.level as CrisisLevel) || "none"

  // Auto-open the modal on level=crisis. We do NOT auto-open on
  // 'elevated' -- that's intrusive. The inline banner offers it.
  useEffect(() => {
    if (currentLevel === "crisis") {
      setCrisisReason(
        latestAny?.crisis?.reasons?.[0]
          ? `Triggered by: ${latestAny.crisis.reasons[0]}`
          : `From your most recent ${latestAny?.source?.toLowerCase() || "reading"}.`,
      )
      setCrisisOpen(true)
    }
  }, [latestAny])

  function handleResult(r: EmotionReading) {
    setLatest((prev) => ({ ...prev, [r.source]: r }))
    setLatestAny(r)
    setSeries((prev) => {
      const ts = new Date(r.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      const val =
        typeof r.metrics?.stress_score === "number"
          ? r.metrics.stress_score
          : Math.round(r.confidence * 100)
      return [...prev.slice(-49), { time: ts, value: val }]
    })
  }

  async function generateDailyReport() {
    try {
      // Get recent reports from server to analyze actual mood patterns
      const serverReports = await fetchMyReports()
      const recentReports = Array.isArray(serverReports) ? serverReports.slice(0, 10) : []
      
      if (recentReports.length === 0) {
        // No data available, create a neutral report
        const newReport: DailyReport = {
          date: new Date().toLocaleDateString(),
          summary: "No recent mood data available. Start by analyzing your emotions to generate personalized reports.",
          crisisAlert: false,
          suggestionEn: "Consider taking a moment to reflect on your current emotional state and share how you're feeling.",
          suggestionHi: "",
          dominantMood: "Neutral",
        }
        setReport(newReport)
        saveReport(newReport)
        return
      }

      // Analyze recent mood patterns
      const emotions = recentReports.map(r => {
        const emotion = r.analysis?.emotion || "Neutral"
        return emotion
      }).filter(Boolean)

      // Calculate dominant mood
      const moodCounts: Record<string, number> = emotions.reduce((acc: Record<string, number>, mood: string) => {
        acc[mood] = (acc[mood] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      const dominantMood = Object.entries(moodCounts)
        .sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0] || "Neutral"

      // Calculate average confidence
      const confidences = recentReports.map(r => r.analysis?.confidence || 0).filter(c => c > 0)
      const avgConfidence = confidences.length > 0 
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length 
        : 0.5

      // Determine crisis alert based on recent negative emotions and low confidence
      const negativeMoods = ["Sad", "Anxious", "Angry"]
      const recentNegativeCount = emotions.filter(mood => negativeMoods.includes(mood)).length
      const crisisAlert = recentNegativeCount >= 3 || avgConfidence < 0.3

      // Generate summary based on actual data
      let summary = ""
      if (recentReports.length >= 5) {
        summary = `Based on your recent ${recentReports.length} mood analyses, your dominant emotion is ${dominantMood}. `
        if (crisisAlert) {
          summary += "We notice some concerning patterns that may benefit from additional support."
        } else {
          summary += "Your mood patterns show good stability and emotional awareness."
        }
      } else {
        summary = `Based on your recent mood analyses, your current dominant emotion is ${dominantMood}. Continue tracking your emotions for more personalized insights.`
      }

      // Get coping suggestions based on actual mood
      const s = getCopingSuggestion({
        crisis: crisisAlert,
        mood: dominantMood,
        riskLevel: crisisAlert ? "High" : undefined,
      })

      const newReport: DailyReport = {
        date: new Date().toLocaleDateString(),
        summary,
        crisisAlert,
        suggestionEn: s.en,
        suggestionHi: s.hi,
        dominantMood,
      }
      setReport(newReport)
      saveReport(newReport)
    } catch (error) {
      console.error("Error generating daily report:", error)
      // Fallback to a simple report if there's an error
      const newReport: DailyReport = {
        date: new Date().toLocaleDateString(),
        summary: "Unable to analyze recent mood data. Please try again later.",
        crisisAlert: false,
        suggestionEn: "Consider taking a moment to reflect on your current emotional state.",
        suggestionHi: "",
        dominantMood: "Neutral",
      }
      setReport(newReport)
      saveReport(newReport)
    }
  }

  const chartData = useMemo(() => series, [series])

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl px-4 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Live Emotions */}
          <Card className="col-span-1 rounded-xl shadow-sm lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-base">Live Emotions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <EmotionCard title="Text" reading={latest.Text} />
              <EmotionCard title="Voice" reading={latest.Voice} />
              <EmotionCard title="Face" reading={latest.Face} />
            </CardContent>
          </Card>

          {/* Wellbeing Snapshot (Emotion Intelligence Engine) */}
          <div className="col-span-1 space-y-4 lg:col-span-3">
            <CrisisInlineBanner
              level={currentLevel}
              onOpen={() => {
                setCrisisReason(
                  latestAny?.crisis?.reasons?.[0]
                    ? `Triggered by: ${latestAny.crisis.reasons[0]}`
                    : undefined,
                )
                setCrisisOpen(true)
              }}
            />
            <WellbeingSnapshot
              metrics={latestAny?.metrics}
              emotion={latestAny?.emotion}
              explanation={latestAny?.explanation}
              source={latestAny?.source}
              at={latestAny?.at}
            />
          </div>

          {/* Inputs */}
          <Card className="col-span-1 rounded-xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Text Input</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm font-medium">Type your feelings</div>
              <TextInput onResult={handleResult} />
            </CardContent>
          </Card>

          <Card className="col-span-1 rounded-xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Voice Input</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3">
              <div className="text-sm font-medium">Record 5s</div>
              <AudioCapture onResult={handleResult} kind="circle" />
            </CardContent>
          </Card>

          <Card className="col-span-1 rounded-xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Video Input</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              <div className="w-full rounded-lg border p-2">
                <VideoCapture onResult={handleResult} />
              </div>
            </CardContent>
          </Card>

          {/* Mood Trends */}
          <Card className="col-span-1 rounded-xl shadow-sm lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-base">Mood Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <EmotionChart data={chartData} />
            </CardContent>
          </Card>

          {/* Daily Report */}
          <Card className="col-span-1 rounded-xl shadow-sm lg:col-span-3">
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-base">Daily Report</CardTitle>
              <Button onClick={generateDailyReport} className="rounded-xl">
                Generate
              </Button>
            </CardHeader>
            <CardContent>
              {report ? (
                <ReportCard report={report} />
              ) : (
                <div className="rounded-xl border bg-muted/30 p-6 text-sm text-muted-foreground">
                  No report yet. Generate a daily report to see your summary here.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Support Network */}
          <Card id="support" className="col-span-1 rounded-xl shadow-sm lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-base">Support Network</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button className="rounded-xl">Activate Support</Button>
                <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  AI-generated supportive message will appear here to help you reach out and feel grounded.
                </div>
              </div>

              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                <li className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                    MA
                  </div>
                  <div className="text-sm">
                    <div className="font-medium">Mom</div>
                    <div className="text-muted-foreground">Primary contact</div>
                  </div>
                </li>
                <li className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                    RH
                  </div>
                  <div className="text-sm">
                    <div className="font-medium">Rahul</div>
                    <div className="text-muted-foreground">Close friend</div>
                  </div>
                </li>
                <li className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                    DS
                  </div>
                  <div className="text-sm">
                    <div className="font-medium">Dr. Shah</div>
                    <div className="text-muted-foreground">Therapist</div>
                  </div>
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Digital Twin */}
          <Card className="col-span-1 rounded-xl shadow-sm lg:col-span-3">
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-base">Your Digital Twin</CardTitle>
              <Link href="/digital-twin" className="text-sm text-primary underline underline-offset-4">
                Open
              </Link>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Explore personalized insights like your most frequent mood, common triggers, helpful coping habits, and
                a 7‑day forecast of risk level trends based on your recent reports.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
      <CrisisModal
        open={crisisOpen}
        level={(currentLevel === "crisis" ? "crisis" : "elevated") as "crisis" | "elevated"}
        reason={crisisReason}
        onClose={() => setCrisisOpen(false)}
      />
    </>
  )
}
