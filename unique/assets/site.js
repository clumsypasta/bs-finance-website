/* Shared behaviour for the partner sites. No libraries. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- desktop dropdown menus ---------- */
  var dds = $$(".dd");
  function closeAll(except) { dds.forEach(function (d) { if (d !== except) { d.classList.remove("open"); d.firstElementChild.setAttribute("aria-expanded", "false"); } }); }
  dds.forEach(function (dd) {
    var btn = dd.firstElementChild, timer;
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      // With a mouse, hovering has already opened the menu, so a click must not shut it
      // again. On touch screens a tap toggles.
      var hover = window.matchMedia("(hover:hover)").matches && e.detail > 0;
      var open = hover ? true : !dd.classList.contains("open");
      closeAll(dd);
      dd.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", String(open));
    });
    // open on hover for mouse users, with a short grace period when leaving
    dd.addEventListener("mouseenter", function () {
      if (!window.matchMedia("(hover:hover)").matches) return;
      clearTimeout(timer); closeAll(dd); dd.classList.add("open"); btn.setAttribute("aria-expanded", "true");
    });
    dd.addEventListener("mouseleave", function () {
      if (!window.matchMedia("(hover:hover)").matches) return;
      timer = setTimeout(function () { dd.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }, 180);
    });
  });
  document.addEventListener("click", function (e) { if (!e.target.closest(".dd")) closeAll(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeAll(); closeDrawer(); closeLightbox(); } });

  /* ---------- mobile drawer ---------- */
  var drawer = $(".drawer"), burger = $(".burger");
  function openDrawer() { if (!drawer) return; drawer.classList.add("open"); document.body.style.overflow = "hidden"; burger.setAttribute("aria-expanded", "true"); var c = $(".drawer .close"); if (c) c.focus(); }
  function closeDrawer() { if (!drawer || !drawer.classList.contains("open")) return; drawer.classList.remove("open"); document.body.style.overflow = ""; burger.setAttribute("aria-expanded", "false"); }
  if (burger) burger.addEventListener("click", openDrawer);
  $$(".drawer .close, .drawer .shade").forEach(function (el) { el.addEventListener("click", closeDrawer); });
  $$(".drawer a").forEach(function (a) { a.addEventListener("click", closeDrawer); });
  window.addEventListener("resize", function () { if (window.innerWidth > 1180) closeDrawer(); });

  /* ---------- footer year ---------- */
  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------- forms ---------- */
  var RULES = {
    name: function (v) { return /^[A-Za-zऀ-ॿ][A-Za-zऀ-ॿ .'-]{1,59}$/.test(v) ? "" : (v ? "Please write your name using letters only." : "Please enter your name."); },
    mobile: function (v) { var d = v.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, ""); return /^[6-9]\d{9}$/.test(d) ? "" : (v ? "Enter a 10-digit mobile number, starting with 6, 7, 8 or 9." : "Please enter your mobile number."); },
    email: function (v, req) { if (!v) return req ? "Please enter your email." : ""; return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v) ? "" : "Please check your email. Example: name@gmail.com"; },
    city: function (v) { return /^[A-Za-zऀ-ॿ][A-Za-zऀ-ॿ .-]{1,49}$/.test(v) ? "" : (v ? "Please write your city using letters only." : "Please enter your city."); },
    pin: function (v, req) { if (!v) return req ? "Please enter your PIN code." : ""; return /^[1-9]\d{5}$/.test(v) ? "" : "PIN code must be 6 digits."; },
    text: function (v, req) { if (!v.trim()) return req ? "Please fill this in." : ""; return v.length > 1500 ? "Please keep this under 1500 letters." : ""; },
    select: function (v) { return v ? "" : "Please choose one option."; },
    choice: function (v) { return v ? "" : "Please choose one option."; },
    consent: function (v) { return v ? "" : "Please tick this box so we can contact you."; },
    amount: function (v, req) { if (!v) return req ? "Please enter the amount." : ""; var n = +v.replace(/[^\d]/g, ""); return n >= 10000 && n <= 500000000 ? "" : "Enter an amount in rupees, like 500000."; }
  };
  function fieldValue(f) {
    var inp = f.querySelector("[data-check]");
    var type = inp.getAttribute("data-check");
    if (type === "choice") { var c = f.querySelector("input:checked"); return c ? c.value : ""; }
    if (type === "consent") return inp.checked ? "yes" : "";
    return inp.value.trim();
  }
  function checkField(f) {
    var inp = f.querySelector("[data-check]");
    var msg = RULES[inp.getAttribute("data-check")](fieldValue(f), inp.hasAttribute("required") || inp.getAttribute("data-required") === "1");
    f.classList.toggle("bad", !!msg);
    var e = f.querySelector(".err span"); if (e) e.textContent = msg;
    return !msg;
  }
  // mobile inputs: digits only, max 10
  $$('input[data-check=mobile], input[data-check=pin]').forEach(function (i) {
    i.addEventListener("input", function () { var max = i.getAttribute("data-check") === "pin" ? 6 : 10; i.value = i.value.replace(/\D/g, "").slice(0, max); });
  });
  $$('input[data-check=amount]').forEach(function (i) { i.addEventListener("input", function () { i.value = i.value.replace(/[^\d]/g, "").slice(0, 10); }); });

  $$("form[data-form]").forEach(function (form) {
    var fields = $$(".field[data-f], .consent-wrap[data-f]", form);
    fields.forEach(function (f) {
      var ev = f.querySelector("[data-check=choice], [data-check=consent], select") ? "change" : "blur";
      f.addEventListener(ev, function () { checkField(f); }, true);
      f.addEventListener("input", function () { if (f.classList.contains("bad")) checkField(f); });
    });
    // preselect a topic from ?topic=
    var want = new URLSearchParams(location.search).get("topic");
    if (want) {
      var opt = $$('input[type=radio]', form).filter(function (r) { return r.value.toLowerCase() === want.toLowerCase(); })[0];
      if (opt) opt.checked = true;
      var sel = $$("select", form).filter(function (s) { return $$("option", s).some(function (o) { return o.value.toLowerCase() === want.toLowerCase(); }); })[0];
      if (sel) $$("option", sel).forEach(function (o) { if (o.value.toLowerCase() === want.toLowerCase()) sel.value = o.value; });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var ok = true, first = null;
      fields.forEach(function (f) { if (!checkField(f)) { ok = false; if (!first) first = f; } });
      if (!ok) { first.scrollIntoView({ behavior: "smooth", block: "center" }); var fi = first.querySelector("input,select,textarea"); if (fi) setTimeout(function () { fi.focus({ preventScroll: true }); }, 350); return; }
      if (form.querySelector(".hp input") && form.querySelector(".hp input").value) return; // bot

      // collect answers in order
      var data = {}, lines = [];
      fields.forEach(function (f) {
        var label = f.getAttribute("data-f"); var v = fieldValue(f);
        if (!v || label === "Consent") return;
        if (f.querySelector("[data-check=mobile]")) v = v.replace(/\D/g, "").slice(-10);
        data[label] = v; lines.push(label + ": " + v);
      });
      var topic = data[form.getAttribute("data-topic-field") || "Topic"] || "";
      var map = JSON.parse(form.getAttribute("data-route") || "{}");
      var route = map[topic] || {};
      var email = route.email || form.getAttribute("data-email");
      var wa = route.wa || form.getAttribute("data-wa");
      var brand = form.getAttribute("data-brand");
      var subject = form.getAttribute("data-subject") + (topic ? " — " + topic : "");

      var waText = "Hello " + brand + ", I filled the form on your website.\n\n" + lines.join("\n");
      var waLink = "https://wa.me/" + wa + "?text=" + encodeURIComponent(waText);
      $$("[data-wa-out]", form).forEach(function (a) { a.href = waLink; });

      form.classList.add("sending");
      var payload = Object.assign({ _subject: subject, _template: "table", _captcha: "false", Website: location.href.split("?")[0] }, data);
      fetch("https://formsubmit.co/ajax/" + email, {
        method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(payload)
      }).then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function () { finish(true); })
        .catch(function () { finish(false); });
      function finish(sent) {
        form.classList.remove("sending");
        form.classList.add("sent");
        var ok = form.querySelector("[data-sent-ok]"), no = form.querySelector("[data-sent-fail]");
        if (ok) ok.hidden = !sent; if (no) no.hidden = sent;
        form.scrollIntoView({ behavior: "smooth", block: "center" });
        var h = form.querySelector(".done h3"); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
      }
    });
    var again = form.querySelector("[data-again]");
    if (again) again.addEventListener("click", function () { form.reset(); form.classList.remove("sent"); $$(".bad", form).forEach(function (f) { f.classList.remove("bad"); }); });
  });

  /* ---------- calculators ---------- */
  var inr = function (n) { return "₹" + Math.round(n).toLocaleString("en-IN"); };
  var short = function (n) { return n >= 1e7 ? "₹" + (n / 1e7).toFixed(2).replace(/\.00$/, "") + " crore" : n >= 1e5 ? "₹" + (n / 1e5).toFixed(2).replace(/\.00$/, "") + " lakh" : inr(n); };
  $$("[data-calc]").forEach(function (box) {
    var tabs = $$(".tabs button", box), panes = $$("[data-pane]", box);
    tabs.forEach(function (t) {
      t.addEventListener("click", function () {
        tabs.forEach(function (x) { x.setAttribute("aria-selected", String(x === t)); });
        panes.forEach(function (p) { p.hidden = p.getAttribute("data-pane") !== t.getAttribute("data-tab"); });
      });
    });
    function val(n) { return +box.querySelector('[name="' + n + '"]').value; }
    function show(n, text) { $$('[data-o="' + n + '"]', box).forEach(function (o) { o.textContent = text; }); }
    function bar(name, a, b) { var t = a + b || 1; var el = box.querySelector('[data-bar="' + name + '"]'); if (el) { el.children[0].style.width = (a / t * 100) + "%"; el.children[1].style.width = (b / t * 100) + "%"; } }
    function run() {
      // SIP: monthly amount P for n months at r per month, paid at the start of each month
      var P = val("sip_amt"), yrs = val("sip_yrs"), rate = val("sip_rate");
      var r = rate / 1200, n = yrs * 12;
      var fv = P * ((Math.pow(1 + r, n) - 1) / r) * (1 + r), inv = P * n;
      show("sip_amt", inr(P)); show("sip_yrs", yrs + (yrs === 1 ? " year" : " years")); show("sip_rate", rate + "% a year");
      show("sip_fv", short(fv)); show("sip_inv", inr(inv)); show("sip_gain", inr(fv - inv)); bar("sip", inv, fv - inv);
      // Goal: monthly SIP needed to reach goal G
      var G = val("goal_amt"), gy = val("goal_yrs"), gr = val("goal_rate");
      var gr1 = gr / 1200, gn = gy * 12;
      var need = G / (((Math.pow(1 + gr1, gn) - 1) / gr1) * (1 + gr1));
      show("goal_amt", short(G)); show("goal_yrs", gy + (gy === 1 ? " year" : " years")); show("goal_rate", gr + "% a year");
      show("goal_need", inr(need)); show("goal_inv", inr(need * gn)); show("goal_gain", inr(G - need * gn)); bar("goal", need * gn, G - need * gn);
      // EMI
      var L = val("emi_amt"), ey = val("emi_yrs"), er = val("emi_rate");
      var m = er / 1200, k = ey * 12;
      var emi = L * m * Math.pow(1 + m, k) / (Math.pow(1 + m, k) - 1), total = emi * k;
      show("emi_amt", short(L)); show("emi_yrs", ey + (ey === 1 ? " year" : " years")); show("emi_rate", er + "% a year");
      show("emi_out", inr(emi)); show("emi_int", inr(total - L)); show("emi_total", inr(total)); bar("emi", L, total - L);
    }
    $$("input[type=range]", box).forEach(function (i) { i.addEventListener("input", run); });
    run();
  });

  /* ---------- lightbox ---------- */
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
})();
