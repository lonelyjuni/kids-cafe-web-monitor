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

  // Unique dates extraction
  let allDates = new Set();
  for (const id in cacheData) {
    if (cacheData[id] && cacheData[id].dates) {
      cacheData[id].dates.forEach(d => allDates.add(d.date));
    }
  }
  let sortedDates = Array.from(allDates).sort();

  // Filters application
  const isWeekendOnly = document.getElementById('filter-weekend').checked;
  const isAvailableOnly = document.getElementById('filter-available').checked;
  const targetDate = document.getElementById('filter-date').value;

  if (isWeekendOnly) {
    sortedDates = sortedDates.filter(dateStr => {
      const day = new Date(dateStr).getDay();
      return day === 0 || day === 6; // 토요일(6), 일요일(0)
    });
  }
  if (targetDate) {
    sortedDates = sortedDates.filter(d => d === targetDate);
  }

  // Header rendering
  const cornerHeader = document.createElement('th');
  cornerHeader.innerText = '키즈카페 명';
  tableHeader.appendChild(cornerHeader);

  sortedDates.forEach(date => {
    const th = document.createElement('th');
    const day = new Date(date).getDay();
    const dow = ['일', '월', '화', '수', '목', '금', '토'][day];
    th.innerText = `${date.substring(5)} (${dow})`;
    tableHeader.appendChild(th);
  });

  // Body rendering
  for (const id in cacheData) {
    const tr = document.createElement('tr');
    const nameTd = document.createElement('td');
    const fullCafe = cafes.find(c => c.id === id);
    nameTd.innerText = fullCafe ? fullCafe.name : id;
    tr.appendChild(nameTd);

    sortedDates.forEach(date => {
      const td = document.createElement('td');
      const matchedDate = cacheData[id]?.dates.find(d => d.date === date);

      if (matchedDate) {
        matchedDate.sessions.forEach(session => {
          if (isAvailableOnly && session.available === 0) return;
          
          const card = document.createElement('div');
          card.className = `session-card ${session.available > 0 ? 'available' : ''}`;
          card.innerHTML = `${session.sessionName}<br>${session.time}<br><b>${session.available}석</b> / ${session.total}석`;
          
          if (session.available > 0) {
            card.addEventListener('click', () => {
              if (fullCafe) window.open(fullCafe.url, '_blank');
            });
          }
          td.appendChild(card);
        });
      }
      tr.appendChild(td);
    });
    tableBody.appendChild(tr);
  }
}

function toggleMonitoring() {
  const btn = document.getElementById('monitor-toggle');
  if (monitorIntervalId) {
    clearInterval(monitorIntervalId);
    monitorIntervalId = null;
    btn.innerText = '🔴 모니터링 중지됨';
    btn.className = 'btn btn-inactive';
  } else {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
    const secs = parseInt(document.getElementById('interval-select').value, 10);
    fetchSelectedCafesLive();
    monitorIntervalId = setInterval(fetchSelectedCafesLive, secs * 1000);
    btn.innerText = '🟢 모니터링 중...';
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
