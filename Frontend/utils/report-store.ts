"use client"

import type { DailyReport } from "@/components/report-card"

const KEY = "moodmirror_reports"

export function loadReports(): DailyReport[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as DailyReport[]) : []
  } catch {
    return []
  }
}

export function saveReport(report: DailyReport) {
  const all = loadReports()
  all.unshift(report)
  localStorage.setItem(KEY, JSON.stringify(all.slice(0, 50)))
}
