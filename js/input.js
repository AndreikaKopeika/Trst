// Управление: сенсорный джойстик + обзор пальцем + кнопки, а также клавиатура/мышь.
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

    // мышь/клавиатура
    canvas.addEventListener('mousedown', (e) => {
      if (!this.active || performance.now() - this.lastTouch < 800) return;
      this.setMode('desktop');
      if (document.pointerLockElement !== canvas) { this.lock(); return; }
      if (e.button === 0) this.held.add('mouseL');
      if (e.button === 2) this.held.add('mouseR');
      if (e.button === 1) { this.taps.push('nade'); e.preventDefault(); }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.held.delete('mouseL'); this.held.delete('mouseR'); }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.held.delete('mouseL');
      if (e.button === 2) this.held.delete('mouseR');
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (!this.active || document.pointerLockElement !== canvas) return;
      this.lookDX += e.movementX * 0.6; this.lookDY += e.movementY * 0.6;
    });
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName !== 'INPUT') this.setMode('desktop');
      if (!this.active) return;
      if (e.target && e.target.tagName === 'INPUT') return;
      const k = e.code;
      if (!this.keys.has(k)) {
        if (k === 'KeyR') this.taps.push('reload');
        if (k === 'KeyG') this.taps.push('nade');
        if (k === 'KeyQ' || k === 'KeyB') this.taps.push('build');
        if (k === 'KeyV') this.taps.push('view');
        if (k === 'Tab') this.taps.push('scoreOn');
        if (k === 'KeyE') this.taps.push('nade');
        if (k === 'Escape') this.taps.push('pause');
        if (k === 'KeyF') this.taps.push('aim');
        if (k >= 'Digit1' && k <= 'Digit7') this.taps.push('w' + (Number(k.slice(5)) - 1));
      }
      this.keys.add(k);
      if (k === 'Tab' || k === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); if (e.code === 'Tab' && this.active) this.taps.push('scoreOff'); });
    window.addEventListener('wheel', (e) => { if (this.active) this.taps.push(e.deltaY > 0 ? 'next' : 'prev'); });
    window.addEventListener('blur', () => { this.keys.clear(); this.held.clear(); this.touches.clear(); this.move.x = this.move.y = 0; });
  }

  setMode(m) { if (m !== this.mode) { this.mode = m; if (this.onMode) this.onMode(m); } }
  lock() {
    const c = this.canvas;
    if (!c.requestPointerLock) return;
    try {
      const r = c.requestPointerLock({ unadjustedMovement: true }); // "сырое" движение мыши без ускорения
      if (r && r.catch) r.catch(() => { try { c.requestPointerLock(); } catch (e) { /* ignore */ } });
    } catch (e) { try { c.requestPointerLock(); } catch (e2) { /* ignore */ } }
  }
  onTouchStart(e) {
    this.lastTouch = performance.now();
    this.setMode('touch');
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
    let mx = this.move.x, my = this.move.y;
    const K = this.keys;
    if (K.has('KeyW') || K.has('ArrowUp')) my = 1;
    if (K.has('KeyS') || K.has('ArrowDown')) my = -1;
    if (K.has('KeyA') || K.has('ArrowLeft')) mx = -1;
    if (K.has('KeyD') || K.has('ArrowRight')) mx = 1;
    const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
    const out = {
      mx, my,
      lookX: this.lookDX * this.sens, lookY: this.lookDY * this.sens,
      fire: this.held.has('fire') || this.held.has('fire2') || this.held.has('mouseL'),
      jump: this.held.has('jump') || K.has('Space'),
      place: this.held.has('place') || (this.held.has('mouseL')),
      mine: this.held.has('mine') || this.held.has('mouseR'),
      aimHold: this.held.has('mouseR'),
      sprint: K.has('ShiftLeft'),
      taps: this.taps,
    };
    this.lookDX = 0; this.lookDY = 0; this.taps = [];
    return out;
  }
  reset() {
    this.held.clear(); this.touches.clear(); this.move.x = this.move.y = 0; this.taps = []; this.hideStick();
    document.querySelectorAll('.down').forEach(el => el.classList.remove('down'));
  }
}
