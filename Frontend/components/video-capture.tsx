"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import type { EmotionReading } from "./emotion-card"

export function VideoCapture({ onResult }: { onResult: (r: EmotionReading) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [active, setActive] = useState(false)
  const intervalRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true })
    streamRef.current = stream
    setActive(true)
    if (videoRef.current) {
      videoRef.current.srcObject = stream
      await videoRef.current.play()
    }
    // Every 2s simulate a frame analysis
    intervalRef.current = window.setInterval(async () => {
      const res = await fetch("/api/analyze/face", { method: "POST" })
      const data = await res.json()
      onResult({
        source: "Face",
        emotion: data.emotion,
        confidence: data.confidence,
        at: Date.now(),
      })
    }, 2000)
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
      </div>
      <div className="flex gap-2">
        {!active ? (
          <Button onClick={start} className="rounded-xl">
            Start Camera
          </Button>
        ) : (
          <Button variant="secondary" onClick={stop} className="rounded-xl">
            Stop
          </Button>
        )}
      </div>
    </div>
  )
}
