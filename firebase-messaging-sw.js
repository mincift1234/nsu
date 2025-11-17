// firebase-messaging-sw.js
// 서비스워커: 브라우저가 꺼져 있어도 푸시 알림을 받게 해주는 애

importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-messaging-compat.js");

firebase.initializeApp({
    apiKey: "AIzaSyCpE_MfBizTqyY2v_cQOrBX4q6KhIi5mrk",
    authDomain: "something-e578a.firebaseapp.com",
    projectId: "something-e578a",
    messagingSenderId: "879471143827",
    appId: "1:879471143827:web:33e2c1001e051f05265666"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    const { title, body } = payload.notification || {};
    self.registration.showNotification(title || "새 알림", {
        body: body || "",
        icon: "/icon-192.png" // 있으면 사용, 없으면 생략 가능
    });
});
