"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

/**
 * 5-4-3-2-1 senses grounding exercise.
 *
 * We don't time-gate the steps -- the user moves at their own pace.
 * This is deliberate. Forced timers feel coercive in a crisis.
 */
const STEPS = [
  { count: 5, sense: "see", prompt: "Look around and name 5 things you can see." },
  { count: 4, sense: "feel", prompt: "Notice 4 things you can feel touching your body." },
  { count: 3, sense: "hear", prompt: "Listen for 3 sounds, near or far." },
  { count: 2, sense: "smell", prompt: "Find 2 things you can smell." },
  { count: 1, sense: "taste", prompt: "Notice 1 thing you can taste." },
]

export function GroundingExercise({ onDone }: { onDone?: () => void }) {
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const last = step === STEPS.length - 1

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Grounding: 5-4-3-2-1</div>
        <div className="text-xs text-muted-foreground">
          Step {step + 1} of {STEPS.length}
        </div>
      </div>
      <div className="rounded-lg bg-muted/40 p-4">
        <div className="text-3xl font-semibold text-primary">{current.count}</div>
        <div className="mt-1 text-sm leading-relaxed">{current.prompt}</div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="rounded-full"
        >
          Back
        </Button>
        {!last ? (
          <Button
            size="sm"
            onClick={() => setStep((s) => s + 1)}
            className="rounded-full"
          >
            Next
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => {
              setStep(0)
              onDone?.()
            }}
            className="rounded-full"
          >
            I'm done
          </Button>
        )}
      </div>
    </div>
  )
}
