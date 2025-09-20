// frontend/app/api/analyze/face/route.ts
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  // Some callers send no body; guard json parsing
  try {
    await req.json()
  } catch {}
  // No backend endpoint yet; return a mocked response to keep demo working
  return NextResponse.json({ emotion: "Calm", confidence: 0.7 })
}
