"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export type DailyReport = {
  date: string
  summary: string
  crisisAlert: boolean
  suggestionEn: string
  suggestionHi?: string
  dominantMood: string
}

export function ReportCard({ report }: { report: DailyReport }) {
  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Daily Report — {report.date}</CardTitle>
        <span
          className={
            report.crisisAlert
              ? "rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700"
              : "rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700"
          }
          aria-label={report.crisisAlert ? "Crisis alert" : "No crisis"}
        >
          {report.crisisAlert ? "⚠️ Alert" : "✅ Stable"}
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-sm text-muted-foreground">Dominant mood</div>
        <div className="text-lg font-semibold">{report.dominantMood}</div>
        <p className="text-pretty text-sm leading-relaxed">{report.summary}</p>
        <div>
          <div className="text-sm font-medium">Coping suggestions</div>
          <div className="mt-1 space-y-1">
            <p className="text-sm" lang="en">
              <span className="mr-2 rounded bg-secondary px-1.5 py-0.5 text-xs">EN</span>
              {report.suggestionEn}
            </p>
            {report.suggestionHi ? (
              <p className="text-sm" lang="hi">
                <span className="mr-2 rounded bg-secondary px-1.5 py-0.5 text-xs">हिं</span>
                {report.suggestionHi}
              </p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
