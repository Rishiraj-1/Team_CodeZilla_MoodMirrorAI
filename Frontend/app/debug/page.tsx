export default function DebugPage() {
  return (
    <main className="container mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-pretty">Debug</h1>
      {/* The debug console is a client component */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {/* We import dynamically to avoid RSC issues */}
    </main>
  )
}

// Keeping it simple here; the page imports the client component directly:
import { DebugConsole } from "@/components/debug-console"

export const dynamic = "force-dynamic"

export function DebugConsoleSection() {
  return <DebugConsole />
}
