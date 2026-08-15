import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { getFunctions, httpsCallable } from "firebase/functions";
import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { app, db } from "./firebase";

const functions = getFunctions(app, "southamerica-west1");

export type PermissionResult = "granted" | "denied" | "unsupported";

export async function enablePushNotifications(uid: string): Promise<PermissionResult> {
  if (!(await isSupported())) return "unsupported";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey: import.meta.env.VITE_FCM_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });

  await setDoc(doc(collection(db, "users", uid, "fcmTokens"), token), {
    token,
    userAgent: navigator.userAgent,
    createdAt: serverTimestamp(),
  });

  return "granted";
}

export async function sendTestNotification(): Promise<void> {
  const fn = httpsCallable(functions, "sendTestNotification");
  await fn();
}
