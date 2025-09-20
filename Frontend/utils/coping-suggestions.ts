export type RiskLevel = "High" | "Medium" | "Low"

type GetSuggestionArgs = {
  crisis?: boolean
  riskLevel?: RiskLevel
  mood?: string
  seed?: number
}

type Suggestion = { en: string; hi: string }

function pickFrom<T>(arr: T[], seed?: number): T {
  if (typeof seed === "number") {
    const idx = Math.abs(seed) % arr.length
    return arr[idx]
  }
  return arr[Math.floor(Math.random() * arr.length)]
}

export function getCopingSuggestion(args: GetSuggestionArgs = {}): Suggestion {
  // derive an effective risk level
  let level: RiskLevel | undefined = args.riskLevel
  if (args.crisis) {
    level = "High"
  } else if (!level && args.mood) {
    const lowMoods = new Set(["Happy", "Calm", "Neutral"])
    const medMoods = new Set(["Sad", "Anxious"])
    const highMoods = new Set(["Angry", "Fear"])
    if (highMoods.has(args.mood)) level = "High"
    else if (medMoods.has(args.mood)) level = "Medium"
    else if (lowMoods.has(args.mood)) level = "Low"
  }
  level = level || "Low"

  const high: Suggestion[] = [
    {
      en: "Call a close family member today and share how you’re feeling. Practice 4‑7‑8 breathing for 3 minutes.",
      hi: "आज किसी नज़दीकी परिवारजन को फ़ोन करें और अपनी भावनाएँ साझा करें। 4‑7‑8 श्वास तकनीक 3 मिनट करें।",
    },
    {
      en: "Sit in a quiet space for 5 minutes. Do Anulom‑Vilom and drink a glass of water slowly.",
      hi: "5 मिनट शांति से बैठें। अनुलोम‑विलोम करें और धीरे‑धीरे एक गिलास पानी पिएँ।",
    },
    {
      en: "Keep emergency contacts handy. If distress rises, step outside for fresh air and slow walking.",
      hi: "आपातकालीन संपर्क पास रखें। तकलीफ़ बढ़े तो बाहर ताज़ी हवा में धीरे‑धीरे टहलें।",
    },
    {
      en: "Listen to calming bhajans or instrumental music while doing deep belly breathing (5 counts in, 6 out).",
      hi: "शांत भजन या वाद्य संगीत सुनते हुए गहरी पेट साँस लें (5 गिनती अंदर, 6 बाहर)।",
    },
    {
      en: "Ask a trusted person to sit with you. Ground yourself: name 5 things you can see, 4 you can touch.",
      hi: "किसी विश्वसनीय व्यक्ति से साथ बैठने को कहें। ग्राउंडिंग करें: 5 चीजें देखें, 4 को छुएँ।",
    },
  ]

  const medium: Suggestion[] = [
    {
      en: "Practice 10 slow breaths and a short walk in sunlight. Share a chai break with a friend or sibling.",
      hi: "10 धीमी साँसें लें और धूप में थोड़ी सैर करें। किसी दोस्त या भाई‑बहन के साथ चाय का विराम लें।",
    },
    {
      en: "Try gentle yoga: Tadasana and Balasana for 5 minutes. Limit news and social media today.",
      hi: "हल्का योग करें: ताड़ासन और बालासन 5 मिनट। आज समाचार और सोशल मीडिया सीमित रखें।",
    },
    {
      en: "Write down three worries and one small step for each. Talk to a family member this evening.",
      hi: "तीन चिंताएँ लिखें और हर एक के लिए एक छोटा कदम तय करें। शाम को परिवार में किसी से बात करें।",
    },
    {
      en: "Practice box breathing (4‑4‑4‑4). Eat a simple, nourishing meal and drink enough water.",
      hi: "बॉक्स ब्रीदिंग (4‑4‑4‑4) करें। हल्का पौष्टिक भोजन करें और पानी पर्याप्त पिएँ।",
    },
    {
      en: "Light stretching plus 5 minutes of guided meditation. Plan a family walk after dinner.",
      hi: "हल्का स्ट्रेचिंग और 5 मिनट गाइडेड मेडिटेशन करें। रात के खाने के बाद परिवार के साथ टहलने की योजना बनाएँ।",
    },
  ]

  const low: Suggestion[] = [
    {
      en: "Maintain your routine: 7–8 hours sleep, balanced meals, and a 10‑minute evening stroll.",
      hi: "रूटीन बनाए रखें: 7–8 घंटे की नींद, संतुलित भोजन और 10 मिनट शाम की सैर।",
    },
    {
      en: "Do 5 minutes of gratitude journaling. Note one positive from family support today.",
      hi: "5 मिनट कृतज्ञता जर्नलिंग करें। परिवार से मिली एक सकारात्मक बात लिखें।",
    },
    {
      en: "Try Anulom‑Vilom or mindful tea drinking. Focus on aroma, warmth, and each sip.",
      hi: "अनुलोम‑विलोम या सजग होकर चाय पिएँ। खुशबू, गर्माहट और हर घूंट पर ध्यान दें।",
    },
    {
      en: "Spend time in nature or near plants. Stretch your body every couple of hours.",
      hi: "प्रकृति/पौधों के पास समय बिताएँ। हर कुछ घंटों में शरीर स्ट्रेच करें।",
    },
    {
      en: "Plan a simple family activity this week: shared meal or a board game night.",
      hi: "इस सप्ताह एक सरल पारिवारिक गतिविधि तय करें: साथ भोजन या बोर्ड गेम नाइट।",
    },
  ]

  const pool = level === "High" ? high : level === "Medium" ? medium : low
  return pickFrom(pool, args.seed)
}
