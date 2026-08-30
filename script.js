// ==========================================
// 1. 상태 관리 & 유틸
// ==========================================
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxyLX-M_XVv8_9TiIEZ9mmHaKyGz4XHE_bcwyMGWnms5fs6G-gfW6nwghUoxpFB1cL58g/exec';

const holidayMap = new Map();
const fetchedYears = new Set();
const weatherMap = new Map(); // 날씨 캐시 맵

const currentRealYear = new Date().getFullYear();
const currentRealMonth = new Date().getMonth();

let simViewYear = currentRealYear;
let simViewMonth = currentRealMonth;
let isSimCalendarSliding = false;

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
  "vacation",
  "holidays",
  "travel"
];

const WIDGET_META = {
  countdown: { name: "⏱️ 다음 쉬는 날 카운트다운" },
  calendar: { name: "📅 이번 달 달력" },
  insight: { name: "💡 이번 달 휴일 브리핑" },
  stats: { name: "📊 이번 달 휴일 현황" },
  vacation: { name: "🌴 가성비 연차 추천" },
  holidays: { name: "🚩 다가오는 공휴일 일정" },
  travel: { name: "✈️ 황금연휴 해외여행 추천" }
};

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

function hideLoadingScreen() {
  const loadingScreen = document.getElementById("app-loading-screen");
  if (loadingScreen) {
    loadingScreen.classList.add("is-hidden");
    setTimeout(() => {
      loadingScreen.remove();
    }, 400);
  }
}

// 🌟 햄버거 버튼 아이콘 상태 동기화 (☰ ↔ ✖️)
function updateHamburgerIconState() {
  const navDrawer = document.getElementById("nav-drawer");
  const hamburgerBtn = document.getElementById("btn-open-nav-menu");
  if (hamburgerBtn && navDrawer) {
    const isOpen = navDrawer.classList.contains("is-open");
    hamburgerBtn.classList.toggle("is-close", isOpen);
    hamburgerBtn.setAttribute("aria-label", isOpen ? "메뉴 닫기" : "메뉴 열기");
  }
}

// 🌟 상단 타이틀이 화면 폭에 의해 잘릴 경우 마퀴 롤링 애니메이션 적용
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

// 캘린더 내부 서브 라벨 반응형 오버플로우 감지 롤링
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
    const lat = 37.5665; // 서울 기준 위도
    const lon = 126.9780; // 서울 기준 경도
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
    if (e.key === "Escape" && modalHistoryStack.length > 0) {
      const topModal = modalHistoryStack[modalHistoryStack.length - 1];
      closeModalView(topModal.modalId);
    }
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(checkAndApplyMarquees, 150);
  });
}

// ==========================================
// 4. 위젯 순서 관리 & 대시보드 렌더링 (좌 4개 : 우 3개 균등 분배)
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

  // 상위 4개(카운트다운, 달력, 브리핑, 통계)는 좌측, 나머지 3개(연차, 공휴일, 여행)는 우측으로 균등 배분
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
// 5. 퇴근 시간 브라우저 스토리지 & 클릭 반응성 강화
// ==========================================
function getOffWorkTime() {
  const saved = localStorage.getItem("app_off_work_time") || "17:00";
  const [h, m] = saved.split(":").map(Number);
  return {
    hours: isNaN(h) ? 17 : h,
    minutes: isNaN(m) ? 0 : m,
    str: saved
  };
}

function setupOffWorkTimeInput() {
  const timeInput = document.getElementById("off-work-time");
  const chip = document.querySelector(".target-time-chip");
  const current = getOffWorkTime();
  timeInput.value = current.str;

  timeInput.addEventListener("change", (e) => {
    if (!e.target.value) return;
    localStorage.setItem("app_off_work_time", e.target.value);
    updateCountdown();
  });

  if (chip) {
    chip.addEventListener("click", (e) => {
      if (e.target !== timeInput) {
        try {
          if (typeof timeInput.showPicker === 'function') {
            timeInput.showPicker();
          } else {
            timeInput.focus();
          }
        } catch (err) {
          timeInput.focus();
        }
      }
    });
  }
}

// ==========================================
// 6. 네비게이션 드로어 & 모달 이벤트 등록
// ==========================================
function initNavigationAndDrawers() {
  const openNavBtn = document.getElementById("btn-open-nav-menu");
  const closeNavBtn = document.getElementById("btn-close-nav-menu");
  const navBackdrop = document.getElementById("nav-drawer-backdrop");

  const openSimBtn = document.getElementById("menu-open-simulator");
  const closeSimBtn = document.getElementById("btn-close-sim");
  const simBackdrop = document.getElementById("sim-drawer-backdrop");

  const openLunchBtn = document.getElementById("menu-open-lunch");
  const closeLunchBtn = document.getElementById("btn-close-lunch");
  const lunchBackdrop = document.getElementById("lunch-drawer-backdrop");

  const openSlackingBtn = document.getElementById("menu-open-slacking");
  const closeSlackingBtn = document.getElementById("btn-close-slacking");
  const slackingBackdrop = document.getElementById("slacking-drawer-backdrop");

  openNavBtn.addEventListener("click", () => {
    const navDrawer = document.getElementById("nav-drawer");
    if (navDrawer.classList.contains("is-open")) {
      closeModalView("nav-drawer");
    } else {
      openModalView("nav-drawer", "nav-drawer-backdrop");
    }
  });

  closeNavBtn.addEventListener("click", () => closeModalView("nav-drawer"));
  navBackdrop.addEventListener("click", () => closeModalView("nav-drawer"));

  openSimBtn.addEventListener("click", () => {
    transitionModalView("nav-drawer", "simulation-drawer", "sim-drawer-backdrop", () => {
      renderSimulatedSpace("none");
    });
  });
  closeSimBtn.addEventListener("click", () => closeModalView("simulation-drawer"));
  simBackdrop.addEventListener("click", () => closeModalView("simulation-drawer"));

  openLunchBtn.addEventListener("click", () => {
    transitionModalView("nav-drawer", "lunch-drawer", "lunch-drawer-backdrop");
  });
  closeLunchBtn.addEventListener("click", () => closeModalView("lunch-drawer"));
  lunchBackdrop.addEventListener("click", () => closeModalView("lunch-drawer"));

  openSlackingBtn.addEventListener("click", () => {
    transitionModalView("nav-drawer", "slacking-drawer", "slacking-drawer-backdrop");
  });
  closeSlackingBtn.addEventListener("click", () => closeModalView("slacking-drawer"));
  slackingBackdrop.addEventListener("click", () => closeModalView("slacking-drawer"));
}

// ==========================================
// 7. 달력 상세 팝업 모달 (날씨 정보 연동)
// ==========================================
function initCalendarDetailModal() {
  const closeBtn = document.getElementById("btn-close-modal");
  const backdrop = document.getElementById("cal-modal-backdrop");

  closeBtn.addEventListener("click", () => closeModalView("cal-detail-modal"));
  backdrop.addEventListener("click", () => closeModalView("cal-detail-modal"));
}

function openCalendarDetailModal(cellDate, dateKey, isHoliday, isLeave, isToday, subText) {
  const dateTextEl = document.getElementById("modal-date-text");
  const badgeEl = document.getElementById("modal-badge-text");
  const nameEl = document.getElementById("modal-info-name");
  const descEl = document.getElementById("modal-info-desc");
  const iconEl = document.getElementById("modal-type-icon");
  const weatherBox = document.getElementById("modal-weather-box");
  const weatherInfoEl = document.getElementById("modal-info-weather");

  const todayKey = formatDateKey(new Date());
  const dayName = ['일', '월', '화', '수', '목', '금', '토'][cellDate.getDay()];
  dateTextEl.innerText = `${cellDate.getFullYear()}년 ${cellDate.getMonth() + 1}월 ${cellDate.getDate()}일 (${dayName})`;

  // 오늘 및 미래 날씨 예보만 표기
  if (dateKey >= todayKey && weatherMap.has(dateKey)) {
    const w = weatherMap.get(dateKey);
    weatherBox.style.display = "flex";
    weatherInfoEl.innerText = `${w.icon} ${w.name} (최저 ${w.minTemp}°C / 최고 ${w.maxTemp}°C)`;
  } else {
    weatherBox.style.display = "none";
  }

  if (isHoliday) {
    iconEl.innerText = "celebration";
    badgeEl.innerText = "공휴일";
    badgeEl.className = "modal-status-badge holiday";
    nameEl.innerText = holidayMap.get(dateKey) || "공식 공휴일";
    descEl.innerText = "국가에서 지정한 공식 법정 공휴일(빨간 날)입니다.";
  } else if (isLeave) {
    iconEl.innerText = "flight_takeoff";
    badgeEl.innerText = "연차 추천";
    badgeEl.className = "modal-status-badge leave";
    nameEl.innerText = "징검다리 꿀연차 추천일";
    descEl.innerText = "앞뒤 공휴일 및 주말과 연계하여 1일 연차 사용 시 가장 길게 쉴 수 있는 가성비 황금 구간입니다.";
  } else if (cellDate.getDay() === 0 || cellDate.getDay() === 6) {
    iconEl.innerText = "weekend";
    badgeEl.innerText = "주말";
    badgeEl.className = "modal-status-badge normal";
    nameEl.innerText = cellDate.getDay() === 6 ? "토요일 주말" : "일요일 주말";
    descEl.innerText = "정기 휴일인 주말입니다.";
  } else {
    iconEl.innerText = "work";
    badgeEl.innerText = isToday ? "오늘 (근무일)" : "평일 근무일";
    badgeEl.className = "modal-status-badge normal";
    nameEl.innerText = isToday ? "오늘 (출근 및 근무)" : "일반 근무일";
    descEl.innerText = "정상적인 업무가 진행되는 평일입니다.";
  }

  openModalView("cal-detail-modal", "cal-modal-backdrop");
}

// ==========================================
// 8. 🌟 피드백 제출 & 스크롤 연동 매니저
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
// 9. 테마 관리
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

  fabBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    themeMenu.classList.toggle("active");
  });

  document.addEventListener("click", () => {
    themeMenu.classList.remove("active");
  });

  themeOptions.forEach(opt => {
    opt.addEventListener("click", () => {
      const themeVal = opt.dataset.themeValue;
      localStorage.setItem("app_theme", themeVal);
      applyTheme(themeVal);
      themeMenu.classList.remove("active");
    });
  });

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    themeOptions.forEach(opt => {
      opt.classList.toggle("selected", opt.dataset.themeValue === theme);
    });

    if (theme === "light") {
      fabIcon.innerText = "light_mode";
    } else if (theme === "dark") {
      fabIcon.innerText = "dark_mode";
    } else {
      fabIcon.innerText = "settings_brightness";
    }
  }

  let isScrolled = false;
  window.addEventListener("scroll", () => {
    if (window.innerWidth >= 1024) return;

    const scrollY = window.scrollY;
    if (!isScrolled && scrollY > 60) {
      isScrolled = true;
      themeFab.classList.add("is-hidden");
      themeMenu.classList.remove("active");
    } else if (isScrolled && scrollY <= 20) {
      isScrolled = false;
      themeFab.classList.remove("is-hidden");
    }
  }, { passive: true });
}

// ==========================================
// 10. 동적 공휴일 수집 (Nager.Date API)
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
  return holidayMap.has(dateStr);
}

function getDayOffName(dateObj) {
  const dateStr = formatDateKey(dateObj);
  if (holidayMap.has(dateStr)) return holidayMap.get(dateStr);
  const day = dateObj.getDay();
  if (day === 0 || day === 6) return "주말";
  return "휴일";
}

// ==========================================
// 11. 클린 플립 카운트다운
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

function updateCountdown() {
  const now = new Date();
  const isTodayOff = isOffDay(now);

  const timerTitleEl = document.getElementById("timer-title");
  const { hours: offH, minutes: offM } = getOffWorkTime();

  const isWorkDoneToday = (now.getHours() > offH) || (now.getHours() === offH && now.getMinutes() >= offM);

  if (isTodayOff) {
    const offName = getDayOffName(now);
    showBreakMessage(`현재 ${offName} 진행 중입니다.<br>충전의 시간을 가지세요.`);
    timerTitleEl.innerText = `${offName} 진행 중`;
    return;
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (isWorkDoneToday && isOffDay(tomorrow)) {
    const offName = getDayOffName(tomorrow);
    showBreakMessage(`업무 종료. 내일부터 ${offName}입니다.`);
    timerTitleEl.innerText = `${offName} 휴식 진입`;
    return;
  }

  let targetWorkDay = new Date(now);
  let offDayTarget = new Date(now);
  let daysAhead = isWorkDoneToday ? 1 : 0;

  while (true) {
    const testDate = new Date(now);
    testDate.setDate(now.getDate() + daysAhead + 1);
    if (isOffDay(testDate)) {
      offDayTarget = testDate;
      targetWorkDay = new Date(now);
      targetWorkDay.setDate(now.getDate() + daysAhead);
      break;
    }
    daysAhead++;
  }

  const targetTime = new Date(targetWorkDay.getFullYear(), targetWorkDay.getMonth(), targetWorkDay.getDate(), offH, offM, 0);
  const diff = targetTime - now;

  ensureCountdownUI();

  const offName = getDayOffName(offDayTarget);
  timerTitleEl.innerText = `다음 쉬는 날(${offName})까지`;

  const d = Math.floor(diff / (1000 * 60 * 60 * 24));
  const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const m = Math.floor((diff / 1000 / 60) % 60);
  const s = Math.floor((diff / 1000) % 60);

  updateTextFlip("flip-days", String(d));
  updateTextFlip("flip-hours", String(h).padStart(2, "0"));
  updateTextFlip("flip-minutes", String(m).padStart(2, "0"));
  updateTextFlip("flip-seconds", String(s).padStart(2, "0"));

  updateDynamicProgressBar(now, targetTime);
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

function showBreakMessage(message) {
  document.getElementById("countdown").innerHTML = `
    <div style="font-size: 1.15rem; font-weight: 800; color: var(--md-sys-color-primary); padding: 18px 0; text-align: center;">
      ${message}
    </div>
  `;
  document.getElementById("progress-bar").style.width = "100%";
  document.getElementById("progress-percent").innerText = "100%";
}

function updateDynamicProgressBar(now, targetTime) {
  let blockStart = new Date(now);
  while (!isOffDay(blockStart)) {
    blockStart.setDate(blockStart.getDate() - 1);
  }
  blockStart.setDate(blockStart.getDate() + 1);
  blockStart.setHours(9, 0, 0, 0);

  const totalPeriod = targetTime - blockStart;
  const elapsed = now - blockStart;

  let percent = Math.floor((elapsed / totalPeriod) * 100);
  percent = Math.max(0, Math.min(100, percent));

  document.getElementById("progress-bar").style.width = `${percent}%`;
  document.getElementById("progress-percent").innerText = `${percent}%`;
}

// ==========================================
// 12. 연차 추천 및 해외여행 추천 연산 코어
// ==========================================
function countContiguousOffDays(startDate) {
  let count = 0;
  let cur = new Date(startDate);
  while (isOffDay(cur)) {
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
    if (isOffDay(cur)) {
      const blockStart = new Date(cur);
      let blockEnd = new Date(cur);

      while (cur <= endCheck) {
        const next = new Date(cur);
        next.setDate(cur.getDate() + 1);
        if (isOffDay(next)) {
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

      if (!isOffDay(gap1) && isOffDay(gap2)) {
        const nextBlockLen = countContiguousOffDays(gap2);
        const totalRest = blockLength + 1 + nextBlockLen;
        leaveSet.add(formatDateKey(gap1));
        if (gap1.getMonth() === month && gap1.getFullYear() === year) {
          candidates.push({ leaveDate: gap1, totalRest });
        }
      }

      if (blockLength >= 3) {
        const dayBefore = new Date(blockStart);
        dayBefore.setDate(blockStart.getDate() - 1);
        if (!isOffDay(dayBefore)) {
          leaveSet.add(formatDateKey(dayBefore));
          if (dayBefore.getMonth() === month && dayBefore.getFullYear() === year) {
            candidates.push({ leaveDate: dayBefore, totalRest: blockLength + 1 });
          }
        }

        const dayAfter = new Date(blockEnd);
        dayAfter.setDate(blockEnd.getDate() + 1);
        if (!isOffDay(dayAfter)) {
          leaveSet.add(formatDateKey(dayAfter));
          if (dayAfter.getMonth() === month && dayAfter.getFullYear() === year) {
            candidates.push({ leaveDate: dayAfter, totalRest: blockLength + 1 });
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

    if (isOffDay(checkDate)) {
      const blockStart = new Date(checkDate);
      let blockEnd = new Date(checkDate);

      while (i <= scanDays) {
        const nextDate = new Date(baseDay);
        nextDate.setDate(baseDay.getDate() + i + 1);
        if (isOffDay(nextDate)) {
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

      if (!isOffDay(gap1) && isOffDay(gap2)) {
        const nextBlockLen = countContiguousOffDays(gap2);
        const totalRest = blockLength + 1 + nextBlockLen;
        const finalEndDate = new Date(gap2);
        finalEndDate.setDate(finalEndDate.getDate() + nextBlockLen - 1);

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

      if (blockLength >= 3) {
        const dayBefore = new Date(blockStart);
        dayBefore.setDate(blockStart.getDate() - 1);
        if (!isOffDay(dayBefore) && dayBefore >= baseDay) {
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

        const dayAfter = new Date(blockEnd);
        dayAfter.setDate(blockEnd.getDate() + 1);
        if (!isOffDay(dayAfter)) {
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

// 🌟 TRAVEL PLANNER 위젯: 타이틀 하단에 '총 N일 휴식 (연차 정보)' 배치
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
// 13. 캘린더 그리드 DOM 생성 (수직 날씨 배지 적용)
// ==========================================
function createCalendarGridFragment(year, month) {
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

    if (isHoliday) cell.classList.add("holiday");
    if (isLeave) cell.classList.add("leave-rec");
    if (isToday) cell.classList.add("today");

    let subText = "";
    if (isHoliday) {
      subText = holidayMap.get(dateKey);
    } else if (isLeave) {
      subText = "연차 추천";
    }

    // 오늘(todayKey) 및 이후 미래 날짜에만 날씨 미니 배지 표시 (상단 아이콘, 하단 기온)
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
      openCalendarDetailModal(cellDate, dateKey, isHoliday, isLeave, isToday, subText);
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
// 14. 메인 화면 렌더링
// ==========================================
async function renderMainRealtimeSpace() {
  await Promise.all([
    ensureHolidaysForYear(currentRealYear),
    ensureWeatherForecast() // 날씨 예보 수집
  ]);

  document.getElementById("main-cal-month-year").innerText = `${currentRealYear}년 ${currentRealMonth + 1}월`;
  const container = document.getElementById("main-calendar-days");
  container.innerHTML = "";
  container.appendChild(createCalendarGridFragment(currentRealYear, currentRealMonth));

  const lastDate = new Date(currentRealYear, currentRealMonth + 1, 0).getDate();
  let saturdays = 0, sundays = 0, weekdayHolidays = 0;

  for (let d = 1; d <= lastDate; d++) {
    const dateObj = new Date(currentRealYear, currentRealMonth, d);
    const dayOfWeek = dateObj.getDay();
    const dateKey = formatDateKey(dateObj);

    if (dayOfWeek === 6) saturdays++;
    else if (dayOfWeek === 0) sundays++;
    else if (holidayMap.has(dateKey)) weekdayHolidays++;
  }

  const weekendTotal = saturdays + sundays;
  const totalDaysOff = weekendTotal + weekdayHolidays;
  const workDays = lastDate - totalDaysOff;
  const workPercent = Math.round((workDays / lastDate) * 100);

  document.getElementById("main-stats-title").innerText = `${currentRealYear}년 ${currentRealMonth + 1}월 휴일 현황`;
  document.getElementById("main-stat-total-days").innerText = `${totalDaysOff}일`;
  document.getElementById("main-stat-weekend-days").innerText = `${weekendTotal}일`;
  document.getElementById("main-stat-weekend-detail").innerText = `토 ${saturdays}일 / 일 ${sundays}일`;
  document.getElementById("main-stat-holiday-days").innerText = `${weekdayHolidays}일`;
  document.getElementById("main-stat-work-days").innerText = `${workDays}일`;
  document.getElementById("main-stat-work-percent").innerText = `근무 비율 ${workPercent}%`;

  const { maxConsecutiveRest, candidates } = getMonthLeaveAnalysis(currentRealYear, currentRealMonth);
  const headlineEl = document.getElementById("main-insight-headline");
  const descEl = document.getElementById("main-insight-desc");
  const iconEl = document.getElementById("main-insight-icon");
  document.getElementById("main-insight-title").innerText = `${currentRealYear}년 ${currentRealMonth + 1}월 휴일 브리핑`;

  if (weekdayHolidays >= 3) {
    headlineEl.innerText = "공휴일이 풍성한 황금 달";
    descEl.innerText = `평일 공휴일이 ${weekdayHolidays}일 포함되어 있습니다. 주말과 연계되어 장기 휴식을 갖기에 매우 유리합니다.`;
    iconEl.innerText = "celebration";
  } else if (weekdayHolidays >= 1) {
    if (candidates.length > 0 && maxConsecutiveRest > 0) {
      headlineEl.innerText = "징검다리 휴일 연계 가능";
      descEl.innerText = `평일 공휴일(${weekdayHolidays}일)과 주말 사이 징검다리 평일에 연차 1일을 활용하면 최장 ${maxConsecutiveRest}일 연속 휴식이 가능합니다.`;
      iconEl.innerText = "flight_takeoff";
    } else {
      headlineEl.innerText = "주중 공휴일 포함";
      descEl.innerText = `평일 공휴일이 ${weekdayHolidays}일 있어 주중에 하루 숨을 돌릴 수 있는 달입니다.`;
      iconEl.innerText = "spa";
    }
  } else {
    headlineEl.innerText = "평일 공휴일이 없는 달";
    descEl.innerText = `이번 달은 평일 공식 공휴일이 없습니다. 주말 위주로 컨디션을 관리하거나 필요 시 개인 연차 사용을 고려해보세요.`;
    iconEl.innerText = "battery_alert";
  }

  const today = new Date();
  const mainRecs = calculateVacationsForBase(today).slice(0, 4);
  const vacListEl = document.getElementById("main-vacation-recommendations");

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

  renderTravelWidget(today, "main-travel-recommendations");

  const holListEl = document.getElementById("main-holiday-list");
  const baseDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const holidays = Array.from(holidayMap.entries()).map(([dateStr, name]) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const holidayDate = new Date(y, m - 1, d);
    const diffDays = Math.ceil((holidayDate - baseDay) / (1000 * 60 * 60 * 24));
    return { name, dateStr, effectiveDate: holidayDate, diffDays };
  });

  const upcoming = holidays.filter(h => h.diffDays >= 0).sort((a, b) => a.diffDays - b.diffDays).slice(0, 5);
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

  checkAndApplyMarquees();
}

// ==========================================
// 15. 미래 연차 시뮬레이터 렌더링
// ==========================================
async function renderSimulatedSpace(direction = "none") {
  await ensureHolidaysForYear(simViewYear);

  const dateTitleText = `${simViewYear}년 ${simViewMonth + 1}월`;
  document.getElementById("sim-cal-month-year").innerText = dateTitleText;
  
  const bottomDateEl = document.getElementById("sim-bottom-month-year");
  if (bottomDateEl) {
    bottomDateEl.innerText = dateTitleText;
  }

  const isCurrentMonthView = (simViewYear === currentRealYear && simViewMonth === currentRealMonth);
  
  const todayBtn = document.getElementById("sim-cal-btn-today");
  if (todayBtn) todayBtn.classList.toggle("is-hidden", isCurrentMonthView);

  const bottomTodayBtn = document.getElementById("sim-bottom-btn-today");
  if (bottomTodayBtn) bottomTodayBtn.classList.toggle("is-hidden", isCurrentMonthView);

  const viewport = document.getElementById("sim-calendar-viewport");
  const activeLayer = viewport.querySelector(".calendar-grid-layer.active-layer") || 
                      document.getElementById("sim-calendar-days-active");

  const newFragment = createCalendarGridFragment(simViewYear, simViewMonth);

  if (direction === "none" || !activeLayer) {
    activeLayer.innerHTML = "";
    activeLayer.appendChild(newFragment);
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

  const lastDate = new Date(simViewYear, simViewMonth + 1, 0).getDate();
  let saturdays = 0, sundays = 0, weekdayHolidays = 0;

  for (let d = 1; d <= lastDate; d++) {
    const dateObj = new Date(simViewYear, simViewMonth, d);
    const dayOfWeek = dateObj.getDay();
    const dateKey = formatDateKey(dateObj);

    if (dayOfWeek === 6) saturdays++;
    else if (dayOfWeek === 0) sundays++;
    else if (holidayMap.has(dateKey)) weekdayHolidays++;
  }

  const weekendTotal = saturdays + sundays;
  const totalDaysOff = weekendTotal + weekdayHolidays;
  const workDays = lastDate - totalDaysOff;
  const workPercent = Math.round((workDays / lastDate) * 100);

  document.getElementById("sim-stats-title").innerText = `${simViewYear}년 ${simViewMonth + 1}월 휴일 현황`;
  document.getElementById("sim-stat-total-days").innerText = `${totalDaysOff}일`;
  document.getElementById("sim-stat-weekend-days").innerText = `${weekendTotal}일`;
  document.getElementById("sim-stat-weekend-detail").innerText = `토 ${saturdays}일 / 일 ${sundays}일`;
  document.getElementById("sim-stat-holiday-days").innerText = `${weekdayHolidays}일`;
  document.getElementById("sim-stat-work-days").innerText = `${workDays}일`;
  document.getElementById("sim-stat-work-percent").innerText = `근무 비율 ${workPercent}%`;

  const { maxConsecutiveRest, candidates } = getMonthLeaveAnalysis(simViewYear, simViewMonth);
  const headlineEl = document.getElementById("sim-insight-headline");
  const descEl = document.getElementById("sim-insight-desc");
  const iconEl = document.getElementById("sim-insight-icon");
  document.getElementById("sim-insight-title").innerText = `${simViewYear}년 ${simViewMonth + 1}월 휴일 브리핑`;

  if (weekdayHolidays >= 3) {
    headlineEl.innerText = "공휴일이 풍성한 황금 달";
    descEl.innerText = `평일 공휴일이 ${weekdayHolidays}일 포함되어 있습니다. 장기 휴식을 계획하기에 아주 좋습니다.`;
    iconEl.innerText = "celebration";
  } else if (weekdayHolidays >= 1) {
    if (candidates.length > 0 && maxConsecutiveRest > 0) {
      headlineEl.innerText = "징검다리 휴일 연계 가능";
      descEl.innerText = `평일 공휴일(${weekdayHolidays}일)과 주말 사이 징검다리 평일에 연차 1일을 활용하면 최장 ${maxConsecutiveRest}일 연속 휴식이 가능합니다.`;
      iconEl.innerText = "flight_takeoff";
    } else {
      headlineEl.innerText = "주중 공휴일 포함";
      descEl.innerText = `평일 공휴일이 ${weekdayHolidays}일 있어 주중에 하루 쉴 수 있습니다.`;
      iconEl.innerText = "spa";
    }
  } else {
    headlineEl.innerText = "평일 공휴일이 없는 달";
    descEl.innerText = `해당 월은 평일 공식 공휴일이 없습니다. 연속 휴식이 필요하다면 개인 연차 일정을 사전에 계획해보세요.`;
    iconEl.innerText = "battery_alert";
  }

  const simBaseDate = new Date(simViewYear, simViewMonth, 1);
  const simRecs = calculateVacationsForBase(simBaseDate).slice(0, 4);
  const simVacListEl = document.getElementById("sim-vacation-recommendations");
  document.getElementById("sim-vacation-desc").innerText = `${simViewYear}년 ${simViewMonth + 1}월부터 6개월간의 황금 루트`;

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

  renderTravelWidget(simBaseDate, "sim-travel-recommendations", "sim-travel-desc");

  const simHolListEl = document.getElementById("sim-holiday-list");
  document.getElementById("sim-holiday-desc").innerText = `${simViewYear}년 ${simViewMonth + 1}월 이후 예정된 휴일`;
  
  const holidays = Array.from(holidayMap.entries()).map(([dateStr, name]) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const holidayDate = new Date(y, m - 1, d);
    const diffDays = Math.ceil((holidayDate - simBaseDate) / (1000 * 60 * 60 * 24));
    return { name, dateStr, effectiveDate: holidayDate, diffDays };
  });

  const upcoming = holidays.filter(h => h.diffDays >= 0).sort((a, b) => a.diffDays - b.diffDays).slice(0, 5);
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

  document.getElementById("sim-cal-prev").addEventListener("click", handlePrev);
  document.getElementById("sim-cal-next").addEventListener("click", handleNext);
  document.getElementById("sim-cal-btn-today").addEventListener("click", handleToday);

  document.getElementById("sim-bottom-prev").addEventListener("click", handlePrev);
  document.getElementById("sim-bottom-next").addEventListener("click", handleNext);
  document.getElementById("sim-bottom-btn-today").addEventListener("click", handleToday);
}

// ==========================================
// 16. 점심 메뉴 추천 엔진
// ==========================================
const lunchDatabase = [
  // 한식
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

  // 중식
  { name: "짜장면 & 바삭 탕수육", cat: "chinese", icon: "🥢", desc: "기름진 탄수화물이 당기는 날엔 국민 중식이 진리!" },
  { name: "얼큰 해물 짬뽕 / 짬뽕밥", cat: "chinese", icon: "🍜", desc: "칼칼한 불맛 국물로 오전의 스트레스를 날려보세요." },
  { name: "얼얼한 마라탕 & 꿔바로우", cat: "chinese", icon: "🍲", desc: "취향대로 담아 즐기는 중독성 100% 매콤 얼얼한 맛!" },
  { name: "중화풍 마파두부 덮밥", cat: "chinese", icon: "🍛", desc: "부드러운 두부와 매콤한 소스의 밥도둑 덮밥." },
  { name: "고슬고슬 게살 볶음밥", cat: "chinese", icon: "🍚", desc: "짜장 소스와 짬뽕 국물을 곁들여 알차게 즐기세요." },
  { name: "홍콩식 딤섬 & 우육면", cat: "chinese", icon: "🥟", desc: "육즙 가득 샤오롱바오와 진한 소고기 국수의 조화." },

  // 일식
  { name: "겉바속촉 등심/안심 돈카츠", cat: "japanese", icon: "🍱", desc: "두툼한 고기와 바삭한 튀김옷! 실패 없는 점심 치트키." },
  { name: "신선한 초밥 세트 (모둠스시)", cat: "japanese", icon: "🍣", desc: "깔끔하고 정갈하게 먹고 속 편하게 일하고 싶을 때." },
  { name: "생연어 덮밥 (사케동)", cat: "japanese", icon: "🐟", desc: "고소한 생연어와 와사비의 부드럽고 산뜻한 조화." },
  { name: "진한 돈코츠 라멘 & 교자", cat: "japanese", icon: "🍜", desc: "차슈와 반숙란이 올라간 진하고 구수한 일본 라멘." },
  { name: "바삭바삭 모둠 텐동", cat: "japanese", icon: "🍤", desc: "온천계란을 톡 터뜨려 비벼먹는 튀김 덮밥의 매력!" },
  { name: "소고기 규동 / 가츠동", cat: "japanese", icon: "🍛", desc: "간편하고 빠르게 한 그릇 뚝딱 비우기 좋은 덮밥." },
  { name: "매콤 고소 마제소바", cat: "japanese", icon: "🍜", desc: "다진 고기와 노른자를 쓱쓱 비벼먹고 밥까지 비벼먹는 맛!" },

  // 양식
  { name: "수제버거 & 감자튀김 세트", cat: "western", icon: "🍔", desc: "육즙 팡팡 터지는 패티와 시원한 탄산으로 기분 전환!" },
  { name: "매콤 투움바 / 크림 파스타", cat: "western", icon: "🍝", desc: "꾸덕하고 진한 크림 소스로 기분 내고 싶은 점심시간." },
  { name: "화덕 마르게리따 피자", cat: "western", icon: "🍕", desc: "치즈가 쭉 늘어나는 갓 구운 화덕 피자 한 조각!" },
  { name: "깔끔한 알리오 올리오 파스타", cat: "western", icon: "🧄", desc: "마늘과 올리브오일의 풍미 가득한 담백한 선택." },
  { name: "포슬포슬 회오리 오므라이스", cat: "western", icon: "🍳", desc: "부드러운 달걀 이불을 덮은 달콤한 데미그라스 오므라이스." },

  // 아시안 & 이색
  { name: "양지 쌀국수 (포) & 스프링롤", cat: "asian", icon: "🍜", desc: "맑고 개운한 육수로 속이 편안해지는 베트남의 맛." },
  { name: "새우 팟타이 & 나시고랭", cat: "asian", icon: "🍤", desc: "달콤 짭조름한 볶음면과 고소한 볶음밥의 동남아 여행 기분!" },
  { name: "인도 커리 & 갓 구운 난", cat: "asian", icon: "🍛", desc: "향긋한 버터치킨 커리에 쫄깃한 난을 푹 찍어드세요." },
  { name: "분짜 (느억맘 숯불고기 국수)", cat: "asian", icon: "🥗", desc: "새콤달콤한 소스에 신선한 야채와 고기를 적셔먹는 별미." },

  // 분식 & 패스트푸드
  { name: "매콤 떡볶이 & 바삭 모둠튀김", cat: "snack", icon: "🍢", desc: "동료들과 수다 떨며 스트레스 푸는 국민 분식 파티!" },
  { name: "참치마요 김밥 & 얼큰 라면", cat: "snack", icon: "🍙", desc: "가장 클래식하지만 언제 먹어도 완벽한 직장인 점심 조합." },
  { name: "치킨마요 덮밥 & 미니우동", cat: "snack", icon: "🍗", desc: "단짠 마요 소스와 바삭한 치킨의 마성의 중독성." },
  { name: "이삭토스트 & 달콤한 과일주스", cat: "snack", icon: "🥪", desc: "달콤한 특제 소스와 햄치즈의 달콤바삭한 행복." },

  // 다이어트 & 가벼운 식단
  { name: "연어 / 닭가슴살 아보카도 포케", cat: "diet", icon: "🥗", desc: "현미밥과 신선한 채소, 단백질로 가볍고 든든한 건강식." },
  { name: "서브웨이 로티세리 치킨 샌드위치", cat: "diet", icon: "🥪", desc: "내 맘대로 조합하는 영양 가득 클린 다이어트 밀." },
  { name: "리코타 치즈 샐러드 & 호밀빵", cat: "diet", icon: "🥑", desc: "오후 식곤증 없이 산뜻하고 쾌적하게 일하고 싶을 때!" },
  { name: "밥 없는 든든한 키토 김밥", cat: "diet", icon: "🥚", desc: "달걀 지단이 가득 들어가 탄수화물 걱정 없는 건강 김밥." }
];

let currentLunchCategory = "all";

function setupLunchEngine() {
  const chips = document.querySelectorAll(".filter-chip");
  const spinBtn = document.getElementById("btn-spin-lunch");
  const iconEl = document.getElementById("lunch-result-icon");
  const nameEl = document.getElementById("lunch-result-name");
  const descEl = document.getElementById("lunch-result-desc");

  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      chips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      currentLunchCategory = chip.dataset.cat;
    });
  });

  spinBtn.addEventListener("click", () => {
    const filtered = currentLunchCategory === "all" 
      ? lunchDatabase 
      : lunchDatabase.filter(item => item.cat === currentLunchCategory);

    if (filtered.length === 0) return;

    iconEl.classList.add("spinning");
    nameEl.innerText = "룰렛 돌아가는 중...";
    descEl.innerText = "오늘의 최고 메뉴를 고르는 중입니다!";
    spinBtn.disabled = true;

    let counter = 0;
    const interval = setInterval(() => {
      const randomTemp = filtered[Math.floor(Math.random() * filtered.length)];
      iconEl.innerText = randomTemp.icon;
      nameEl.innerText = randomTemp.name;
      counter++;
      if (counter > 12) {
        clearInterval(interval);
        const finalPick = filtered[Math.floor(Math.random() * filtered.length)];
        iconEl.innerText = finalPick.icon;
        nameEl.innerText = finalPick.name;
        descEl.innerText = finalPick.desc;
        iconEl.classList.remove("spinning");
        spinBtn.disabled = false;
      }
    }, 85);
  });
}

// ==========================================
// 17. 루팡 급여 계산기 & 백그라운드 인디케이터 모듈
// ==========================================
let slackTimerInterval = null;
let slackSeconds = 0;
let isSlackTimerRunning = false;

function calculateHourlyWageFromAnnual(annualManwon) {
  // 대한민국 통상 근로시간 기준: 주 40시간(월 209시간, 연 2,508시간)
  // 세전 시급 = (세전 연봉(만원) * 10,000) / 2508
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

  // 저장된 연봉/시급 불러오기
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
      groupAnnual.style.display = "flex";
      groupHourly.style.display = "none";
      updateConvertedHint();
    } else {
      groupAnnual.style.display = "none";
      groupHourly.style.display = "flex";
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

    // 모달 내부 갱신
    if (timeEl) timeEl.innerText = timeFormatted;
    if (amountEl) amountEl.innerText = amountFormatted;

    // 상단 백그라운드 인디케이터 갱신
    if (topSlackTime) topSlackTime.innerText = timeFormatted;
    if (topSlackAmount) topSlackAmount.innerText = amountFormatted;
  };

  toggleBtn.addEventListener("click", () => {
    if (!isSlackTimerRunning) {
      isSlackTimerRunning = true;
      toggleBtn.classList.add("running");
      iconEl.innerText = "stop";
      textEl.innerText = "루팡 종료";
      cheerEl.innerText = cheers[Math.floor(Math.random() * cheers.length)];

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
      iconEl.innerText = "play_arrow";
      textEl.innerText = "루팡 재개";
      cheerEl.innerText = "수고하셨습니다! 소중한 멘탈 충전 완료 ✨";

      if (topSlackIndicator) {
        topSlackIndicator.classList.add("is-hidden");
        setTimeout(checkAndApplyTitleMarquee, 50);
      }
    }
  });

  // 🌟 상단 루팡 인디케이터 터치 시 루팡 가이드 모달 즉시 열기
  if (topSlackIndicator) {
    topSlackIndicator.addEventListener("click", () => {
      openModalView("slacking-drawer", "slacking-drawer-backdrop");
    });
  }
}

// ==========================================
// 18. 앱 초기화
// ==========================================
async function init() {
  initThemeManager();
  initGlobalHistoryAndEscListener();
  initNavigationAndDrawers();
  initCalendarDetailModal();
  initFeedbackSystem();
  setupOffWorkTimeInput();
  setupSimCalendarControls();
  setupLunchEngine();
  setupSlackingEngine();
  initWidgetOrderManager();

  await renderMainRealtimeSpace();
  updateCountdown();
  setInterval(updateCountdown, 1000);

  hideLoadingScreen();
  setTimeout(checkAndApplyTitleMarquee, 200);
}

document.addEventListener("DOMContentLoaded", init);
