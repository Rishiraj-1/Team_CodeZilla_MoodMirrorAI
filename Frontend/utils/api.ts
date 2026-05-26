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

export type EngineReading = {
  reading_id?: string | null
  source: "Text" | "Voice" | "Face" | "Multimodal"
  emotion: string
  confidence: number
  explanation?: string
  metrics: EngineMetrics
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
