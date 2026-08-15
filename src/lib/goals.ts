import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { todayKey } from "./dailyLog";

export interface GoalProgressEntry {
  date: string;
  progress: number;
}

export interface Goal {
  id: string;
  title: string;
  target: string;
  progress: number;
  startedAt: string;
  targetDate: string | null;
  history: GoalProgressEntry[];
}

function goalsRef(uid: string) {
  return collection(db, "users", uid, "goals");
}

export async function getGoals(uid: string): Promise<Goal[]> {
  const q = query(goalsRef(uid), orderBy("startedAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Goal, "id">) }));
}

export async function createGoal(uid: string, data: { title: string; target: string; targetDate: string | null }): Promise<void> {
  await addDoc(goalsRef(uid), {
    title: data.title,
    target: data.target,
    progress: 0,
    startedAt: todayKey(),
    targetDate: data.targetDate,
    history: [{ date: todayKey(), progress: 0 }] as GoalProgressEntry[],
    createdAt: serverTimestamp(),
  });
}

export async function updateGoalProgress(uid: string, goal: Goal, progress: number): Promise<GoalProgressEntry[]> {
  const clamped = Math.max(0, Math.min(100, progress));
  const today = todayKey();
  const history = [...goal.history.filter(h => h.date !== today), { date: today, progress: clamped }];
  await updateDoc(doc(goalsRef(uid), goal.id), { progress: clamped, history });
  return history;
}

export async function deleteGoal(uid: string, goalId: string): Promise<void> {
  await deleteDoc(doc(goalsRef(uid), goalId));
}
