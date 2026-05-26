"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { getAuth } from "firebase/auth"
import type { EmotionReading } from "./emotion-card"

// Capture cadence -- the engine call is non-trivial (Gemini Vision),
// so we sample every 5s rather than the old 2s. Tweak as needed.
const CAPTURE_INTERVAL_MS = 5000

export function VideoCapture({ onResult }: { onResult: (r: EmotionReading) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const inFlightRef = useRef(false)

  function captureFrameBase64(): string | null {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return null
    if (video.videoWidth === 0 || video.videoHeight === 0) return null

    // Downscale to keep payload small. Long edge ~ 480px is enough for
    // emotion / micro-expression-ish reading by Gemini Vision.
    const targetLong = 480
    const ratio = video.videoWidth / video.videoHeight
    const w = video.videoWidth >= video.videoHeight ? targetLong : Math.round(targetLong * ratio)
    const h = video.videoWidth >= video.videoHeight ? Math.round(targetLong / ratio) : targetLong

    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, w, h)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7)
    // Strip "data:image/jpeg;base64," prefix
    return dataUrl.split(",")[1] || null
  }

  async function analyzeOnce() {
    if (inFlightRef.current) return
    const frame = captureFrameBase64()
    if (!frame) return

    inFlightRef.current = true
    setBusy(true)
    try {
      const auth = getAuth()
      const user = auth.currentUser
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (user) {
        const token = await user.getIdToken()
        headers["Authorization"] = `Bearer ${token}`
      }

      const res = await fetch("/api/analyze/face", {
        method: "POST",
        headers,
        body: JSON.stringify({ image_base64: frame }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data?.details === "string" ? data.details : "Face analysis failed")
        return
      }
      setError(null)
      onResult({
        source: "Face",
        emotion: data?.emotion ?? data?.analysis?.emotion ?? "Neutral",
        confidence:
          typeof data?.confidence === "number"
            ? data.confidence
            : typeof data?.analysis?.confidence === "number"
              ? data.analysis.confidence
              : 0.5,
        at: Date.now(),
        metrics: data?.metrics,
        explanation: data?.explanation,
      })
    } catch (e: any) {
      console.error("[face] analyze error:", e)
      setError(e?.message || "Face analysis failed")
    } finally {
      inFlightRef.current = false
      setBusy(false)
    }
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = stream
      setActive(true)
      setError(null)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      // Kick off one capture quickly, then on interval.
      window.setTimeout(analyzeOnce, 800)
      intervalRef.current = window.setInterval(analyzeOnce, CAPTURE_INTERVAL_MS)
    } catch (e: any) {
      console.error("[face] camera error:", e)
      setError(e?.message || "Could not access camera")
      setActive(false)
    }
  }

  function stop() {
    setActive(false)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  useEffect(() => {
    return () => stop()
  }, [])

  return (
    <div className="flex w-full flex-col items-start gap-2">
      <div className="rounded-xl border bg-muted/30 p-2">
        <video ref={videoRef} className="h-40 w-64 rounded-lg bg-black" muted playsInline />
        <canvas ref={canvasRef} className="hidden" />
      </div>
      <div className="flex items-center gap-2">
        {!active ? (
          <Button onClick={start} className="rounded-xl">
            Start Camera
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={stop} className="rounded-xl">
              Stop
            </Button>
            <Button
              variant="outline"
              onClick={analyzeOnce}
              disabled={busy}
              className="rounded-xl"
            >
              {busy ? "Analyzing..." : "Analyze now"}
            </Button>
          </>
        )}
      </div>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
