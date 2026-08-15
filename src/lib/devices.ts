import { getFunctions, httpsCallable } from "firebase/functions";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { app, db } from "./firebase";

const functions = getFunctions(app, "southamerica-west1");

export type DeviceProvider = "apple_health" | "google_health_connect" | "fitbit" | "garmin" | "samsung_health";

export interface DeviceConnection {
  provider: DeviceProvider;
  status: "connected" | "disconnected";
  connectedAt?: string;
  lastSyncAt?: string | null;
}

export interface HealthMetrics {
  steps?: number;
  heartRateAvg?: number;
  heartRateResting?: number;
  sleepMinutes?: number;
  caloriesBurned?: number;
  activeMinutes?: number;
  source?: string;
  syncedAt?: string;
}

export async function fetchDeviceConnections(uid: string): Promise<Record<string, DeviceConnection>> {
  const snap = await getDocs(collection(db, "users", uid, "deviceConnections"));
  const out: Record<string, DeviceConnection> = {};
  snap.forEach(d => { out[d.id] = d.data() as DeviceConnection; });
  return out;
}

export async function fetchTodayHealthMetrics(uid: string, dateKey: string): Promise<HealthMetrics | null> {
  const snap = await getDoc(doc(db, "users", uid, "healthMetrics", dateKey));
  return snap.exists() ? (snap.data() as HealthMetrics) : null;
}

export async function connectFitbit(): Promise<string> {
  const fn = httpsCallable<void, { url: string }>(functions, "connectFitbit");
  const result = await fn();
  return result.data.url;
}

export async function syncFitbitData(): Promise<void> {
  const fn = httpsCallable(functions, "syncFitbitData");
  await fn();
}

export async function disconnectDevice(provider: DeviceProvider): Promise<void> {
  const fn = httpsCallable(functions, "disconnectDevice");
  await fn({ provider });
}
