import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const body = await req.json()
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000"

  // Forward authentication headers
  const authHeader = req.headers.get("authorization")
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (authHeader) {
    headers["Authorization"] = authHeader
  }

  try {
    const res = await fetch(`${backendUrl}/api/analyze/text`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })

    const data = await res.json()
    if (!res.ok) {
      console.error("Backend error:", res.status, data)
      return NextResponse.json({ error: "Backend error", details: data }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err: any) {
    console.error("Fetch error:", err)
    return NextResponse.json(
      { error: "Failed to connect backend", details: err.message },
      { status: 500 }
    )
  }
}
