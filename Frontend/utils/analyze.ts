// frontend/utils/analyze.ts
export async function analyzeText(userId: string, text: string) {
  const res = await fetch("/api/analyze/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, text }),
  })
  return res.json()
}

export async function analyzeFace(userId: string, imageBase64: string) {
  const res = await fetch("/api/analyze/face", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, image_base64: imageBase64 }),
  })
  return res.json()
}

export async function analyzeVoice(userId: string, audioBase64: string) {
  const res = await fetch("/api/analyze/voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, audio_base64: audioBase64 }),
  })
  return res.json()
}
