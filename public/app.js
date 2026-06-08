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
let selectedCafes = new Set();
let monitorIntervalId = null;
let isMuted = false;
let cacheData = {};

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Load Master cafes.json
  try {
    const res = await fetch('cafes.json');
    if (!res.ok) throw new Error('Network response was not ok');
    cafes = await res.json();
    renderSidebar();
  } catch (e) {
    console.error('Failed to load cafes.json', e);
  }

  const dateFilter = document.getElementById('filter-date');
  if (dateFilter && !dateFilter.value) {
    dateFilter.value = getUpcomingWeekend();
  }

  // 2. Set event listeners
  document.getElementById('monitor-toggle').addEventListener('click', toggleMonitoring);
  document.getElementById('mute-toggle').addEventListener('click', toggleMute);
  document.getElementById('filter-weekend').addEventListener('change', renderMatrix);
  document.getElementById('filter-available').addEventListener('change', renderMatrix);
  document.getElementById('filter-date').addEventListener('input', renderMatrix);

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

  // 단발성 조회 버튼 리스너
  document.getElementById('search-now-btn').addEventListener('click', async () => {
    const btn = document.getElementById('search-now-btn');
    btn.disabled = true;
    btn.innerText = '⚡ 조회 중...';
    try {
      await fetchSelectedCafesLive();
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
  
  const regions = [...new Set(cafes.map(c => c.region))].sort();

  regions.forEach(region => {
    const div = document.createElement('div');
    div.className = 'region-accordion';
    
    const title = document.createElement('div');
    title.className = 'region-title';
    title.innerHTML = `<span>📂 ${region}</span> <button class="btn-region-sync" data-region="${region}">🔄</button>`;
    
    const list = document.createElement('div');
    list.className = 'cafe-list';

    const regionCafes = cafes.filter(c => c.region === region);
    regionCafes.forEach(cafe => {
      const item = document.createElement('label');
      item.className = 'cafe-item';
      item.innerHTML = `<input type="checkbox" value="${cafe.id}"> <span>${cafe.name.replace(region, '').trim()}</span>`;
      
      const cb = item.querySelector('input');
      cb.addEventListener('change', (e) => {
        if (e.target.checked) {
          selectedCafes.add(cafe.id);
          // 모바일 해상도(768px 이하)일 때 체크 시 사이드바 자동 닫기
          if (window.innerWidth <= 768) {
            setTimeout(() => {
              document.getElementById('sidebar').classList.remove('open');
              document.getElementById('sidebar-overlay').classList.remove('open');
            }, 300);
          }
        } else {
          selectedCafes.delete(cafe.id);
        }
        fetchSelectedCafesLive();
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
        fetchSelectedCafesLive();
        return;
      }
      
      const isVisible = list.style.display === 'block';
      // Close all others
      document.querySelectorAll('.cafe-list').forEach(el => el.style.display = 'none');
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
    emptyState.style.display = 'flex';
    renderMatrix();
    return;
  }
  
  emptyState.style.display = 'none';

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
  if (Notification.permission === 'granted') {
    new Notification(`[공석 알림] ${cafeName}`, {
      body: `${date} ${sessionName} - ${seats}석 공석 발생!`,
    });
  }
}

function renderMatrix() {
  const tableHeader = document.getElementById('matrix-header');
  const tableBody = document.getElementById('matrix-body');
  tableHeader.innerHTML = '';
  tableBody.innerHTML = '';

  if (Object.keys(cacheData).length === 0) return;

  // 1. 기준 날짜 확인
  let targetDate = document.getElementById('filter-date').value;
  if (!targetDate) {
    targetDate = getUpcomingWeekend();
    document.getElementById('filter-date').value = targetDate;
  }

  // 2. 선택된 키즈카페 목록 (가로축 열 헤더가 됨)
  const activeIds = Object.keys(cacheData).filter(id => selectedCafes.has(id));
  if (activeIds.length === 0) return;

  // 3. 해당 날짜에 매칭되는 지점들의 시간대(time) 목록 유니크 추출 (세로축 행 헤더가 됨)
  let allTimes = new Set();
  activeIds.forEach(id => {
    const dateData = cacheData[id]?.dates.find(d => d.date === targetDate);
    if (dateData && dateData.sessions) {
      dateData.sessions.forEach(s => {
        if (s.time) allTimes.add(s.time);
      });
    }
  });
  const sortedTimes = Array.from(allTimes).sort(); // 시간대 정렬 (예: 09:30~11:30, 13:00~15:00 등)

  // 4. 테이블 가로 열 헤더 그리기 ("시간대" + 선택한 카페명들)
  const timeHeader = document.createElement('th');
  timeHeader.innerText = '운영 시간대';
  tableHeader.appendChild(timeHeader);

  activeIds.forEach(id => {
    const th = document.createElement('th');
    const rawName = cafes.find(c => c.id === id)?.name || id;
    th.innerText = simplifyCafeName(rawName);
    tableHeader.appendChild(th);
  });

  // 5. 필터 값 읽기
  const isAvailableOnly = document.getElementById('filter-available').checked;

  // 6. 각 시간대(Row)별로 루프 돌려 행 생성
  sortedTimes.forEach(time => {
    const tr = document.createElement('tr');
    
    // 첫 번째 열: 시간대 명칭 표시
    const timeTd = document.createElement('td');
    timeTd.innerText = time;
    tr.appendChild(timeTd);

    // 각 카페별로 해당 시간대에 운영하는 세션 정보를 셀에 배치
    activeIds.forEach(id => {
      const td = document.createElement('td');
      const dateData = cacheData[id]?.dates.find(d => d.date === targetDate);
      const fullCafe = cafes.find(c => c.id === id);
      
      if (dateData && dateData.sessions) {
        // 해당 시간대(time)와 정확히 일치하는 세션(들) 찾기
        const matchedSessions = dateData.sessions.filter(s => s.time === time);
        
        matchedSessions.forEach(session => {
          if (isAvailableOnly && session.available === 0) return;

          const card = document.createElement('div');
          card.className = `session-card ${session.available > 0 ? 'available' : ''}`;
          
          // 회차 이름 및 정보 렌더링
          card.innerHTML = `${session.sessionName}<br><b>${session.available}석</b> / ${session.total}석`;
          
          if (session.available > 0) {
            card.addEventListener('click', () => {
              if (fullCafe) window.open(fullCafe.url, '_blank');
            });
          }
          td.appendChild(card);
        });
      }
      
      // 데이터가 아예 없는 경우
      if (td.children.length === 0) {
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
    if (Notification.permission === 'default') {
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
