"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { analyzeText as analyzeTextApi } from "@/utils/api"
import type { EmotionReading } from "./emotion-card"

export function TextInput({ onResult }: { onResult: (r: EmotionReading) => void }) {
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function analyze() {
    if (!text.trim()) return
    setLoading(true)
    setError(null)
    try {
      const data = await analyzeTextApi(text)
      const topEmotion = (data as any)?.emotion
      const nestedEmotion = (data as any)?.analysis?.emotion
      const rawEmotion = typeof topEmotion === "string" && topEmotion ? topEmotion : nestedEmotion
      const emotionText = typeof rawEmotion === "string" && rawEmotion.trim().length > 0 ? rawEmotion : "Unknown"

      const topConf = (data as any)?.confidence
      const nestedConf = (data as any)?.analysis?.confidence
      const confidence = typeof topConf === "number" ? topConf : typeof nestedConf === "number" ? nestedConf : 0
      onResult({
        source: "Text",
        emotion: String(emotionText),
        confidence,
        at: Date.now(),
        metrics: (data as any)?.metrics,
        explanation: (data as any)?.explanation,
      })
      setText("")
    } catch (err: any) {
      console.error("Text analysis error:", err)
      setError(err.message || "Analysis failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <Input
        placeholder="Type how you feel..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="rounded-xl h-16 md:h-20 text-lg md:text-xl w-full"
        aria-label="Text emotion input"
      />
      <Button onClick={analyze} disabled={loading} className="rounded-xl w-full sm:w-auto self-start mt-1">
        {loading ? "Analyzing..." : "Analyze"}
      </Button>
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
