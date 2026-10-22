// Точка входа: меню, настройки, полный экран, главный цикл.
import * as THREE from './lib/three.module.min.js';
import { Game } from './game.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { createHost, createClient, makeCode } from './net.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('cb_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('cb_' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};

const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
if (!isTouch) document.body.classList.add('desktop');

const settings = {
  sens: store.get('sens', 1),
  quality: store.get('quality', isTouch ? 'med' : 'high'),
  sound: store.get('sound', true),
  leftFire: store.get('leftFire', true),
};

const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
let pixelRatio = 1, dynScale = 1;
function basePR() {
  const dpr = window.devicePixelRatio || 1;
  return settings.quality === 'low' ? Math.min(dpr, 1) * 0.75 : settings.quality === 'med' ? Math.min(dpr, 1.35) : Math.min(dpr, 2);
}
function applySize() {
  pixelRatio = Math.max(0.5, basePR() * dynScale);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight, false);
  if (game) game.resize(innerWidth, innerHeight);
}

const hud = new HUD();
const audio = new Audio();
audio.enabled = settings.sound;
const input = new Input(canvas);
input.sens = settings.sens;
let game = null;
let paused = false;

// ---------- меню ----------
let team = store.get('team', 0);
$('nick').value = store.get('nick', '') || '';
$('botCount').value = String(store.get('bots', 2));
function selTeam(t) {
  team = t;
  document.querySelectorAll('.teamBtn').forEach(b => b.classList.toggle('sel', Number(b.dataset.team) === t));
}
selTeam(team);
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
    renderer, hud, audio, input, settings, mode, net, code,
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
  game.startHost(n, team, Math.max(1, Number($('botCount').value)));
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
  game.startHost(n, team, Number($('botCount').value));
  applySize();
  hud.banner('КОД КОМНАТЫ: ' + code, 'warn', 6, 'Отправь код или ссылку другу (меню ☰)');
  $('shareCode').textContent = code;
});

$('btnJoin').addEventListener('click', async () => {
  audio.init();
  const code = $('roomCode').value.trim().toUpperCase();
  if (code.length !== 4) { status('Введи код из 4 символов', true); return; }
  goFullscreen();
  const n = nick();
  loading(true, 'Подключаемся к ' + code + '…');
  const net = createClient();
  try { await net.start(code); } catch (e) {
    net.close(); loading(false); status(e.message || 'Не удалось подключиться', true); return;
  }
  loading(true, 'Загружаем карту…');
  game = makeGame('client', net, code);
  game.code = code;
  game.startClient(n, team);
  applySize();
  setTimeout(() => { if (game && !game.ready) exitToMenu('Хост не ответил'); }, 20000);
});

// ---------- пауза ----------
function setPause(on) {
  paused = on;
  $('pauseMenu').classList.toggle('hidden', !on);
  input.active = !on && !!game;
  if (on) { input.reset(); if (document.pointerLockElement) document.exitPointerLock(); }
  if (on && game) {
    $('pauseRoom').innerHTML = game.code ? `Код комнаты: <b style="letter-spacing:3px;color:#ffd23a">${game.code}</b> <button id="btnCopy2" style="padding:4px 10px">Ссылка</button>` : 'Офлайн-игра с ботами';
    const c2 = $('btnCopy2'); if (c2) c2.onclick = copyLink;
  }
}
$('btnResume').addEventListener('click', () => { setPause(false); goFullscreen(); });
$('btnLeave').addEventListener('click', () => exitToMenu(''));
$('btnView').addEventListener('click', () => { if (game) { game.firstPerson = !game.firstPerson; $('btnView').textContent = 'Вид: ' + (game.firstPerson ? 'от 1-го лица' : 'от 3-го лица'); } });
$('sens').value = settings.sens; $('sensVal').textContent = Number(settings.sens).toFixed(2);
$('sens').addEventListener('input', (e) => { settings.sens = Number(e.target.value); input.sens = settings.sens; $('sensVal').textContent = settings.sens.toFixed(2); store.set('sens', settings.sens); });
$('quality').value = settings.quality;
$('quality').addEventListener('change', (e) => { settings.quality = e.target.value; store.set('quality', settings.quality); dynScale = 1; applySize(); if (game) game.applyQuality(settings.quality); });
$('soundOn').checked = settings.sound;
$('soundOn').addEventListener('change', (e) => { settings.sound = e.target.checked; audio.enabled = settings.sound; store.set('sound', settings.sound); });
$('leftFire').checked = settings.leftFire;
$('leftFire').addEventListener('change', (e) => { settings.leftFire = e.target.checked; store.set('leftFire', settings.leftFire); $('btnFire2').classList.toggle('hidden', !settings.leftFire); });

function copyLink() {
  if (!game || !game.code) return;
  const url = location.origin + location.pathname + '?room=' + game.code;
  const text = `Го в Chicken Blocks! Код: ${game.code}\n${url}`;
  if (navigator.share) navigator.share({ title: 'Chicken Blocks', text, url }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => hud.banner('Ссылка скопирована', 'warn', 1.5)).catch(() => prompt('Ссылка:', url));
  else prompt('Ссылка:', url);
}
$('btnCopy').addEventListener('click', copyLink);

// iOS может приостановить звук — будим его при касаниях
document.addEventListener('touchend', () => { if (audio.ctx && audio.ctx.state !== 'running') audio.init(); }, { passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden && audio.ctx) audio.ctx.resume?.(); });

// ---------- цикл ----------
window.addEventListener('resize', applySize);
document.addEventListener('fullscreenchange', applySize);
applySize();

let last = performance.now(), frameAcc = 0, frameN = 0, slowT = 0, fastT = 0;
function loop(t) {
  requestAnimationFrame(loop);
  let dt = (t - last) / 1000; last = t;
  if (dt > 0.1) dt = 0.1;
  if (dt <= 0) return;
  if (game && !window.__cbHold) {
    const inp = input.poll();
    if (paused) { inp.mx = inp.my = 0; inp.lookX = inp.lookY = 0; inp.fire = inp.jump = inp.place = inp.mine = false; inp.taps = []; }
    game.update(dt, inp);
    // адаптивное разрешение: держим ~50+ fps
    frameAcc += dt; frameN++;
    if (frameAcc > 1) {
      const avg = frameAcc / frameN;
      if (avg > 1 / 45) { slowT++; fastT = 0; } else if (avg < 1 / 58) { fastT++; slowT = 0; } else { slowT = fastT = 0; }
      if (slowT >= 2 && dynScale > 0.55) { dynScale = Math.max(0.55, dynScale - 0.12); applySize(); slowT = 0; }
      if (fastT >= 5 && dynScale < 1) { dynScale = Math.min(1, dynScale + 0.08); applySize(); fastT = 0; }
      frameAcc = 0; frameN = 0;
    }
  }
}
requestAnimationFrame(loop);

// отладка
window.__cb = { get game() { return game; } };

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
