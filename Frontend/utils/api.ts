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

export async function analyzeText(text: string) {
  const token = await getIdTokenOrThrow()
  const res = await fetch(`${getBackendBase()}/api/analyze/text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const errorText = await res.text()
    // Parse error response to provide better user messages
    try {
      const errorData = JSON.parse(errorText)
      if (errorData.detail && errorData.detail.includes("overloaded")) {
        throw new Error("AI service is temporarily overloaded. Please try again in a few moments.")
      }
      if (errorData.detail && errorData.detail.includes("503")) {
        throw new Error("AI service is temporarily unavailable. Please try again later.")
      }
    } catch {
      // If parsing fails, use original error
    }
    throw new Error(errorText)
  }
  return res.json()
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
