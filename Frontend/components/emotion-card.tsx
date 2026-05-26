"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export type EngineMetrics = {
  stress_score: number
  burnout_risk: number
  emotional_volatility: number
  cognitive_load: number
  crisis_probability: number
}

export type EmotionReading = {
  source: "Text" | "Voice" | "Face" | "Multimodal"
  emotion: string
  confidence: number // 0..1
  at: number
  metrics?: EngineMetrics
  explanation?: string
  crisis?: {
    level: "none" | "watch" | "elevated" | "crisis"
    probability: number
    reasons: string[]
    triggered_by: string
  }
}

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

function emojiForEmotion(emotion: string) {
  const normalized = normalizeEmotionLabel(emotion)
  const map: Record<string, string> = {
    Happy: "😊",
    Sad: "😔",
    Angry: "😠",
    Neutral: "😐",
    Fear: "😨",
    Surprised: "😮",
    Disgust: "🤢",
    Calm: "😌",
    Anxious: "😟",
  }
  return map[normalized] ?? "🧠"
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

export function EmotionCard({ title, reading }: { title: string; reading?: EmotionReading }) {
  const emotion = normalizeEmotionLabel(reading?.emotion ?? "—")
  const confidence = reading ? Math.round(reading.confidence * 100) : undefined
  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          {reading?.source && (
            <span className={`rounded-full px-2 py-1 text-xs font-medium ${getSourceColor(reading.source)}`}>
              {getSourceIcon(reading.source)} {reading.source}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <div className="text-3xl" aria-hidden>
          {emojiForEmotion(emotion)}
        </div>
        <div className="text-right">
          <div className="text-sm text-muted-foreground">Emotion</div>
          <div className="font-semibold">{emotion}</div>
          <div className="text-sm text-muted-foreground">{confidence !== undefined ? `${confidence}%` : "—"}</div>
        </div>
      </CardContent>
    </Card>
  )
}
