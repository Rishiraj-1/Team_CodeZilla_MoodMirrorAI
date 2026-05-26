"use client"

import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { mirrorChat, mirrorHistory, mirrorReset, type MirrorMessage } from "@/utils/api"

type Bubble = MirrorMessage & { id: string; pending?: boolean }

function Avatar({ role }: { role: "user" | "model" }) {
  if (role === "user") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
        You
      </div>
    )
  }
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
      M
    </div>
  )
}

function MessageBubble({ msg }: { msg: Bubble }) {
  const isUser = msg.role === "user"
  return (
    <div className={`flex w-full gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <Avatar role={msg.role} />
      <div
        className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? "rounded-tr-sm bg-primary text-primary-foreground"
            : "rounded-tl-sm bg-muted text-foreground"
        } ${msg.pending ? "opacity-60" : ""}`}
      >
        {msg.text}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex w-full gap-3">
      <Avatar role="model" />
      <div className="rounded-2xl rounded-tl-sm bg-muted px-3 py-2">
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/60 [animation-delay:-0.3s]"></span>
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/60 [animation-delay:-0.15s]"></span>
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/60"></span>
        </span>
      </div>
    </div>
  )
}

export function MirrorChat() {
  const [messages, setMessages] = useState<Bubble[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [contextHint, setContextHint] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Hydrate from server on mount.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await mirrorHistory()
        if (cancelled) return
        const hydrated: Bubble[] = (data.messages || []).map((m, i) => ({
          ...m,
          id: `srv-${i}-${m.created_at || ""}`,
        }))
        setMessages(hydrated)
      } catch (e: any) {
        // Not authed yet, or backend down -- show friendly empty state.
        console.warn("[mirror] history hydrate failed:", e?.message)
      } finally {
        if (!cancelled) setLoadingHistory(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Autoscroll on every message change.
  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, sending])

  async function send() {
    const text = input.trim()
    if (!text || sending) return

    const userBubble: Bubble = {
      id: `local-${Date.now()}`,
      role: "user",
      text,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userBubble])
    setInput("")
    setSending(true)
    setError(null)

    try {
      const res = await mirrorChat(text)
      const ctx = res.context_used
      if (ctx?.latest_emotion) {
        setContextHint(
          `Mirror sees your latest reading: ${ctx.latest_emotion}` +
            (ctx.readings_count ? ` (last ${ctx.readings_count} readings)` : ""),
        )
      } else {
        setContextHint("No emotion readings yet -- Mirror is going on what you say.")
      }
      const modelBubble: Bubble = {
        id: `srv-${Date.now()}`,
        role: "model",
        text: res.reply,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, modelBubble])
    } catch (e: any) {
      setError(e?.message || "Could not reach Mirror")
      // Surface the failure inline so the user isn't left guessing.
      const errBubble: Bubble = {
        id: `err-${Date.now()}`,
        role: "model",
        text:
          "I couldn't reach my own thoughts just now. Could you try sending that again in a moment?",
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, errBubble])
    } finally {
      setSending(false)
    }
  }

  async function reset() {
    if (!confirm("Clear this conversation? I won't remember what we discussed.")) return
    try {
      await mirrorReset()
      setMessages([])
      setContextHint(null)
      setError(null)
    } catch (e: any) {
      setError(e?.message || "Could not reset")
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Mirror</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            A reflective companion. Not a therapist. Speaks gently, remembers your last few readings.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          className="rounded-full text-xs text-muted-foreground hover:text-foreground"
        >
          Reset chat
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {contextHint ? (
          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {contextHint}
          </div>
        ) : null}

        <div
          ref={scrollRef}
          className="h-[55vh] min-h-[360px] space-y-3 overflow-y-auto rounded-xl border bg-muted/10 p-3"
        >
          {loadingHistory ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : messages.length === 0 ? (
            <div className="grid h-full place-items-center px-6 text-center text-sm text-muted-foreground">
              <div className="space-y-2">
                <div className="text-2xl">M</div>
                <div className="font-medium text-foreground">Hi, I'm Mirror.</div>
                <div className="max-w-xs">
                  Tell me anything that's on your mind. I'll listen first, ask one small question
                  at a time, and won't lecture you.
                </div>
              </div>
            </div>
          ) : (
            messages.map((m) => <MessageBubble key={m.id} msg={m} />)
          )}
          {sending ? <TypingIndicator /> : null}
        </div>

        <div className="flex items-center gap-2">
          <Input
            placeholder="Type how you're feeling..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={sending}
            aria-label="Message Mirror"
            className="rounded-xl"
          />
          <Button onClick={send} disabled={sending || !input.trim()} className="rounded-xl">
            {sending ? "..." : "Send"}
          </Button>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {error}
          </div>
        ) : null}

        <p className="text-[11px] text-muted-foreground">
          If you're in danger or feel like hurting yourself, please reach iCall (9152987821),
          Vandrevala Foundation (1860-2662-345), or AASRA (9820466726).
        </p>
      </CardContent>
    </Card>
  )
}
