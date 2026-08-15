import { collection, doc, getDoc, getDocs, setDoc, query, orderBy, limit, serverTimestamp, documentId } from "firebase/firestore";
import { db } from "./firebase";

export interface DailyLog {
  water: number;
  sleep: number;
  activity: number;
  mood: number;
  notes: string;
}

export const EMPTY_DAILY_LOG: DailyLog = { water: 0, sleep: 8, activity: 0, mood: 3, notes: "" };

export function todayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dateKeyOffset(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return todayKey(d);
}

/** Simple 0-100 score: average of how close each metric is to its daily target. */
export function wellnessScore(log: DailyLog): number {
  const ratios = [
    Math.min(log.sleep / 8, 1),
    Math.min(log.water / 8, 1),
    Math.min(log.activity / 30, 1),
    Math.min(log.mood / 5, 1),
  ];
  return Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100);
}

function logsRef(uid: string) {
  return collection(db, "users", uid, "dailyLogs");
}

export async function getDailyLog(uid: string, dateKey: string): Promise<DailyLog | null> {
  const snap = await getDoc(doc(logsRef(uid), dateKey));
  return snap.exists() ? (snap.data() as DailyLog) : null;
}

export async function saveDailyLog(uid: string, dateKey: string, data: DailyLog): Promise<void> {
  await setDoc(doc(logsRef(uid), dateKey), { ...data, updatedAt: serverTimestamp() });
}

export interface DailyLogEntry {
  date: string;
  log: DailyLog;
}

/** Most recent `days` logs, oldest first. */
export async function getRecentDailyLogs(uid: string, days: number): Promise<DailyLogEntry[]> {
  const q = query(logsRef(uid), orderBy(documentId(), "desc"), limit(days));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ date: d.id, log: d.data() as DailyLog })).reverse();
}
