// Постобработка: рендер в пониженном разрешении + чёткий апскейл (по мотивам AMD FSR 1: EASU + RCAS),
// свечение (bloom), лёгкая цветокоррекция и виньетка. Интерфейс (HTML) всегда в полном разрешении.
import * as THREE from './lib/three.module.min.js';

const VS = `varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// RCAS: контрастная резкость (на низком разрешении, перед апскейлом) + перевод в гамму
const FS_SHARP = `
precision highp float;
uniform sampler2D tIn; uniform vec2 px; uniform float sharp;
varying vec2 vUv;
vec3 g(vec3 c) { return sqrt(max(c, 0.0)); }
void main() {
  vec3 e = g(texture2D(tIn, vUv).rgb);
  if (sharp <= 0.001) { gl_FragColor = vec4(e, 1.0); return; }
  vec3 b = g(texture2D(tIn, vUv + vec2(0.0, px.y)).rgb);
  vec3 d = g(texture2D(tIn, vUv - vec2(px.x, 0.0)).rgb);
  vec3 f = g(texture2D(tIn, vUv + vec2(px.x, 0.0)).rgb);
  vec3 h = g(texture2D(tIn, vUv - vec2(0.0, px.y)).rgb);
  vec3 mn4 = min(min(b, d), min(f, h));
  vec3 mx4 = max(max(b, d), max(f, h));
  vec3 hitMin = min(mn4, e) / max(4.0 * mx4, 1e-4);
  vec3 hitMax = (1.0 - max(mx4, e)) / min(4.0 * mn4 - 4.0, -1e-4);
  vec3 lobeRGB = max(-hitMin, hitMax);
  float lobe = max(-0.1875, min(max(lobeRGB.r, max(lobeRGB.g, lobeRGB.b)), 0.0)) * sharp;
  vec3 c = (lobe * (b + d + f + h) + e) / (4.0 * lobe + 1.0);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

// EASU: направленный апскейл по 12 соседям (края остаются ровными, без мыла)
const FS_FINAL = `
precision highp float;
uniform sampler2D tIn; uniform sampler2D tB1; uniform sampler2D tB2;
uniform vec2 inSize; uniform vec2 outSize; uniform float bloom; uniform float grade; uniform float vig; uniform float easu;
varying vec2 vUv;
vec3 T(vec2 p) { return texture2D(tIn, (p + 0.5) / inSize).rgb; }
float L(vec3 c) { return c.g + 0.5 * (c.r + c.b); }
void S(inout vec2 dir, inout float len, float w, float lA, float lB, float lC, float lD, float lE) {
  float lenX = max(abs(lD - lC), abs(lC - lB));
  float dirX = lD - lB; dir.x += dirX * w;
  lenX = clamp(abs(dirX) / max(lenX, 1e-5), 0.0, 1.0); len += lenX * lenX * w;
  float lenY = max(abs(lE - lC), abs(lC - lA));
  float dirY = lE - lA; dir.y += dirY * w;
  lenY = clamp(abs(dirY) / max(lenY, 1e-5), 0.0, 1.0); len += lenY * lenY * w;
}
void A(inout vec3 aC, inout float aW, vec2 off, vec2 dir, vec2 len, float lob, float clp, vec3 c) {
  vec2 v = vec2(off.x * dir.x + off.y * dir.y, off.x * -dir.y + off.y * dir.x) * len;
  float d2 = min(dot(v, v), clp);
  float wB = 0.4 * d2 - 1.0, wA = lob * d2 - 1.0;
  wB *= wB; wA *= wA;
  wB = 1.5625 * wB - 0.5625;
  float w = wB * wA;
  aC += c * w; aW += w;
}
vec3 upscale() {
  vec2 pp = gl_FragCoord.xy * (inSize / outSize) - 0.5;
  vec2 fp = floor(pp); pp -= fp;
  vec3 bC = T(fp + vec2(0.0, -1.0)), cC = T(fp + vec2(1.0, -1.0));
  vec3 eC = T(fp + vec2(-1.0, 0.0)), fC = T(fp), gC = T(fp + vec2(1.0, 0.0)), hC = T(fp + vec2(2.0, 0.0));
  vec3 iC = T(fp + vec2(-1.0, 1.0)), jC = T(fp + vec2(0.0, 1.0)), kC = T(fp + vec2(1.0, 1.0)), lC = T(fp + vec2(2.0, 1.0));
  vec3 nC = T(fp + vec2(0.0, 2.0)), oC = T(fp + vec2(1.0, 2.0));
  float bL = L(bC), cL = L(cC), eL = L(eC), fL = L(fC), gL = L(gC), hL = L(hC), iL = L(iC), jL = L(jC), kL = L(kC), lL = L(lC), nL = L(nC), oL = L(oC);
  vec2 dir = vec2(0.0); float len = 0.0;
  S(dir, len, (1.0 - pp.x) * (1.0 - pp.y), bL, eL, fL, gL, jL);
  S(dir, len, pp.x * (1.0 - pp.y), cL, fL, gL, hL, kL);
  S(dir, len, (1.0 - pp.x) * pp.y, fL, iL, jL, kL, nL);
  S(dir, len, pp.x * pp.y, gL, jL, kL, lL, oL);
  float dirR = dot(dir, dir);
  if (dirR < 1.0 / 32768.0) { dir = vec2(1.0, 0.0); } else dir *= inversesqrt(dirR);
  len = len * 0.5; len *= len;
  float stretch = dot(dir, dir) / max(abs(dir.x), abs(dir.y));
  vec2 len2 = vec2(1.0 + (stretch - 1.0) * len, 1.0 - 0.5 * len);
  float lob = 0.5 + ((1.0 / 4.0 - 0.04) - 0.5) * len;
  float clp = 1.0 / lob;
  vec3 mn = min(min(fC, gC), min(jC, kC)), mx = max(max(fC, gC), max(jC, kC));
  vec3 aC = vec3(0.0); float aW = 0.0;
  A(aC, aW, vec2(0.0, -1.0) - pp, dir, len2, lob, clp, bC);
  A(aC, aW, vec2(1.0, -1.0) - pp, dir, len2, lob, clp, cC);
  A(aC, aW, vec2(-1.0, 1.0) - pp, dir, len2, lob, clp, iC);
  A(aC, aW, vec2(0.0, 1.0) - pp, dir, len2, lob, clp, jC);
  A(aC, aW, vec2(0.0, 0.0) - pp, dir, len2, lob, clp, fC);
  A(aC, aW, vec2(-1.0, 0.0) - pp, dir, len2, lob, clp, eC);
  A(aC, aW, vec2(1.0, 1.0) - pp, dir, len2, lob, clp, kC);
  A(aC, aW, vec2(2.0, 1.0) - pp, dir, len2, lob, clp, lC);
  A(aC, aW, vec2(2.0, 0.0) - pp, dir, len2, lob, clp, hC);
  A(aC, aW, vec2(1.0, 0.0) - pp, dir, len2, lob, clp, gC);
  A(aC, aW, vec2(1.0, 2.0) - pp, dir, len2, lob, clp, oC);
  A(aC, aW, vec2(0.0, 2.0) - pp, dir, len2, lob, clp, nC);
  return min(mx, max(mn, aC / aW));
}
void main() {
  vec3 c = easu > 0.5 ? upscale() : texture2D(tIn, vUv).rgb;
  if (bloom > 0.0) {
    vec3 bl = texture2D(tB1, vUv).rgb * 0.7 + texture2D(tB2, vUv).rgb;
    vec3 lin = c * c + bl * bloom;
    c = sqrt(lin / (1.0 + max(lin - 1.0, 0.0) * 0.5)); // мягко гасим пересветы
  }
  if (grade > 0.0) {
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(vec3(l), c, 1.0 + 0.12 * grade);                  // чуть сочнее цвета
    c = mix(c, c * c * (3.0 - 2.0 * c), 0.18 * grade);         // мягкий контраст
  }
  if (vig > 0.0) { vec2 q = vUv - 0.5; c *= 1.0 - vig * dot(q, q) * 1.1; }
  gl_FragColor = vec4(c, 1.0);
}`;

// свечение: выборка ярких мест + размытие
const FS_BRIGHT = `
precision highp float;
uniform sampler2D tIn; uniform vec2 px; uniform float th;
varying vec2 vUv;
void main() {
  vec3 c = (texture2D(tIn, vUv + vec2(-px.x, -px.y)).rgb + texture2D(tIn, vUv + vec2(px.x, -px.y)).rgb +
            texture2D(tIn, vUv + vec2(-px.x, px.y)).rgb + texture2D(tIn, vUv + vec2(px.x, px.y)).rgb) * 0.25;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = smoothstep(th, th + 0.2, l);
  gl_FragColor = vec4(c * k, 1.0);
}`;
const FS_BLUR = `
precision highp float;
uniform sampler2D tIn; uniform vec2 dir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tIn, vUv).rgb * 0.2270270270;
  c += (texture2D(tIn, vUv + dir * 1.3846153846).rgb + texture2D(tIn, vUv - dir * 1.3846153846).rgb) * 0.3162162162;
  c += (texture2D(tIn, vUv + dir * 3.2307692308).rgb + texture2D(tIn, vUv - dir * 3.2307692308).rgb) * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;

function rt(w, h, opt = {}) {
  const t = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: !!opt.depth, stencilBuffer: false,
    type: opt.type || THREE.UnsignedByteType, samples: opt.samples || 0,
  });
  if (opt.srgb) t.texture.colorSpace = THREE.SRGBColorSpace;
  t.texture.generateMipmaps = false;
  return t;
}

export class Post {
  constructor(renderer) {
    this.r = renderer;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(geo, null);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.quad);
    const mk = (fs, u) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false });
    this.mSharp = mk(FS_SHARP, { tIn: { value: null }, px: { value: new THREE.Vector2() }, sharp: { value: 0.5 } });
    this.mFinal = mk(FS_FINAL, {
      tIn: { value: null }, tB1: { value: null }, tB2: { value: null }, inSize: { value: new THREE.Vector2() }, outSize: { value: new THREE.Vector2() },
      bloom: { value: 0 }, grade: { value: 1 }, vig: { value: 0.35 }, easu: { value: 1 },
    });
    this.mBright = mk(FS_BRIGHT, { tIn: { value: null }, px: { value: new THREE.Vector2() }, th: { value: 0.8 } });
    this.mBlur = mk(FS_BLUR, { tIn: { value: null }, dir: { value: new THREE.Vector2() } });
    this.mCopy = mk(FS_BLUR.replace(/c \+=.*\n/g, '').replace('* 0.2270270270', ''), { tIn: { value: null }, dir: { value: new THREE.Vector2() } });
    const gl = renderer.getContext();
    this.halfOk = renderer.capabilities.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
    this.maxSamples = renderer.capabilities.maxSamples || 0;
    void gl;
    this.opt = { scale: 1, msaa: 0, bloom: 0, sharp: 0.5, grade: 1, vig: 0.35 };
    this.ow = 0; this.oh = 0; this.key = '';
  }

  configure(o) { Object.assign(this.opt, o); this.realloc(); }
  setSize(w, h) { this.ow = w; this.oh = h; this.realloc(); }
  get width() { return this.main ? this.main.width : 0; }

  realloc() {
    const o = this.opt;
    const w = Math.max(64, Math.round(this.ow * o.scale)), h = Math.max(64, Math.round(this.oh * o.scale));
    const samples = Math.min(o.msaa | 0, this.maxSamples);
    const key = [w, h, samples, o.bloom > 0].join();
    if (key === this.key) return;
    this.key = key;
    for (const t of [this.main, this.sharp, this.b1, this.b2, this.c1, this.c2]) if (t) t.dispose();
    this.main = rt(w, h, { depth: true, srgb: true, samples });
    this.sharp = rt(w, h);
    this.b1 = this.b2 = this.c1 = this.c2 = null;
    if (o.bloom > 0) {
      const type = this.halfOk ? THREE.HalfFloatType : THREE.UnsignedByteType;
      const bw = Math.max(8, Math.round(w / 4)), bh = Math.max(8, Math.round(h / 4));
      this.b1 = rt(bw, bh, { type }); this.b2 = rt(bw, bh, { type });
      this.c1 = rt(Math.max(4, bw >> 1), Math.max(4, bh >> 1), { type }); this.c2 = rt(Math.max(4, bw >> 1), Math.max(4, bh >> 1), { type });
    }
  }

  // всё, что рисуется до end(), попадает в буфер пониженного разрешения
  begin() { this.r.setRenderTarget(this.main); }

  pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.scene, this.cam); }

  end() {
    const r = this.r, o = this.opt, M = this.main;
    const ac = r.autoClear; r.autoClear = false;
    // 1) резкость + гамма
    this.mSharp.uniforms.tIn.value = M.texture;
    this.mSharp.uniforms.px.value.set(1 / M.width, 1 / M.height);
    this.mSharp.uniforms.sharp.value = o.sharp;
    this.pass(this.mSharp, this.sharp);
    // 2) свечение
    const F = this.mFinal.uniforms;
    if (o.bloom > 0 && this.b1) {
      this.mBright.uniforms.tIn.value = M.texture;
      this.mBright.uniforms.px.value.set(1 / M.width, 1 / M.height);
      this.mBright.uniforms.th.value = 0.84;
      this.pass(this.mBright, this.b1);
      this.blur(this.b1, this.b2);
      this.mCopy.uniforms.tIn.value = this.b1.texture;
      this.pass(this.mCopy, this.c1);
      this.blur(this.c1, this.c2);
      F.tB1.value = this.b1.texture; F.tB2.value = this.c1.texture;
    }
    F.bloom.value = this.b1 ? o.bloom : 0;
    // 3) апскейл на экран
    F.tIn.value = this.sharp.texture;
    F.inSize.value.set(M.width, M.height);
    F.outSize.value.set(this.ow, this.oh);
    F.easu.value = M.width < this.ow * 0.97 ? 1 : 0;
    F.grade.value = o.grade; F.vig.value = o.vig;
    this.pass(this.mFinal, null);
    r.autoClear = ac;
  }
  blur(a, tmp) {
    const u = this.mBlur.uniforms;
    u.tIn.value = a.texture; u.dir.value.set(1 / a.width, 0); this.pass(this.mBlur, tmp);
    u.tIn.value = tmp.texture; u.dir.value.set(0, 1 / a.height); this.pass(this.mBlur, a);
  }
  dispose() { for (const t of [this.main, this.sharp, this.b1, this.b2, this.c1, this.c2]) if (t) t.dispose(); this.key = ''; }
}
