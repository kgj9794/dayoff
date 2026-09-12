// ==========================================
// 1. 상태 관리 & 유틸
// ==========================================
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxyLX-M_XVv8_9TiIEZ9mmHaKyGz4XHE_bcwyMGWnms5fs6G-gfW6nwghUoxpFB1cL58g/exec';

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 🌟 24시간 세션 유효 기간

const holidayMap = new Map();
const fetchedYears = new Set();
const weatherMap = new Map(); // 날씨 캐시 맵

// 사용자 등록 연차 저장소 (Key: 'YYYY-MM-DD', Value: 연차 객체)
const userLeavesMap = new Map();
let userLeavesList = [];

const currentRealYear = new Date().getFullYear();
const currentRealMonth = new Date().getMonth();

let simViewYear = currentRealYear;
let simViewMonth = currentRealMonth;
let isSimCalendarSliding = false;

// 🌟 연차 추가하기 전용 캘린더 탐색 연/월 및 슬라이드 잠금 플래그
let myLeaveViewYear = currentRealYear;
let myLeaveViewMonth = currentRealMonth;
let isMyLeaveCalendarSliding = false;

const flipState = {
  "flip-days": null,
  "flip-hours": null,
  "flip-minutes": null,
  "flip-seconds": null
};

// 위젯 기본 순서 (PC 2열 기준: 좌 4개, 우 3개로 균등 배분)
const DEFAULT_WIDGET_ORDER = [
  "countdown",
  "calendar",
  "insight",
  "stats",
  "holidays",
  "vacation",
  "travel"
];

const WIDGET_META = {
  countdown: { name: "⏱️ 다음 쉬는 날 카운트다운" },
  calendar: { name: "📅 이번 달 달력" },
  insight: { name: "💡 이번 달 휴일 브리핑" },
  stats: { name: "📊 이번 달 휴일 현황" },
  holidays: { name: "🚩 다가오는 공휴일 일정" },
  vacation: { name: "🌴 가성비 연차 추천" },
  travel: { name: "✈️ 황금연휴 해외여행 추천" }
};

// 🌟 전역 토스트 알림 헬퍼 함수
function showToast(message, icon = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "toast-item";
  toast.innerHTML = `
    <span class="material-symbols-outlined toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("is-hiding");
    setTimeout(() => {
      toast.remove();
    }, 260);
  }, 3000);
}

// 🌟 날짜 문자열 안전 정규화 헬퍼 (영문 표준시 문자열 등 어떤 포맷이든 YYYY-MM-DD로 변환)
function normalizeDateString(val) {
  if (!val) return '';
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return formatDateKey(d);
  }
  return str;
}

function formatDateKey(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const date = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

function formatDateMD(d) {
  const dayName = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일(${dayName})`;
}

function safeSetInnerText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}

function hideLoadingScreen() {
  const loadingScreen = document.getElementById("app-loading-screen");
  if (loadingScreen) {
    loadingScreen.classList.add("is-hidden");
    document.body.classList.remove("is-loading");
    setTimeout(() => {
      loadingScreen.remove();
    }, 400);
  }
}

// 햄버거 버튼 아이콘 상태 동기화 (☰ ↔ ✖️)
function updateHamburgerIconState() {
  const navDrawer = document.getElementById("nav-drawer");
  const hamburgerBtn = document.getElementById("btn-open-nav-menu");
  if (hamburgerBtn && navDrawer) {
    const isOpen = navDrawer.classList.contains("is-open");
    hamburgerBtn.classList.toggle("is-close", isOpen);
    hamburgerBtn.setAttribute("aria-label", isOpen ? "메뉴 닫기" : "메뉴 열기");
  }
}

// 상단 타이틀 마퀴 롤링 감지
function checkAndApplyTitleMarquee() {
  const titleWrap = document.getElementById("top-bar-title-wrap");
  const brandTitle = document.getElementById("brand-title");
  const titleText = document.getElementById("brand-title-text");

  if (!titleWrap || !brandTitle || !titleText) return;

  titleText.classList.remove("is-marquee");
  brandTitle.classList.remove("has-marquee");
  titleText.style.removeProperty("--title-marquee-dist");

  const containerWidth = brandTitle.clientWidth;
  const textWidth = titleText.scrollWidth;

  if (textWidth > containerWidth + 2) {
    const overflowDistance = textWidth - containerWidth + 8;
    brandTitle.classList.add("has-marquee");
    titleText.classList.add("is-marquee");
    titleText.style.setProperty("--title-marquee-dist", `-${overflowDistance}px`);
  }
}

// 점심 메뉴 추천 텍스트 좌우 롤링 감지
function checkAndApplyLunchMarquee() {
  const nameEl = document.getElementById("lunch-result-name");
  if (!nameEl) return;

  let textEl = nameEl.querySelector(".lunch-name-text");
  if (!textEl) {
    nameEl.innerHTML = `<span class="lunch-name-text">${nameEl.innerText}</span>`;
    textEl = nameEl.querySelector(".lunch-name-text");
  }

  textEl.classList.remove("is-marquee");
  nameEl.classList.remove("has-marquee");
  textEl.style.removeProperty("--lunch-marquee-dist");

  const containerWidth = nameEl.clientWidth;
  const textWidth = textEl.scrollWidth;

  if (textWidth > containerWidth + 2) {
    const overflowDistance = textWidth - containerWidth + 14;
    nameEl.classList.add("has-marquee");
    textEl.classList.add("is-marquee");
    textEl.style.setProperty("--lunch-marquee-dist", `-${overflowDistance}px`);
  }
}

// 캘린더 내부 서브 라벨 반응형 오버플로우 감지
function checkAndApplyMarquees() {
  const subLabels = document.querySelectorAll('.cal-sub-label');
  subLabels.forEach(label => {
    const textEl = label.querySelector('.cal-sub-text');
    if (!textEl || !textEl.innerText.trim()) return;

    textEl.classList.remove('is-marquee');
    label.classList.remove('has-marquee');

    const containerWidth = label.clientWidth;
    const textWidth = textEl.scrollWidth;

    if (textWidth > containerWidth + 1) {
      label.classList.add('has-marquee');
      textEl.classList.add('is-marquee');
      const overflowDistance = textWidth - containerWidth + 6;
      textEl.style.setProperty('--marquee-dist', `-${overflowDistance}px`);
    } else {
      textEl.style.removeProperty('--marquee-dist');
    }
  });

  checkAndApplyTitleMarquee();
  checkAndApplyLunchMarquee();
}

// ==========================================
// 2. WMO 날씨 코드 매핑 & 무료 날씨 API 연동 (Open-Meteo)
// ==========================================
function getWmoWeatherInfo(code) {
  switch (code) {
    case 0:
      return { icon: "☀️", name: "맑음" };
    case 1:
    case 2:
      return { icon: "🌤️", name: "대체로 맑음" };
    case 3:
      return { icon: "☁️", name: "흐림" };
    case 45:
    case 48:
      return { icon: "🌫️", name: "안개" };
    case 51:
    case 53:
    case 55:
      return { icon: "🌦️", name: "이슬비" };
    case 61:
    case 63:
    case 65:
      return { icon: "🌧️", name: "비" };
    case 66:
    case 67:
      return { icon: "🌧️", name: "진눈깨비" };
    case 71:
    case 73:
    case 75:
    case 77:
      return { icon: "❄️", name: "눈" };
    case 80:
    case 81:
    case 82:
      return { icon: "🌦️", name: "소나기" };
    case 85:
    case 86:
      return { icon: "🌨️", name: "눈보라" };
    case 95:
    case 96:
    case 99:
      return { icon: "⛈️", name: "뇌우" };
    default:
      return { icon: "🌤️", name: "구름 조금" };
  }
}

async function ensureWeatherForecast() {
  try {
    const lat = 37.5665;
    const lon = 126.9780;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FSeoul&forecast_days=14`;
    
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    
    if (data && data.daily && data.daily.time) {
      data.daily.time.forEach((dateStr, idx) => {
        const code = data.daily.weather_code ? data.daily.weather_code[idx] : null;
        const maxT = data.daily.temperature_2m_max ? data.daily.temperature_2m_max[idx] : null;
        const minT = data.daily.temperature_2m_min ? data.daily.temperature_2m_min[idx] : null;

        if (maxT === null || minT === null || code === null || isNaN(maxT) || isNaN(minT)) {
          return;
        }

        const info = getWmoWeatherInfo(code);

        weatherMap.set(dateStr, {
          icon: info.icon,
          name: info.name,
          maxTemp: Math.round(maxT),
          minTemp: Math.round(minT)
        });
      });
    }
  } catch (err) {
    console.warn("날씨 예보 불러오기 건너뜀:", err);
  }
}

// ==========================================
// 3. 통합 모달 & 뒤로가기(History) 매니저
// ==========================================
const modalHistoryStack = [];

function openModalView(modalId, backdropId, onOpenCallback) {
  const modalEl = document.getElementById(modalId);
  const backdropEl = document.getElementById(backdropId);

  if (!modalEl) return;

  modalEl.classList.add("is-open");
  if (backdropEl) backdropEl.classList.add("is-open");
  document.body.style.overflow = "hidden";

  modalHistoryStack.push({ modalId, backdropId });
  history.pushState({ modalId }, "", `#${modalId}`);

  updateHamburgerIconState();

  if (typeof onOpenCallback === "function") {
    onOpenCallback();
  }
}

function closeModalView(modalId) {
  if (modalHistoryStack.length > 0 && modalHistoryStack[modalHistoryStack.length - 1].modalId === modalId) {
    history.back();
  } else {
    _cleanupModalDOM(modalId);
  }
}

function _cleanupModalDOM(modalId) {
  const index = modalHistoryStack.findIndex(item => item.modalId === modalId);
  if (index !== -1) {
    const { backdropId } = modalHistoryStack[index];
    const modalEl = document.getElementById(modalId);
    const backdropEl = document.getElementById(backdropId);

    if (modalEl) modalEl.classList.remove("is-open");
    if (backdropEl) backdropEl.classList.remove("is-open");
    modalHistoryStack.splice(index, 1);
  } else {
    const modalEl = document.getElementById(modalId);
    if (modalEl) modalEl.classList.remove("is-open");
  }

  if (modalHistoryStack.length === 0) {
    document.body.style.overflow = "";
  }

  updateHamburgerIconState();
}

function transitionModalView(fromModalId, toModalId, toBackdropId, onOpenCallback) {
  const fromIndex = modalHistoryStack.findIndex(item => item.modalId === fromModalId);
  if (fromIndex !== -1) {
    const { backdropId: fromBackdropId } = modalHistoryStack[fromIndex];
    const fromModalEl = document.getElementById(fromModalId);
    const fromBackdropEl = document.getElementById(fromBackdropId);

    if (fromModalEl) fromModalEl.classList.remove("is-open");
    if (fromBackdropEl) fromBackdropEl.classList.remove("is-open");
    modalHistoryStack.splice(fromIndex, 1);
  }

  const toModalEl = document.getElementById(toModalId);
  const toBackdropEl = document.getElementById(toBackdropId);

  if (toModalEl) toModalEl.classList.add("is-open");
  if (toBackdropEl) toBackdropEl.classList.add("is-open");
  document.body.style.overflow = "hidden";

  modalHistoryStack.push({ modalId: toModalId, backdropId: toBackdropId });
  history.replaceState({ modalId: toModalId }, "", `#${toModalId}`);

  updateHamburgerIconState();

  if (typeof onOpenCallback === "function") {
    onOpenCallback();
  }
}

function initGlobalHistoryAndEscListener() {
  window.addEventListener("popstate", () => {
    if (modalHistoryStack.length > 0) {
      const topModal = modalHistoryStack[modalHistoryStack.length - 1];
      _cleanupModalDOM(topModal.modalId);
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeProfilePopup();
      if (modalHistoryStack.length > 0) {
        const topModal = modalHistoryStack[modalHistoryStack.length - 1];
        closeModalView(topModal.modalId);
      }
    }
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(checkAndApplyMarquees, 150);
  });
}

// ==========================================
// 4. 위젯 순서 관리 & 대시보드 렌더링
// ==========================================
function getSavedWidgetOrder() {
  try {
    const saved = localStorage.getItem("app_widget_order");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length === DEFAULT_WIDGET_ORDER.length) {
        return parsed;
      }
    }
  } catch (e) {
    console.error("위젯 순서 불러오기 오류:", e);
  }
  return [...DEFAULT_WIDGET_ORDER];
}

function saveWidgetOrder(order) {
  localStorage.setItem("app_widget_order", JSON.stringify(order));
  applyWidgetOrderToDOM(order);
}

function applyWidgetOrderToDOM(order) {
  const colPrimary = document.getElementById("col-primary");
  const colSecondary = document.getElementById("col-secondary");
  const topBar = document.querySelector(".widget-order-top-bar");

  if (!colPrimary || !colSecondary) return;

  if (topBar && colPrimary.contains(topBar)) {
    colPrimary.prepend(topBar);
  }

  order.forEach((widgetId, idx) => {
    const widgetEl = document.getElementById(`widget-${widgetId}`);
    if (widgetEl) {
      if (idx < 4) {
        colPrimary.appendChild(widgetEl);
      } else {
        colSecondary.appendChild(widgetEl);
      }
    }
  });

  checkAndApplyMarquees();
}

let tempWidgetOrder = [];

function renderWidgetOrderModalList() {
  const listEl = document.getElementById("widget-order-list");
  if (!listEl) return;

  listEl.innerHTML = tempWidgetOrder.map((widgetId, idx) => {
    const meta = WIDGET_META[widgetId] || { name: widgetId };
    const isFirst = idx === 0;
    const isLast = idx === tempWidgetOrder.length - 1;

    return `
      <div class="widget-order-item" data-index="${idx}">
        <div class="widget-order-item-left">
          <span class="widget-order-index">${idx + 1}</span>
          <span class="widget-order-name">${meta.name}</span>
        </div>
        <div class="widget-order-btns">
          <button type="button" class="btn-order-move btn-move-up" data-idx="${idx}" ${isFirst ? 'disabled' : ''} title="위로 이동">
            <span class="material-symbols-outlined icon-small">arrow_upward</span>
          </button>
          <button type="button" class="btn-order-move btn-move-down" data-idx="${idx}" ${isLast ? 'disabled' : ''} title="아래로 이동">
            <span class="material-symbols-outlined icon-small">arrow_downward</span>
          </button>
        </div>
      </div>
    `;
  }).join("");

  listEl.querySelectorAll(".btn-move-up").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      if (idx > 0) {
        const temp = tempWidgetOrder[idx];
        tempWidgetOrder[idx] = tempWidgetOrder[idx - 1];
        tempWidgetOrder[idx - 1] = temp;
        renderWidgetOrderModalList();
      }
    });
  });

  listEl.querySelectorAll(".btn-move-down").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      if (idx < tempWidgetOrder.length - 1) {
        const temp = tempWidgetOrder[idx];
        tempWidgetOrder[idx] = tempWidgetOrder[idx + 1];
        tempWidgetOrder[idx + 1] = temp;
        renderWidgetOrderModalList();
      }
    });
  });
}

function initWidgetOrderManager() {
  const openBtn = document.getElementById("btn-open-widget-order");
  const closeBtn = document.getElementById("btn-close-widget-order");
  const backdrop = document.getElementById("widget-order-modal-backdrop");
  const saveBtn = document.getElementById("btn-save-widget-order");
  const resetBtn = document.getElementById("btn-reset-widget-order");

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      tempWidgetOrder = getSavedWidgetOrder();
      renderWidgetOrderModalList();
      openModalView("widget-order-modal", "widget-order-modal-backdrop");
    });
  }

  if (closeBtn) closeBtn.addEventListener("click", () => closeModalView("widget-order-modal"));
  if (backdrop) backdrop.addEventListener("click", () => closeModalView("widget-order-modal"));

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      saveWidgetOrder(tempWidgetOrder);
      closeModalView("widget-order-modal");
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      tempWidgetOrder = [...DEFAULT_WIDGET_ORDER];
      renderWidgetOrderModalList();
    });
  }

  applyWidgetOrderToDOM(getSavedWidgetOrder());
}

// ==========================================
// 5. 출근/퇴근 시간 관리 & 개인정보 변경 모달
// ==========================================
function getStartWorkTime() {
  const saved = localStorage.getItem("app_start_work_time") || "08:00";
  const [h, m] = saved.split(":").map(Number);
  return {
    hours: isNaN(h) ? 8 : h,
    minutes: isNaN(m) ? 0 : m,
    str: saved
  };
}

function getOffWorkTime() {
  const saved = localStorage.getItem("app_off_work_time") || "17:00";
  const [h, m] = saved.split(":").map(Number);
  return {
    hours: isNaN(h) ? 17 : h,
    minutes: isNaN(m) ? 0 : m,
    str: saved
  };
}

// 🌟 카운트다운 위젯 내 출퇴근 시간 텍스트 배지 실시간 갱신
function updateWorkTimeDisplay() {
  const textEl = document.getElementById("countdown-work-time-text");
  if (textEl) {
    const start = getStartWorkTime().str;
    const off = getOffWorkTime().str;
    textEl.innerText = `출근 ${start} · 퇴근 ${off}`;
  }
}

// 🌟 로그인 사용자의 출퇴근 시간 설정을 구글 시트 DB로 비동기 저장
async function syncWorkTimeToServer() {
  const user = getCurrentUser();
  if (!user) return;

  const { str: startStr } = getStartWorkTime();
  const { str: offStr } = getOffWorkTime();

  try {
    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "updateWorkTime",
        userId: user.id,
        startWorkTime: startStr,
        offWorkTime: offStr
      })
    });
  } catch (err) {
    console.warn("출퇴근 시간 DB 동기화 실패:", err);
  }
}

// 🌟 개인정보 변경 모달 즉시 열기 (로그인 검증 및 기본값 채우기)
function openProfileEditModalDirectly() {
  const user = getCurrentUser();
  if (!user) {
    alert("근무 시간 설정은 로그인 후 이용하실 수 있습니다.");
    setTimeout(() => {
      const loginForm = document.getElementById("auth-login-form");
      const signupForm = document.getElementById("auth-signup-form");
      if (loginForm && signupForm) {
        loginForm.style.display = "flex";
        signupForm.style.display = "none";
      }
      openModalView("auth-modal", "auth-modal-backdrop");
    }, 150);
    return;
  }

  const startInput = document.getElementById("edit-start-work-time");
  const offInput = document.getElementById("edit-off-work-time");
  if (startInput) startInput.value = getStartWorkTime().str;
  if (offInput) offInput.value = getOffWorkTime().str;

  openModalView("profile-edit-modal", "profile-edit-modal-backdrop");
}

// 🌟 프로필 > 개인정보 변경 모달 제어 엔진
function initProfileEditModal() {
  const form = document.getElementById("profile-edit-form");
  const closeBtn = document.getElementById("btn-close-profile-edit");
  const backdrop = document.getElementById("profile-edit-modal-backdrop");
  const submitBtn = document.getElementById("btn-profile-edit-submit");
  const btnText = document.getElementById("profile-edit-btn-text");

  if (closeBtn) closeBtn.addEventListener("click", () => closeModalView("profile-edit-modal"));
  if (backdrop) backdrop.addEventListener("click", () => closeModalView("profile-edit-modal"));

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const startVal = document.getElementById("edit-start-work-time").value;
      const offVal = document.getElementById("edit-off-work-time").value;

      if (!startVal || !offVal) {
        alert("출근 시간과 퇴근 시간을 모두 입력해주세요.");
        return;
      }

      localStorage.setItem("app_start_work_time", startVal);
      localStorage.setItem("app_off_work_time", offVal);

      updateWorkTimeDisplay();
      updateCountdown();

      submitBtn.disabled = true;
      if (btnText) btnText.innerText = "저장 중...";

      await syncWorkTimeToServer();

      submitBtn.disabled = false;
      if (btnText) btnText.innerText = "근무 시간 저장";

      closeModalView("profile-edit-modal");
      showToast("근무 시간이 성공적으로 저장되었습니다.", "schedule");
    });
  }
}

// ==========================================
// 6. 네비게이션 드로어 & 모달 이벤트 등록
// ==========================================
function openMyLeaveDrawer() {
  const user = getCurrentUser();
  if (!user) {
    alert("연차 추가 및 관리 기능은 로그인 후 이용하실 수 있습니다.");
    const navDrawer = document.getElementById("nav-drawer");
    if (navDrawer && navDrawer.classList.contains("is-open")) {
      closeModalView("nav-drawer");
    }
    setTimeout(() => {
      const loginForm = document.getElementById("auth-login-form");
      const signupForm = document.getElementById("auth-signup-form");
      if (loginForm && signupForm) {
        loginForm.style.display = "flex";
        signupForm.style.display = "none";
      }
      openModalView("auth-modal", "auth-modal-backdrop");
    }, 200);
    return;
  }

  const navDrawer = document.getElementById("nav-drawer");
  const onDrawerOpen = () => {
    myLeaveViewYear = currentRealYear;
    myLeaveViewMonth = currentRealMonth;
    renderMyLeaveCalendar("none");
    renderMyLeaveRegisteredList();
  };

  if (navDrawer && navDrawer.classList.contains("is-open")) {
    transitionModalView("nav-drawer", "my-leave-drawer", "my-leave-drawer-backdrop", onDrawerOpen);
  } else {
    openModalView("my-leave-drawer", "my-leave-drawer-backdrop", onDrawerOpen);
  }
}

function initNavigationAndDrawers() {
  const openNavBtn = document.getElementById("btn-open-nav-menu");
  const closeNavBtn = document.getElementById("btn-close-nav-menu");
  const navBackdrop = document.getElementById("nav-drawer-backdrop");

  const mainAddLeaveBtn = document.getElementById("btn-main-add-leave"); // 메인 화면 달력의 '+' 버튼
  const editWorkTimeBtn = document.getElementById("btn-edit-work-time"); // 카운트다운 연필 버튼
  const closeMyLeaveBtn = document.getElementById("btn-close-my-leave");
  const myLeaveBackdrop = document.getElementById("my-leave-drawer-backdrop");

  const openSimBtn = document.getElementById("menu-open-simulator");
  const closeSimBtn = document.getElementById("btn-close-sim");
  const simBackdrop = document.getElementById("sim-drawer-backdrop");

  const openLunchBtn = document.getElementById("menu-open-lunch");
  const closeLunchBtn = document.getElementById("btn-close-lunch");
  const lunchBackdrop = document.getElementById("lunch-drawer-backdrop");

  const openSlackingBtn = document.getElementById("menu-open-slacking");
  const closeSlackingBtn = document.getElementById("btn-close-slacking");
  const slackingBackdrop = document.getElementById("slacking-drawer-backdrop");

  if (openNavBtn) {
    openNavBtn.addEventListener("click", () => {
      closeProfilePopup();
      const navDrawer = document.getElementById("nav-drawer");
      if (navDrawer && navDrawer.classList.contains("is-open")) {
        closeModalView("nav-drawer");
      } else {
        openModalView("nav-drawer", "nav-drawer-backdrop");
      }
    });
  }

  if (closeNavBtn) closeNavBtn.addEventListener("click", () => closeModalView("nav-drawer"));
  if (navBackdrop) navBackdrop.addEventListener("click", () => closeModalView("nav-drawer"));

  // 1) 메인 화면 '이번 달 달력' 우측 상단 '+' 버튼 클릭 -> 연차 관리 서랍 오픈
  if (mainAddLeaveBtn) mainAddLeaveBtn.addEventListener("click", openMyLeaveDrawer);

  // 2) 메인 화면 '카운트다운' 우측 상단 '연필' 버튼 클릭 -> 개인정보 변경(근무 시간 설정) 팝업 오픈
  if (editWorkTimeBtn) {
    editWorkTimeBtn.addEventListener("click", () => {
      openProfileEditModalDirectly();
    });
  }

  if (closeMyLeaveBtn) closeMyLeaveBtn.addEventListener("click", () => closeModalView("my-leave-drawer"));
  if (myLeaveBackdrop) myLeaveBackdrop.addEventListener("click", () => closeModalView("my-leave-drawer"));

  if (openSimBtn) {
    openSimBtn.addEventListener("click", () => {
      transitionModalView("nav-drawer", "simulation-drawer", "sim-drawer-backdrop", () => {
        renderSimulatedSpace("none");
      });
    });
  }
  if (closeSimBtn) closeSimBtn.addEventListener("click", () => closeModalView("simulation-drawer"));
  if (simBackdrop) simBackdrop.addEventListener("click", () => closeModalView("simulation-drawer"));

  if (openLunchBtn) {
    openLunchBtn.addEventListener("click", () => {
      transitionModalView("nav-drawer", "lunch-drawer", "lunch-drawer-backdrop", () => {
        checkAndApplyLunchMarquee();
      });
    });
  }
  if (closeLunchBtn) closeLunchBtn.addEventListener("click", () => closeModalView("lunch-drawer"));
  if (lunchBackdrop) lunchBackdrop.addEventListener("click", () => closeModalView("lunch-drawer"));

  if (openSlackingBtn) {
    openSlackingBtn.addEventListener("click", () => {
      transitionModalView("nav-drawer", "slacking-drawer", "slacking-drawer-backdrop");
    });
  }
  if (closeSlackingBtn) closeSlackingBtn.addEventListener("click", () => closeModalView("slacking-drawer"));
  if (slackingBackdrop) slackingBackdrop.addEventListener("click", () => closeModalView("slacking-drawer"));
}

// ==========================================
// 7. 달력 상세 팝업 모달
// ==========================================
function initCalendarDetailModal() {
  const closeBtn = document.getElementById("btn-close-modal");
  const backdrop = document.getElementById("cal-modal-backdrop");
  const deleteBtn = document.getElementById("btn-delete-selected-leave");

  if (closeBtn) closeBtn.addEventListener("click", () => closeModalView("cal-detail-modal"));
  if (backdrop) backdrop.addEventListener("click", () => closeModalView("cal-detail-modal"));

  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      const leaveId = deleteBtn.dataset.leaveId;
      if (!leaveId) return;

      if (confirm("이 연차 일정을 삭제(취소)하시겠습니까?")) {
        await executeDeleteUserLeave(leaveId);
        closeModalView("cal-detail-modal");
      }
    });
  }
}

function openCalendarDetailModal(cellDate, dateKey, isHoliday, isLeave, isToday, subText) {
  const dateTextEl = document.getElementById("modal-date-text");
  const badgeEl = document.getElementById("modal-badge-text");
  const nameEl = document.getElementById("modal-info-name");
  const descEl = document.getElementById("modal-info-desc");
  const iconEl = document.getElementById("modal-type-icon");
  const weatherBox = document.getElementById("modal-weather-box");
  const weatherInfoEl = document.getElementById("modal-info-weather");
  const myLeaveActionRow = document.getElementById("modal-my-leave-action-row");
  const deleteBtn = document.getElementById("btn-delete-selected-leave");

  const todayKey = formatDateKey(new Date());
  const dayName = ['일', '월', '화', '수', '목', '금', '토'][cellDate.getDay()];
  if (dateTextEl) dateTextEl.innerText = `${cellDate.getFullYear()}년 ${cellDate.getMonth() + 1}월 ${cellDate.getDate()}일 (${dayName})`;

  if (dateKey >= todayKey && weatherMap.has(dateKey)) {
    const w = weatherMap.get(dateKey);
    if (weatherBox) weatherBox.style.display = "flex";
    if (weatherInfoEl) weatherInfoEl.innerText = `${w.icon} ${w.name} (최저 ${w.minTemp}°C / 최고 ${w.maxTemp}°C)`;
  } else {
    if (weatherBox) weatherBox.style.display = "none";
  }

  if (userLeavesMap.has(dateKey)) {
    const myLeave = userLeavesMap.get(dateKey);
    if (iconEl) iconEl.innerText = "beach_access";
    if (badgeEl) {
      badgeEl.innerText = `내 연차 (${myLeave.type})`;
      badgeEl.className = "modal-status-badge leave";
    }
    if (nameEl) nameEl.innerText = myLeave.title;
    if (descEl) descEl.innerText = myLeave.content ? `${myLeave.content} (구분: ${myLeave.type})` : `직접 등록한 ${myLeave.type} 일정입니다.`;

    if (myLeaveActionRow && deleteBtn) {
      myLeaveActionRow.style.display = "flex";
      deleteBtn.dataset.leaveId = myLeave.id;
    }
  } else {
    if (myLeaveActionRow) myLeaveActionRow.style.display = "none";

    if (isHoliday) {
      if (iconEl) iconEl.innerText = "celebration";
      if (badgeEl) {
        badgeEl.innerText = "공휴일";
        badgeEl.className = "modal-status-badge holiday";
      }
      if (nameEl) nameEl.innerText = holidayMap.get(dateKey) || "공식 공휴일";
      if (descEl) descEl.innerText = "국가에서 지정한 공식 법정 공휴일(빨간 날)입니다.";
    } else if (isLeave) {
      if (iconEl) iconEl.innerText = "flight_takeoff";
      if (badgeEl) {
        badgeEl.innerText = "연차 추천";
        badgeEl.className = "modal-status-badge leave";
      }
      if (nameEl) nameEl.innerText = "징검다리 꿀연차 추천일";
      if (descEl) descEl.innerText = "앞뒤 공휴일 및 주말과 연계하여 1일 연차 사용 시 가장 길게 쉴 수 있는 가성비 황금 구간입니다.";
    } else if (cellDate.getDay() === 0 || cellDate.getDay() === 6) {
      if (iconEl) iconEl.innerText = "weekend";
      if (badgeEl) {
        badgeEl.innerText = "주말";
        badgeEl.className = "modal-status-badge normal";
      }
      if (nameEl) nameEl.innerText = cellDate.getDay() === 6 ? "토요일 주말" : "일요일 주말";
      if (descEl) descEl.innerText = "정기 휴일인 주말입니다.";
    } else {
      if (iconEl) iconEl.innerText = "work";
      if (badgeEl) {
        badgeEl.innerText = isToday ? "오늘 (근무일)" : "평일 근무일";
        badgeEl.className = "modal-status-badge normal";
      }
      if (nameEl) nameEl.innerText = isToday ? "오늘 (출근 및 근무)" : "일반 근무일";
      if (descEl) descEl.innerText = "정상적인 업무가 진행되는 평일입니다.";
    }
  }

  openModalView("cal-detail-modal", "cal-modal-backdrop");
}

// ==========================================
// 8. 피드백 제출 & 스크롤 연동 매니저
// ==========================================
function initFeedbackSystem() {
  const fabBtn = document.getElementById("btn-feedback-fab");
  const topFeedbackBtn = document.getElementById("btn-top-feedback");
  const closeBtn = document.getElementById("btn-close-feedback");
  const backdrop = document.getElementById("feedback-modal-backdrop");
  const form = document.getElementById("feedback-form");
  const submitBtn = document.getElementById("fb-submit-btn");
  const btnText = document.getElementById("fb-btn-text");

  if (fabBtn) {
    fabBtn.addEventListener("click", () => {
      openModalView("feedback-modal", "feedback-modal-backdrop");
    });
  }

  if (topFeedbackBtn) {
    topFeedbackBtn.addEventListener("click", () => {
      openModalView("feedback-modal", "feedback-modal-backdrop");
    });
  }

  if (closeBtn) closeBtn.addEventListener("click", () => closeModalView("feedback-modal"));
  if (backdrop) backdrop.addEventListener("click", () => closeModalView("feedback-modal"));

  const handleScrollFeedback = () => {
    const scrollY = window.scrollY;
    if (scrollY <= 20) {
      if (fabBtn) fabBtn.classList.remove("is-hidden");
      if (topFeedbackBtn) topFeedbackBtn.classList.add("is-hidden");
    } else {
      if (fabBtn) fabBtn.classList.add("is-hidden");
      if (topFeedbackBtn) topFeedbackBtn.classList.remove("is-hidden");
    }
  };

  window.addEventListener("scroll", handleScrollFeedback, { passive: true });
  handleScrollFeedback();

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const category = document.getElementById("fb-category").value;
      const content = document.getElementById("fb-content").value.trim();

      if (!category || !content) return;

      submitBtn.disabled = true;
      btnText.innerText = "전송 중...";

      try {
        const response = await fetch(APPS_SCRIPT_URL, {
          method: "POST",
          body: JSON.stringify({
            action: "submitFeedback",
            category: category,
            content: content
          })
        });

        const result = await response.json();

        if (result.status === "success") {
          alert("소중한 의견이 등록되었습니다. 감사합니다!");
          form.reset();
          closeModalView("feedback-modal");
        } else {
          alert("등록 중 오류가 발생했습니다: " + (result.message || "다시 시도해주세요."));
        }
      } catch (err) {
        console.error("피드백 전송 오류:", err);
        alert("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      } finally {
        submitBtn.disabled = false;
        btnText.innerText = "피드백 보내기";
      }
    });
  }
}

// ==========================================
// 9. 세션 만료 & 로그인 / 프로필 팝업 / 비밀번호 변경 시스템
// ==========================================
function checkSessionExpiration() {
  const user = localStorage.getItem("app_user");
  const loginTime = localStorage.getItem("app_user_login_time");

  if (user) {
    if (!loginTime) {
      localStorage.setItem("app_user_login_time", Date.now().toString());
      return false;
    }
    const elapsed = Date.now() - Number(loginTime);
    if (elapsed > SESSION_DURATION_MS) {
      localStorage.removeItem("app_user");
      localStorage.removeItem("app_user_login_time");
      localStorage.setItem("app_is_guest", "true");
      userLeavesMap.clear();
      userLeavesList = [];
      closeProfilePopup();
      alert("로그인 후 24시간이 경과하여 보안을 위해 자동으로 로그아웃되었습니다.");
      updateAuthUI();
      refreshAllCalendars();
      return true;
    }
  }
  return false;
}

function getCurrentUser() {
  try {
    if (checkSessionExpiration()) return null;
    const saved = localStorage.getItem("app_user");
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    return null;
  }
}

function openProfilePopup() {
  const user = getCurrentUser();
  if (!user) return;

  const popup = document.getElementById("profile-popup");
  const backdrop = document.getElementById("profile-popup-backdrop");
  const nameEl = document.getElementById("popup-user-name");
  const idEl = document.getElementById("popup-user-id");

  if (nameEl) nameEl.innerText = `${user.name || user.id} 님`;
  if (idEl) idEl.innerText = `아이디: ${user.id}`;

  if (backdrop) {
    backdrop.style.zIndex = "1050";
    backdrop.classList.add("is-open");
  }
  if (popup) {
    popup.style.zIndex = "1200";
    popup.classList.add("is-open");
  }
}

function closeProfilePopup() {
  const popup = document.getElementById("profile-popup");
  const backdrop = document.getElementById("profile-popup-backdrop");
  if (popup) popup.classList.remove("is-open");
  if (backdrop) backdrop.classList.remove("is-open");
}

function updateAuthUI() {
  const user = getCurrentUser();
  const isGuest = localStorage.getItem("app_is_guest") === "true";

  const topUserName = document.getElementById("top-user-name");
  const navUserName = document.getElementById("nav-user-name");
  const navUserStatus = document.getElementById("nav-user-status");
  const navAuthBtn = document.getElementById("btn-nav-auth");

  if (user) {
    if (topUserName) topUserName.innerText = user.name || user.id;
    if (navUserName) navUserName.innerText = `${user.name || user.id} 님`;
    if (navUserStatus) navUserStatus.innerText = `아이디: ${user.id}`;
    if (navAuthBtn) navAuthBtn.innerText = "로그아웃";
  } else if (isGuest) {
    if (topUserName) topUserName.innerText = "게스트";
    if (navUserName) navUserName.innerText = "게스트";
    if (navUserStatus) navUserStatus.innerText = "게스트 모드로 이용 중";
    if (navAuthBtn) navAuthBtn.innerText = "로그인";
  } else {
    if (topUserName) topUserName.innerText = "로그인";
    if (navUserName) navUserName.innerText = "게스트";
    if (navUserStatus) navUserStatus.innerText = "로그인이 필요합니다";
    if (navAuthBtn) navAuthBtn.innerText = "로그인";
  }
}

function initAuthSystem() {
  const topUserBtn = document.getElementById("btn-top-user");
  const navAuthBtn = document.getElementById("btn-nav-auth");
  const closeAuthBtn = document.getElementById("btn-close-auth");
  const authBackdrop = document.getElementById("auth-modal-backdrop");

  const loginForm = document.getElementById("auth-login-form");
  const signupForm = document.getElementById("auth-signup-form");
  const switchToSignupBtn = document.getElementById("btn-switch-to-signup");
  const switchToLoginBtn = document.getElementById("btn-switch-to-login");
  const guestLoginBtn = document.getElementById("btn-guest-login");

  const authModalTitle = document.getElementById("auth-modal-title");
  const authModalBadge = document.getElementById("auth-modal-badge");
  const authModalIcon = document.getElementById("auth-modal-icon");

  const loginBtnText = document.getElementById("login-btn-text");
  const signupBtnText = document.getElementById("signup-btn-text");
  const loginSubmitBtn = document.getElementById("btn-login-submit");
  const signupSubmitBtn = document.getElementById("btn-signup-submit");

  const showLoginForm = () => {
    if (loginForm && signupForm) {
      loginForm.style.display = "flex";
      signupForm.style.display = "none";
    }
    if (authModalTitle) authModalTitle.innerText = "로그인";
    if (authModalBadge) authModalBadge.innerText = "회원 인증";
    if (authModalIcon) authModalIcon.innerText = "lock";
  };

  const showSignupForm = () => {
    if (loginForm && signupForm) {
      loginForm.style.display = "none";
      signupForm.style.display = "flex";
    }
    if (authModalTitle) authModalTitle.innerText = "회원가입";
    if (authModalBadge) authModalBadge.innerText = "신규 등록";
    if (authModalIcon) authModalIcon.innerText = "person_add";
  };

  if (switchToSignupBtn) switchToSignupBtn.addEventListener("click", showSignupForm);
  if (switchToLoginBtn) switchToLoginBtn.addEventListener("click", showLoginForm);

  if (topUserBtn) {
    topUserBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const user = getCurrentUser();
      if (user) {
        const popup = document.getElementById("profile-popup");
        if (popup && popup.classList.contains("is-open")) {
          closeProfilePopup();
        } else {
          openProfilePopup();
        }
      } else {
        closeProfilePopup();
        showLoginForm();
        openModalView("auth-modal", "auth-modal-backdrop");
      }
    });
  }

  document.addEventListener("click", (e) => {
    // 1) 개인정보 변경 버튼 터치 감지
    const editProfileBtn = e.target.closest("#btn-popup-edit-profile");
    if (editProfileBtn) {
      e.preventDefault();
      e.stopPropagation();
      closeProfilePopup();
      openProfileEditModalDirectly();
      return;
    }

    // 2) 비밀번호 변경 버튼 터치 감지
    const changePwBtn = e.target.closest("#btn-popup-change-pw");
    if (changePwBtn) {
      e.preventDefault();
      e.stopPropagation();
      closeProfilePopup();
      const pwForm = document.getElementById("pw-change-form");
      if (pwForm) pwForm.reset();
      openModalView("pw-change-modal", "pw-change-modal-backdrop");
      return;
    }

    // 3) 로그아웃 버튼 터치 감지
    const logoutBtn = e.target.closest("#btn-popup-logout");
    if (logoutBtn) {
      e.preventDefault();
      e.stopPropagation();
      closeProfilePopup();
      if (confirm("로그아웃 하시겠습니까?")) {
        handleLogout();
      }
      return;
    }

    // 4) 프로필 팝업 바깥 터치 시 닫기
    const popup = document.getElementById("profile-popup");
    const backdrop = document.getElementById("profile-popup-backdrop");
    if (popup && popup.classList.contains("is-open")) {
      if (e.target === backdrop || (!popup.contains(e.target) && topUserBtn && !topUserBtn.contains(e.target))) {
        closeProfilePopup();
      }
    }
  });

  if (navAuthBtn) {
    navAuthBtn.addEventListener("click", () => {
      const user = getCurrentUser();
      if (user) {
        if (confirm("로그아웃 하시겠습니까?")) {
          closeModalView("nav-drawer");
          handleLogout();
        }
      } else {
        closeModalView("nav-drawer");
        showLoginForm();
        setTimeout(() => {
          openModalView("auth-modal", "auth-modal-backdrop");
        }, 200);
      }
    });
  }

  if (guestLoginBtn) {
    guestLoginBtn.addEventListener("click", () => {
      localStorage.removeItem("app_user");
      localStorage.removeItem("app_user_login_time");
      localStorage.setItem("app_is_guest", "true");
      userLeavesMap.clear();
      userLeavesList = [];
      updateAuthUI();
      refreshAllCalendars();
      closeModalView("auth-modal");
    });
  }

  if (closeAuthBtn) {
    closeAuthBtn.addEventListener("click", () => {
      if (!getCurrentUser() && localStorage.getItem("app_is_guest") !== "true") {
        localStorage.setItem("app_is_guest", "true");
        updateAuthUI();
      }
      closeModalView("auth-modal");
    });
  }

  if (authBackdrop) {
    authBackdrop.addEventListener("click", () => {
      if (!getCurrentUser() && localStorage.getItem("app_is_guest") !== "true") {
        localStorage.setItem("app_is_guest", "true");
        updateAuthUI();
      }
      closeModalView("auth-modal");
    });
  }

  // 로그인 제출
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("login-id").value.trim();
      const pw = document.getElementById("login-password").value;

      if (!id || !pw) return;

      loginSubmitBtn.disabled = true;
      loginBtnText.innerText = "로그인 중...";

      try {
        const response = await fetch(APPS_SCRIPT_URL, {
          method: "POST",
          body: JSON.stringify({
            action: "login",
            userId: id,
            password: pw
          })
        });

        const result = await response.json();

        if (result.status === "success" && result.user) {
          localStorage.setItem("app_user", JSON.stringify(result.user));
          localStorage.setItem("app_user_login_time", Date.now().toString());
          localStorage.removeItem("app_is_guest");

          // 사용자별 출퇴근 시간 DB에서 동기화
          if (result.user.startWorkTime) {
            localStorage.setItem("app_start_work_time", result.user.startWorkTime);
          }
          if (result.user.offWorkTime) {
            localStorage.setItem("app_off_work_time", result.user.offWorkTime);
          }
          updateWorkTimeDisplay();

          updateAuthUI();
          loginForm.reset();
          closeModalView("auth-modal");

          await loadUserLeaves(result.user.id);
          refreshAllCalendars();

          showToast(`${result.user.name}님, 환영합니다!`, "waving_hand");
        } else {
          alert("로그인 실패: " + (result.message || "아이디 또는 비밀번호를 확인해주세요."));
        }
      } catch (err) {
        console.error("로그인 에러:", err);
        alert("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      } finally {
        loginSubmitBtn.disabled = false;
        loginBtnText.innerText = "로그인";
      }
    });
  }

  // 회원가입 제출
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("signup-id").value.trim();
      const name = document.getElementById("signup-name").value.trim();
      const pw = document.getElementById("signup-password").value;
      const pwConfirm = document.getElementById("signup-password-confirm").value;

      if (!id || !name || !pw) {
        alert("모든 필수 항목을 입력해주세요.");
        return;
      }

      if (pw !== pwConfirm) {
        alert("비밀번호가 일치하지 않습니다. 다시 확인해주세요.");
        document.getElementById("signup-password-confirm").focus();
        return;
      }

      signupSubmitBtn.disabled = true;
      signupBtnText.innerText = "가입 처리 중...";

      try {
        const response = await fetch(APPS_SCRIPT_URL, {
          method: "POST",
          body: JSON.stringify({
            action: "register",
            userId: id,
            name: name,
            password: pw
          })
        });

        const result = await response.json();

        if (result.status === "success") {
          alert("회원가입이 완료되었습니다! 로그인해주세요.");
          signupForm.reset();
          showLoginForm();
          const loginIdInput = document.getElementById("login-id");
          if (loginIdInput) {
            loginIdInput.value = id;
            document.getElementById("login-password").focus();
          }
        } else {
          alert("회원가입 실패: " + (result.message || "다시 시도해주세요."));
        }
      } catch (err) {
        console.error("회원가입 에러:", err);
        alert("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      } finally {
        signupSubmitBtn.disabled = false;
        signupBtnText.innerText = "회원가입 완료";
      }
    });
  }

  updateAuthUI();

  const user = getCurrentUser();
  const isGuest = localStorage.getItem("app_is_guest") === "true";
  if (!user && !isGuest) {
    setTimeout(() => {
      showLoginForm();
      openModalView("auth-modal", "auth-modal-backdrop");
    }, 450);
  }
}

function handleLogout(isSilent = false) {
  localStorage.removeItem("app_user");
  localStorage.removeItem("app_user_login_time");
  localStorage.setItem("app_is_guest", "true");
  userLeavesMap.clear();
  userLeavesList = [];
  closeProfilePopup();
  updateAuthUI();
  refreshAllCalendars();
  if (!isSilent) {
    alert("로그아웃 되었습니다.");
  }
}

// 비밀번호 변경 폼 처리
function initPasswordChangeForm() {
  const form = document.getElementById("pw-change-form");
  const closeBtn = document.getElementById("btn-close-pw-change");
  const backdrop = document.getElementById("pw-change-modal-backdrop");
  const submitBtn = document.getElementById("btn-pw-change-submit");
  const btnText = document.getElementById("pw-change-btn-text");

  if (closeBtn) closeBtn.addEventListener("click", () => closeModalView("pw-change-modal"));
  if (backdrop) backdrop.addEventListener("click", () => closeModalView("pw-change-modal"));

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const user = getCurrentUser();
      if (!user) {
        alert("로그인 세션이 만료되었습니다. 다시 로그인해주세요.");
        closeModalView("pw-change-modal");
        return;
      }

      const currentPw = (document.getElementById("current-password").value || '').trim();
      const newPw = (document.getElementById("new-password").value || '').trim();
      const confirmPw = (document.getElementById("new-password-confirm").value || '').trim();

      if (!currentPw || !newPw || !confirmPw) {
        alert("모든 입력 항목을 채워주세요.");
        return;
      }

      if (newPw !== confirmPw) {
        alert("새 비밀번호가 일치하지 않습니다. 다시 확인해주세요.");
        document.getElementById("new-password-confirm").focus();
        return;
      }

      if (currentPw === newPw) {
        alert("현재 비밀번호와 다른 새로운 비밀번호를 입력해주세요.");
        return;
      }

      submitBtn.disabled = true;
      const originText = btnText ? btnText.innerText : "비밀번호 변경 완료";
      if (btnText) btnText.innerText = "변경 처리 중...";

      try {
        const response = await fetch(APPS_SCRIPT_URL, {
          method: "POST",
          body: JSON.stringify({
            action: "changePassword",
            userId: user.id,
            currentPassword: currentPw,
            newPassword: newPw
          })
        });

        const result = await response.json();

        if (result.status === "success") {
          alert("비밀번호가 성공적으로 변경되었습니다. 보안을 위해 다시 로그인해주세요.");
          form.reset();
          closeModalView("pw-change-modal");
          handleLogout(true);
          setTimeout(() => {
            const loginForm = document.getElementById("auth-login-form");
            const signupForm = document.getElementById("auth-signup-form");
            if (loginForm && signupForm) {
              loginForm.style.display = "flex";
              signupForm.style.display = "none";
            }
            openModalView("auth-modal", "auth-modal-backdrop");
          }, 200);
        } else {
          alert("비밀번호 변경 실패: " + (result.message || "현재 비밀번호를 확인해주세요."));
        }
      } catch (err) {
        console.error("비밀번호 변경 오류:", err);
        alert("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      } finally {
        submitBtn.disabled = false;
        if (btnText) btnText.innerText = originText;
      }
    });
  }
}

// ==========================================
// 10. 내 연차 관리 엔진 (로드/추가/삭제 및 캘린더 동기화)
// ==========================================
async function loadUserLeaves(userId) {
  if (!userId) return;
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "getUserLeaves",
        userId: userId
      })
    });

    const result = await response.json();
    if (result.status === "success" && Array.isArray(result.data)) {
      userLeavesMap.clear();
      userLeavesList = result.data.map(item => ({
        ...item,
        date: normalizeDateString(item.date)
      }));

      userLeavesList.forEach(leave => {
        userLeavesMap.set(leave.date, leave);
      });
    }
  } catch (err) {
    console.warn("내 연차 불러오기 오류:", err);
  }
}

function refreshAllCalendars() {
  renderMainRealtimeSpace();
  renderSimulatedSpace("none");
  renderMyLeaveCalendar("none");
  renderMyLeaveRegisteredList();
  updateCountdown();
  updateWorkTimeDisplay();
}

function renderMyLeaveCalendar(direction = "none") {
  const monthYearEl = document.getElementById("my-leave-cal-month-year");
  const viewport = document.getElementById("my-leave-calendar-viewport");
  if (!viewport || !monthYearEl) return;

  monthYearEl.innerText = `${myLeaveViewYear}년 ${myLeaveViewMonth + 1}월`;

  const activeLayer = viewport.querySelector(".calendar-grid-layer.active-layer") || 
                      document.getElementById("my-leave-calendar-days-active");

  const newFragment = createCalendarGridFragment(myLeaveViewYear, myLeaveViewMonth, true);

  if (direction === "none" || !activeLayer) {
    activeLayer.innerHTML = "";
    activeLayer.appendChild(newFragment);
  } else if (!isMyLeaveCalendarSliding) {
    isMyLeaveCalendarSliding = true;
    const newLayer = document.createElement("div");
    newLayer.className = "calendar-grid-layer";
    newLayer.appendChild(newFragment);
    viewport.appendChild(newLayer);

    if (direction === "next") {
      activeLayer.className = "calendar-grid-layer slide-up-exit";
      newLayer.className = "calendar-grid-layer slide-up-enter";
    } else if (direction === "prev") {
      activeLayer.className = "calendar-grid-layer slide-down-exit";
      newLayer.className = "calendar-grid-layer slide-down-enter";
    }

    setTimeout(() => {
      activeLayer.remove();
      newLayer.className = "calendar-grid-layer active-layer";
      isMyLeaveCalendarSliding = false;
      checkAndApplyMarquees();
    }, 330);
  }
}

function renderMyLeaveRegisteredList() {
  const listEl = document.getElementById("my-leave-registered-list");
  const countDescEl = document.getElementById("my-leave-count-desc");
  if (!listEl) return;

  const sortedLeaves = [...userLeavesList].sort((a, b) => a.date.localeCompare(b.date));

  if (countDescEl) {
    countDescEl.innerText = sortedLeaves.length > 0 
      ? `총 ${sortedLeaves.length}개의 연차 일정이 등록되어 있습니다.`
      : "등록된 연차 일정이 없습니다. 위 달력에서 날짜를 터치해 연차를 등록해보세요.";
  }

  if (sortedLeaves.length === 0) {
    listEl.innerHTML = `
      <div class="travel-card-item" style="text-align: center; padding: 20px;">
        <p class="travel-tip-text">등록된 연차 일정이 없습니다.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = sortedLeaves.map(item => {
    let typeClass = "type-annual";
    if (item.type.includes("반차")) typeClass = "type-half";
    else if (item.type === "공가") typeClass = "type-official";

    const cleanDate = normalizeDateString(item.date);
    let dayNameText = "";

    const parts = cleanDate.split("-");
    if (parts.length === 3) {
      const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      if (!isNaN(dateObj.getTime())) {
        const dayName = ['일', '월', '화', '수', '목', '금', '토'][dateObj.getDay()];
        dayNameText = `(${dayName})`;
      }
    }

    return `
      <div class="my-leave-card-item">
        <div class="my-leave-card-left">
          <div class="my-leave-badge-row">
            <span class="my-leave-type-badge ${typeClass}">${item.type}</span>
            <strong style="font-size: 0.8125rem; color: var(--md-sys-color-primary);">${cleanDate} ${dayNameText}</strong>
          </div>
          <strong class="my-leave-title">${item.title}</strong>
          ${item.content ? `<p class="my-leave-desc">${item.content}</p>` : ''}
        </div>
        <button type="button" class="btn-delete-leave" data-leave-id="${item.id}" title="연차 삭제">
          <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
        </button>
      </div>
    `;
  }).join("");

  listEl.querySelectorAll(".btn-delete-leave").forEach(btn => {
    btn.addEventListener("click", async () => {
      const leaveId = btn.dataset.leaveId;
      if (confirm("이 연차 일정을 삭제하시겠습니까?")) {
        await executeDeleteUserLeave(leaveId);
      }
    });
  });
}

async function executeDeleteUserLeave(leaveId) {
  const user = getCurrentUser();
  if (!user || !leaveId) return;

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "deleteUserLeave",
        userId: user.id,
        leaveId: leaveId
      })
    });

    const result = await response.json();
    if (result.status === "success") {
      userLeavesList = userLeavesList.filter(l => l.id !== leaveId);
      userLeavesMap.clear();
      userLeavesList.forEach(l => userLeavesMap.set(l.date, l));
      refreshAllCalendars();
      alert("연차 일정이 삭제되었습니다.");
    } else {
      alert("삭제 실패: " + (result.message || "다시 시도해주세요."));
    }
  } catch (err) {
    console.error("연차 삭제 오류:", err);
    alert("네트워크 오류가 발생했습니다.");
  }
}

function openLeaveRegisterModal(cellDate, dateKey) {
  const user = getCurrentUser();
  if (!user) {
    alert("연차 등록은 로그인 후 가능합니다.");
    return;
  }

  const cleanDateKey = normalizeDateString(dateKey);

  const dateInput = document.getElementById("leave-reg-date");
  const leaveIdInput = document.getElementById("leave-reg-id");
  const dateTitle = document.getElementById("leave-reg-modal-date");
  const modalBadge = document.getElementById("leave-reg-modal-badge");
  const modalIcon = document.getElementById("leave-reg-modal-icon");
  const titleInput = document.getElementById("leave-reg-title");
  const contentInput = document.getElementById("leave-reg-content");
  const typeSelect = document.getElementById("leave-reg-type");

  const submitBtn = document.getElementById("btn-leave-reg-submit");
  const submitBtnText = document.getElementById("leave-reg-btn-text");
  const submitBtnIcon = document.getElementById("leave-reg-btn-icon");
  const deleteBtn = document.getElementById("btn-leave-reg-delete");

  const dayName = ['일', '월', '화', '수', '목', '금', '토'][cellDate.getDay()];
  if (dateInput) dateInput.value = cleanDateKey;
  if (dateTitle) dateTitle.innerText = `${cellDate.getFullYear()}년 ${cellDate.getMonth() + 1}월 ${cellDate.getDate()}일 (${dayName})`;

  if (userLeavesMap.has(cleanDateKey)) {
    const existing = userLeavesMap.get(cleanDateKey);
    if (leaveIdInput) leaveIdInput.value = existing.id || "";
    if (typeSelect) typeSelect.value = existing.type || "연차";
    if (titleInput) titleInput.value = existing.title || "";
    if (contentInput) contentInput.value = existing.content || "";

    if (modalBadge) modalBadge.innerText = "연차 관리";
    if (modalIcon) modalIcon.innerText = "edit_calendar";
    if (submitBtnText) submitBtnText.innerText = "연차 수정하기";
    if (submitBtnIcon) submitBtnIcon.innerText = "edit";

    if (deleteBtn) {
      deleteBtn.style.display = "inline-flex";
      deleteBtn.dataset.leaveId = existing.id;
    }
  } else {
    if (leaveIdInput) leaveIdInput.value = "";
    if (typeSelect) typeSelect.value = "연차";
    if (titleInput) titleInput.value = "";
    if (contentInput) contentInput.value = "";

    if (modalBadge) modalBadge.innerText = "연차 등록";
    if (modalIcon) modalIcon.innerText = "calendar_add_on";
    if (submitBtnText) submitBtnText.innerText = "연차 등록하기";
    if (submitBtnIcon) submitBtnIcon.innerText = "check_circle";

    if (deleteBtn) {
      deleteBtn.style.display = "none";
      deleteBtn.dataset.leaveId = "";
    }
  }

  openModalView("leave-reg-modal", "leave-reg-modal-backdrop");
}

function initLeaveRegisterForm() {
  const form = document.getElementById("leave-register-form");
  const closeBtn = document.getElementById("btn-close-leave-reg");
  const backdrop = document.getElementById("leave-reg-modal-backdrop");
  const submitBtn = document.getElementById("btn-leave-reg-submit");
  const btnText = document.getElementById("leave-reg-btn-text");
  const deleteBtn = document.getElementById("btn-leave-reg-delete");

  const prevBtn = document.getElementById("my-leave-cal-prev");
  const nextBtn = document.getElementById("my-leave-cal-next");

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (isMyLeaveCalendarSliding) return;
      myLeaveViewMonth--;
      if (myLeaveViewMonth < 0) {
        myLeaveViewMonth = 11;
        myLeaveViewYear--;
      }
      renderMyLeaveCalendar("prev");
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (isMyLeaveCalendarSliding) return;
      myLeaveViewMonth++;
      if (myLeaveViewMonth > 11) {
        myLeaveViewMonth = 0;
        myLeaveViewYear++;
      }
      renderMyLeaveCalendar("next");
    });
  }

  if (closeBtn) closeBtn.addEventListener("click", () => closeModalView("leave-reg-modal"));
  if (backdrop) backdrop.addEventListener("click", () => closeModalView("leave-reg-modal"));

  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      const leaveId = deleteBtn.dataset.leaveId;
      if (!leaveId) return;

      if (confirm("정말 이 연차 일정을 삭제하시겠습니까?")) {
        deleteBtn.disabled = true;
        await executeDeleteUserLeave(leaveId);
        deleteBtn.disabled = false;
        closeModalView("leave-reg-modal");
      }
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const user = getCurrentUser();
      if (!user) {
        alert("로그인 세션이 만료되었습니다. 다시 로그인해주세요.");
        return;
      }

      const rawDateStr = document.getElementById("leave-reg-date").value;
      const dateStr = normalizeDateString(rawDateStr);
      const type = document.getElementById("leave-reg-type").value;
      const title = document.getElementById("leave-reg-title").value.trim();
      const content = document.getElementById("leave-reg-content").value.trim();

      if (!dateStr || !type || !title) {
        alert("휴가 구분과 제목을 입력해주세요.");
        return;
      }

      submitBtn.disabled = true;
      const originText = btnText.innerText;
      btnText.innerText = "처리 중...";

      try {
        const response = await fetch(APPS_SCRIPT_URL, {
          method: "POST",
          body: JSON.stringify({
            action: "addUserLeave",
            userId: user.id,
            date: dateStr,
            type: type,
            title: title,
            content: content
          })
        });

        const result = await response.json();

        if (result.status === "success" && result.leave) {
          const cleanLeave = {
            ...result.leave,
            date: normalizeDateString(result.leave.date)
          };

          userLeavesList = userLeavesList.filter(l => l.date !== cleanLeave.date);
          userLeavesList.push(cleanLeave);
          userLeavesMap.set(cleanLeave.date, cleanLeave);

          refreshAllCalendars();
          closeModalView("leave-reg-modal");
          alert(`${cleanLeave.date} 연차가 성공적으로 저장되었습니다!`);
        } else {
          alert("등록 실패: " + (result.message || "다시 시도해주세요."));
        }
      } catch (err) {
        console.error("연차 등록 에러:", err);
        alert("네트워크 오류가 발생했습니다.");
      } finally {
        submitBtn.disabled = false;
        btnText.innerText = originText;
      }
    });
  }
}

// ==========================================
// 11. 테마 관리
// ==========================================
function initThemeManager() {
  const root = document.documentElement;
  const fabBtn = document.getElementById("fab-theme-btn");
  const fabIcon = document.getElementById("fab-theme-icon");
  const themeMenu = document.getElementById("theme-menu");
  const themeOptions = document.querySelectorAll(".theme-option");
  const themeFab = document.getElementById("theme-switcher-fab");

  const savedTheme = localStorage.getItem("app_theme") || "auto";
  applyTheme(savedTheme);

  if (fabBtn) {
    fabBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (themeMenu) themeMenu.classList.toggle("active");
    });
  }

  document.addEventListener("click", () => {
    if (themeMenu) themeMenu.classList.remove("active");
  });

  themeOptions.forEach(opt => {
    opt.addEventListener("click", () => {
      const themeVal = opt.dataset.themeValue;
      localStorage.setItem("app_theme", themeVal);
      applyTheme(themeVal);
      if (themeMenu) themeMenu.classList.remove("active");
    });
  });

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    themeOptions.forEach(opt => {
      opt.classList.toggle("selected", opt.dataset.themeValue === theme);
    });

    if (fabIcon) {
      if (theme === "light") {
        fabIcon.innerText = "light_mode";
      } else if (theme === "dark") {
        fabIcon.innerText = "dark_mode";
      } else {
        fabIcon.innerText = "settings_brightness";
      }
    }
  }

  let isScrolled = false;
  window.addEventListener("scroll", () => {
    if (window.innerWidth >= 1024) return;

    const scrollY = window.scrollY;
    if (!isScrolled && scrollY > 60) {
      isScrolled = true;
      if (themeFab) themeFab.classList.add("is-hidden");
      if (themeMenu) themeMenu.classList.remove("active");
    } else if (isScrolled && scrollY <= 20) {
      isScrolled = false;
      if (themeFab) themeFab.classList.remove("is-hidden");
    }
  }, { passive: true });
}

// ==========================================
// 12. 공휴일 & 쉬는 날 판별
// ==========================================
async function ensureHolidaysForYear(year) {
  const yearsToFetch = [year - 1, year, year + 1];
  const fetchPromises = [];

  for (const y of yearsToFetch) {
    if (!fetchedYears.has(y)) {
      fetchedYears.add(y);
      fetchPromises.push(
        fetch(`https://date.nager.at/api/v3/PublicHolidays/${y}/KR`)
          .then(res => res.json())
          .then(data => {
            data.forEach(item => {
              if (!holidayMap.has(item.date)) {
                holidayMap.set(item.date, item.localName || item.name);
              }
            });
          })
          .catch(err => {
            console.error(`${y}년 공휴일 로드 실패:`, err);
            fetchedYears.delete(y);
          })
      );
    }
  }

  if (fetchPromises.length > 0) {
    await Promise.all(fetchPromises);
  }
}

function isOffDay(dateObj) {
  const day = dateObj.getDay();
  if (day === 0 || day === 6) return true;
  const dateStr = formatDateKey(dateObj);
  if (holidayMap.has(dateStr)) return true;

  if (userLeavesMap.has(dateStr)) {
    const leave = userLeavesMap.get(dateStr);
    if (leave.type === "연차" || leave.type === "공가") {
      return true;
    }
  }
  return false;
}

function isPublicOffDay(dateObj) {
  const day = dateObj.getDay();
  if (day === 0 || day === 6) return true;
  const dateStr = formatDateKey(dateObj);
  return holidayMap.has(dateStr);
}

function getDayOffName(dateObj) {
  const dateStr = formatDateKey(dateObj);
  if (userLeavesMap.has(dateStr)) {
    const leave = userLeavesMap.get(dateStr);
    return `내 ${leave.type}`;
  }
  if (holidayMap.has(dateStr)) return holidayMap.get(dateStr);
  const day = dateObj.getDay();
  if (day === 0 || day === 6) return "주말";
  return "휴일";
}

// ==========================================
// 13. 클린 플립 카운트다운 & 휴일/출근 분기 엔진
// ==========================================
function updateTextFlip(containerId, nextValue) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const currentVal = flipState[containerId];

  if (currentVal === null) {
    flipState[containerId] = nextValue;
    container.querySelector(".flip-num.active").innerText = nextValue;
    container.querySelector(".flip-num.incoming").innerText = nextValue;
    return;
  }

  if (currentVal !== nextValue) {
    flipState[containerId] = nextValue;

    const activeEl = container.querySelector(".flip-num.active");
    const incomingEl = container.querySelector(".flip-num.incoming");

    activeEl.innerText = currentVal;
    incomingEl.innerText = nextValue;

    container.classList.remove("flipping-down");
    void container.offsetWidth;
    container.classList.add("flipping-down");

    setTimeout(() => {
      activeEl.innerText = nextValue;
      container.classList.remove("flipping-down");
    }, 420);
  }
}

function ensureCountdownUI() {
  const countdownEl = document.getElementById("countdown");
  if (!document.getElementById("flip-days")) {
    countdownEl.innerHTML = `
      <div class="countdown-unit">
        <div class="flip-text-container" id="flip-days">
          <span class="flip-num active">0</span>
          <span class="flip-num incoming">0</span>
        </div>
        <span class="label-unit">일</span>
      </div>
      <span class="countdown-separator">:</span>
      <div class="countdown-unit">
        <div class="flip-text-container" id="flip-hours">
          <span class="flip-num active">00</span>
          <span class="flip-num incoming">00</span>
        </div>
        <span class="label-unit">시간</span>
      </div>
      <span class="countdown-separator">:</span>
      <div class="countdown-unit">
        <div class="flip-text-container" id="flip-minutes">
          <span class="flip-num active">00</span>
          <span class="flip-num incoming">00</span>
        </div>
        <span class="label-unit">분</span>
      </div>
      <span class="countdown-separator">:</span>
      <div class="countdown-unit">
        <div class="flip-text-container" id="flip-seconds">
          <span class="flip-num active">00</span>
          <span class="flip-num incoming">00</span>
        </div>
        <span class="label-unit">초</span>
      </div>
    `;
    flipState["flip-days"] = null;
    flipState["flip-hours"] = null;
    flipState["flip-minutes"] = null;
    flipState["flip-seconds"] = null;
  }
}

function getNextWorkStartDate(now, startH, startM) {
  const todayWorkStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startH, startM, 0, 0);
  if (!isOffDay(now) && now < todayWorkStart) {
    return todayWorkStart;
  }
  let daysAhead = 1;
  while (true) {
    const testDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead, startH, startM, 0, 0);
    if (!isOffDay(testDate)) {
      return testDate;
    }
    daysAhead++;
  }
}

function getBreakStartDate(now, offH, offM) {
  let daysBack = 0;
  while (daysBack < 40) {
    const testDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack, offH, offM, 0, 0);
    if (!isOffDay(testDate)) {
      return testDate;
    }
    daysBack++;
  }
  return new Date(now.getTime() - 24 * 60 * 60 * 1000);
}

function updateCountdown() {
  const now = new Date();
  const timerTitleEl = document.getElementById("timer-title");
  if (!timerTitleEl) return;

  const { hours: startH, minutes: startM } = getStartWorkTime();
  const { hours: offH, minutes: offM } = getOffWorkTime();

  const isTodayOff = isOffDay(now);
  const workEndToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), offH, offM, 0, 0);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const isTomorrowOff = isOffDay(tomorrow);

  const isBreakMode = isTodayOff || (now >= workEndToday && isTomorrowOff);

  ensureCountdownUI();

  if (isBreakMode) {
    const nextWorkStart = getNextWorkStartDate(now, startH, startM);
    const diff = Math.max(0, nextWorkStart - now);

    timerTitleEl.innerText = "다음 출근까지";

    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const m = Math.floor((diff / 1000 / 60) % 60);
    const s = Math.floor((diff / 1000) % 60);

    updateTextFlip("flip-days", String(d));
    updateTextFlip("flip-hours", String(h).padStart(2, "0"));
    updateTextFlip("flip-minutes", String(m).padStart(2, "0"));
    updateTextFlip("flip-seconds", String(s).padStart(2, "0"));

    const breakStart = getBreakStartDate(now, offH, offM);
    const totalPeriod = nextWorkStart - breakStart;
    const elapsed = now - breakStart;

    let percent = totalPeriod > 0 ? Math.floor((elapsed / totalPeriod) * 100) : 100;
    percent = Math.max(0, Math.min(100, percent));

    const startLabel = document.getElementById("progress-start-label");
    const endLabel = document.getElementById("progress-end-label");
    const startStr = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;

    if (startLabel) startLabel.innerText = "휴식 시작";
    if (endLabel) endLabel.innerText = `출근 (${startStr})`;

    const progressBar = document.getElementById("progress-bar");
    const progressPercent = document.getElementById("progress-percent");
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressPercent) progressPercent.innerText = `${percent}%`;

  } else {
    let daysAhead = 1;
    let firstOffDay = null;
    let lastWorkDayBeforeOff = null;

    while (true) {
      const testDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead);
      if (isOffDay(testDate)) {
        firstOffDay = testDate;
        lastWorkDayBeforeOff = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead - 1);
        break;
      }
      daysAhead++;
    }

    const targetRestStartTime = new Date(
      lastWorkDayBeforeOff.getFullYear(),
      lastWorkDayBeforeOff.getMonth(),
      lastWorkDayBeforeOff.getDate(),
      offH,
      offM,
      0,
      0
    );

    const diff = Math.max(0, targetRestStartTime - now);
    const offName = getDayOffName(firstOffDay);
    timerTitleEl.innerText = `다음 쉬는 날(${offName})까지`;

    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const m = Math.floor((diff / 1000 / 60) % 60);
    const s = Math.floor((diff / 1000) % 60);

    updateTextFlip("flip-days", String(d));
    updateTextFlip("flip-hours", String(h).padStart(2, "0"));
    updateTextFlip("flip-minutes", String(m).padStart(2, "0"));
    updateTextFlip("flip-seconds", String(s).padStart(2, "0"));

    let blockStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startH, startM, 0, 0);
    while (!isOffDay(blockStart)) {
      blockStart.setDate(blockStart.getDate() - 1);
    }
    blockStart.setDate(blockStart.getDate() + 1);
    blockStart.setHours(startH, startM, 0, 0);

    const totalPeriod = targetRestStartTime - blockStart;
    const elapsed = now - blockStart;

    let percent = totalPeriod > 0 ? Math.floor((elapsed / totalPeriod) * 100) : 0;
    percent = Math.max(0, Math.min(100, percent));

    const startLabel = document.getElementById("progress-start-label");
    const endLabel = document.getElementById("progress-end-label");

    if (startLabel) startLabel.innerText = "업무 시작";
    if (endLabel) endLabel.innerText = "휴식 돌입";

    const progressBar = document.getElementById("progress-bar");
    const progressPercent = document.getElementById("progress-percent");
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressPercent) progressPercent.innerText = `${percent}%`;
  }
}

// ==========================================
// 14. 연차 추천 및 해외여행 추천 연산
// ==========================================
function countContiguousPublicOffDays(startDate) {
  let count = 0;
  let cur = new Date(startDate);
  while (isPublicOffDay(cur)) {
    count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function getHolidayBlockName(start, end) {
  let cur = new Date(start);
  const names = [];
  while (cur <= end) {
    const key = formatDateKey(cur);
    if (holidayMap.has(key)) {
      names.push(holidayMap.get(key));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return names.length > 0 ? names[0] : "주말";
}

function getMonthLeaveAnalysis(year, month) {
  const leaveSet = new Set();
  const candidates = [];
  const startCheck = new Date(year, month - 1, 1);
  const endCheck = new Date(year, month + 2, 0);
  
  let cur = new Date(startCheck);
  while (cur <= endCheck) {
    if (isPublicOffDay(cur)) {
      const blockStart = new Date(cur);
      let blockEnd = new Date(cur);

      while (cur <= endCheck) {
        const next = new Date(cur);
        next.setDate(cur.getDate() + 1);
        if (isPublicOffDay(next)) {
          blockEnd = next;
          cur.setDate(cur.getDate() + 1);
        } else {
          break;
        }
      }

      const blockLength = Math.round((blockEnd - blockStart) / (1000 * 60 * 60 * 24)) + 1;

      const gap1 = new Date(blockEnd);
      gap1.setDate(blockEnd.getDate() + 1);
      const gap2 = new Date(blockEnd);
      gap2.setDate(blockEnd.getDate() + 2);

      if (!isPublicOffDay(gap1) && isPublicOffDay(gap2)) {
        const nextBlockLen = countContiguousPublicOffDays(gap2);
        const totalRest = blockLength + 1 + nextBlockLen;
        const gap1Key = formatDateKey(gap1);

        if (!userLeavesMap.has(gap1Key)) {
          leaveSet.add(gap1Key);
          if (gap1.getMonth() === month && gap1.getFullYear() === year) {
            candidates.push({ leaveDate: gap1, totalRest });
          }
        }
      }

      if (blockLength >= 3) {
        const dayBefore = new Date(blockStart);
        dayBefore.setDate(blockStart.getDate() - 1);
        if (!isPublicOffDay(dayBefore)) {
          const dayBeforeKey = formatDateKey(dayBefore);
          if (!userLeavesMap.has(dayBeforeKey)) {
            leaveSet.add(dayBeforeKey);
            if (dayBefore.getMonth() === month && dayBefore.getFullYear() === year) {
              candidates.push({ leaveDate: dayBefore, totalRest: blockLength + 1 });
            }
          }
        }

        const dayAfter = new Date(blockEnd);
        dayAfter.setDate(blockEnd.getDate() + 1);
        if (!isPublicOffDay(dayAfter)) {
          const dayAfterKey = formatDateKey(dayAfter);
          if (!userLeavesMap.has(dayAfterKey)) {
            leaveSet.add(dayAfterKey);
            if (dayAfter.getMonth() === month && dayAfter.getFullYear() === year) {
              candidates.push({ leaveDate: dayAfter, totalRest: blockLength + 1 });
            }
          }
        }
      }
    }
    cur.setDate(cur.getDate() + 1);
  }

  const maxConsecutiveRest = candidates.length > 0 ? Math.max(...candidates.map(c => c.totalRest)) : 0;
  return { leaveSet, candidates, maxConsecutiveRest };
}

function calculateVacationsForBase(baseDay) {
  const scanDays = 210;
  const rawCandidates = [];

  let i = 0;
  while (i <= scanDays) {
    const checkDate = new Date(baseDay);
    checkDate.setDate(baseDay.getDate() + i);

    if (isPublicOffDay(checkDate)) {
      const blockStart = new Date(checkDate);
      let blockEnd = new Date(checkDate);

      while (i <= scanDays) {
        const nextDate = new Date(baseDay);
        nextDate.setDate(baseDay.getDate() + i + 1);
        if (isPublicOffDay(nextDate)) {
          blockEnd = nextDate;
          i++;
        } else {
          break;
        }
      }

      const blockLength = Math.round((blockEnd - blockStart) / (1000 * 60 * 60 * 24)) + 1;
      const holidayName = getHolidayBlockName(blockStart, blockEnd);

      const gap1 = new Date(blockEnd);
      gap1.setDate(blockEnd.getDate() + 1);
      const gap2 = new Date(blockEnd);
      gap2.setDate(blockEnd.getDate() + 2);

      if (!isPublicOffDay(gap1) && isPublicOffDay(gap2)) {
        const nextBlockLen = countContiguousPublicOffDays(gap2);
        const totalRest = blockLength + 1 + nextBlockLen;
        const finalEndDate = new Date(gap2);
        finalEndDate.setDate(finalEndDate.getDate() + nextBlockLen - 1);
        const gap1Key = formatDateKey(gap1);

        if (!userLeavesMap.has(gap1Key)) {
          rawCandidates.push({
            leaveDate: gap1,
            title: `징검다리 연휴 (${holidayName} 연계)`,
            leave: `${formatDateMD(gap1)} 연차 1일`,
            benefit: `총 ${totalRest}일 연속 휴식 (${formatDateMD(blockStart)} ~ ${formatDateMD(finalEndDate)})`,
            badge: `연차 1일 = ${totalRest}일 휴식`,
            totalRest,
            startDate: blockStart,
            endDate: finalEndDate
          });
        }
      }

      if (blockLength >= 3) {
        const dayBefore = new Date(blockStart);
        dayBefore.setDate(blockStart.getDate() - 1);
        if (!isPublicOffDay(dayBefore)) {
          const dayBeforeKey = formatDateKey(dayBefore);
          if (!userLeavesMap.has(dayBeforeKey)) {
            rawCandidates.push({
              leaveDate: dayBefore,
              title: `${holidayName} 앞당김 연차`,
              leave: `${formatDateMD(dayBefore)} 연차 1일`,
              benefit: `총 ${blockLength + 1}일 연속 휴식 (${formatDateMD(dayBefore)} ~ ${formatDateMD(blockEnd)})`,
              badge: `연차 1일 = ${blockLength + 1}일 휴식`,
              totalRest: blockLength + 1,
              startDate: dayBefore,
              endDate: blockEnd
            });
          }
        }

        const dayAfter = new Date(blockEnd);
        dayAfter.setDate(blockEnd.getDate() + 1);
        if (!isPublicOffDay(dayAfter)) {
          const dayAfterKey = formatDateKey(dayAfter);
          if (!userLeavesMap.has(dayAfterKey)) {
            rawCandidates.push({
              leaveDate: dayAfter,
              title: `${holidayName} 연장 연차`,
              leave: `${formatDateMD(dayAfter)} 연차 1일`,
              benefit: `총 ${blockLength + 1}일 연속 휴식 (${formatDateMD(blockStart)} ~ ${formatDateMD(dayAfter)})`,
              badge: `연차 1일 = ${blockLength + 1}일 휴식`,
              totalRest: blockLength + 1,
              startDate: blockStart,
              endDate: dayAfter
            });
          }
        }
      }
    }
    i++;
  }

  const uniqueMap = new Map();
  rawCandidates.forEach(cand => {
    const key = formatDateKey(cand.leaveDate);
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, cand);
    }
  });

  return Array.from(uniqueMap.values())
    .sort((a, b) => a.leaveDate - b.leaveDate);
}

function getTravelDestinations(totalDays) {
  if (totalDays >= 7) {
    return {
      type: "장거리 / 미주 & 유럽 & 대양주",
      chips: ["🇫🇷 파리/서유럽", "🇭🇺 동유럽", "🇺🇸 하와이/미국", "🇦🇺 시드니"],
      tip: "7일 이상 연속 휴식 가능! 연차 2~3일을 더 붙여 장거리 여행을 다녀오기 완벽한 시기입니다."
    };
  } else if (totalDays >= 5) {
    return {
      type: "중거리 / 동남아 & 휴양지",
      chips: ["🇹🇭 방콕", "🇻🇳 다낭/나트랑", "🇮🇩 발리", "🇬🇺 괌/사이판"],
      tip: "5~6일 황금 휴식 구간! 넉넉한 일정으로 에메랄드빛 해변 휴양을 즐기세요."
    };
  } else {
    return {
      type: "단거리 / 힐링 & 미식 여행",
      chips: ["🇯🇵 도쿄/오사카/후쿠오카", "🇹🇼 타이베이", "🇭🇰 홍콩", "🇯🇵 삿포로"],
      tip: "3~4일 콤팩트 일정! 비행시간 3시간 이내 단거리 여행지로 리프레시하기 좋습니다."
    };
  }
}

function renderTravelWidget(baseDate, containerId = "main-travel-recommendations", descId = null) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (descId) {
    const descEl = document.getElementById(descId);
    if (descEl) descEl.innerText = `${baseDate.getFullYear()}년 ${baseDate.getMonth() + 1}월 이후 최적의 여행 루트`;
  }

  const vacations = calculateVacationsForBase(baseDate);
  const travelPicks = vacations.filter(v => v.totalRest >= 4).slice(0, 3);

  if (travelPicks.length === 0) {
    container.innerHTML = `
      <div class="travel-card-item">
        <div class="travel-item-header">
          <span class="travel-period-tag">해당 시점 이후 4일 이상 연휴가 없습니다.</span>
        </div>
        <p class="travel-tip-text">다른 달로 이동하여 일정을 탐색해보세요.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = travelPicks.map(pick => {
    const dest = getTravelDestinations(pick.totalRest);
    const dateRangeStr = `${formatDateMD(pick.startDate)} ~ ${formatDateMD(pick.endDate)}`;
    return `
      <div class="travel-card-item">
        <div class="travel-item-header">
          <div class="travel-title-wrap">
            <div class="travel-period-tag">
              <span class="material-symbols-outlined" style="font-size: 16px;">flight_takeoff</span>
              <strong>${pick.startDate.getFullYear()}년 ${pick.startDate.getMonth() + 1}월 황금루트</strong>
            </div>
            <div class="travel-badge-days">총 ${pick.totalRest}일 휴식 (${pick.leave})</div>
          </div>
        </div>
        <div class="travel-destinations-row">
          ${dest.chips.map(chip => `<span class="dest-chip">${chip}</span>`).join("")}
        </div>
        <p class="travel-tip-text">${dest.tip} (${dateRangeStr})</p>
      </div>
    `;
  }).join("");
}

// ==========================================
// 15. 캘린더 그리드 DOM 생성
// ==========================================
function createCalendarGridFragment(year, month, isLeaveRegisterMode = false) {
  const firstDayIndex = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const prevMonthLastDate = new Date(year, month, 0).getDate();

  const todayKey = formatDateKey(new Date());
  const { leaveSet } = getMonthLeaveAnalysis(year, month);

  const fragment = document.createDocumentFragment();

  const createCell = (cellDate, isOtherMonth) => {
    const dateKey = formatDateKey(cellDate);
    const dayOfWeek = cellDate.getDay();

    const cell = document.createElement("div");
    cell.className = "cal-cell";
    if (isOtherMonth) cell.classList.add("other-month");
    if (dayOfWeek === 0) cell.classList.add("sunday");
    if (dayOfWeek === 6) cell.classList.add("saturday");

    const isHoliday = holidayMap.has(dateKey);
    const isLeave = leaveSet.has(dateKey);
    const isToday = dateKey === todayKey;
    const isMyLeave = userLeavesMap.has(dateKey);

    if (isMyLeave) cell.classList.add("my-leave");
    else if (isHoliday) cell.classList.add("holiday");
    else if (isLeave) cell.classList.add("leave-rec");
    
    if (isToday) cell.classList.add("today");

    let subText = "";
    if (isMyLeave) {
      subText = userLeavesMap.get(dateKey).type || "연차";
    } else if (isHoliday) {
      subText = holidayMap.get(dateKey);
    } else if (isLeave) {
      subText = "연차 추천";
    }

    let weatherHtml = "";
    if (dateKey >= todayKey && weatherMap.has(dateKey)) {
      const w = weatherMap.get(dateKey);
      weatherHtml = `
        <div class="cal-weather-badge" title="${w.name} (최저 ${w.minTemp}° / 최고 ${w.maxTemp}°)">
          <span class="cal-weather-icon">${w.icon}</span>
          <span class="cal-temp">${w.maxTemp}°</span>
        </div>
      `;
    }

    cell.innerHTML = `
      <div class="cal-cell-top">
        <span class="cal-date-num">${cellDate.getDate()}</span>
        ${weatherHtml}
      </div>
      <span class="cal-sub-label">
        <span class="cal-sub-text">${subText}</span>
      </span>
    `;

    cell.addEventListener("click", () => {
      closeProfilePopup();
      if (isLeaveRegisterMode) {
        openLeaveRegisterModal(cellDate, dateKey);
      } else {
        openCalendarDetailModal(cellDate, dateKey, isHoliday, isLeave, isToday, subText);
      }
    });

    return cell;
  };

  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const prevDateNum = prevMonthLastDate - i;
    const prevCellDate = new Date(year, month - 1, prevDateNum);
    fragment.appendChild(createCell(prevCellDate, true));
  }

  for (let d = 1; d <= lastDate; d++) {
    const cellDate = new Date(year, month, d);
    fragment.appendChild(createCell(cellDate, false));
  }

  const totalRendered = firstDayIndex + lastDate;
  const nextDaysNeeded = totalRendered % 7 === 0 ? 0 : 7 - (totalRendered % 7);

  for (let d = 1; d <= nextDaysNeeded; d++) {
    const nextCellDate = new Date(year, month + 1, d);
    fragment.appendChild(createCell(nextCellDate, true));
  }

  return fragment;
}

// ==========================================
// 16. 메인 화면 렌더링
// ==========================================
async function renderMainRealtimeSpace() {
  await Promise.all([
    ensureHolidaysForYear(currentRealYear),
    ensureWeatherForecast()
  ]);

  safeSetInnerText("main-cal-month-year", `${currentRealYear}년 ${currentRealMonth + 1}월`);
  const container = document.getElementById("main-calendar-days");
  if (container) {
    container.innerHTML = "";
    container.appendChild(createCalendarGridFragment(currentRealYear, currentRealMonth));
  }

  const lastDate = new Date(currentRealYear, currentRealMonth + 1, 0).getDate();
  let saturdays = 0, sundays = 0, weekdayHolidays = 0;

  for (let d = 1; d <= lastDate; d++) {
    const dateObj = new Date(currentRealYear, currentRealMonth, d);
    const dayOfWeek = dateObj.getDay();
    const dateKey = formatDateKey(dateObj);

    if (dayOfWeek === 6) saturdays++;
    else if (dayOfWeek === 0) sundays++;
    else if (holidayMap.has(dateKey) || (userLeavesMap.has(dateKey) && userLeavesMap.get(dateKey).type === "연차")) {
      weekdayHolidays++;
    }
  }

  const weekendTotal = saturdays + sundays;
  const totalDaysOff = weekendTotal + weekdayHolidays;
  const workDays = lastDate - totalDaysOff;
  const workPercent = Math.round((workDays / lastDate) * 100);

  safeSetInnerText("main-stats-title", `${currentRealYear}년 ${currentRealMonth + 1}월 휴일 현황`);
  safeSetInnerText("main-stat-total-days", `${totalDaysOff}일`);
  safeSetInnerText("main-stat-weekend-days", `${weekendTotal}일`);
  safeSetInnerText("main-stat-weekend-detail", `토 ${saturdays}일 / 일 ${sundays}일`);
  safeSetInnerText("main-stat-holiday-days", `${weekdayHolidays}일`);
  safeSetInnerText("main-stat-work-days", `${workDays}일`);
  safeSetInnerText("main-stat-work-percent", `근무 비율 ${workPercent}%`);

  const { maxConsecutiveRest, candidates } = getMonthLeaveAnalysis(currentRealYear, currentRealMonth);
  const headlineEl = document.getElementById("main-insight-headline");
  const descEl = document.getElementById("main-insight-desc");
  const iconEl = document.getElementById("main-insight-icon");
  safeSetInnerText("main-insight-title", `${currentRealYear}년 ${currentRealMonth + 1}월 휴일 브리핑`);

  if (weekdayHolidays >= 3) {
    if (headlineEl) headlineEl.innerText = "공휴일 및 연차가 풍성한 황금 달";
    if (descEl) descEl.innerText = `평일 휴일/연차가 ${weekdayHolidays}일 포함되어 있습니다. 주말과 연계되어 장기 휴식을 갖기에 매우 유리합니다.`;
    if (iconEl) iconEl.innerText = "celebration";
  } else if (weekdayHolidays >= 1) {
    if (candidates.length > 0 && maxConsecutiveRest > 0) {
      if (headlineEl) headlineEl.innerText = "징검다리 휴일 연계 가능";
      if (descEl) descEl.innerText = `평일 휴일(${weekdayHolidays}일)과 주말 사이 징검다리 평일에 연차 1일을 활용하면 최장 ${maxConsecutiveRest}일 연속 휴식이 가능합니다.`;
      if (iconEl) iconEl.innerText = "flight_takeoff";
    } else {
      if (headlineEl) headlineEl.innerText = "주중 공휴일/연차 포함";
      if (descEl) descEl.innerText = `평일 쉬는 날이 ${weekdayHolidays}일 있어 주중에 숨을 돌릴 수 있는 달입니다.`;
      if (iconEl) iconEl.innerText = "spa";
    }
  } else {
    if (headlineEl) headlineEl.innerText = "평일 공휴일이 없는 달";
    if (descEl) descEl.innerText = `이번 달은 평일 공식 공휴일이 없습니다. 주말 위주로 컨디션을 관리하거나 필요 시 개인 연차 사용을 고려해보세요.`;
    if (iconEl) iconEl.innerText = "battery_alert";
  }

  const today = new Date();
  const holListEl = document.getElementById("main-holiday-list");
  const baseDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const holidays = Array.from(holidayMap.entries()).map(([dateStr, name]) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const holidayDate = new Date(y, m - 1, d);
    const diffDays = Math.ceil((holidayDate - baseDay) / (1000 * 60 * 60 * 24));
    return { name, dateStr, effectiveDate: holidayDate, diffDays };
  });

  const upcoming = holidays.filter(h => h.diffDays >= 0).sort((a, b) => a.diffDays - b.diffDays).slice(0, 5);
  if (holListEl) {
    if (upcoming.length === 0) {
      holListEl.innerHTML = "<li class='md-list-item'>예정된 공휴일 일정이 없습니다.</li>";
    } else {
      holListEl.innerHTML = upcoming.map(h => {
        const formattedDate = `${h.effectiveDate.getFullYear()}년 ${h.effectiveDate.getMonth() + 1}월 ${h.effectiveDate.getDate()}일`;
        const dayName = ['일', '월', '화', '수', '목', '금', '토'][h.effectiveDate.getDay()];
        const dDayText = h.diffDays === 0 ? "오늘 (D-Day)" : `D-${h.diffDays}`;
        return `
          <li class="md-list-item">
            <div>
              <strong style="font-size: 0.9375rem;">${h.name}</strong>
              <span style="color: var(--md-sys-color-outline); font-size: 0.8125rem; margin-left: 8px;">${formattedDate} (${dayName})</span>
            </div>
            <span class="holiday-dday">${dDayText}</span>
          </li>
        `;
      }).join("");
    }
  }

  const mainRecs = calculateVacationsForBase(today).slice(0, 4);
  const vacListEl = document.getElementById("main-vacation-recommendations");

  if (vacListEl) {
    if (mainRecs.length === 0) {
      vacListEl.innerHTML = `<div class="recommendation-item"><div class="item-content"><h3>추천 가능한 연차 일정이 없습니다.</h3><p>상단 메뉴에서 미래 연차를 탐색해보세요.</p></div></div>`;
    } else {
      vacListEl.innerHTML = mainRecs.map(rec => `
        <div class="recommendation-item">
          <div class="item-content">
            <h3>${rec.title}</h3>
            <p>권장: <strong>${rec.leave}</strong></p>
            <p style="font-size: 0.75rem; margin-top: 2px;">${rec.benefit}</p>
          </div>
          <div class="badge-benefit">${rec.badge}</div>
        </div>
      `).join("");
    }
  }

  renderTravelWidget(today, "main-travel-recommendations");
  checkAndApplyMarquees();
}

// ==========================================
// 17. 미래 연차 시뮬레이터 렌더링
// ==========================================
async function renderSimulatedSpace(direction = "none") {
  await ensureHolidaysForYear(simViewYear);

  const dateTitleText = `${simViewYear}년 ${simViewMonth + 1}월`;
  safeSetInnerText("sim-cal-month-year", dateTitleText);
  safeSetInnerText("sim-bottom-month-year", dateTitleText);

  const isCurrentMonthView = (simViewYear === currentRealYear && simViewMonth === currentRealMonth);
  
  const bottomTodayBtn = document.getElementById("sim-bottom-btn-today");
  if (bottomTodayBtn) bottomTodayBtn.classList.toggle("is-hidden", isCurrentMonthView);

  const viewport = document.getElementById("sim-calendar-viewport");
  if (viewport) {
    const activeLayer = viewport.querySelector(".calendar-grid-layer.active-layer") || 
                        document.getElementById("sim-calendar-days-active");

    const newFragment = createCalendarGridFragment(simViewYear, simViewMonth);

    if (direction === "none" || !activeLayer) {
      if (activeLayer) {
        activeLayer.innerHTML = "";
        activeLayer.appendChild(newFragment);
      }
    } else if (!isSimCalendarSliding) {
      isSimCalendarSliding = true;
      const newLayer = document.createElement("div");
      newLayer.className = "calendar-grid-layer";
      newLayer.appendChild(newFragment);
      viewport.appendChild(newLayer);

      if (direction === "next") {
        activeLayer.className = "calendar-grid-layer slide-up-exit";
        newLayer.className = "calendar-grid-layer slide-up-enter";
      } else if (direction === "prev") {
        activeLayer.className = "calendar-grid-layer slide-down-exit";
        newLayer.className = "calendar-grid-layer slide-down-enter";
      }

      setTimeout(() => {
        activeLayer.remove();
        newLayer.className = "calendar-grid-layer active-layer";
        isSimCalendarSliding = false;
        checkAndApplyMarquees();
      }, 330);
    }
  }

  const lastDate = new Date(simViewYear, simViewMonth + 1, 0).getDate();
  let saturdays = 0, sundays = 0, weekdayHolidays = 0;

  for (let d = 1; d <= lastDate; d++) {
    const dateObj = new Date(simViewYear, simViewMonth, d);
    const dayOfWeek = dateObj.getDay();
    const dateKey = formatDateKey(dateObj);

    if (dayOfWeek === 6) saturdays++;
    else if (dayOfWeek === 0) sundays++;
    else if (holidayMap.has(dateKey) || (userLeavesMap.has(dateKey) && userLeavesMap.get(dateKey).type === "연차")) {
      weekdayHolidays++;
    }
  }

  const weekendTotal = saturdays + sundays;
  const totalDaysOff = weekendTotal + weekdayHolidays;
  const workDays = lastDate - totalDaysOff;
  const workPercent = Math.round((workDays / lastDate) * 100);

  safeSetInnerText("sim-stats-title", `${simViewYear}년 ${simViewMonth + 1}월 휴일 현황`);
  safeSetInnerText("sim-stat-total-days", `${totalDaysOff}일`);
  safeSetInnerText("sim-stat-weekend-days", `${weekendTotal}일`);
  safeSetInnerText("sim-stat-weekend-detail", `토 ${saturdays}일 / 일 ${sundays}일`);
  safeSetInnerText("sim-stat-holiday-days", `${weekdayHolidays}일`);
  safeSetInnerText("sim-stat-work-days", `${workDays}일`);
  safeSetInnerText("sim-stat-work-percent", `근무 비율 ${workPercent}%`);

  const { maxConsecutiveRest, candidates } = getMonthLeaveAnalysis(simViewYear, simViewMonth);
  const headlineEl = document.getElementById("sim-insight-headline");
  const descEl = document.getElementById("sim-insight-desc");
  const iconEl = document.getElementById("sim-insight-icon");
  safeSetInnerText("sim-insight-title", `${simViewYear}년 ${simViewMonth + 1}월 휴일 브리핑`);

  if (weekdayHolidays >= 3) {
    if (headlineEl) headlineEl.innerText = "공휴일 및 연차가 풍성한 황금 달";
    if (descEl) descEl.innerText = `평일 휴일/연차가 ${weekdayHolidays}일 포함되어 있습니다. 장기 휴식을 계획하기에 아주 좋습니다.`;
    if (iconEl) iconEl.innerText = "celebration";
  } else if (weekdayHolidays >= 1) {
    if (candidates.length > 0 && maxConsecutiveRest > 0) {
      if (headlineEl) headlineEl.innerText = "징검다리 휴일 연계 가능";
      if (descEl) descEl.innerText = `평일 휴일(${weekdayHolidays}일)과 주말 사이 징검다리 평일에 연차 1일을 활용하면 최장 ${maxConsecutiveRest}일 연속 휴식이 가능합니다.`;
      if (iconEl) iconEl.innerText = "flight_takeoff";
    } else {
      if (headlineEl) headlineEl.innerText = "주중 공휴일/연차 포함";
      if (descEl) descEl.innerText = `평일 쉬는 날이 ${weekdayHolidays}일 있어 주중에 하루 쉴 수 있습니다.`;
      if (iconEl) iconEl.innerText = "spa";
    }
  } else {
    if (headlineEl) headlineEl.innerText = "평일 공휴일이 없는 달";
    if (descEl) descEl.innerText = `해당 월은 평일 공식 공휴일이 없습니다. 연속 휴식이 필요하다면 개인 연차 일정을 사전에 계획해보세요.`;
    if (iconEl) iconEl.innerText = "battery_alert";
  }

  const simBaseDate = new Date(simViewYear, simViewMonth, 1);
  const simHolListEl = document.getElementById("sim-holiday-list");
  safeSetInnerText("sim-holiday-desc", `${simViewYear}년 ${simViewMonth + 1}월 이후 예정된 휴일`);
  
  const holidays = Array.from(holidayMap.entries()).map(([dateStr, name]) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const holidayDate = new Date(y, m - 1, d);
    const diffDays = Math.ceil((holidayDate - simBaseDate) / (1000 * 60 * 60 * 24));
    return { name, dateStr, effectiveDate: holidayDate, diffDays };
  });

  const upcoming = holidays.filter(h => h.diffDays >= 0).sort((a, b) => a.diffDays - b.diffDays).slice(0, 5);
  if (simHolListEl) {
    if (upcoming.length === 0) {
      simHolListEl.innerHTML = "<li class='md-list-item'>예정된 공휴일 일정이 없습니다.</li>";
    } else {
      simHolListEl.innerHTML = upcoming.map(h => {
        const formattedDate = `${h.effectiveDate.getFullYear()}년 ${h.effectiveDate.getMonth() + 1}월 ${h.effectiveDate.getDate()}일`;
        const dayName = ['일', '월', '화', '수', '목', '금', '토'][h.effectiveDate.getDay()];
        return `
          <li class="md-list-item">
            <div>
              <strong style="font-size: 0.9375rem;">${h.name}</strong>
              <span style="color: var(--md-sys-color-outline); font-size: 0.8125rem; margin-left: 8px;">${formattedDate} (${dayName})</span>
            </div>
            <span class="holiday-dday">${simViewYear === currentRealYear && simViewMonth === currentRealMonth ? (h.diffDays === 0 ? "D-Day" : `D-${h.diffDays}`) : `${h.effectiveDate.getMonth() + 1}월`}</span>
          </li>
        `;
      }).join("");
    }
  }

  const simRecs = calculateVacationsForBase(simBaseDate).slice(0, 4);
  const simVacListEl = document.getElementById("sim-vacation-recommendations");
  safeSetInnerText("sim-vacation-desc", `${simViewYear}년 ${simViewMonth + 1}월부터 6개월간의 황금 루트`);

  if (simVacListEl) {
    if (simRecs.length === 0) {
      simVacListEl.innerHTML = `<div class="recommendation-item"><div class="item-content"><h3>추천 가능한 연차 일정이 없습니다.</h3><p>다른 달로 이동하여 일정을 탐색해보세요.</p></div></div>`;
    } else {
      simVacListEl.innerHTML = simRecs.map(rec => `
        <div class="recommendation-item">
          <div class="item-content">
            <h3>${rec.title}</h3>
            <p>권장: <strong>${rec.leave}</strong></p>
            <p style="font-size: 0.75rem; margin-top: 2px;">${rec.benefit}</p>
          </div>
          <div class="badge-benefit">${rec.badge}</div>
        </div>
      `).join("");
    }
  }

  renderTravelWidget(simBaseDate, "sim-travel-recommendations", "sim-travel-desc");
  checkAndApplyMarquees();
}

function setupSimCalendarControls() {
  const handlePrev = async () => {
    if (isSimCalendarSliding) return;
    simViewMonth--;
    if (simViewMonth < 0) {
      simViewMonth = 11;
      simViewYear--;
    }
    await renderSimulatedSpace("prev");
  };

  const handleNext = async () => {
    if (isSimCalendarSliding) return;
    simViewMonth++;
    if (simViewMonth > 11) {
      simViewMonth = 0;
      simViewYear++;
    }
    await renderSimulatedSpace("next");
  };

  const handleToday = async () => {
    if (isSimCalendarSliding) return;
    const isMovingForward = (currentRealYear > simViewYear) || 
      (currentRealYear === simViewYear && currentRealMonth > simViewMonth);
    
    simViewYear = currentRealYear;
    simViewMonth = currentRealMonth;
    await renderSimulatedSpace(isMovingForward ? "next" : "prev");
  };

  const prevBtn = document.getElementById("sim-bottom-prev");
  const nextBtn = document.getElementById("sim-bottom-next");
  const todayBtn = document.getElementById("sim-bottom-btn-today");

  if (prevBtn) prevBtn.addEventListener("click", handlePrev);
  if (nextBtn) nextBtn.addEventListener("click", handleNext);
  if (todayBtn) todayBtn.addEventListener("click", handleToday);
}

// ==========================================
// 18. 점심 메뉴 추천 엔진
// ==========================================
const lunchDatabase = [
  // 1. 한식 (Korean)
  { name: "든든한 돼지국밥 / 순대국", cat: "korean", icon: "🍲", desc: "뜨끈하고 깊은 국물로 오후 에너지를 풀충전하세요!" },
  { name: "얼큰 김치찌개 & 계란말이", cat: "korean", icon: "🥘", desc: "한국인의 소울푸드! 밥 두 공기 순삭 보장 조합입니다." },
  { name: "직화 제육볶음 쌈밥", cat: "korean", icon: "🥩", desc: "불맛 가득한 제육에 신선한 쌈채소로 활력 충전!" },
  { name: "차돌 된장찌개 & 비빔밥", cat: "korean", icon: "🍲", desc: "구수한 된장찌개와 나물 비빔밥의 완벽한 밸런스." },
  { name: "진한국물 뼈해장국 / 감자탕", cat: "korean", icon: "🍖", desc: "우거지와 두툼한 살코기로 속을 든든하게 채우세요." },
  { name: "맑은 나주곰탕 / 설렁탕", cat: "korean", icon: "🥣", desc: "깔끔하고 담백한 고기 국물로 편안하고 든든한 점심." },
  { name: "뚝배기 불고기 (뚝불)", cat: "korean", icon: "🍲", desc: "달콤짭조름한 양념과 당면이 매력적인 직장인 인기 픽." },
  { name: "노릇노릇 생선구이 백반", cat: "korean", icon: "🐟", desc: "집밥이 그리울 때 바삭하게 구운 고등어/삼치 한 상!" },
  { name: "매콤달콤 닭볶음탕", cat: "korean", icon: "🍗", desc: "동료들과 푸짐하게 국물에 밥 비벼 먹기 좋은 메뉴." },
  { name: "보쌈 정식", cat: "korean", icon: "🥬", desc: "야들야들한 수육과 갓 담근 보쌈김치의 환상 케미." },
  { name: "얼큰 소고기 육개장", cat: "korean", icon: "🍲", desc: "고사리와 소고기가 듬뿍 들어간 칼칼하고 진한 보양 국물!" },
  { name: "보글보글 햄가득 부대찌개", cat: "korean", icon: "🥘", desc: "라면 사리 퐁당! 동료들과 함께 끓여먹는 직장인 최애 픽." },
  { name: "바글바글 해물 순두부찌개", cat: "korean", icon: "🍲", desc: "부드러운 순두부와 매콤 칼칼한 해물 육수의 조화." },
  { name: "지글지글 돌솥 비빔밥", cat: "🍚", desc: "눌어붙은 누룽지까지 고소하게 긁어먹는 든든한 한 그릇." },
  { name: "진한 한우 갈비탕", cat: "korean", icon: "🍖", desc: "당면과 큼직한 갈빗대가 푸짐하게 들어간 기력 충전 한 그릇." },
  { name: "우렁 강된장 쌈밥정식", cat: "korean", icon: "🥬", desc: "쫄깃한 우렁이와 짭조름한 강된장의 건강하고 맛있는 조합." },
  { name: "매콤 춘천식 철판 닭갈비", cat: "korean", icon: "🍗", desc: "떡과 고구마, 양배추와 함께 볶아먹고 마지막엔 볶음밥 필수!" },
  { name: "시원한 황태 콩나물 해장국", cat: "korean", icon: "🥣", desc: "담백하고 개운해서 속이 싹 풀리는 힐링 국밥." },
  { name: "향긋한 곤드레밥 정식", cat: "korean", icon: "🍚", desc: "달래양념장 쓱쓱 비벼 건강하고 담백하게 즐기는 한 끼." },

  // 2. 중식 (Chinese)
  { name: "짜장면 & 바삭 탕수육", cat: "chinese", icon: "🥢", desc: "기름진 탄수화물이 당기는 날엔 국민 중식이 진리!" },
  { name: "얼큰 해물 짬뽕 / 짬뽕밥", cat: "chinese", icon: "🍜", desc: "칼칼한 불맛 국물로 오전의 스트레스를 날려보세요." },
  { name: "얼얼한 마라탕 & 꿔바로우", cat: "chinese", icon: "🍲", desc: "취향대로 담아 즐기는 중독성 100% 매콤 얼얼한 맛!" },
  { name: "중화풍 마파두부 덮밥", cat: "chinese", icon: "🍛", desc: "부드러운 두부와 매콤한 소스의 밥도둑 덮밥." },
  { name: "고슬고슬 게살 볶음밥", cat: "chinese", icon: "🍚", desc: "짜장 소스와 짬뽕 국물을 곁들여 알차게 즐기세요." },
  { name: "홍콩식 딤섬 & 우육면", cat: "chinese", icon: "🥟", desc: "육즙 가득 샤오롱바오와 진한 소고기 국수의 조화." },
  { name: "바삭상큼 유린기", cat: "chinese", icon: "🍗", desc: "바삭한 닭튀김에 새콤매콤한 간장 소스와 청양고추 토핑!" },
  { name: "불맛 잡채밥 & 계란국", cat: "chinese", icon: "🍛", desc: "탱글한 당면과 불맛 채소를 짜장 소스에 비벼먹는 든든함." },
  { name: "매콤달콤 깐풍기 정식", cat: "chinese", icon: "🍗", desc: "바삭하게 튀겨 매콤달콤한 소스에 볶아낸 감칠맛 폭발 메뉴." },
  { name: "고소하고 얼큰한 탄탄면", cat: "chinese", icon: "🍜", desc: "땅콩 소스의 고소함과 고추기름의 칼칼함이 어우러진 별미." },
  { name: "달콤 짭조름 어향가지 덮밥", cat: "chinese", icon: "🍆", desc: "겉바속촉 튀긴 가지와 특제 어향소스의 놀라운 밥도둑 케미." },
  { name: "불향 가득 볶음짬뽕", cat: "chinese", icon: "🥢", desc: "국물 없이 진하게 졸여낸 해물과 야채의 자작한 불맛." },

  // 3. 일식 (Japanese)
  { name: "겉바속촉 등심/안심 돈카츠", cat: "japanese", icon: "🍱", desc: "두툼한 고기와 바삭한 튀김옷! 실패 없는 점심 치트키." },
  { name: "신선한 초밥 세트 (모둠스시)", cat: "japanese", icon: "🍣", desc: "깔끔하고 정갈하게 먹고 속 편하게 일하고 싶을 때." },
  { name: "생연어 덮밥 (사케동)", cat: "japanese", icon: "🐟", desc: "고소한 생연어와 와사비의 부드럽고 산뜻한 조화." },
  { name: "진한 돈코츠 라멘 & 교자", cat: "japanese", icon: "🍜", desc: "차슈와 반숙란이 올라간 진하고 구수한 일본 라멘." },
  { name: "바삭바삭 모둠 텐동", cat: "japanese", icon: "🍤", desc: "온천계란을 톡 터뜨려 비벼먹는 튀김 덮밥의 매력!" },
  { name: "소고기 규동 / 가츠동", cat: "japanese", icon: "🍛", desc: "간편하고 빠르게 한 그릇 뚝딱 비우기 좋은 덮밥." },
  { name: "매콤 고소 마제소바", cat: "japanese", icon: "🍜", desc: "다진 고기와 노른자를 쓱쓱 비벼먹고 밥까지 비벼먹는 맛!" },
  { name: "진한 일본식 카레우동", cat: "japanese", icon: "🍛", desc: "진하고 꾸덕한 카레 국물에 쫄깃한 우동 면발의 만남." },
  { name: "해산물 가득 카이센동", cat: "japanese", icon: "🍣", desc: "참치, 연어, 단새우 등 신선한 해산물이 듬뿍 올라간 특식." },
  { name: "시원한 냉모밀 & 유부초밥", cat: "japanese", icon: "🥢", desc: "살얼음 동동 띄운 쯔유에 살짝 담가 먹는 시원한 점심." },
  { name: "달콤짭짤 스키야키 정식", cat: "japanese", icon: "🍲", desc: "얇게 썬 소고기와 야채를 달걀노른자에 콕 찍어먹는 행복." },
  { name: "숯불향 야키토리동", cat: "japanese", icon: "🍗", desc: "달콤짭조름한 타레 소스에 구운 닭꼬치를 얹은 덮밥." },
  { name: "칼칼하고 뽀얀 나가사키 라멘", cat: "japanese", icon: "🍜", desc: "해산물과 숙주가 듬뿍 들어가 시원하고 담백한 백짬뽕 라멘." },

  // 4. 양식 (Western)
  { name: "수제버거 & 감자튀김 세트", cat: "western", icon: "🍔", desc: "육즙 팡팡 터지는 패티와 시원한 탄산으로 기분 전환!" },
  { name: "매콤 투움바 / 크림 파스타", cat: "western", icon: "🍝", desc: "꾸덕하고 진한 크림 소스로 기분 내고 싶은 점심시간." },
  { name: "화덕 마르게리따 피자", cat: "western", icon: "🍕", desc: "치즈가 쭉 늘어나는 갓 구운 화덕 피자 한 조각!" },
  { name: "깔끔한 알리오 올리오 파스타", cat: "western", icon: "🧄", desc: "마늘과 올리브오일의 풍미 가득한 담백한 선택." },
  { name: "포슬포슬 회오리 오므라이스", cat: "western", icon: "🍳", desc: "부드러운 달걀 이불을 덮은 달콤한 데미그라스 오므라이스." },
  { name: "경양식 왕돈까스 & 크림스프", cat: "western", icon: "🍽️", desc: "후추 톡톡 뿌린 스프와 추억의 달콤한 소스를 얹은 왕돈까스." },
  { name: "겹겹이 진한 미트 라자냐", cat: "western", icon: "🧀", desc: "볼로네제 소스와 고소한 치즈가 층층이 녹아든 깊은 풍미." },
  { name: "향긋한 바질페스토 파스타", cat: "western", icon: "🌿", desc: "신선한 바질 향과 올리브유, 견과류의 건강하고 세련된 맛." },
  { name: "두툼한 수제 함박스테이크", cat: "western", icon: "🥩", desc: "육즙 가득 패티 위에 반숙 달걀 후라이를 톡 터뜨려 즐기세요." },
  { name: "고소한 트러플 버섯 리조또", cat: "western", icon: "🍚", desc: "은은한 트러플 오일 향과 크림의 부드러움이 일품인 리조또." },
  { name: "수란 톡 터뜨리는 에그 베네딕트", cat: "western", icon: "🥪", desc: "잉글리시 머핀 위에 훈제연어와 홀랜다이즈 소스를 얹은 브런치." },

  // 5. 아시안 & 이색 (Asian & Ethnic)
  { name: "양지 쌀국수 (포) & 스프링롤", cat: "asian", icon: "🍜", desc: "맑고 개운한 육수로 속이 편안해지는 베트남의 맛." },
  { name: "새우 팟타이 & 나시고랭", cat: "asian", icon: "🍤", desc: "달콤 짭조름한 볶음면과 고소한 볶음밥의 동남아 여행 기분!" },
  { name: "인도 커리 & 갓 구운 난", cat: "asian", icon: "🍛", desc: "향긋한 버터치킨 커리에 쫄깃한 난을 푹 찍어드세요." },
  { name: "분짜 (느억맘 숯불고기 국수)", cat: "asian", icon: "🥗", desc: "새콤달콤한 소스에 신선한 야채와 고기를 적셔먹는 별미." },
  { name: "바삭 든든 베트남 반미 샌드위치", cat: "asian", icon: "🥖", desc: "겉바속촉 쌀바게트에 고기, 채소, 매콤한 스리라차 소스의 조화." },
  { name: "얼큰 칼칼 똠얌꿍 쌀국수", cat: "asian", icon: "🍲", desc: "새콤 매콤 달콤한 태국 전통 똠얌 육수에 새우가 퐁당!" },
  { name: "부드럽고 달콤한 푸팟퐁커리", cat: "asian", icon: "🦀", desc: "바삭한 소프트쉘 크랩과 계란, 옐로우 커리의 환상적 조화." },
  { name: "달콤 짭조름 태국식 족발덮밥 (카오카무)", cat: "asian", icon: "🍖", desc: "푹 삶아 야들야들한 족발 조림을 밥 위에 얹어먹는 이색 별미." },
  { name: "싱가포르식 칠리크랩 볶음밥", cat: "asian", icon: "🍛", desc: "매콤달콤한 칠리크랩 소스에 밥을 쓱쓱 비벼먹는 동남아 픽." },

  // 6. 분식 & 패스트푸드 (Snack & Fast Food)
  { name: "매콤 떡볶이 & 바삭 모둠튀김", cat: "snack", icon: "🍢", desc: "동료들과 수다 떨며 스트레스 푸는 국민 분식 파티!" },
  { name: "참치마요 김밥 & 얼큰 라면", cat: "snack", icon: "🍙", desc: "가장 클래식하지만 언제 먹어도 완벽한 직장인 점심 조합." },
  { name: "치킨마요 덮밥 & 미니우동", cat: "snack", icon: "🍗", desc: "단짠 마요 소스와 바삭한 치킨의 마성의 중독성." },
  { name: "이삭토스트 & 달콤한 과일주스", cat: "snack", icon: "🥪", desc: "달콤한 특제 소스와 햄치즈의 달콤바삭한 행복." },
  { name: "새콤매콤 쫄면 & 군만두", cat: "snack", icon: "🥟", desc: "아삭한 콩나물, 쫄깃한 면발과 기름에 바삭 튀긴 만두의 궁합!" },
  { name: "치즈 라볶이 & 찰순대", cat: "snack", icon: "🧀", desc: "모짜렐라 치즈가 듬뿍 녹아내린 라볶이와 소금 콕 찍은 순대." },
  { name: "스팸 김치볶음밥 & 달걀후라이", cat: "snack", icon: "🍳", desc: "노릇하게 볶은 김치와 짭조름한 스팸의 실패 없는 밥도둑." },
  { name: "진한 멸치칼국수 & 겉절이", cat: "snack", icon: "🍜", desc: "뜨끈하고 깊은 멸치 육수에 갓 무친 매콤 겉절이 한 입!" },
  { name: "바지락 손수제비", cat: "snack", icon: "🥣", desc: "쫄깃하게 뜯어 넣은 수제비와 시원한 바지락 조개 국물." },

  // 7. 다이어트 & 가벼운 식단 (Diet & Light)
  { name: "연어 / 닭가슴살 아보카도 포케", cat: "diet", icon: "🥗", desc: "현미밥과 신선한 채소, 단백질로 가볍고 든든한 건강식." },
  { name: "서브웨이 로티세리 치킨 샌드위치", cat: "diet", icon: "🥪", desc: "내 맘대로 조합하는 영양 가득 클린 다이어트 밀." },
  { name: "리코타 치즈 샐러드 & 호밀빵", cat: "diet", icon: "🥑", desc: "오후 식곤증 없이 산뜻하고 쾌적하게 일하고 싶을 때!" },
  { name: "밥 없는 든든한 키토 김밥", cat: "diet", icon: "🥚", desc: "달걀 지단이 가득 들어가 탄수화물 걱정 없는 건강 김밥." },
  { name: "수비드 닭가슴살 & 현미 웜볼", cat: "diet", icon: "🥗", desc: "촉촉한 수비드 치킨과 구운 채소, 귀리현미밥의 든든한 조화." },
  { name: "꾸덕한 그릭요거트 & 그래놀라 볼", cat: "diet", icon: "🥣", desc: "블루베리, 바나나, 꿀을 듬뿍 얹어 가볍고 건강하게 즐기는 픽." },
  { name: "순메밀 100% 들기름 메밀면", cat: "diet", icon: "🥢", desc: "고소한 들기름과 김가루, 순메밀의 속 편하고 향긋한 한 끼." },
  { name: "새우 두부면 팟타이", cat: "diet", icon: "🍤", desc: "밀가루 면 대신 단백질 두부면으로 칼로리를 쏙 뺀 건강 다이어트식." },
  { name: "신선한 야채 가득 월남쌈 세트", cat: "diet", icon: "🥬", desc: "라이스페이퍼에 알록달록 채소와 닭가슴살을 싸먹는 클린 밀." }
];

let currentLunchCategory = "all";

function setupLunchEngine() {
  const chips = document.querySelectorAll(".filter-chip");
  const spinBtn = document.getElementById("btn-spin-lunch");
  const displayBox = document.querySelector(".lunch-display-box");
  const iconEl = document.getElementById("lunch-result-icon");
  const nameEl = document.getElementById("lunch-result-name");
  const descEl = document.getElementById("lunch-result-desc");

  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      chips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      currentLunchCategory = chip.dataset.cat;
      if (displayBox) displayBox.classList.remove("highlight");
      if (nameEl) {
        nameEl.innerHTML = `<span class="lunch-name-text">무엇을 먹을까요?</span>`;
        checkAndApplyLunchMarquee();
      }
      if (descEl) descEl.innerText = "카테고리를 고르고 아래 추천 버튼을 눌러보세요!";
      if (iconEl) iconEl.innerText = "🍽️";
    });
  });

  if (spinBtn) {
    spinBtn.addEventListener("click", () => {
      const filtered = currentLunchCategory === "all" 
        ? lunchDatabase 
        : lunchDatabase.filter(item => item.cat === currentLunchCategory);

      if (filtered.length === 0) return;

      if (displayBox) {
        displayBox.classList.remove("highlight");
      }

      if (iconEl) iconEl.classList.add("spinning");
      if (nameEl) {
        nameEl.innerHTML = `<span class="lunch-name-text">룰렛 돌아가는 중...</span>`;
        checkAndApplyLunchMarquee();
      }
      if (descEl) descEl.innerText = "오늘의 최고 메뉴를 고르는 중입니다!";
      spinBtn.disabled = true;

      let counter = 0;
      const interval = setInterval(() => {
        const randomTemp = filtered[Math.floor(Math.random() * filtered.length)];
        if (iconEl) iconEl.innerText = randomTemp.icon;
        if (nameEl) {
          nameEl.innerHTML = `<span class="lunch-name-text">${randomTemp.name}</span>`;
        }
        counter++;

        if (counter > 14) {
          clearInterval(interval);
          const finalPick = filtered[Math.floor(Math.random() * filtered.length)];
          if (iconEl) {
            iconEl.innerText = finalPick.icon;
            iconEl.classList.remove("spinning");
          }
          if (nameEl) {
            nameEl.innerHTML = `<span class="lunch-name-text">${finalPick.name}</span>`;
          }
          if (descEl) descEl.innerText = finalPick.desc;
          spinBtn.disabled = false;

          if (displayBox) {
            displayBox.classList.remove("highlight");
            void displayBox.offsetWidth;
            displayBox.classList.add("highlight");
          }
          checkAndApplyLunchMarquee();
        }
      }, 80);
    });
  }
}

// ==========================================
// 19. 루팡 급여 계산기 & 컴팩트 인디케이터 모듈
// ==========================================
let slackTimerInterval = null;
let slackSeconds = 0;
let isSlackTimerRunning = false;

function calculateHourlyWageFromAnnual(annualManwon) {
  const annualTotal = Number(annualManwon) * 10000;
  return Math.round(annualTotal / 2508);
}

function getEffectiveHourlyWage() {
  const wageType = localStorage.getItem("app_slack_wage_type") || "annual";
  if (wageType === "annual") {
    const annual = Number(localStorage.getItem("app_slack_annual_salary")) || 3200;
    return calculateHourlyWageFromAnnual(annual);
  } else {
    return Number(localStorage.getItem("app_slack_hourly_wage")) || 12759;
  }
}

function setupSlackingEngine() {
  const toggleBtn = document.getElementById("btn-toggle-slack-timer");
  const iconEl = document.getElementById("slack-btn-icon");
  const textEl = document.getElementById("slack-btn-text");
  const timeEl = document.getElementById("slack-elapsed-time");
  const amountEl = document.getElementById("slack-earned-amount");
  const cheerEl = document.getElementById("slack-cheer-text");

  const annualSalaryInput = document.getElementById("user-annual-salary");
  const hourlyWageInput = document.getElementById("user-hourly-wage");
  const convertedHintEl = document.getElementById("calc-converted-hourly");

  const groupAnnual = document.getElementById("group-annual-salary");
  const groupHourly = document.getElementById("group-hourly-wage");
  const typeBtns = document.querySelectorAll(".slack-type-btn");

  const topSlackIndicator = document.getElementById("btn-top-slack-indicator");
  const topSlackTime = document.getElementById("top-slack-time");
  const topSlackAmount = document.getElementById("top-slack-amount");

  const savedType = localStorage.getItem("app_slack_wage_type") || "annual";
  const savedAnnual = localStorage.getItem("app_slack_annual_salary") || "3200";
  const savedHourly = localStorage.getItem("app_slack_hourly_wage") || "12759";

  if (annualSalaryInput) annualSalaryInput.value = savedAnnual;
  if (hourlyWageInput) hourlyWageInput.value = savedHourly;

  const updateConvertedHint = () => {
    const annualVal = Number(annualSalaryInput.value) || 0;
    const hourly = calculateHourlyWageFromAnnual(annualVal);
    if (convertedHintEl) {
      convertedHintEl.innerText = `환산 시급: 약 ${hourly.toLocaleString()}원`;
    }
  };

  const applyWageTypeUI = (type) => {
    localStorage.setItem("app_slack_wage_type", type);
    typeBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.type === type));

    if (type === "annual") {
      if (groupAnnual) groupAnnual.style.display = "flex";
      if (groupHourly) groupHourly.style.display = "none";
      updateConvertedHint();
    } else {
      if (groupAnnual) groupAnnual.style.display = "none";
      if (groupHourly) groupHourly.style.display = "flex";
    }
  };

  applyWageTypeUI(savedType);

  typeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      applyWageTypeUI(btn.dataset.type);
    });
  });

  if (annualSalaryInput) {
    annualSalaryInput.addEventListener("input", () => {
      localStorage.setItem("app_slack_annual_salary", annualSalaryInput.value);
      updateConvertedHint();
    });
  }

  if (hourlyWageInput) {
    hourlyWageInput.addEventListener("input", () => {
      localStorage.setItem("app_slack_hourly_wage", hourlyWageInput.value);
    });
  }

  const cheers = [
    "화장실에서 10분만 쉬어도 커피 한 잔 값 획득!",
    "잠깐의 멍때림이 오후 창의력을 200% 증폭시킵니다.",
    "키보드를 타닥타닥 치며 합법적으로 숨을 돌리세요.",
    "일도 휴식도 프로페셔널하게! 멘탈을 회복 중입니다."
  ];

  const updateDisplay = () => {
    const hh = String(Math.floor(slackSeconds / 3600)).padStart(2, "0");
    const mm = String(Math.floor((slackSeconds % 3600) / 60)).padStart(2, "0");
    const ss = String(slackSeconds % 60).padStart(2, "0");
    const timeFormatted = `${hh}:${mm}:${ss}`;

    const currentHourlyWage = getEffectiveHourlyWage();
    const earned = Math.floor((currentHourlyWage / 3600) * slackSeconds);
    const amountFormatted = earned.toLocaleString();

    if (timeEl) timeEl.innerText = timeFormatted;
    if (amountEl) amountEl.innerText = amountFormatted;

    if (topSlackTime) topSlackTime.innerText = timeFormatted;
    if (topSlackAmount) topSlackAmount.innerText = amountFormatted;
  };

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      if (!isSlackTimerRunning) {
        isSlackTimerRunning = true;
        toggleBtn.classList.add("running");
        if (iconEl) iconEl.innerText = "stop";
        if (textEl) textEl.innerText = "루팡 종료";
        if (cheerEl) cheerEl.innerText = cheers[Math.floor(Math.random() * cheers.length)];

        if (topSlackIndicator) {
          topSlackIndicator.classList.remove("is-hidden");
          setTimeout(checkAndApplyTitleMarquee, 50);
        }

        slackTimerInterval = setInterval(() => {
          slackSeconds++;
          updateDisplay();
        }, 1000);
      } else {
        isSlackTimerRunning = false;
        clearInterval(slackTimerInterval);
        toggleBtn.classList.remove("running");
        if (iconEl) iconEl.innerText = "play_arrow";
        if (textEl) textEl.innerText = "루팡 재개";
        if (cheerEl) cheerEl.innerText = "수고하셨습니다! 소중한 멘탈 충전 완료 ✨";

        if (topSlackIndicator) {
          topSlackIndicator.classList.add("is-hidden");
          setTimeout(checkAndApplyTitleMarquee, 50);
        }
      }
    });
  }

  if (topSlackIndicator) {
    topSlackIndicator.addEventListener("click", () => {
      openModalView("slacking-drawer", "slacking-drawer-backdrop");
    });
  }
}

// ==========================================
// 20. 앱 초기화
// ==========================================
async function init() {
  initThemeManager();
  initGlobalHistoryAndEscListener();
  initNavigationAndDrawers();
  initCalendarDetailModal();
  initFeedbackSystem();
  initProfileEditModal();
  setupSimCalendarControls();
  setupLunchEngine();
  setupSlackingEngine();
  initWidgetOrderManager();
  initLeaveRegisterForm();
  initPasswordChangeForm();

  checkSessionExpiration();

  const currentUser = getCurrentUser();
  if (currentUser) {
    await loadUserLeaves(currentUser.id);
  }

  await renderMainRealtimeSpace();
  updateCountdown();
  updateWorkTimeDisplay();
  setInterval(updateCountdown, 1000);

  setInterval(checkSessionExpiration, 60000);

  hideLoadingScreen();
  setTimeout(checkAndApplyTitleMarquee, 200);

  initAuthSystem();
}

document.addEventListener("DOMContentLoaded", init);
