// frontend/utils/api.ts
import { getAuth } from "firebase/auth"

function getBackendBase() {
  return process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000"
}

async function getIdTokenOrThrow(): Promise<string> {
  const auth = getAuth()
  const user = auth.currentUser
  if (!user) throw new Error("Not authenticated")
  const token = await user.getIdToken()
  return token
}

// ----- Emotion Intelligence Engine -----------------------------------------

export type EngineMetrics = {
  stress_score: number
  burnout_risk: number
  emotional_volatility: number
  cognitive_load: number
  crisis_probability: number
}

export type CrisisAssessment = {
  level: "none" | "watch" | "elevated" | "crisis"
  probability: number
  reasons: string[]
  triggered_by: "keyword" | "metrics" | "model" | "none" | "manual"
}

export type EngineReading = {
  reading_id?: string | null
  source: "Text" | "Voice" | "Face" | "Multimodal"
  emotion: string
  confidence: number
  explanation?: string
  metrics: EngineMetrics
  crisis?: CrisisAssessment
  crisis_level?: CrisisAssessment["level"]
  inputs?: { has_text: boolean; has_voice: boolean; has_face: boolean }
  created_at?: string
  // Back-compat envelope
  analysis?: { emotion: string; confidence: number }
  degraded?: boolean
}

export type AnalyzeInputs = {
  text?: string
  audio_base64?: string
  image_base64?: string
}

async function postJsonAuthed(path: string, body: unknown) {
  const token = await getIdTokenOrThrow()
  const res = await fetch(`${getBackendBase()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errorText = await res.text()
    try {
      const errorData = JSON.parse(errorText)
      if (errorData?.detail && String(errorData.detail).includes("overloaded")) {
        throw new Error("AI service is temporarily overloaded. Please try again in a few moments.")
      }
      if (errorData?.detail && String(errorData.detail).includes("503")) {
        throw new Error("AI service is temporarily unavailable. Please try again later.")
      }
    } catch {
      // fall through
    }
    throw new Error(errorText)
  }
  return res.json()
}

/**
 * Unified Emotion Intelligence Engine.
 * Pass any combination of text / audio / face image; the backend fuses
 * them with the user's recent history into one canonical reading.
 */
export async function analyzeUnified(inputs: AnalyzeInputs): Promise<EngineReading> {
  return postJsonAuthed("/api/analyze", inputs)
}

// Legacy: kept so existing TextInput component keeps working unchanged.
// Now goes through the engine on the backend.
export async function analyzeText(text: string): Promise<EngineReading> {
  return analyzeUnified({ text })
}

export async function fetchMyReports() {
  const token = await getIdTokenOrThrow()
  const res = await fetch(`${getBackendBase()}/api/reports/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function addSupportContact(name: string, phone: string) {
  const token = await getIdTokenOrThrow()
  const res = await fetch(`${getBackendBase()}/api/support/add`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name, phone }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getSupportContacts() {
  const token = await getIdTokenOrThrow()
  const res = await fetch(`${getBackendBase()}/api/support/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function deleteSupportContact(contactId: string) {
  const token = await getIdTokenOrThrow()
  const res = await fetch(`${getBackendBase()}/api/support/${contactId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getMoodForecast() {
  const token = await getIdTokenOrThrow()
  const res = await fetch(`${getBackendBase()}/api/digital_twin/forecast`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ----- Digital Twin 2.0 ----------------------------------------------------

export type TwinProfile = {
  sufficient_data: boolean
  n_readings: number
  min_required?: number
  window_days: number
  resilience_score?: number
  dominant_emotion?: string
  emotion_distribution?: Record<string, number>
  avg_stress?: number
  max_stress?: number
  avg_burnout?: number
  volatility?: number
  recovery_speed?: number | null
  streak_days?: number
  by_hour_stress?: Record<string, number>
  best_hour?: number | null
  worst_hour?: number | null
  trigger_words?: string[]
  crisis_count?: number
  last_crisis?: string | null
  stress_sparkline?: { date: string; avg_stress: number | null; samples: number }[]
}

export type TwinInsights = {
  headline: string
  insights: { title: string; detail: string }[]
  forecast: {
    day_offset: number
    date: string
    risk: "low" | "medium" | "high"
    reason: string
  }[]
  recommendations: {
    title: string
    why: string
    category:
      | "breathing"
      | "journaling"
      | "social"
      | "sleep"
      | "movement"
      | "break"
      | "professional"
  }[]
  _degraded?: boolean
}

export type TwinResponse = {
  profile: TwinProfile
  insights: TwinInsights | null
}

export async function getDigitalTwin(): Promise<TwinResponse> {
  const token = await getIdTokenOrThrow()
  const res = await fetch(`${getBackendBase()}/api/digital_twin/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ----- Mirror (Gemini companion with memory) -------------------------------

export type MirrorMessage = {
  role: "user" | "model"
  text: string
  created_at?: string
}

export type MirrorChatResponse = {
  reply: string
  user_msg_id: string | null
  model_msg_id: string | null
  crisis: CrisisAssessment
  crisis_flag: boolean
  context_used: {
    readings_count: number
    history_count: number
    latest_emotion: string | null
  }
}

export async function mirrorChat(message: string): Promise<MirrorChatResponse> {
  return postJsonAuthed("/api/mirror/chat", { message })
}

export async function mirrorHistory(): Promise<{ messages: MirrorMessage[] }> {
  const token = await getIdTokenOrThrow()
  const res = await fetch(`${getBackendBase()}/api/mirror/history`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function mirrorReset(): Promise<{ ok: boolean }> {
  const token = await getIdTokenOrThrow()
  const res = await fetch(`${getBackendBase()}/api/mirror/reset`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ----- Crisis Intelligence -------------------------------------------------

export type CrisisEvent = {
  id?: string
  level: CrisisAssessment["level"]
  probability: number
  reasons: string[]
  triggered_by: string
  source: "engine" | "mirror" | "manual"
  trigger_excerpt?: string
  created_at?: string
}

export async function fetchWellbeingSummary(): Promise<{ message: string }> {
  const token = await getIdTokenOrThrow()
  const res = await fetch(`${getBackendBase()}/api/crisis/wellbeing-summary`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fetchRecentCrisisEvents(
  limit = 10,
): Promise<{ events: CrisisEvent[] }> {
  const token = await getIdTokenOrThrow()
  const res = await fetch(`${getBackendBase()}/api/crisis/recent?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ----- Analytics ----------------------------------------------------------

export type AnalyticsResponse = {
  window_days: number
  n_readings: number
  sufficient_data: boolean
  min_required?: number
  weekly_resilience?: { week_start: string; score: number | null; samples: number }[]
  heatmap?: (number | null)[][] // [day_of_week 0..6 (Mon..Sun)][hour 0..23]
  heatmap_max?: number
  mirror_effectiveness?: {
    samples: number
    avg_drop: number
    min_drop: number
    max_drop: number
    method: string
  } | null
  emotion_shift?: {
    this_week: Record<string, number>
    last_week: Record<string, number>
    delta: Record<string, number>
  }
  crisis_per_day?: { date: string; count: number }[]
  recovery_time_minutes?: {
    median_min: number | null
    samples: number
  }
}

export async function getAnalytics(days = 28): Promise<AnalyticsResponse> {
  const token = await getIdTokenOrThrow()
  const res = await fetch(`${getBackendBase()}/api/analytics/me?days=${days}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
