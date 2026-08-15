import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

const MODEL = "gemini-flash-latest";
const geminiApiKey = defineSecret("GEMINI_API_KEY");

const SYSTEM_INSTRUCTION = `Eres el asistente de bienestar de BorquIA, una plataforma de salud y bienestar personal.

Reglas estrictas:
- Entregas SOLO información general de bienestar (sueño, hidratación, actividad física, alimentación, manejo del estrés).
- NUNCA realizas diagnósticos médicos.
- NUNCA prescribes medicamentos ni indicas cambios de dosis.
- NO reemplazas a un médico u otro profesional de la salud.
- Cuando la consulta pueda requerir evaluación clínica (síntomas, dolor, medicamentos, condiciones preexistentes), recomienda explícitamente consultar a un profesional de la salud.
- Explica brevemente el razonamiento detrás de tus recomendaciones.
- Usa un tono cercano, cálido y profesional. Respuestas breves (máximo 3-4 párrafos cortos).
- Responde siempre en español.
- No uses formato markdown (nada de **negritas**, títulos con #, ni listas con guiones). Texto plano, usa saltos de línea entre párrafos.
- Si tienes datos del usuario (hábitos registrados), úsalos para personalizar la respuesta, mencionando explícitamente qué dato usaste.
- Termina cada respuesta con una advertencia breve si el tema lo amerita, pero no la repitas si ya es una conversación de seguimiento sobre el mismo tema.`;

const MAX_HISTORY_TURNS = 20;
const MAX_MESSAGE_LENGTH = 2000;

export const askCoach = onCall({ secrets: [geminiApiKey], region: "southamerica-west1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión para usar el asistente.");
  }

  const { message, history, context } = request.data ?? {};
  if (typeof message !== "string" || !message.trim()) {
    throw new HttpsError("invalid-argument", "Falta el mensaje.");
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new HttpsError("invalid-argument", "El mensaje es demasiado largo.");
  }
  const safeHistory = Array.isArray(history) ? history.slice(-MAX_HISTORY_TURNS) : [];

  const contents = [
    { role: "user", parts: [{ text: typeof context === "string" && context ? context : "El usuario no ha compartido datos personales todavía." }] },
    { role: "model", parts: [{ text: "Entendido, tendré esto en cuenta." }] },
    ...safeHistory
      .filter(h => h && typeof h.text === "string" && (h.role === "user" || h.role === "model"))
      .map(h => ({ role: h.role, parts: [{ text: h.text }] })),
    { role: "user", parts: [{ text: message }] },
  ];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${geminiApiKey.value()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error("Gemini API error", res.status, errText);
    throw new HttpsError("internal", "No se pudo obtener respuesta del asistente.");
  }

  const data = await res.json();
  const reply = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") ?? "";
  if (!reply) {
    throw new HttpsError("internal", "El asistente no entregó una respuesta.");
  }
  return { reply };
});
