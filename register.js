// register.js
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
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
    ref as sRef,
    uploadBytesResumable,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";

// ※ 네 프로젝트에 맞는 구성 (기존 값 유지)
const firebaseConfig = {
    apiKey: "AIzaSyCpE_MfBizTqyY2v_cQOrBX4q6KhIi5mrk",
    authDomain: "something-e578a.firebaseapp.com",
    projectId: "something-e578a",
    storageBucket: "something-e578a.firebasestorage.app",
    messagingSenderId: "879471143827",
    appId: "1:879471143827:web:33e2c1001e051f05265666",
    measurementId: "G-RHRK7NJ1FN"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const provider = new GoogleAuthProvider();

// ---------- DOM ----------
const $ = (s) => document.querySelector(s);
const form = $("#postForm");
const titleEl = $("#title");
const categoryEl = $("#category");
const locationEl = $("#location");
const statusEl = $("#status");
const descEl = $("#description");
const imgInput = $("#imageInput");
const preview = $("#preview");
const submitBtn = $("#submitBtn");
const msg = $("#msg");

// 헤더(로그인/아바타)
const loginBtn = $("#loginBtn"); // Google 로그인 버튼
const userAvatar = $("#userAvatar"); // <img>
const profileMenu = $("#profileMenu"); // 드롭다운 컨테이너
const profileInfo = $("#profile-info"); // '내 정보'
const profileLogout = $("#profile-logout"); // '로그아웃'

// ---------- Auth UI ----------
let currentUser = null;
let selectedFile = null;

function setHeaderAuthUI(user) {
    const show = (el) => el && (el.style.display = "");
    const hide = (el) => el && (el.style.display = "none");

    if (user) {
        currentUser = user;

        // 로그인 버튼 숨김, 아바타 노출
        hide(loginBtn);
        if (userAvatar) {
            userAvatar.src = user.photoURL || "https://i.imgur.com/4ZQZ4sS.png";
            show(userAvatar);
        }
    } else {
        currentUser = null;
        // 아바타/메뉴 숨기고 로그인 버튼 노출
        show(loginBtn);
        if (userAvatar) userAvatar.style.display = "none";
        if (profileMenu) profileMenu.classList.remove("open");
    }
}

// 로그인 버튼 → 로그인
loginBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
        await signInWithPopup(auth, provider);
    } catch (err) {
        alert("로그인 실패: " + err.message);
    }
});

// 아바타 클릭 → 드롭다운 토글
userAvatar?.addEventListener("click", (e) => {
    e.stopPropagation();
    profileMenu?.classList.toggle("open");
});

// 드롭다운 외부 클릭시 닫기
document.addEventListener("click", () => {
    profileMenu?.classList.remove("open");
});

// 드롭다운 항목
profileInfo?.addEventListener("click", (e) => {
    e.preventDefault();
    location.href = "profile.html";
});
profileLogout?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
        await signOut(auth);
        alert("로그아웃 되었습니다.");
        location.reload();
    } catch (err) {
        alert("로그아웃 실패: " + err.message);
    }
});

// 로그인 상태 반영
onAuthStateChanged(auth, (user) => {
    setHeaderAuthUI(user);
});

// ---------- 이미지 미리보기 ----------
imgInput?.addEventListener("change", () => {
    const f = imgInput.files?.[0];
    selectedFile = f || null;

    preview.innerHTML = "";
    if (!selectedFile) return;

    const url = URL.createObjectURL(selectedFile);
    const img = new Image();
    img.src = url;
    img.onload = () => URL.revokeObjectURL(url);

    img.style.width = "140px";
    img.style.height = "105px";
    img.style.objectFit = "cover";
    img.style.borderRadius = "10px";
    img.style.boxShadow = "0 6px 16px rgba(0,0,0,0.35)";

    preview.appendChild(img);
});

// ---------- 업로드 & 저장 ----------
async function uploadImageIfNeeded() {
    if (!selectedFile || !currentUser) return [];

    const path = `items/${currentUser.uid}/${Date.now()}_${selectedFile.name}`;
    const ref = sRef(storage, path);

    await new Promise((resolve, reject) => {
        const task = uploadBytesResumable(ref, selectedFile);
        task.on("state_changed", null, reject, resolve);
    });

    const url = await getDownloadURL(ref);
    return [url];
}

// ---------- 제출 ----------
form?.addEventListener("submit", async (e) => {
    e.preventDefault(); // 기본 submit 막기

    // 비로그인 → 즉시 로그인 시도
    if (!currentUser) {
        try {
            await signInWithPopup(auth, provider);
            if (!auth.currentUser) return; // 사용자가 취소한 경우
        } catch (err) {
            return alert("로그인 후 등록할 수 있어요.");
        }
    }

    const title = titleEl.value.trim();
    const category = categoryEl.value.trim();
    const location = locationEl.value.trim();
    const status = statusEl.value.trim();
    const description = descEl.value.trim();

    if (!title || !category) {
        return alert("제목과 카테고리를 입력하세요.");
    }

    submitBtn.disabled = true;
    msg.textContent = "업로드 중...";

    try {
        const images = await uploadImageIfNeeded();

        await addDoc(collection(db, "items"), {
            ownerId: auth.currentUser.uid,
            title,
            category,
            location,
            status,
            description,
            images, // [] 또는 [url]
            createdAt: serverTimestamp()
        });

        msg.textContent = "등록 완료!";
        alert("등록되었습니다.");
        location.href = "index.html";
    } catch (err) {
        console.error(err);
        msg.textContent = "실패";
        alert("등록 실패: " + (err.message || err));
    } finally {
        submitBtn.disabled = false;
    }
});
