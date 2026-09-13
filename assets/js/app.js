/* Lurith — site interactivity */
(function () {
  "use strict";

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  var DISCORD_URL = "https://discord.gg/XSYDVYbqNz";

  /* ----------------------------------------------------------------
   * Toast
   * ---------------------------------------------------------------- */
  var toastEl = $("#toast");
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2200);
  }

  /* ----------------------------------------------------------------
   * Nav: scrolled state + burger
   * ---------------------------------------------------------------- */
  var nav = $("#nav");
  var burger = $("#navBurger");
  var mobileMenu = $("#mobileMenu");

  function onScroll() {
    if (window.scrollY > 12) nav.classList.add("scrolled");
    else nav.classList.remove("scrolled");
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  burger.addEventListener("click", function () {
    var open = mobileMenu.classList.toggle("open");
    nav.classList.toggle("open", open);
  });
  $$(".mobile-menu a").forEach(function (a) {
    a.addEventListener("click", function () {
      mobileMenu.classList.remove("open");
      nav.classList.remove("open");
    });
  });

  /* ----------------------------------------------------------------
   * Reveal on scroll
   * ---------------------------------------------------------------- */
  var rvEls = $$(".rv");
  if ("IntersectionObserver" in window) {
    var rvObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); rvObs.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    rvEls.forEach(function (el) { rvObs.observe(el); });
  } else {
    rvEls.forEach(function (el) { el.classList.add("in"); });
  }

  /* ----------------------------------------------------------------
   * Stats counters
   * ---------------------------------------------------------------- */
  var counters = $$("[data-count]");
  function animateCounter(el) {
    var target = parseInt(el.getAttribute("data-count"), 10);
    var dur = 1100;
    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if ("IntersectionObserver" in window) {
    var cObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { animateCounter(e.target); cObs.unobserve(e.target); }
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { cObs.observe(el); });
  } else {
    counters.forEach(function (el) { el.textContent = el.getAttribute("data-count"); });
  }

  /* ----------------------------------------------------------------
   * Scrollspy (nav + docs)
   * ---------------------------------------------------------------- */
  var navLinks = $$("#navLinks a, .brand[data-nav]");
  var docLinks = $$("#docsNav a");
  var spySections = $$("section[id], div[id]");

  var sectionMap = {};
  spySections.forEach(function (s) {
    if (s.id) sectionMap[s.id] = s;
  });

  function setActive(ids, links, id) {
    links.forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-nav") === id || a.getAttribute("data-doc") === id);
    });
  }

  function spy() {
    var pos = window.scrollY + 120;
    var current = null;
    Object.keys(sectionMap).forEach(function (id) {
      var el = sectionMap[id];
      if (el.offsetTop <= pos) current = id;
    });
    if (current) {
      setActive([], navLinks, current);
      setActive([], docLinks, current);
    }
  }
  window.addEventListener("scroll", spy, { passive: true });

  // doc headings spy (h2s inside docs content)
  var docHeadings = $$(".docs-content h2[id]");
  var docObs = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        docLinks.forEach(function (a) {
          a.classList.toggle("active", a.getAttribute("data-doc") === e.target.id);
        });
      }
    });
  }, { rootMargin: "-20% 0px -70% 0px" });
  docHeadings.forEach(function (h) { docObs.observe(h); });

  /* ----------------------------------------------------------------
   * Hero code typing animation
   * ---------------------------------------------------------------- */
  var heroCode = $("#heroCode");
  var codeStage = $("#codeStage");
  var heroSrc = [
    "--!strict",
    "local Players = game:GetService(\"Players\")",
    "",
    "local function onJoin(player: Player)",
    "    local display = player.DisplayName",
    "    local msg = string.format(\"Welcome, %s!\", display)",
    "    for i = 1, 3 do",
    "        msg = msg .. \"!\"",
    "    end",
    "    return msg",
    "end",
    "",
    "Players.PlayerAdded:Connect(function(player)",
    "    print(onJoin(player))",
    "end)"
  ].join("\n");

  var heroObf = (typeof LurithWeb !== "undefined")
    ? LurithWeb.obfuscate(heroSrc, { level: "high", decoys: 1 }).code
    : heroSrc;

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // lightweight lua syntax highlighter (cosmetic)
  var LUA_RE = [
    [/--\[\[[\s\S]*?\]\]|--[^\n]*/g, "tok-cmt"],
    [/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, "tok-str"],
    [/\b(local|function|end|if|then|else|elseif|for|in|do|while|repeat|until|return|break|not|and|or|nil|true|false|goto|continue|type|export)\b/g, "tok-kw"],
    [/\b\d+(?:\.\d+)?\b/g, "tok-num"],
    [/\b(game|string|table|math|print|pairs|ipairs|tostring|tonumber|setmetatable|require|pcall|wait|task|workspace|script)\s*(?=\()/g, "tok-fn"]
  ];
  function highlightLua(code) {
    var html = escapeHtml(code);
    LUA_RE.forEach(function (pair) {
      html = html.replace(pair[0], function (m) { return '<span class="' + pair[1] + '">' + m + "</span>"; });
    });
    return html;
  }

  var typeTimer = null;
  function typeText(el, text, plain, speed, done) {
    clearTimeout(typeTimer);
    var i = 0;
    el.innerHTML = "";
    var cursor = '<span class="cursor"></span>';
    function tick() {
      if (i <= text.length) {
        var shown = text.slice(0, i);
        el.innerHTML = (plain ? escapeHtml(shown) : highlightLua(shown)) + cursor;
        i++;
        typeTimer = setTimeout(tick, speed);
      } else {
        el.innerHTML = plain ? escapeHtml(text) + cursor : highlightLua(text) + cursor;
        if (done) setTimeout(done, 900);
      }
    }
    tick();
  }

  function heroLoop() {
    codeStage.textContent = "source";
    typeText(heroCode, heroSrc, false, 14, function () {
      codeStage.textContent = "obfuscated → .lurith.txt";
      // One pass only: the endless re-type loop hammered the CPU on phones.
      typeText(heroCode, heroObf, true, 9, function () {});
    });
  }
  if (heroCode) heroLoop();

  /* ----------------------------------------------------------------
   * Demo
   * ---------------------------------------------------------------- */
  var input = $("#codeInput");
  var outBody = $("#outBody");
  var wmLine = $("#wmLine");
  var levelSeg = $("#levelSeg");
  var currentLevel = "high";

  var optNumbers = $("#optNumbers");
  var optStrings = $("#optStrings");
  var optRename = $("#optRename");
  var optWatermark = $("#optWatermark");

  levelSeg.addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-level]");
    if (!btn) return;
    $$("#levelSeg button").forEach(function (b) { b.classList.remove("on"); });
    btn.classList.add("on");
    currentLevel = btn.getAttribute("data-level");
    $("#inLevel").textContent = currentLevel;
  });

  function updateInputStats() {
    var v = input.value;
    $("#inLines").textContent = v ? v.split("\n").length : 0;
    $("#inBytes").textContent = new Blob([v]).size;
  }
  input.addEventListener("input", updateInputStats);

  $("#loadSample").addEventListener("click", function () {
    input.value = (typeof LurithWeb !== "undefined") ? LurithWeb.sample : "";
    updateInputStats();
    toast("Sample loaded");
  });

  $("#clearInput").addEventListener("click", function () {
    input.value = "";
    updateInputStats();
    input.focus();
  });

  function renderResult(fullSource, inputBytes, outputBytes, note) {
    var body = fullSource;
    var wmMatch = fullSource.match(/-- \[(?:Obfuscated using|obfuscated by) Lurith[^\r\n]*\]/);
    if (wmMatch) {
      var wmText = wmMatch[0];
      var idx = fullSource.indexOf(wmText);
      var before = fullSource.slice(0, idx).replace(/\n+$/, "");
      var after = fullSource.slice(idx + wmText.length).replace(/^\r?\n/, "");
      body = (before ? before + "\n" : "") + after;
      wmLine.textContent = wmText;
      wmLine.style.display = "block";
    } else {
      wmLine.style.display = "none";
    }
    outBody.textContent = body;
    outBody.style.color = "#d7d7e6";

    $("#outLines").textContent = body.split("\n").length;
    $("#outBytes").textContent = outputBytes != null ? outputBytes : new Blob([body]).size;
    var delta = (outputBytes != null ? outputBytes : 0) - (inputBytes != null ? inputBytes : 0);
    $("#outDelta").textContent = (delta >= 0 ? "+" : "") + delta + " B";
    toast(note);
  }

  function runBrowser(src) {
    var result;
    try {
      result = LurithWeb.obfuscate(src, {
        level: currentLevel,
        numbers: optNumbers.checked,
        strings: optStrings.checked,
        rename: optRename.checked,
        watermark: optWatermark.checked
      });
    } catch (err) {
      toast("Couldn't process that source: " + err.message);
      return;
    }
    renderResult(result.code, result.stats.inputBytes, result.stats.outputBytes, "Obfuscated with " + currentLevel);
  }

  function run() {
    var src = input.value;
    if (!src.trim()) { toast("Paste some code first"); input.focus(); return; }

    if (typeof LurithWeb === "undefined") {
      toast("Obfuscation engine failed to load");
      return;
    }
    runBrowser(src);
  }

  $("#runObf").addEventListener("click", run);

  function currentOutput() {
    var wm = wmLine.style.display === "none" ? "" : wmLine.textContent + "\n";
    return wm + outBody.textContent;
  }

  $("#copyOutput").addEventListener("click", function () {
    var text = currentOutput();
    if (!text.trim()) { toast("Nothing to copy yet"); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast("Copied to clipboard"); },
        function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
  });

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); toast("Copied to clipboard"); }
    catch (e) { toast("Copy failed — select the text manually"); }
    document.body.removeChild(ta);
  }

  $("#downloadOutput").addEventListener("click", function () {
    var text = currentOutput();
    if (!text.trim()) { toast("Nothing to download yet"); return; }
    var blob = new Blob([text], { type: "text/plain" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "obfuscated.lurith.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
    toast("Downloading obfuscated.lurith.txt");
  });

  // ctrl/cmd+enter runs obfuscation
  input.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); run(); }
  });

  /* ----------------------------------------------------------------
   * FAQ accordion
   * ---------------------------------------------------------------- */
  $$(".faq-item").forEach(function (item) {
    var q = item.querySelector(".faq-q");
    var a = item.querySelector(".faq-a");
    q.addEventListener("click", function () {
      var isOpen = item.classList.contains("open");
      // close all
      $$(".faq-item").forEach(function (i) {
        i.classList.remove("open");
        i.querySelector(".faq-a").style.maxHeight = null;
      });
      if (!isOpen) {
        item.classList.add("open");
        a.style.maxHeight = a.scrollHeight + "px";
      }
    });
  });
  // set initial open item height
  $$(".faq-item.open .faq-a").forEach(function (a) {
    a.style.maxHeight = a.scrollHeight + "px";
  });

  /* ----------------------------------------------------------------
   * Code-block copy buttons
   * ---------------------------------------------------------------- */
  $$(".cb-copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var code = btn.closest(".code-block").querySelector("code");
      var text = code ? code.textContent : "";
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          btn.textContent = "Copied!";
          setTimeout(function () { btn.textContent = "Copy"; }, 1500);
        });
      } else {
        fallbackCopy(text);
        btn.textContent = "Copied!";
        setTimeout(function () { btn.textContent = "Copy"; }, 1500);
      }
    });
  });

  /* ----------------------------------------------------------------
   * Prefill demo from a #demo click after engine load
   * ---------------------------------------------------------------- */
  if (input && !input.value && typeof LurithWeb !== "undefined") {
    input.value = LurithWeb.sample;
    updateInputStats();
  }
})();
