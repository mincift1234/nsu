// register.js — Firebase Auth 체크 + Storage 업로드 + Firestore 문서 생성

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";

/* 1) Firebase 설정 — index와 동일한 값 */
const firebaseConfig = {
    apiKey: "AIzaSyCpE_MfBizTqyY2v_cQOrBX4q6KhIi5mrk",
    authDomain: "something-e578a.firebaseapp.com",
    projectId: "something-e578a",
    storageBucket: "something-e578a.firebasestorage.app",
    messagingSenderId: "879471143827",
    appId: "1:879471143827:web:33e2c1001e051f05265666",
    measurementId: "G-RHRK7NJ1FN"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const provider = new GoogleAuthProvider();

/* 2) 공통 UI (프로필 고정 + 드롭다운 재사용) */
const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];
function setupAuthUI() {
    const loginBtn = $("#loginBtn");
    const avatar = $("#userAvatar");
    loginBtn?.addEventListener("click", async () => {
        try {
            await signInWithPopup(auth, provider);
        } catch (e) {
            alert(e.message);
        }
    });
    onAuthStateChanged(auth, (user) => {
        if (user) {
            loginBtn.style.display = "none";
            avatar.style.display = "inline-block";
            avatar.src = user.photoURL || "";
            avatar.alt = user.displayName || "user";
        } else {
            loginBtn.style.display = "inline-block";
            avatar.style.display = "none";
            avatar.src = "";
        }
    });
    const menu = $("#profileMenu");
    avatar?.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.classList.toggle("hidden");
        menu.setAttribute("aria-hidden", menu.classList.contains("hidden") ? "true" : "false");
    });
    document.addEventListener("click", (e) => {
        if (!menu.contains(e.target) && e.target !== avatar) {
            menu.classList.add("hidden");
            menu.setAttribute("aria-hidden", "true");
        }
    });
    $("#profile-logout")?.addEventListener("click", async () => {
        await signOut(auth);
        menu.classList.add("hidden");
    });
}

/* 3) 미리보기 */
const preview = $("#preview");
$("#images")?.addEventListener("change", (e) => {
    preview.innerHTML = "";
    const files = [...e.target.files].slice(0, 3);
    files.forEach((file) => {
        const url = URL.createObjectURL(file);
        const img = document.createElement("img");
        img.src = url;
        img.alt = "preview";
        img.style.width = "120px";
        img.style.height = "90px";
        img.style.objectFit = "cover";
        img.style.borderRadius = "8px";
        preview.appendChild(img);
    });
});

/* 4) 업로드 함수 */
async function uploadImages(uid, files) {
    const urls = [];
    const chosen = [...files].slice(0, 3);
    for (const f of chosen) {
        if (f.size > 5 * 1024 * 1024) throw new Error("파일은 5MB 이하여야 합니다.");
        const key = `items/${uid}/${Date.now()}_${Math.random().toString(36).slice(2)}_${f.name}`;
        const storageRef = ref(storage, key);
        await uploadBytes(storageRef, f);
        const url = await getDownloadURL(storageRef);
        urls.push(url);
    }
    return urls;
}

/* 5) 제출 */
$("#regForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) {
        alert("Google 로그인 후 등록할 수 있어요.");
        return;
    }

    const title = $("#title").value.trim();
    const category = $("#category").value;
    if (!title || !category) {
        alert("제목과 카테고리를 입력하세요.");
        return;
    }

    const location = $("#location").value.trim();
    const lostAt = $("#lostAt").value ? new Date($("#lostAt").value).toISOString() : null;
    const description = $("#description").value.trim();
    const priceText = $("#priceText").value.trim();
    const files = $("#images").files;

    try {
        // 1) 이미지 업로드
        const images = files?.length ? await uploadImages(user.uid, files) : [];

        // 2) 문서 생성
        const docRef = await addDoc(collection(db, "items"), {
            title,
            category,
            location,
            description,
            priceText,
            images,
            lostAt,
            ownerId: user.uid,
            createdAt: serverTimestamp()
        });

        alert("등록 완료! 문서 ID: " + docRef.id);
        location.href = "index.html";
    } catch (err) {
        console.error(err);
        alert("등록 실패: " + err.message);
    }
});

/* 6) init */
setupAuthUI();
