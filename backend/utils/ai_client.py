import os
import json
import re
import requests
import base64
from dotenv import load_dotenv
import google.generativeai as genai

API_KEY = os.getenv("GOOGLE_API_KEY")
print(f"[Gemini] GOOGLE_API_KEY: {API_KEY}")
MODEL = os.getenv("GOOGLE_MODEL", "gemini-1.5-flash")

genai.configure(api_key=API_KEY)


def _extract_candidate_text(api_json: dict) -> str:
    try:
        candidates = api_json.get("candidates", [])
        if not candidates:
            return ""
        # Join all text parts for the top candidate
        parts = candidates[0].get("content", {}).get("parts", [])
        texts = [p.get("text", "") for p in parts if isinstance(p, dict)]
        text = "\n".join([t for t in texts if t])
        return text
    except Exception:
        return ""


def _strip_code_fences(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        # remove first fence line
        s = "\n".join(s.splitlines()[1:])
    if s.endswith("```"):
        s = "\n".join(s.splitlines()[:-1])
    return s.strip()


def _find_json_block(s: str) -> str | None:
    s = _strip_code_fences(s)
    # Find first {...} block
    m = re.search(r"\{[\s\S]*\}", s)
    return m.group(0) if m else None


def _normalize_emotion(raw: str | None) -> str | None:
    if not raw:
        return None
    t = str(raw).strip().lower()
    mapping = {
        "happy": "Happy",
        "joy": "Happy",
        "joyful": "Happy",
        "calm": "Calm",
        "neutral": "Neutral",
        "sad": "Sad",
        "anxious": "Anxious",
        "anxiety": "Anxious",
        "angry": "Angry",
        "anger": "Angry",
    }
    # choose best match by containment
    for k, v in mapping.items():
        if k in t:
            return v
    # Title-case fallback
    return raw.title()


def analyze_text_with_gemini(text: str):
    print(f"[Gemini] analyze_text_with_gemini called with text: {text}")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={API_KEY}"
    system_prompt = (
        "You are an emotion detection assistant.\n"
        "Return STRICT JSON only, no prose, no markdown.\n"
        "Schema: {\"emotion\": one of ['Happy','Calm','Neutral','Sad','Anxious','Angry'], \"confidence\": number 0..1, \"explanation\": string}."
    )
    payload = {
        "generationConfig": {
            "temperature": 0.2,
            "response_mime_type": "application/json",
        },
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": system_prompt},
                    {"text": f"Text: {text}"},
                ],
            }
        ],
    }
    res = requests.post(url, json=payload)
    print(f"[Gemini] Google API HTTP status code: {res.status_code}")
    if res.status_code != 200:
        print(f"[Gemini] Google API error response: {res.text}")
        return {"error": res.text}
    data = res.json()
    print(f"[Gemini] Raw API response: {data}")
    raw_text = _extract_candidate_text(data)
    print(f"[Gemini] Extracted text (before JSON parsing): {raw_text}")
    parsed = None
    try:
        parsed = json.loads(raw_text)
    except Exception:
        # try to salvage JSON substring
        try:
            block = _find_json_block(raw_text)
            if block:
                parsed = json.loads(block)
        except Exception:
            parsed = None

    print(f"[Gemini] Parsed JSON (if successful): {parsed}")
    if isinstance(parsed, dict) and "emotion" in parsed and "confidence" in parsed:
        emotion_norm = _normalize_emotion(parsed.get("emotion"))
        try:
            conf_val = float(parsed.get("confidence"))
        except Exception:
            # Try alternate keys
            for alt in ["score", "probability", "likelihood"]:
                if alt in parsed:
                    try:
                        conf_val = float(parsed[alt])
                        break
                    except Exception:
                        pass
            else:
                conf_val = 0.9
        return {
            "emotion": emotion_norm or "Neutral",
            "confidence": conf_val,
            "explanation": parsed.get("explanation"),
            "raw": data,
        }
    # If parsing failed, return raw with unknown emotion from model only
    return {"emotion": "Unknown", "confidence": 0.0, "raw": data}


def analyze_voice_with_gemini(audio_base64: str):
    print(f"[Gemini] analyze_voice_with_gemini called.")
    # Decode base64 -> bytes
    audio_bytes = base64.b64decode(audio_base64)
    print(f"[Gemini] Received audio_bytes length: {len(audio_bytes)} bytes")
    
    # Send audio as input to Gemini
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={API_KEY}"
    headers = {"Content-Type": "application/json"}
    
    # Construct the content part for audio and text
    parts = [
        {
            "inlineData": {
                "mimeType": "audio/wav",
                "data": base64.b64encode(audio_bytes).decode('utf-8')
            }
        },
        {"text": "You are a mood detection assistant. Analyze the speaker's tone and return JSON with keys: emotion, confidence (0-1)."}
    ]

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": parts
            }
        ]
    }

    res = requests.post(url, headers=headers, json=payload)

    print(f"[Gemini] Google API HTTP status code (voice): {res.status_code}")
    if res.status_code != 200:
        print(f"[Gemini] Google API error response (voice): {res.text}")
        return {"error": res.text}
    
    data = res.json()
    print(f"[Gemini] Raw API response (voice): {data}")
    raw_text = _extract_candidate_text(data)

    parsed = None
    try:
        parsed = json.loads(raw_text)
    except Exception:
        # try to salvage JSON substring
        try:
            block = _find_json_block(raw_text)
            if block:
                parsed = json.loads(block)
        except Exception:
            parsed = None

    if isinstance(parsed, dict) and "emotion" in parsed and "confidence" in parsed:
        emotion_norm = _normalize_emotion(parsed.get("emotion"))
        try:
            conf_val = float(parsed.get("confidence"))
        except Exception:
            # Try alternate keys
            for alt in ["score", "probability", "likelihood"]:
                if alt in parsed:
                    try:
                        conf_val = float(parsed[alt])
                        break
                    except Exception:
                        pass
            else:
                conf_val = 0.9
        return {
            "emotion": emotion_norm or "Neutral",
            "confidence": conf_val,
            "explanation": parsed.get("explanation"),
            "raw": data,
        }
    # If parsing failed, return raw with unknown emotion from model only
    return {"emotion": "Unknown", "confidence": 0.0, "raw": data}


def generate_suggestion_with_gemini(text: str):
    print(f"[Gemini] generate_suggestion_with_gemini called with text: {text}")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={API_KEY}"
    
    # Better prompt for structured suggestions
    prompt = f"""Provide 2-3 practical coping suggestions for someone who feels: {text}

Format as simple, actionable advice. No markdown, no bullet points, just clear sentences.
Keep it concise and helpful."""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}]
    }
    res = requests.post(url, json=payload)
    print(f"[Gemini] Suggestion API HTTP status code: {res.status_code}")
    if res.status_code != 200:
        print(f"[Gemini] Suggestion API error response: {res.text}")
        return {"error": res.text}
    
    data = res.json()
    print(f"[Gemini] Raw suggestion API response: {data}")
    raw_text = _extract_candidate_text(data)
    print(f"[Gemini] Extracted suggestion text: {raw_text}")
    
    # Clean up the text - remove markdown, extra whitespace, etc.
    cleaned_text = _clean_suggestion_text(raw_text)
    print(f"[Gemini] Cleaned suggestion text: {cleaned_text}")
    
    return {"text": cleaned_text, "raw": data}

def _clean_suggestion_text(text: str) -> str:
    """Clean up suggestion text by removing markdown and formatting artifacts."""
    if not text:
        return "Consider taking a moment to reflect on your current emotional state."
    
    # Remove markdown formatting
    text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)  # Remove bold
    text = re.sub(r'\*(.*?)\*', r'\1', text)      # Remove italic
    text = re.sub(r'`(.*?)`', r'\1', text)        # Remove code blocks
    text = re.sub(r'#{1,6}\s*', '', text)         # Remove headers
    text = re.sub(r'^\s*[-*+]\s*', '', text, flags=re.MULTILINE)  # Remove bullet points
    text = re.sub(r'^\s*\d+\.\s*', '', text, flags=re.MULTILINE)  # Remove numbered lists
    
    # Clean up whitespace
    text = re.sub(r'\n\s*\n', '\n\n', text)       # Multiple newlines to double
    text = re.sub(r'[ \t]+', ' ', text)           # Multiple spaces to single
    text = text.strip()
    
    # If text is too short or empty, provide a default
    if len(text) < 20:
        return "Consider taking a moment to reflect on your current emotional state and practice self-care."
    
    return text


