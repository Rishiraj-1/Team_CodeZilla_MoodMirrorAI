import { NextResponse } from "next/server"

// Unified Emotion Intelligence Engine proxy.
// Forwards any subset of { text, audio_base64, image_base64 } to the
// FastAPI backend, preserving the user's auth header.
export async function POST(req: Request) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000"

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  const authHeader = req.headers.get("authorization")
  if (authHeader) headers["Authorization"] = authHeader

  try {
    const res = await fetch(`${backendUrl}/api/analyze`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error("[analyze proxy] backend error:", res.status, data)
      return NextResponse.json(
        { error: "Backend error", details: data },
        { status: res.status || 500 },
      )
    }
    return NextResponse.json(data)
  } catch (err: any) {
    console.error("[analyze proxy] fetch failed:", err)
    return NextResponse.json(
      { error: "Failed to connect backend", details: err?.message },
      { status: 502 },
    )
  }
}
