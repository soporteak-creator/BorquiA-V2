import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
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

function serializeDoc(data) {
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = v && typeof v.toDate === "function" ? v.toDate().toISOString() : v;
  }
  return out;
}

async function logAudit(request, action, target, details) {
  await getFirestore().collection("auditLogs").add({
    adminEmail: request.auth.token.email ?? request.auth.uid,
    action,
    target,
    details: details ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

const MANAGED_COLLECTIONS = ["wellnessContent", "recommendations", "categories"];

function requireManagedCollection(name) {
  if (!MANAGED_COLLECTIONS.includes(name)) {
    throw new HttpsError("invalid-argument", "Colección no permitida.");
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

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let activeLast7Days = 0;
  let newUsersLast7Days = 0;
  let pageToken;
  do {
    const result = await getAuth().listUsers(1000, pageToken);
    for (const u of result.users) {
      if (new Date(u.metadata.lastSignInTime).getTime() >= weekAgo) activeLast7Days++;
      if (new Date(u.metadata.creationTime).getTime() >= weekAgo) newUsersLast7Days++;
    }
    pageToken = result.pageToken;
  } while (pageToken);

  const totalProfiles = profilesCount.data().count;
  const totalGoals = goalsCount.data().count;

  return {
    totalProfiles,
    totalDailyLogs: logsCount.data().count,
    totalGoals,
    activeLast7Days,
    newUsersLast7Days,
    avgGoalsPerUser: totalProfiles > 0 ? Math.round((totalGoals / totalProfiles) * 10) / 10 : 0,
  };
});

export const adminSetUserDisabled = onCall({ region: "southamerica-west1" }, async (request) => {
  requireAdmin(request);
  const { uid, disabled } = request.data ?? {};
  if (typeof uid !== "string" || typeof disabled !== "boolean") {
    throw new HttpsError("invalid-argument", "Datos inválidos.");
  }
  if (uid === request.auth.uid) {
    throw new HttpsError("failed-precondition", "No puedes deshabilitar tu propia cuenta.");
  }
  await getAuth().updateUser(uid, { disabled });
  await logAudit(request, disabled ? "disable_user" : "enable_user", `users/${uid}`);
  return { ok: true };
});

export const adminDeleteUser = onCall({ region: "southamerica-west1" }, async (request) => {
  requireAdmin(request);
  const { uid } = request.data ?? {};
  if (typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "uid inválido.");
  }
  if (uid === request.auth.uid) {
    throw new HttpsError("failed-precondition", "No puedes eliminar tu propia cuenta desde aquí.");
  }
  await getAuth().deleteUser(uid);
  await getFirestore().recursiveDelete(getFirestore().collection("users").doc(uid));
  await logAudit(request, "delete_user", `users/${uid}`);
  return { ok: true };
});

export const adminListDocs = onCall({ region: "southamerica-west1" }, async (request) => {
  requireAdmin(request);
  const { collection } = request.data ?? {};
  requireManagedCollection(collection);
  const snap = await getFirestore().collection(collection).orderBy("createdAt", "desc").get();
  return { docs: snap.docs.map(d => ({ id: d.id, ...serializeDoc(d.data()) })) };
});

export const adminSaveDoc = onCall({ region: "southamerica-west1" }, async (request) => {
  requireAdmin(request);
  const { collection, id, data } = request.data ?? {};
  requireManagedCollection(collection);
  if (!data || typeof data !== "object") {
    throw new HttpsError("invalid-argument", "Datos inválidos.");
  }
  const db = getFirestore();
  const ref = id ? db.collection(collection).doc(id) : db.collection(collection).doc();
  const now = FieldValue.serverTimestamp();
  await ref.set({ ...data, updatedAt: now, ...(id ? {} : { createdAt: now }) }, { merge: true });
  await logAudit(request, id ? "update" : "create", `${collection}/${ref.id}`, data);
  return { id: ref.id };
});

export const adminDeleteDoc = onCall({ region: "southamerica-west1" }, async (request) => {
  requireAdmin(request);
  const { collection, id } = request.data ?? {};
  requireManagedCollection(collection);
  if (typeof id !== "string") {
    throw new HttpsError("invalid-argument", "id inválido.");
  }
  await getFirestore().collection(collection).doc(id).delete();
  await logAudit(request, "delete", `${collection}/${id}`);
  return { ok: true };
});

export const adminGetConfig = onCall({ region: "southamerica-west1" }, async (request) => {
  requireAdmin(request);
  const snap = await getFirestore().collection("config").doc("app").get();
  return snap.exists ? serializeDoc(snap.data()) : { maintenanceMode: false, announcementBanner: "" };
});

export const adminSaveConfig = onCall({ region: "southamerica-west1" }, async (request) => {
  requireAdmin(request);
  const { maintenanceMode, announcementBanner } = request.data ?? {};
  await getFirestore().collection("config").doc("app").set({
    maintenanceMode: !!maintenanceMode,
    announcementBanner: typeof announcementBanner === "string" ? announcementBanner.slice(0, 500) : "",
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await logAudit(request, "update", "config/app", { maintenanceMode, announcementBanner });
  return { ok: true };
});

export const adminGetAuditLogs = onCall({ region: "southamerica-west1" }, async (request) => {
  requireAdmin(request);
  const snap = await getFirestore().collection("auditLogs").orderBy("createdAt", "desc").limit(100).get();
  return { logs: snap.docs.map(d => ({ id: d.id, ...serializeDoc(d.data()) })) };
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

// ── Device integrations ─────────────────────────────────────────
//
// Data model:
//   users/{uid}/healthMetrics/{date}     normalized daily metrics, client-readable, Functions-only write
//   users/{uid}/deviceConnections/{prov} connection status, client-readable, Functions-only write
//   deviceTokens/{uid}_{provider}        OAuth tokens, server-only (no client Firestore rule at all)
//
// Apple Health and Google Health Connect have no web API — they only sync
// through a native iOS/Android app. ingestHealthMetrics below is the generic
// landing point a future native app would call (authenticated as the
// Firebase user) to push data it read from HealthKit / Health Connect.
//
// Fitbit has a documented OAuth2 web API and is fully wired below. It won't
// work until FITBIT_CLIENT_ID/FITBIT_CLIENT_SECRET are set with real
// credentials from https://dev.fitbit.com (register an app with redirect
// URI = FITBIT_REDIRECT_URI below) — until then connectFitbit fails with a
// clear "not configured" error instead of doing something broken.
//
// Garmin and Samsung Health both require vendor business approval before
// you even get API access, so there's nothing safe to scaffold yet without
// real docs to build against — they're left as "not available" in the UI.

const SUPPORTED_PROVIDERS = ["apple_health", "google_health_connect", "fitbit", "garmin", "samsung_health"];
const METRIC_FIELDS = ["steps", "heartRateAvg", "heartRateResting", "sleepMinutes", "caloriesBurned", "activeMinutes"];

export const ingestHealthMetrics = onCall({ region: "southamerica-west1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const { date, metrics, source } = request.data ?? {};
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpsError("invalid-argument", "Fecha inválida (usa YYYY-MM-DD).");
  }
  if (!metrics || typeof metrics !== "object") {
    throw new HttpsError("invalid-argument", "Faltan métricas.");
  }
  const clean = {};
  for (const key of METRIC_FIELDS) {
    if (typeof metrics[key] === "number" && Number.isFinite(metrics[key])) clean[key] = metrics[key];
  }
  if (Object.keys(clean).length === 0) {
    throw new HttpsError("invalid-argument", "Ninguna métrica reconocida o válida.");
  }

  await getFirestore().collection("users").doc(request.auth.uid).collection("healthMetrics").doc(date).set({
    ...clean,
    source: typeof source === "string" ? source.slice(0, 50) : "unknown",
    syncedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true };
});

export const disconnectDevice = onCall({ region: "southamerica-west1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const { provider } = request.data ?? {};
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new HttpsError("invalid-argument", "Proveedor no soportado.");
  }
  const uid = request.auth.uid;
  const db = getFirestore();
  await db.collection("deviceTokens").doc(`${uid}_${provider}`).delete();
  await db.collection("users").doc(uid).collection("deviceConnections").doc(provider).set({
    provider,
    status: "disconnected",
    disconnectedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ok: true };
});

const fitbitClientId = defineSecret("FITBIT_CLIENT_ID");
const fitbitClientSecret = defineSecret("FITBIT_CLIENT_SECRET");
const FITBIT_REDIRECT_URI = "https://southamerica-west1-borquia-v2.cloudfunctions.net/fitbitOAuthCallback";

export const connectFitbit = onCall({ secrets: [fitbitClientId], region: "southamerica-west1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const clientId = fitbitClientId.value();
  if (!clientId || clientId === "not-configured") {
    throw new HttpsError("failed-precondition", "Fitbit todavía no está configurado (faltan credenciales de desarrollador).");
  }
  const scope = encodeURIComponent("activity heartrate sleep profile");
  const url = `https://www.fitbit.com/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(FITBIT_REDIRECT_URI)}&scope=${scope}&state=${request.auth.uid}`;
  return { url };
});

export const fitbitOAuthCallback = onRequest({ secrets: [fitbitClientId, fitbitClientSecret], region: "southamerica-west1" }, async (req, res) => {
  const { code, state: uid, error } = req.query;
  if (error) {
    res.status(400).send("Conexión con Fitbit cancelada.");
    return;
  }
  if (!code || !uid) {
    res.status(400).send("Solicitud inválida.");
    return;
  }
  try {
    const basicAuth = Buffer.from(`${fitbitClientId.value()}:${fitbitClientSecret.value()}`).toString("base64");
    const tokenRes = await fetch("https://api.fitbit.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basicAuth}` },
      body: new URLSearchParams({
        client_id: fitbitClientId.value(),
        grant_type: "authorization_code",
        redirect_uri: FITBIT_REDIRECT_URI,
        code: String(code),
      }),
    });
    if (!tokenRes.ok) {
      console.error("Fitbit token exchange failed", tokenRes.status, await tokenRes.text());
      res.status(500).send("No se pudo completar la conexión con Fitbit.");
      return;
    }
    const tokens = await tokenRes.json();
    const db = getFirestore();
    await db.collection("deviceTokens").doc(`${uid}_fitbit`).set({
      provider: "fitbit",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      fitbitUserId: tokens.user_id,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await db.collection("users").doc(String(uid)).collection("deviceConnections").doc("fitbit").set({
      provider: "fitbit",
      status: "connected",
      connectedAt: FieldValue.serverTimestamp(),
      lastSyncAt: null,
    });
    res.redirect("https://borquia-v2.web.app/?fitbit=connected");
  } catch (e) {
    console.error("fitbitOAuthCallback error", e);
    res.status(500).send("Ocurrió un error al conectar con Fitbit.");
  }
});

async function getFreshFitbitAccessToken(uid) {
  const db = getFirestore();
  const ref = db.collection("deviceTokens").doc(`${uid}_fitbit`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const tokenDoc = snap.data();

  if (Date.now() < tokenDoc.expiresAt - 60_000) return tokenDoc.accessToken;

  const basicAuth = Buffer.from(`${fitbitClientId.value()}:${fitbitClientSecret.value()}`).toString("base64");
  const res = await fetch("https://api.fitbit.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basicAuth}` },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokenDoc.refreshToken }),
  });
  if (!res.ok) throw new Error("No se pudo refrescar el token de Fitbit.");
  const fresh = await res.json();
  await ref.set({
    accessToken: fresh.access_token,
    refreshToken: fresh.refresh_token,
    expiresAt: Date.now() + fresh.expires_in * 1000,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return fresh.access_token;
}

export const syncFitbitData = onCall({ secrets: [fitbitClientId, fitbitClientSecret], region: "southamerica-west1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const uid = request.auth.uid;
  const accessToken = await getFreshFitbitAccessToken(uid);
  if (!accessToken) {
    throw new HttpsError("failed-precondition", "No tienes Fitbit conectado.");
  }

  const date = chileDateKey();
  const headers = { Authorization: `Bearer ${accessToken}` };
  const [stepsRes, sleepRes, hrRes] = await Promise.all([
    fetch(`https://api.fitbit.com/1/user/-/activities/date/${date}.json`, { headers }),
    fetch(`https://api.fitbit.com/1.2/user/-/sleep/date/${date}.json`, { headers }),
    fetch(`https://api.fitbit.com/1/user/-/activities/heart/date/${date}/1d.json`, { headers }),
  ]);
  if (!stepsRes.ok || !sleepRes.ok || !hrRes.ok) {
    throw new HttpsError("internal", "No se pudo obtener datos de Fitbit.");
  }
  const [stepsData, sleepData, hrData] = await Promise.all([stepsRes.json(), sleepRes.json(), hrRes.json()]);

  const metrics = {
    steps: stepsData?.summary?.steps ?? 0,
    caloriesBurned: stepsData?.summary?.caloriesOut ?? 0,
    activeMinutes: (stepsData?.summary?.fairlyActiveMinutes ?? 0) + (stepsData?.summary?.veryActiveMinutes ?? 0),
    sleepMinutes: sleepData?.summary?.totalMinutesAsleep ?? 0,
    heartRateResting: hrData?.["activities-heart"]?.[0]?.value?.restingHeartRate ?? null,
  };

  const db = getFirestore();
  await db.collection("users").doc(uid).collection("healthMetrics").doc(date).set({
    ...metrics,
    source: "fitbit",
    syncedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await db.collection("users").doc(uid).collection("deviceConnections").doc("fitbit").set({
    lastSyncAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true, metrics };
});
