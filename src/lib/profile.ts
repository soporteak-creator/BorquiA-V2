import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export interface UserProfile {
  name: string;
  age: string;
  height: string;
  weight: string;
  goals: string[];
  habits: string[];
  reminders: { morning: boolean; evening: boolean; water: boolean };
  health: {
    bloodPressure: string;
    glucose: string;
    medications: string;
    notes: string;
  };
  aiConsentRevoked: boolean;
}

export const EMPTY_PROFILE: UserProfile = {
  name: "",
  age: "",
  height: "",
  weight: "",
  goals: [],
  habits: [],
  reminders: { morning: true, evening: true, water: true },
  health: { bloodPressure: "", glucose: "", medications: "", notes: "" },
  aiConsentRevoked: false,
};

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return { ...EMPTY_PROFILE, ...(snap.data() as Partial<UserProfile>) };
}

export async function saveUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
  await setDoc(doc(db, "users", uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

export async function deleteUserProfile(uid: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid));
}
