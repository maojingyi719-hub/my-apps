// ============ 所有对外网络请求都集中在这个文件 ============
// 地图/搜索/路线用 Mapbox,天气用 Open-Meteo,百科用 Wikipedia

// ---------- Mapbox: 地点搜索 ----------
async function geocodeSearch(query, proximity) {
  const prox = proximity ? `&proximity=${proximity.lng},${proximity.lat}` : '';
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxgl.accessToken}&limit=8${prox}`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.features || []).map(f => ({ name: f.text, fullName: f.place_name, lng: f.center[0], lat: f.center[1] }));
}

// ---------- Mapbox: 两点间路线(用于画线 + 总时间/距离) ----------
async function getDirections(coords, profile) {
  // coords: [{lng,lat}, ...] 按顺序连接
  const coordStr = coords.map(c => `${c.lng},${c.lat}`).join(';');
  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordStr}?geometries=geojson&overview=full&steps=false&access_token=${mapboxgl.accessToken}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.routes || data.routes.length === 0) return null;
  const route = data.routes[0];
  return {
    geometry: route.geometry,
    distance: route.distance, // 米
    duration: route.duration, // 秒
    legs: route.legs.map(l => ({ distance: l.distance, duration: l.duration })),
  };
}

// ---------- Mapbox: 距离矩阵(用于自动排序) ----------
async function getMatrix(coords, profile) {
  const coordStr = coords.map(c => `${c.lng},${c.lat}`).join(';');
  const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/${profile}/${coordStr}?annotations=duration&access_token=${mapboxgl.accessToken}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.durations; // 二维数组,单位秒
}

// ---------- Open-Meteo: 天气(免费,无需 key) ----------
const WEATHER_CODE_MAP = {
  0: ['☀️', '晴朗'], 1: ['🌤️', '大致晴朗'], 2: ['⛅', '多云'], 3: ['☁️', '阴天'],
  45: ['🌫️', '雾'], 48: ['🌫️', '霜雾'],
  51: ['🌦️', '小毛毛雨'], 53: ['🌦️', '毛毛雨'], 55: ['🌧️', '大毛毛雨'],
  61: ['🌦️', '小雨'], 63: ['🌧️', '中雨'], 65: ['🌧️', '大雨'],
  71: ['🌨️', '小雪'], 73: ['🌨️', '中雪'], 75: ['❄️', '大雪'],
  80: ['🌦️', '阵雨'], 81: ['🌧️', '强阵雨'], 82: ['⛈️', '暴雨'],
  95: ['⛈️', '雷雨'], 96: ['⛈️', '雷雨伴冰雹'], 99: ['⛈️', '强雷雨伴冰雹'],
};
function weatherLabel(code) {
  return WEATHER_CODE_MAP[code] || ['🌡️', '天气未知'];
}

async function getWeatherForDate(lat, lng, dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(dateStr + 'T00:00:00');
  const daysDiff = Math.round((target - today) / 86400000);

  if (daysDiff >= 0 && daysDiff <= 15) {
    // 在预报范围内,用真实天气预报
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&start_date=${dateStr}&end_date=${dateStr}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.daily && data.daily.time && data.daily.time.length) {
      const [emoji, text] = weatherLabel(data.daily.weathercode[0]);
      return {
        isForecast: true,
        emoji, text,
        tempMax: Math.round(data.daily.temperature_2m_max[0]),
        tempMin: Math.round(data.daily.temperature_2m_min[0]),
        precipProb: data.daily.precipitation_probability_max[0],
      };
    }
  }

  // 超出预报范围(太远的未来),用过去 5 年同月同日的历史平均值估算
  const month = dateStr.slice(5, 7), day = dateStr.slice(8, 10);
  const thisYear = today.getFullYear();
  const years = [1,2,3,4,5].map(n => thisYear - n);
  const results = await Promise.all(years.map(async y => {
    const d = `${y}-${month}-${day}`;
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${d}&end_date=${d}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.daily && data.daily.time && data.daily.time.length) {
        return {
          code: data.daily.weathercode[0],
          max: data.daily.temperature_2m_max[0],
          min: data.daily.temperature_2m_min[0],
          rain: data.daily.precipitation_sum[0],
        };
      }
    } catch { /* 忽略单年请求失败 */ }
    return null;
  }));
  const valid = results.filter(Boolean);
  if (valid.length === 0) {
    return { isForecast: false, emoji: '🌡️', text: '暂无历史数据', tempMax: null, tempMin: null, precipProb: null };
  }
  const avg = arr => arr.reduce((a,b) => a+b, 0) / arr.length;
  const rainyYears = valid.filter(v => v.rain > 0.5).length;
  const codeCounts = {};
  valid.forEach(v => { codeCounts[v.code] = (codeCounts[v.code]||0) + 1; });
  const commonCode = Object.keys(codeCounts).sort((a,b) => codeCounts[b]-codeCounts[a])[0];
  const [emoji, text] = weatherLabel(Number(commonCode));
  return {
    isForecast: false,
    emoji, text,
    tempMax: Math.round(avg(valid.map(v => v.max))),
    tempMin: Math.round(avg(valid.map(v => v.min))),
    precipProb: Math.round((rainyYears / valid.length) * 100),
  };
}

// ---------- 维基百科简介(免费,无需 key) ----------
async function getWikiSummary(placeName) {
  try {
    const searchUrl = `https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(placeName)}&format=json&origin=*&srlimit=1`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    const hit = searchData.query && searchData.query.search && searchData.query.search[0];
    if (!hit) return null;
    const title = hit.title;
    const sumUrl = `https://zh.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const sumRes = await fetch(sumUrl);
    const sumData = await sumRes.json();
    return {
      title: sumData.title,
      extract: sumData.extract,
      url: sumData.content_urls && sumData.content_urls.desktop ? sumData.content_urls.desktop.page : null,
    };
  } catch {
    return null;
  }
}

function googleMapsReviewUrl(place) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}&query_place_id=`;
}
