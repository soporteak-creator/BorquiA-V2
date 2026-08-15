import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

initializeApp();

function chileDateKey(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

async function sendToUser(uid, notification) {
  const db = getFirestore();
  const tokensSnap = await db.collection("users").doc(uid).collection("fcmTokens").get();
  if (tokensSnap.empty) return { sent: 0 };

  const tokens = tokensSnap.docs.map(d => d.id);
  const response = await getMessaging().sendEachForMulticast({ tokens, notification });

  const invalid = [];
  response.responses.forEach((r, i) => {
    if (!r.success && ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(r.error?.code)) {
      invalid.push(tokens[i]);
    }
  });
  await Promise.all(invalid.map(t => db.collection("users").doc(uid).collection("fcmTokens").doc(t).delete()));

  return { sent: response.successCount };
}

const MODEL = "gemini-flash-latest";
const geminiApiKey = defineSecret("GEMINI_API_KEY");

function requireAdmin(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  if (request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "No tienes permisos de administrador.");
  }
}

export const adminGetUsers = onCall({ region: "southamerica-west1" }, async (request) => {
  requireAdmin(request);

  const auth = getAuth();
  const users = [];
  let pageToken;
  do {
    const result = await auth.listUsers(1000, pageToken);
    for (const u of result.users) {
      users.push({
        uid: u.uid,
        email: u.email ?? null,
        displayName: u.displayName ?? null,
        createdAt: u.metadata.creationTime,
        lastSignIn: u.metadata.lastSignInTime,
        disabled: u.disabled,
      });
    }
    pageToken = result.pageToken;
  } while (pageToken);

  return { users };
});

export const adminGetStats = onCall({ region: "southamerica-west1" }, async (request) => {
  requireAdmin(request);

  const db = getFirestore();
  const [profilesCount, logsCount, goalsCount] = await Promise.all([
    db.collection("users").count().get(),
    db.collectionGroup("dailyLogs").count().get(),
    db.collectionGroup("goals").count().get(),
  ]);

  return {
    totalProfiles: profilesCount.data().count,
    totalDailyLogs: logsCount.data().count,
    totalGoals: goalsCount.data().count,
  };
});

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

export const sendTestNotification = onCall({ region: "southamerica-west1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const result = await sendToUser(request.auth.uid, {
    title: "BorquIA",
    body: "¡Notificaciones activadas! Así se verán tus recordatorios.",
  });
  if (result.sent === 0) {
    throw new HttpsError("failed-precondition", "No se encontró ningún dispositivo con notificaciones activadas.");
  }
  return result;
});

const REMINDER_BY_HOUR = {
  8: { field: "morning", title: "Buenos días 👋", body: "Registra tu día en BorquIA para empezar con intención." },
  14: { field: "water", title: "Hora de hidratarte 💧", body: "¿Ya bebiste suficiente agua hoy? Registra tu avance en BorquIA." },
  20: { field: "evening", title: "Cierra tu día 🌙", body: "No olvides completar tu registro diario en BorquIA." },
};

export const sendReminders = onSchedule({ schedule: "0 * * * *", timeZone: "America/Santiago", region: "southamerica-east1" }, async () => {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", hour: "numeric", hour12: false }).format(new Date()));
  const reminder = REMINDER_BY_HOUR[hour];
  if (!reminder) return;

  const db = getFirestore();
  const today = chileDateKey();
  const usersSnap = await db.collection("users").where(`reminders.${reminder.field}`, "==", true).get();

  await Promise.all(usersSnap.docs.map(async (userDoc) => {
    const uid = userDoc.id;
    const logSnap = await db.collection("users").doc(uid).collection("dailyLogs").doc(today).get();
    const log = logSnap.exists ? logSnap.data() : null;

    if (reminder.field === "water") {
      if (log && log.water >= 8) return; // already met today's goal
    } else if (log) {
      return; // already logged today, skip morning/evening nudge
    }

    await sendToUser(uid, { title: reminder.title, body: reminder.body }).catch(err => console.error("sendReminders failed for", uid, err));
  }));
});
