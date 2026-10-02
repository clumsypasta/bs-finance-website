/* Shared behaviour for the partner sites. No libraries. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var params = new URLSearchParams(location.search);
  var hoverMQ = window.matchMedia("(hover:hover)");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- desktop dropdown menus ---------- */
  var dds = $$(".dd");
  function setSub(li, open) {
    li.classList.toggle("open", open); li.firstElementChild.setAttribute("aria-expanded", String(open));
    if (open) {   // open to the left when there is no room on the right
      var fly = li.querySelector(".fly"); fly.classList.remove("flip");
      if (li.getBoundingClientRect().right + fly.offsetWidth + 16 > window.innerWidth) fly.classList.add("flip");
    } else $$(".has-sub.open", li).forEach(function (x) { setSub(x, false); });
  }
  function setOpen(dd, open) {
    dd.classList.toggle("open", open); dd.firstElementChild.setAttribute("aria-expanded", String(open));
    if (!open) $$(".has-sub.open", dd).forEach(function (x) { setSub(x, false); });
  }
  // side flyouts inside a menu: hover opens after a short pause (so moving the mouse
  // diagonally to a flyout does not switch to the row it passes over); click / Enter toggles
  $$(".has-sub").forEach(function (li) {
    var timer, btn = li.firstElementChild;
    function siblings() { return $$(":scope > .has-sub", li.parentElement).filter(function (x) { return x !== li; }); }
    function openAndFocus() {
      siblings().forEach(function (x) { setSub(x, false); }); setSub(li, true);
      var first = li.querySelector(":scope > .fly a, :scope > .fly button"); if (first) first.focus();
    }
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (e.detail === 0) { if (li.classList.contains("open")) setSub(li, false); else openAndFocus(); return; }   // Enter / Space
      var open = hoverMQ.matches ? true : !li.classList.contains("open");
      siblings().forEach(function (x) { setSub(x, false); }); setSub(li, open);
    });
    li.addEventListener("mouseenter", function () {
      if (!hoverMQ.matches) return;
      clearTimeout(li._t);
      var busy = siblings().some(function (x) { return x.classList.contains("open"); });
      timer = setTimeout(function () { siblings().forEach(function (x) { setSub(x, false); }); setSub(li, true); }, busy ? 140 : 40);
      li._t = timer;
    });
    li.addEventListener("mouseleave", function () {
      if (!hoverMQ.matches) return;
      clearTimeout(li._t); li._t = setTimeout(function () { setSub(li, false); }, 260);
    });
    li.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight" && e.target === btn) { e.preventDefault(); openAndFocus(); }
      if (e.key === "ArrowLeft" && li.classList.contains("open") && e.target !== btn) { e.preventDefault(); e.stopPropagation(); setSub(li, false); btn.focus(); }
    });
  });
  // arrow keys move through the rows of an open menu
  $$(".dd .fly").forEach(function (ul) {
    ul.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      var items = $$(":scope > li > a, :scope > li > button", ul), i = items.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault(); e.stopPropagation();
      items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
    });
  });
  function closeAll(except) { dds.forEach(function (d) { if (d !== except) setOpen(d, false); }); }
  dds.forEach(function (dd) {
    var btn = dd.firstElementChild, timer;
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      // With a mouse, hover has already opened the menu, so a click must not shut it again.
      var open = (hoverMQ.matches && e.detail > 0) ? true : !dd.classList.contains("open");
      closeAll(dd); setOpen(dd, open);
    });
    dd.addEventListener("mouseenter", function () { if (!hoverMQ.matches) return; clearTimeout(timer); closeAll(dd); setOpen(dd, true); });
    dd.addEventListener("mouseleave", function () { if (!hoverMQ.matches) return; timer = setTimeout(function () { setOpen(dd, false); }, 180); });
  });
  document.addEventListener("click", function (e) { if (!e.target.closest(".dd")) closeAll(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeAll(); closeDrawer(); closeLightbox(); } });

  /* ---------- mobile drawer ---------- */
  var drawer = $(".drawer"), burger = $(".site-header .burger");
  // sliding screens (layout "classic"): tap a row with > to slide its list in, Back slides it out
  var panes = $$(".drawer .pane"), stack = ["root"];
  function showPane(id, back) {
    panes.forEach(function (p) {
      var k = p.getAttribute("data-pane");
      p.classList.toggle("on", k === id);
      p.classList.toggle("left", stack.indexOf(k) > -1 && k !== id);
      p.classList.toggle("back-anim", !!back);
    });
    var cur = $('.drawer .pane[data-pane="' + id + '"]');
    if (cur) { cur.scrollTop = 0; var f = back ? null : $(".row, .back", cur); if (f && drawer.classList.contains("open")) setTimeout(function () { f.focus({ preventScroll: true }); }, 60); }
  }
  $$(".drawer [data-go]").forEach(function (b) { b.addEventListener("click", function () { var id = b.getAttribute("data-go"); stack.push(id); showPane(id); }); });
  $$(".drawer [data-back]").forEach(function (b) { b.addEventListener("click", function () { if (stack.length > 1) stack.pop(); showPane(stack[stack.length - 1], true); }); });
  function openDrawer() { stack = ["root"]; showPane("root"); drawer.classList.add("open"); document.body.style.overflow = "hidden"; burger.setAttribute("aria-expanded", "true"); $(".drawer .close").focus(); }
  function closeDrawer() { if (!drawer || !drawer.classList.contains("open")) return; drawer.classList.remove("open"); document.body.style.overflow = ""; burger.setAttribute("aria-expanded", "false"); }
  if (burger && drawer) burger.addEventListener("click", openDrawer);
  $$(".drawer .close, .drawer .shade").forEach(function (el) { el.addEventListener("click", closeDrawer); });
  $$(".drawer a").forEach(function (a) { a.addEventListener("click", closeDrawer); });
  window.addEventListener("resize", function () { if (burger && getComputedStyle(burger).display === "none") closeDrawer(); });

  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------- endless logo rail: auto-scroll + drag / swipe / arrows, looping both ways ---------- */
  $$("[data-rail]").forEach(function (rail) {
    var view = $(".rail-view", rail), track = $(".rail-track", rail);
    var originals = Array.prototype.slice.call(track.children);
    // three copies: we always stay in the middle one and jump by one copy width to loop
    for (var k = 0; k < 2; k++) originals.forEach(function (t) { var c = t.cloneNode(true); c.setAttribute("aria-hidden", "true"); $$("img", c).forEach(function (i) { i.alt = ""; }); $$("a", c).forEach(function (a) { a.setAttribute("tabindex", "-1"); }); track.appendChild(c); });
    var setW = 0, pos = 0, paused = false, resumeAt = 0, speed = 0.03, dragging = false, startX = 0, startPos = 0, moved = 0, last = 0;   // speed: px per ms
    function measure() { setW = track.scrollWidth / 3; }
    function wrap() { if (!setW) return; while (pos < setW * 0.5) pos += setW; while (pos > setW * 1.5) pos -= setW; }
    function apply() { wrap(); view.scrollLeft = pos; }
    function hold(ms) { resumeAt = performance.now() + (ms || 2500); }
    measure(); pos = setW; apply();
    window.addEventListener("resize", function () { var r = pos / (setW || 1); measure(); pos = r * setW; apply(); });
    $$("img", track).forEach(function (i) { if (!i.complete) i.addEventListener("load", measure); });
    function tick(now) {
      var dt = last ? Math.min(64, now - last) : 16; last = now;   // time-based, so speed is the same on every screen
      if (!paused && !dragging && now > resumeAt && !reduceMotion && !document.hidden) { pos += speed * dt; apply(); }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    view.addEventListener("mouseenter", function () { paused = true; });
    view.addEventListener("mouseleave", function () { paused = false; });
    view.addEventListener("focusin", function () { paused = true; });
    view.addEventListener("focusout", function () { paused = false; });
    // native scrolling (touch swipe, trackpad, shift+wheel) keeps looping too
    view.addEventListener("scroll", function () { if (Math.abs(view.scrollLeft - pos) > 1) { pos = view.scrollLeft; hold(); if (pos < setW * 0.5 || pos > setW * 1.5) apply(); } }, { passive: true });
    view.addEventListener("touchstart", function () { hold(4000); }, { passive: true });
    // mouse drag
    // the strip only takes over the mouse once it moves, so a plain click still opens a link
    var pressed = false;
    view.addEventListener("pointerdown", function (e) { if (e.pointerType !== "mouse" || e.button !== 0) return; pressed = true; moved = 0; startX = e.clientX; startPos = pos; });
    view.addEventListener("pointermove", function (e) {
      if (!pressed) return;
      moved = Math.abs(e.clientX - startX);
      if (!dragging && moved > 5) { dragging = true; view.classList.add("dragging"); view.setPointerCapture(e.pointerId); }
      if (dragging) { pos = startPos - (e.clientX - startX); apply(); }
    });
    window.addEventListener("pointerup", function () { pressed = false; });
    function endDrag() { if (!dragging) return; dragging = false; view.classList.remove("dragging"); hold(); }
    // after dragging the strip with the mouse, do not open the item under the pointer
    view.addEventListener("click", function (e) { if (moved > 6) { e.preventDefault(); e.stopPropagation(); moved = 0; } }, true);
    view.addEventListener("pointerup", endDrag); view.addEventListener("pointercancel", endDrag);
    // arrows: glide one step, wrapping first so there is always room
    function glide(dir) {
      var step = (track.firstElementChild.getBoundingClientRect().width + 12) * 2, from = pos, t0 = null;
      hold(3500);
      function anim(now) { if (!t0) t0 = now; var p = Math.min(1, (now - t0) / 380), e = 1 - Math.pow(1 - p, 3); pos = from + dir * step * e; apply(); if (p < 1) requestAnimationFrame(anim); else hold(3000); }
      requestAnimationFrame(anim);
    }
    $(".prev", rail).addEventListener("click", function () { glide(-1); });
    $(".next", rail).addEventListener("click", function () { glide(1); });
    view.addEventListener("keydown", function (e) { if (e.key === "ArrowRight") { e.preventDefault(); glide(1); } if (e.key === "ArrowLeft") { e.preventDefault(); glide(-1); } });
  });

  /* ---------- forms ---------- */
  var RULES = {
    name: function (v) { return /^[A-Za-zऀ-ॿ][A-Za-zऀ-ॿ .'-]{1,59}$/.test(v) ? "" : (v ? "Please write your name using letters only." : "Please enter your name."); },
    mobile: function (v) { var d = v.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, ""); return /^[6-9]\d{9}$/.test(d) ? "" : (v ? "Enter a 10-digit mobile number that starts with 6, 7, 8 or 9." : "Please enter your mobile number."); },
    email: function (v, req) { if (!v) return req ? "Please enter your email." : ""; return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v) ? "" : "Please check your email. Example: name@gmail.com"; },
    city: function (v) { return /^[A-Za-zऀ-ॿ][A-Za-zऀ-ॿ .-]{1,49}$/.test(v) ? "" : (v ? "Please write your city using letters only." : "Please enter your city."); },
    text: function (v, req) { if (!v.trim()) return req ? "Please fill this in." : ""; return v.length > 1500 ? "Please keep this under 1500 letters." : ""; },
    number: function (v, req) { if (!v) return req ? "Please enter a number." : ""; return /^\d{1,6}(\.\d{1,2})?$/.test(v) ? "" : "Please enter a number, like 25."; },
    amount: function (v, req) { if (!v) return req ? "Please enter the amount." : ""; var n = +v.replace(/[^\d]/g, ""); return n >= 1000 && n <= 1000000000 ? "" : "Enter the amount in rupees, like 500000."; },
    select: function (v) { return v ? "" : "Please choose one option."; },
    choice: function (v) { return v ? "" : "Please choose one option."; },
    consent: function (v) { return v ? "" : "Please tick this box so we can contact you."; }
  };
  function inputOf(f) { return f.querySelector("[data-check]"); }
  function valueOf(f) {
    var inp = inputOf(f), type = inp.getAttribute("data-check");
    if (type === "choice") { var c = f.querySelector("input:checked"); return c ? c.value : ""; }
    if (type === "consent") return inp.checked ? "yes" : "";
    return inp.value.trim();
  }
  function isShown(f) { return !f.hidden; }
  function check(f) {
    if (!isShown(f)) { f.classList.remove("bad"); return true; }
    var inp = inputOf(f), msg = RULES[inp.getAttribute("data-check")](valueOf(f), inp.hasAttribute("required"));
    f.classList.toggle("bad", !!msg);
    var e = f.querySelector(".err span"); if (e) e.textContent = msg;
    return !msg;
  }
  $$("input[data-check=mobile]").forEach(function (i) { i.addEventListener("input", function () { i.value = i.value.replace(/\D/g, "").slice(0, 10); }); });
  $$("input[data-check=amount]").forEach(function (i) { i.addEventListener("input", function () { i.value = i.value.replace(/[^\d]/g, "").slice(0, 10); }); });
  $$("input[data-check=number]").forEach(function (i) { i.addEventListener("input", function () { i.value = i.value.replace(/[^\d.]/g, "").slice(0, 9); }); });

  $$("form[data-form]").forEach(function (form) {
    var fields = $$(".field[data-f], .consent-wrap[data-f]", form);
    // fields that only show for some answers: data-when="name:Value A|Value B"
    var conditional = fields.filter(function (f) { return f.hasAttribute("data-when"); });
    function refresh() {
      conditional.forEach(function (f) {
        var spec = f.getAttribute("data-when").split(":"), src = form.querySelector('[name="' + spec[0] + '"]');
        var v = src ? src.value : "";
        f.hidden = spec[1].split("|").indexOf(v) < 0;
      });
    }
    conditional.forEach(function (f) { var src = form.querySelector('[name="' + f.getAttribute("data-when").split(":")[0] + '"]'); if (src) src.addEventListener("change", refresh); });
    // prefill from the address: ?topic=, ?type=, ?product=, ?msg=
    $$("[data-param]", form).forEach(function (el) {
      var v = params.get(el.getAttribute("data-param")); if (!v) return;
      if (el.tagName === "SELECT") { $$("option", el).forEach(function (o) { if (o.value.toLowerCase() === v.toLowerCase()) el.value = o.value; }); }
      else el.value = v;
    });
    refresh();
    fields.forEach(function (f) {
      var ev = f.querySelector("[data-check=choice], [data-check=consent], select") ? "change" : "blur";
      f.addEventListener(ev, function () { check(f); }, true);
      f.addEventListener("input", function () { if (f.classList.contains("bad")) check(f); });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      refresh();
      var ok = true, first = null;
      fields.forEach(function (f) { if (!check(f)) { ok = false; if (!first) first = f; } });
      if (!ok) { first.scrollIntoView({ behavior: "smooth", block: "center" }); var fi = first.querySelector("input,select,textarea"); if (fi) setTimeout(function () { fi.focus({ preventScroll: true }); }, 350); return; }
      var hp = form.querySelector(".hp input"); if (hp && hp.value) return;

      var data = {}, lines = [];
      fields.forEach(function (f) {
        if (!isShown(f)) return;
        var label = f.getAttribute("data-f"), v = valueOf(f);
        if (!v || label === "Consent") return;
        if (inputOf(f).getAttribute("data-check") === "mobile") v = v.replace(/\D/g, "").slice(-10);
        data[label] = v; lines.push(label + ": " + v);
      });
      var topic = data[form.getAttribute("data-topic-field")] || "";
      var route = JSON.parse(form.getAttribute("data-route") || "{}")[topic] || {};
      var email = route.email || form.getAttribute("data-email");
      var wa = route.wa || form.getAttribute("data-wa");
      var waLink = "https://wa.me/" + wa + "?text=" + encodeURIComponent("Hello " + form.getAttribute("data-brand") + ", I filled the form on your website.\n\n" + lines.join("\n"));
      $$("[data-wa-out]", form).forEach(function (a) { a.href = waLink; });

      form.classList.add("sending");
      var payload = Object.assign({ _subject: form.getAttribute("data-subject") + (topic ? " - " + topic : ""), _template: "table", _captcha: "false", Website: location.href.split("?")[0] }, data);
      // With a Google Sheet set up (data-sheet = its Apps Script web app address), responses go to the
      // sheet and the script emails the inbox. Otherwise FormSubmit emails the inbox.
      var sheet = form.getAttribute("data-sheet");
      var req = sheet
        ? fetch(sheet, { method: "POST", mode: "no-cors", body: new URLSearchParams(Object.assign({ _form: form.getAttribute("data-name"), _to: email, _subject: payload._subject }, data, { Page: payload.Website })) })
        : fetch("https://formsubmit.co/ajax/" + email, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(payload) })
            .then(function (r) { return r.json().catch(function () { return {}; }); });
      req.then(function () { finish(true); }, function () { finish(false); });
      function finish(sent) {
        form.classList.remove("sending"); form.classList.add("sent");
        var okP = form.querySelector("[data-sent-ok]"), noP = form.querySelector("[data-sent-fail]");
        if (okP) okP.hidden = !sent; if (noP) noP.hidden = sent;
        form.scrollIntoView({ behavior: "smooth", block: "center" });
        var h = form.querySelector(".done h3"); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
      }
    });
    var again = form.querySelector("[data-again]");
    if (again) again.addEventListener("click", function () { form.reset(); form.classList.remove("sent"); $$(".bad", form).forEach(function (f) { f.classList.remove("bad"); }); refresh(); });
  });

  /* ---------- calculators ---------- */
  var inr = function (n) { return "₹" + Math.round(n).toLocaleString("en-IN"); };
  var words = function (n) { return n >= 1e7 ? "₹" + (n / 1e7).toFixed(2).replace(/\.?0+$/, "") + " crore" : n >= 1e5 ? "₹" + (n / 1e5).toFixed(2).replace(/\.?0+$/, "") + " lakh" : inr(n); };
  function fv(P, r, n) { return r ? P * ((Math.pow(1 + r, n) - 1) / r) * (1 + r) : P * n; }           // SIP, paid at start of month
  function emiOf(L, r, n) { return r ? L * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1) : L / n; }
  function pvOf(E, r, n) { return r ? E * (1 - Math.pow(1 + r, -n)) / r : E * n; }
  var CALC = {
    sip: function (v) { var inv = v.amt * v.yrs * 12, tot = fv(v.amt, v.rate / 1200, v.yrs * 12); return { main: tot, a: inv, b: tot - inv }; },
    lumpsum: function (v) { var tot = v.amt * Math.pow(1 + v.rate / 100, v.yrs); return { main: tot, a: v.amt, b: tot - v.amt }; },
    goal: function (v) { var n = v.yrs * 12, need = v.amt / (fv(1, v.rate / 1200, n)); return { main: need, a: need * n, b: v.amt - need * n, perMonth: true }; },
    emi: function (v) { var n = v.yrs * 12, e = emiOf(v.amt, v.rate / 1200, n); return { main: e, a: v.amt, b: e * n - v.amt, perMonth: true }; },
    elig: function (v) { var room = Math.max(0, v.amt * 0.5 - v.other), loan = pvOf(room, v.rate / 1200, v.yrs * 12); return { main: loan, a: room, b: Math.max(0, v.amt - v.other - room), aMonth: true, bMonth: true, zero: room <= 0 }; },
    gold: function (v) { if (!v.rate) return { empty: "Enter today's gold rate" }; var val = v.amt * v.purity * v.rate, loan = val * v.ltv / 100; return { main: loan, a: loan, b: val - loan }; }
  };
  function tween(el, to, fmt) {
    var from = +el.getAttribute("data-v") || 0, t0 = null; el.setAttribute("data-v", to);
    if (reduceMotion) { el.textContent = fmt(to); return; }
    cancelAnimationFrame(el._raf);
    (function step(now) { if (!t0) t0 = now; var p = Math.min(1, (now - t0) / 350), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(from + (to - from) * e); if (p < 1) el._raf = requestAnimationFrame(step); })(performance.now());
  }
  $$("[data-calc]").forEach(function (box) {
    var tabs = $$(".ctabs button", box), panes = $$(".cpane", box);
    function show(type) {
      tabs.forEach(function (t) { t.setAttribute("aria-selected", String(t.getAttribute("data-tab") === type)); });
      panes.forEach(function (p) { p.hidden = p.getAttribute("data-type") !== type; });
    }
    tabs.forEach(function (t) { t.addEventListener("click", function () { show(t.getAttribute("data-tab")); }); });
    var want = params.get("calc");
    if (want && tabs.some(function (t) { return t.getAttribute("data-tab") === want; })) { show(want); if (box.id === "all-calc") setTimeout(function () { box.scrollIntoView({ block: "start" }); }, 50); }

    panes.forEach(function (pane) {
      var type = pane.getAttribute("data-type");
      var out = { main: $('[data-o="main"]', pane), a: $('[data-o="a"]', pane), b: $('[data-o="b"]', pane) };
      var arcA = $(".arc-a", pane), arcB = $(".arc-b", pane);
      function read() {
        var v = {};
        $$(".cfield", pane).forEach(function (cf) {
          var key = cf.getAttribute("data-key"), sel = $("select", cf), txt = $(".cval input", cf);
          v[key] = sel ? +sel.value : +String(txt.value).replace(/[^\d.]/g, "") || 0;
        });
        return v;
      }
      function paintRange(r) { var p = (r.value - r.min) / (r.max - r.min) * 100; r.style.setProperty("--p", p + "%"); }
      function run() {
        var r = CALC[type](read());
        if (r.empty) { out.main.textContent = r.empty; out.main.removeAttribute("data-v"); out.a.textContent = "–"; out.b.textContent = "–"; arcA.style.strokeDasharray = "0 100"; arcB.style.strokeDasharray = "0 100"; return; }
        var mfmt = function (n) { return (n >= 1e5 ? words(n) : inr(n)) + (r.perMonth ? " / month" : ""); };
        if (r.zero) { out.main.textContent = "Not eligible yet"; out.main.removeAttribute("data-v"); }
        else tween(out.main, r.main, mfmt);
        tween(out.a, r.a, function (n) { return inr(n) + (r.aMonth ? " / month" : ""); });
        tween(out.b, Math.max(0, r.b), function (n) { return inr(n) + (r.bMonth ? " / month" : ""); });
        var tot = Math.max(1, r.a + Math.max(0, r.b)), pa = r.a / tot * 100, pb = 100 - pa;
        arcA.style.strokeDasharray = pa.toFixed(2) + " " + (100 - pa).toFixed(2);
        arcB.style.strokeDasharray = pb.toFixed(2) + " " + (100 - pb).toFixed(2);
        arcB.style.strokeDashoffset = (-pa).toFixed(2);
      }
      $$(".cfield", pane).forEach(function (cf) {
        var range = $("input[type=range]", cf), txt = $(".cval input", cf), sel = $("select", cf);
        if (sel) { sel.addEventListener("change", run); return; }
        var fmt = cf.getAttribute("data-fmt");
        function show(n) { return fmt === "money" ? Math.round(n).toLocaleString("en-IN") : String(n); }
        if (range) {
          txt.value = show(+range.value); paintRange(range);
          range.addEventListener("input", function () { txt.value = show(+range.value); paintRange(range); run(); });
          txt.addEventListener("input", function () {
            var n = +txt.value.replace(/[^\d.]/g, "");
            if (!isNaN(n) && n >= +range.min && n <= +range.max) { range.value = n; paintRange(range); }
            run();
          });
          txt.addEventListener("blur", function () {
            var n = +txt.value.replace(/[^\d.]/g, ""); if (isNaN(n) || !n) n = +range.min;
            n = Math.min(+range.max, Math.max(+range.min, n)); range.value = n; txt.value = show(n); paintRange(range); run();
          });
        } else {
          txt.addEventListener("input", function () { var raw = txt.value.replace(/[^\d.]/g, ""); txt.value = raw ? (+raw).toLocaleString("en-IN") : ""; run(); });
        }
        txt.addEventListener("focus", function () { txt.select(); });
      });
      run();
    });
  });

  /* ---------- risk profile quiz ---------- */
  $$("[data-quiz]").forEach(function (quiz) {
    var PROFILES = [
      [0, "Low risk", "You want to keep your money safe. Plans with steady, lower returns may suit you, such as debt funds and fixed-income options."],
      [6, "Medium risk", "You are fine with some ups and downs for better growth. A mix of equity and debt funds may suit you."],
      [11, "High risk", "You can handle big ups and downs for long-term growth. Equity funds may suit you if you stay invested for many years."]
    ];
    var result = $(".quiz-result", quiz), err = $(".quiz-err", quiz), profile = "";
    $("[data-quiz-go]", quiz).addEventListener("click", function () {
      var sets = $$("fieldset", quiz), total = 0, answered = 0, picks = [];
      sets.forEach(function (fs) { var c = $("input:checked", fs); if (c) { answered++; total += +c.value; picks.push($("legend", fs).textContent.replace(/^\d+\.\s*/, "") + ": " + c.nextElementSibling.textContent); } });
      if (answered < sets.length) { err.hidden = false; result.hidden = true; return; }
      err.hidden = true;
      var p = PROFILES.filter(function (x) { return total >= x[0]; }).pop();
      profile = p[1];
      $('[data-q="name"]', quiz).textContent = p[1];
      $('[data-q="text"]', quiz).textContent = p[2];
      result.hidden = false;
      quiz._picks = picks;
      result.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    $("[data-quiz-send]", quiz).addEventListener("click", function () {
      var f = document.getElementById("invest-form"); if (!f) return;
      var sel = f.querySelector('select[name="type"]');
      if (sel) { $$("option", sel).forEach(function (o) { if (o.value === "Book a consultation") sel.value = o.value; }); sel.dispatchEvent(new Event("change")); }
      var msg = f.querySelector('textarea[name="message"]');
      if (msg) msg.value = "My risk profile: " + profile + "\n" + (quiz._picks || []).join("\n");
    });
  });

  /* ---------- picture viewer ---------- */
  var lb = $(".lightbox");
  function closeLightbox() { if (lb && lb.classList.contains("open")) { lb.classList.remove("open"); document.body.style.overflow = ""; } }
  $$("[data-zoom]").forEach(function (b) {
    b.addEventListener("click", function () {
      $("img", lb).src = b.getAttribute("data-zoom"); $("img", lb).alt = b.getAttribute("data-alt") || "";
      $(".cap", lb).textContent = b.getAttribute("data-alt") || "";
      lb.classList.add("open"); document.body.style.overflow = "hidden"; $(".close", lb).focus();
    });
  });
  if (lb) lb.addEventListener("click", function (e) { if (e.target === lb || e.target.closest(".close")) closeLightbox(); });

  /* ---------- blog: posts come from one text file the client edits (blog/posts.txt) ---------- */
  var lists = $$("[data-blog-list]"), postBody = $("[data-post-body]");
  if (lists.length || postBody) {
    var esc = function (t) { return String(t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
    var slugOf = function (t) { return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); };
    var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    function parseDate(t) {   // 25-10-2026, 25/10/2026 or 2026-10-25
      var m = (t || "").match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/), y, mo, d;
      if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; } else { m = (t || "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); if (!m) return null; y = +m[1]; mo = +m[2]; d = +m[3]; }
      return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? { n: y * 10000 + mo * 100 + d, text: d + " " + MONTHS[mo - 1] + " " + y } : null;
    }
    function inline(t) {
      t = esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      return t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, label, url) {
        if (!/^(https?:|mailto:|tel:|[\w.\-\/#?=&%]+$)/i.test(url) || /^javascript:/i.test(url)) return label;
        return '<a href="' + url + '"' + (/^https?:/i.test(url) ? ' target="_blank" rel="noopener"' : "") + ">" + label + "</a>";
      });
    }
    function toHtml(text) {   // the small set of rules explained in posts.txt
      var out = [], para = [], list = null;
      function flush() {
        if (para.length) { out.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; }
        if (list) { out.push("<" + list.tag + ">" + list.items.map(function (i) { return "<li>" + inline(i) + "</li>"; }).join("") + "</" + list.tag + ">"); list = null; }
      }
      text.split(/\r?\n/).forEach(function (line) {
        var s = line.trim(), ul = s.match(/^[-*•]\s+(.*)/), ol = s.match(/^\d+[.)]\s+(.*)/);
        if (!s) flush();
        else if (/^###\s/.test(s)) { flush(); out.push("<h3>" + inline(s.replace(/^###\s+/, "")) + "</h3>"); }
        else if (/^##\s/.test(s)) { flush(); out.push("<h2>" + inline(s.replace(/^##\s+/, "")) + "</h2>"); }
        else if (ul || ol) {
          var tag = ul ? "ul" : "ol";
          if (para.length || (list && list.tag !== tag)) flush();
          if (!list) list = { tag: tag, items: [] };
          list.items.push((ul || ol)[1]);
        } else { if (list) flush(); para.push(s); }
      });
      flush();
      return out.join("\n");
    }
    function parse(txt) {
      txt = txt.replace(/^﻿/, "").replace(/\r\n?/g, "\n");   // files saved on Windows (Notepad) use \r\n line endings
      var start = txt.search(/START OF POSTS/i);
      if (start > -1) txt = txt.slice(txt.indexOf("\n", start) + 1);
      var posts = [];
      txt.split(/^\s*={5,}\s*$/m).forEach(function (chunk) {
        if (!chunk.trim()) return;
        var parts = chunk.split(/^\s*-{5,}\s*$/m), head = parts.shift() || "", body = parts.join("\n-----\n");
        var meta = {};
        head.split(/\r?\n/).forEach(function (l) { var m = l.match(/^\s*(Title|Date|Summary|Photo)\s*:\s*(.*)$/i); if (m) meta[m[1].toLowerCase()] = m[2].trim(); });
        if (!meta.title) return;
        var date = parseDate(meta.date), words = (body.match(/\w+/g) || []).length;
        posts.push({ title: meta.title, summary: meta.summary || "", photo: (meta.photo || "").replace(/[^\w.\-]/g, ""), slug: slugOf(meta.title),
                     date: date ? date.text : "", sort: date ? date.n : 0, minutes: Math.max(1, Math.ceil(words / 150)), body: body });
      });
      return posts.sort(function (a, b) { return b.sort - a.sort; });
    }
    var current = params.get("post") || "";
    function card(p) {
      var icon = $("#post-icon"), arrow = ($("#post-arrow") || {}).innerHTML || "", top = p.photo ? '<img class="cover" src="blog/images/' + esc(p.photo) + '" alt="" loading="lazy">' : (icon ? icon.innerHTML : "");
      return '<a class="card post" href="blog-post.html?post=' + encodeURIComponent(p.slug) + '">' + top +
        '<small class="meta">' + esc(p.date) + (p.date ? " · " : "") + p.minutes + ' min read</small><h3>' + esc(p.title) + "</h3><p>" + esc(p.summary) +
        '</p><span class="link go">Read more ' + arrow + '</span></a>';
    }
    fetch("blog/posts.txt", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw 0; return r.text(); }).then(function (txt) {
      var posts = parse(txt);
      lists.forEach(function (box) {
        var list = posts.filter(function (p) { return !(box.hasAttribute("data-exclude-current") && p.slug === current); });
        var lim = +box.getAttribute("data-limit") || 0;
        if (lim) list = list.slice(0, lim);
        box.innerHTML = list.length ? list.map(card).join("") : '<p class="blog-msg">No posts yet.</p>';
        if (!list.length && box.hasAttribute("data-exclude-current")) box.closest("section").hidden = true;
        if (!list.length && lim && !box.hasAttribute("data-exclude-current")) box.closest("section").hidden = true;   // home page: hide the empty blog strip
      });
      if (postBody) {
        var p = posts.filter(function (x) { return x.slug === current; })[0], h1 = $("[data-post-title]"), meta = $("[data-post-meta] span");
        if (!p) { h1.textContent = "Post not found"; postBody.innerHTML = '<p>This post was not found. <a href="blog.html">See all posts</a>.</p>'; return; }
        h1.textContent = p.title; meta.textContent = (p.date ? p.date + " · " : "") + p.minutes + " min read";
        document.title = p.title + " — " + postBody.getAttribute("data-site");
        var d = $('meta[name="description"]'); if (d && p.summary) d.setAttribute("content", p.summary);
        postBody.innerHTML = (p.photo ? '<img class="cover" src="blog/images/' + esc(p.photo) + '" alt="">' : "") + toHtml(p.body);
      }
    }).catch(function () {
      lists.forEach(function (box) { box.innerHTML = '<p class="blog-msg">Could not load the posts. Please refresh the page.</p>'; });
      if (postBody) { $("[data-post-title]").textContent = "Could not load this post"; postBody.innerHTML = '<p>Please refresh the page.</p>'; }
    });
  }
})();
