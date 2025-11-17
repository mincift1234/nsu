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
    orderBy,
    addDoc,
    where,
    serverTimestamp,
    deleteDoc,
    doc,
    updateDoc
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

const listingsEl = document.getElementById("listings");
const itemModal = document.getElementById("itemModal");
const inboxModal = document.getElementById("inboxModal");
const inboxBtn = document.getElementById("inboxBtn");
const inboxBadge = document.getElementById("inboxBadge");

function toEpoch(ts) {
    if (!ts) return NaN;
    if (typeof ts === "number") return ts;
    if (typeof ts === "string") return Date.parse(ts);
    if (typeof ts.toDate === "function") return ts.toDate().getTime();
    if (typeof ts.seconds === "number") return ts.seconds * 1000;
    return NaN;
}

/* 3) 유틸 */
function timeAgo(ts) {
    const t = typeof ts === "number" ? ts : Date.parse(ts || Date.now());
    const d = (Date.now() - t) / 86400000;
    if (d < 1) return "오늘";
    if (Math.floor(d) === 1) return "1일 전";
    if (d < 7) return `${Math.floor(d)}일 전`;
    return `${Math.floor(d / 7)}주 전`;
}

function timeAgoAny(ts) {
    const ms = toEpoch(ts);
    if (!Number.isFinite(ms)) return "-";
    const d = (Date.now() - ms) / 86400000;
    if (d < 1) return "오늘";
    if (Math.floor(d) === 1) return "1일 전";
    if (d < 7) return `${Math.floor(d)}일 전`;
    return `${Math.floor(d / 7)}주 전`;
}

function statusClass(s) {
    switch (s) {
        case "보관중":
            return "is-holding";
        case "찾는중":
            return "is-finding";
        case "완료":
            return "is-done";
        default:
            return "";
    }
}

// sender 표시 모드 읽기
function getSenderMode() {
    const el = document.querySelector('input[name="senderMode"]:checked');
    return el ? el.value : "nickname";
}

// 익명 라벨 계산: 같은 사람이 같은 글에 다시 보내면 기존 라벨 유지
async function ensureAnonLabel(toUid, itemId, fromUid) {
    // 1) 내가 이 글에 보낸 익명 쪽지가 이미 있으면 그 라벨 재사용
    const snap = await getDocs(query(collection(db, "messages")));
    const mine = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((m) => m.toUid === toUid && m.itemId === itemId && m.fromUid === fromUid && m.isAnon === true)
        .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    if (mine.length && mine[0].anonLabel) return mine[0].anonLabel;

    // 2) 기존 익명 라벨들의 최대값을 찾아 다음 번호 할당
    const all = snap.docs
        .map((d) => d.data())
        .filter((m) => m.toUid === toUid && m.itemId === itemId && m.isAnon === true);
    const used = all
        .map((m) => Number(String(m.anonLabel || "").replace(/^\D+/, "")))
        .filter((n) => Number.isFinite(n));
    const next = used.length ? Math.max(...used) + 1 : 1;
    return `익명${next}`;
}

// 작성자 uid를 여러 스키마에서 안전하게 꺼내는 헬퍼 (최상위에 두기!)
function pickOwnerUid(it) {
    return it?.ownerUid || it?.uid || it?.authorUid || (it?.owner && it.owner.uid) || (it?.user && it.user.uid) || null;
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
        <p class="status-badge ${statusClass(it.status)}">${it.status || "상태 미상"}</p>
<p class="meta">
  ${it.location || "위치 미상"} · ${it.dateType === "lost" ? "분실" : "습득"} ${timeAgoAny(it.eventAt || it.lostAt || it.foundAt || it.createdAt)}
</p>
      </div>
    </article>
  `
        )
        .join("");
}

// 카드 클릭 시 상세 모달
listingsEl?.addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (!card) return;
    const it = state.items.find((x) => x.id === card.dataset.id);
    if (!it) return;
    openItemModal(it);
});

/* 5) Firestore 읽기 */
async function fetchItems() {
    try {
        const col = collection(db, "items");
        const q = query(col, orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        state.items = snap.docs.map((d) => {
            const data = d.data();
            const eventAt =
                toEpoch(data.eventAt) || toEpoch(data.lostAt) || toEpoch(data.foundAt) || toEpoch(data.createdAt);
            return { id: d.id, ...data, eventAt };
        });
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

    // profile-info 클릭: 메뉴 숨기고 profile.html로 이동 (alert 삭제)
    $("#profile-info")?.addEventListener("click", (e) => {
        e.preventDefault(); // <a href="...">가 있다면 기본동작 처리(혹은 안전하게 방지 후 이동)
        // hide menu
        if (menu) {
            menu.classList.add("hidden");
            menu.setAttribute("aria-hidden", "true");
        }
        // 실제 프로필 페이지로 이동
        window.location.href = "profile.html";
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

// 등록 버튼 → register.html로 이동 → 다음주에 할 예정이라 ppt에 X, 이 코드 빼고 다 ppt에 넣으면 될 듯
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

// 등록 버튼 -> 글 등록 페이지로 이동
document.getElementById("addBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = "register.html";
});

function openItemModal(it) {
    (document.getElementById("mImg") || {}).src = (it.images && it.images[0]) || "";
    (document.getElementById("mTitle") || {}).textContent = it.title || "제목 없음";
    const when = timeAgoAny(it.eventAt || it.lostAt || it.foundAt || it.createdAt);
    (document.getElementById("mMeta") || {}).textContent =
        `${it.location || "위치 미상"} · ${it.dateType === "lost" ? "분실" : "습득"} ${when} · ${it.status || "상태 미상"}`;
    (document.getElementById("mDesc") || {}).textContent = it.description || "";

    const me = (auth.currentUser && auth.currentUser.uid) || null;
    const owner = pickOwnerUid(it); // 글 작성자 uid
    const ownerWrap = document.getElementById("ownerActions");

    // 글 작성자일 때만 수정/삭제 버튼 노출
    if (me && owner && me === owner) {
        ownerWrap.style.display = "";
        document.getElementById("btnEdit").onclick = () => {
            window.location.href = `register.html?edit=${it.id}`;
        };
        document.getElementById("btnDelete").onclick = async () => {
            if (!confirm("이 글을 삭제할까요?")) return;
            try {
                await deleteDoc(doc(db, "items", it.id));
                closeModal(itemModal);
                await fetchItems();
            } catch (e) {
                alert("삭제 실패: " + (e.message || e));
            }
        };
    } else {
        ownerWrap.style.display = "none";
    }

    // ───────────────────────────────
    //  인증용 UI (분실자/습득자 역할에 따라)
    // ───────────────────────────────
    const authBox = document.getElementById("authActions");
    if (authBox) {
        authBox.innerHTML = "";
        authBox.style.display = "none";
    }

    const status = it.status || ""; // "보관중" / "찾는중" / "완료" 등

    // 로그인 + 작성자 정보가 있고, 내가 작성자가 아닐 때만 인증 UI를 보여준다.
    if (authBox && me && owner && me !== owner) {
        // 1) 보관중: 글 작성자는 '습득자', 모달을 보는 사람은 '분실자(주인 후보)'
        if (status === "보관중") {
            authBox.style.display = "block";
            authBox.innerHTML = `
                <div class="auth-section">
                    <p class="auth-help">
                        이 물건의 주인이라고 생각된다면, 물건의 생김새와 특징을 자세히 적어서 인증을 보내주세요.
                        <small>예: 색깔, 브랜드, 안에 들어있던 물건 등 (주민등록번호/계좌번호/카드번호는 절대 적지 마세요)</small>
                    </p>
                    <textarea id="authDesc" class="textarea" rows="3"
                        placeholder="예: 검은색 지갑, 안쪽에 파란색 학생증과 현금 5천원, 바깥쪽 오른쪽 아래에 작은 흠집이 있음"></textarea>
                    <div class="auth-actions-row">
                        <button id="authSend" class="chip">이 물건의 주인입니다 (인증 보내기)</button>
                    </div>
                </div>
            `;

            const authSendBtn = document.getElementById("authSend");
            const authDesc = document.getElementById("authDesc");

            authSendBtn.onclick = async () => {
                const text = (authDesc.value || "").trim();
                if (!text) return alert("물건의 특징을 자세히 적어 주세요.");

                if (!auth.currentUser) {
                    try {
                        await signInWithPopup(auth, provider);
                    } catch (e) {
                        return;
                    }
                    if (!auth.currentUser) return;
                }

                const toUid = owner; // 글 작성자(습득자)
                const fromUid = auth.currentUser.uid; // 분실자(주인 후보)
                if (!toUid) return alert("작성자 정보가 없습니다.");
                if (toUid === fromUid) return alert("자기 글에는 인증을 보낼 수 없습니다.");

                try {
                    await addDoc(collection(db, "messages"), {
                        toUid,
                        fromUid,
                        itemId: it.id,
                        content: text,
                        isAnon: false, // 인증은 닉네임 기준으로
                        anonLabel: null,
                        senderName: auth.currentUser.displayName || "",
                        read: false,
                        createdAt: serverTimestamp(),
                        itemTitle: it.title || "",
                        itemThumb: (it.images && it.images[0]) || "",
                        type: "auth_answer", // 인증 설명
                        role: "owner", // "나는 주인이다" 주장
                        authStatus: "pending" // 추후 'accepted' / 'rejected'로 확장 예정
                    });
                    authDesc.value = "";
                    alert("인증 설명을 보냈습니다. 상대가 내용을 보고 확인할 거예요.");
                    loadInboxCount();
                } catch (e) {
                    alert("전송 실패: " + (e.message || e));
                }
            };
        }

        // 2) 찾는중: 글 작성자는 '분실자', 모달을 보는 사람은 '습득자 후보'
        else if (status === "찾는중") {
            authBox.style.display = "block";
            authBox.innerHTML = `
                <div class="auth-section">
                    <p class="auth-help">
                        이 물건을 실제로 발견했다면, 분실자에게 물건의 생김새를 설명해 달라고 요청할 수 있습니다.
                    </p>
                    <div class="auth-actions-row">
                        <button id="authAsk" class="chip chip--ghost">
                            이 물건을 발견했습니다 (생김새 요청 보내기)
                        </button>
                    </div>
                </div>
            `;

            const authAskBtn = document.getElementById("authAsk");

            authAskBtn.onclick = async () => {
                if (!auth.currentUser) {
                    try {
                        await signInWithPopup(auth, provider);
                    } catch (e) {
                        return;
                    }
                    if (!auth.currentUser) return;
                }

                const toUid = owner; // 글 작성자(분실자)
                const fromUid = auth.currentUser.uid; // 습득자 후보
                if (!toUid) return alert("작성자 정보가 없습니다.");
                if (toUid === fromUid) return alert("자기 글에는 요청을 보낼 수 없습니다.");

                const text =
                    "이 물건을 제가 발견한 것 같습니다. 카드번호나 주민등록번호 같은 민감한 정보는 제외하고, " +
                    "물건의 색깔, 특징, 안에 들어있던 물건 등을 설명해 주시면 실제 분실물인지 확인해 보겠습니다.";

                try {
                    await addDoc(collection(db, "messages"), {
                        toUid,
                        fromUid,
                        itemId: it.id,
                        content: text,
                        isAnon: false,
                        anonLabel: null,
                        senderName: auth.currentUser.displayName || "",
                        read: false,
                        createdAt: serverTimestamp(),
                        itemTitle: it.title || "",
                        itemThumb: (it.images && it.images[0]) || "",
                        type: "auth_question", // 생김새 설명 요청
                        role: "finder", // "나는 습득자다" 주장
                        authStatus: "pending"
                    });
                    alert("생김새 설명을 요청하는 쪽지를 보냈습니다.");
                    loadInboxCount();
                } catch (e) {
                    alert("전송 실패: " + (e.message || e));
                }
            };
        }
    }

    // ───────────────────────────────
    //  기존 일반 쪽지 보내기 (그대로 두되 필드만 살짝 확장)
    // ───────────────────────────────
    const msgSend = document.getElementById("msgSend");
    const msgInput = document.getElementById("msgInput");
    msgInput.value = "";

    msgSend.onclick = async () => {
        const text = (document.getElementById("msgInput")?.value || "").trim();
        if (!text) return alert("쪽지 내용을 입력하세요.");
        if (!auth.currentUser) {
            try {
                await signInWithPopup(auth, provider);
            } catch (e) {
                return;
            }
            if (!auth.currentUser) return;
        }

        const toUid = owner; // 글 작성자
        const fromUid = auth.currentUser.uid; // 보내는 사람
        if (!toUid) return alert("작성자 정보가 없습니다.");
        if (toUid === fromUid) return alert("자기 자신에게는 쪽지를 보낼 수 없습니다.");

        const mode = getSenderMode(); // 'nickname' | 'anon'
        let senderName = auth.currentUser.displayName || "";
        let anonLabel = null;
        let isAnon = false;

        if (mode === "anon") {
            isAnon = true;
            anonLabel = await ensureAnonLabel(toUid, it.id, fromUid);
            senderName = ""; // 닉네임 숨김
        }

        try {
            await addDoc(collection(db, "messages"), {
                toUid,
                fromUid,
                itemId: it.id,
                content: text,
                isAnon,
                anonLabel,
                senderName,
                read: false,
                createdAt: serverTimestamp(),
                itemTitle: it.title || "",
                itemThumb: (it.images && it.images[0]) || "",
                type: "normal", // 일반 쪽지
                role: "normal",
                authStatus: null
            });
            document.getElementById("msgInput").value = "";
            alert("보냈습니다.");
            loadInboxCount();
        } catch (e) {
            alert("전송 실패: " + (e.message || e));
        }
    };

    openModal(itemModal);
}
function openModal(mod) {
    if (!mod) return;
    mod.style.display = "block";
    mod.setAttribute("aria-hidden", "false");
}
function closeModal(mod) {
    if (!mod) return;
    mod.style.display = "none";
    mod.setAttribute("aria-hidden", "true");
}
document.querySelectorAll(".modal").forEach((mod) => {
    mod.addEventListener("click", (e) => {
        if (e.target.classList.contains("modal-backdrop") || e.target.classList.contains("modal-close")) {
            closeModal(mod);
        }
    });
});

// 받은 쪽지 불러오기 + 인증 흐름
async function loadInbox() {
    const listEl = document.getElementById("inboxList");
    if (!auth.currentUser) {
        listEl.innerHTML = `<div class="muted">로그인이 필요합니다.</div>`;
        return;
    }
    listEl.innerHTML = `<div class="muted">불러오는 중.</div>`;

    try {
        const snap = await getDocs(collection(db, "messages"));
        const me = auth.currentUser.uid;

        const rows = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((m) => m.toUid === me)
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

        if (!rows.length) {
            listEl.innerHTML = `<div class="muted">받은 쪽지가 없습니다.</div>`;
            return;
        }

        listEl.innerHTML = rows
            .map((m) => {
                const who = m.isAnon ? m.anonLabel || "익명" : m.senderName || "닉네임 없음";
                const ts = m.createdAt?.seconds ? new Date(m.createdAt.seconds * 1000).toLocaleString() : "";
                const type = m.type || "normal"; // normal / auth_question / auth_answer / handover_info ...
                const authStatus = m.authStatus || null; // pending / accepted / rejected / null
                const handoverStatus = m.handoverStatus || null;

                // ── 뱃지(“인증 요청 / 인증 답변”) ─────────────────
                let typeBadgeHtml = "";
                if (type === "auth_question") {
                    typeBadgeHtml = `<span class="badge-auth badge-auth--question">생김새 설명 요청</span>`;
                } else if (type === "auth_answer") {
                    typeBadgeHtml = `<span class="badge-auth badge-auth--answer">주인 인증 답변</span>`;
                }

                // ── 인증 상태 텍스트 ─────────────────────────────
                let authStateHtml = "";
                let extraClass = "";
                if (type === "auth_answer" && authStatus) {
                    let label = "";
                    if (authStatus === "pending") {
                        label = "주인 인증 대기중";
                        extraClass = "auth-state--pending";
                    } else if (authStatus === "accepted") {
                        label = "주인 인증 완료";
                        extraClass = "auth-state--accepted";
                    } else if (authStatus === "rejected") {
                        label = "주인 인증 거절";
                        extraClass = "auth-state--rejected";
                    }
                    authStateHtml = `<span class="auth-state ${extraClass}">${label}</span>`;
                }

                // ── 승인/거절 버튼 (내가 ‘습득자’ 입장에서 받은 인증 답변일 때만) ──
                let authActionsHtml = "";
                if (type === "auth_answer" && authStatus === "pending") {
                    authActionsHtml = `
                        <div class="auth-verify">
                            <button class="chip chip--ghost btn-auth-accept">
                                이 사람 맞는 것 같아요
                            </button>
                            <button class="chip chip--ghost btn-auth-reject">
                                아닌 것 같아요
                            </button>
                        </div>
                    `;
                }

                let authAnswerBoxHtml = "";
                if (type === "auth_question") {
                    authAnswerBoxHtml = `
        <div class="auth-answer-area">
            <textarea class="textarea auth-answer-text" rows="3"
                placeholder="물건의 색깔, 특징, 안에 들어있던 물건을 자세히 적어주세요."></textarea>
            <button class="chip btn-auth-answer-send">생김새 설명 보내기</button>
        </div>
    `;
                }

                // ── 전달 완료 처리 버튼 (인증 완료 + 아직 전달 완료 표시 전) ──
                let handoverActionsHtml = "";
                if (type === "auth_answer" && authStatus === "accepted") {
                    if (handoverStatus === "done") {
                        authStateHtml += `<span class="handover-state"> · 전달 완료</span>`;
                    } else {
                        handoverActionsHtml = `
                            <div class="handover-actions">
                                <button class="chip chip--ghost btn-handover-done">
                                    주인에게 전달 완료 처리
                                </button>
                            </div>
                        `;
                    }
                }

                const safeContent = (m.content || "").replace(/</g, "&lt;");

                return `
        <div class="inbox-item"
             data-id="${m.id}"
             data-from="${m.fromUid}"
             data-item="${m.itemId || ""}"
             data-type="${type}"
             data-title="${(m.itemTitle || "").replace(/"/g, "&quot;")}"
             data-thumb="${m.itemThumb || ""}">
          <img src="${m.itemThumb || "https://picsum.photos/seed/p/120/80"}" alt=""
               style="width:120px;height:80px;object-fit:cover;border-radius:8px;">
          <div class="content" style="flex:1">
            <p class="title">${m.itemTitle || "제목 없음"}</p>
            <p class="meta">
              ${who} · ${ts}
              ${typeBadgeHtml}
              ${authStateHtml}
            </p>
            <p>${safeContent}</p>

            <div class="inbox-actions">
              <button class="chip chip--ghost btn-reply">답장</button>
              <button class="chip" style="background:#b33;" data-role="del">삭제</button>
            </div>

            ${authActionsHtml}
            ${handoverActionsHtml}
            ${authAnswerBoxHtml}
          </div>

          <div class="inbox-reply" style="display:none;">
            <textarea class="textarea rp-text" rows="3" placeholder="${who}에게 답장"></textarea>
            <button class="chip rp-send">보내기</button>
          </div>
        </div>`;
            })
            .join("");

        // ===== 답장 영역 토글 =====
        listEl.querySelectorAll(".btn-reply").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                const wrap = e.target.closest(".inbox-item");
                const rp = wrap.querySelector(".inbox-reply");
                rp.style.display = rp.style.display === "none" ? "flex" : "none";
            });
        });

        // ===== 답장 보내기 (인증 요청에 대한 답장은 자동으로 'auth_answer') =====
        listEl.querySelectorAll(".rp-send").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                const wrap = e.target.closest(".inbox-item");
                const toUid = wrap.dataset.from; // 원래 보낸 사람에게 회신
                const itemId = wrap.dataset.item || "";
                const parentType = wrap.dataset.type || "normal";
                const text = (wrap.querySelector(".rp-text")?.value || "").trim();

                if (!text) return alert("답장 내용을 입력하세요.");
                if (!auth.currentUser) return alert("로그인이 필요합니다.");
                const fromUid = auth.currentUser.uid;
                if (toUid === fromUid) return alert("자기 자신에게는 쪽지를 보낼 수 없습니다.");

                const mode = getSenderMode();
                let senderName = auth.currentUser.displayName || "";
                let anonLabel = null;
                let isAnon = false;

                if (mode === "anon") {
                    isAnon = true;
                    anonLabel = await ensureAnonLabel(toUid, itemId, fromUid);
                    senderName = "";
                }

                // 기본값은 일반 쪽지
                let msgType = "normal";
                let role = "normal";
                let authStatus = null;

                // 부모 쪽지가 'auth_question'이면 → 이 답장은 'auth_answer'로 처리
                if (parentType === "auth_question") {
                    msgType = "auth_answer";
                    role = "owner"; // 주인 측 답변
                    authStatus = "pending"; // 습득자가 확인 전
                }

                try {
                    await addDoc(collection(db, "messages"), {
                        toUid,
                        fromUid,
                        itemId,
                        content: text,
                        isAnon,
                        anonLabel,
                        senderName,
                        read: false,
                        createdAt: serverTimestamp(),
                        itemTitle: wrap.dataset.title || "",
                        itemThumb: wrap.dataset.thumb || "",
                        type: msgType,
                        role,
                        authStatus
                    });
                    wrap.querySelector(".rp-text").value = "";
                    alert("보냈습니다.");
                    loadInboxCount();
                    await loadInbox();
                } catch (err) {
                    alert("전송 실패: " + (err.message || err));
                }
            });
        });

        // ===== 쪽지 삭제 =====
        listEl.querySelectorAll('button[data-role="del"]').forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                const wrap = e.target.closest(".inbox-item");
                const id = wrap.dataset.id;
                if (!id) return;
                if (!confirm("이 쪽지를 삭제할까요?")) return;
                try {
                    await deleteDoc(doc(db, "messages", id));
                    wrap.remove();
                    loadInboxCount();
                } catch (err) {
                    alert("삭제 실패: " + (err.message || err));
                }
            });
        });

        // ===== 인증 승인 / 거절 =====
        listEl.querySelectorAll(".btn-auth-accept").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                const wrap = e.target.closest(".inbox-item");
                const msgId = wrap.dataset.id;
                const itemId = wrap.dataset.item;
                const ownerUid = wrap.dataset.from; // 주인으로 인증되는 사람

                if (!msgId || !itemId || !ownerUid) return;
                if (!confirm("정말 이 사람이 이 물건의 주인이 맞나요?\n(확인 후에는 전달 과정만 남습니다.)")) return;

                // 전달 방법 안내 메시지 입력
                let extra = prompt(
                    "어디에 맡겼는지, 혹은 언제/어디서 전달 가능한지 입력해 주세요.\n" +
                        "예) 공학관 3층 학과 과사무실에 맡겨두었습니다."
                );
                extra = (extra || "").trim();

                try {
                    // 1) 이 인증 답변 쪽지 상태 변경
                    await updateDoc(doc(db, "messages", msgId), {
                        authStatus: "accepted"
                    });

                    // 2) 해당 글에 '인증된 주인 uid'만 기록 (글 상태는 그대로 유지)
                    await updateDoc(doc(db, "items", itemId), {
                        authVerifiedOwnerUid: ownerUid
                    });

                    // 3) 전달 위치/시간 안내 쪽지를 추가로 보내기 (입력했을 때만)
                    if (extra) {
                        const fromUid = auth.currentUser.uid;
                        await addDoc(collection(db, "messages"), {
                            toUid: ownerUid,
                            fromUid,
                            itemId,
                            content: extra,
                            isAnon: false,
                            anonLabel: null,
                            senderName: auth.currentUser.displayName || "",
                            read: false,
                            createdAt: serverTimestamp(),
                            itemTitle: wrap.dataset.title || "",
                            itemThumb: wrap.dataset.thumb || "",
                            type: "handover_info",
                            role: "finder",
                            authStatus: null
                        });
                    }

                    alert("주인 인증으로 처리했습니다.\n실제 전달이 끝나면 '전달 완료 처리' 버튼을 눌러 주세요.");
                    await fetchItems();
                    await loadInbox();
                } catch (err) {
                    alert("처리 실패: " + (err.message || err));
                }
            });
        });

        listEl.querySelectorAll(".btn-auth-reject").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                const wrap = e.target.closest(".inbox-item");
                const msgId = wrap.dataset.id;
                const itemId = wrap.dataset.item;

                if (!msgId || !itemId) return;
                if (!confirm("이 사람은 주인이 아닌 것으로 처리할까요?")) return;

                try {
                    await updateDoc(doc(db, "messages", msgId), {
                        authStatus: "rejected"
                    });
                    alert("주인 인증 거절로 처리했습니다.");
                    await loadInbox();
                } catch (err) {
                    alert("처리 실패: " + (err.message || err));
                }
            });
        });

        // ===== 전달 완료 처리 =====
        listEl.querySelectorAll(".btn-handover-done").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                const wrap = e.target.closest(".inbox-item");
                const msgId = wrap.dataset.id;
                const itemId = wrap.dataset.item;

                if (!msgId || !itemId) return;
                if (!confirm("실제로 물건을 주인에게 전달하셨나요?\n글 상태를 '완료'로 변경합니다.")) return;

                try {
                    // 글 상태를 '완료'로 변경
                    await updateDoc(doc(db, "items", itemId), {
                        status: "완료"
                    });

                    // 이 쪽지에도 전달 완료 표시
                    await updateDoc(doc(db, "messages", msgId), {
                        handoverStatus: "done"
                    });

                    alert("글 상태를 '완료'로 변경했습니다.");
                    await fetchItems();
                    await loadInbox();
                } catch (err) {
                    alert("처리 실패: " + (err.message || err));
                }
            });
        });

        listEl.querySelectorAll(".btn-auth-answer-send").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                const wrap = e.target.closest(".inbox-item");
                const toUid = wrap.dataset.from;
                const itemId = wrap.dataset.item;
                const text = (wrap.querySelector(".auth-answer-text")?.value || "").trim();

                if (!text) return alert("생김새 설명을 입력해주세요.");
                if (!auth.currentUser) return alert("로그인이 필요합니다.");

                try {
                    await addDoc(collection(db, "messages"), {
                        toUid,
                        fromUid: auth.currentUser.uid,
                        itemId,
                        content: text,
                        isAnon: false,
                        anonLabel: null,
                        senderName: auth.currentUser.displayName || "",
                        read: false,
                        createdAt: serverTimestamp(),
                        itemTitle: wrap.dataset.title || "",
                        itemThumb: wrap.dataset.thumb || "",
                        type: "auth_answer",
                        role: "owner",
                        authStatus: "pending"
                    });

                    alert("생김새 설명을 보냈습니다.");
                    await loadInbox();
                    loadInboxCount();
                } catch (err) {
                    alert("전송 실패: " + (err.message || err));
                }
            });
        });
    } catch (e) {
        console.error(e);
        listEl.innerHTML = `<div class="muted">쪽지를 불러오지 못했습니다.</div>`;
    }
}

async function loadInboxCount() {
    if (!inboxBadge) return;
    if (!auth.currentUser) {
        inboxBadge.style.display = "none";
        return;
    }
    try {
        const snap = await getDocs(collection(db, "messages"));
        const me = auth.currentUser.uid;
        const unread = snap.docs.map((d) => d.data()).filter((m) => m.toUid === me && m.read === false).length;
        if (unread > 0) {
            inboxBadge.textContent = String(unread);
            inboxBadge.style.display = "inline-flex";
        } else {
            inboxBadge.style.display = "none";
        }
    } catch (e) {
        inboxBadge.style.display = "none";
    }
}

inboxBtn?.addEventListener("click", async () => {
    if (!auth.currentUser) {
        try {
            await signInWithPopup(auth, provider);
        } catch (e) {
            return;
        }
        if (!auth.currentUser) return;
    }
    await loadInbox();
    openModal(inboxModal);
});

onAuthStateChanged(auth, () => {
    loadInboxCount();
});
