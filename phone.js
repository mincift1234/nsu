import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";

import {
    getAuth,
    RecaptchaVerifier,
    signInWithPhoneNumber,
    PhoneAuthProvider,
    linkWithCredential
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

import {
    getFirestore,
    doc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCpE_MfBizTqyY2v_cQOrBX4q6KhIi5mrk",
    authDomain: "something-e578a.firebaseapp.com",
    projectId: "something-e578a",
    storageBucket: "something-e578a.appspot.com",
    messagingSenderId: "879471143827",
    appId: "1:879471143827:web:33e2c1001e051f05265666"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let confirmationResult;
let recaptchaVerifier;

window.addEventListener("DOMContentLoaded", () => {
    const sendBtn = document.getElementById("sendBtn");
    const verifyBtn = document.getElementById("verifyBtn");

    /* reCAPTCHA 한 번만 생성 */

    recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha", {
        size: "normal"
    });

    recaptchaVerifier.render();

    /* SMS 요청 */

    sendBtn.onclick = async () => {
        try {
            const phone = document.getElementById("phoneInput").value.trim();

            if (!phone.startsWith("010")) {
                alert("전화번호 형식 오류");
                return;
            }

            const phoneNumber = "+82" + phone.substring(1);

            confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);

            alert("인증번호 전송 완료");
        } catch (err) {
            console.error(err);
            alert("SMS 전송 실패 : " + err.message);
        }
    };

    /* 인증 확인 */

    verifyBtn.onclick = async () => {
        try {
            const code = document.getElementById("codeInput").value.trim();

            if (!confirmationResult) {
                alert("먼저 인증번호 요청");
                return;
            }

            const credential = PhoneAuthProvider.credential(confirmationResult.verificationId, code);

            /* Google 계정에 전화번호 연결 */

            await linkWithCredential(auth.currentUser, credential);

            const user = auth.currentUser;

            /* Firestore 저장 */

            await setDoc(
                doc(db, "users", user.uid),
                {
                    phoneVerified: true,
                    phoneNumber: user.phoneNumber,
                    verifiedAt: serverTimestamp()
                },
                { merge: true }
            );

            alert("전화번호 인증 완료");

            location.href = "index.html";
        } catch (err) {
            console.error(err);
            alert("인증 실패 : " + err.message);
        }
    };
});
