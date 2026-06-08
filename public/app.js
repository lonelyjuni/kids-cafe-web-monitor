// 지점명 간소화 헬퍼 함수
function simplifyCafeName(name) {
  return name
    .replace(/^서울형\s*키즈카페\s*/, '')
    .replace(/^시립\s*/, '')
    .replace(/^[가-힣]+구\s*/, '') // "용산구 ", "동작구 " 등 구이름 제거
    .split('(')[0] // 괄호 정보 제거
    .trim();
}

// 가장 가까운 주말 날짜 구하는 헬퍼 함수
function getUpcomingWeekend() {
  const today = new Date();
  const day = today.getDay(); // 0: 일, 1: 월, ... 6: 토
  
  let daysUntilWeekend = 0;
  if (day === 0 || day === 6) {
    daysUntilWeekend = 0; // 오늘이 주말이면 오늘
  } else {
    daysUntilWeekend = 6 - day; // 가장 가까운 토요일까지 남은 일수
  }
  
  const weekend = new Date(today);
  weekend.setDate(today.getDate() + daysUntilWeekend);
  
  const yyyy = weekend.getFullYear();
  const mm = String(weekend.getMonth() + 1).padStart(2, '0');
  const dd = String(weekend.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

let cafes = [];
let cafeTimes = {};
let selectedCafes = new Set();
let monitorIntervalId = null;
let isMuted = false;
let cacheData = {};

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Load Master cafes.json & cafe_times.json
  try {
    const [resCafes, resTimes] = await Promise.all([
      fetch('cafes.json'),
      fetch('cafe_times.json')
    ]);
    if (!resCafes.ok) throw new Error('Failed to load cafes.json');
    cafes = await resCafes.json();
    
    if (resTimes.ok) {
      cafeTimes = await resTimes.json();
    }
    renderSidebar();
  } catch (e) {
    console.error('Failed to load master assets', e);
  }

  const dateFilter = document.getElementById('filter-date');
  if (dateFilter && !dateFilter.value) {
    dateFilter.value = getUpcomingWeekend();
  }

  // 2. Set event listeners
  document.getElementById('monitor-toggle').addEventListener('click', toggleMonitoring);
  document.getElementById('mute-toggle').addEventListener('click', toggleMute);
  document.getElementById('filter-date').addEventListener('input', () => {
    // 상세 날짜 선택 시 퀵 칩의 선택 상태 제거
    document.querySelectorAll('.quick-date-btn').forEach(btn => btn.classList.remove('active'));
    updateFiltersSummary();
    renderMatrix();
  });

  // 퀵 일자 칩 렌더링
  renderQuickDates();

  // 필터 패널 접기/펼치기 및 초기 요약 바 세팅
  const filtersPanel = document.getElementById('filters-panel');
  const filtersToggleHeader = document.getElementById('filters-toggle-header');
  if (filtersToggleHeader && filtersPanel) {
    filtersToggleHeader.addEventListener('click', () => {
      filtersPanel.classList.toggle('collapsed');
    });
  }
  updateFiltersSummary();

  // 모바일 사이드바 토글 및 오버레이 바인딩
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const toggleBtn = document.getElementById('sidebar-toggle');

  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
  });

  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
  });

  sidebar.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // 단발성 조회 버튼 리스너
  document.getElementById('search-now-btn').addEventListener('click', async () => {
    const btn = document.getElementById('search-now-btn');
    btn.disabled = true;
    btn.innerText = '⚡ 조회 중...';
    try {
      await fetchSelectedCafesLive();
      if (filtersPanel) {
        filtersPanel.classList.add('collapsed'); // 조회 완료 후 패널 자동 접기
      }
    } finally {
      btn.disabled = false;
      btn.innerText = '⚡ 조회';
    }
  });

  // 키즈카페 명 텍스트 검색 리스너
  document.getElementById('cafe-search').addEventListener('input', handleCafeSearch);
});

function renderSidebar() {
  const container = document.getElementById('regions-container');
  container.innerHTML = '';
  
  const favoriteCafes = JSON.parse(localStorage.getItem('favoriteCafes') || '[]');

  // 1. 즐겨찾는 지점 아코디언 섹션 생성 (즐겨찾기한 지점이 1개 이상 있을 때만 표시)
  if (favoriteCafes.length > 0) {
    const favDiv = document.createElement('div');
    favDiv.className = 'region-accordion fav-regions-accordion';
    
    const favTitle = document.createElement('div');
    favTitle.className = 'region-title fav-region-title';
    favTitle.innerHTML = `<span>⭐ 즐겨찾는 지점 (${favoriteCafes.length})</span>`;
    
    const favList = document.createElement('div');
    favList.className = 'cafe-list';
    favList.style.display = 'block'; // 즐겨찾기 목록은 기본적으로 열어둠

    favoriteCafes.forEach(cafeId => {
      const cafe = cafes.find(c => c.id === cafeId);
      if (cafe) {
        const item = document.createElement('label');
        item.className = 'cafe-item';
        const isChecked = selectedCafes.has(cafe.id) ? 'checked' : '';
        item.innerHTML = `
          <button class="btn-fav-cafe active" data-cafe-id="${cafe.id}">★</button>
          <input type="checkbox" value="${cafe.id}" ${isChecked}>
          <span>[${cafe.region}] ${simplifyCafeName(cafe.name)}</span>
        `;
        
        // 체크박스 핸들러
        const cb = item.querySelector('input');
        cb.addEventListener('change', (e) => {
          if (e.target.checked) {
            selectedCafes.add(cafe.id);
          } else {
            selectedCafes.delete(cafe.id);
          }
          // 동기화를 위해 사이드바 전체 다시 그리기
          renderSidebar();
          renderMatrix();
        });

        // 별표 핸들러
        const favBtn = item.querySelector('.btn-fav-cafe');
        favBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          let favs = JSON.parse(localStorage.getItem('favoriteCafes') || '[]');
          favs = favs.filter(id => id !== cafe.id);
          localStorage.setItem('favoriteCafes', JSON.stringify(favs));
          renderSidebar();
        });

        favList.appendChild(item);
      }
    });

    favDiv.appendChild(favTitle);
    favDiv.appendChild(favList);
    container.appendChild(favDiv);
    
    favTitle.addEventListener('click', () => {
      const isVisible = favList.style.display === 'block';
      favList.style.display = isVisible ? 'none' : 'block';
    });
  }

  // 2. 일반 자치구 목록 렌더링
  const regions = [...new Set(cafes.map(c => c.region))].sort();

  regions.forEach(region => {
    const div = document.createElement('div');
    div.className = 'region-accordion';
    
    const title = document.createElement('div');
    title.className = 'region-title';
    title.innerHTML = `
      <div class="region-title-left">
        <span>📂 ${region}</span>
      </div>
      <button class="btn-region-sync" data-region="${region}">🔄</button>
    `;
    
    const list = document.createElement('div');
    list.className = 'cafe-list';

    const regionCafes = cafes.filter(c => c.region === region);
    regionCafes.forEach(cafe => {
      const item = document.createElement('label');
      item.className = 'cafe-item';
      
      const isFav = favoriteCafes.includes(cafe.id);
      const isChecked = selectedCafes.has(cafe.id) ? 'checked' : '';
      item.innerHTML = `
        <button class="btn-fav-cafe ${isFav ? 'active' : ''}" data-cafe-id="${cafe.id}">${isFav ? '★' : '☆'}</button>
        <input type="checkbox" value="${cafe.id}" ${isChecked}>
        <span>${cafe.name.replace(region, '').trim()}</span>
      `;
      
      const cb = item.querySelector('input');
      cb.addEventListener('change', (e) => {
        if (e.target.checked) {
          selectedCafes.add(cafe.id);
        } else {
          selectedCafes.delete(cafe.id);
        }
        renderSidebar(); // 체크 동기화를 위해 리렌더링
        renderMatrix();
      });

      const favBtn = item.querySelector('.btn-fav-cafe');
      favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        let favs = JSON.parse(localStorage.getItem('favoriteCafes') || '[]');
        if (favs.includes(cafe.id)) {
          favs = favs.filter(id => id !== cafe.id);
        } else {
          favs.push(cafe.id);
        }
        localStorage.setItem('favoriteCafes', JSON.stringify(favs));
        renderSidebar();
      });

      list.appendChild(item);
    });

    title.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-region-sync')) {
        e.stopPropagation();
        const targetCheckboxes = list.querySelectorAll('input[type="checkbox"]');
        const allChecked = Array.from(targetCheckboxes).every(cb => cb.checked);
        
        targetCheckboxes.forEach(cb => {
          cb.checked = !allChecked;
          if (!allChecked) {
            selectedCafes.add(cb.value);
          } else {
            selectedCafes.delete(cb.value);
          }
        });
        renderSidebar(); // 체크 동기화
        renderMatrix();
        return;
      }
      
      const isVisible = list.style.display === 'block';
      // Close all others
      document.querySelectorAll('.cafe-list').forEach(el => {
        // 즐겨찾기 목록은 강제로 닫지 않음
        if (!el.parentNode.classList.contains('fav-regions-accordion')) {
          el.style.display = 'none';
        }
      });
      list.style.display = isVisible ? 'none' : 'block';
    });

    div.appendChild(title);
    div.appendChild(list);
    container.appendChild(div);
  });
}

// Vercel Serverless Function Timeout 방지를 위해 3개씩 쪼개어 병렬 API 호출
async function fetchSelectedCafesLive() {
  const emptyState = document.getElementById('empty-state');
  if (selectedCafes.size === 0) {
    cacheData = {};
    emptyState.innerHTML = '<p>좌측 패널에서 조회하고자 하는 키즈카페를 선택하세요.</p>';
    emptyState.style.display = 'flex';
    renderMatrix();
    return;
  }
  
  // 조회 중 로딩 메시지 표시 및 기존 테이블 클리어
  emptyState.innerHTML = '<p>⚡ 실시간 예약 현황을 조회하는 중입니다. 잠시만 기다려주세요...</p>';
  emptyState.style.display = 'flex';
  document.getElementById('matrix-header').innerHTML = '';
  document.getElementById('matrix-body').innerHTML = '';

  const ids = Array.from(selectedCafes);
  const chunkSize = 3;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const newCache = {};
  const promises = [];

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const promise = fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cafeIds: chunk, year: currentYear, month: currentMonth })
    })
    .then(res => res.json())
    .then(result => {
      if (result.success) {
        Object.assign(newCache, result.data);
      }
    })
    .catch(err => console.error('Error fetching live scraping chunk:', err));
    
    promises.push(promise);
  }

  await Promise.all(promises);
  checkNewVacancies(newCache);
  cacheData = newCache;
  document.getElementById('last-update').innerText = `최근 갱신: ${new Date().toLocaleTimeString()}`;
  renderMatrix();
}

function checkNewVacancies(newData) {
  let hasNew = false;
  for (const id in newData) {
    const newCafe = newData[id];
    const oldCafe = cacheData[id];
    
    if (newCafe && newCafe.dates) {
      newCafe.dates.forEach(newDate => {
        newDate.sessions.forEach(newSession => {
          if (newSession.available > 0) {
            const matchedOldDate = oldCafe?.dates.find(d => d.date === newDate.date);
            const matchedOldSession = matchedOldDate?.sessions.find(s => s.sessionName === newSession.sessionName);
            if (!matchedOldSession || matchedOldSession.available === 0) {
              hasNew = true;
              const fullCafeName = cafes.find(c => c.id === id)?.name || id;
              triggerPushNotification(fullCafeName, newDate.date, newSession.sessionName, newSession.available);
            }
          }
        });
      });
    }
  }

  if (hasNew && !isMuted) {
    const audio = document.getElementById('chime-audio');
    audio.play().catch(e => console.log('Audio play blocked or unavailable:', e.message));
  }
}

function triggerPushNotification(cafeName, date, sessionName, seats) {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification(`[공석 알림] ${cafeName}`, {
      body: `${date} ${sessionName} - ${seats}석 공석 발생!`,
    });
  }
}

function renderMatrix() {
  const tableHeader = document.getElementById('matrix-header');
  const tableBody = document.getElementById('matrix-body');
  const emptyState = document.getElementById('empty-state');
  
  tableHeader.innerHTML = '';
  tableBody.innerHTML = '';

  if (selectedCafes.size === 0) {
    emptyState.innerHTML = '<p>좌측 패널에서 조회하고자 하는 키즈카페를 선택하세요.</p>';
    emptyState.style.display = 'flex';
    return;
  }

  if (Object.keys(cacheData).length === 0) {
    emptyState.innerHTML = '<p>⚠️ 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>';
    emptyState.style.display = 'flex';
    return;
  }

  // 1. 기준 날짜 확인
  let targetDate = document.getElementById('filter-date').value;
  if (!targetDate) {
    targetDate = getUpcomingWeekend();
    document.getElementById('filter-date').value = targetDate;
  }

  // 2. 선택된 키즈카페 목록 (가로축 열 헤더가 됨)
  const activeIds = Object.keys(cacheData).filter(id => selectedCafes.has(id));
  if (activeIds.length === 0) {
    emptyState.innerHTML = '<p>선택된 지점이 없거나 데이터가 비어 있습니다.</p>';
    emptyState.style.display = 'flex';
    return;
  }

  // 분 단위 변환 헬퍼 함수
  function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }

  // 지점별 실제 회차 시간대 조회 헬퍼 함수
  function getActualTimeRange(cafeId, sessionName, fallbackTime) {
    const sessionNumMatch = sessionName.match(/(\d+회)/);
    const sessionNum = sessionNumMatch ? sessionNumMatch[1] : null;
    if (sessionNum && cafeTimes[cafeId] && cafeTimes[cafeId][sessionNum]) {
      return cafeTimes[cafeId][sessionNum];
    }
    return fallbackTime;
  }

  // 세션의 시작/종료 시간에 상응하는 30분 내림/올림 슬롯 시간 계산 헬퍼 함수
  function getAlignedSlotMinutes(timeRangeStr) {
    const range = timeRangeStr.split('~').map(str => str.trim());
    if (range.length !== 2) return null;
    const startMin = timeToMinutes(range[0]);
    const endMin = timeToMinutes(range[1]);
    
    const alignedStart = Math.floor(startMin / 30) * 30;
    const alignedEnd = Math.ceil(endMin / 30) * 30;
    return { startMin, endMin, alignedStart, alignedEnd };
  }

  // 3. 동적 30분 단위 타임 슬롯 정의
  // 선택한 모든 카페들의 세션 시간대 중 최솟값과 최댓값을 구해서 슬롯 영역을 설정함 (화면 낭비 방지)
  let minTimeMin = 24 * 60; // 1440분
  let maxTimeMin = 0;
  let hasAnySession = false;

  activeIds.forEach(id => {
    const dateData = cacheData[id]?.dates?.find(d => d.date === targetDate);
    if (dateData && dateData.sessions) {
      dateData.sessions.forEach(s => {
        const timeRangeStr = getActualTimeRange(id, s.sessionName, s.time);
        const aligned = getAlignedSlotMinutes(timeRangeStr);
        if (aligned) {
          hasAnySession = true;
          if (aligned.alignedStart < minTimeMin) minTimeMin = aligned.alignedStart;
          if (aligned.alignedEnd > maxTimeMin) maxTimeMin = aligned.alignedEnd;
        }
      });
    }
  });

  if (!hasAnySession) {
    emptyState.innerHTML = `<p>📅 ${targetDate} 날짜에 운영 정보 또는 세션이 없습니다.</p>`;
    emptyState.style.display = 'flex';
    return;
  }

  // 30분 경계로 슬롯 배열 생성
  const slots = [];
  for (let m = minTimeMin; m < maxTimeMin; m += 30) {
    const sh = String(Math.floor(m / 60)).padStart(2, '0');
    const sm = String(m % 60).padStart(2, '0');
    const eh = String(Math.floor((m + 30) / 60)).padStart(2, '0');
    const em = String((m + 30) % 60).padStart(2, '0');
    slots.push({ start: `${sh}:${sm}`, end: `${eh}:${em}` });
  }

  // 데이터가 성공적으로 있으면 빈 화면 영역 제거
  emptyState.style.display = 'none';

  // 4. 테이블 가로 열 헤더 그리기 ("시간대" + 선택한 카페명들)
  const timeHeader = document.createElement('th');
  timeHeader.innerText = '시간';
  tableHeader.appendChild(timeHeader);

  activeIds.forEach(id => {
    const th = document.createElement('th');
    const rawName = cafes.find(c => c.id === id)?.name || id;
    th.innerText = simplifyCafeName(rawName);
    tableHeader.appendChild(th);
  });

  // 5. rowspan 건너뛰기 매트릭스 초기화 [slotIndex][cafeIndex]
  const skipMatrix = Array.from({ length: slots.length }, () => Array(activeIds.length).fill(false));

  // 6. 각 시간대(Row)별로 루프 돌려 행 생성
  slots.forEach((slot, slotIdx) => {
    const slotStartMin = timeToMinutes(slot.start);
    
    const tr = document.createElement('tr');
    tr.style.height = '48px'; // 높이를 살짝 키워 타임라인 채우기에 용이하게 함
    
    // 첫 번째 열: 시간대 명칭 표시 (시작 시간만 단일 표시하여 좌측 가로폭 절약!)
    const timeTd = document.createElement('td');
    timeTd.innerText = slot.start;
    tr.appendChild(timeTd);

    // 각 카페별로 해당 시간대에 운영하는 세션 정보를 셀에 배치
    activeIds.forEach((id, cafeIdx) => {
      if (skipMatrix[slotIdx][cafeIdx]) {
        return; // 이전 슬롯에서 rowspan에 의해 이미 그려진 셀이므로 건너뜀
      }

      const td = document.createElement('td');
      const dateData = cacheData[id]?.dates?.find(d => d.date === targetDate);
      const fullCafe = cafes.find(c => c.id === id);
      
      let matchedSession = null;
      let matchedTimeRangeStr = null;
      let matchedAligned = null;

      if (dateData && dateData.sessions) {
        // 이 슬롯의 시작 분(내림된 30분 단위)에 해당하는 세션이 있는지 탐색
        matchedSession = dateData.sessions.find(s => {
          const timeRangeStr = getActualTimeRange(id, s.sessionName, s.time);
          const aligned = getAlignedSlotMinutes(timeRangeStr);
          if (aligned) {
            return aligned.alignedStart === slotStartMin;
          }
          return false;
        });

        if (matchedSession) {
          matchedTimeRangeStr = getActualTimeRange(id, matchedSession.sessionName, matchedSession.time);
          matchedAligned = getAlignedSlotMinutes(matchedTimeRangeStr);
        }
      }

      if (matchedSession && matchedAligned) {
        const durationMin = matchedAligned.alignedEnd - matchedAligned.alignedStart;
        const span = Math.max(1, Math.round(durationMin / 30));

        td.rowSpan = span;

        // 후속 슬롯들에 대해 skip 설정
        for (let s = 1; s < span; s++) {
          if (slotIdx + s < slots.length) {
            skipMatrix[slotIdx + s][cafeIdx] = true;
          }
        }

        const card = document.createElement('div');
        card.className = `session-card ${matchedSession.available > 0 ? 'available' : ''}`;
        
        // 회차 이름, 실제 시간대, 예약 현황 렌더링 (카드 전체 영역을 채우도록 세부 디자인 구성)
        card.innerHTML = `
          <div style="font-weight: 700; margin-bottom: 2px;">${matchedSession.sessionName}</div>
          <div style="opacity: 0.8; font-size: 0.65rem; margin-bottom: 2px;">${matchedTimeRangeStr}</div>
          <div style="font-size: 0.7rem; font-weight: 600; margin-top: auto; padding-top: 2px; border-top: 1px dashed rgba(255,255,255,0.15);">
            ${matchedSession.available}석 / ${matchedSession.total}석
          </div>
        `;
        
        if (matchedSession.available > 0) {
          card.style.cursor = 'pointer';
          card.addEventListener('click', () => {
            if (fullCafe) window.open(fullCafe.url, '_blank');
          });
        }
        td.appendChild(card);
      } else {
        td.innerHTML = '<span class="status-closed">미운영</span>';
      }
      tr.appendChild(td);
    });
    tableBody.appendChild(tr);
  });
}

function toggleMonitoring() {
  const btn = document.getElementById('monitor-toggle');
  if (monitorIntervalId) {
    clearInterval(monitorIntervalId);
    monitorIntervalId = null;
    btn.innerText = '● 모니터링 중지됨';
    btn.className = 'btn btn-inactive';
  } else {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    const secs = parseInt(document.getElementById('interval-select').value, 10);
    fetchSelectedCafesLive();
    monitorIntervalId = setInterval(fetchSelectedCafesLive, secs * 1000);
    btn.innerText = '● 모니터링 중...';
    btn.className = 'btn';
  }
}

function toggleMute() {
  const btn = document.getElementById('mute-toggle');
  isMuted = !isMuted;
  btn.innerText = isMuted ? '🔇 음소거됨' : '🔊 소리 켬';
  btn.className = isMuted ? 'btn btn-secondary btn-muted' : 'btn btn-secondary';
}

function handleCafeSearch(e) {
  const query = e.target.value.toLowerCase().trim();
  const accordions = document.querySelectorAll('.region-accordion');

  accordions.forEach(acc => {
    const items = acc.querySelectorAll('.cafe-item');
    let visibleCount = 0;

    items.forEach(item => {
      const cafeName = item.querySelector('span').innerText.toLowerCase();
      if (cafeName.includes(query)) {
        item.style.display = 'flex';
        visibleCount++;
      } else {
        item.style.display = 'none';
      }
    });

    const list = acc.querySelector('.cafe-list');
    if (query !== '') {
      if (visibleCount > 0) {
        acc.style.display = 'block';
        list.style.display = 'block'; // 검색 매칭 시 아코디언 강제 오픈
      } else {
        acc.style.display = 'none';
      }
    } else {
      // 검색어가 비었을 때는 초기 상태 복원 (사이드바 목록 모두 보이고 아코디언은 다 닫음)
      acc.style.display = 'block';
      list.style.display = 'none';
    }
  });
}

// 2026년 대한민국 공휴일 목록
const HOLIDAYS_2026 = [
  '2026-01-01', // 신정
  '2026-02-16', '2026-02-17', '2026-02-18', // 설날 연휴
  '2026-03-01', '2026-03-02', // 삼일절 + 대체공휴일
  '2026-05-05', // 어린이날
  '2026-05-24', '2026-05-25', // 부처님오신날 + 대체공휴일
  '2026-06-06', // 현충일
  '2026-08-15', '2026-08-17', // 광복절 + 대체공휴일
  '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-28', // 추석 연휴 + 대체공휴일
  '2026-10-03', '2026-10-05', // 개천절 + 대체공휴일
  '2026-10-09', // 한글날
  '2026-12-25'  // 성탄절
];

function renderQuickDates() {
  const container = document.getElementById('quick-dates-container');
  if (!container) return;
  container.innerHTML = '';

  const dateFilter = document.getElementById('filter-date');
  const today = new Date();
  
  // 향후 3주(21일)간의 날짜를 돌면서 주말(토/일) 및 공휴일 찾기
  const quickDates = [];
  for (let i = 0; i < 21; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const dayOfWeek = d.getDay(); // 0: 일, 6: 토
    
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    const isHoliday = HOLIDAYS_2026.includes(dateStr);
    
    if (isWeekend || isHoliday) {
      const dowNames = ['일', '월', '화', '수', '목', '금', '토'];
      let label = `${d.getMonth() + 1}/${d.getDate()}(${dowNames[dayOfWeek]})`;
      if (isHoliday) {
        const holidayNames = {
          '2026-01-01': '신정',
          '2026-05-05': '어린이날',
          '2026-06-06': '현충일',
          '2026-08-15': '광복절',
          '2026-08-17': '대체휴무',
          '2026-10-03': '개천절',
          '2026-10-05': '대체휴무',
          '2026-10-09': '한글날',
          '2026-12-25': '성탄절'
        };
        const hName = holidayNames[dateStr] || '공휴일';
        label = `${d.getMonth() + 1}/${d.getDate()}(${hName})`;
      }
      
      quickDates.push({
        date: dateStr,
        label,
        isHoliday,
        dayOfWeek
      });
    }
  }

  let activeRow = null;

  quickDates.forEach((item, idx) => {
    // 토요일(6)이거나 첫 시작 또는 행이 없을 때 새로운 주말 행(div) 생성
    if (item.dayOfWeek === 6 || !activeRow) {
      activeRow = document.createElement('div');
      activeRow.className = 'quick-week-row';
      container.appendChild(activeRow);
    }

    const btn = document.createElement('button');
    btn.className = 'quick-date-btn';
    if (item.isHoliday || item.dayOfWeek === 0) {
      btn.classList.add('holiday');
    }
    
    if (dateFilter.value === item.date) {
      btn.classList.add('active');
    }
    
    btn.innerText = item.label;
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.quick-date-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      dateFilter.value = item.date;
      
      updateFiltersSummary();
      
      const searchBtn = document.getElementById('search-now-btn');
      searchBtn.disabled = true;
      searchBtn.innerText = '⚡ 조회 중...';
      try {
        await fetchSelectedCafesLive();
        
        // 날짜를 선택하여 조회가 끝나면 자동으로 필터 패널 접기
        const panel = document.getElementById('filters-panel');
        if (panel) panel.classList.add('collapsed');
      } finally {
        searchBtn.disabled = false;
        searchBtn.innerText = '⚡ 조회';
      }
    });
    activeRow.appendChild(btn);
  });
}

function updateFiltersSummary() {
  const dateVal = document.getElementById('filter-date').value;
  const summaryText = document.getElementById('filters-summary-text');
  if (dateVal && summaryText) {
    const d = new Date(dateVal);
    const dowNames = ['일', '월', '화', '수', '목', '금', '토'];
    summaryText.innerHTML = `📅 현재 조회 날짜: <b>${dateVal} (${dowNames[d.getDay()]})</b> <span style="font-size:0.7rem; font-weight:normal; opacity:0.6; margin-left:8px;">[터치하여 날짜 변경]</span>`;
  }
}


