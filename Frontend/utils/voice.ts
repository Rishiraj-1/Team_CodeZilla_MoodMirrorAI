export async function analyzeVoice(audioBlob: Blob, userId: string) {
  const base64Audio = await blobToBase64(audioBlob);

  const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/analyze/voice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      audio_base64: base64Audio,
    }),
  });

  return res.json();
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
