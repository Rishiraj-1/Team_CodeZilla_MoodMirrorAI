"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type Level = "log" | "info" | "warn" | "error"

type LogEntry = {
  id: string
  level: Level
  message: string
  args: unknown[]
  time: number
}

const MAX_LOGS = 500

function formatTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString()
}

export function DebugConsole() {
  const [logs, setLogs] = React.useState<LogEntry[]>([])
  const [filter, setFilter] = React.useState<Level | "all">("all")

  React.useEffect(() => {
    const original = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
    }

    const makeProxy =
      (level: Level) =>
      (...args: unknown[]) => {
        try {
          setLogs((prev) => {
            const entry: LogEntry = {
              id: crypto.randomUUID(),
              level,
              message: typeof args[0] === "string" ? (args[0] as string) : JSON.stringify(args[0]),
              args,
              time: Date.now(),
            }
            const next = [...prev, entry]
            if (next.length > MAX_LOGS) next.shift()
            return next
          })
        } catch {
          // ignore
        }
        // @ts-expect-error keep original behavior
        original[level](...args)
      }

    console.log = makeProxy("log")
    console.info = makeProxy("info")
    console.warn = makeProxy("warn")
    console.error = makeProxy("error")

    return () => {
      console.log = original.log
      console.info = original.info
      console.warn = original.warn
      console.error = original.error
    }
  }, [])

  const filtered = React.useMemo(
    () => (filter === "all" ? logs : logs.filter((l) => l.level === filter)),
    [logs, filter],
  )

  const copyAll = async () => {
    const payload = JSON.stringify(
      {
        meta: getRuntimeMeta(),
        logs,
      },
      null,
      2,
    )
    await navigator.clipboard.writeText(payload)
  }

  const clear = () => setLogs([])

  const meta = getRuntimeMeta()

  return (
    <div className="space-y-4">
      <Card className="rounded-xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-pretty">Runtime Environment</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-6">
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <div className="font-medium">Preview Host</div>
              <div className="text-muted-foreground break-all">{meta.host || "(unknown)"}</div>
            </div>
            <div>
              <div className="font-medium">User Agent</div>
              <div className="text-muted-foreground">{meta.ua}</div>
            </div>
            <div>
              <div className="font-medium">Firebase env detected</div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={meta.firebase.apiKey ? "default" : "destructive"}>API_KEY</Badge>
                <Badge variant={meta.firebase.authDomain ? "default" : "destructive"}>AUTH_DOMAIN</Badge>
                <Badge variant={meta.firebase.projectId ? "default" : "destructive"}>PROJECT_ID</Badge>
                <Badge variant={meta.firebase.appId ? "default" : "destructive"}>APP_ID</Badge>
              </div>
            </div>
            <div>
              <div className="font-medium">Notes</div>
              <div className="text-muted-foreground">
                This page replaces /v0_app_debug_logs to avoid the LightningCSS WASM fetch.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Console</CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
              All
            </Button>
            <Button size="sm" variant={filter === "log" ? "default" : "outline"} onClick={() => setFilter("log")}>
              Log
            </Button>
            <Button size="sm" variant={filter === "info" ? "default" : "outline"} onClick={() => setFilter("info")}>
              Info
            </Button>
            <Button size="sm" variant={filter === "warn" ? "default" : "outline"} onClick={() => setFilter("warn")}>
              Warn
            </Button>
            <Button size="sm" variant={filter === "error" ? "default" : "outline"} onClick={() => setFilter("error")}>
              Error
            </Button>
            <div className="w-px h-5 bg-border" />
            <Button size="sm" variant="outline" onClick={clear}>
              Clear
            </Button>
            <Button size="sm" onClick={copyAll}>
              Copy JSON
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 max-h-[60vh] overflow-auto pr-2">
            {filtered.map((l) => (
              <li
                key={l.id}
                className="rounded-md bg-muted/40 p-2 text-sm"
                aria-label={`console ${l.level} at ${formatTime(l.time)}`}
              >
                <div className="flex items-center gap-2">
                  <Badge variant={badgeVariantFor(l.level)}>{l.level}</Badge>
                  <span className="text-xs text-muted-foreground">{formatTime(l.time)}</span>
                </div>
                <pre className="mt-1 whitespace-pre-wrap break-words">
                  {String(l.message)}
                  {l.args.length > 1 ? "\n" + safeStringify(l.args.slice(1)) : ""}
                </pre>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="text-sm text-muted-foreground">No logs yet. Trigger actions in the app to see logs.</li>
            )}
          </ul>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            console.log("[app] test log", { ts: Date.now() })
            console.info("[app] test info")
            console.warn("[app] test warn")
            console.error("[app] test error")
          }}
        >
          Emit test logs
        </Button>
      </div>
    </div>
  )
}

function badgeVariantFor(level: Level): "default" | "secondary" | "destructive" {
  switch (level) {
    case "error":
      return "destructive"
    case "warn":
      return "secondary"
    default:
      return "default"
  }
}

function safeStringify(v: unknown) {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

function getRuntimeMeta() {
  // Pull public envs from process.env if available (RSC), otherwise from window
  const w = typeof window !== "undefined" ? (window as any) : undefined
  const injected = w?.__PUBLIC_ENV ?? {}
  const read = (k: string) => (typeof process !== "undefined" ? (process as any).env?.[k] : undefined) || injected[k]

  const sanitize = (val: unknown) => (typeof val === "string" ? val.trim().replace(/^"+|"+$/g, "") : undefined)

  return {
    host: typeof window !== "undefined" ? window.location.host : "",
    ua: typeof navigator !== "undefined" ? navigator.userAgent : "(server)",
    firebase: {
      apiKey: !!sanitize(read("NEXT_PUBLIC_FIREBASE_API_KEY")),
      authDomain: !!sanitize(read("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN")),
      projectId: !!sanitize(read("NEXT_PUBLIC_FIREBASE_PROJECT_ID")),
      appId: !!sanitize(read("NEXT_PUBLIC_FIREBASE_APP_ID")),
    },
  }
}
