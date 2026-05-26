"use client"

import type React from "react"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { getAuth } from "firebase/auth"
import type { EmotionReading } from "./emotion-card"

// Inline mic icon to avoid extra dependencies
function MicIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 12a7 7 0 0 0 14 0M12 19v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// Stop icon
function StopIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
  )
}

export function AudioCapture({
  onResult,
  kind = "default",
}: {
  onResult: (r: EmotionReading) => void
  kind?: "default" | "circle"
}) {
  const [recording, setRecording] = useState(false)
  const [transcription, setTranscription] = useState("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr
      chunksRef.current = []
      setRecording(true)
      setTranscription("")

      mr.ondataavailable = (e) => chunksRef.current.push(e.data)
      mr.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/wav" })
        await processAudio(audioBlob)
        setRecording(false)
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop())
          streamRef.current = null
        }
      }

      mr.start()
    } catch (error) {
      console.error("Error starting recording:", error)
      setRecording(false)
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop()
    }
  }

  async function processAudio(audioBlob: Blob) {
    setIsAnalyzing(true)
    try {
      // First, try to transcribe the audio (you can integrate with a speech-to-text service)
      // For now, we'll show a placeholder
      setTranscription("Transcribing audio...")
      
      // Convert to base64 for backend
      const base64Audio = await blobToBase64(audioBlob)
      
      // Get authentication token
      const auth = getAuth()
      const user = auth.currentUser
      if (!user) {
        throw new Error("Not authenticated")
      }
      const token = await user.getIdToken()
      
      // Send to backend for analysis with proper authentication
      const res = await fetch("/api/analyze/voice", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          user_id: user.uid, // Use actual user ID
          audio_base64: base64Audio,
        }),
      })
      
      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(errorText)
      }
      
      const data = await res.json()
      
      // Update transcription with actual result (you can enhance this with real transcription)
      setTranscription("Audio analysis complete")
      
      onResult({
        source: "Voice",
        emotion: data.emotion,
        confidence: data.confidence,
        at: Date.now(),
        metrics: data.metrics,
        explanation: data.explanation,
        crisis: data.crisis,
      })
    } catch (error) {
      console.error("Error processing audio:", error)
      setTranscription("Error processing audio")
    } finally {
      setIsAnalyzing(false)
    }
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve((reader.result as string).split(",")[1])
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  if (kind === "circle") {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="flex gap-2">
          <Button
            onClick={!recording ? startRecording : stopRecording}
            disabled={isAnalyzing}
            className={`h-16 w-16 rounded-full p-0 ${recording ? 'bg-red-500 hover:bg-red-600' : ''}`}
            aria-label={recording ? "Stop recording" : "Start recording"}
          >
            {recording ? <StopIcon className="h-6 w-6" /> : <MicIcon className="h-6 w-6" />}
          </Button>
        </div>
        <div className="text-center">
          <span className="text-xs text-muted-foreground">
            {isAnalyzing ? "Analyzing..." : recording ? "Recording... Click to stop" : "Click to record"}
          </span>
          {transcription && (
            <div className="mt-2 p-2 bg-muted rounded text-xs">
              {transcription}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button 
          onClick={!recording ? startRecording : stopRecording} 
          disabled={isAnalyzing}
          className={`rounded-xl ${recording ? 'bg-red-500 hover:bg-red-600' : ''}`}
        >
          {recording ? (
            <>
              <StopIcon className="h-4 w-4 mr-2" />
              Stop Recording
            </>
          ) : (
            <>
              <MicIcon className="h-4 w-4 mr-2" />
              Start Recording
            </>
          )}
        </Button>
      </div>
      {transcription && (
        <div className="p-3 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground mb-2">Audio transcription:</p>
          <Textarea 
            value={transcription} 
            readOnly 
            className="min-h-[60px]"
            placeholder="Transcription will appear here..."
          />
        </div>
      )}
    </div>
  )
}
