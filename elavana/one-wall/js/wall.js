/* =========================================================================
   Elvana Media: wall.js  (home; loads after tear.js and core.js)
   Small behaviours the "One Wall" system adds. Nothing here is required:
   without JS, or with reduced motion, every part shows its final state.

   1. Route: the "How we work" line draws from Brief to Impact as it crosses
      the screen, and each stop inks in as the line reaches it
   2. Tear-off tabs: tear your sector off the flyer; it goes on your enquiry
      (adds a `sector` field that core.js includes in the email it prepares)
   3. Demo rail: on a phone, a pager under the four demo posters
   4. Nav: marks the section you are in (only for links that point into this page)
   ========================================================================= */
(() => {
'use strict';
const root = document.documentElement;
const motionOK = root.classList.contains('motion');
const E = window.Elvana || {};
const say = t => { if (E.announce) E.announce(t); };
const fb = n => { if (E.feedback) E.feedback(n); };

/* 1. Route ---------------------------------------------------------------- */
const route = document.querySelector('[data-route]');
if (route && motionOK && 'IntersectionObserver' in window) {
  const stops = [...route.querySelectorAll('.steps li')];
  const n = stops.length;
  let live = false, raf = 0;
  route.classList.add('is-live');
  const draw = () => {
    raf = 0;
    const r = route.getBoundingClientRect(), vh = innerHeight;
    // 0 when the line's top edge is 82% down the screen, 1 when it is 34% down
    const p = Math.min(1, Math.max(0, (vh * .82 - r.top) / (vh * .48)));
    route.style.setProperty('--p', p.toFixed(4));
    stops.forEach((li, i) => li.classList.toggle('is-reached', p >= (i / n) - .001 && p > 0));
  };
  const onScroll = () => { if (live && !raf) raf = requestAnimationFrame(draw); };
  new IntersectionObserver(es => es.forEach(e => { live = e.isIntersecting; if (live) draw(); }), { rootMargin: '20% 0px 20% 0px' }).observe(route);
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  draw();
} else if (route) {
  route.querySelectorAll('.steps li').forEach(li => li.classList.add('is-reached'));
}

/* 2. Tear-off tabs --------------------------------------------------------- */
// Without JS the sectors are a plain list. Here each one becomes a real button.
const tabs = (document.getElementById('contact-form') && document.getElementById('sector-slot'))
  ? [...document.querySelectorAll('.tab[data-sector]')].map(el => {
      if (el.tagName === 'BUTTON') return el;
      const b = document.createElement('button');
      b.type = 'button'; b.className = el.className; b.dataset.sector = el.dataset.sector;
      b.setAttribute('aria-pressed', 'false'); b.innerHTML = el.innerHTML;
      el.replaceWith(b);
      return b;
    })
  : [];
const form = document.getElementById('contact-form');
const slot = document.getElementById('sector-slot');
const status = document.getElementById('tabs-status');
if (tabs.length && form && slot) {
  let field = null;
  const setSector = name => {
    if (!name) {
      if (field) { field.remove(); field = null; }
      slot.hidden = true; slot.textContent = '';
      return;
    }
    if (!field) {
      field = document.createElement('input');
      field.type = 'hidden'; field.name = 'sector'; field.id = 'f-sector';
      form.appendChild(field);
    }
    field.value = name;
    slot.textContent = '';
    const chip = document.createElement('p'); chip.className = 'sector-chip';
    const label = document.createElement('label'); label.htmlFor = 'f-sector'; label.className = 'sr'; label.textContent = 'Sector';
    const text = document.createElement('span'); text.textContent = 'Sector: ' + name;
    const off = document.createElement('button'); off.type = 'button'; off.textContent = 'Remove';
    off.setAttribute('aria-label', 'Remove ' + name + ' from your enquiry');
    off.addEventListener('click', () => { release(); say('Sector removed from your enquiry.'); const f = document.getElementById('f-msg'); f && f.focus(); });
    chip.append(label, text, off); slot.append(chip); slot.hidden = false;
  };
  const release = () => {
    tabs.forEach(t => t.setAttribute('aria-pressed', 'false'));
    setSector('');
    if (status) status.textContent = '';
  };
  const fall = tab => {                       // a copy of the tab drops off the flyer; the real button stays put as its outline
    if (!motionOK) return;
    const ghost = document.createElement('span');
    ghost.className = 'tab tab-fall'; ghost.setAttribute('aria-hidden', 'true');
    ghost.innerHTML = tab.innerHTML;
    tab.parentNode.appendChild(ghost);
    ghost.addEventListener('animationend', () => ghost.remove(), { once: true });
    setTimeout(() => ghost.remove(), 8000);
  };
  tabs.forEach(tab => tab.addEventListener('click', () => {
    const name = tab.dataset.sector, was = tab.getAttribute('aria-pressed') === 'true';
    if (was) { release(); say(name + ' pasted back.'); fb('paste'); return; }
    tabs.forEach(t => t.setAttribute('aria-pressed', String(t === tab)));
    fall(tab); fb('rip');
    setSector(name);
    if (status) {
      status.textContent = '';
      const a = document.createElement('a'); a.href = '#contact'; a.textContent = 'Finish it in the form';
      status.append(name + ' is on your enquiry. ', a, '.');
    }
  }));
}

/* 3. Demo rail pager (phone) ------------------------------------------------ */
const rail = document.getElementById('demos');
if (rail && 'IntersectionObserver' in window) {
  const cards = [...rail.querySelectorAll('.demo')];
  const dots = document.createElement('div');
  dots.className = 'rail-dots'; dots.setAttribute('aria-hidden', 'true');
  cards.forEach(() => dots.appendChild(document.createElement('i')));
  rail.after(dots);
  const io = new IntersectionObserver(es => es.forEach(e => {
    const i = cards.indexOf(e.target);
    if (i > -1 && e.isIntersecting) [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
  }), { root: rail, threshold: .6 });
  cards.forEach(c => io.observe(c));
  dots.firstChild && dots.firstChild.classList.add('on');
}

/* 4. Nav: where you are ---------------------------------------------------- */
const links = [...document.querySelectorAll('.nav-links a[href^="#"]')];
if (links.length) {
  const pairs = [];
  links.forEach(a => { const s = document.getElementById(a.getAttribute('href').slice(1)); if (s) pairs.push([s, a]); });
  let raf = 0;
  const mark = () => {
    raf = 0;
    const line = innerHeight * .38;
    let best = null, top = -Infinity;
    pairs.forEach(([s, a]) => { const r = s.getBoundingClientRect(); if (r.top <= line && r.bottom > line * .5 && r.top > top) { top = r.top; best = a; } });
    links.forEach(a => a.classList.toggle('is-here', a === best));
  };
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(mark); }, { passive: true });
  addEventListener('resize', () => { if (!raf) raf = requestAnimationFrame(mark); }, { passive: true });
  mark();
}
})();
