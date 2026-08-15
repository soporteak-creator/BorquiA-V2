import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "./firebase";
import type { UserProfile } from "./profile";

const functions = getFunctions(app, "southamerica-west1");
const askCoachFn = httpsCallable<
  { message: string; history: ChatTurn[]; context: string },
  { reply: string }
>(functions, "askCoach");

export interface ChatTurn {
  role: "user" | "model";
  text: string;
}

function buildContext(profile: UserProfile, todayLogSummary: string | null): string {
  const parts: string[] = [];
  if (profile.name) parts.push(`Nombre: ${profile.name}`);
  if (profile.age) parts.push(`Edad: ${profile.age}`);
  if (profile.goals.length) parts.push(`Objetivos: ${profile.goals.join(", ")}`);
  if (todayLogSummary) parts.push(`Registro de hoy: ${todayLogSummary}`);
  if (!parts.length) return "El usuario no ha compartido datos personales todavía.";
  return `Datos del usuario (compartidos voluntariamente):\n${parts.join("\n")}`;
}

export async function askAssistant(
  history: ChatTurn[],
  message: string,
  profile: UserProfile,
  todayLogSummary: string | null
): Promise<string> {
  const result = await askCoachFn({
    message,
    history,
    context: buildContext(profile, todayLogSummary),
  });
  return result.data.reply;
}
