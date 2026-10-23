// Управление: сенсорный джойстик + обзор пальцем + кнопки, а также клавиатура/мышь.
// e.code на некоторых Android-клавиатурах пустой — тогда восстанавливаем его по e.key.
const KEYMAP = { ' ': 'Space', Escape: 'Escape', Tab: 'Tab', Shift: 'ShiftLeft', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', '`': 'Backquote' };
function keyCode(e) {
  if (e.code && e.code !== 'Unidentified') return e.code;
  const k = e.key || '';
  if (KEYMAP[k]) return KEYMAP[k];
  if (/^[a-zа-яё]$/i.test(k)) { const i = 'йцукенгшщзфывапролдячсмить'.indexOf(k.toLowerCase()); return 'Key' + (i >= 0 ? 'QWERTYUIOPASDFGHJKLZXCVBNM'[i] : k.toUpperCase()); }
  if (/^[0-9]$/.test(k)) return 'Digit' + k;
  return '';
}
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.active = false;
    this.move = { x: 0, y: 0 };
    this.lookDX = 0; this.lookDY = 0;
    this.held = new Set();      // удерживаемые кнопки: fire, jump, place, mine, aim(desktop)
    this.taps = [];             // одноразовые действия
    this.touches = new Map();
    this.sens = 1;
    this.keys = new Set();
    this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    // какой способ ввода сейчас: палец или мышь (на ноутбуках с сенсорным экраном бывают оба)
    this.mode = matchMedia('(pointer: coarse)').matches ? 'touch' : 'desktop';
    this.onMode = null; this.onLockChange = null;
    this.lastTouch = 0;
    this.locked = false;
    this.stickBase = document.getElementById('stickBase');
    this.stickKnob = document.getElementById('stickKnob');
    this.stickR = 55;

    const opts = { passive: false };
    document.addEventListener('touchstart', (e) => this.onTouchStart(e), opts);
    document.addEventListener('touchmove', (e) => this.onTouchMove(e), opts);
    document.addEventListener('touchend', (e) => this.onTouchEnd(e), opts);
    document.addEventListener('touchcancel', (e) => this.onTouchEnd(e), opts);

    // мышь/клавиатура. На телефоне мышь и клавиатура бывают подключены по Bluetooth/OTG —
    // режим переключается сам по тому, чем человек реально пользуется.
    this.pref = 'auto';            // 'auto' | 'touch' | 'desktop' — выбор в настройках
    this.free = false;             // мышь без захвата курсора (браузер не умеет pointer lock)
    this.mouseSens = 1;
    this.mDX = 0; this.mDY = 0;    // движение мыши за кадр
    this.seen = { mouse: false, kbd: false };
    this.onSeen = null;
    this.lastPT = '';              // тип указателя последнего нажатия: mouse / touch / pen
    this.gestureAt = 0; this.lockReqAt = 0; this.lockFails = 0;
    this.cur = null;               // позиция курсора в свободном режиме (для поворота у краёв)
    this.edge = { x: 0, y: 0 };
    this.mBtn = null;
    this.mAcc = 0; this.lastPoll = performance.now(); this.lastMouseAt = 0;
    this.edgeEl = [document.getElementById('edgeL'), document.getElementById('edgeR')]; this.edgeShown = 0;
    const isMouse = (e) => e.pointerType === 'mouse';
    window.addEventListener('pointerdown', (e) => {
      this.lastPT = e.pointerType;
      if (!isMouse(e)) return;
      this.gestureAt = this.lastMouseAt = performance.now(); this.sawMouse();
      // экранные кнопки можно нажимать и мышью (мышь без клавиатуры на телефоне)
      const el = this.active && e.target && e.target.closest ? e.target.closest('[data-btn]') : null;
      if (el && e.button === 0) {
        const b = el.dataset.btn;
        el.classList.add('down');
        if (['fire', 'fire2', 'jump', 'place', 'mine'].includes(b)) this.held.add(b); else this.taps.push(b);
        this.mBtn = { el, b };
        e.preventDefault();
      }
    }, true);
    window.addEventListener('pointerup', (e) => {
      if (!isMouse(e) || !this.mBtn) return;
      const { el, b } = this.mBtn; this.mBtn = null;
      el.classList.remove('down');
      if (!this.hasBtn(b)) this.held.delete(b);
    }, true);
    window.addEventListener('pointermove', (e) => {
      if (!isMouse(e)) return;
      if (!e.movementX && !e.movementY) return; // мышь не двигалась (бывают «пустые» события)
      this.lastPT = 'mouse';
      if (this.mode === 'desktop') this.lastMouseAt = performance.now();
      else {
        // настоящая мышь сдвинулась заметно — переключаемся (случайные события не считаем)
        this.mAcc += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
        if (this.mAcc > 24) { this.mAcc = 0; this.sawMouse(); }
      }
    }, true);
    canvas.addEventListener('mousedown', (e) => {
      if (!this.active || this.lastPT === 'touch' || performance.now() - this.lastTouch < 800) return;
      this.sawMouse();
      if (this.mode !== 'desktop') return;
      if (!this.free && document.pointerLockElement !== canvas) { this.lock(); return; }
      if (e.button === 0) this.held.add('mouseL');
      if (e.button === 2) this.held.add('mouseR');
      if (e.button === 1) { this.taps.push('nade'); e.preventDefault(); }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) { this.lockFails = 0; this.lockOk = true; this.setFree(false); }
      if (!this.locked) { this.held.delete('mouseL'); this.held.delete('mouseR'); }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    // ошибка бывает и у первой попытки с «сырым» движением, а повторная проходит — проверяем чуть позже
    document.addEventListener('pointerlockerror', () => setTimeout(() => { if (!this.locked) this.lockFailed(); }, 350));
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.held.delete('mouseL');
      if (e.button === 2) this.held.delete('mouseR');
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (!this.active || this.mode !== 'desktop' || this.lastPT === 'touch') return;
      if (document.pointerLockElement === canvas) {
        this.mDX += e.movementX * 0.6; this.mDY += e.movementY * 0.6;
      } else if (this.free) {
        // без захвата: обзор движением мыши, а у краёв экрана камера доворачивает сама
        let dx = e.movementX, dy = e.movementY;
        if (dx === undefined && this.cur) { dx = e.clientX - this.cur.x; dy = e.clientY - this.cur.y; }
        this.mDX += (dx || 0) * 0.6; this.mDY += (dy || 0) * 0.6;
        this.cur = { x: e.clientX, y: e.clientY };
      }
    });
    document.addEventListener('mouseleave', () => { this.cur = null; });
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      const k = keyCode(e);
      if (!k) return;
      this.sawKbd();
      if (!this.active) return;
      this.gestureAt = performance.now();
      if (!this.keys.has(k)) {
        if (k === 'KeyR') this.taps.push('reload');
        if (k === 'KeyG') this.taps.push('nade');
        if (k === 'KeyQ' || k === 'KeyB') this.taps.push('build');
        if (k === 'KeyV') this.taps.push('view');
        if (k === 'Tab') this.taps.push('scoreOn');
        if (k === 'KeyE') this.taps.push('nade');
        if (k === 'Escape' || k === 'Backquote') this.taps.push('pause');
        if (k === 'KeyF') this.taps.push('aim');
        if (k >= 'Digit1' && k <= 'Digit7' && k.length === 6) this.taps.push('w' + (Number(k.slice(5)) - 1));
      }
      this.keys.add(k);
      if (k === 'Tab' || k === 'Space' || k.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { const k = keyCode(e); this.keys.delete(k); if (k === 'Tab' && this.active) this.taps.push('scoreOff'); });
    window.addEventListener('wheel', (e) => { if (this.active) this.taps.push(e.deltaY > 0 ? 'next' : 'prev'); });
    window.addEventListener('blur', () => { this.keys.clear(); this.held.clear(); this.touches.clear(); this.move.x = this.move.y = 0; this.cur = null; });
  }

  // увидели настоящую мышь — играем как на ПК (если в настройках не закреплён сенсор)
  sawMouse() {
    if (!this.seen.mouse) {
      this.seen.mouse = true;
      if (!this.canvas.requestPointerLock) this.free = true; // браузер вообще не умеет захват — сразу свободный режим
      if (this.onSeen) this.onSeen('mouse');
    }
    if (this.pref === 'auto') this.setMode('desktop');
  }
  // клавиатура без мыши на сенсорном экране: кнопки на экране остаются, ходить можно клавишами
  sawKbd() {
    if (!this.seen.kbd) { this.seen.kbd = true; if (this.onSeen) this.onSeen('kbd'); }
    if (this.pref === 'auto' && !this.isTouch) this.setMode('desktop');
  }
  setPref(p) {
    this.pref = p;
    if (p === 'touch') this.setMode('touch');
    else if (p === 'desktop') this.setMode('desktop');
  }
  setFree(on) { if (on !== this.free) { this.free = on; this.cur = null; if (this.onMode) this.onMode(this.mode); } }
  lockFailed() {
    // ошибку считаем только если запрос был сразу после клика/клавиши (иначе браузер и не обязан был)
    if (performance.now() - this.gestureAt > 1500) return;
    if (this.lockOk) return; // захват уже работал — это просто пауза браузера после Esc
    this.lockFails++;
    if (this.lockFails >= (this.isTouch ? 1 : 2)) this.setFree(true);
  }

  setMode(m) {
    if (m === this.mode) return;
    this.mode = m;
    this.held.delete('mouseL'); this.held.delete('mouseR');
    if (m === 'touch' && document.pointerLockElement) document.exitPointerLock();
    if (this.onMode) this.onMode(m);
  }
  lock() {
    const c = this.canvas;
    if (!c.requestPointerLock) { this.setFree(true); return; }
    if (this.free) return;
    const at = this.lockReqAt = performance.now();
    // некоторые мобильные браузеры молча игнорируют запрос — тогда тоже переходим в свободный режим
    setTimeout(() => {
      if (this.lockReqAt === at && !this.locked && this.mode === 'desktop' && document.visibilityState === 'visible' && at - this.gestureAt < 1500) this.lockFailed();
    }, 900);
    try {
      const r = c.requestPointerLock({ unadjustedMovement: true }); // "сырое" движение мыши без ускорения
      if (r && r.catch) r.catch((err) => {
        if (err && err.name === 'NotSupportedError') { try { c.requestPointerLock(); } catch (e) { this.lockFailed(); } }
      });
    } catch (e) { try { c.requestPointerLock(); } catch (e2) { this.lockFailed(); } }
  }
  get needLock() { return this.mode === 'desktop' && !this.free; }
  onTouchStart(e) {
    this.lastTouch = performance.now(); this.lastPT = 'touch';
    // мышью недавно пользовались — палец просто помогает (например, двигать джойстик), режим не сбиваем
    if (this.pref !== 'desktop' && (this.pref === 'touch' || performance.now() - this.lastMouseAt > 2500)) this.setMode('touch');
    if (!this.active) return;
    for (const t of e.changedTouches) {
      const el = t.target && t.target.closest ? t.target.closest('[data-btn]') : null;
      if (el) {
        const b = el.dataset.btn;
        const lookable = b === 'fire' || b === 'fire2' || b === 'place' || b === 'mine';
        this.touches.set(t.identifier, { kind: 'btn', btn: b, el, x: t.clientX, y: t.clientY, look: lookable && b !== 'fire2' });
        el.classList.add('down');
        if (['fire', 'fire2', 'jump', 'place', 'mine'].includes(b)) this.held.add(b);
        else this.taps.push(b);
        e.preventDefault();
        continue;
      }
      if (t.target && t.target.closest && t.target.closest('.ui-allow')) continue;
      e.preventDefault();
      if (t.clientX < window.innerWidth * 0.42 && !this.hasKind('stick')) {
        this.touches.set(t.identifier, { kind: 'stick', ox: t.clientX, oy: t.clientY });
        this.showStick(t.clientX, t.clientY);
      } else {
        this.touches.set(t.identifier, { kind: 'look', x: t.clientX, y: t.clientY });
      }
    }
  }
  onTouchMove(e) {
    if (!this.active) return;
    for (const t of e.changedTouches) {
      const s = this.touches.get(t.identifier);
      if (!s) continue;
      e.preventDefault();
      if (s.kind === 'stick') {
        let dx = t.clientX - s.ox, dy = t.clientY - s.oy;
        const d = Math.hypot(dx, dy), R = this.stickR;
        if (d > R * 1.6) { // джойстик "едет" за пальцем
          s.ox = t.clientX - dx / d * R * 1.6; s.oy = t.clientY - dy / d * R * 1.6;
          this.showStick(s.ox, s.oy);
          dx = t.clientX - s.ox; dy = t.clientY - s.oy;
        }
        const dd = Math.hypot(dx, dy);
        const k = Math.min(1, dd / R);
        const nx = dd ? dx / dd : 0, ny = dd ? dy / dd : 0;
        const dead = 0.12;
        const m = k < dead ? 0 : (k - dead) / (1 - dead);
        this.move.x = nx * m; this.move.y = -ny * m;
        this.stickKnob.style.transform = `translate(${nx * Math.min(dd, R)}px, ${ny * Math.min(dd, R)}px)`;
      } else if (s.kind === 'look' || (s.kind === 'btn' && s.look)) {
        const dx = t.clientX - s.x, dy = t.clientY - s.y;
        s.x = t.clientX; s.y = t.clientY;
        this.lookDX += dx; this.lookDY += dy;
      }
    }
  }
  onTouchEnd(e) {
    for (const t of e.changedTouches) {
      const s = this.touches.get(t.identifier);
      if (!s) continue;
      this.touches.delete(t.identifier);
      if (s.kind === 'stick') { this.move.x = this.move.y = 0; this.hideStick(); }
      if (s.kind === 'btn') {
        s.el.classList.remove('down');
        if (!this.hasBtn(s.btn)) this.held.delete(s.btn);
      }
      if (this.active) e.preventDefault();
    }
  }
  hasKind(k) { for (const s of this.touches.values()) if (s.kind === k) return true; return false; }
  hasBtn(b) { for (const s of this.touches.values()) if (s.kind === 'btn' && s.btn === b) return true; return false; }
  showStick(x, y) {
    this.stickBase.style.display = 'block';
    this.stickBase.style.left = x + 'px'; this.stickBase.style.top = y + 'px';
    this.stickKnob.style.transform = 'translate(0px,0px)';
  }
  hideStick() { this.stickBase.style.display = 'none'; }

  // Вызывается раз в кадр: собирает итоговое состояние
  poll() {
    const now = performance.now(), dt = Math.min(0.1, (now - this.lastPoll) / 1000); this.lastPoll = now;
    this.edgeTurn(dt);
    let mx = this.move.x, my = this.move.y;
    const K = this.keys;
    if (K.has('KeyW') || K.has('ArrowUp')) my = 1;
    if (K.has('KeyS') || K.has('ArrowDown')) my = -1;
    if (K.has('KeyA') || K.has('ArrowLeft')) mx = -1;
    if (K.has('KeyD') || K.has('ArrowRight')) mx = 1;
    const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
    const out = {
      mx, my,
      lookX: this.lookDX * this.sens + this.mDX * this.mouseSens,
      lookY: (this.lookDY * this.sens + this.mDY * this.mouseSens) * (this.invertY ? -1 : 1),
      fire: this.held.has('fire') || this.held.has('fire2') || this.held.has('mouseL'),
      jump: this.held.has('jump') || K.has('Space'),
      place: this.held.has('place') || (this.held.has('mouseL')),
      mine: this.held.has('mine') || this.held.has('mouseR'),
      aimHold: this.held.has('mouseR'),
      sprint: K.has('ShiftLeft') || K.has('ShiftRight'),
      taps: this.taps,
    };
    this.lookDX = 0; this.lookDY = 0; this.mDX = 0; this.mDY = 0; this.taps = [];
    return out;
  }
  // свободная мышь: курсор упёрся в край экрана — плавно доворачиваем камеру в ту сторону
  edgeTurn(dt) {
    const E = this.edge; E.x = E.y = 0;
    if (!this.active || !this.free || this.mode !== 'desktop' || !this.cur) { this.showEdge(0); return; }
    const w = innerWidth, h = innerHeight, bx = Math.max(16, w * 0.05), by = Math.max(14, h * 0.06);
    const x = this.cur.x, y = this.cur.y;
    if (x < bx) E.x = -(bx - x) / bx; else if (x > w - 1 - bx) E.x = (x - (w - 1 - bx)) / bx;
    if (y < by) E.y = -(by - y) / by; else if (y > h - 1 - by) E.y = (y - (h - 1 - by)) / by;
    E.x = Math.max(-1, Math.min(1, E.x)); E.y = Math.max(-1, Math.min(1, E.y));
    // ~140°/с по горизонтали и ~70°/с по вертикали у самого края
    this.mDX += E.x * Math.abs(E.x) * 580 * dt;
    this.mDY += E.y * Math.abs(E.y) * 290 * dt;
    this.showEdge(E.x);
  }
  showEdge(x) {
    const v = Math.round(x * 4) / 4;
    if (v === this.edgeShown || !this.edgeEl[0]) return;
    this.edgeShown = v;
    this.edgeEl[0].style.opacity = v < 0 ? String(-v) : '0';
    this.edgeEl[1].style.opacity = v > 0 ? String(v) : '0';
  }
  reset() {
    this.held.clear(); this.touches.clear(); this.move.x = this.move.y = 0; this.taps = []; this.hideStick();
    document.querySelectorAll('.down').forEach(el => el.classList.remove('down'));
  }
}
