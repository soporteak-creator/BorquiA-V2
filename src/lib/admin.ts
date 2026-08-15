import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "./firebase";

const functions = getFunctions(app, "southamerica-west1");

export interface AdminUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
  lastSignIn: string;
  disabled: boolean;
}

export interface AdminStats {
  totalProfiles: number;
  totalDailyLogs: number;
  totalGoals: number;
  activeLast7Days: number;
  newUsersLast7Days: number;
  avgGoalsPerUser: number;
}

export interface AdminDoc {
  id: string;
  [key: string]: unknown;
}

export interface AuditLogEntry {
  id: string;
  adminEmail: string;
  action: string;
  target: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminConfig {
  maintenanceMode: boolean;
  announcementBanner: string;
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const fn = httpsCallable<void, { users: AdminUser[] }>(functions, "adminGetUsers");
  const result = await fn();
  return result.data.users;
}

export async function fetchAdminStats(): Promise<AdminStats> {
  const fn = httpsCallable<void, AdminStats>(functions, "adminGetStats");
  const result = await fn();
  return result.data;
}

export async function setUserDisabled(uid: string, disabled: boolean): Promise<void> {
  const fn = httpsCallable(functions, "adminSetUserDisabled");
  await fn({ uid, disabled });
}

export async function deleteAdminUser(uid: string): Promise<void> {
  const fn = httpsCallable(functions, "adminDeleteUser");
  await fn({ uid });
}

export async function fetchAdminCollection(collection: string): Promise<AdminDoc[]> {
  const fn = httpsCallable<{ collection: string }, { docs: AdminDoc[] }>(functions, "adminListDocs");
  const result = await fn({ collection });
  return result.data.docs;
}

export async function saveAdminDoc(collection: string, id: string | null, data: Record<string, unknown>): Promise<string> {
  const fn = httpsCallable<{ collection: string; id: string | null; data: Record<string, unknown> }, { id: string }>(functions, "adminSaveDoc");
  const result = await fn({ collection, id, data });
  return result.data.id;
}

export async function deleteAdminDoc(collection: string, id: string): Promise<void> {
  const fn = httpsCallable(functions, "adminDeleteDoc");
  await fn({ collection, id });
}

export async function fetchAdminConfig(): Promise<AdminConfig> {
  const fn = httpsCallable<void, AdminConfig>(functions, "adminGetConfig");
  const result = await fn();
  return result.data;
}

export async function saveAdminConfig(config: AdminConfig): Promise<void> {
  const fn = httpsCallable(functions, "adminSaveConfig");
  await fn(config);
}

export async function fetchAuditLogs(): Promise<AuditLogEntry[]> {
  const fn = httpsCallable<void, { logs: AuditLogEntry[] }>(functions, "adminGetAuditLogs");
  const result = await fn();
  return result.data.logs;
}
