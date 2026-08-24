/* Split — instrument atmosphere. Vanilla. No modules. */
(function () {
  "use strict";

  var reduced = false;
  try {
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  function $(id) {
    return document.getElementById(id);
  }

  function dismissIntro() {
    var intro = $("intro");
    if (!intro || intro.hidden) return;
    intro.classList.add("out");
    document.body.classList.remove("introing");
    window.setTimeout(function () {
      intro.hidden = true;
    }, reduced ? 0 : 380);
    try {
      sessionStorage.setItem("split.intro.v1", "1");
    } catch (e) {}
  }

  function bootIntro() {
    var intro = $("intro");
    if (!intro) return;
    var seen = false;
    try {
      seen = sessionStorage.getItem("split.intro.v1") === "1";
    } catch (e) {}
    if (reduced || seen) {
      intro.hidden = true;
      document.body.classList.remove("introing");
      return;
    }
    document.body.classList.add("introing");
    var skip = $("intro-skip");
    if (skip) skip.addEventListener("click", dismissIntro);
    window.setTimeout(dismissIntro, 1500);
  }

  function phaseWord(p) {
    if (p === "calibrating") return "CALIBRATING";
    if (p === "armed") return "ARMED";
    if (p === "running") return "LIVE";
    if (p === "done") return "TAPED";
    if (p === "live") return "LINE";
    if (p === "blocked") return "FILE://";
    return "STANDBY";
  }

  function calMs() {
    try {
      var setup = window.SplitApp && SplitApp.setup && SplitApp.setup();
      if (setup && setup.detect && isFinite(setup.detect.calibrateMs)) {
        return Math.max(200, setup.detect.calibrateMs);
      }
    } catch (e) {}
    return 1000;
  }

  function syncPhase() {
    var phase = document.body.getAttribute("data-phase") || "boot";
    var el = $("phase-readout");
    if (el) el.textContent = phaseWord(phase);
    document.body.style.setProperty("--cal-ms", calMs() + "ms");

    var stage = $("stage");
    if (stage && window.SplitLine) {
      stage.classList.toggle("lined", !!SplitLine.placed);
    }

    var coord = $("stage-coord");
    if (coord && window.SplitLine) {
      var t = SplitLine.placed ? SplitLine.t : 0.5;
      var axis = SplitLine.orientation === "vertical" ? "x" : "y";
      var label = SplitLine.placed ? axis + " " + t.toFixed(3) : "tap to place";
      if (coord.textContent !== label) coord.textContent = label;
    }

    var samples = $("stage-samples");
    if (samples && window.SplitLine) {
      var n = SplitLine.sampleN || 64;
      var next = n + " luma";
      if (samples.textContent !== next) samples.textContent = next;
    }
  }

  function sizeTape() {
    var c = $("tape");
    if (!c) return;
    var r = c.getBoundingClientRect();
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = Math.max(1, Math.round(r.width * dpr));
    var h = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
  }

  function drawTape() {
    var c = $("tape");
    if (!c) return;
    var ctx = c.getContext("2d");
    if (!ctx) return;
    var w = c.width;
    var h = c.height;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(244,244,241,0.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(h * 0.5) + 0.5);
    ctx.lineTo(w, Math.round(h * 0.5) + 0.5);
    ctx.stroke();

    var profile = window.SplitLine && SplitLine.profile;
    var energy = 0;
    var threshold = 18;
    try {
      if (window.SplitApp && SplitApp.state) {
        energy = SplitApp.state.energy || 0;
        threshold = SplitApp.state.threshold || 18;
      }
    } catch (e) {}

    var hot = energy >= threshold;
    if (!profile || !profile.length) {
      ctx.fillStyle = "rgba(232,255,61,0.18)";
      var g;
      for (g = 0; g < 64; g++) {
        var bx = (g / 64) * w;
        ctx.fillRect(bx, h * 0.5 - 1, Math.max(1, w / 90), 2);
      }
      return;
    }

    var n = profile.length;
    var i;
    ctx.beginPath();
    for (i = 0; i < n; i++) {
      var x = (i / (n - 1)) * w;
      var y = h - (profile[i] / 255) * (h - 2) - 1;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = hot ? "#ffffff" : "rgba(232,255,61,0.82)";
    ctx.lineWidth = hot ? 2 : 1.25;
    ctx.stroke();
  }

  function watchHit() {
    var stage = $("stage");
    if (!stage) return;
    var obs = new MutationObserver(function () {
      document.body.classList.toggle("hit", stage.classList.contains("hit"));
    });
    obs.observe(stage, { attributes: true, attributeFilter: ["class"] });
  }

  function bindPointer() {
    var stage = $("stage");
    if (!stage) return;
    stage.addEventListener(
      "pointermove",
      function (ev) {
        if (reduced) return;
        var r = stage.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var x = ((ev.clientX - r.left) / r.width) * 100;
        var y = ((ev.clientY - r.top) / r.height) * 100;
        stage.style.setProperty("--px", x.toFixed(2) + "%");
        stage.style.setProperty("--py", y.toFixed(2) + "%");
      },
      { passive: true }
    );
  }

  function loop() {
    syncPhase();
    drawTape();
    window.requestAnimationFrame(loop);
  }

  function start() {
    bootIntro();
    sizeTape();
    bindPointer();
    watchHit();
    window.addEventListener("resize", sizeTape);
    var obs = new MutationObserver(syncPhase);
    obs.observe(document.body, { attributes: true, attributeFilter: ["data-phase"] });
    window.requestAnimationFrame(loop);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
