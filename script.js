// ==========================================
// 1. 상태 관리 & 유틸
// ==========================================
const holidayMap = new Map();
const fetchedYears = new Set();

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

// ==========================================
// 2. 퇴근 시간 브라우저 스토리지 연동
// ==========================================
function getOffWorkTime() {
  const saved = localStorage.getItem("app_off_work_time") || "18:00";
  const [h, m] = saved.split(":").map(Number);
  return {
    hours: isNaN(h) ? 18 : h,
    minutes: isNaN(m) ? 0 : m,
    str: saved
  };
}

function setupOffWorkTimeInput() {
  const timeInput = document.getElementById("off-work-time");
  const current = getOffWorkTime();
  timeInput.value = current.str;

  timeInput.addEventListener("change", (e) => {
    if (!e.target.value) return;
    localStorage.setItem("app_off_work_time", e.target.value);
    updateCountdown();
  });
}

// ==========================================
// 3. 🌟 네비게이션 드로어 & 풀스크린 시뮬레이터 연동
// ==========================================
function initNavigationAndDrawers() {
  const navDrawer = document.getElementById("nav-drawer");
  const navBackdrop = document.getElementById("nav-drawer-backdrop");
  const openNavBtn = document.getElementById("btn-open-nav-menu");
  const closeNavBtn = document.getElementById("btn-close-nav-menu");

  const simDrawer = document.getElementById("simulation-drawer");
  const simBackdrop = document.getElementById("drawer-backdrop");
  const openSimBtn = document.getElementById("menu-open-simulator");
  const closeSimBtn = document.getElementById("btn-close-drawer");

  // 1. 네비게이션 드로어 제어
  const openNavDrawer = () => {
    navDrawer.classList.add("is-open");
    navBackdrop.classList.add("is-open");
    document.body.style.overflow = "hidden";
  };

  const closeNavDrawer = () => {
    navDrawer.classList.remove("is-open");
    navBackdrop.classList.remove("is-open");
    if (!simDrawer.classList.contains("is-open")) {
      document.body.style.overflow = "";
    }
  };

  openNavBtn.addEventListener("click", openNavDrawer);
  closeNavBtn.addEventListener("click", closeNavDrawer);
  navBackdrop.addEventListener("click", closeNavDrawer);

  // 2. 풀스크린 시뮬레이터 제어
  const openSimulator = (pushHistory = true) => {
    closeNavDrawer(); // 사이드 메뉴 닫고 시뮬레이터 열기
    if (pushHistory) {
      history.pushState({ modal: 'simulator' }, '', '#simulator');
    }
    simDrawer.classList.add("is-open");
    simBackdrop.classList.add("is-open");
    document.body.style.overflow = "hidden";
    renderSimulatedSpace("none");
  };

  const closeSimulator = (triggerHistoryBack = false) => {
    simDrawer.classList.remove("is-open");
    simBackdrop.classList.remove("is-open");
    document.body.style.overflow = "";

    if (triggerHistoryBack && window.location.hash === '#simulator') {
      history.back();
    }
  };

  openSimBtn.addEventListener("click", () => openSimulator(true));
  closeSimBtn.addEventListener("click", () => closeSimulator(true));
  simBackdrop.addEventListener("click", () => closeSimulator(true));

  // 3. 브라우저 뒤로가기 연동
  window.addEventListener("popstate", () => {
    if (simDrawer.classList.contains("is-open")) {
      closeSimulator(false);
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (simDrawer.classList.contains("is-open")) {
        closeSimulator(true);
      } else if (navDrawer.classList.contains("is-open")) {
        closeNavDrawer();
      }
    }
  });
}

// ==========================================
// 4. 날짜 상세 모달
// ==========================================
function initCalendarDetailModal() {
  const modal = document.getElementById("cal-detail-modal");
  const backdrop = document.getElementById("cal-modal-backdrop");
  const closeBtn = document.getElementById("btn-close-modal");

  const closeModal = () => {
    modal.removeAttribute("open");
    backdrop.classList.remove("is-open");
  };

  closeBtn.addEventListener("click", closeModal);
  backdrop.addEventListener("click", closeModal);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.hasAttribute("open")) {
      closeModal();
    }
  });
}

function openCalendarDetailModal(cellDate, dateKey, isHoliday, isLeave, isToday, subText) {
  const modal = document.getElementById("cal-detail-modal");
  const backdrop = document.getElementById("cal-modal-backdrop");
  const dateTextEl = document.getElementById("modal-date-text");
  const badgeEl = document.getElementById("modal-badge-text");
  const nameEl = document.getElementById("modal-info-name");
  const descEl = document.getElementById("modal-info-desc");
  const iconEl = document.getElementById("modal-type-icon");

  const dayName = ['일', '월', '화', '수', '목', '금', '토'][cellDate.getDay()];
  dateTextEl.innerText = `${cellDate.getFullYear()}년 ${cellDate.getMonth() + 1}월 ${cellDate.getDate()}일 (${dayName})`;

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

  modal.setAttribute("open", "");
  backdrop.classList.add("is-open");
}

// ==========================================
// 5. 스크롤 FAB 버튼 & 테마 관리 (모바일 스크롤 감지)
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

  // 모바일 전용 스크롤 숨김 로직
  let isScrolled = false;
  window.addEventListener("scroll", () => {
    if (window.innerWidth >= 1024) return; // PC 모드에선 숨기지 않음

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
// 6. 동적 공휴일 수집 (Nager.Date API)
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
// 7. 클린 플립 카운트다운
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
    showBreakMessage(`현재 ${offName} 진행 중입니다. 충전의 시간을 가지세요.`);
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
// 8. 분석 및 연차 추천 연산 코어
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
          badge: `연차 1일 = ${totalRest}일 휴식`
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
            badge: `연차 1일 = ${blockLength + 1}일 휴식`
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
            badge: `연차 1일 = ${blockLength + 1}일 휴식`
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
    .sort((a, b) => a.leaveDate - b.leaveDate)
    .slice(0, 4);
}

// ==========================================
// 9. 캘린더 그리드 DOM 생성 (클릭 모달 연동)
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

    cell.innerHTML = `
      <span class="cal-date-num">${cellDate.getDate()}</span>
      <span class="cal-sub-label">${subText}</span>
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
// 10. 메인 화면 렌더링 (실시간 고정 월)
// ==========================================
async function renderMainRealtimeSpace() {
  await ensureHolidaysForYear(currentRealYear);

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
  const mainRecs = calculateVacationsForBase(today);
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
}

// ==========================================
// 11. 미래 연차 시뮬레이터 렌더링 (오늘로 이동하기 동적 토글)
// ==========================================
async function renderSimulatedSpace(direction = "none") {
  await ensureHolidaysForYear(simViewYear);

  document.getElementById("sim-cal-month-year").innerText = `${simViewYear}년 ${simViewMonth + 1}월`;

  // 🌟 오늘이 속한 달인 경우 '오늘로 이동하기' 버튼 숨김 처리
  const todayBtn = document.getElementById("sim-cal-btn-today");
  const isCurrentMonthView = (simViewYear === currentRealYear && simViewMonth === currentRealMonth);
  todayBtn.classList.toggle("is-hidden", isCurrentMonthView);

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
  const simRecs = calculateVacationsForBase(simBaseDate);
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
}

// ==========================================
// 12. 시뮬레이터 캘린더 컨트롤
// ==========================================
function setupSimCalendarControls() {
  document.getElementById("sim-cal-prev").addEventListener("click", async () => {
    if (isSimCalendarSliding) return;
    simViewMonth--;
    if (simViewMonth < 0) {
      simViewMonth = 11;
      simViewYear--;
    }
    await renderSimulatedSpace("prev");
  });

  document.getElementById("sim-cal-next").addEventListener("click", async () => {
    if (isSimCalendarSliding) return;
    simViewMonth++;
    if (simViewMonth > 11) {
      simViewMonth = 0;
      simViewYear++;
    }
    await renderSimulatedSpace("next");
  });

  // '오늘로 이동하기' 클릭 시 현재 월로 복귀 및 버튼 자동 숨김
  document.getElementById("sim-cal-btn-today").addEventListener("click", async () => {
    if (isSimCalendarSliding) return;
    const isMovingForward = (currentRealYear > simViewYear) || 
      (currentRealYear === simViewYear && currentRealMonth > simViewMonth);
    
    simViewYear = currentRealYear;
    simViewMonth = currentRealMonth;
    await renderSimulatedSpace(isMovingForward ? "next" : "prev");
  });
}

// ==========================================
// 13. 초기화
// ==========================================
async function init() {
  initThemeManager();
  initNavigationAndDrawers();
  initCalendarDetailModal();
  setupOffWorkTimeInput();
  setupSimCalendarControls();

  await renderMainRealtimeSpace();
  updateCountdown();
  setInterval(updateCountdown, 1000);
}

document.addEventListener("DOMContentLoaded", init);
