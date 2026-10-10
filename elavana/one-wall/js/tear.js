/*!
 * Elvana tear engine v2: the "tear the hoarding" hero and the corner peel.
 *
 *   window.ElvanaTear = { mountHero(rootEl, opts), mountPeel(el, opts), autoInit(), setTimeScale(s) }
 *
 * One poster stock. Every strip, coil, falling sheet and corner peel is made of
 * the same paper (MATERIAL below), integrated with fixed 240 Hz substeps, so the
 * same gesture always gives the same shape at any frame rate.
 * Plain canvas 2D, no dependencies. Reduced motion and no-JS never reach this file:
 * the page shows its still, layered composition instead (see tear.css).
 */
(function () {
'use strict';
if (typeof window === 'undefined' || window.ElvanaTear) return;

/* =========================================================================
   MATERIAL: the poster stock. These are the only physical constants.
   Seeded noise is used for torn-edge jaggedness and fibres, never for physics.
   ========================================================================= */
const MATERIAL = Object.freeze({
  memoryK: 0.045,       // R0 = 0.045 * min(W, H): the radius the stock curls to by itself (dried paste memory)
  memoryMin: 12,        //   clamped to 12..26 px
  memoryMax: 26,
  thickness: 1.2,       // h: px every wrap adds to a coil's radius (paper + paste); spiral r = R0 + h * turns
  foldRadius: 7,        // Rmin: the tightest fold the stock takes while pulled taut (bending stiffness)
  cup: 0.12,            // rad: memory also cups a free flap slightly across its width (shading only)
  widthK: 0.26,         // strip base width = 0.26 * min(W, H), clamped 96..220 px
  widthMin: 96,
  widthMax: 220,
  taper: 0.085,         // px of width a strip loses per px torn (tears converge slowly)
  minWidth: 12,         // a strip narrower than this tears off
  steer: 0.011,         // rad per px torn: how fast a tear turns toward the pull
  maxVeer: 0.72,        // rad (~41 deg): the furthest a tear wanders from its starting axis
  stall: -0.3,          // cos of the pull angle past which the tear stops advancing (pulling backwards)
  twist: 0.9,           // x strip width: the run over which a flap twists from the tear edge to the pull
  lift: 0.1,            // while held the flat run rises toward the hand at this slope (5.7 deg); it lowers as it rolls
  edgeEnvelope: 4.6,    // px: a coil's ends sit this far past the strip's mean edge (the torn edges of its wraps, stacked)
  perspective: 900,     // px: paper at height z is drawn (1 + z / 900) times wider, a touch of depth
  front: '#FFD000',     // printed face (read from the poster when possible)
  back: '#E2E1DB',      // paper back, seen on lifted flaps
  fibre: '#FBFBF6',     // the white core exposed along torn edges
  shade: '18,14,6'      // shadow ink (rgb)
});
const EDGE = Object.freeze({ step: 3, low: 3.4, lowScale: 24, mid: 1.5, midScale: 6.5, grain: 1.4 });
// Light from the top left, a little in front. Shadows fall down-right by z * slope.
// White paper bounces light into its own curls, so the back face sees more ambient than the inked front.
const LIGHT = (() => { const x = -0.3, y = -0.5, z = 0.81, m = Math.hypot(x, y, z); return { x: x / m, y: y / m, z: z / m, ambient: 0.5, ambientBack: 0.68, slopeX: 0.26, slopeY: 0.46 }; })();

/* =========================================================================
   MOTION: every curve and spring, named, in one place.
   Springs are critically damped (no overshoot); "ms" is the time to 99.5%.
   ========================================================================= */
const MOTION = Object.freeze({
  hz: 240,              // fixed physics substeps per simulated second
  roll: 560,            // roll: memory curl after release, critically damped, lands at 560 ms
  snap: 0.55,           // snap: on release the stored curl starts the roll at 0.55 of the spring's natural speed
  lift: 180,            // lift: a held flap rises off the wall toward the hand, critically damped
  peelRoll: 620,        // peelRoll: a corner peel let go before the middle rolls back into its resting curl
  peelAway: 900,        // peelAway: past the middle it rolls up from its free end, then rolls on off the sheet
  catchPx: 70,          // catch: the grip's offset to the finger decays by e every 70 px the finger travels
  peek: 240,            // peek: a hovered edge lifts 15 px, critically damped
  peekLift: 15,
  letGo: 1000,          // letGo: the sheet unpeels top to bottom under gravity (tug curve)
  gravity: 2600,        // px/s^2 for paper that has come off
  fallFade: 420,        // ms a falling piece takes to fade once it is past the poster
  paste: 1100,          // paste: the squeegee lays a fresh sheet left to right (paste curve)
  scripted: 760,        // keyboard tear: a scripted pull (pull curve), then release
  invite: 650,          // ms after load before the corner lifts by itself
  velocityMs: 60        // least-squares velocity window
});
const EASE = {
  paste: bezier(0.2, 0.7, 0.1, 1),   // paste: cubic-bezier(.2,.7,.1,1). Squeegee settle; entrances ease out.
  tug: bezier(0.55, 0, 0.75, 0.2),   // tug: cubic-bezier(.55,0,.75,.2). Gravity: a sheet letting go.
  pull: bezier(0.42, 0, 0.3, 1)      // pull: cubic-bezier(.42,0,.3,1). A hand pulling a strip.
};

/* ---------------- maths ---------------- */
const PI = Math.PI, TAU = 2 * PI, HALF = PI / 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrapPi = a => a - TAU * Math.floor((a + PI) / TAU);
const sang = (ax, ay, bx, by) => Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = t => ((ax * t + bx) * t + cx) * t, sy = t => ((ay * t + by) * t + cy) * t;
  const dsx = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const e = sx(t) - x, d = dsx(t); if (Math.abs(e) < 1e-6 || !d) break; t -= e / d; }
    return sy(clamp(t, 0, 1));
  };
}
// Exact critically damped step toward 0: x'' = -2w x' - w^2 x. Unconditionally stable.
function cdStep(s, w, h) {
  const e = Math.exp(-w * h), b = s.v + w * s.x;
  s.x = (s.x + b * h) * e; s.v = (s.v - w * b * h) * e;
}
const SETTLE = 0.005;
// Natural frequency that brings a critically damped spring, started with normalised speed `snap`
// toward its target, to within 0.5% at exactly ms: solve (1 + (1 - snap) u) e^-u = 0.005, u = w T.
function omega(ms, snap) {
  const a = 1 - (snap || 0); let u = 7.43;
  for (let i = 0; i < 30; i++) { const f = (1 + a * u) * Math.exp(-u) - SETTLE, df = (a - 1 - a * u) * Math.exp(-u); u -= f / df; }
  return u / (ms / 1000);
}
// Progress of a release, from rest: the critically damped curve, rescaled so it lands exactly at its
// 99.5% time. Same shape as the spring, but every roll, long or short, ends on the same frame.
const landed = rhoX => clamp((-rhoX - SETTLE) / (1 - SETTLE), 0, 1);   // remaining fraction 1 -> 0
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const noise = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; };
// Torn-edge offset at grid index k (material position k * EDGE.step). Interpolated in between.
const jagK = (seed, k) => { const m = k * EDGE.step; return noise(seed + m / EDGE.lowScale) * EDGE.low + noise(seed * 1.73 + m / EDGE.midScale) * EDGE.mid + (hash(seed * 3.1 + k * 1.37) - 0.5) * EDGE.grain; };

/* ---------------- shared clock ---------------- */
let timeScale = 1;
const instances = new Set();
const nowMs = () => performance.now();
function evTime(e) { const t = e && e.timeStamp, n = nowMs(); return t > 0 && Math.abs(n - t) < 1000 ? t : n; }

// Fixed-step loop with an accumulator. Real time maps to simulated time through
// timeScale (slow motion); physics only ever advances in substeps of 1/240 s.
function Loop(o) {
  this.o = o; this.h = 1 / MOTION.hz; this.t = 0; this.alpha = 1;
  this.real0 = 0; this.sim0 = 0; this.scale = timeScale;
  this.awake = false; this.raf = 0; this.visible = true; this.manual = false; this.lastReal = 0;
  this.frame = this.frame.bind(this);
}
Loop.prototype.simAt = function (real) { return this.sim0 + (real - this.real0) / 1000 * this.scale; };
Loop.prototype.anchor = function (real) { this.sim0 = this.t; this.real0 = real; };
Loop.prototype.setScale = function (s) { const r = this.lastReal || nowMs(); this.advanceTo(r); this.anchor(r); this.scale = s; };
Loop.prototype.wake = function (real) {
  if (!this.awake) { this.awake = true; this.anchor(real); this.lastReal = real; }
  this.request();
};
Loop.prototype.request = function () {
  if (this.manual || this.raf || !this.visible) return;
  this.raf = requestAnimationFrame(this.frame);
};
Loop.prototype.advanceTo = function (real) {
  if (!this.awake) return;
  let target = this.simAt(real);
  if (target - this.t > 0.25) { this.anchor(real - 0.25 * 1000 / this.scale); target = this.simAt(real); }
  while (this.t + this.h <= target + 1e-9) { this.o.step(this.h); this.t += this.h; }
  this.alpha = clamp((target - this.t) / this.h, 0, 1);
  this.lastReal = Math.max(this.lastReal, real);
};
Loop.prototype.frame = function (real) {
  this.raf = 0;
  if (real === undefined) real = nowMs();
  this.advanceTo(real);
  this.o.render(this.alpha);
  if (this.o.busy()) this.request(); else this.awake = false;
};

/* ---------------- pointer velocity: least squares over the last ~60 ms ---------------- */
function Track() { this.s = []; }
Track.prototype.reset = function () { this.s.length = 0; };
Track.prototype.add = function (t, x, y) { const s = this.s; s.push(t, x, y); if (s.length > 96) s.splice(0, s.length - 96); };
Track.prototype.velocity = function () {
  const s = this.s, n = s.length / 3; if (n < 2) return { x: 0, y: 0 };
  const tEnd = s[s.length - 3]; let i0 = n - 1;
  while (i0 > 0 && (tEnd - s[(i0 - 1) * 3] <= MOTION.velocityMs || n - i0 < 3)) i0--;
  let st = 0, sx = 0, sy = 0, c = 0;
  for (let i = i0; i < n; i++) { st += s[i * 3]; sx += s[i * 3 + 1]; sy += s[i * 3 + 2]; c++; }
  st /= c; sx /= c; sy /= c;
  let tt = 0, tx = 0, ty = 0;
  for (let i = i0; i < n; i++) { const dt = s[i * 3] - st; tt += dt * dt; tx += dt * (s[i * 3 + 1] - sx); ty += dt * (s[i * 3 + 2] - sy); }
  if (tt < 1e-6) return { x: 0, y: 0 };
  return { x: tx / tt * 1000, y: ty / tt * 1000 };   // px/s
};

/* =========================================================================
   FLAP GEOMETRY: a pure function of the strip's material, its head frame,
   torn length L, grip distance X and twist. Cross-section along the flap
   axis u, height z off the poster:
     fold   s in [0, pi Rf]          the paper leaves the wall and folds back over a cylinder (radius Rf)
     flat   s in [pi Rf, pi Rf + Xs]  runs straight at height 2 Rf toward the grip
     coil   s in [.., L]             the free end, wound as a spiral: innermost radius R0, + h per wrap
   The grip (finger) is the free end when taut, the coil's centre when slack.
   ========================================================================= */
const KF = 16, KC = 20;   // fold and coil angular resolution (per half turn)
const W_ROLL = omega(MOTION.roll, MOTION.snap), W_LIFT = omega(MOTION.lift), W_PEEK = omega(MOTION.peek);
const liftCs = st => Math.sqrt(1 + (st.lift || 0) * (st.lift || 0));
const xsLen = (Ro, h, th) => Ro * th - h * th * th / (4 * PI);         // material from the coil entry to angle th
function coilTheta(Lc, R0, h) {                                       // total wrap angle for coiled length Lc
  if (Lc <= 0) return 0;
  const k = h / (4 * PI); return (-R0 + Math.sqrt(R0 * R0 + 4 * k * Lc)) / (2 * k);
}

// Output arrays are reused between frames; geometry objects are plain data.
function makeSample() { return { cx: 0, cy: 0, ex: 0, ey: 0, l: 0, r: 0, k: 1, z: 0, nu: 0, nz: 1, ao: 1, tl: 1, tr: 1, m: 0 }; }
function Region() { this.n = 0; this.s = []; this.face = 0; this.ex = 0; this.ey = 0; this.gx = 0; this.gy = 0; this.flat = false; }
Region.prototype.reset = function (face, flat) { this.n = 0; this.face = face; this.flat = flat; return this; };
Region.prototype.push = function () { if (this.n === this.s.length) this.s.push(makeSample()); return this.s[this.n++]; };
function Geo() {
  this.foldLow = new Region(); this.foldHigh = new Region(); this.flat = new Region();
  this.coilIn = new Region(); this.coilOut = new Region(); this.ring = new Region();
  this.order = [this.foldLow, this.foldHigh, this.flat, this.coilIn, this.coilOut];
  this.coil = null; this.zmax = 0; this.base = [0, 0, 0, 0];
}

/*
  F = { hx, hy, dx, dy (unit tear direction at the head), L, X, gamma, sgn,
        Rf, R0, h, xT, mat(m, out) -> out.{l, r, sl, sr, tl, tr} }
  The flap axis is u = sgn * rot(d, gamma). The lateral axis twists from the head
  edge (perpendicular to d) to perpendicular to u over xT.
*/
const MT = { l: 0, r: 0, sl: 0, sr: 0, tl: 1, tr: 1 }, MT2 = { l: 0, r: 0, sl: 0, sr: 0, tl: 1, tr: 1 };
function flapGeo(F, G) {
  const { hx, hy, dx, dy, L, Rf, R0, h } = F;
  const vdx = -dy, vdy = dx;                                         // head edge (material left)
  const cg = Math.cos(F.gamma), sg = Math.sin(F.gamma);
  const ux = F.sgn * (dx * cg - dy * sg), uy = F.sgn * (dx * sg + dy * cg);
  G.ux = ux; G.uy = uy; G.coil = null;
  const P = MATERIAL.perspective;
  const sF = PI * Rf;
  let zmax = 0;
  const lat = x => F.gamma * smooth(0, F.xT, x);                       // twist angle at distance x along the flap
  // ---- fold ----
  const A = Math.min(PI, L / Rf);
  G.foldLow.reset(1, false); G.foldHigh.reset(0, false);
  const putFold = (R, a) => {
    const s = a * Rf, x = -Rf * Math.sin(a), z = Rf * (1 - Math.cos(a)), q = R.push();
    F.mat(L - s, MT);
    q.cx = hx + x * ux; q.cy = hy + x * uy; q.ex = vdx; q.ey = vdy; q.z = z; q.k = 1 + z / P; q.m = L - s;
    q.l = MT.l; q.r = MT.r; q.tl = MT.tl; q.tr = MT.tr; q.ao = 1;
    if (R === G.foldLow) { q.nu = Math.sin(a); q.nz = Math.cos(a); } else { q.nu = -Math.sin(a); q.nz = -Math.cos(a); }
    if (z > zmax) zmax = z;
  };
  if (A > 1e-4) {
    const aLow = Math.min(A, HALF);
    for (let i = 0; i <= KF; i++) { const a = i * HALF / KF; if (a >= aLow) break; putFold(G.foldLow, a); }
    putFold(G.foldLow, aLow);
    if (A > HALF) {
      for (let i = 0; i <= KF; i++) { const a = HALF + i * HALF / KF; if (a >= A) break; putFold(G.foldHigh, a); }
      putFold(G.foldHigh, A);
    }
  }
  G.foldLow.ex = G.foldHigh.ex = vdx; G.foldLow.ey = G.foldHigh.ey = vdy;
  G.foldLow.gx = G.foldHigh.gx = G.flat.gx = ux; G.foldLow.gy = G.foldHigh.gy = G.flat.gy = uy;
  // ---- flat run and coil ----
  G.flat.reset(0, true); G.coilIn.reset(0, false); G.coilOut.reset(1, false); G.ring.reset(1, false);
  if (L > sF + 1e-6) {
    // the flat run climbs from the fold top (z = 2 Rf) at slope kap; its material length is x * cs
    const kap = F.lift || 0, cs = Math.sqrt(1 + kap * kap), nlu = -kap / cs, nlz = 1 / cs;
    const avail = L - sF, Xs = clamp(F.X, 0, avail / cs), Lc = Math.max(0, avail - Xs * cs), z0 = 2 * Rf;
    const putFlat = (x, xm) => {
      const q = G.flat.push(), m = L - sF - xm * cs, b = lat(Math.max(0, x)), cb = Math.cos(b), sb = Math.sin(b);
      F.mat(m, MT);
      q.cx = hx + x * ux; q.cy = hy + x * uy; q.ex = vdx * cb - vdy * sb; q.ey = vdx * sb + vdy * cb;
      q.z = z0 + kap * Math.max(0, xm); q.k = 1 + q.z / P; q.l = MT.l; q.r = MT.r; q.tl = MT.tl; q.tr = MT.tr; q.nu = nlu; q.nz = nlz; q.ao = 1; q.m = m;
      if (q.z > zmax) zmax = q.z;
    };
    if (Xs > 1e-6) {
      putFlat(-0.9, 0);                                                 // tucks under the fold lip: no seam
      putFlat(0, 0);
      const step = EDGE.step, mHi = L - sF, mLo = L - sF - Xs * cs;     // material runs from mHi (x=0) down to mLo (x=Xs)
      for (let k = Math.floor(mHi / step); k * step > mLo; k--) { const x = (mHi - k * step) / cs; if (x > 0 && x < Xs) putFlat(x, x); }
      putFlat(Xs, Xs);
    }
    if (z0 > zmax) zmax = z0;
    if (Lc > 1e-3) {
      const Th = coilTheta(Lc, R0, h), Ro = R0 + h * Th / TAU;
      const ccx = hx + Xs * ux, ccy = hy + Xs * uy, zc = z0 + kap * Xs + Ro;
      const b = lat(Xs), cb = Math.cos(b), sb = Math.sin(b), ex = vdx * cb - vdy * sb, ey = vdx * sb + vdy * cb;
      // the coil is a true cylinder: its cross-section runs square to its own axis (gx, gy), never sheared
      const gx = F.sgn * (dx * cb - dy * sb), gy = F.sgn * (dx * sb + dy * cb);
      const sEntry = sF + Xs * cs;
      G.coil = { cx: ccx, cy: ccy, Ro, R0, Th, z: zc, ex, ey, gx, gy, entry: L - sEntry };
      // A coil's ends are its layers' edges stacked. Seen from above, the end at angle th is the widest
      // paper wound inside it: a prefix maximum over material from the free end (m = 0) to here.
      const mEntry = L - sEntry, nE = Math.max(1, Math.ceil(mEntry / EDGE.step));
      const PL = G.pl || (G.pl = []), PR = G.pr || (G.pr = []);
      let al = 0, ar = 0;
      for (let i = 0; i <= nE; i++) { F.mat(Math.min(mEntry, i * EDGE.step), MT2); if (MT2.sl > al) al = MT2.sl; if (MT2.sr > ar) ar = MT2.sr; PL[i] = al; PR[i] = ar; }
      const widthAt = (th, out) => {
        const m = clamp(mEntry - xsLen(Ro, h, Math.min(th, Th)), 0, mEntry), f = m / EDGE.step, i = Math.min(nE, Math.floor(f)), j = Math.min(nE, i + 1), t = f - i;
        out.l = lerp(PL[i], PL[j], t); out.r = lerp(PR[i], PR[j], t); out.tl = out.tr = 1;
      };
      const putCoil = (R, th, inner) => {
        const q = R.push(), rr = Ro - h * th / TAU, st = Math.sin(th), ct = Math.cos(th);
        widthAt(th, MT);
        q.cx = ccx + rr * st * gx; q.cy = ccy + rr * st * gy; q.ex = ex; q.ey = ey;
        q.z = zc - rr * ct; q.k = 1 + q.z / P; q.l = MT.l; q.r = MT.r; q.tl = 1; q.tr = 1; q.m = L - sEntry - xsLen(Ro, h, th);
        if (inner) { q.nu = -st; q.nz = ct; q.ao = 1 - 0.2 * (1 - ct); } else { q.nu = st; q.nz = -ct; q.ao = 1; }
        if (q.z > zmax) zmax = q.z;
      };
      const tIn = Math.min(Th, HALF);
      putCoil(G.coilIn, 0, true); { const q = G.coilIn.s[0]; q.cx -= gx * 0.9; q.cy -= gy * 0.9; }   // tuck under the run
      for (let i = 0; i <= KC; i++) { const t = i * HALF / KC; if (t >= tIn) break; putCoil(G.coilIn, t, true); }
      putCoil(G.coilIn, tIn, true);
      if (Th > HALF) {
        const tOut = Math.min(Th, 3 * HALF);
        for (let i = 0; i <= 2 * KC; i++) { const t = HALF + i * HALF / KC; if (t >= tOut) break; putCoil(G.coilOut, t, false); }
        putCoil(G.coilOut, tOut, false);
      }
      // the whole outer wrap, for the cast shadow
      const tRing = Math.min(Th, TAU);
      for (let i = 0; i <= 4 * KC; i += 2) { const t = i * HALF / KC; if (t >= tRing) break; putCoil(G.ring, t, false); }
      putCoil(G.ring, tRing, false);
      G.coilIn.ex = G.coilOut.ex = ex; G.coilIn.ey = G.coilOut.ey = ey;
      G.coilIn.gx = G.coilOut.gx = G.ring.gx = gx; G.coilIn.gy = G.coilOut.gy = G.ring.gy = gy;
    }
  }
  // the crease where the paper leaves the wall
  F.mat(L, MT);
  G.base[0] = hx + vdx * MT.l; G.base[1] = hy + vdy * MT.l; G.base[2] = hx - vdx * MT.r; G.base[3] = hy - vdy * MT.r;
  G.zmax = zmax;
  return G;
}

// Where material m of a flap sits on screen (centre line), for tests and the debug overlay.
function materialPoint(F, m) {
  const { hx, hy, dx, dy, L, Rf, R0, h } = F;
  const cg = Math.cos(F.gamma), sg = Math.sin(F.gamma);
  const ux = F.sgn * (dx * cg - dy * sg), uy = F.sgn * (dx * sg + dy * cg);
  const s = L - m, sF = PI * Rf;
  if (s <= sF) { const a = s / Rf, x = -Rf * Math.sin(a); return { x: hx + x * ux, y: hy + x * uy, z: Rf * (1 - Math.cos(a)) }; }
  const kap = F.lift || 0, cs = Math.sqrt(1 + kap * kap);
  const avail = L - sF, Xs = clamp(F.X, 0, avail / cs);
  if (s <= sF + Xs * cs) { const x = (s - sF) / cs; return { x: hx + x * ux, y: hy + x * uy, z: 2 * Rf + kap * x }; }
  const Lc = Math.max(0, avail - Xs * cs), Th = coilTheta(Lc, R0, h), Ro = R0 + h * Th / TAU, l = s - sF - Xs * cs;
  const k = h / (4 * PI), th = (Ro - Math.sqrt(Math.max(0, Ro * Ro - 4 * k * l))) / (2 * k), rr = Ro - h * th / TAU;
  const b = F.gamma * smooth(0, F.xT, Xs), gx = F.sgn * (dx * Math.cos(b) - dy * Math.sin(b)), gy = F.sgn * (dx * Math.sin(b) + dy * Math.cos(b));
  const ox = rr * Math.sin(th);
  return { x: hx + Xs * ux + ox * gx, y: hy + Xs * uy + ox * gy, z: 2 * Rf + kap * Xs + Ro - rr * Math.cos(th) };
}

/* =========================================================================
   DRAWING
   ========================================================================= */
function rgbOf(c) {
  if (Array.isArray(c)) return c;
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (m) { const p = m[1].split(',').map(parseFloat); return [p[0], p[1], p[2]]; }
  const h = String(c).replace('#', '');
  const v = h.length === 3 ? h.split('').map(x => parseInt(x + x, 16)) : [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  return v.some(isNaN) ? [255, 208, 0] : v;
}
const HV = (() => { const x = LIGHT.x, y = LIGHT.y, z = LIGHT.z + 1, m = Math.hypot(x, y, z); return { x: x / m, y: y / m, z: z / m }; })();
const SPEC_P = 36, SPEC_FLAT = Math.pow(HV.z, SPEC_P);
// Lambert + a narrow Blinn highlight, normalised so paper lying flat is exactly its own colour.
function shade(rgb, ux, uy, nu, nz, ao, spec, amb) { return shadeN(rgb, nu * ux, nu * uy, nz, ao, spec, amb); }
function shadeN(rgb, nx, ny, nz, ao, spec, amb) {
  const A = amb || LIGHT.ambient, dif = Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z);
  const f = (A + (1 - A) * dif / LIGHT.z) * ao;
  const sp = spec * Math.max(0, Math.pow(Math.max(0, nx * HV.x + ny * HV.y + nz * HV.z), SPEC_P) - SPEC_FLAT);
  const c = i => Math.min(255, Math.round(rgb[i] * f + 255 * sp));
  return 'rgb(' + c(0) + ',' + c(1) + ',' + c(2) + ')';
}

function Painter(ctx) { this.ctx = ctx; this.dpr = 1; this.box = [Infinity, Infinity, -Infinity, -Infinity]; this.track = true; }
Painter.prototype.grow = function (x, y, m) { const b = this.box; if (x - m < b[0]) b[0] = x - m; if (y - m < b[1]) b[1] = y - m; if (x + m > b[2]) b[2] = x + m; if (y + m > b[3]) b[3] = y + m; };
// polygon of a region: left edge forward, right edge back
Painter.prototype.ribbon = function (R, dz, margin, into) {
  const c = into || this.ctx, d = this.dpr, S = R.s, n = R.n, ox = dz ? LIGHT.slopeX : 0, oy = dz ? LIGHT.slopeY : 0, off = dz || 0, m = (margin || 2) + 2, tr = this.track && !into;
  for (let i = 0; i < n; i++) { const q = S[i], kk = q.l * q.k; const x = (q.cx + q.ex * kk + q.z * ox) * d, y = (q.cy + q.ey * kk + q.z * oy) * d; i ? c.lineTo(x - off, y) : c.moveTo(x - off, y); if (tr) this.grow(x, y, m); }
  for (let i = n - 1; i >= 0; i--) { const q = S[i], kk = q.r * q.k; const x = (q.cx - q.ex * kk + q.z * ox) * d, y = (q.cy - q.ey * kk + q.z * oy) * d; c.lineTo(x - off, y); if (tr) this.grow(x, y, m); }
  c.closePath();
};
Painter.prototype.fillRegion = function (R, front, back) {
  if (R.n < 2) return;
  const c = this.ctx, d = this.dpr, S = R.s, rgb = R.face ? front : back, spec = R.face ? 0.3 : 0.08, amb = R.face ? LIGHT.ambient : LIGHT.ambientBack, ux = R.gx, uy = R.gy;   // printed ink: a satin sheen; the back: matte
  c.beginPath(); this.ribbon(R, 0);
  if (R.flat) {
    // a free flap cups a little across its width: one gradient from edge to edge, tilted normals
    const q = S[R.n >> 1], cp = MATERIAL.cup, kk = q.k;
    const gr = c.createLinearGradient((q.cx - q.ex * q.r * kk) * d, (q.cy - q.ey * q.r * kk) * d, (q.cx + q.ex * q.l * kk) * d, (q.cy + q.ey * q.l * kk) * d);
    for (const t of [0, 0.5, 1]) {
      const a = (t * 2 - 1) * cp, ca = Math.cos(a), sa = Math.sin(a);       // edges tip up, toward the middle
      const nx = q.nu * ux * ca - q.ex * sa * q.nz, ny = q.nu * uy * ca - q.ey * sa * q.nz;
      gr.addColorStop(t, shadeN(rgb, nx, ny, q.nz * ca, q.ao, spec, amb));
    }
    c.fillStyle = gr; c.fill(); return;
  }
  // gradient across the cylinder: along the perpendicular of the region's lateral axis
  const gx = R.ey, gy = -R.ex;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < R.n; i++) { const p = S[i].cx * gx + S[i].cy * gy; if (p < lo) lo = p; if (p > hi) hi = p; }
  if (hi - lo < 0.35) { const q = S[R.n >> 1]; c.fillStyle = shade(rgb, ux, uy, q.nu, q.nz, q.ao, spec, amb); c.fill(); return; }
  const q0 = S[0]; const p0 = q0.cx * gx + q0.cy * gy;
  const bx = q0.cx + gx * (lo - p0), by = q0.cy + gy * (lo - p0);
  const gr = c.createLinearGradient(bx * d, by * d, (bx + gx * (hi - lo)) * d, (by + gy * (hi - lo)) * d);
  const span = hi - lo, stride = R.n > 28 ? 2 : 1;
  for (let i = 0; ; i = Math.min(i + stride, R.n - 1)) {
    const q = S[i];
    gr.addColorStop(clamp((q.cx * gx + q.cy * gy - lo) / span, 0, 1), shade(rgb, ux, uy, q.nu, q.nz, q.ao, spec, amb));
    if (i === R.n - 1) break;
  }
  c.fillStyle = gr; c.fill();
};
// Torn edge on lifted paper: a solid white core, then a broken haze of fibres just outside it.
// The haze is dashed along the material (dash offset = material position), so it never crawls.
Painter.prototype.edges = function (R, width, style) {
  if (R.n < 2) return;
  const c = this.ctx, d = this.dpr, S = R.s;
  const pass = (lw, st, out, dashed) => {
    c.strokeStyle = st; c.lineWidth = lw * d;
    for (let side = 0; side < 2; side++) {
      let open = false;
      for (let i = 0; i < R.n; i++) {
        const q = S[i], torn = side ? q.tr : q.tl, w = (side ? -(q.r + out) : q.l + out) * q.k;
        if (!torn || (q.l + q.r) <= 0.2) { if (open) { c.stroke(); open = false; } continue; }
        const x = (q.cx + q.ex * w) * d, y = (q.cy + q.ey * w) * d;
        if (!open) { c.beginPath(); if (dashed) c.lineDashOffset = -q.m * d * (side ? 1.13 : 1); c.moveTo(x, y); open = true; } else c.lineTo(x, y);
      }
      if (open) c.stroke();
    }
  };
  pass(width, style, 0, false);
  c.setLineDash([1.6 * d, 2.4 * d, 3.2 * d, 1.7 * d, 0.9 * d, 2.8 * d]);
  pass(width * 0.75, 'rgba(251,251,246,0.5)', 0.9, true);
  c.setLineDash([]);
};
/*
  opt: { front:[r,g,b], back:[r,g,b], alpha, fibre:bool, crease:bool }
  Shadow on the poster, the paper itself (fold, flat run, coil inside, coil outside),
  then the white fibre along torn edges.
*/
Painter.prototype.flap = function (G, opt) {
  const c = this.ctx, d = this.dpr, a = opt.alpha == null ? 1 : opt.alpha, ux = G.ux, uy = G.uy;
  if (a <= 0.003) return;
  const BIG = 30000;
  c.save(); c.globalAlpha = a;
  // Cast shadow: every part offset by its own height, one blur scaled by the highest point. The blur is
  // done at quarter resolution in a small buffer and drawn back scaled up: the same soft edge, 1/16 the work.
  const blur = (4 + 0.16 * G.zmax) * d, parts = [G.foldHigh, G.flat, G.coilOut, G.ring];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const R of parts) for (let i = 0; i < R.n; i++) {
    const q = R.s[i], w = Math.max(Math.abs(q.l), Math.abs(q.r)) * q.k, x = (q.cx + q.z * LIGHT.slopeX) * d, y = (q.cy + q.z * LIGHT.slopeY) * d, m = w * d;
    if (x - m < x0) x0 = x - m; if (x + m > x1) x1 = x + m; if (y - m < y0) y0 = y - m; if (y + m > y1) y1 = y + m;
  }
  if (x1 > x0) {
    const pad = blur * 2 + 4, S = 0.25; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const bw = Math.ceil((x1 - x0) * S) + 2, bh = Math.ceil((y1 - y0) * S) + 2;
    const buf = this.shadowBuf || (this.shadowBuf = document.createElement('canvas')), sc = buf.getContext('2d');
    if (buf.width < bw || buf.height < bh) { buf.width = Math.max(buf.width, bw + 32); buf.height = Math.max(buf.height, bh + 32); }
    sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, bw, bh);
    sc.setTransform(S, 0, 0, S, -x0 * S, -y0 * S);
    sc.shadowColor = 'rgb(' + MATERIAL.shade + ')'; sc.shadowBlur = blur * S; sc.shadowOffsetX = BIG * S; sc.shadowOffsetY = 0;
    sc.fillStyle = '#000'; sc.beginPath();
    for (const R of parts) if (R.n > 1) this.ribbon(R, BIG, 0, sc);
    sc.fill();
    c.globalAlpha = a * 0.3; c.imageSmoothingEnabled = true;
    c.drawImage(buf, 0, 0, bw, bh, x0, y0, bw / S, bh / S);
    c.globalAlpha = a;
    if (this.track) { this.grow(x0, y0, 2); this.grow(x0 + bw / S, y0 + bh / S, 2); }
  }
  // contact shadow: tight and dark where paper meets the wall (the crease at the head)
  if (opt.crease !== false && G.foldLow.n > 1) {
    c.shadowBlur = 4 * d; c.shadowColor = 'rgba(' + MATERIAL.shade + ',0.58)';
    c.lineWidth = 2.8 * d; c.strokeStyle = '#000'; c.lineCap = 'round';
    c.beginPath(); c.moveTo(G.base[0] * d - BIG, G.base[1] * d); c.lineTo(G.base[2] * d - BIG, G.base[3] * d); c.stroke();
    this.grow(G.base[0] * d, G.base[1] * d, 12 * d); this.grow(G.base[2] * d, G.base[3] * d, 12 * d);
  }
  c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetX = 0;
  // back to front; each region's torn edge is drawn with it so nearer paper covers it
  const f = 'rgba(251,251,246,0.92)', fib = (R, w) => { if (opt.fibre) this.edges(R, w, f); };
  this.fillRegion(G.foldLow, opt.front, opt.back, ux, uy);
  this.fillRegion(G.foldHigh, opt.front, opt.back, ux, uy); fib(G.foldHigh, 1.4);
  this.fillRegion(G.flat, opt.front, opt.back, ux, uy); fib(G.flat, 1.4);
  // the coil sits on the paper: soft contact shadow under it
  if (G.coil && G.coilOut.n > 1) {
    const K = G.coil, mid = G.coilOut.s[G.coilOut.n >> 1];
    if (mid.l + mid.r > 1) {
      c.save();
      c.shadowColor = 'rgba(' + MATERIAL.shade + ',0.34)'; c.shadowBlur = (2 + K.Ro * 0.22) * d; c.shadowOffsetX = BIG;
      c.lineWidth = K.Ro * 0.75 * d; c.strokeStyle = '#000'; c.lineCap = 'butt';
      const q = G.coilOut.s[G.coilOut.n >> 1], ol = q.l * 0.96, or = q.r * 0.96;
      const sx = LIGHT.slopeX * (K.z - K.Ro), sy = LIGHT.slopeY * (K.z - K.Ro);
      c.beginPath();
      c.moveTo((K.cx + K.ex * ol + sx) * d - BIG, (K.cy + K.ey * ol + sy) * d);
      c.lineTo((K.cx - K.ex * or + sx) * d - BIG, (K.cy - K.ey * or + sy) * d);
      c.stroke(); c.restore();
      const mm = (K.Ro + 12) * d; this.grow((K.cx + K.ex * ol + sx) * d, (K.cy + K.ey * ol + sy) * d, mm); this.grow((K.cx - K.ex * or + sx) * d, (K.cy - K.ey * or + sy) * d, mm);
    }
  }
  this.fillRegion(G.coilIn, opt.front, opt.back, ux, uy); fib(G.coilIn, 1.2);
  this.fillRegion(G.coilOut, opt.front, opt.back, ux, uy); fib(G.coilOut, 1.3);
  c.restore();
};

/* ---------------- poster geometry helpers ---------------- */
// The stretch of the line (x, y) + t (nx, ny) that lies inside [0, W] x [0, H].
function slab(x, y, nx, ny, W, H) {
  let t0 = -1e9, t1 = 1e9;
  if (Math.abs(nx) < 1e-9) { if (x < 0 || x > W) return [1, 0]; } else { const a = -x / nx, b = (W - x) / nx; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b)); }
  if (Math.abs(ny) < 1e-9) { if (y < 0 || y > H) return [1, 0]; } else { const a = -y / ny, b = (H - y) / ny; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b)); }
  return [t0, t1];
}
function pip(x, y, P) {   // P: { box, xs, ys }
  const b = P.box; if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) return false;
  const X = P.xs, Y = P.ys, n = X.length; let c = false;
  for (let i = 0, j = n - 1; i < n; j = i++) if ((Y[i] > y) !== (Y[j] > y) && x < (X[j] - X[i]) * (y - Y[i]) / (Y[j] - Y[i]) + X[i]) c = !c;
  return c;
}

/* =========================================================================
   HERO: tear strips off the hoarding.
   DOM contract (same as the variation A page):
     section.hero                    root, position:relative
       .sheet.sheet-top              the poster on top (its background is the printed face)
       .sheet.sheet-under            the poster underneath, clip-path:url(#tear-clip) while live
       canvas.tear-canvas            paper, shadows and fibres (reaches below the hero)
       .grip                         edge zones with touch-action:none
       #tear-live                    polite live region
     svg clipPath#tear-clip          userSpaceOnUse; one path per strip is added here
     #tear-btn                       "Tear a strip" / "Paste it back"
   ========================================================================= */
const SVGNS = 'http://www.w3.org/2000/svg';
const MAX_DPR = 1.5;   // canvas pixel density cap: crisp enough for paper edges, half the pixels of 2x

function motionAllowed() {
  const c = document.documentElement.classList;
  if (c.contains('motion')) return true;
  if (c.contains('js') || c.contains('no-js')) return false;           // the page decided: reduced motion
  return !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function mountHero(root, opts) {
  if (!root || !motionAllowed()) return null;
  if (root.__elvanaTear) return root.__elvanaTear;
  opts = opts || {};
  const canvas = opts.canvas || root.querySelector('.tear-canvas');
  const clipEl = opts.clip || document.getElementById('tear-clip');
  const btn = opts.button === undefined ? document.getElementById('tear-btn') : opts.button;
  const live = opts.live === undefined ? document.getElementById('tear-live') : opts.live;
  if (!canvas || !clipEl || !canvas.getContext) return null;
  const ctx = canvas.getContext('2d');
  const paint = new Painter(ctx);
  // The settled layer (rims and resting paper) is an offscreen canvas, never in the DOM: the page keeps a
  // single canvas, and each frame only the box the moving paper used is cleared and re-blitted from it.
  const rimCanvas = document.createElement('canvas'), rctx = rimCanvas.getContext('2d');      // settled rims
  const flapCanvas = document.createElement('canvas'), fctx = flapCanvas.getContext('2d');    // settled paper
  let lastBox = 'all';
  const STEP = EDGE.step;

  let W = 0, H = 0, dpr = 1, EXTRA = 140;
  let R0 = 18, w0 = 140, Rf = MATERIAL.foldRadius, sF = PI * Rf;
  let front = rgbOf(MATERIAL.front), back = rgbOf(MATERIAL.back);
  let strips = [], peek = null, drag = null, letgo = null, paste = null, revealed = false, planIdx = 0;
  let falls = [], tasks = [], scripts = [], seedN = 0, announced = false, rimsDirty = true, pendRims = [], pendFlaps = [], debugOn = !!opts.debug;
  const stats = { draw: [], sec: {} };
  const tick = (k, t0) => { const t = nowMs(); stats.sec[k] = (stats.sec[k] || 0) + t - t0; return t; };
  const track = new Track();
  const revealPath = document.createElementNS(SVGNS, 'path');
  const peekPath = document.createElementNS(SVGNS, 'path');
  const geo = new Geo(), geoPeek = new Geo();

  const loop = new Loop({ step, render, busy });
  const inst = { root, kind: 'hero', loop };
  instances.add(inst);

  /* ---------- size ---------- */
  function readColours() {
    const top = root.querySelector('.sheet-top');
    if (top) { const bg = getComputedStyle(top).backgroundColor; if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) front = rgbOf(bg); }
    const bk = getComputedStyle(document.documentElement).getPropertyValue('--back').trim();
    if (bk) back = rgbOf(bk);
    if (opts.front) front = rgbOf(opts.front);
    if (opts.back) back = rgbOf(opts.back);
  }
  function measure() {
    const r = root.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const ow = W, oh = H;
    W = r.width; H = r.height;
    const cr = canvas.getBoundingClientRect();
    EXTRA = Math.max(0, Math.round(cr.height - H)) || 0;
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round((H + EXTRA) * dpr);
    rimCanvas.width = flapCanvas.width = canvas.width; rimCanvas.height = flapCanvas.height = canvas.height;
    paint.dpr = dpr;
    R0 = clamp(MATERIAL.memoryK * Math.min(W, H), MATERIAL.memoryMin, MATERIAL.memoryMax);
    w0 = clamp(MATERIAL.widthK * Math.min(W, H), MATERIAL.widthMin, MATERIAL.widthMax);
    if (ow && (Math.abs(ow - W) > 0.5 || Math.abs(oh - H) > 0.5)) rescale(W / ow, H / oh);
    rimsDirty = true; lastBox = 'all'; render(1);
  }
  function rescale(sx, sy) {
    for (const st of strips) {
      for (const p of st.pts) { p.x *= sx; p.y *= sy; }
      st.G.x *= sx; st.G.y *= sy;
      for (const p of st.pts) clipPoint(st, p);
      st.dirty = true;
    }
  }

  /* ---------- strips: material on a fixed grid of EDGE.step px ---------- */
  const widthAt = (st, m) => Math.max(0, st.w0 - MATERIAL.taper * m);
  function newStrip(G, a, seed) {
    const m = Math.hypot(a.x, a.y), ax = a.x / m, ay = a.y / m;
    const st = {
      id: ++seedN, seed: seed != null ? seed : 13.7 + seedN * 61.3, G: { x: G.x, y: G.y }, ax, ay, dx: ax, dy: ay,
      w0, pts: [], L: 0, entered: false, detached: false,
      mode: 'held', X: 0, gamma: 0, sgn: 1, lift: 0, liftV: 0, pX: 0, pG: 0, pK: 0, roll: null,
      path: document.createElementNS(SVGNS, 'path'), dirty: true, test: null
    };
    pushPt(st, G.x, G.y);
    clipEl.appendChild(st.path);
    strips.push(st);
    return st;
  }
  function pushPt(st, x, y) {
    const k = st.pts.length, m = k * STEP, w = widthAt(st, m) / 2;
    const p = { x, y, nx: -st.dy, ny: st.dx, hl: w + jagK(st.seed, k), hr: w + jagK(st.seed + 97, k), w, cl: 0, cr: 0, sl: 0, sr: 0, tl: 1, tr: 1 };
    clipPoint(st, p);
    st.pts.push(p);
  }
  // The flap only has paper that existed: inside the poster and not already torn away by older strips.
  function clipPoint(st, p) {
    const [t0, t1] = slab(p.x, p.y, p.nx, p.ny, W, H);
    let hi = Math.min(p.hl, t1), lo = Math.max(-p.hr, t0), shi = Math.min(p.w + MATERIAL.edgeEnvelope, t1), slo = Math.max(-(p.w + MATERIAL.edgeEnvelope), t0);
    let tl = p.hl <= t1 ? 1 : 0, tr = -p.hr >= t0 ? 1 : 0;
    if (hi > lo) {
      // the nearest older-hole edge on each side of the centre line, by direct line/edge intersection
      const c0 = clamp(0, lo, hi), cx = p.x + p.nx * c0, cy = p.y + p.ny * c0;
      const ax = p.x + p.nx * lo, ay = p.y + p.ny * lo, bx = p.x + p.nx * hi, by = p.y + p.ny * hi;
      const sx0 = Math.min(ax, bx), sx1 = Math.max(ax, bx), sy0 = Math.min(ay, by), sy1 = Math.max(ay, by);
      for (const o of strips) {
        if (o === st || !o.test || o.id >= st.id) continue;
        const bb = o.test.box; if (sx1 < bb[0] || sx0 > bb[2] || sy1 < bb[1] || sy0 > bb[3]) continue;
        if (pip(cx, cy, o.test)) { hi = lo = 0; break; }
        const X = o.test.xs, Y = o.test.ys, n = X.length;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          // solve p + n t = edge(a..b): t along the lateral line, u along the edge
          const ex = X[i] - X[j], ey = Y[i] - Y[j], den = p.nx * ey - p.ny * ex;
          if (Math.abs(den) < 1e-9) continue;
          const wx = X[j] - p.x, wy = Y[j] - p.y, t = (wx * ey - wy * ex) / den, u = (wx * p.ny - wy * p.nx) / den;
          if (u < 0 || u > 1) continue;
          if (t > c0 && t - 1.5 < hi) { hi = t - 1.5; tl = 1; } else if (t < c0 && t + 1.5 > lo) { lo = t + 1.5; tr = 1; }
        }
      }
    }
    if (hi <= lo) { p.cl = p.cr = p.sl = p.sr = 0; }
    else { p.cl = hi; p.cr = -lo; p.sl = Math.min(shi, hi); p.sr = Math.min(-slo, -lo); }
    p.tl = tl; p.tr = tr;
  }
  function headOf(st) {
    const n = st.pts.length, p = st.pts[n - 1], r = st.L - (n - 1) * STEP;
    return { x: p.x + st.dx * r, y: p.y + st.dy * r };
  }
  // material m (distance from the strip's start) -> half widths; linear between grid points
  const headPt = { x: 0, y: 0, nx: 0, ny: 0, hl: 0, hr: 0, w: 0, cl: 0, cr: 0, sl: 0, sr: 0, tl: 1, tr: 1 };
  function headPoint(st) {
    const h = headOf(st), k = st.L / STEP, k0 = Math.floor(k), f = k - k0, w = widthAt(st, st.L) / 2;
    headPt.x = h.x; headPt.y = h.y; headPt.nx = -st.dy; headPt.ny = st.dx; headPt.w = w;
    headPt.hl = w + lerp(jagK(st.seed, k0), jagK(st.seed, k0 + 1), f);
    headPt.hr = w + lerp(jagK(st.seed + 97, k0), jagK(st.seed + 97, k0 + 1), f);
    clipPoint(st, headPt);
    return headPt;
  }
  function matFn(st) {
    const hp = headPoint(st), P = st.pts, n = P.length;
    const hpc = { cl: hp.cl, cr: hp.cr, sl: hp.sl, sr: hp.sr, tl: hp.tl, tr: hp.tr };
    return (m, out) => {
      if (m < 0 || m > st.L + 1e-6) { out.l = out.r = out.sl = out.sr = 0; out.tl = out.tr = 1; return; }
      const k = m / STEP, i = Math.floor(k), f = k - i;
      const a = P[Math.min(i, n - 1)];
      let b, t;
      if (i + 1 < n) { b = P[i + 1]; t = f; } else { b = hpc; const span = st.L - (n - 1) * STEP; t = span > 1e-6 ? (m - (n - 1) * STEP) / span : 1; }
      out.l = lerp(a.cl, b.cl, t); out.r = lerp(a.cr, b.cr, t); out.sl = lerp(a.sl, b.sl, t); out.sr = lerp(a.sr, b.sr, t);
      out.tl = a.tl && b.tl ? 1 : 0; out.tr = a.tr && b.tr ? 1 : 0;
      if (out.l + out.r < 0) { out.l = out.r = 0; }
    };
  }
  function frameOf(st, view) {
    const h = headOf(st);
    return {
      hx: h.x, hy: h.y, dx: st.dx, dy: st.dy, L: st.L, X: view ? view.X : st.X, gamma: view ? view.g : st.gamma, sgn: st.sgn, lift: view ? view.k : (st.lift || 0),
      Rf, R0, h: MATERIAL.thickness, xT: MATERIAL.twist * Math.max(48, widthAt(st, st.L)), mat: matFn(st)
    };
  }
  const inside = (x, y, m) => x > -m && x < W + m && y > -m && y < H + m;

  // Tear further along the pull until the strip is taut to the grip (or it stalls or comes off).
  function tearToward(st, gx, gy) {
    for (let guard = 0; guard < 4000 && !st.detached; guard++) {
      const h = headOf(st), dx = gx - h.x, dy = gy - h.y, D = Math.hypot(dx, dy);
      const cs = liftCs(st), need = D * cs - (st.L - sF);
      if (need <= 1e-3 || D < 1e-6) break;
      const ux = dx / D, uy = dy / D, c = ux * st.dx + uy * st.dy;
      if (c < MATERIAL.stall) break;
      const toGrid = (st.pts.length) * STEP - st.L;            // distance to the next grid point
      const adv = Math.min(need / (1 + cs * Math.max(c, 0.3)) + 1e-4, toGrid);
      st.L += adv;
      if (st.L >= st.pts.length * STEP - 1e-6) {
        st.L = st.pts.length * STEP;
        const p = st.pts[st.pts.length - 1], nx = p.x + st.dx * STEP, ny = p.y + st.dy * STEP;
        // steer the next segment toward the pull, bounded
        let ang = clamp(sang(st.dx, st.dy, ux, uy), -MATERIAL.steer * STEP, MATERIAL.steer * STEP);
        let ndx = st.dx * Math.cos(ang) - st.dy * Math.sin(ang), ndy = st.dx * Math.sin(ang) + st.dy * Math.cos(ang);
        const dev = sang(st.ax, st.ay, ndx, ndy);
        if (Math.abs(dev) > MATERIAL.maxVeer) { const lim = Math.sign(dev) * MATERIAL.maxVeer; ndx = st.ax * Math.cos(lim) - st.ay * Math.sin(lim); ndy = st.ax * Math.sin(lim) + st.ay * Math.cos(lim); }
        // the flap's twist is measured from the head direction: keep the flap where it is
        const before = sang(st.dx, st.dy, ndx, ndy);
        pushPt(st, nx, ny);
        st.dx = ndx; st.dy = ndy; st.gamma -= before;
        if (!st.entered && inside(nx, ny, -8)) st.entered = true;
        const w = widthAt(st, st.L);
        const holeAhead = strips.some(o => o !== st && o.test && o.id < st.id && pip(nx, ny, o.test));
        if (w < MATERIAL.minWidth || (st.entered && !inside(nx, ny, 3)) || holeAhead || st.L > 6000) detach(st);
      }
      st.dirty = true;
    }
  }
  // the flap direction is sgn * rot(d, gamma); keep gamma continuous, flip sgn only through the head
  function setFlapDir(st, ux, uy) {
    const cand = sang(st.sgn * st.dx, st.sgn * st.dy, ux, uy);
    const dlt = wrapPi(cand - st.gamma);
    if (Math.abs(dlt) <= HALF + 0.2) st.gamma += dlt;
    else { st.sgn = -st.sgn; st.gamma += wrapPi(dlt - PI); }
  }
  function holdTo(st, gx, gy) {
    tearToward(st, gx, gy);
    if (st.detached) return;
    const h = headOf(st), dx = gx - h.x, dy = gy - h.y, D = Math.hypot(dx, dy);
    if (D > 0.75) setFlapDir(st, dx / D, dy / D);
    st.X = Math.min(D, Math.max(0, st.L - sF) / liftCs(st));
    // near the head the twist is invisible; fold it back into -90..90 deg there
    const xT = MATERIAL.twist * Math.max(48, widthAt(st, st.L));
    if (smooth(0, xT, st.X) < 0.02 && Math.abs(st.gamma) > HALF) { st.gamma -= Math.sign(st.gamma) * PI; st.sgn = -st.sgn; }
    st.pX = st.X; st.pG = st.gamma; st.pK = st.lift;
  }
  function release(st) {
    if (st.detached) return;
    pendRims.push(st);                // its rims join the settled layer
    st.mode = 'roll'; st.liftV = 0;
    st.roll = { rho: { x: -1, v: MOTION.snap * W_ROLL }, X0: st.X, g0: st.gamma, k0: st.lift };
    st.pX = st.X; st.pG = st.gamma; st.pK = st.lift;
    emit('release', { strip: st.id });
  }
  function rollStep(st, h) {
    const r = st.roll;
    cdStep(r.rho, W_ROLL, h);
    const k = landed(r.rho.x);                // 1 -> 0
    st.X = r.X0 * k; st.gamma = r.g0 * k; st.lift = r.k0 * k;
    if (k <= 0) {
      st.X = 0; st.gamma = 0; st.lift = 0; st.mode = 'rest'; st.roll = null; pendFlaps.push(st);   // its paper joins the settled layer
    }
  }
  function detach(st) {
    if (st.detached) return;
    const v = drag && drag.st === st ? track.velocity() : { x: 0, y: 0 };
    const F = frameOf(st);
    const g = flapGeo(F, new Geo());
    st.detached = true; st.mode = 'gone';
    const cx = g.coil ? g.coil.cx : F.hx + F.X * g.ux, cy = g.coil ? g.coil.cy : F.hy + F.X * g.uy;
    const carried = !!(drag && drag.st === st);
    const f = { g, cx, cy, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, rot: 0, prot: 0, vr: 0, t: 0, alpha: 1, palpha: 1, crease: false, held: carried };
    falls.push(f);
    // torn clean off: if a hand holds it, it stays in the hand until let go
    if (carried) { drag.st = null; drag.carry = f; drag.cx0 = drag.lx; drag.cy0 = drag.ly; void v; }
    else { f.vx = clamp(v.x, -1500, 1500) * 0.6; f.vy = clamp(v.y, -1500, 1500) * 0.6 - 60; f.vr = clamp(v.x * 0.0009, -2.2, 2.2); }
    if (!announced) { announced = true; say('A strip came off. The poster underneath reads: Get seen. Get chosen. Grow.'); }
    if (st.inFlaps) rimsDirty = true; else if (!st.inRims) pendRims.push(st);
    tasks.push({ t: loop.t + 0.12, fn: checkCoverage });
    emit('detach', { strip: st.id });
  }

  /* ---------- holes (SVG clip) and exposed rims ---------- */
  function holePoly(st) {
    const P = st.pts, hp = headPoint(st), xs = [], ys = [];
    const all = P.concat([{ x: hp.x, y: hp.y, nx: hp.nx, ny: hp.ny, hl: hp.hl, hr: hp.hr }]);
    for (const p of all) { xs.push(p.x + p.nx * p.hl); ys.push(p.y + p.ny * p.hl); }
    for (let i = all.length - 1; i >= 0; i--) { const p = all[i]; xs.push(p.x - p.nx * p.hr); ys.push(p.y - p.ny * p.hr); }
    return { xs, ys, all };
  }
  function syncHoles() {
    for (const st of strips) {
      if (!st.dirty && st.poly) continue;
      const hp = holePoly(st); st.poly = hp; st.dirtyRims = true;
      st.path.setAttribute('d', pathD(hp.xs, hp.ys));
      const tx = [], ty = []; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < hp.xs.length; i++) {
        const x = hp.xs[i], y = hp.ys[i];
        if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
        if (i % 2 === 0 || i === hp.xs.length - 1) { tx.push(x); ty.push(y); }
      }
      st.test = { xs: tx, ys: ty, box: [x0, y0, x1, y1] };
      st.dirty = false;
    }
  }
  // Rims: the top poster's thickness shading the poster underneath, then its white fibre core, then tufts.
  function drawStripRims(c, st, grower) {
    if (!st.poly) return;
    const A = st.poly.all, n = A.length, others = strips.filter(o => o !== st && o.test);
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (let side = 0; side < 2; side++) {
      const sg = side ? -1 : 1;
      const ex = [], X = [], Y = [], NX = [], NY = [];
      for (let i = 0; i < n; i++) {
        const p = A[i], w = side ? p.hr : p.hl, x = p.x + sg * p.nx * w, y = p.y + sg * p.ny * w;
        X.push(x); Y.push(y); NX.push(sg * p.nx); NY.push(sg * p.ny);
        ex.push(inside(x, y, -1) && !others.some(o => pip(x, y, o.test)));
        if (grower && ex[i]) grower.grow(x * dpr, y * dpr, 10 * dpr);
      }
      const runs = [];
      let run = null;
      for (let i = 0; i < n; i++) { if (ex[i]) { if (!run) run = []; run.push(i); } else if (run) { if (run.length > 1) runs.push(run); run = null; } }
      if (run && run.length > 1) runs.push(run);
      const pass = (off, style, width) => {
        c.strokeStyle = style; c.lineWidth = width * dpr; c.beginPath();
        for (const r of runs) r.forEach((i, k) => { const x = (X[i] - NX[i] * off) * dpr, y = (Y[i] - NY[i] * off) * dpr; k ? c.lineTo(x, y) : c.moveTo(x, y); });
        c.stroke();
      };
      pass(3.2, 'rgba(' + MATERIAL.shade + ',0.18)', 6.5);
      pass(1.3, 'rgba(' + MATERIAL.shade + ',0.32)', 2.2);
      pass(-0.7, MATERIAL.fibre, 2.5);
      pass(-2.2, 'rgba(251,251,246,0.45)', 1);
      c.strokeStyle = 'rgba(251,251,246,0.75)'; c.lineWidth = 0.8 * dpr; c.beginPath();
      for (const r of runs) for (const i of r) {
        const hsh = hash(st.seed * 7.7 + i * (side ? 3.17 : 1.91));
        if (hsh > 0.42) continue;
        const len = 1 + hash(i * 9.1 + st.seed) * 2.4, x = X[i] - NX[i] * 0.7, y = Y[i] - NY[i] * 0.7;
        c.moveTo(x * dpr, y * dpr); c.lineTo((x + NX[i] * len) * dpr, (y + NY[i] * len) * dpr);
      }
      c.stroke();
    }
  }
  const isActive = st => !st.detached && (st.mode === 'held' || st.mode === 'script');
  // The settled layers: rims of every strip not being torn right now, and the paper of every strip at
  // rest. Each joins by being drawn on top once; only rare events (a resting strip grabbed again,
  // let-go, paste, resize) redraw them. A growing hole erases the settled rims it tears away.
  const isSettled = st => !st.detached && st.mode === 'rest' && st.L >= 0.5;
  const rimPaint = new Painter(rctx), flapPaint = new Painter(fctx), addPaint = new Painter(rctx);
  const settledPaint = rimPaint;
  const resetBox = B => { B[0] = B[1] = Infinity; B[2] = B[3] = -Infinity; };
  const unionBox = (A, B) => { if (B[2] > B[0]) { A[0] = Math.min(A[0], B[0]); A[1] = Math.min(A[1], B[1]); A[2] = Math.max(A[2], B[2]); A[3] = Math.max(A[3], B[3]); } };
  function drawRims() {
    for (const c of [rctx, fctx]) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, rimCanvas.width, rimCanvas.height); }
    resetBox(rimPaint.box); resetBox(flapPaint.box);
    for (const st of strips) st.inRims = st.inFlaps = false;
    pendRims.length = pendFlaps.length = 0;
    if (revealed) return;
    for (const st of strips) if (!isActive(st)) { drawStripRims(rctx, st, rimPaint); st.inRims = true; }
    flapPaint.dpr = dpr;
    for (const st of strips) if (isSettled(st)) { flapPaint.flap(flapGeo(frameOf(st, viewOf(st, 1)), geo), { front, back, alpha: 1, fibre: true }); st.inFlaps = true; }
  }
  // draw newly settled pieces on top; returns the device-px box that changed
  function appendSettled() {
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    if (revealed) { pendRims.length = pendFlaps.length = 0; return box; }
    for (const st of pendRims.splice(0)) if (!st.inRims && strips.includes(st)) {
      resetBox(addPaint.box); drawStripRims(rctx, st, addPaint); st.inRims = true; unionBox(rimPaint.box, addPaint.box); unionBox(box, addPaint.box);
    }
    flapPaint.dpr = dpr;
    for (const st of pendFlaps.splice(0)) if (!st.inFlaps && isSettled(st)) {
      const B = flapPaint.box, save = B.slice(); resetBox(B);
      flapPaint.flap(flapGeo(frameOf(st, viewOf(st, 1)), geo), { front, back, alpha: 1, fibre: true }); st.inFlaps = true;
      unionBox(box, B); unionBox(B, save);
    }
    return box;
  }
  // a hole that is still growing erases the settled rims it has torn through
  function eraseUnder(st) {
    const P = st.poly, RB = rimPaint.box, T = st.test.box;
    if (!P || !(RB[2] > RB[0])) return null;
    const bx = [Math.max(T[0] * dpr - 2, RB[0]), Math.max(T[1] * dpr - 2, RB[1]), Math.min(T[2] * dpr + 2, RB[2]), Math.min(T[3] * dpr + 2, RB[3])];
    if (!(bx[2] > bx[0] && bx[3] > bx[1])) return null;
    rctx.save(); rctx.setTransform(dpr, 0, 0, dpr, 0, 0); rctx.globalCompositeOperation = 'destination-out'; rctx.fillStyle = '#000';
    rctx.beginPath(); for (let i = 0; i < P.xs.length; i++) i ? rctx.lineTo(P.xs[i], P.ys[i]) : rctx.moveTo(P.xs[i], P.ys[i]); rctx.closePath(); rctx.fill(); rctx.restore();
    return bx;
  }

  /* ---------- input ---------- */
  const local = (cx, cy) => { const r = root.getBoundingClientRect(); return { x: cx - r.left, y: cy - r.top }; };
  function nearestEdge(p) {
    if (H - p.y < 90 && (W - p.x < 90 || p.x < 90)) {
      const right = W - p.x < 90, wide = W / H >= 1.25;
      return { d: Math.min(H - p.y, right ? W - p.x : p.x), G: { x: right ? W + 2 : -2, y: H + 2 }, a: { x: (right ? -1 : 1) * (wide ? 0.62 : 0.74), y: wide ? -0.78 : -0.67 } };
    }
    const c = [
      { d: W - p.x, G: { x: W + 2, y: p.y }, a: { x: -1, y: 0 } },
      { d: p.x, G: { x: -2, y: p.y }, a: { x: 1, y: 0 } },
      { d: H - p.y, G: { x: p.x, y: H + 2 }, a: { x: 0, y: -1 } }
    ];
    c.sort((m, n) => m.d - n.d);
    return c[0];
  }
  // where the grip is now: the free end when taut, the coil's centre when slack
  function gripOf(st) {
    const v = viewOf(st, loop.alpha), h = headOf(st), c = Math.cos(v.g), s = Math.sin(v.g);
    return { x: h.x + v.X * st.sgn * (st.dx * c - st.dy * s), y: h.y + v.X * st.sgn * (st.dx * s + st.dy * c) };
  }
  function pick(p, touch) {
    const pad = touch ? 26 : 14;
    for (let i = strips.length - 1; i >= 0; i--) {
      const st = strips[i]; if (st.detached || st.L < 2) continue;
      const g = gripOf(st), F = frameOf(st), th = coilTheta(Math.max(0, st.L - sF - st.X), R0, MATERIAL.thickness), Ro = R0 + MATERIAL.thickness * th / TAU;
      if (Math.hypot(p.x - g.x, p.y - g.y) < Ro + pad + 8) return st;
      // anywhere along the head edge
      const vx = -st.dy, vy = st.dx, rx = p.x - F.hx, ry = p.y - F.hy, along = rx * vx + ry * vy, across = rx * st.dx + ry * st.dy;
      const half = widthAt(st, st.L) / 2 + 6;
      if (Math.abs(along) < half && across > -(Ro + pad) && across < Ro + pad) return st;
      // anywhere on a lifted flap
      if (st.X > 4) {
        const ux = g.x - F.hx, uy = g.y - F.hy, D = Math.hypot(ux, uy) || 1, a2 = (rx * ux + ry * uy) / D, b2 = Math.abs(rx * uy - ry * ux) / D;
        if (a2 > -pad && a2 < D + pad && b2 < half + pad) return st;
      }
    }
    return null;
  }
  const busyAnim = () => !!(letgo || paste || revealed);

  function onDown(info) {
    // info: { id, x, y, t, touch, button }
    if (busyAnim() || info.button > 0) return false;
    const p = { x: info.x, y: info.y };
    let st = pick(p, info.touch);
    let gx, gy;
    if (st) {
      if (st.mode === 'script') endScript(st, false);
      if (st.inFlaps || st.inRims) rimsDirty = true;        // leaves the settled layers
      const g = gripOf(st); gx = g.x; gy = g.y;
      st.mode = 'held'; st.roll = null;
      if (st.X < 0.5) { const h = headOf(st); st.X = 0; gx = h.x; gy = h.y; }
    } else {
      const ed = nearestEdge(p);
      const reach = info.touch ? 72 : 56;
      if (ed.d <= reach && !holeAt(ed.G.x - ed.a.x * -4, ed.G.y - ed.a.y * -4)) {
        st = startStrip(ed.G, ed.a);
        const h = headOf(st); gx = h.x; gy = h.y;
      } else if (info.touch) { drag = { id: info.id, pending: p, t: info.t }; track.reset(); track.add(info.t, p.x, p.y); return 'pending'; }
      else return false;
    }
    beginHold(st, info, gx, gy);
    return true;
  }
  function holeAt(x, y) { return strips.some(o => o.test && pip(x, y, o.test)); }
  function startStrip(G, a) {
    // a hover-peek at this spot continues as the strip, so nothing pops
    let seed = null, L0 = 0;
    if (peek && Math.hypot(peek.G.x - G.x, peek.G.y - G.y) < 1 && peek.L.x > 0.5) { seed = peek.seed; L0 = peek.L.x; }
    killPeek();
    const st = newStrip(G, a, seed);
    if (L0 > 0) tearStraight(st, L0);
    emit('tear', { strip: st.id });
    return st;
  }
  function tearStraight(st, len) {
    while (st.L < len - 1e-6) {
      const toGrid = st.pts.length * STEP - st.L, adv = Math.min(len - st.L, toGrid);
      st.L += adv;
      if (st.L >= st.pts.length * STEP - 1e-6) { st.L = st.pts.length * STEP; const p = st.pts[st.pts.length - 1]; pushPt(st, p.x + st.dx * STEP, p.y + st.dy * STEP); }
    }
    st.dirty = true;
  }
  function beginHold(st, info, gx, gy) {
    drag = { id: info.id, st, ox: gx - info.x, oy: gy - info.y, lx: info.x, ly: info.y };
    st.mode = 'held';
    track.reset(); track.add(info.t, info.x, info.y);
    root.classList.add('grabbing');
    killPeek();
    holdTo(st, gx, gy);
  }
  function onMove(info) {
    if (drag && info.id === drag.id) {
      track.add(info.t, info.x, info.y);
      if (drag.pending) {
        const dx = info.x - drag.pending.x, dy = info.y - drag.pending.y;
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3) {
          const v = track.velocity(), fromRight = (Math.abs(v.x) > 30 ? v.x : dx) < 0;
          const G = { x: fromRight ? W + 2 : -2, y: clamp(drag.pending.y, 4, H - 4) };
          if (holeAt(fromRight ? W - 3 : 3, G.y)) { drag = null; return; }
          const st = startStrip(G, { x: fromRight ? -1 : 1, y: 0 });
          const h = headOf(st);
          beginHold(st, info, h.x, h.y);
        }
        return;
      }
      if (drag.carry) { const f = drag.carry; f.x = f.px = info.x - drag.cx0; f.y = f.py = info.y - drag.cy0; drag.lx = info.x; drag.ly = info.y; return; }
      // the grip catches up with the finger as the finger travels: no motion without movement
      const trav = Math.hypot(info.x - drag.lx, info.y - drag.ly), k = Math.exp(-trav / MOTION.catchPx);
      drag.ox *= k; drag.oy *= k; drag.lx = info.x; drag.ly = info.y;
      holdTo(drag.st, info.x + drag.ox, info.y + drag.oy);
      return;
    }
    if (!info.touch && !drag) hover({ x: info.x, y: info.y });
  }
  function onUp(info) {
    if (!drag || info.id !== drag.id) return;
    if (drag.carry) {   // let go of a piece that came off: it drops with the hand's velocity (least squares, last 60 ms)
      const f = drag.carry, v = track.velocity();
      f.held = false; f.vx = clamp(v.x, -1800, 1800) * 0.8; f.vy = clamp(v.y, -1800, 1800) * 0.8 - 40; f.vr = clamp(v.x * 0.0012, -2.4, 2.4);
      drag = null; root.classList.remove('grabbing'); return;
    }
    const st = drag.st; drag = null;
    root.classList.remove('grabbing');
    if (st && !st.detached) { release(st); tasks.push({ t: loop.t + 0.06, fn: checkCoverage }); }
  }

  function hover(p) {
    if (busyAnim()) return;
    const ed = nearestEdge(p), on = pick(p, false);
    const near = ed.d <= 56 && !on && !holeAt(ed.G.x + ed.a.x * 4, ed.G.y + ed.a.y * 4);
    root.style.cursor = near || on ? 'grab' : '';
    if (near) {
      if (!peek) peek = { L: { x: 0, v: 0 }, pL: 0, target: MOTION.peekLift, seed: 13.7 + (seedN + 1) * 61.3 };
      peek.G = ed.G; peek.a = ed.a; peek.target = MOTION.peekLift;
      if (!peekPath.parentNode) clipEl.appendChild(peekPath);
    } else if (peek) peek.target = 0;
    loop.wake(nowMs());
  }
  function killPeek() { if (peek) { peek = null; peekPath.remove(); } }
  function peekStrip() {
    const m = Math.hypot(peek.a.x, peek.a.y), ax = peek.a.x / m, ay = peek.a.y / m;
    const st = { id: 1e9, seed: peek.seed, G: peek.G, ax, ay, dx: ax, dy: ay, w0, pts: [], L: 0, X: 0, gamma: 0, sgn: 1 };
    const Lp = lerp(peek.pL, peek.L.x, loop.alpha);
    let k = 0;
    const push = () => { const mm = k * STEP, w = widthAt(st, mm) / 2, p = { x: peek.G.x + ax * mm, y: peek.G.y + ay * mm, nx: -ay, ny: ax, hl: w + jagK(st.seed, k), hr: w + jagK(st.seed + 97, k), w }; clipPoint(st, p); st.pts.push(p); k++; };
    push(); while (k * STEP <= Lp) push();
    st.L = Math.max(0, Lp);
    return st;
  }

  /* ---------- DOM events ---------- */
  root.addEventListener('pointerdown', e => {
    if (!e.isPrimary && e.pointerType !== 'mouse') return;
    const t = evTime(e); loop.wake(t); loop.advanceTo(t);
    const p = local(e.clientX, e.clientY);
    const r = onDown({ id: e.pointerId, x: p.x, y: p.y, t, touch: e.pointerType !== 'mouse', button: e.button });
    if (r === true) { e.preventDefault(); try { root.setPointerCapture(e.pointerId); } catch (_) { /* synthetic */ } }
    else if (r === 'pending') { try { root.setPointerCapture(e.pointerId); } catch (_) { /* synthetic */ } }
    loop.request();
  });
  root.addEventListener('pointermove', e => {
    const t = evTime(e);
    if (drag || e.pointerType === 'mouse') { loop.wake(t); loop.advanceTo(t); }
    const evs = drag && e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    if (evs && evs.length > 1) for (const c of evs) { const p = local(c.clientX, c.clientY); onMove({ id: e.pointerId, x: p.x, y: p.y, t: evTime(c), touch: e.pointerType !== 'mouse' }); }
    else { const p = local(e.clientX, e.clientY); onMove({ id: e.pointerId, x: p.x, y: p.y, t, touch: e.pointerType !== 'mouse' }); }
    if (drag) loop.request();
  });
  const up = e => { const t = evTime(e); loop.wake(t); loop.advanceTo(t); onUp({ id: e.pointerId, t }); loop.request(); };
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', up);
  root.addEventListener('lostpointercapture', e => { if (drag && drag.id === e.pointerId && !drag.pending) up(e); });
  root.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !drag) { if (peek) peek.target = 0; root.style.cursor = ''; loop.wake(evTime(e)); } });
  // touch on paper never scrolls the page; a touch elsewhere still scrolls vertically
  root.addEventListener('touchstart', e => { if (drag && !drag.pending) e.preventDefault(); }, { passive: false });
  root.addEventListener('touchmove', e => { if (drag && !drag.pending) e.preventDefault(); }, { passive: false });

  /* ---------- keyboard / button: the same physics with a scripted grip ---------- */
  // Three strips that do not run into each other; each is checked against the holes already there.
  function plan() {
    const wide = W / H >= 1.25;
    return wide
      ? [{ G: { x: W + 2, y: H + 2 }, a: { x: -0.62, y: -0.78 }, bend: 0.1, reach: 0.5 },
        { G: { x: W * 0.36, y: H + 2 }, a: { x: 0.08, y: -1 }, bend: 0.06, reach: 0.58 },
        { G: { x: -2, y: H * 0.2 }, a: { x: 1, y: 0.04 }, bend: -0.05, reach: 0.42 }]
      : [{ G: { x: W + 2, y: H + 2 }, a: { x: -0.74, y: -0.67 }, bend: -0.08, reach: 0.42 },
        { G: { x: -2, y: H * 0.3 }, a: { x: 1, y: 0.06 }, bend: 0.05, reach: 0.62 },
        { G: { x: W * 0.22, y: H + 2 }, a: { x: 0.05, y: -1 }, bend: 0.05, reach: 0.34 }];
  }
  function clearRun(cfg) {   // how far this plan can tear before it would meet an existing hole
    const m = Math.hypot(cfg.a.x, cfg.a.y), ax = cfg.a.x / m, ay = cfg.a.y / m, full = extentAlong(cfg.G, cfg.a) * cfg.reach;
    for (let t = 6; t <= full; t += 6) {
      const half = widthAt({ w0 }, t) / 2 + 8;
      for (const o of [0, -half, half]) if (holeAt(cfg.G.x + ax * t - ay * o, cfg.G.y + ay * t + ax * o)) return t - 30;
    }
    return full;
  }
  function extentAlong(G, a) {
    const m = Math.hypot(a.x, a.y), ax = a.x / m, ay = a.y / m;
    const tx = ax > 1e-6 ? (W - G.x) / ax : ax < -1e-6 ? -G.x / ax : 1e9;
    const ty = ay > 1e-6 ? (H - G.y) / ay : ay < -1e-6 ? -G.y / ay : 1e9;
    return Math.min(tx, ty);
  }
  // A scripted pull: the grip travels along a gently bending path, then lets go.
  function scriptPull(st, cfg) {
    const m = Math.hypot(cfg.a.x, cfg.a.y), ax = cfg.a.x / m, ay = cfg.a.y / m, nx = -ay, ny = ax;
    const tear = cfg.tear != null ? cfg.tear : extentAlong(cfg.G, cfg.a) * cfg.reach;
    const travel = 2 * tear + sF;                          // a 180-degree peel tears half as fast as the hand
    const h = headOf(st);
    const sc = { st, t: 0, T: (cfg.ms || MOTION.scripted) / 1000, done: cfg.done, path: tau => {
      const e = EASE.pull(tau), dd = travel * e;
      return { x: h.x + ax * dd + nx * cfg.bend * dd * e, y: h.y + ay * dd + ny * cfg.bend * dd * e };
    } };
    st.mode = 'script'; scripts.push(sc);
    return sc;
  }
  function endScript(st, doRelease) {
    const i = scripts.findIndex(s => s.st === st); if (i < 0) return;
    const sc = scripts[i]; scripts.splice(i, 1);
    if (doRelease && !st.detached) { st.mode = 'held'; release(st); tasks.push({ t: loop.t + 0.06, fn: checkCoverage }); }
    if (sc.done) sc.done();
  }
  function scriptStep(h) {
    for (const sc of scripts.slice()) {
      sc.t = Math.min(sc.T, sc.t + h);
      const p = sc.path(sc.t / sc.T);
      holdTo(sc.st, p.x, p.y);
      if (sc.st.detached) { endScript(sc.st, false); continue; }
      if (sc.t >= sc.T) endScript(sc.st, true);
    }
  }
  function tearStep() {
    loop.wake(nowMs());
    if (paste) { paste.speed = 3; return; }
    if (revealed || letgo) { startPaste(); return; }
    for (const sc of scripts.slice()) endScript(sc.st, true);
    const P = plan();
    if (planIdx >= P.length) { startLetGo(); return; }
    const cfg = Object.assign({}, P[planIdx++]);
    const run = clearRun(cfg);
    if (run < 90) { tearStep(); return; }
    cfg.tear = run;
    const st = startStrip(cfg.G, cfg.a);
    scriptPull(st, cfg);
    loop.request();
  }
  btn && btn.addEventListener('click', tearStep);

  function invite() {
    const wide = W / H >= 1.25;
    const cfg = { G: { x: W + 2, y: H + 2 }, a: wide ? { x: -0.62, y: -0.78 } : { x: -0.74, y: -0.67 }, bend: 0, tear: Math.min(W, H) * 0.075 + sF, ms: 520 };
    tasks.push({ t: loop.t + MOTION.invite / 1000, fn: () => {
      if (strips.length || busyAnim()) return;
      const st = startStrip(cfg.G, cfg.a); scriptPull(st, cfg);
    } });
    loop.wake(nowMs());
  }

  /* ---------- coverage, let-go, paste back ---------- */
  function coverage() {
    let hit = 0, n = 0;
    for (let gy = 0; gy < 16; gy++) for (let gx = 0; gx < 28; gx++) { n++; if (holeAt((gx + 0.5) / 28 * W, (gy + 0.5) / 16 * H)) hit++; }
    return hit / n;
  }
  function checkCoverage() { if (!busyAnim() && strips.length && !drag && !scripts.length && coverage() > 0.46) startLetGo(); }
  function startLetGo() {
    if (letgo || revealed) return;
    for (const sc of scripts.slice()) endScript(sc.st, true);
    for (const st of strips) if (st.mode === 'held') release(st);
    if (drag) { drag = null; root.classList.remove('grabbing'); }
    killPeek();
    letgo = { t: 0, y: 0, py: 0, v: 0 };
    revealPath.setAttribute('d', 'M0 0Z'); clipEl.appendChild(revealPath);
    setBtn('Paste it back');
    say('The whole poster came off. Underneath: Get seen. Get chosen. Grow.');
    emit('letgo', {});
    loop.wake(nowMs());
  }
  function letgoStep(h) {
    const T = MOTION.letGo / 1000;
    letgo.py = letgo.y; letgo.t = Math.min(T, letgo.t + h);
    letgo.y = H * EASE.tug(letgo.t / T);
    letgo.v = (letgo.y - letgo.py) / h;
    if (letgo.t >= T) {
      // the rolled-up sheet comes free at the bottom edge and drops
      const g = sheetGeo(H, new Geo());
      falls.push({ g, cx: W / 2, cy: H, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: letgo.v * 0.9, rot: 0, prot: 0, vr: 0, t: 0, alpha: 1, palpha: 1, sheet: true, crease: false });
      letgo = null; revealed = true; rimsDirty = true;
      revealPath.setAttribute('d', 'M-4 -4H' + (W + 4) + 'V' + (H + 4) + 'H-4Z');
    }
  }
  // The whole sheet as one strip: peeled from the top edge, rolled into one coil at the peel line.
  function sheetGeo(y, G) {
    const half = W / 2 + 0.5;
    return flapGeo({ hx: W / 2, hy: y, dx: 0, dy: 1, L: Math.max(0, y), X: 0, gamma: 0, sgn: 1, Rf, R0, h: MATERIAL.thickness, xT: W,
      mat: (m, out) => { const ok = m >= 0 && m <= y; out.l = out.r = out.sl = out.sr = ok ? half : 0; out.tl = out.tr = 0; } }, G);
  }
  function startPaste() {
    if (paste) return;
    letgo = null;
    for (const st of strips) st.path.remove();
    for (const sc of scripts.slice()) scripts.splice(scripts.indexOf(sc), 1);
    strips = []; falls = []; killPeek(); drag = null;
    revealed = false; rimsDirty = true;
    paste = { t: 0, x: -30, px: -30, speed: 1 };
    if (!revealPath.parentNode) clipEl.appendChild(revealPath);
    setBtn('Tear a strip'); if (btn) btn.disabled = true;
    emit('paste', {});
    loop.wake(nowMs());
  }
  function pasteStep(h) {
    const T = MOTION.paste / 1000;
    paste.px = paste.x; paste.t = Math.min(T, paste.t + h * paste.speed);
    paste.x = -30 + (W + 60) * EASE.paste(paste.t / T);
    revealPath.setAttribute('d', 'M' + paste.x.toFixed(1) + ' -4H' + (W + 4) + 'V' + (H + 4) + 'H' + paste.x.toFixed(1) + 'Z');
    if (paste.t >= T) {
      paste = null; revealPath.remove(); planIdx = 0; announced = false;
      if (btn) btn.disabled = false;
      say('The poster is pasted back. Ideas that create impact.');
      if (opts.invite !== false) invite();
    }
  }
  function setBtn(t) { if (btn) btn.textContent = t; }
  function say(t) { if (live) { live.textContent = ''; setTimeout(() => { live.textContent = t; }, 30); } }
  function emit(type, detail) { try { root.dispatchEvent(new CustomEvent('elvana:' + type, { detail })); } catch (_) { /* old browsers */ } }

  /* ---------- physics step (fixed 1/240 s) ---------- */
  function step(h) {
    const ts = nowMs();
    stepBody(h);
    stats.stepMs = (stats.stepMs || 0) + nowMs() - ts;
  }
  function stepBody(h) {
    for (const st of strips) { st.pX = st.X; st.pG = st.gamma; st.pK = st.lift; }
    if (replay) replayStep(h);
    scriptStep(h);
    for (const st of strips) {
      if (st.mode === 'roll') rollStep(st, h);
      else if ((st.mode === 'held' || st.mode === 'script') && !st.detached) {   // the hand lifts the flap off the wall
        const sp = { x: st.lift - MATERIAL.lift, v: st.liftV }; cdStep(sp, W_LIFT, h); st.lift = sp.x + MATERIAL.lift; st.liftV = sp.v;
      }
    }
    if (peek) {
      peek.pL = peek.L.x;
      const s = { x: peek.L.x - peek.target, v: peek.L.v }; cdStep(s, W_PEEK, h);
      peek.L.x = s.x + peek.target; peek.L.v = s.v;
      if (peek.target === 0 && peek.L.x < 0.05) killPeek();
    }
    if (letgo) letgoStep(h);
    if (paste) pasteStep(h);
    for (const f of falls) {
      if (f.held) continue;
      f.px = f.x; f.py = f.y; f.prot = f.rot; f.palpha = f.alpha;
      f.vy += MOTION.gravity * h; f.x += f.vx * h; f.y += f.vy * h; f.rot += f.vr * h; f.t += h;
      const below = f.cy + f.y - H;                            // how far past the poster's bottom edge
      f.alpha = f.sheet ? clamp(1 - below / Math.max(40, EXTRA - 20), 0, 1) : clamp(1 - Math.max(0, f.t - 0.35) / (MOTION.fallFade / 1000), 0, 1);
    }
    falls = falls.filter(f => f.alpha > 0 || f.palpha > 0);
    if (tasks.length) {
      const due = tasks.filter(k => k.t <= loop.t + h + 1e-9);
      if (due.length) { tasks = tasks.filter(k => k.t > loop.t + h + 1e-9); for (const k of due) k.fn(); }
    }
  }
  function busy() {
    return !!(drag || letgo || paste || peek || falls.length || scripts.length || tasks.length || replay || strips.some(s => s.mode === 'roll' || s.mode === 'held'));
  }
  const viewOf = (st, a) => (st.mode === 'roll' ? { X: lerp(st.pX, st.X, a), g: lerp(st.pG, st.gamma, a), k: lerp(st.pK, st.lift, a) } : { X: st.X, g: st.gamma, k: st.lift || 0 });

  /* ---------- render ---------- */
  function render(alpha) {
    const t0 = nowMs();
    if (!W) return;
    syncHoles();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const ly = letgo ? lerp(letgo.py, letgo.y, alpha) : -1;
    if (letgo) revealPath.setAttribute('d', 'M-4 -4H' + (W + 4).toFixed(1) + 'V' + ly.toFixed(2) + 'H-4Z');
    const clipBelow = () => { if (ly >= 0) { ctx.beginPath(); ctx.rect(-10, ly * dpr, canvas.width + 20, canvas.height); ctx.clip(); } };
    let tq = tick('sync', t0);
    // settled layers: full redraw (rare), or append what just settled and erase what a growing hole tore away
    const extra = [Infinity, Infinity, -Infinity, -Infinity];
    if (rimsDirty) { drawRims(); rimsDirty = false; lastBox = 'all'; stats.sec.rimN = (stats.sec.rimN || 0) + 1; }
    else {
      if (pendRims.length || pendFlaps.length) unionBox(extra, appendSettled());
      for (const st of strips) if (st.dirtyRims && isActive(st)) { const e = eraseUnder(st); if (e) unionBox(extra, e); }
    }
    for (const st of strips) st.dirtyRims = false;
    if (lastBox !== 'all' && extra[2] > extra[0]) { if (!lastBox) lastBox = extra; else unionBox(lastBox, extra); }
    if (ly >= 0) lastBox = 'all';
    // restore the settled pixels wherever moving paper was last frame (or everywhere, when they changed)
    const cw = canvas.width, chh = canvas.height;
    let bx0 = 0, by0 = 0, bx1 = cw, by1 = chh;
    if (lastBox !== 'all') { if (!lastBox) { bx1 = by1 = 0; } else { bx0 = clamp(Math.floor(lastBox[0]), 0, cw); by0 = clamp(Math.floor(lastBox[1]), 0, chh); bx1 = clamp(Math.ceil(lastBox[2]) + 1, 0, cw); by1 = clamp(Math.ceil(lastBox[3]) + 1, 0, chh); } }
    if (bx1 > bx0 && by1 > by0) {
      ctx.clearRect(bx0, by0, bx1 - bx0, by1 - by0);
      if (!revealed) {
        // copy back only where each settled layer actually has pixels (letting go: only below the peel line)
        for (const [cv, P] of [[rimCanvas, rimPaint], [flapCanvas, flapPaint]]) {
          const SB = P.box;
          const sx0 = Math.max(bx0, Math.floor(SB[0])), sy0 = Math.max(by0, Math.floor(SB[1]), ly >= 0 ? Math.ceil(ly * dpr) : 0);
          const sx1 = Math.min(bx1, Math.ceil(SB[2]) + 1), sy1 = Math.min(by1, Math.ceil(SB[3]) + 1);
          if (sx1 > sx0 && sy1 > sy0) ctx.drawImage(cv, sx0, sy0, sx1 - sx0, sy1 - sy0, sx0, sy0, sx1 - sx0, sy1 - sy0);
        }
      }
    }
    const B = paint.box; B[0] = B[1] = Infinity; B[2] = B[3] = -Infinity;
    if (!revealed) for (const st of strips) if (isActive(st)) drawStripRims(ctx, st, paint);   // the growing tear, live
    tq = tick('rims', tq);
    tq = tick('blit', tq);
    const opt = { front, back, alpha: 1, fibre: true };
    if (!revealed) for (const st of strips) {
      if (st.detached || st.L < 0.5 || st.inFlaps) continue;
      const v = viewOf(st, alpha);
      ctx.save(); clipBelow();
      paint.flap(flapGeo(frameOf(st, v), geo), opt);
      ctx.restore();
    }
    tq = tick('flaps', tq);
    if (peek && !revealed) {
      const ps = peekStrip();
      const hp = holePolyOf(ps);
      peekPath.setAttribute('d', hp);
      if (ps.L > 0.3) paint.flap(flapGeo(frameOf(ps), geoPeek), opt);
    }
    if (letgo && ly > 0.5) paint.flap(sheetGeo(ly, geoPeek), { front, back, alpha: 1, fibre: false, crease: true });
    for (const f of falls) {
      const a = lerp(f.palpha, f.alpha, alpha); if (a <= 0) continue;
      const fx = lerp(f.px, f.x, alpha), fy = lerp(f.py, f.y, alpha), fr = lerp(f.prot, f.rot, alpha);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.translate((f.cx + fx) * dpr, (f.cy + fy) * dpr); ctx.rotate(fr); ctx.translate(-f.cx * dpr, -f.cy * dpr);
      paint.flap(f.g, { front, back, alpha: a, fibre: !f.sheet, crease: false });
      ctx.restore();
    }
    if (paste) drawSqueegee(lerp(paste.px, paste.x, alpha));
    tq = tick('other', tq);
    if (debugOn) drawDebug(alpha);
    lastBox = (falls.length || paste || debugOn || letgo) ? 'all' : (B[2] > B[0] ? B.slice() : null);
    const dt = nowMs() - t0;
    stats.draw.push(dt); if (stats.draw.length > 600) stats.draw.shift();
  }
  // Chrome merges a clipPath's children into one nonzero path, so every hole must wind the same way
  // as the full-sheet rectangle (positive area), or overlapping holes cancel out.
  function pathD(xs, ys) {
    let a = 0; const n = xs.length;
    for (let i = 0, j = n - 1; i < n; j = i++) a += xs[j] * ys[i] - xs[i] * ys[j];
    const parts = new Array(n);
    for (let i = 0; i < n; i++) { const k = a >= 0 ? i : n - 1 - i; parts[i] = (Math.round(xs[k] * 10) / 10) + ' ' + (Math.round(ys[k] * 10) / 10); }
    return 'M' + parts.join('L') + 'Z';
  }
  function holePolyOf(ps) {
    const P = ps.pts.slice(); const h = headOf(ps); const k = ps.L / STEP, k0 = Math.floor(k), f = k - k0, w = widthAt(ps, ps.L) / 2;
    P.push({ x: h.x, y: h.y, nx: -ps.dy, ny: ps.dx, hl: w + lerp(jagK(ps.seed, k0), jagK(ps.seed, k0 + 1), f), hr: w + lerp(jagK(ps.seed + 97, k0), jagK(ps.seed + 97, k0 + 1), f) });
    const xs = [], ys = [];
    P.forEach(p => { xs.push(p.x + p.nx * p.hl); ys.push(p.y + p.ny * p.hl); });
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; xs.push(p.x - p.nx * p.hr); ys.push(p.y - p.ny * p.hr); }
    return pathD(xs, ys);
  }
  function drawSqueegee(x) {
    const X = x * dpr, h = H * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(X - 200 * dpr, 0, X, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.85, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0.34)');
    ctx.fillStyle = g; ctx.fillRect(X - 200 * dpr, 0, 200 * dpr, h);
    ctx.fillStyle = 'rgba(' + MATERIAL.shade + ',0.28)'; ctx.fillRect(X + 3 * dpr, 0, 9 * dpr, h);
    ctx.fillStyle = '#1A1814'; ctx.fillRect(X - 4 * dpr, -2, 8 * dpr, h + 4);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(X - 3 * dpr, 0, 1.5 * dpr, h);
  }
  function drawDebug(alpha) {
    const c = ctx, d = dpr;
    c.save(); c.setTransform(d, 0, 0, d, 0, 0); c.lineWidth = 1.2; c.font = '600 11px Mukta, sans-serif';
    for (const st of strips) {
      if (st.detached) continue;
      const v = viewOf(st, alpha), F = frameOf(st, v), G2 = flapGeo(F, new Geo());
      const vx = -st.dy, vy = st.dx, half = widthAt(st, st.L) / 2 + 10;
      c.strokeStyle = '#00A0FF'; c.setLineDash([5, 4]);
      c.beginPath(); c.moveTo(F.hx + vx * half, F.hy + vy * half); c.lineTo(F.hx - vx * half, F.hy - vy * half); c.stroke();   // fold line (head edge)
      c.setLineDash([]); c.strokeStyle = '#7A00FF';
      c.beginPath(); c.moveTo(F.hx, F.hy); c.lineTo(F.hx + st.dx * 46, F.hy + st.dy * 46); c.stroke();                         // tear direction
      for (const s of [-1, 1]) { const a = s * MATERIAL.maxVeer, ax = st.ax * Math.cos(a) - st.ay * Math.sin(a), ay = st.ax * Math.sin(a) + st.ay * Math.cos(a); c.globalAlpha = 0.35; c.beginPath(); c.moveTo(F.hx, F.hy); c.lineTo(F.hx + ax * 70, F.hy + ay * 70); c.stroke(); c.globalAlpha = 1; }
      const g = { x: F.hx + F.X * G2.ux, y: F.hy + F.X * G2.uy };
      c.strokeStyle = '#00C060'; c.beginPath(); c.arc(g.x, g.y, 6, 0, TAU); c.stroke();                                         // grip
      if (G2.coil) {
        const K = G2.coil;
        c.strokeStyle = '#FF2D95'; c.setLineDash([3, 3]); c.beginPath(); c.arc(K.cx, K.cy, R0, 0, TAU); c.stroke();             // R0
        c.setLineDash([]); c.beginPath(); c.arc(K.cx, K.cy, K.Ro, 0, TAU); c.stroke();                                          // outer radius
      }
      c.fillStyle = '#111'; c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 3;
      const txt = st.mode + '  L ' + st.L.toFixed(0) + '  X ' + v.X.toFixed(0) + (G2.coil ? '  coil ' + (G2.coil.Th / TAU).toFixed(2) + ' turns  Ro ' + G2.coil.Ro.toFixed(1) : '') + (st.roll ? '  roll ' + (1 - landed(st.roll.rho.x)).toFixed(3) : '');
      c.strokeText(txt, F.hx + 10, F.hy + 16); c.fillText(txt, F.hx + 10, F.hy + 16); c.lineWidth = 1.2;
    }
    if (drag && !drag.pending) {
      const v = track.velocity(), p = { x: drag.lx, y: drag.ly };
      c.strokeStyle = '#FF6A00'; c.beginPath(); c.moveTo(p.x - 7, p.y); c.lineTo(p.x + 7, p.y); c.moveTo(p.x, p.y - 7); c.lineTo(p.x, p.y + 7); c.stroke();
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + v.x * 0.08, p.y + v.y * 0.08); c.stroke();                             // velocity (80 ms ahead)
      c.setLineDash([2, 3]); c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + drag.ox, p.y + drag.oy); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#FF6A00'; c.fillText(Math.hypot(v.x, v.y).toFixed(0) + ' px/s', p.x + 10, p.y - 10);
    }
    c.restore();
  }

  /* ---------- scripted replays (lab): feed the real input path ---------- */
  let replay = null;
  function replayStep(h) {
    replay.t += h * 1000;
    while (replay.i < replay.ev.length && replay.ev[replay.i].t <= replay.t + 1e-6) {
      const e = replay.ev[replay.i++];
      let x = e.x, y = e.y;
      if (x === 'grip') { const st = strips[strips.length - 1]; const g = st ? gripOf(st) : { x: 0, y: 0 }; replay.anchor = g; x = g.x; y = g.y; }
      if (e.k != null && replay.anchor) { x = lerp(replay.anchor.x, e.tx, e.k); y = lerp(replay.anchor.y, e.ty, e.k); }
      const info = { id: 77, x, y, t: replay.t0 + e.t, touch: !!e.touch, button: 0 };
      if (e.type === 'down') onDown(info); else if (e.type === 'move') onMove(info); else onUp(info);
    }
    if (replay.i >= replay.ev.length) replay = null;
  }

  /* ---------- lifecycle ---------- */
  readColours();
  const ro = new ResizeObserver(() => measure()); ro.observe(root);
  const io = new IntersectionObserver(es => { loop.visible = es[0].isIntersecting; if (loop.visible) { loop.anchor(nowMs()); loop.request(); } }, { threshold: 0 });
  io.observe(root);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { loop.anchor(nowMs()); loop.request(); } });
  measure();
  if (opts.invite !== false) invite();

  Object.assign(inst, {
    tear: tearStep, letGo: startLetGo, pasteBack: startPaste,
    setDebug(on) { debugOn = !!on; render(loop.alpha); },
    play(events) { loop.wake(nowMs()); replay = { ev: events.slice().sort((a, b) => a.t - b.t), i: 0, t: 0, t0: nowMs() }; loop.request(); },
    reset() {
      for (const st of strips) st.path.remove();
      strips = []; falls = []; tasks = []; scripts = []; replay = null; drag = null; letgo = null; paste = null; revealed = false; planIdx = 0; announced = false;
      killPeek(); revealPath.remove(); rimsDirty = true; setBtn('Tear a strip'); if (btn) btn.disabled = false; render(1);
    },
    destroy() { ro.disconnect(); io.disconnect(); instances.delete(inst); root.__elvanaTear = null; },
    debug: {
      MATERIAL, MOTION,
      get W() { return W; }, get H() { return H; }, get R0() { return R0; }, get Rf() { return Rf; },
      stats,
      manual(on) { loop.manual = !!on; if (on && loop.raf) { cancelAnimationFrame(loop.raf); loop.raf = 0; } },
      tick(real) { loop.wake(real); loop.frame(real); },
      input(type, x, y, t, touch) {
        loop.wake(t); loop.advanceTo(t);
        const info = { id: 1, x, y, t, touch: !!touch, button: 0 };
        if (type === 'down') return onDown(info); if (type === 'move') return onMove(info); return onUp(info);
      },
      strips: () => strips,
      snapshot(alpha) {
        const a = alpha == null ? loop.alpha : alpha;
        return strips.map(st => {
          const v = viewOf(st, a), F = frameOf(st, v), G2 = flapGeo(F, new Geo());
          return { id: st.id, mode: st.mode, L: st.L, X: v.X, gamma: v.g, sgn: st.sgn, head: [F.hx, F.hy], dir: [st.dx, st.dy], detached: st.detached,
            coil: G2.coil ? { cx: G2.coil.cx, cy: G2.coil.cy, Ro: G2.coil.Ro, R0: G2.coil.R0, turns: G2.coil.Th / TAU } : null,
            rho: st.roll ? 1 - landed(st.roll.rho.x) : null, w: widthAt(st, st.L) };
        });
      },
      sample(i, ms, alpha) {
        const st = strips[i]; if (!st) return null;
        const a = alpha == null ? loop.alpha : alpha, F = frameOf(st, viewOf(st, a));
        return ms.map(m => { const p = materialPoint(F, m); return [p.x, p.y, p.z]; });
      },
      geometry(i, alpha) {   // every drawn vertex of strip i, flattened, for the flicker metric
        const st = strips[i]; if (!st) return null;
        const a = alpha == null ? loop.alpha : alpha, G2 = flapGeo(frameOf(st, viewOf(st, a)), new Geo()), out = [];
        for (const R of G2.order) for (let j = 0; j < R.n; j++) { const q = R.s[j]; out.push([R === G2.coilOut ? 'o' : R === G2.coilIn ? 'i' : R === G2.flat ? 'f' : 'd', q.m, q.cx, q.cy, q.l, q.r, q.z]); }
        return { coil: G2.coil, v: out };
      },
      // the incremental frame must equal a full redraw of the same state, pixel for pixel
      verifyFrame(rebuild) {
        const w = canvas.width, h = canvas.height, A = ctx.getImageData(0, 0, w, h).data;
        lastBox = 'all'; if (rebuild) rimsDirty = true; render(loop.alpha);
        const Bd = ctx.getImageData(0, 0, w, h).data; let n = 0, mx = 0;
        let big = 0;
        for (let i = 0; i < A.length; i++) { const d = Math.abs(A[i] - Bd[i]); if (d > 2) { n++; if (d > mx) mx = d; if (d > 60) big++; } }
        return { diffBytes: n, maxDiff: mx, bigBytes: big };
      },
      coverage, get t() { return loop.t; }, get revealed() { return revealed; }, get letgo() { return letgo; }, get falls() { return falls.length; }
    }
  });
  root.__elvanaTear = inst;
  return inst;
}

/* =========================================================================
   CORNER PEEL (inner pages): the same fold and memory curl, smaller.
     <div class="peel" data-peel [data-peel-corner="tl|tr|bl|br"]>
       <div class="peel__under">...</div><div class="peel__over">...</div>
     </div>
   The engine adds a canvas (.peel__canvas) and a "Peel back" button (.peel__btn).
   ========================================================================= */
function mountPeel(el, opts) {
  if (!el || !motionAllowed()) return null;
  if (el.__elvanaPeel) return el.__elvanaPeel;
  opts = opts || {};
  const over = el.querySelector(':scope > .peel__over'), under = el.querySelector(':scope > .peel__under');
  if (!over || !under) return null;
  const corner = (opts.corner || el.getAttribute('data-peel-corner') || 'br').toLowerCase().replace(/[^tblr]/g, '');
  const label = opts.label || el.getAttribute('data-peel-label') || 'Peel back';
  const labelBack = opts.labelBack || el.getAttribute('data-peel-label-back') || 'Put it back';
  const canvas = document.createElement('canvas'); canvas.className = 'peel__canvas'; canvas.setAttribute('aria-hidden', 'true');
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'peel__btn'; btn.textContent = label;
  const grip = document.createElement('div'); grip.className = 'peel__grip'; grip.setAttribute('aria-hidden', 'true');
  el.appendChild(canvas); el.appendChild(grip); el.appendChild(btn);
  el.setAttribute('data-peel-mounted', ''); el.classList.add('peel--live');
  const ctx = canvas.getContext('2d'), paint = new Painter(ctx), geo = new Geo(), track = new Track();
  const MARGIN = 0;      // the canvas is exactly the sheet: paper past its edges has left the frame
  let W = 0, H = 0, dpr = 1, R0 = 14, Lrest = 40;
  const Rf = MATERIAL.foldRadius, sF = PI * Rf;
  let front = rgbOf(MATERIAL.front), back = rgbOf(MATERIAL.back);
  // The over-poster is one sheet peeled from a corner: the same ribbon model as a strip, its width
  // given by the rectangle. L = how far the fold line has come in from the corner (along d), X = grip
  // distance past the fold (taut: X = L - pi Rf; slack winds into the coil at the grip).
  const S = { L: 0, X: 0, pL: 0, pX: 0, dx: 0, dy: 0, mode: 'rest', roll: null, hover: { x: 0, v: 0 }, hoverT: 0, peeled: false, script: null };
  let drag = null;
  const loop = new Loop({ step, render, busy });
  const inst = { root: el, kind: 'peel', loop };
  instances.add(inst);

  const C = () => ({ x: corner.indexOf('r') >= 0 ? W : 0, y: corner.indexOf('b') >= 0 ? H : 0 });
  const inward = () => ({ x: corner.indexOf('r') >= 0 ? -1 : 1, y: corner.indexOf('b') >= 0 ? -1 : 1 });
  function restDir() { const v = inward(), x = v.x * W, y = v.y * H, m = Math.hypot(x, y) || 1; S.dx = x / m; S.dy = y / m; }
  function measure() {
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
    const fresh = !W;
    W = r.width; H = r.height;
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round((W + 2 * MARGIN) * dpr); canvas.height = Math.round((H + 2 * MARGIN) * dpr);
    canvas.style.width = (W + 2 * MARGIN) + 'px'; canvas.style.height = (H + 2 * MARGIN) + 'px';
    canvas.style.left = -MARGIN + 'px'; canvas.style.top = -MARGIN + 'px';
    paint.dpr = dpr;
    R0 = clamp(MATERIAL.memoryK * Math.min(W, H), MATERIAL.memoryMin, MATERIAL.memoryMax);
    Lrest = sF + 1.9 * R0;                       // at rest the corner keeps a small memory curl
    if (fresh || (S.mode === 'rest' && !S.peeled)) { restDir(); S.L = S.pL = Lrest + S.hover.x; S.X = S.pX = 0; }
    if (S.peeled) { S.L = S.pL = farL(); }
    const bg = getComputedStyle(over).backgroundColor; if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) front = rgbOf(bg);
    const bk = getComputedStyle(document.documentElement).getPropertyValue('--back').trim(); if (bk) back = rgbOf(bk);
    if (opts.front) front = rgbOf(opts.front); if (opts.back) back = rgbOf(opts.back);
    render(1);
  }
  // how far the fold line must travel to clear the sheet, plus room for the coil to roll out of frame
  const Lfar = () => { const c = C(); let m = 0; for (const p of [[0, 0], [W, 0], [0, H], [W, H]]) m = Math.max(m, (p[0] - c.x) * S.dx + (p[1] - c.y) * S.dy); return m; };
  const farL = () => Lfar() + 2.6 * R0 + 2 * Rf + 10;
  function mat(m, out) {
    const c = C(), px = c.x + S.dx * m, py = c.y + S.dy * m, t = slab(px, py, -S.dy, S.dx, W, H);
    if (m < 0 || t[1] <= t[0]) { out.l = out.r = out.sl = out.sr = 0; out.tl = out.tr = 0; return; }
    out.l = out.sl = t[1]; out.r = out.sr = -t[0]; out.tl = out.tr = 0;     // printed sheet: clean cut edges, no fibre
  }
  function frame(L, X) { const c = C(); return { hx: c.x + S.dx * L, hy: c.y + S.dy * L, dx: S.dx, dy: S.dy, L, X, gamma: 0, sgn: 1, Rf, R0, h: MATERIAL.thickness, xT: 100, mat }; }
  const gripAt = (L, X) => { const c = C(); return { x: c.x + S.dx * (L + X), y: c.y + S.dy * (L + X) }; };
  function clipOver(L) {
    const c = C(), pts = [[0, 0], [W, 0], [W, H], [0, H]], out = [];
    const f = p => (p[0] - c.x) * S.dx + (p[1] - c.y) * S.dy - L;
    for (let i = 0; i < 4; i++) {
      const a = pts[i], b = pts[(i + 1) % 4], fa = f(a), fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    over.style.clipPath = out.length < 3 ? 'polygon(0 0,0 0,0 0)' : 'polygon(' + out.map(p => p[0].toFixed(2) + 'px ' + p[1].toFixed(2) + 'px').join(',') + ')';
  }
  const local = (x, y) => { const r = el.getBoundingClientRect(); return { x: x - r.left, y: y - r.top }; };
  function nearCorner(p, touch) {
    if (S.peeled || !W) return false;
    const c = C(), zone = Math.max(touch ? 64 : 48, 0.16 * Math.min(W, H)), g = gripAt(S.L, S.X);
    return Math.hypot(p.x - c.x, p.y - c.y) < zone + S.L * 0.7 || Math.hypot(p.x - g.x, p.y - g.y) < R0 + (touch ? 28 : 18);
  }
  // The grip moves; the fold line follows the same rules as a tear, except that pushing the
  // paper back toward its corner lays it down again (it was only peeled, not torn).
  function gripTo(gx, gy) {
    const c = C(), v = inward(), dx = gx - c.x, dy = gy - c.y, D = Math.hypot(dx, dy);
    if (D > 2) {
      const mid = Math.atan2(v.y, v.x), lim = PI / 4 - 0.17;
      const A = mid + clamp(wrapPi(Math.atan2(dy, dx) - mid), -lim, lim);
      S.dx = Math.cos(A); S.dy = Math.sin(A);
    }
    const proj = Math.max(0, dx * S.dx + dy * S.dy);
    if (proj - S.L > S.L - sF) S.L = (proj + sF) / 2;          // pulled past reach: the peel advances
    else if (proj < S.L) S.L = proj;                           // pushed back: the sheet lays down again
    S.L = Math.min(S.L, farL());
    S.X = clamp(proj - S.L, 0, Math.max(0, S.L - sF));
    S.pL = S.L; S.pX = S.X;
  }
  function startRoll(away) {
    S.mode = 'roll';
    const w = omega(away ? MOTION.peelAway : MOTION.peelRoll, MOTION.snap);
    S.roll = { rho: { x: -1, v: MOTION.snap * w }, L0: S.L, X0: S.X, Lt: away ? farL() : Lrest, away, w };
    S.pL = S.L; S.pX = S.X;
    loop.wake(nowMs()); loop.request();
  }
  function step(h) {
    S.pL = S.L; S.pX = S.X;
    if (S.script) {
      const sc = S.script; sc.t = Math.min(sc.T, sc.t + h);
      const p = sc.path(sc.t / sc.T); gripTo(p.x, p.y);
      if (sc.t >= sc.T) { S.script = null; startRoll(sc.away); }
    }
    if (S.mode === 'roll') {
      const r = S.roll; cdStep(r.rho, r.w, h);
      const k = 1 - landed(r.rho.x);
      if (r.away) {
        // one spring, two beats: the free end rolls up to the fold first, then the coil rolls on, peeling the rest
        S.X = r.X0 * (1 - smooth(0, 0.5, k)); S.L = lerp(r.L0, r.Lt, smooth(0.18, 1, k));
      } else { S.L = lerp(r.L0, r.Lt, k); S.X = r.X0 * (1 - k); }
      if (k >= 1) {
        S.L = r.Lt; S.X = 0; S.mode = 'rest'; S.roll = null; S.peeled = r.away;
        el.classList.toggle('is-peeled', S.peeled);
        btn.textContent = S.peeled ? labelBack : label;
        try { el.dispatchEvent(new CustomEvent('elvana:peel', { detail: { peeled: S.peeled } })); } catch (_) { /* old browsers */ }
      }
    }
    if (S.mode === 'rest' && !S.peeled) {
      const s = { x: S.hover.x - S.hoverT, v: S.hover.v }; cdStep(s, W_PEEK, h); S.hover.x = s.x + S.hoverT; S.hover.v = s.v;
      S.L = Lrest + S.hover.x;
    }
  }
  function busy() { return !!(drag || S.script || S.mode === 'roll' || Math.abs(S.hover.x - S.hoverT) > 0.02 || Math.abs(S.hover.v) > 0.02); }
  function render(alpha) {
    if (!W) return;
    const held = S.mode === 'held';
    const L = held ? S.L : lerp(S.pL, S.L, alpha), X = held ? S.X : lerp(S.pX, S.X, alpha);
    clipOver(L);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (L > 0.3) {
      ctx.save();
      ctx.translate(MARGIN * dpr, MARGIN * dpr);
      // paper that rolls past the sheet's own edges has left the frame
      ctx.beginPath(); ctx.rect(0, 0, W * dpr, H * dpr); ctx.clip();
      paint.flap(flapGeo(frame(L, X), geo), { front, back, alpha: 1, fibre: false });
      ctx.restore();
    }
  }
  function down(info) {
    if (info.button > 0 || !nearCorner(info, info.touch)) return false;
    loop.wake(info.t); loop.advanceTo(info.t);
    S.script = null; S.roll = null; S.mode = 'held';
    const g = gripAt(S.L, S.X);
    drag = { id: info.id, ox: g.x - info.x, oy: g.y - info.y, lx: info.x, ly: info.y };
    track.reset(); track.add(info.t, info.x, info.y);
    el.classList.add('is-grabbing');
    gripTo(g.x, g.y);
    return true;
  }
  function move(info) {
    if (drag && info.id === drag.id) {
      loop.wake(info.t); loop.advanceTo(info.t);
      track.add(info.t, info.x, info.y);
      const k = Math.exp(-Math.hypot(info.x - drag.lx, info.y - drag.ly) / MOTION.catchPx);
      drag.ox *= k; drag.oy *= k; drag.lx = info.x; drag.ly = info.y;
      gripTo(info.x + drag.ox, info.y + drag.oy);
      return;
    }
    if (!info.touch && S.mode === 'rest' && !S.peeled) {
      const near = nearCorner(info, false); el.style.cursor = near ? 'grab' : '';
      const tgt = near ? 10 : 0; if (tgt !== S.hoverT) { S.hoverT = tgt; loop.wake(info.t); }
    }
  }
  function up(info) {
    if (!drag || info.id !== drag.id) return;
    loop.wake(info.t); loop.advanceTo(info.t);
    const v = track.velocity(), c = C();
    drag = null; el.classList.remove('is-grabbing');
    // a flick counts: project the grip 120 ms ahead, then ask whether it passed the middle
    const g = gripAt(S.L, S.X), gx = g.x + v.x * 0.12, gy = g.y + v.y * 0.12;
    const past = (gx - c.x) * S.dx + (gy - c.y) * S.dy > (W / 2 - c.x) * S.dx + (H / 2 - c.y) * S.dy;
    S.hoverT = 0; S.hover.x = 0; S.hover.v = 0;
    startRoll(past);
  }
  const info = (e, t) => { const p = local(e.clientX, e.clientY); return { id: e.pointerId, x: p.x, y: p.y, t: t != null ? t : evTime(e), touch: e.pointerType !== 'mouse', button: e.button }; };
  el.addEventListener('pointerdown', e => {
    if (!e.isPrimary) return;
    if (down(info(e))) { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (_) { /* synthetic */ } loop.request(); }
  });
  el.addEventListener('pointermove', e => { move(info(e)); if (drag) loop.request(); });
  const end = e => { up(info(e)); loop.request(); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', e => { if (drag && drag.id === e.pointerId) end(e); });
  el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !drag && S.hoverT) { S.hoverT = 0; el.style.cursor = ''; loop.wake(evTime(e)); } });
  el.addEventListener('touchstart', e => { if (drag) e.preventDefault(); }, { passive: false });
  el.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });
  // Keyboard: the same physics with a scripted grip, past the middle, then let go.
  function peelBack() {
    loop.wake(nowMs());
    if (S.script || drag) return;
    if (S.peeled || (S.mode === 'roll' && S.roll.away)) { S.peeled = false; el.classList.remove('is-peeled'); btn.textContent = label; S.hover.x = 0; S.hoverT = 0; startRoll(false); return; }
    S.roll = null; S.mode = 'held';
    const from = gripAt(S.L, S.X), c = C(), mid = (W / 2 - c.x) * S.dx + (H / 2 - c.y) * S.dy;
    const dist = Math.max(0, mid * 1.35 - ((from.x - c.x) * S.dx + (from.y - c.y) * S.dy));
    const dx = S.dx, dy = S.dy;
    S.script = { t: 0, T: MOTION.scripted / 1000, away: true, path: tau => { const e = EASE.pull(tau); return { x: from.x + dx * dist * e, y: from.y + dy * dist * e }; } };
    loop.request();
  }
  btn.addEventListener('click', peelBack);
  const ro = new ResizeObserver(measure); ro.observe(el);
  const io = new IntersectionObserver(es => { loop.visible = es[0].isIntersecting; if (loop.visible) { loop.anchor(nowMs()); loop.request(); } });
  io.observe(el);
  measure();
  Object.assign(inst, {
    peel: peelBack,
    get peeled() { return S.peeled; },
    play(events) {   // [{t, type: down|move|up, x, y, touch}] in element px, through the real input path (sim time)
      loop.wake(nowMs()); inst._replay = { ev: events.slice().sort((a, b) => a.t - b.t), i: 0, t: 0, t0: nowMs() }; loop.request();
    },
    reset() { S.peeled = false; el.classList.remove('is-peeled'); S.mode = 'rest'; S.roll = null; S.script = null; drag = null; S.hover.x = 0; S.hover.v = 0; S.hoverT = 0; restDir(); S.L = S.pL = Lrest; S.X = S.pX = 0; btn.textContent = label; render(1); },
    destroy() { ro.disconnect(); io.disconnect(); canvas.remove(); grip.remove(); btn.remove(); over.style.clipPath = ''; el.removeAttribute('data-peel-mounted'); el.classList.remove('peel--live', 'is-peeled'); instances.delete(inst); el.__elvanaPeel = null; },
    debug: {
      get state() { return S; }, get R0() { return R0; }, get W() { return W; }, get H() { return H; }, get Lrest() { return Lrest; },
      manual(on) { loop.manual = !!on; if (on && loop.raf) { cancelAnimationFrame(loop.raf); loop.raf = 0; } },
      tick(real) { loop.wake(real); loop.frame(real); },
      input(type, x, y, t, touch) { const i = { id: 1, x, y, t, touch: !!touch, button: 0 }; return type === 'down' ? down(i) : type === 'move' ? move(i) : up(i); }
    }
  });
  // replays run inside the fixed step so they are frame-rate independent
  const baseStep = step;
  step = function (h) {
    const R = inst._replay;
    if (R) {
      R.t += h * 1000;
      while (R.i < R.ev.length && R.ev[R.i].t <= R.t + 1e-6) {
        const e = R.ev[R.i++], i = { id: 77, x: e.x, y: e.y, t: R.t0 + e.t, touch: !!e.touch, button: 0 };
        if (e.type === 'down') down(i); else if (e.type === 'move') move(i); else up(i);
      }
      if (R.i >= R.ev.length) inst._replay = null;
    }
    baseStep(h);
  };
  loop.o.step = h => step(h);
  const baseBusy = busy; loop.o.busy = () => !!inst._replay || baseBusy();
  el.__elvanaPeel = inst;
  return inst;
}

/* ---------------- API ---------------- */
function autoInit() {
  if (!motionAllowed()) return [];
  const out = [];
  document.querySelectorAll('.hero').forEach(h => { if (h.querySelector('.tear-canvas')) out.push(mountHero(h)); });
  document.querySelectorAll('[data-peel]').forEach(p => out.push(mountPeel(p)));
  return out.filter(Boolean);
}
function setTimeScale(s) {
  timeScale = clamp(+s || 1, 0.02, 4);
  for (const i of instances) { i.loop.setScale(timeScale); i.loop.wake(nowMs()); }
}
// The site's slow-motion switch (core.js) announces itself on document.
document.addEventListener('elvana:timescale', e => setTimeScale((e.detail && e.detail.timeScale) || 1));
window.ElvanaTear = { mountHero, mountPeel, autoInit, setTimeScale, get timeScale() { return timeScale; }, MATERIAL, MOTION, version: '2.0.0' };
// Mount everything on the page once it is parsed (idempotent; core.js may mount the hero first).
if (!window.ElvanaTearManual) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoInit, { once: true });
  else setTimeout(autoInit, 0);
}
})();
