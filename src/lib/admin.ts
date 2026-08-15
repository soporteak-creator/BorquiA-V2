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
