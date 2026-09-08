// ============ 人物形象定制(纯 SVG 生成,不需要任何图片素材) ============
// 说明:这是简化的 Q 版简笔画风格,不是真正的动漫立绘(那需要专业美术图片素材,
// 这个环境里没有图像生成工具做不到),尽量做到能"捏脸"+"换装"的自由度。

const AVATAR_STORAGE_KEY = 'yuruAvatarConfig';

const AVATAR_OPTIONS = {
  skin: ['#ffe0bd', '#f1c27d', '#e0ac69', '#8d5524'],
  eyeShape: ['round', 'sparkly', 'sleepy', 'narrow'],
  eyeColor: ['#3a2a1a', '#4a6fa5', '#5c8a54', '#8a5c3a', '#6b4a8a'],
  hairStyle: ['short', 'long', 'twintails', 'buns', 'bald'],
  hairColor: ['#3b2a1a', '#6b4a30', '#a8763e', '#e0873f', '#5b5b5b'],
  outfit: ['flannel', 'poncho', 'vest', 'tee', 'sweater'],
  outfitColor: ['#e08a3f', '#6b8354', '#a8763e', '#33405c', '#c96f2b'],
  accessory: ['none', 'beanie', 'sunhat', 'glasses', 'scarf'],
  mouth: ['smile', 'neutral', 'open', 'shy'],
  blush: ['on', 'off'],
};

const AVATAR_LABELS = {
  round: '圆眼', sparkly: '闪亮眼', sleepy: '眯眯眼', narrow: '细长眼',
  short: '短发', long: '长发', twintails: '双马尾', buns: '丸子头', bald: '光头',
  flannel: '格子衬衫', poncho: '斗篷', vest: '马甲', tee: 'T恤', sweater: '毛衣',
  none: '无', beanie: '毛线帽', sunhat: '遮阳帽', glasses: '眼镜', scarf: '围巾',
  smile: '微笑', neutral: '平静', open: '惊讶', shy: '害羞',
  on: '有腮红', off: '无腮红',
};

function defaultAvatarConfig() {
  return {
    skin: AVATAR_OPTIONS.skin[0],
    eyeShape: 'round',
    eyeColor: AVATAR_OPTIONS.eyeColor[0],
    hairStyle: 'short',
    hairColor: AVATAR_OPTIONS.hairColor[0],
    outfit: 'flannel',
    outfitColor: AVATAR_OPTIONS.outfitColor[0],
    accessory: 'none',
    mouth: 'smile',
    blush: 'off',
  };
}

function loadAvatarConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(AVATAR_STORAGE_KEY));
    if (saved) return { ...defaultAvatarConfig(), ...saved };
  } catch { /* ignore */ }
  return defaultAvatarConfig();
}
function saveAvatarConfig(cfg) { localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(cfg)); }

function renderEyes(shape, color) {
  if (shape === 'sparkly') {
    return `<circle cx="42" cy="44" r="4" fill="${color}"/><circle cx="43.5" cy="42" r="1.4" fill="#fff"/><circle cx="41" cy="46" r="0.8" fill="#fff"/>
      <circle cx="58" cy="44" r="4" fill="${color}"/><circle cx="59.5" cy="42" r="1.4" fill="#fff"/><circle cx="57" cy="46" r="0.8" fill="#fff"/>`;
  }
  if (shape === 'sleepy') {
    return `<path d="M38,44 Q42,47 46,44" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M54,44 Q58,47 62,44" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  }
  if (shape === 'narrow') {
    return `<path d="M38,44 Q42,42 46,44" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M54,44 Q58,42 62,44" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  }
  return `<circle cx="42" cy="44" r="3" fill="${color}"/><circle cx="43" cy="43" r="1" fill="#fff"/>
    <circle cx="58" cy="44" r="3" fill="${color}"/><circle cx="59" cy="43" r="1" fill="#fff"/>`;
}

function renderMouth(type) {
  if (type === 'open') return `<ellipse cx="50" cy="55" rx="5" ry="4" fill="#7a3b3b"/>`;
  if (type === 'shy') return `<path d="M47,55 Q50,53 53,55" stroke="#3a2a1a" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
  if (type === 'neutral') return `<line x1="45" y1="55" x2="55" y2="55" stroke="#3a2a1a" stroke-width="2" stroke-linecap="round"/>`;
  return `<path d="M42,53 Q50,60 58,53" stroke="#3a2a1a" stroke-width="2" fill="none" stroke-linecap="round"/>`;
}

function renderBlush(on) {
  if (on !== 'on') return '';
  return `<ellipse cx="34" cy="50" rx="4" ry="2.5" fill="#f5a3a3" opacity=".6"/><ellipse cx="66" cy="50" rx="4" ry="2.5" fill="#f5a3a3" opacity=".6"/>`;
}

function renderAvatarSVG(cfg, size) {
  size = size || 96;
  const oc = cfg.outfitColor;
  let outfitShape;
  if (cfg.outfit === 'flannel') {
    outfitShape = `<path d="M20,100 Q20,62 50,60 Q80,62 80,100 Z" fill="${oc}"/>
      <line x1="30" y1="70" x2="70" y2="70" stroke="rgba(0,0,0,.15)" stroke-width="2"/>
      <line x1="30" y1="82" x2="70" y2="82" stroke="rgba(0,0,0,.15)" stroke-width="2"/>
      <line x1="30" y1="94" x2="70" y2="94" stroke="rgba(0,0,0,.15)" stroke-width="2"/>`;
  } else if (cfg.outfit === 'poncho') {
    outfitShape = `<path d="M12,100 Q20,58 50,58 Q80,58 88,100 Z" fill="${oc}"/>
      <path d="M12,100 L88,100" stroke="rgba(0,0,0,.1)" stroke-width="2"/>`;
  } else if (cfg.outfit === 'vest') {
    outfitShape = `<path d="M25,100 Q25,64 50,62 Q75,64 75,100 Z" fill="#fff6e8"/>
      <path d="M25,100 Q25,64 40,62 L40,100 Z" fill="${oc}"/>
      <path d="M75,100 Q75,64 60,62 L60,100 Z" fill="${oc}"/>`;
  } else if (cfg.outfit === 'sweater') {
    outfitShape = `<path d="M20,100 Q20,60 50,58 Q80,60 80,100 Z" fill="${oc}"/>
      <path d="M42,60 L50,70 L58,60" stroke="rgba(0,0,0,.15)" stroke-width="2" fill="none"/>`;
  } else {
    outfitShape = `<path d="M22,100 Q22,60 50,60 Q78,60 78,100 Z" fill="${oc}"/>`;
  }

  const head = `<circle cx="50" cy="42" r="22" fill="${cfg.skin}"/>`;

  const hc = cfg.hairColor;
  let hair = '';
  if (cfg.hairStyle === 'short') {
    hair = `<path d="M28,38 Q28,18 50,18 Q72,18 72,38 Q72,26 50,26 Q28,26 28,38 Z" fill="${hc}"/>`;
  } else if (cfg.hairStyle === 'long') {
    hair = `<path d="M26,60 Q22,20 50,16 Q78,20 74,60 Q74,30 50,28 Q26,30 26,60 Z" fill="${hc}"/>`;
  } else if (cfg.hairStyle === 'twintails') {
    hair = `<path d="M28,38 Q28,18 50,18 Q72,18 72,38 Q72,26 50,26 Q28,26 28,38 Z" fill="${hc}"/>
      <path d="M26,40 Q14,55 20,78 Q26,80 28,68 Q24,55 32,42 Z" fill="${hc}"/>
      <path d="M74,40 Q86,55 80,78 Q74,80 72,68 Q76,55 68,42 Z" fill="${hc}"/>`;
  } else if (cfg.hairStyle === 'buns') {
    hair = `<path d="M30,36 Q30,18 50,18 Q70,18 70,36 Q70,26 50,26 Q30,26 30,36 Z" fill="${hc}"/>
      <circle cx="26" cy="30" r="7" fill="${hc}"/>
      <circle cx="74" cy="30" r="7" fill="${hc}"/>`;
  }

  const accessory = (() => {
    if (cfg.accessory === 'beanie') {
      return `<path d="M27,30 Q27,10 50,10 Q73,10 73,30 L73,34 Q50,26 27,34 Z" fill="#c96f2b"/>
        <circle cx="50" cy="9" r="4" fill="#fff4e0"/>`;
    }
    if (cfg.accessory === 'sunhat') {
      return `<ellipse cx="50" cy="26" rx="34" ry="7" fill="#e0c896"/>
        <path d="M34,26 Q34,10 50,10 Q66,10 66,26 Z" fill="#eecf9e"/>`;
    }
    if (cfg.accessory === 'glasses') {
      return `<circle cx="42" cy="44" r="6" fill="none" stroke="#333" stroke-width="2"/>
        <circle cx="58" cy="44" r="6" fill="none" stroke="#333" stroke-width="2"/>
        <line x1="48" y1="44" x2="52" y2="44" stroke="#333" stroke-width="2"/>`;
    }
    if (cfg.accessory === 'scarf') {
      return `<path d="M34,58 Q50,66 66,58 L66,64 Q50,72 34,64 Z" fill="#c9524b"/>`;
    }
    return '';
  })();

  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    ${outfitShape}${head}${hair}
    ${renderEyes(cfg.eyeShape, cfg.eyeColor)}
    ${renderBlush(cfg.blush)}
    ${renderMouth(cfg.mouth)}
    ${accessory}
  </svg>`;
}

function initAvatar() {
  let config = loadAvatarConfig();

  const badge = document.getElementById('avatar-badge');
  const overlay = document.getElementById('avatar-overlay');
  const preview = document.getElementById('avatar-preview');

  function renderBadge() { badge.innerHTML = renderAvatarSVG(config, 44); }
  function renderPreview() { preview.innerHTML = renderAvatarSVG(config, 140); }

  const ROWS = [
    { id: 'row-skin', key: 'skin', options: AVATAR_OPTIONS.skin, isColor: true, label: '肤色' },
    { id: 'row-eyeShape', key: 'eyeShape', options: AVATAR_OPTIONS.eyeShape, isColor: false, label: '眼型' },
    { id: 'row-eyeColor', key: 'eyeColor', options: AVATAR_OPTIONS.eyeColor, isColor: true, label: '瞳色' },
    { id: 'row-mouth', key: 'mouth', options: AVATAR_OPTIONS.mouth, isColor: false, label: '表情' },
    { id: 'row-blush', key: 'blush', options: AVATAR_OPTIONS.blush, isColor: false, label: '腮红' },
    { id: 'row-hairStyle', key: 'hairStyle', options: AVATAR_OPTIONS.hairStyle, isColor: false, label: '发型' },
    { id: 'row-hairColor', key: 'hairColor', options: AVATAR_OPTIONS.hairColor, isColor: true, label: '发色' },
    { id: 'row-outfit', key: 'outfit', options: AVATAR_OPTIONS.outfit, isColor: false, label: '上衣款式' },
    { id: 'row-outfitColor', key: 'outfitColor', options: AVATAR_OPTIONS.outfitColor, isColor: true, label: '上衣颜色' },
    { id: 'row-accessory', key: 'accessory', options: AVATAR_OPTIONS.accessory, isColor: false, label: '配饰' },
  ];

  function renderRow(row) {
    const el = document.getElementById(row.id);
    if (!el) return;
    el.innerHTML = row.options.map(opt => {
      const active = config[row.key] === opt ? 'active' : '';
      if (row.isColor) {
        return `<button class="swatch ${active}" data-key="${row.key}" data-val="${opt}" style="background:${opt}"></button>`;
      }
      return `<button class="opt-btn ${active}" data-key="${row.key}" data-val="${opt}">${AVATAR_LABELS[opt] || opt}</button>`;
    }).join('');
    el.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        config[btn.dataset.key] = btn.dataset.val;
        saveAvatarConfig(config);
        renderAll();
      };
    });
  }

  function renderAll() {
    renderBadge();
    renderPreview();
    ROWS.forEach(renderRow);
  }

  renderAll();

  badge.onclick = () => overlay.classList.add('open');
  document.getElementById('avatar-panel-close').onclick = () => overlay.classList.remove('open');
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
}

document.addEventListener('DOMContentLoaded', () => {
  try { initAvatar(); }
  catch (e) { console.error('人物形象功能初始化失败:', e); }
});
