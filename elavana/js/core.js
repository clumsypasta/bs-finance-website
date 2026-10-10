/* =========================================================================
   Elvana Media: core.js (every page)
   1. MOTION: named curves and timings, in one place (CSS mirrors the curves)
   2. Slow-motion review switch: footer button + S key, 10% speed, off by default
   3. Menu: the popover closes after a link is chosen
   4. Hero tear: mounts window.ElvanaTear on the home hero (tear.js)
   5. Paste-on-scroll: the site's ONE ambient system. CSS scroll timelines do the
      work; this adds a time-driven fallback where they are missing
   6. Demos: illustrative [data-demo] figures play once in view, replayable
   7. Forms: [data-mailto-form] validates on blur and send, then hands the
      message to the visitor's email app (without JS it posts to mailto:)
   8. Live region: Elvana.announce(text) speaks through #sr-live
   9. Rubber-stamp tags: primary .tag presses leave an ink ring (.is-stamped)
  10. Paper sounds + haptics: footer toggle (#sound), off by default, kept for
      the tab session. Rip, paste slap and stamp thud are synthesised with
      Web Audio (no files); Android adds a short vibration on the rip.
      Elvana.feedback('rip' | 'paste' | 'stamp') for page signatures.
   Corner-lift (.flyer) is pure CSS (hover, :active, :focus-within).
   Paste-over page transitions are CSS plus the pagereveal script in head.html.
   No JS or reduced motion: every figure and poster shows its final state.
   ========================================================================= */
(() => {
'use strict';
const root = document.documentElement;
const motionOK = root.classList.contains('motion');

/* 1. MOTION ---------------------------------------------------------------
   Springs: k = stiffness, c = damping, mass 1. zeta = c / (2 * sqrt(k)).   */
const MOTION = {
  // The tear and peel physics (material constants, springs, roll timing) live in tear.js's MATERIAL / MOTION blocks.
  paste: bezier(.2, .7, .1, 1),     // paste: cubic-bezier(.2,.7,.1,1). Squeegee settle; every entrance eases out.
  tug: bezier(.55, 0, .75, .2),     // tug: cubic-bezier(.55,0,.75,.2). Gravity: a sheet letting go of the wall.
  lift: 'cubic-bezier(.3,1.3,.5,1)',// lift: a corner lifting, one tiny overshoot (CSS only)
  ms: { press: 120, lift: 220, paste: 320, pasteIn: 900, letGo: 900, pasteBack: 1100, fallLife: 950, chatGap: 650, cellStagger: 40, barStagger: 120 }
};
let timeScale = 1;                  // 0.1 while slow-motion review is on

function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = t => ((ax * t + bx) * t + cx) * t;
  const sy = t => ((ay * t + by) * t + cy) * t;
  const dsx = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const e = sx(t) - x, d = dsx(t); if (Math.abs(e) < 1e-5 || !d) break; t -= e / d; }
    t = Math.min(1, Math.max(0, t));
    return sy(t);
  };
}

/* 8. Live region ---------------------------------------------------------- */
const liveEl = document.getElementById('sr-live');
function announce(text) { if (!liveEl) return; liveEl.textContent = ''; setTimeout(() => { liveEl.textContent = text; }, 30); }

/* 2. Slow-motion review switch -------------------------------------------- */
const slowBtn = document.getElementById('slowmo');
function setSlow(on) {
  timeScale = on ? 0.1 : 1;
  root.style.setProperty('--slow', on ? '10' : '1');
  if (slowBtn) { slowBtn.setAttribute('aria-pressed', String(on)); slowBtn.textContent = on ? 'Slow motion on (S)' : 'Slow motion (S)'; }
  document.dispatchEvent(new CustomEvent('elvana:timescale', { detail: { timeScale } }));
}
slowBtn && slowBtn.addEventListener('click', () => setSlow(timeScale === 1));
addEventListener('keydown', e => {
  if (e.key !== 's' && e.key !== 'S') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  if (motionOK) setSlow(timeScale === 1);
});

/* 3. Menu: close after choosing a link ----------------------------------- */
const menu = document.getElementById('menu');
if (menu && menu.hidePopover) menu.addEventListener('click', e => { if (e.target.closest('a')) menu.hidePopover(); });

/* 4. Hero tear (home) ------------------------------------------------------ */
const hero = document.querySelector('.hero');
if (hero && window.ElvanaTear && window.ElvanaTear.mountHero) {
  window.ElvanaTear.mountHero(hero, {
    button: document.getElementById('tear-btn'),
    live: document.getElementById('tear-live'),
    clip: document.getElementById('tear-clip'),
    motion: MOTION
  });
}

/* 5. Paste-on-scroll fallback ----------------------------------------------
   Browsers with scroll timelines paste each poster as it scrolls in (CSS).
   Elsewhere, posters that start below the fold wait unpasted and paste on
   over --t-paste-in when they enter. Posters already in view never wait.  */
if (motionOK && !(window.CSS && CSS.supports && CSS.supports('animation-timeline: view()')) && 'IntersectionObserver' in window) {
  root.classList.add('paste-io');
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.remove('is-waiting'); e.target.classList.add('is-pasted'); io.unobserve(e.target);
  }), { rootMargin: '0px 0px -6% 0px' });
  document.querySelectorAll('.poster:not(.page-hero + .poster)').forEach(p => {
    if (p.getBoundingClientRect().top > innerHeight) { p.classList.add('is-waiting'); io.observe(p); }
  });
}

/* 6. Demos -----------------------------------------------------------------
   Four kinds: chat (lines in turn), call (script lines while the wave talks),
   blast (template, then audience cells), report (bars grow). Played once when
   35% visible; the .replay button inside plays it again.                   */
const demos = [...document.querySelectorAll('[data-demo]')];
if (demos.length && motionOK && 'IntersectionObserver' in window) {
  const timers = new Map();
  const later = (d, fn, ms) => { const id = setTimeout(fn, ms / timeScale); timers.get(d).push(id); };
  const reset = d => { (timers.get(d) || []).forEach(clearTimeout); timers.set(d, []); d.querySelectorAll('.in').forEach(n => n.classList.remove('in')); const w = d.querySelector('.wave'); w && w.classList.remove('on'); };
  const play = d => {
    reset(d);
    const kind = d.dataset.demo;
    if (kind === 'chat') {
      d.querySelectorAll('.ln').forEach((n, i) => later(d, () => n.classList.add('in'), 250 + i * MOTION.ms.chatGap));
    } else if (kind === 'call') {
      const wave = d.querySelector('.wave'); let t = 250;
      d.querySelectorAll('.ln').forEach(n => {
        const dur = +n.dataset.ms || 1500, ai = n.classList.contains('ai');
        later(d, () => { n.classList.add('in'); wave && wave.classList.toggle('on', ai); }, t);
        t += dur;
      });
      later(d, () => wave && wave.classList.remove('on'), t);
    } else if (kind === 'blast') {
      const tpl = d.querySelector('.tpl'); tpl && later(d, () => tpl.classList.add('in'), 200);
      let i = 0;
      d.querySelectorAll('.seg:not(.off) .cells i').forEach(c => { if (c.offsetParent !== null) later(d, () => c.classList.add('in'), 750 + (i++) * MOTION.ms.cellStagger); });
    } else if (kind === 'report') {
      d.querySelectorAll('.bars i').forEach((b, i) => later(d, () => b.classList.add('in'), 200 + i * MOTION.ms.barStagger));
    }
  };
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting && !e.target.dataset.played) { e.target.dataset.played = '1'; play(e.target); }
  }), { threshold: .35 });
  demos.forEach(d => {
    timers.set(d, []);
    d.setAttribute('data-armed', '');
    io.observe(d);
    const b = d.querySelector('.replay'); b && b.addEventListener('click', () => play(d));
  });
}

/* 7. Forms -------------------------------------------------------------------
   <form data-mailto-form action="mailto:info@elvanamedia.com" method="post" enctype="text/plain">
   Required fields carry aria-describedby="<id of their .err>" and an optional
   data-msg (what to fix, lower case, no "Fix this:"; CSS adds that).       */
const DEFAULT_MSGS = {
  name: 'add your name so we know who to reply to.',
  email: 'enter an email address like you@company.com.',
  message: 'tell us in a line or two what you need.'
};
document.querySelectorAll('form[data-mailto-form]').forEach(form => {
  form.noValidate = true;
  const to = (form.getAttribute('action') || 'mailto:info@elvanamedia.com').replace(/^mailto:/, '').split('?')[0];
  const status = form.querySelector('[role="status"]');
  const check = el => {
    const err = document.getElementById(el.getAttribute('aria-describedby'));
    if (!err) return true;
    const ok = el.checkValidity() && el.value.trim() !== '';
    el.setAttribute('aria-invalid', String(!ok));
    err.textContent = ok ? '' : (el.dataset.msg || DEFAULT_MSGS[el.name] || 'fill this in.');
    return ok;
  };
  form.querySelectorAll('[required]').forEach(el => el.addEventListener('blur', () => { if (el.value || el.getAttribute('aria-invalid')) check(el); }));
  form.addEventListener('submit', e => {
    e.preventDefault();
    const bad = [...form.querySelectorAll('[required]')].filter(el => !check(el));
    if (bad.length) { bad[0].focus(); if (status) status.textContent = ''; return; }
    const v = n => (form.elements[n] ? form.elements[n].value.trim() : '');
    const subject = (form.dataset.subject || 'Enquiry from') + ' ' + (v('name') || 'the website');
    const extra = [...form.elements].filter(el => el.name && !['name', 'email', 'phone', 'message'].includes(el.name) && el.value.trim())
      .map(el => `\n${(form.querySelector(`label[for="${el.id}"]`) || {}).textContent || el.name}: ${el.value.trim()}`).join('');
    const body = `${v('message')}\n\nName: ${v('name')}\nEmail: ${v('email')}` + (v('phone') ? `\nPhone: ${v('phone')}` : '') + extra;
    const href = `mailto:${to}?subject=` + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    if (status) status.textContent = `Your email app should now open with the message ready to send. If nothing opened, write to ${to}.`;
    form.dataset.mailto = href;
    window.location.href = href;
  });
});

/* 10. Paper sounds + haptics ------------------------------------------------
   Never on by default, never required. The toggle plays a stamp to confirm.   */
const soundBtn = document.getElementById('sound');
let soundOn = false, actx = null, noise = null;
function audio() {
  if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; actx = new AC(); }
  if (actx.state === 'suspended') actx.resume();
  if (!noise) { noise = actx.createBuffer(1, actx.sampleRate * .5, actx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  return actx;
}
function burst(c, t, dur, type, f0, f1, q, peak) {          // filtered noise with a fast attack
  const n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  n.buffer = noise; f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  n.connect(f).connect(g).connect(c.destination); n.start(t, Math.random() * .2); n.stop(t + dur + .02);
  return g;
}
function thump(c, t, dur, f0, f1, peak) {                   // a falling sine: the body of a hit
  const o = c.createOscillator(), g = c.createGain();
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + .005); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + .02);
}
const SOUNDS = {
  rip(c, t) {                                               // paper fibres giving way: crackling band-passed noise
    const g = burst(c, t, .3, 'bandpass', 1600, 4200, .8, .5);
    for (let i = 1; i < 14; i++) g.gain.setValueAtTime(.12 + Math.random() * .4, t + i * .019);
    g.gain.exponentialRampToValueAtTime(.0001, t + .3);
  },
  paste(c, t) { burst(c, t, .16, 'lowpass', 1400, 300, .7, .45); thump(c, t, .12, 150, 60, .35); },   // wet slap
  stamp(c, t) { thump(c, t, .16, 110, 45, .6); burst(c, t, .05, 'highpass', 2500, 1800, .7, .25); }    // ink stamp thud
};
function feedback(name) {
  if (!soundOn) return;
  const c = audio(); if (c && SOUNDS[name]) SOUNDS[name](c, c.currentTime + .01);
  if (name === 'rip' && navigator.vibrate) { try { navigator.vibrate(12); } catch (_) {} }
}
function setSound(on, quiet) {
  soundOn = on;
  if (soundBtn) { soundBtn.setAttribute('aria-pressed', String(on)); soundBtn.textContent = on ? 'Paper sounds on' : 'Paper sounds'; }
  try { on ? sessionStorage.setItem('elvana-sound', '1') : sessionStorage.removeItem('elvana-sound'); } catch (_) {}
  if (on && !quiet) feedback('stamp');
}
if (soundBtn) {
  soundBtn.addEventListener('click', () => setSound(!soundOn));
  try { if (sessionStorage.getItem('elvana-sound') === '1') setSound(true, true); } catch (_) {}
}

/* 9. Rubber-stamp tags ----------------------------------------------------- */
document.addEventListener('click', e => {
  const tag = e.target.closest && e.target.closest('.tag:not(.tag-line)');
  if (!tag || tag.disabled || tag.getAttribute('aria-disabled') === 'true') return;
  feedback('stamp');
  if (!motionOK) return;
  tag.classList.remove('is-stamped'); void tag.offsetWidth; tag.classList.add('is-stamped');
  tag.addEventListener('animationend', () => tag.classList.remove('is-stamped'), { once: true });
});

/* Sound hooks for the site-wide motion (only heard when the visitor turned sounds on):
   a paste slap as each poster lands, and a rip whenever the hero tear starts a strip
   (read from the tear's DOM contract: a new path in #tear-clip while the visitor tears). */
if (motionOK && 'IntersectionObserver' in window) {
  const slap = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { feedback('paste'); slap.unobserve(e.target); } }), { threshold: .3 });
  document.querySelectorAll('.poster:not(.page-hero + .poster)').forEach(p => { if (p.getBoundingClientRect().top > innerHeight) slap.observe(p); });
}
const tearClip = document.getElementById('tear-clip');
if (hero && tearClip && 'MutationObserver' in window) {
  let tearing = 0, lastRip = 0;
  hero.addEventListener('pointerdown', () => { tearing = Infinity; });
  addEventListener('pointerup', () => { if (tearing === Infinity) tearing = performance.now() + 400; });
  const tb = document.getElementById('tear-btn'); tb && tb.addEventListener('click', () => { tearing = performance.now() + 1500; });
  new MutationObserver(ms => {
    const now = performance.now();
    if (now > tearing || now - lastRip < 260) return;
    if (ms.some(m => [...m.addedNodes].some(n => n.nodeName.toLowerCase() === 'path'))) { lastRip = now; feedback('rip'); }
  }).observe(tearClip, { childList: true });
}

window.Elvana = { MOTION, announce, setSlow, feedback, setSound, get timeScale() { return timeScale; }, get sound() { return soundOn; } };
})();
