importScripts("https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDpL9QQSRuZlUswTnKCo8iPwlv2UEhqgqw",
  authDomain: "borquia-v2.firebaseapp.com",
  projectId: "borquia-v2",
  storageBucket: "borquia-v2.firebasestorage.app",
  messagingSenderId: "1042602920198",
  appId: "1:1042602920198:web:97f6373eb19dd3cd8d3687",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification ?? {};
  self.registration.showNotification(title ?? "BorquIA", {
    body: body ?? "",
  });
});
