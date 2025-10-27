/* script.js — Firebase(구글 로그인) + Firestore 목록 렌더 + 검색/카테고리 필터
   Netlify 정적 호스팅 기준, Firebase 모듈 CDN을 직접 import 한다.  */

// ----- 0) Firebase 모듈 로드 -----
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
    getDocs,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

// ----- 1) Firebase 초기화 (본인 프로젝트 값으로 교체) -----
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
const provider = new GoogleAuthProvider();

/* 2) 헬퍼 & 상태 */
const $ = (sel, p = document) => p.querySelector(sel);
const $$ = (sel, p = document) => [...p.querySelectorAll(sel)];
let state = { items: [], q: "", cat: "전체" };

/* 3) 유틸 */
function timeAgo(ts) {
    const t = typeof ts === "number" ? ts : Date.parse(ts || Date.now());
    const d = (Date.now() - t) / 86400000;
    if (d < 1) return "오늘";
    if (Math.floor(d) === 1) return "1일 전";
    if (d < 7) return `${Math.floor(d)}일 전`;
    return `${Math.floor(d / 7)}주 전`;
}

/* 4) 렌더 */
function renderList() {
    const wrap = $("#listings");
    const q = state.q.trim().toLowerCase();
    const cat = state.cat;

    const filtered = state.items.filter((it) => {
        const txt = `${it.title || ""} ${it.location || ""} ${it.description || ""}`.toLowerCase();
        const mt = q ? txt.includes(q) : true;
        const mc = cat === "전체" ? true : it.category === cat;
        return mt && mc;
    });

    if (!filtered.length) {
        wrap.innerHTML = `<div style="grid-column:1 / -1; color:#aaa; padding:24px;">검색 조건에 맞는 결과가 없어요.</div>`;
        return;
    }

    wrap.innerHTML = filtered
        .map(
            (it) => `
    <article class="card" data-id="${it.id}">
      <figure class="thumb">
        <img src="${(it.images && it.images[0]) || "https://picsum.photos/seed/placeholder/800/600"}" alt="${it.title || "분실물"}" loading="lazy">
      </figure>
      <div class="card-body">
        <h3 class="title">${it.title || "제목 없음"}</h3>
        <p class="price">${it.priceText || (it.reward ? "보상 있음" : "문의")}</p>
        <p class="meta">${it.location || "위치 미상"} · ${timeAgo(it.lostAt || it.createdAt)}</p>
      </div>
    </article>
  `
        )
        .join("");
}

/* 5) Firestore 읽기 */
async function fetchItems() {
    try {
        const col = collection(db, "items");
        const q = query(col, orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        state.items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderList();
    } catch (e) {
        console.error(e);
        $("#listings").innerHTML =
            `<div style="grid-column:1 / -1; color:#f88; padding:24px;">목록을 불러오지 못했습니다.</div>`;
    }
}

/* 6) 검색/카테고리 */
function setupSearch() {
    const form = $("#searchForm");
    const input = $("#searchInput");
    form?.addEventListener("submit", (e) => {
        e.preventDefault();
        state.q = input.value || "";
        renderList();
    });
    input?.addEventListener("input", () => {
        state.q = input.value || "";
        renderList();
    });
}
function setupCategories() {
    $("#categoryList")?.addEventListener("click", (e) => {
        const btn = e.target.closest("button.chip");
        if (!btn) return;
        $$("#categoryList .chip").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.cat = btn.dataset.cat || "전체";
        renderList();
    });
}

/* 7) 프로필 드롭다운 */
function setupProfileMenu() {
    const avatar = $("#userAvatar");
    const menu = $("#profileMenu");
    const logoutInMenu = $("#profile-logout");

    if (!avatar || !menu) return;

    avatar.addEventListener("click", (e) => {
        e.stopPropagation();
        const hide = menu.classList.toggle("hidden");
        menu.setAttribute("aria-hidden", hide ? "true" : "false");
    });

    document.addEventListener("click", (e) => {
        if (!menu.classList.contains("hidden") && !menu.contains(e.target) && e.target !== avatar) {
            menu.classList.add("hidden");
            menu.setAttribute("aria-hidden", "true");
        }
    });

    logoutInMenu?.addEventListener("click", async () => {
        await signOut(auth);
        menu.classList.add("hidden");
        menu.setAttribute("aria-hidden", "true");
    });

    $("#profile-info")?.addEventListener("click", () => {
        alert("내 정보 페이지는 다음 단계에서 연결할게요.");
        menu.classList.add("hidden");
        menu.setAttribute("aria-hidden", "true");
    });
}

/* 8) 로그인/로그아웃 UI (외부 로그아웃 버튼 제거 버전) */
function setupAuthUI() {
    const loginBtn = $("#loginBtn");
    const avatar = $("#userAvatar");

    loginBtn?.addEventListener("click", async () => {
        try {
            await signInWithPopup(auth, provider);
        } catch (err) {
            alert("로그인 실패: " + err.message);
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
        fetchItems();
    });
}

// 등록 버튼 → register.html로 이동
function setupAddButton() {
    $("#addBtn")?.addEventListener("click", () => {
        if (!auth.currentUser) return alert("Google 로그인 후 등록할 수 있어요.");
        location.href = "register.html";
    });
}

/* 10) init */
function init() {
    setupSearch();
    setupCategories();
    setupAuthUI();
    setupProfileMenu();
    setupAddButton();
    fetchItems(); // 게스트 상태에서도 읽기 허용 시 즉시 렌더
}
document.addEventListener("DOMContentLoaded", init);
