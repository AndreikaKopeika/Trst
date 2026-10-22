// Точка входа: меню, настройки, полный экран, главный цикл.
import * as THREE from './lib/three.module.min.js';
import { Game } from './game.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { createHost, createClient, makeCode } from './net.js';
import { Post } from './post.js';
import { PRESETS, preset } from './quality.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('cb_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('cb_' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};

const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const coarse = matchMedia('(pointer: coarse)').matches;
if (!coarse) document.body.classList.add('desktop');

const settings = {
  sens: store.get('sens', 1),
  adsSens: store.get('adsSens', 1),
  invertY: store.get('invertY', false),
  quality: store.get('quality', isTouch ? 'med' : 'high'),
  res: store.get('res', 'auto'),
  sharp: store.get('sharp', null),
  gfx: store.get('gfx', { shadows: null, bloom: null, far: 1 }),
  showFps: store.get('showFps', false),
  sound: store.get('sound', true),
  leftFire: store.get('leftFire', true),
  view: store.get('view', 'first'),
  fov: store.get('fov', coarse ? 75 : 85),
  btnScale: store.get('btnScale', 1),
  btnAlpha: store.get('btnAlpha', 1),
  layout: store.get('layout', {}),
  botSkill: store.get('botSkill', 1),
  botBuild: store.get('botBuild', true),
};
if (!PRESETS[settings.quality]) settings.quality = 'med';

const canvas = $('game');
// сглаживание и апскейл делает постобработка — у самого холста AA не нужен
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const post = new Post(renderer);
let dynScale = 1;
const _sz = new THREE.Vector2();
function applySize() {
  const P = preset(settings.quality);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, P.dpr));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.getDrawingBufferSize(_sz);
  post.setSize(_sz.x, _sz.y);
  applyPost();
  if (game) game.resize(innerWidth, innerHeight);
  applyLayout();
}
function renderScale() {
  const P = preset(settings.quality);
  if (settings.res === 'auto') return Math.max(0.42, P.scale * dynScale);
  return Number(settings.res) || 1;
}
function applyPost() {
  const P = preset(settings.quality), G = settings.gfx;
  post.configure({
    scale: renderScale(), msaa: P.msaa,
    bloom: G.bloom === false ? 0 : G.bloom === true ? (P.bloom || 0.55) : P.bloom,
    sharp: settings.sharp ?? P.sharp, grade: P.grade, vig: P.vig,
  });
  updateGfxInfo();
}

const hud = new HUD();
const audio = new Audio();
audio.enabled = settings.sound;
const input = new Input(canvas);
input.sens = settings.sens; input.invertY = settings.invertY;
let game = null;
let paused = false;
input.onMode = (m) => { document.body.classList.toggle('desktop', m === 'desktop'); updateLockHint(); };
input.onLockChange = (locked) => {
  updateLockHint();
  // вышли из захвата мыши (Esc) во время игры — пауза
  if (!locked && game && game.ready && !paused && input.mode === 'desktop' && document.body.classList.contains('playing')) setPause(true);
};
function updateLockHint() {
  const show = input.mode === 'desktop' && !input.locked && !!game && !paused && document.body.classList.contains('playing');
  $('lockHint').classList.toggle('hidden', !show);
}

// ---------- меню ----------
let team = store.get('team', 0);
$('nick').value = store.get('nick', '') || '';
$('botCount').value = String(store.get('bots', 2));
$('botSkill').value = String(settings.botSkill);
$('botSkill').addEventListener('change', (e) => { settings.botSkill = Number(e.target.value); store.set('botSkill', settings.botSkill); });
function selTeam(t) {
  team = t;
  document.querySelectorAll('.teamBtn').forEach(b => b.classList.toggle('sel', Number(b.dataset.team) === t));
}
selTeam(team);
let mapId = store.get('map', 'classic');
function selMap(m) { mapId = m; document.querySelectorAll('.mapBtn').forEach(b => b.classList.toggle('sel', b.dataset.map === m)); store.set('map', m); }
selMap(mapId);
document.querySelectorAll('.mapBtn').forEach(b => b.addEventListener('click', () => selMap(b.dataset.map)));
document.querySelectorAll('.teamBtn').forEach(b => b.addEventListener('click', () => selTeam(Number(b.dataset.team))));
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) { $('roomCode').value = urlRoom.toUpperCase(); status('Тебя пригласили! Выбери команду и жми «Войти»'); }

function status(t, err = false) { const s = $('menuStatus'); s.textContent = t; s.classList.toggle('err', err); }
function nick() {
  const n = $('nick').value.trim().slice(0, 14) || 'Курица' + Math.floor(Math.random() * 90 + 10);
  store.set('nick', $('nick').value.trim()); store.set('team', team); store.set('bots', Number($('botCount').value));
  return n;
}
function loading(on, text) { $('loading').classList.toggle('hidden', !on); if (text) $('loadingText').textContent = text; }

async function goFullscreen() {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } catch (e) { /* iOS не умеет — ничего страшного */ }
  try { await screen.orientation.lock('landscape'); } catch (e) { /* ignore */ }
}

function makeGame(mode, net, code) {
  return new Game({
    renderer, hud, audio, input, settings, mode, net, code, post,
    createNet: () => createClient(),
    onPause: () => setPause(true),
    onExit: (reason) => exitToMenu(reason),
    onReady: () => { loading(false); enterPlay(); },
  });
}

function enterPlay() {
  $('menu').classList.add('hidden');
  document.body.classList.add('playing');
  input.active = true;
  input.reset();
  if (input.mode === 'desktop') input.lock();
  updateLockHint();
  $('btnFire2').classList.toggle('hidden', !settings.leftFire);
  if (game && game.code) { $('pauseRoom').textContent = 'Код комнаты: ' + game.code; }
}

function exitToMenu(reason) {
  if (game) { game.dispose(); game = null; }
  hud.show(false);
  setPause(false);
  input.active = false;
  document.body.classList.remove('playing');
  $('menu').classList.remove('hidden');
  $('hostShare').classList.add('hidden');
  loading(false);
  if (document.pointerLockElement) document.exitPointerLock();
  if (reason) status(reason, true);
}

$('btnSolo').addEventListener('click', async () => {
  audio.init(); goFullscreen();
  const n = nick();
  loading(true, 'Строим мир…');
  await new Promise(r => setTimeout(r, 30));
  game = makeGame('solo', null, '');
  game.startHost(n, team, Math.max(1, Number($('botCount').value)), mapId, { skill: settings.botSkill, build: settings.botBuild });
  applySize();
});

$('btnHost').addEventListener('click', async () => {
  audio.init(); goFullscreen();
  const n = nick();
  loading(true, 'Создаём комнату…');
  let code = makeCode(), net = null;
  for (let tries = 0; tries < 3; tries++) {
    net = createHost();
    try { await net.start(code); break; } catch (e) {
      net.close(); net = null;
      if (e && e.type === 'unavailable-id') { code = makeCode(); continue; }
      loading(false); status('Ошибка сети: ' + (e.message || e.type || e), true); return;
    }
  }
  if (!net) { loading(false); status('Не удалось создать комнату', true); return; }
  loading(true, 'Строим мир…');
  await new Promise(r => setTimeout(r, 30));
  game = makeGame('host', net, code);
  game.code = code;
  game.startHost(n, team, Number($('botCount').value), mapId, { skill: settings.botSkill, build: settings.botBuild });
  applySize();
  const via = net.ok ? (net.ok[0] && net.ok[1] ? '' : net.ok[0] ? ' (только напрямую)' : ' (только через сервер)') : '';
  hud.banner('КОД КОМНАТЫ: ' + code, 'warn', 9, 'Отправь код другу (меню ☰ → Ссылка). Не сворачивай игру, пока друг подключается!' + via);
  $('shareCode').textContent = code;
  keepAwake();
});

$('btnJoin').addEventListener('click', async () => {
  audio.init();
  const code = $('roomCode').value.trim().toUpperCase();
  if (code.length !== 4) { status('Введи код из 4 символов', true); return; }
  goFullscreen();
  const n = nick();
  loading(true, 'Подключаемся к ' + code + '…');
  const net = createClient();
  try { await net.start(code, (t) => loading(true, t)); } catch (e) {
    try { net.close(); } catch (e2) { /* ignore */ }
    loading(false); status(e.message || 'Не удалось подключиться', true); return;
  }
  loading(true, 'Соединились ' + (net.mode || '') + '. Загружаем карту…');
  game = makeGame('client', net, code);
  game.code = code;
  game.via = net.mode || '';
  game.startClient(n, team);
  applySize();
  keepAwake();
  const myGame = game;
  setTimeout(() => { if (game === myGame && !game.ready) exitToMenu('Хост не прислал карту. Попроси друга не сворачивать игру и попробуй ещё раз.'); }, 30000);
});

// ---------- пауза и настройки ----------
let setTab = 'game', openedAt = 0;
function openSettings(tab, ingame) {
  const S = $('settings');
  S.classList.toggle('ingame', !!ingame);
  if (!ingame && tab === 'game') tab = 'gfx';
  selTab(tab);
  S.classList.remove('hidden');
  openedAt = performance.now();
  syncSettingsUI();
}
function closeSettings() { $('settings').classList.add('hidden'); }
function selTab(t) {
  setTab = t;
  document.querySelectorAll('#settings .tab').forEach(b => b.classList.toggle('sel', b.dataset.tab === t));
  document.querySelectorAll('#settings section').forEach(b => b.classList.toggle('sel', b.dataset.tab === t));
}
document.querySelectorAll('#settings .tab').forEach(b => b.addEventListener('click', () => { selTab(b.dataset.tab); syncSettingsUI(); }));
$('btnSettings').addEventListener('click', () => openSettings(setTab === 'game' ? 'gfx' : setTab, false));
$('setClose').addEventListener('click', () => { if (paused) resume(); else closeSettings(); });

function setPause(on) {
  paused = on;
  if (on) openSettings('game', true); else closeSettings();
  input.active = !on && !!game;
  if (on) { input.reset(); if (document.pointerLockElement) document.exitPointerLock(); }
  updateLockHint();
}
function resume() { setPause(false); if (input.mode === 'desktop') input.lock(); else goFullscreen(); }
$('btnResume').addEventListener('click', resume);
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;
  if (document.body.classList.contains('editing')) { endLayout(); return; }
  if (!$('settings').classList.contains('hidden') && performance.now() - openedAt > 400) { if (paused) resume(); else closeSettings(); }
});
$('lockHint').addEventListener('click', () => input.lock());
$('btnLeave').addEventListener('click', () => exitToMenu(''));
$('btnView').addEventListener('click', () => { if (game) game.setView(!game.firstPerson); });

// --- вкладка «Игра»: комната и сеанс ---
function syncGameTab() {
  if (!game) return;
  $('pauseRoom').innerHTML = game.code ? `Код комнаты: <b style="letter-spacing:3px;color:#ffd23a">${game.code}</b> <button id="btnCopy2">Ссылка для друга</button>` : 'Офлайн-игра с ботами';
  const c2 = $('btnCopy2'); if (c2) c2.onclick = copyLink;
  $('btnView').textContent = 'Вид: ' + (game.firstPerson ? 'от 1-го лица' : 'от 3-го лица');
  const host = game.isHost;
  $('sessHost').classList.toggle('hidden', !host);
  $('sessClient').classList.toggle('hidden', host);
  if (!host) return;
  segSel('sessMap', game.mapId || 'classic');
  segSel('sessSkill', String(game.botSkill ?? 1));
  $('botN').textContent = game.botsPerTeam;
  $('sessBuild').checked = game.botBuild !== false;
}
function segSel(id, v) { document.querySelectorAll('#' + id + ' button').forEach(b => b.classList.toggle('sel', b.dataset.v === v)); }
function onSeg(id, fn) { document.querySelectorAll('#' + id + ' button').forEach(b => b.addEventListener('click', () => { segSel(id, b.dataset.v); fn(b.dataset.v); })); }
onSeg('sessMap', (v) => { if (!game || !game.isHost) return; if (v !== game.mapId) { game.newRound(v); selMap(v); hud.banner('СМЕНА КАРТЫ', 'warn', 2); } });
onSeg('sessSkill', (v) => { settings.botSkill = Number(v); store.set('botSkill', settings.botSkill); $('botSkill').value = v; if (game) game.botSkill = settings.botSkill; });
const botStep = (d) => { if (!game || !game.isHost) return; game.setBotCount((game.botsPerTeam || 0) + d); $('botN').textContent = game.botsPerTeam; store.set('bots', game.botsPerTeam); $('botCount').value = String(Math.min(6, game.botsPerTeam)); };
$('botMinus').addEventListener('click', () => botStep(-1));
$('botPlus').addEventListener('click', () => botStep(1));
$('sessBuild').addEventListener('change', (e) => { settings.botBuild = e.target.checked; store.set('botBuild', settings.botBuild); if (game) game.botBuild = settings.botBuild; });
$('btnNewRound').addEventListener('click', () => { if (game && game.isHost) { game.newRound(); resume(); } });

// --- вкладка «Графика» ---
const Q_NOTE = {
  low: 'Для слабых телефонов: 3D рисуется в половинном разрешении и дорисовывается чётким апскейлом — FPS высокий, картинка без мыла.',
  med: 'Баланс: апскейл с 66%, цветокоррекция. Подходит большинству телефонов.',
  high: 'Солнечные тени, свечение, сглаживание. Для мощных телефонов и ПК.',
  ultra: 'Родное разрешение, мягкие тени 2048, сглаживание 4×, дальняя прорисовка. Для флагманов и игровых ПК.',
};
function setQuality(q) {
  settings.quality = q; store.set('quality', q);
  settings.gfx = { shadows: null, bloom: null, far: settings.gfx.far || 1 }; store.set('gfx', settings.gfx);
  settings.sharp = null; store.set('sharp', null);
  dynScale = 1;
  applySize();
  if (game) game.applyQuality(q);
  syncSettingsUI();
}
onSeg('qSeg', setQuality);
$('resSel').addEventListener('change', (e) => { settings.res = e.target.value; store.set('res', settings.res); dynScale = 1; applyPost(); });
$('sharp').addEventListener('input', (e) => { settings.sharp = Number(e.target.value); store.set('sharp', settings.sharp); $('sharpVal').textContent = Math.round(settings.sharp * 100) + '%'; applyPost(); });
$('farR').addEventListener('input', (e) => { settings.gfx.far = Number(e.target.value); store.set('gfx', settings.gfx); $('farVal').textContent = Math.round(settings.gfx.far * 100) + '%'; if (game) game.applyQuality(settings.quality); });
$('shadowsOn').addEventListener('change', (e) => { settings.gfx.shadows = e.target.checked; store.set('gfx', settings.gfx); if (game) game.applyQuality(settings.quality); });
$('bloomOn').addEventListener('change', (e) => { settings.gfx.bloom = e.target.checked; store.set('gfx', settings.gfx); applyPost(); });
$('fpsOn').addEventListener('change', (e) => { settings.showFps = e.target.checked; store.set('showFps', settings.showFps); $('fps').classList.toggle('hidden', !settings.showFps); });
$('fov').addEventListener('input', (e) => { settings.fov = Number(e.target.value); $('fovVal').textContent = settings.fov + '°'; store.set('fov', settings.fov); if (game) game.baseFov = settings.fov; });
function updateGfxInfo() {
  const el = $('gfxInfo'); if (!el || !post.main) return;
  const up = post.main.width < post.ow * 0.97;
  el.textContent = `3D: ${post.main.width}×${post.main.height} → экран ${post.ow}×${post.oh}` + (up ? ' · чёткий апскейл (FSR)' : ' · без апскейла') + (settings.res === 'auto' ? ` · авто ${Math.round(renderScale() * 100)}%` : '');
}

// --- вкладка «Управление» ---
$('sens').addEventListener('input', (e) => { settings.sens = Number(e.target.value); input.sens = settings.sens; $('sensVal').textContent = settings.sens.toFixed(2); store.set('sens', settings.sens); });
$('adsSens').addEventListener('input', (e) => { settings.adsSens = Number(e.target.value); $('adsVal').textContent = Math.round(settings.adsSens * 100) + '%'; store.set('adsSens', settings.adsSens); });
$('invertY').addEventListener('change', (e) => { settings.invertY = e.target.checked; input.invertY = settings.invertY; store.set('invertY', settings.invertY); });
$('leftFire').addEventListener('change', (e) => { settings.leftFire = e.target.checked; store.set('leftFire', settings.leftFire); $('btnFire2').classList.toggle('hidden', !settings.leftFire); });
$('btnScale').addEventListener('input', (e) => { settings.btnScale = Number(e.target.value); store.set('btnScale', settings.btnScale); $('btnScaleVal').textContent = Math.round(settings.btnScale * 100) + '%'; applyLayout(); });
$('btnAlpha').addEventListener('input', (e) => { settings.btnAlpha = Number(e.target.value); store.set('btnAlpha', settings.btnAlpha); $('btnAlphaVal').textContent = Math.round(settings.btnAlpha * 100) + '%'; applyLayout(); });
$('btnLayout').addEventListener('click', startLayout);

// --- вкладка «Звук» ---
settings.volume = store.get('volume', 1);
audio.setVolume(settings.volume);
$('volume').addEventListener('input', (e) => { settings.volume = Number(e.target.value); audio.setVolume(settings.volume); $('volVal').textContent = Math.round(settings.volume * 100) + '%'; store.set('volume', settings.volume); });
$('soundOn').addEventListener('change', (e) => { settings.sound = e.target.checked; audio.enabled = settings.sound; store.set('sound', settings.sound); });

function syncSettingsUI() {
  const P = preset(settings.quality), G = settings.gfx;
  segSel('qSeg', settings.quality);
  $('qNote').textContent = Q_NOTE[settings.quality] || '';
  $('resSel').value = String(settings.res);
  const sh = settings.sharp ?? P.sharp;
  $('sharp').value = sh; $('sharpVal').textContent = Math.round(sh * 100) + '%';
  $('farR').value = G.far || 1; $('farVal').textContent = Math.round((G.far || 1) * 100) + '%';
  $('shadowsOn').checked = G.shadows ?? P.shadows > 0;
  $('bloomOn').checked = G.bloom ?? P.bloom > 0;
  $('fpsOn').checked = settings.showFps;
  $('fov').value = settings.fov; $('fovVal').textContent = settings.fov + '°';
  $('sens').value = settings.sens; $('sensVal').textContent = Number(settings.sens).toFixed(2);
  $('adsSens').value = settings.adsSens; $('adsVal').textContent = Math.round(settings.adsSens * 100) + '%';
  $('invertY').checked = settings.invertY;
  $('leftFire').checked = settings.leftFire;
  $('btnScale').value = settings.btnScale; $('btnScaleVal').textContent = Math.round(settings.btnScale * 100) + '%';
  $('btnAlpha').value = settings.btnAlpha; $('btnAlphaVal').textContent = Math.round(settings.btnAlpha * 100) + '%';
  $('soundOn').checked = settings.sound;
  $('volume').value = settings.volume; $('volVal').textContent = Math.round(settings.volume * 100) + '%';
  syncGameTab();
  updateGfxInfo();
}
$('fps').classList.toggle('hidden', !settings.showFps);

// ---------- расстановка кнопок ----------
const LBTN = ['btnFire', 'btnFire2', 'btnAim', 'btnJump', 'btnReload', 'btnNade', 'btnBuild'];
const PAIR = { btnFire: 'btnPlace', btnAim: 'btnMine' };
const BASE = {};
for (const id of [...LBTN, 'btnPlace', 'btnMine']) BASE[id] = parseFloat(getComputedStyle($(id)).width) || 64;
function applyLayout() {
  const L = settings.layout || {};
  $('touchUI').style.setProperty('--btnA', settings.btnAlpha);
  for (const id of LBTN) {
    const c = L[id];
    for (const k of PAIR[id] ? [id, PAIR[id]] : [id]) {
      const el = $(k), sz = Math.round(BASE[k] * settings.btnScale * (c ? c.s : 1));
      el.style.setProperty('width', sz + 'px', 'important'); el.style.setProperty('height', sz + 'px', 'important');
      if (c) {
        const x = Math.max(sz / 2, Math.min(innerWidth - sz / 2, c.x * innerWidth)), y = Math.max(sz / 2, Math.min(innerHeight - sz / 2, c.y * innerHeight));
        el.style.left = (x - sz / 2) + 'px'; el.style.top = (y - sz / 2) + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto';
      } else { el.style.left = el.style.top = el.style.right = el.style.bottom = ''; }
    }
  }
}
let editFrom = null, picked = null, drag = null;
function startLayout() {
  editFrom = { hud: $('hud').classList.contains('hidden'), menu: !$('menu').classList.contains('hidden') };
  closeSettings();
  $('menu').classList.add('hidden');
  hud.show(true);
  document.body.classList.add('editing');
  $('layoutEdit').classList.remove('hidden');
  $('btnFire2').classList.remove('hidden');
  pick($('btnFire'));
}
function endLayout() {
  document.body.classList.remove('editing');
  $('layoutEdit').classList.add('hidden');
  $('btnFire2').classList.toggle('hidden', !settings.leftFire);
  if (picked) picked.classList.remove('picked');
  picked = null;
  if (editFrom && editFrom.hud) hud.show(false);
  if (editFrom && editFrom.menu) $('menu').classList.remove('hidden');
  store.set('layout', settings.layout);
  openSettings('ctrl', paused);
}
function pick(el) {
  if (picked) picked.classList.remove('picked');
  picked = el; el.classList.add('picked');
  const c = settings.layout[el.id];
  $('leSize').value = c ? c.s : 1;
}
$('touchUI').addEventListener('pointerdown', (e) => {
  if (!document.body.classList.contains('editing')) return;
  const el = e.target.closest('.btn'); if (!el || !LBTN.includes(el.id)) return;
  e.preventDefault(); pick(el);
  const r = el.getBoundingClientRect();
  drag = { id: el.id, dx: e.clientX - (r.left + r.width / 2), dy: e.clientY - (r.top + r.height / 2), pid: e.pointerId };
  try { el.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
});
window.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.pid) return;
  const c = settings.layout[drag.id] || (settings.layout[drag.id] = { s: Number($('leSize').value) || 1 });
  c.x = (e.clientX - drag.dx) / innerWidth; c.y = (e.clientY - drag.dy) / innerHeight;
  applyLayout();
});
window.addEventListener('pointerup', (e) => { if (drag && e.pointerId === drag.pid) { drag = null; store.set('layout', settings.layout); } });
$('leSize').addEventListener('input', (e) => {
  if (!picked) return;
  let c = settings.layout[picked.id];
  if (!c) { const r = picked.getBoundingClientRect(); c = settings.layout[picked.id] = { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight }; }
  c.s = Number(e.target.value); applyLayout();
});
$('leReset').addEventListener('click', () => { settings.layout = {}; store.set('layout', {}); $('leSize').value = 1; applyLayout(); });
$('leDone').addEventListener('click', endLayout);

function copyLink() {
  if (!game || !game.code) return;
  const url = location.origin + location.pathname + '?room=' + game.code;
  const text = `Го в Chicken Blocks! Код: ${game.code}\n${url}`;
  if (navigator.share) navigator.share({ title: 'Chicken Blocks', text, url }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => hud.banner('Ссылка скопирована', 'warn', 1.5)).catch(() => prompt('Ссылка:', url));
  else prompt('Ссылка:', url);
}
$('btnCopy').addEventListener('click', copyLink);

// не даём экрану гаснуть во время игры
let wakeLock = null;
async function keepAwake() {
  try { if (navigator.wakeLock && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) { /* ignore */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && game) keepAwake(); });

// ошибка вместо вечной загрузки
function showFatal(msg) {
  if (!$('loading').classList.contains('hidden') || !game || !game.ready) {
    console.error(msg);
    exitToMenu('Ошибка: ' + msg);
  }
}
window.addEventListener('error', (e) => {
  const f = e.filename || '';
  if (f.includes('/js/') && !f.includes('/lib/')) showFatal((e.message || String(e.error)) + ' (' + f.split('/').pop() + ':' + e.lineno + ')');
});

// iOS может приостановить звук — будим его при касаниях
document.addEventListener('touchend', () => { if (audio.ctx && audio.ctx.state !== 'running') audio.init(); }, { passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden && audio.ctx) audio.ctx.resume?.(); });

// ---------- цикл ----------
window.addEventListener('resize', applySize);
document.addEventListener('fullscreenchange', applySize);
applySize();

let last = performance.now(), frameAcc = 0, frameN = 0, slowT = 0, fastT = 0, fpsAcc = 0, fpsN = 0, worst = 0;
function loop(t) {
  requestAnimationFrame(loop);
  let dt = (t - last) / 1000; last = t;
  if (dt > 0.1) dt = 0.1;
  if (dt <= 0) return;
  if (game && !window.__cbHold) {
    const inp = input.poll();
    if (paused) { inp.mx = inp.my = 0; inp.lookX = inp.lookY = 0; inp.fire = inp.jump = inp.place = inp.mine = false; inp.taps = []; }
    game.update(dt, inp);
    // счётчик FPS
    fpsAcc += dt; fpsN++; worst = Math.max(worst, dt);
    if (fpsAcc >= 0.5) {
      if (settings.showFps) $('fps').textContent = `${Math.round(fpsN / fpsAcc)} FPS · ${(fpsAcc / fpsN * 1000).toFixed(1)} мс · 3D ${Math.round(renderScale() * 100)}%`;
      fpsAcc = 0; fpsN = 0; worst = 0;
    }
    // авто-разрешение: держим ~55+ fps, меняя только разрешение 3D (интерфейс остаётся чётким)
    if (settings.res === 'auto' && !paused) {
      frameAcc += dt; frameN++;
      if (frameAcc > 1) {
        const avg = frameAcc / frameN;
        if (avg > 1 / 48) { slowT++; fastT = 0; } else if (avg < 1 / 57) { fastT++; slowT = 0; } else { slowT = fastT = 0; }
        if (slowT >= 2 && dynScale > 0.6) { dynScale = Math.max(0.6, dynScale - (avg > 1 / 30 ? 0.15 : 0.08)); applyPost(); slowT = 0; }
        if (fastT >= 4 && dynScale < 1) { dynScale = Math.min(1, dynScale + 0.06); applyPost(); fastT = 0; }
        frameAcc = 0; frameN = 0;
      }
    }
  }
}
requestAnimationFrame(loop);

// отладка
window.__cb = { get game() { return game; } };

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
