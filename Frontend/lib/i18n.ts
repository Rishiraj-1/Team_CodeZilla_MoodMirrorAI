"use client"

import i18next from "i18next"
import { initReactI18next } from "react-i18next"

const resources = {
  en: {
    translation: {
      title: "Your AI Mood Companion",
      subtitle: "Friendly, professional and always here to help your wellbeing.",
      startSession: "Start Session",
      reports: "Reports",
    },
  },
}

let initialized = false

export function initI18n() {
  if (initialized) return
  i18next.use(initReactI18next).init({
    resources,
    lng: "en",
    fallbackLng: "en",
    supportedLngs: ["en"],
    interpolation: { escapeValue: false },
  })
  initialized = true
}
