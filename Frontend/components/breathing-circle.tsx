"use client"

import { useEffect, useState } from "react"

/**
 * 4-4-4-4 box breathing animation. Pure CSS keyframes would be simpler
 * but harder to caption phase-by-phase. We tick state every 4s and let
 * Tailwind transitions interpolate scale/opacity.
 *
 * Phases: inhale (4s) -> hold (4s) -> exhale (4s) -> hold (4s) -> repeat.
 */
type Phase = "inhale" | "hold-in" | "exhale" | "hold-out"

const PHASES: { id: Phase; label: string; durMs: number }[] = [
  { id: "inhale", label: "Breathe in", durMs: 4000 },
  { id: "hold-in", label: "Hold", durMs: 4000 },
  { id: "exhale", label: "Breathe out", durMs: 4000 },
  { id: "hold-out", label: "Hold", durMs: 4000 },
]

export function BreathingCircle({ size = 220 }: { size?: number }) {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setIdx((i) => (i + 1) % PHASES.length), PHASES[idx].durMs)
    return () => clearTimeout(t)
  }, [idx])

  const phase = PHASES[idx]
  const expanded = phase.id === "inhale" || phase.id === "hold-in"
  const scale = expanded ? 1 : 0.6

  return (
    <div className="flex flex-col items-center gap-3" aria-live="polite">
      <div
        className="relative grid place-items-center"
        style={{ width: size, height: size }}
      >
        <div
          className="absolute rounded-full bg-primary/15 transition-transform duration-[4000ms] ease-in-out"
          style={{
            width: size,
            height: size,
            transform: `scale(${scale})`,
          }}
        />
        <div
          className="absolute rounded-full bg-primary/30 transition-transform duration-[4000ms] ease-in-out"
          style={{
            width: size * 0.8,
            height: size * 0.8,
            transform: `scale(${scale})`,
          }}
        />
        <div
          className="absolute rounded-full bg-primary/60 transition-transform duration-[4000ms] ease-in-out"
          style={{
            width: size * 0.5,
            height: size * 0.5,
            transform: `scale(${scale})`,
          }}
        />
        <div className="relative z-10 text-center">
          <div className="text-lg font-medium text-foreground">{phase.label}</div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        4 seconds in, 4 hold, 4 out, 4 hold. Repeat as long as you'd like.
      </div>
    </div>
  )
}
