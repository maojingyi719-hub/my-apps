mapboxgl.accessToken = window.MAPBOX_TOKEN;

// 地图初始化如果失败(WebGL 不支持/网络问题等),用一个空操作的替身对象兜底,
// 这样搜索、收藏等不依赖地图渲染的功能仍然能正常工作,不会被这里的异常连累。
let map;
try {
  map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [0, 20],
    zoom: 2,
  });
  map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
} catch (e) {
  console.error('地图初始化失败:', e);
  const noop = () => {};
  map = {
    flyTo: noop, on: noop, addControl: noop, fitBounds: noop,
    getSource: () => null, addSource: noop, removeSource: noop,
    getLayer: () => null, addLayer: noop, removeLayer: noop,
  };
  document.getElementById('map').insertAdjacentHTML('afterbegin',
    '<div style="padding:20px;color:#c0392b;background:#fff;">⚠️ 地图加载失败,搜索/收藏仍可使用。请检查网络后刷新重试。</div>');
}

let userLocation = null;
let userMarker = null;
let searchMarker = null;
let selectedPlace = null; // { name, lng, lat }

// ---------- 收藏 (localStorage) ----------
const STORAGE_KEY = 'myMapFavorites';
function loadFavorites() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveFavorites(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}
function addFavorite(place) {
  const list = loadFavorites();
  list.push({ ...place, id: Date.now().toString() });
  saveFavorites(list);
  renderFavorites();
}
function removeFavorite(id) {
  saveFavorites(loadFavorites().filter(p => p.id !== id));
  renderFavorites();
}
function renderFavorites() {
  const list = loadFavorites();
  const el = document.getElementById('favorites-list');
  if (list.length === 0) {
    el.innerHTML = '<p style="color:#999;font-size:14px;">还没有收藏的地点</p>';
    return;
  }
  el.innerHTML = list.map(p => `
    <div class="place-row">
      <div>
        <div class="place-name">${escapeHtml(p.name)}</div>
        <div class="place-sub">${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}</div>
      </div>
      <div>
        <button data-goto="${p.id}">前往</button>
        <button class="secondary" data-del="${p.id}">删除</button>
      </div>
    </div>
  `).join('');

  el.querySelectorAll('[data-goto]').forEach(btn => {
    btn.onclick = () => {
      const p = list.find(x => x.id === btn.dataset.goto);
      if (p) {
        selectPlace(p);
        document.getElementById('panel').classList.remove('open');
      }
    };
  });
  el.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = () => removeFavorite(btn.dataset.del);
  });
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------- 当前位置 ----------
function locateMe(fly = true) {
  if (!navigator.geolocation) return alert('这个浏览器不支持定位');
  navigator.geolocation.getCurrentPosition(pos => {
    userLocation = { lng: pos.coords.longitude, lat: pos.coords.latitude };
    if (!userMarker) {
      const dot = document.createElement('div');
      dot.style.cssText = 'width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 0 0 2px rgba(37,99,235,.4);';
      userMarker = new mapboxgl.Marker({ element: dot }).setLngLat(userLocation).addTo(map);
    } else {
      userMarker.setLngLat(userLocation);
    }
    if (fly) map.flyTo({ center: userLocation, zoom: 15 });
  }, err => {
    alert('无法获取位置:' + err.message);
  }, { enableHighAccuracy: true });
}
document.getElementById('locate-btn').onclick = () => locateMe(true);
locateMe(true);

// ---------- 搜索 (Mapbox Geocoding) ----------
const searchInput = document.getElementById('search-input');
const suggestionsEl = document.getElementById('suggestions');
let searchTimer = null;

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  if (!q) { suggestionsEl.innerHTML = ''; return; }
  searchTimer = setTimeout(() => runSearch(q), 300);
});

async function runSearch(query) {
  const proximity = userLocation ? `&proximity=${userLocation.lng},${userLocation.lat}` : '';
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxgl.accessToken}&limit=8${proximity}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    renderSuggestions(data.features || []);
  } catch (e) {
    suggestionsEl.innerHTML = '<div>搜索失败,请检查网络或 token</div>';
  }
}

function renderSuggestions(features) {
  if (features.length === 0) {
    suggestionsEl.innerHTML = '<div>没有找到结果</div>';
    return;
  }
  suggestionsEl.innerHTML = features.map((f, i) => `
    <div data-idx="${i}"><b>${escapeHtml(f.text)}</b><br><span style="color:#888">${escapeHtml(f.place_name)}</span></div>
  `).join('');
  suggestionsEl.querySelectorAll('[data-idx]').forEach(row => {
    row.onclick = () => {
      const f = features[row.dataset.idx];
      const [lng, lat] = f.center;
      selectPlace({ name: f.text, lng, lat });
      suggestionsEl.innerHTML = '';
      searchInput.value = f.text;
      searchInput.blur();
    };
  });
}

// ---------- 选中一个地点 ----------
function selectPlace(place) {
  selectedPlace = place;
  if (searchMarker) searchMarker.remove();
  searchMarker = new mapboxgl.Marker({ color: '#ef4444' })
    .setLngLat([place.lng, place.lat])
    .setPopup(new mapboxgl.Popup().setHTML(`
      <div style="font-size:14px;">
        <b>${escapeHtml(place.name)}</b><br/>
        <button id="pop-fav" style="margin-top:6px;">⭐ 收藏</button>
        <button id="pop-route" style="margin-top:6px;">🧭 导航</button>
      </div>
    `))
    .addTo(map)
    .togglePopup();

  searchMarker.getPopup().on('open', () => {
    const favBtn = document.getElementById('pop-fav');
    const routeBtn = document.getElementById('pop-route');
    if (favBtn) favBtn.onclick = () => { addFavorite(place); favBtn.textContent = '已收藏 ✓'; };
    if (routeBtn) routeBtn.onclick = () => drawRoute(place);
  });

  map.flyTo({ center: [place.lng, place.lat], zoom: 15 });
}

// 长按地图任意位置也可以标记
let pressTimer = null;
map.on('touchstart', e => {
  pressTimer = setTimeout(() => {
    const { lng, lat } = e.lngLat;
    selectPlace({ name: `标记点 (${lat.toFixed(4)}, ${lng.toFixed(4)})`, lng, lat });
  }, 600);
});
map.on('touchend', () => clearTimeout(pressTimer));
map.on('touchmove', () => clearTimeout(pressTimer));
map.on('contextmenu', e => {
  const { lng, lat } = e.lngLat;
  selectPlace({ name: `标记点 (${lat.toFixed(4)}, ${lng.toFixed(4)})`, lng, lat });
});

// ---------- 路线规划 (Mapbox Directions) ----------
const ROUTE_SOURCE = 'route-source';
async function drawRoute(destination) {
  if (!userLocation) { alert('请先允许定位,才能规划从当前位置出发的路线'); return; }
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${userLocation.lng},${userLocation.lat};${destination.lng},${destination.lat}?geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.routes || data.routes.length === 0) { alert('规划路线失败'); return; }
  const route = data.routes[0];

  const geojson = { type: 'Feature', geometry: route.geometry };
  if (map.getSource(ROUTE_SOURCE)) {
    map.getSource(ROUTE_SOURCE).setData(geojson);
  } else {
    map.addSource(ROUTE_SOURCE, { type: 'geojson', data: geojson });
    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: ROUTE_SOURCE,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#2563eb', 'line-width': 5, 'line-opacity': .85 },
    });
  }

  const km = (route.distance / 1000).toFixed(1);
  const min = Math.round(route.duration / 60);
  document.getElementById('route-text').textContent = `距离约 ${km} 公里,预计 ${min} 分钟`;
  document.getElementById('route-info').classList.add('show');

  const bounds = new mapboxgl.LngLatBounds();
  route.geometry.coordinates.forEach(c => bounds.extend(c));
  map.fitBounds(bounds, { padding: 60 });
}

document.getElementById('route-clear').onclick = () => {
  document.getElementById('route-info').classList.remove('show');
  if (map.getLayer('route-line')) map.removeLayer('route-line');
  if (map.getSource(ROUTE_SOURCE)) map.removeSource(ROUTE_SOURCE);
};

// ---------- 收藏面板 ----------
document.getElementById('list-btn').onclick = () => {
  renderFavorites();
  document.getElementById('panel').classList.add('open');
};
document.getElementById('panel-close').onclick = () => {
  document.getElementById('panel').classList.remove('open');
};

renderFavorites();
