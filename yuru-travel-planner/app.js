// mapboxgl 有可能因为广告拦截插件/网络问题没有加载成功,这里不能直接用,
// 否则这一行报错会导致整个文件后面的代码(包括搜索、日期、备注这些不依赖地图的功能)全部不执行。
if (typeof mapboxgl !== 'undefined') {
  mapboxgl.accessToken = window.MAPBOX_TOKEN;
}

const STORAGE_KEY = 'yuruTripData';
let state = null;
let dayMap = null;
let dayMarkers = [];
const DAY_ROUTE_SOURCE = 'day-route-source';

// ---------- 状态存取 ----------
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) return saved;
  } catch { /* ignore */ }
  return {
    tripName: '', startDate: '', endDate: '',
    places: {}, notes: {}, dayAssignment: {}, dayMode: {}, activeDay: null,
  };
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function genId() { return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function getDateRange(start, end) {
  const dates = [];
  let cur = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  if (isNaN(cur) || isNaN(last) || last < cur) return dates;
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}
function formatDayLabel(dateStr, n) {
  const [, m, d] = dateStr.split('-');
  return `Day${n} ${Number(m)}/${Number(d)}`;
}

// ---------- 初始化 ----------
document.addEventListener('DOMContentLoaded', init);

function init() {
  state = loadState();
  document.getElementById('trip-name').value = state.tripName || '';
  document.getElementById('start-date').value = state.startDate || '';
  document.getElementById('end-date').value = state.endDate || '';

  // 搜索等基础交互要先绑定,确保就算地图初始化失败也不影响其它功能
  wireTopEvents();
  try {
    buildDayPanelSkeleton();
  } catch (e) {
    console.error('地图初始化失败:', e);
    document.getElementById('day-panel').insertAdjacentHTML('afterbegin',
      '<div class="card" style="color:#c0392b;">⚠️ 地图加载失败,其它功能不受影响。请检查网络或刷新页面重试。</div>');
  }
  renderPool();
  renderDayTabs();
  if (state.activeDay) renderDayContent(state.activeDay);
}

function wireTopEvents() {
  document.getElementById('trip-name').oninput = e => { state.tripName = e.target.value; saveState(); };

  document.getElementById('start-date').onchange = e => {
    state.startDate = e.target.value;
    if (state.endDate && state.endDate < state.startDate) {
      state.endDate = state.startDate;
      document.getElementById('end-date').value = state.endDate;
    }
    saveState();
    renderDayTabs(); renderPool();
    if (state.activeDay) renderDayContent(state.activeDay);
  };
  document.getElementById('end-date').onchange = e => {
    state.endDate = e.target.value;
    if (state.startDate && state.endDate < state.startDate) {
      state.startDate = state.endDate;
      document.getElementById('start-date').value = state.startDate;
    }
    saveState();
    renderDayTabs(); renderPool();
    if (state.activeDay) renderDayContent(state.activeDay);
  };

  const searchInput = document.getElementById('search-input');
  const suggestionsEl = document.getElementById('suggestions');
  let searchTimer = null;

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (!q) { suggestionsEl.innerHTML = ''; return; }
    searchTimer = setTimeout(async () => {
      let results = [];
      try { results = await geocodeSearch(q); } catch { /* ignore */ }
      if (results.length === 0) {
        suggestionsEl.innerHTML = '<div>没有找到结果</div>';
        return;
      }
      suggestionsEl.innerHTML = results.map((r, i) => `
        <div data-idx="${i}"><b>${escapeHtml(r.name)}</b><br><span style="color:#a08a6d">${escapeHtml(r.fullName)}</span></div>
      `).join('');
      suggestionsEl.querySelectorAll('[data-idx]').forEach(row => {
        // 用 pointerdown 而不是 click:手机上点建议项时输入框会先 blur,
        // 如果用 click,等事件真正触发时 blur 的清空逻辑可能已经把这一项从 DOM 里删掉了,导致点击没反应。
        row.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          const r = results[row.dataset.idx];
          addPlaceToPool(r);
          suggestionsEl.innerHTML = '';
          searchInput.value = '';
        });
      });
    }, 300);
  });
  searchInput.addEventListener('blur', () => {
    setTimeout(() => { suggestionsEl.innerHTML = ''; }, 200);
  });
}

// ---------- 地点池(未分配到具体日期的地点) ----------
function addPlaceToPool(place) {
  const id = genId();
  state.places[id] = { name: place.name, lng: place.lng, lat: place.lat };
  state.notes[id] = '';
  saveState();
  renderPool();
}

function renderPool() {
  const poolEl = document.getElementById('pool-list');
  const emptyEl = document.getElementById('pool-empty');
  const assignedIds = new Set(Object.values(state.dayAssignment).flat());
  const unassigned = Object.keys(state.places).filter(id => !assignedIds.has(id));

  if (Object.keys(state.places).length === 0) {
    poolEl.innerHTML = ''; emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  if (unassigned.length === 0) {
    poolEl.innerHTML = '<p class="empty-hint" style="padding:4px 0;">都已经分配到具体日期啦 ✅</p>';
    return;
  }

  const dates = (state.startDate && state.endDate) ? getDateRange(state.startDate, state.endDate) : [];
  poolEl.innerHTML = unassigned.map(id => {
    const p = state.places[id];
    const options = dates.map((d, i) => `<option value="${d}">加入 ${formatDayLabel(d, i + 1)}</option>`).join('');
    return `<span class="pool-chip">
      ${escapeHtml(p.name)}
      <select data-id="${id}" ${dates.length === 0 ? 'disabled' : ''}>
        <option value="">${dates.length === 0 ? '先设置日期' : '选择日期'}</option>${options}
      </select>
      <button class="del" data-del="${id}">✕</button>
    </span>`;
  }).join('');

  poolEl.querySelectorAll('select').forEach(sel => {
    sel.onchange = () => { if (sel.value) assignPlaceToDay(sel.dataset.id, sel.value); };
  });
  poolEl.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = () => {
      delete state.places[btn.dataset.del];
      delete state.notes[btn.dataset.del];
      saveState(); renderPool();
    };
  });
}

function assignPlaceToDay(id, dateStr) {
  if (!state.dayAssignment[dateStr]) state.dayAssignment[dateStr] = [];
  state.dayAssignment[dateStr].push(id);
  saveState();
  renderPool();
  if (dateStr === state.activeDay) renderDayContent(dateStr);
}

function removeFromDay(dateStr, id) {
  state.dayAssignment[dateStr] = (state.dayAssignment[dateStr] || []).filter(x => x !== id);
  saveState();
  renderPool();
  renderDayContent(dateStr);
}

function movePlace(dateStr, id, dir) {
  const arr = state.dayAssignment[dateStr];
  const idx = arr.indexOf(id);
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= arr.length) return;
  [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
  saveState();
  renderDayContent(dateStr);
}

// ---------- 日期分页 tabs ----------
function renderDayTabs() {
  const tabsEl = document.getElementById('day-tabs');
  if (!state.startDate || !state.endDate) { tabsEl.innerHTML = ''; return; }
  const dates = getDateRange(state.startDate, state.endDate);
  if (dates.length === 0) { tabsEl.innerHTML = ''; return; }
  if (!state.activeDay || !dates.includes(state.activeDay)) state.activeDay = dates[0];
  saveState();

  tabsEl.innerHTML = dates.map((d, i) => {
    const label = formatDayLabel(d, i + 1);
    return `<button class="day-tab ${d === state.activeDay ? 'active' : ''}" data-date="${d}">${label}</button>`;
  }).join('');
  tabsEl.querySelectorAll('.day-tab').forEach(btn => {
    btn.onclick = () => {
      state.activeDay = btn.dataset.date;
      saveState();
      renderDayTabs();
      renderDayContent(state.activeDay);
    };
  });
}

// ---------- 当天面板骨架(只建一次,避免地图被重复创建) ----------
function buildDayPanelSkeleton() {
  document.getElementById('day-panel').innerHTML = `
    <div class="card weather-card" id="weather-card">
      <span class="emoji">🏕️</span>
      <div><div class="temp">请先设置行程日期并添加地点</div></div>
    </div>
    <div class="card">
      <div class="mode-toggle" id="mode-toggle">
        <button class="mode-btn" data-mode="driving">🚗 驾车</button>
        <button class="mode-btn" data-mode="cycling">🚴 骑行</button>
        <button class="mode-btn" data-mode="walking">🚶 步行</button>
      </div>
      <button id="auto-sort-btn" class="primary-btn" style="margin-top:10px;width:100%;">🔀 自动帮我排序</button>
      <div class="mode-summary" id="mode-summary">提示:步行/骑行通常更省钱,驾车通常更快,可对比后自行选择</div>
    </div>
    <div id="day-map"></div>
    <div class="card">
      <h2>📋 当天行程</h2>
      <div id="place-list"></div>
      <p class="empty-hint" id="day-empty-hint">这一天还没有安排地点,从上面"待安排的地点"里选择加入吧</p>
    </div>
  `;

  dayMap = new mapboxgl.Map({
    container: 'day-map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [0, 20], zoom: 1.5,
  });
  dayMap.addControl(new mapboxgl.NavigationControl(), 'bottom-right');

  document.querySelectorAll('#mode-toggle .mode-btn').forEach(btn => {
    btn.onclick = () => {
      if (!state.activeDay) return;
      state.dayMode[state.activeDay] = btn.dataset.mode;
      saveState();
      updateModeToggleUI(state.activeDay);
      updateRouteAndMap(state.activeDay);
    };
  });
  document.getElementById('auto-sort-btn').onclick = () => {
    if (state.activeDay) autoSortDay(state.activeDay);
  };
}

function renderDayContent(dateStr) {
  if (!dateStr) return;
  updateWeatherCard(dateStr);
  updateModeToggleUI(dateStr);
  renderPlaceList(dateStr);
  updateRouteAndMap(dateStr);
}

// ---------- 天气卡片 ----------
async function updateWeatherCard(dateStr) {
  const card = document.getElementById('weather-card');
  const ids = state.dayAssignment[dateStr] || [];
  if (ids.length === 0) {
    card.innerHTML = `<span class="emoji">🏕️</span><div><div class="temp">这一天还没有地点</div><div class="sub">添加地点后这里会显示当天天气</div></div>`;
    return;
  }
  const first = state.places[ids[0]];
  card.innerHTML = `<span class="emoji">⏳</span><div><div class="temp">天气加载中…</div></div>`;
  let w;
  try { w = await getWeatherForDate(first.lat, first.lng, dateStr); }
  catch { w = { emoji: '🌡️', text: '天气获取失败', tempMax: null, tempMin: null, precipProb: null, isForecast: false }; }

  if (state.activeDay !== dateStr) return; // 用户已经切换到别的日期,避免覆盖
  card.innerHTML = `
    <span class="emoji">${w.emoji}</span>
    <div>
      <div class="temp">${w.tempMax != null ? w.tempMin + '°~' + w.tempMax + '°' : '--'} · ${w.text}</div>
      <div class="sub">${w.precipProb != null ? '降水概率约 ' + Math.round(w.precipProb) + '%' : ''}</div>
    </div>
    <span class="note-tag">${w.isForecast ? '实时预报' : '历史同期平均'}</span>
  `;
}

function updateModeToggleUI(dateStr) {
  const mode = state.dayMode[dateStr] || 'driving';
  document.querySelectorAll('#mode-toggle .mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
}

// ---------- 地点列表 ----------
function renderPlaceList(dateStr) {
  const ids = state.dayAssignment[dateStr] || [];
  const el = document.getElementById('place-list');
  const hint = document.getElementById('day-empty-hint');
  if (ids.length === 0) { el.innerHTML = ''; hint.style.display = 'block'; return; }
  hint.style.display = 'none';

  el.innerHTML = ids.map((id, i) => {
    const p = state.places[id];
    const note = state.notes[id] || '';
    return `
    <div class="place-card" data-id="${id}">
      <div class="row1">
        <span class="badge">${i + 1}</span>
        <span class="pname">${escapeHtml(p.name)}</span>
        <button class="up-btn" title="上移" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="down-btn" title="下移" ${i === ids.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="remove-btn" title="移除">✕</button>
      </div>
      <div class="leg-info"></div>
      <div class="links">
        <a href="${googleMapsReviewUrl(p)}" target="_blank" rel="noopener">🔍 评价/最新信息</a>
        <button class="wiki-btn">📖 简介</button>
      </div>
      <div class="wiki-summary"></div>
      <textarea class="notes" placeholder="注意事项、备注…">${escapeHtml(note)}</textarea>
    </div>`;
  }).join('');

  el.querySelectorAll('.place-card').forEach(card => {
    const id = card.dataset.id;
    card.querySelector('.up-btn').onclick = () => movePlace(dateStr, id, -1);
    card.querySelector('.down-btn').onclick = () => movePlace(dateStr, id, 1);
    card.querySelector('.remove-btn').onclick = () => removeFromDay(dateStr, id);
    card.querySelector('.notes').oninput = e => { state.notes[id] = e.target.value; saveState(); };
    card.querySelector('.wiki-btn').onclick = async () => {
      const box = card.querySelector('.wiki-summary');
      if (box.classList.contains('show')) { box.classList.remove('show'); return; }
      box.textContent = '加载中…';
      box.classList.add('show');
      let wiki = null;
      try { wiki = await getWikiSummary(state.places[id].name); } catch { /* ignore */ }
      box.textContent = wiki && wiki.extract ? wiki.extract : '没有找到相关百科信息';
    };
  });
}

// ---------- 自动排序(最近邻 + 2-opt) ----------
async function autoSortDay(dateStr) {
  const ids = state.dayAssignment[dateStr] || [];
  if (ids.length < 3) { alert('至少需要 3 个地点才需要自动排序哦'); return; }
  const profile = state.dayMode[dateStr] || 'driving';
  const coords = ids.map(id => state.places[id]);

  let matrix;
  try { matrix = await getMatrix(coords, profile); }
  catch { alert('排序失败,请检查网络或 Mapbox token'); return; }
  if (!matrix) { alert('排序失败'); return; }

  const n = ids.length;
  const visited = new Array(n).fill(false);
  let order = [0]; visited[0] = true;
  for (let step = 1; step < n; step++) {
    const last = order[order.length - 1];
    let best = -1, bestVal = Infinity;
    for (let j = 0; j < n; j++) {
      if (!visited[j] && matrix[last][j] < bestVal) { bestVal = matrix[last][j]; best = j; }
    }
    order.push(best); visited[best] = true;
  }

  function routeCost(o) {
    let c = 0;
    for (let i = 0; i < o.length - 1; i++) c += matrix[o[i]][o[i + 1]];
    return c;
  }
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const newOrder = order.slice(0, i).concat(order.slice(i, k + 1).reverse(), order.slice(k + 1));
        if (routeCost(newOrder) < routeCost(order) - 1e-6) { order = newOrder; improved = true; }
      }
    }
  }

  state.dayAssignment[dateStr] = order.map(idx => ids[idx]);
  saveState();
  renderDayContent(dateStr);
}

// ---------- 路线计算 + 地图渲染 ----------
function clearDayMarkers() { dayMarkers.forEach(m => m.remove()); dayMarkers = []; }
function removeRouteLayer() {
  if (!dayMap) return;
  if (dayMap.getLayer('day-route-line')) dayMap.removeLayer('day-route-line');
  if (dayMap.getSource(DAY_ROUTE_SOURCE)) dayMap.removeSource(DAY_ROUTE_SOURCE);
}

async function updateRouteAndMap(dateStr) {
  if (!dayMap) return; // 地图初始化失败时,其它功能(搜索/收藏/天气/备注)仍可正常使用
  const ids = state.dayAssignment[dateStr] || [];
  const profile = state.dayMode[dateStr] || 'driving';
  const summaryEl = document.getElementById('mode-summary');
  clearDayMarkers();

  if (ids.length === 0) {
    removeRouteLayer();
    summaryEl.textContent = '提示:步行/骑行通常更省钱,驾车通常更快,可对比后自行选择';
    return;
  }

  const coords = ids.map(id => state.places[id]);
  ids.forEach((id, i) => {
    const p = state.places[id];
    const el = document.createElement('div');
    el.textContent = i + 1;
    el.style.cssText = 'background:#6b8354;color:#fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:bold;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3);';
    dayMarkers.push(new mapboxgl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(dayMap));
  });

  if (ids.length === 1) {
    dayMap.flyTo({ center: [coords[0].lng, coords[0].lat], zoom: 13 });
    removeRouteLayer();
    summaryEl.textContent = '只有一个地点,暂无需要规划的路线';
    return;
  }

  let route = null;
  try { route = await getDirections(coords, profile); } catch { /* ignore */ }
  if (state.activeDay !== dateStr) return;
  if (!route) { summaryEl.textContent = '路线计算失败,请检查网络或 Mapbox token'; return; }

  const geojson = { type: 'Feature', geometry: route.geometry };
  if (dayMap.getSource(DAY_ROUTE_SOURCE)) {
    dayMap.getSource(DAY_ROUTE_SOURCE).setData(geojson);
  } else {
    dayMap.addSource(DAY_ROUTE_SOURCE, { type: 'geojson', data: geojson });
    dayMap.addLayer({
      id: 'day-route-line', type: 'line', source: DAY_ROUTE_SOURCE,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#e08a3f', 'line-width': 5, 'line-opacity': .85 },
    });
  }
  const bounds = new mapboxgl.LngLatBounds();
  route.geometry.coordinates.forEach(c => bounds.extend(c));
  dayMap.fitBounds(bounds, { padding: 50 });

  const km = (route.distance / 1000).toFixed(1);
  const mins = Math.round(route.duration / 60);
  const modeLabel = { driving: '驾车', cycling: '骑行', walking: '步行' }[profile];
  summaryEl.textContent = `${modeLabel}总计约 ${km} 公里 · ${mins} 分钟(${ids.length} 个地点)`;

  route.legs.forEach((leg, i) => {
    const legEl = document.querySelector(`.place-card[data-id="${ids[i]}"] .leg-info`);
    if (legEl) {
      const lm = Math.round(leg.duration / 60);
      const lk = (leg.distance / 1000).toFixed(1);
      legEl.textContent = `→ 到下一站约 ${lk} 公里 · ${lm} 分钟`;
    }
  });
}
