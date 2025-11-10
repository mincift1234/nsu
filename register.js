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

const firebaseConfig = {
    apiKey: "AIzaSyCpE_MfBizTqyY2v_cQOrBX4q6KhIi5mrk",
    authDomain: "something-e578a.firebaseapp.com",
    projectId: "something-e578a",
    storageBucket: "something-e578a.firebasestorage.app",
    messagingSenderId: "879471143827",
    appId: "1:879471143827:web:33e2c1001e051f05265666",
    measurementId: "G-RHRK7NJ1FN"
};

// Firebase 초기화
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const provider = new GoogleAuthProvider();

const $ = (s) => document.querySelector(s);
const form = $("#postForm");
const titleEl = $("#title");
const categoryEl = $("#category");
const locationEl = $("#location");
const statusEl = $("#status");
const descEl = $("#description");
const imgInput = $("#imageInput");
const preview = $("#preview");
const mosaicToggle = $("#mosaicToggle");
const submitBtn = $("#submitBtn");
const msg = $("#msg");

// 헤더 관련
const loginBtn = $("#loginBtn");
const userAvatar = $("#userAvatar");
const profileMenu = $("#profileMenu");
const profileInfo = $("#profile-info");
const profileLogout = $("#profile-logout");

let currentUser = null;
let selectedFile = null;

// ---------- Auth UI ----------
function setHeaderAuthUI(user) {
    const show = (el) => el && (el.style.display = "");
    const hide = (el) => el && (el.style.display = "none");

    if (user) {
        currentUser = user;
        hide(loginBtn);
        if (userAvatar) {
            userAvatar.src = user.photoURL || "https://i.imgur.com/4ZQZ4sS.png";
            show(userAvatar);
        }
    } else {
        currentUser = null;
        show(loginBtn);
        if (userAvatar) userAvatar.style.display = "none";
        if (profileMenu) profileMenu.classList.remove("open");
    }
}

loginBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
        await signInWithPopup(auth, provider);
    } catch (err) {
        alert("로그인 실패: " + err.message);
    }
});

userAvatar?.addEventListener("click", (e) => {
    e.stopPropagation();
    profileMenu?.classList.toggle("open");
});
document.addEventListener("click", () => {
    profileMenu?.classList.remove("open");
});
profileInfo?.addEventListener("click", () => (location.href = "profile.html"));
profileLogout?.addEventListener("click", async () => {
    try {
        await signOut(auth);
        location.reload();
    } catch (err) {
        alert("로그아웃 실패: " + err.message);
    }
});
onAuthStateChanged(auth, (user) => setHeaderAuthUI(user));

// ---------- 이미지 미리보기 / 삭제 ----------
imgInput?.addEventListener("change", () => {
    const f = imgInput.files?.[0];
    selectedFile = f || null;

    preview.innerHTML = "";
    if (!selectedFile) return;

    const wrapper = document.createElement("div");
    wrapper.style.position = "relative";
    wrapper.style.display = "inline-block";

    const imgEl = new Image();
    imgEl.src = URL.createObjectURL(selectedFile);
    imgEl.style.width = "140px";
    imgEl.style.height = "105px";
    imgEl.style.objectFit = "cover";
    imgEl.style.borderRadius = "10px";
    imgEl.style.boxShadow = "0 6px 16px rgba(0,0,0,0.35)";

    // 삭제 버튼
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "×";
    removeBtn.style.position = "absolute";
    removeBtn.style.top = "4px";
    removeBtn.style.right = "6px";
    removeBtn.style.background = "rgba(0,0,0,0.6)";
    removeBtn.style.color = "#fff";
    removeBtn.style.border = "none";
    removeBtn.style.borderRadius = "50%";
    removeBtn.style.width = "20px";
    removeBtn.style.height = "20px";
    removeBtn.style.cursor = "pointer";
    removeBtn.onclick = () => {
        preview.innerHTML = "";
        imgInput.value = "";
        selectedFile = null;
    };

    wrapper.appendChild(imgEl);
    wrapper.appendChild(removeBtn);
    preview.appendChild(wrapper);
});

// ---------- 업로드 시 모자이크 처리 ----------
async function processImageForUpload(file, applyMosaic) {
    if (!applyMosaic) return file; // 모자이크 안함

    const img = await new Promise((resolve) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.src = URL.createObjectURL(file);
    });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const w = img.width;
    const h = img.height;
    canvas.width = w;
    canvas.height = h;

    const pixel = 30; // 강도
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, w / pixel, h / pixel);
    ctx.drawImage(canvas, 0, 0, w / pixel, h / pixel, 0, 0, w, h);

    return await new Promise((resolve) => {
        canvas.toBlob(
            (blob) => {
                resolve(new File([blob], file.name, { type: "image/jpeg" }));
            },
            "image/jpeg",
            0.9
        );
    });
}

// ---------- Firebase 업로드 ----------
async function uploadImageIfNeeded(applyMosaic) {
    if (!selectedFile || !currentUser) return [];

    const fileToUpload = await processImageForUpload(selectedFile, applyMosaic);
    const path = `items/${currentUser.uid}/${Date.now()}_${fileToUpload.name}`;
    const ref = sRef(storage, path);

    await new Promise((resolve, reject) => {
        const task = uploadBytesResumable(ref, fileToUpload);
        task.on("state_changed", null, reject, resolve);
    });

    const url = await getDownloadURL(ref);
    return [url];
}

// ---------- 제출 ----------
form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!currentUser) {
        try {
            await signInWithPopup(auth, provider);
            if (!auth.currentUser) return;
        } catch {
            return alert("로그인 후 등록할 수 있습니다.");
        }
    }

    const title = titleEl.value.trim();
    const category = categoryEl.value.trim();
    const location = locationEl.value.trim();
    const status = statusEl.value.trim();
    const description = descEl.value.trim();
    const applyMosaic = mosaicToggle?.checked;

    if (!title || !category) return alert("제목과 카테고리를 입력하세요.");
    if (!status) return alert("상태를 선택하세요.");
    if (!description) return alert("설명을 입력하세요.");
    if (!selectedFile) return alert("사진을 업로드하세요.");

    submitBtn.disabled = true;
    msg.textContent = "업로드 중...";

    try {
        const images = await uploadImageIfNeeded(applyMosaic);
        await addDoc(collection(db, "items"), {
            ownerId: auth.currentUser.uid,
            title,
            category,
            location,
            status,
            description,
            images,
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
