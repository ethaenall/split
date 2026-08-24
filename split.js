/* Split — camera, arm, detect, clock, even-split math. Vanilla. No modules. */
(function (global) {
  "use strict";

  var DEBOUNCE_MS = 800;
  var CALIBRATE_MS = 1000;
  var FLASH_MS = 240;
  var BASELINE_EMA = 0.08;
  var SPIKE_FRAMES = 2;

  var EVENTS = {
    "800": {
      id: "800",
      label: "800",
      planned: 2,
      defaultMark: "FINISH",
      defaultGoal: "2:07.04",
      names: function (mark) {
        if (mark === "FINISH") return ["400", "800"];
        return ["200", "600"];
      }
    },
    "400": {
      id: "400",
      label: "400",
      planned: 1,
      defaultMark: "FINISH",
      defaultGoal: "0:55.25",
      names: function (mark) {
        if (mark === "FINISH") return ["400"];
        return ["200"];
      }
    },
    "200": {
      id: "200",
      label: "200-repeat",
      planned: 4,
      defaultMark: "200",
      defaultGoal: "",
      names: function (_mark, planned) {
        var out = [];
        var i;
        for (i = 0; i < planned; i++) out.push("200 #" + (i + 1));
        return out;
      }
    }
  };

  function $(id) {
    return document.getElementById(id);
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return "0:00.00";
    var totalCs = Math.round(sec * 100);
    var neg = totalCs < 0;
    if (neg) totalCs = -totalCs;
    var cs = totalCs % 100;
    var totalSec = (totalCs - cs) / 100;
    var s = totalSec % 60;
    var m = (totalSec - s) / 60;
    return (neg ? "-" : "") + m + ":" + pad2(s) + "." + pad2(cs);
  }

  function formatSigned(sec) {
    if (!isFinite(sec)) return "—";
    if (Math.abs(sec) < 0.005) return "0:00.00";
    return (sec > 0 ? "+" : "−") + formatTime(Math.abs(sec));
  }

  function parseGoal(str) {
    if (str == null) return NaN;
    var t = String(str).trim();
    if (!t) return NaN;
    var m = t.match(/^(-)?(?:(\d+):)?(\d+)(?:\.(\d{1,2}))?$/);
    if (!m) return NaN;
    var sign = m[1] ? -1 : 1;
    var minutes = m[2] ? parseInt(m[2], 10) : 0;
    var seconds = parseInt(m[3], 10);
    var frac = m[4] ? parseInt((m[4] + "00").slice(0, 2), 10) / 100 : 0;
    return sign * (minutes * 60 + seconds + frac);
  }

  function evenSplit(goalSec, planned) {
    if (!isFinite(goalSec) || planned <= 0) return NaN;
    return goalSec / planned;
  }

  function nextMust(goalSec, elapsed, crossingsLeft) {
    if (!isFinite(goalSec) || crossingsLeft <= 0) return NaN;
    return (goalSec - elapsed) / crossingsLeft;
  }

  var state = {
    phase: "boot",
    eventId: "800",
    mark: "FINISH",
    planned: 2,
    goalSec: 127.04,
    goalText: "2:07.04",
    threshold: 18,
    stream: null,
    raf: 0,
    cal: null,
    calFrames: 0,
    calUntil: 0,
    armedAt: 0,
    lastTick: 0,
    elapsed: 0,
    running: false,
    crossings: [],
    lastDetectAt: 0,
    spikeRun: 0,
    energy: 0,
    overlayDirty: true,
    source: "camera",
    fileUrl: null,
    fileName: null,
    mediaT0: 0,
    syncBusy: false
  };

  function eventDef() {
    return EVENTS[state.eventId];
  }

  function splitName(index) {
    var ev = eventDef();
    var names = ev.names(state.mark, state.planned);
    return names[index] || String(index + 1);
  }

  function geometryNote() {
    if (state.eventId === "800" && state.mark === "FINISH") {
      return "Camera is on FINISH. Crossing 1 = 400. Crossing 2 = 800.";
    }
    if (state.eventId === "800" && state.mark === "200") {
      return "Camera is on 200. This mark will not see 400 or finish. Opposite side of the track.";
    }
    if (state.eventId === "400" && state.mark === "FINISH") {
      return "Camera is on FINISH. One crossing = 400.";
    }
    if (state.eventId === "400" && state.mark === "200") {
      return "Camera is on 200. This mark will not see the 400 finish. Opposite side of the track.";
    }
    if (state.eventId === "200" && state.mark === "200") {
      return "Camera is on 200. Each crossing is one 200.";
    }
    return "Camera is on FINISH. 200-repeat from finish is a 400 if they run full laps.";
  }

  function fileBlocked() {
    return location.protocol === "file:";
  }

  function videoEl() {
    return $("video");
  }

  function hasFeed() {
    var v = videoEl();
    if (state.stream) return true;
    if (state.source === "file" && v && v.readyState >= 2) return true;
    return false;
  }

  function stopCamera() {
    if (state.stream) {
      state.stream.getTracks().forEach(function (t) {
        t.stop();
      });
      state.stream = null;
    }
    var v = videoEl();
    if (v && v.srcObject) v.srcObject = null;
  }

  function sessionPayload(kind, extra) {
    var evn = evenSplit(state.goalSec, state.planned);
    var left = state.planned - state.crossings.length;
    return {
      app: "split",
      kind: kind || "session",
      mark: state.mark,
      event: state.eventId,
      goal: state.goalText,
      goalSec: isFinite(state.goalSec) ? state.goalSec : null,
      planned: state.planned,
      elapsed: state.elapsed,
      even: isFinite(evn) ? evn : null,
      nextMust: nextMust(state.goalSec, state.elapsed, left),
      source: state.source,
      media: state.fileName || null,
      crossings: state.crossings.map(function (c) {
        return {
          name: c.name,
          cum: c.cum,
          interval: c.interval,
          source: c.source
        };
      }),
      extra: extra || null
    };
  }

  function setSyncStatus(text) {
    var el = $("sync-status");
    if (el) el.textContent = text;
  }

  function pushSync(kind, extra) {
    if (!global.SplitSync) return;
    var payload = sessionPayload(kind, extra);
    SplitSync.rememberSession(payload);
    var cfg = SplitSync.loadCfg();
    if (!cfg.webhook) return;
    SplitSync.postWebhook(cfg, payload)
      .then(function (r) {
        if (r.skip) return;
        setSyncStatus(r.ok ? "Synced " + kind : r.detail);
      })
      .catch(function () {
        setSyncStatus("Webhook blocked (CORS) — copy JSON instead");
      });
  }

  function setPhase(p) {
    state.phase = p;
    document.body.setAttribute("data-phase", p);
  }

  function resizeOverlay() {
    var stage = $("stage");
    var overlay = $("overlay");
    if (!stage || !overlay) return;
    var r = stage.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var w = Math.max(1, Math.round(r.width * dpr));
    var h = Math.max(1, Math.round(r.height * dpr));
    if (overlay.width !== w || overlay.height !== h) {
      overlay.width = w;
      overlay.height = h;
    }
  }

  function drawLine() {
    resizeOverlay();
    SplitLine.draw($("overlay"), $("video"), performance.now());
  }

  function renderClock() {
    $("clock").textContent = formatTime(state.elapsed);
  }

  function renderSplits() {
    var evn = evenSplit(state.goalSec, state.planned);
    var last = state.crossings.length
      ? state.crossings[state.crossings.length - 1]
      : null;
    var thisEl = $("this-int");
    var evenEl = $("even-int");
    var vsEl = $("vs-even");
    var nextEl = $("next-must");
    var remEl = $("remain");
    var list = $("split-list");

    thisEl.textContent = last ? formatTime(last.interval) : "—";
    evenEl.textContent = isFinite(evn) ? formatTime(evn) : "set goal";

    if (last && isFinite(evn)) {
      var delta = last.interval - evn;
      vsEl.textContent = formatSigned(delta);
      vsEl.className = "delta " + (delta > 0.004 ? "late" : "early");
    } else {
      vsEl.textContent = "—";
      vsEl.className = "delta";
    }

    var left = state.planned - state.crossings.length;
    var nxt = nextMust(state.goalSec, state.elapsed, left);
    if (left <= 0) {
      nextEl.textContent = "done";
      if (isFinite(state.goalSec)) {
        remEl.textContent = formatSigned(state.elapsed - state.goalSec) + " vs goal";
        remEl.className = "remain " + (state.elapsed - state.goalSec > 0.004 ? "late" : "early");
      } else {
        remEl.textContent = "no goal";
        remEl.className = "remain";
      }
    } else if (!isFinite(nxt)) {
      nextEl.textContent = "set goal";
      remEl.textContent = formatTime(state.elapsed) + " elapsed";
      remEl.className = "remain";
    } else {
      nextEl.textContent = formatTime(nxt);
      remEl.textContent = formatTime(Math.max(0, state.goalSec - state.elapsed)) + " left";
      remEl.className = "remain";
    }

    list.replaceChildren();
    var i;
    for (i = 0; i < state.crossings.length; i++) {
      var c = state.crossings[i];
      var vs = isFinite(evn) ? formatSigned(c.interval - evn) : "";
      var li = document.createElement("li");
      function cell(cls, text) {
        var el = document.createElement("span");
        el.className = cls;
        el.textContent = text;
        return el;
      }
      li.appendChild(cell("n", String(i + 1)));
      li.appendChild(cell("name", c.name));
      li.appendChild(cell("cum", formatTime(c.cum)));
      li.appendChild(cell("int", formatTime(c.interval)));
      li.appendChild(cell("vs", vs));
      list.appendChild(li);
    }
    $("count").textContent = state.crossings.length + " / " + state.planned;
  }

  function renderChrome() {
    $("mark-pill").textContent = "Camera is on " + state.mark;
    $("note").textContent = geometryNote();
    $("goal").value = state.goalText;
    $("planned").value = String(state.planned);
    $("threshold").value = String(state.threshold);
    $("th-val").textContent = String(state.threshold);
    $("orient").textContent = SplitLine.orientation === "vertical" ? "Vertical" : "Horizontal";

    var chips = document.querySelectorAll("[data-event]");
    var i;
    for (i = 0; i < chips.length; i++) {
      chips[i].classList.toggle("on", chips[i].getAttribute("data-event") === state.eventId);
    }
    var marks = document.querySelectorAll("[data-mark]");
    for (i = 0; i < marks.length; i++) {
      marks[i].classList.toggle("on", marks[i].getAttribute("data-mark") === state.mark);
    }

    var arm = $("arm");
    if (state.phase === "calibrating") {
      arm.textContent = "CALIBRATING";
      arm.disabled = true;
    } else if (state.phase === "armed" || state.phase === "running") {
      arm.textContent = "ARMED";
      arm.disabled = true;
    } else if (state.phase === "done") {
      arm.textContent = "RESET";
      arm.disabled = false;
    } else if (state.phase === "live") {
      arm.textContent = "ARM";
      arm.disabled = !SplitLine.placed;
    } else {
      arm.textContent = "ENABLE CAMERA";
      arm.disabled = false;
    }

    var play = $("play");
    if (play) {
      play.hidden = state.source !== "file";
      var v = videoEl();
      play.textContent = v && !v.paused && !v.ended ? "Pause" : "Play";
    }

    $("banner").hidden = !fileBlocked();
    renderClock();
    renderSplits();
    $("energy").textContent = state.energy ? state.energy.toFixed(1) : "0.0";
  }

  function applyEvent(id) {
    var ev = EVENTS[id];
    if (!ev) return;
    state.eventId = id;
    state.mark = ev.defaultMark;
    state.planned = ev.planned;
    state.goalText = ev.defaultGoal;
    state.goalSec = parseGoal(ev.defaultGoal);
    resetRace(false);
    renderChrome();
  }

  function resetRace(keepCal) {
    state.crossings = [];
    state.elapsed = 0;
    state.running = false;
    state.armedAt = 0;
    state.lastDetectAt = 0;
    state.spikeRun = 0;
    if (!keepCal) {
      state.cal = null;
      state.calFrames = 0;
    }
    if (state.phase === "armed" || state.phase === "running" || state.phase === "done" || state.phase === "calibrating") {
      setPhase(hasFeed() ? "live" : "boot");
    }
    renderChrome();
  }

  function stampCrossing(source) {
    var prev = state.crossings.length
      ? state.crossings[state.crossings.length - 1].cum
      : 0;
    var cum = state.elapsed;
    var interval = cum - prev;
    var rec = {
      cum: cum,
      interval: interval,
      name: splitName(state.crossings.length),
      source: source || "line"
    };
    state.crossings.push(rec);
    SplitLine.flash(FLASH_MS);
    $("stage").classList.add("hit");
    setTimeout(function () {
      $("stage").classList.remove("hit");
    }, FLASH_MS);
    if (state.crossings.length >= state.planned) {
      state.running = false;
      setPhase("done");
    }
    renderChrome();
    pushSync("crossing", rec);
    if (state.phase === "done") pushSync("session", { done: true });
  }

  function beginCalibrate() {
    state.cal = null;
    state.calFrames = 0;
    state.calUntil = performance.now() + CALIBRATE_MS;
    if (state.source === "file") {
      var v = videoEl();
      if (v && v.paused) v.play().catch(function () {});
    }
    setPhase("calibrating");
    renderChrome();
  }

  function finishCalibrate() {
    setPhase("armed");
    state.running = true;
    state.armedAt = performance.now();
    state.lastTick = state.armedAt;
    state.elapsed = 0;
    state.lastDetectAt = state.armedAt;
    if (state.source === "file") {
      var v = videoEl();
      state.mediaT0 = v ? v.currentTime : 0;
    } else {
      state.mediaT0 = 0;
    }
    renderChrome();
    pushSync("armed");
  }

  function onDetectFrame(now) {
    var video = $("video");
    var mean = SplitLine.sample(video);
    if (mean < 0) return;

    if (state.phase === "calibrating") {
      if (!state.cal) state.cal = SplitLine.copyProfile();
      else {
        var i;
        for (i = 0; i < state.cal.length; i++) {
          state.cal[i] += (SplitLine.profile[i] - state.cal[i]) / (state.calFrames + 1);
        }
      }
      state.calFrames += 1;
      state.energy = 0;
      if (now >= state.calUntil && state.calFrames >= 8) finishCalibrate();
      return;
    }

    if (!state.cal) return;
    var energy = SplitLine.energyAgainst(state.cal);
    state.energy = energy;

    var quiet = energy < state.threshold * 0.45;
    if (quiet) {
      var j;
      for (j = 0; j < state.cal.length; j++) {
        state.cal[j] = state.cal[j] * (1 - BASELINE_EMA) + SplitLine.profile[j] * BASELINE_EMA;
      }
    }

    if (!(state.phase === "armed" || state.phase === "running")) return;
    if (now - state.lastDetectAt < DEBOUNCE_MS) {
      state.spikeRun = 0;
      return;
    }

    if (energy >= state.threshold) state.spikeRun += 1;
    else state.spikeRun = 0;

    if (state.spikeRun >= SPIKE_FRAMES) {
      if (state.phase === "armed") setPhase("running");
      state.spikeRun = 0;
      state.lastDetectAt = now;
      stampCrossing("line");
    }
  }

  function tick(now) {
    state.raf = requestAnimationFrame(tick);
    if (state.running && (state.phase === "armed" || state.phase === "running")) {
      if (state.source === "file") {
        var v = videoEl();
        state.elapsed = v ? Math.max(0, v.currentTime - state.mediaT0) : state.elapsed;
      } else {
        if (!state.lastTick) state.lastTick = now;
        state.elapsed += (now - state.lastTick) / 1000;
      }
      state.lastTick = now;
      renderClock();
    } else {
      state.lastTick = now;
    }

    if (hasFeed() && SplitLine.placed) {
      if (state.phase === "calibrating" || state.phase === "armed" || state.phase === "running") {
        onDetectFrame(now);
      }
    }
    if (SplitLine.placed) SplitLine.draw($("overlay"), videoEl(), now);
    $("energy").textContent = state.energy ? state.energy.toFixed(1) : "0.0";
  }

  async function startCamera() {
    if (fileBlocked()) {
      $("banner").hidden = false;
      setPhase("blocked");
      renderChrome();
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $("note").textContent = "getUserMedia is UNKNOWN on this browser.";
      return;
    }
    try {
      var stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      if (state.fileUrl) {
        URL.revokeObjectURL(state.fileUrl);
        state.fileUrl = null;
      }
      state.fileName = null;
      state.source = "camera";
      state.stream = stream;
      var video = videoEl();
      video.removeAttribute("src");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      setPhase("live");
      renderChrome();
      resizeOverlay();
    } catch (err) {
      $("note").textContent = "Camera blocked. Allow camera, then ARM again.";
      setPhase("boot");
      renderChrome();
    }
  }

  function onArm() {
    if (state.phase === "done") {
      resetRace(true);
      return;
    }
    if (!hasFeed() && (state.phase === "boot" || state.phase === "blocked")) {
      startCamera();
      return;
    }
    if (state.phase !== "live") return;
    if (!SplitLine.placed) {
      $("note").textContent = "Draw the line first. Tap the video.";
      return;
    }
    state.crossings = [];
    state.elapsed = 0;
    beginCalibrate();
  }

  function loadMedia(file) {
    if (!file) return;
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|webm|m4v)$/i.test(file.name || "")) {
      $("note").textContent = "Need a video clip. Photos have no crossing.";
      return;
    }
    stopCamera();
    if (state.fileUrl) URL.revokeObjectURL(state.fileUrl);
    state.fileUrl = URL.createObjectURL(file);
    state.fileName = file.name || "clip";
    state.source = "file";
    var video = videoEl();
    video.srcObject = null;
    video.src = state.fileUrl;
    video.muted = true;
    video.playsInline = true;
    video.onloadeddata = function () {
      video.pause();
      video.currentTime = 0;
      setPhase("live");
      $("note").textContent = "Clip loaded. Draw the line, then ARM. Clock follows the video.";
      renderChrome();
      resizeOverlay();
    };
    video.onerror = function () {
      $("note").textContent = "That clip would not play in this browser.";
    };
    video.load();
  }

  function onStagePointer(ev) {
    if (!hasFeed()) return;
    ev.preventDefault();
    SplitLine.placeFromEvent($("stage"), ev);
    if (state.phase === "armed" || state.phase === "running" || state.phase === "calibrating" || state.phase === "done") {
      resetRace(false);
      setPhase("live");
    }
    drawLine();
    renderChrome();
  }

  function fillConnectForm() {
    if (!global.SplitSync) return;
    var cfg = SplitSync.loadCfg();
    if ($("hook-url")) $("hook-url").value = cfg.webhook || "";
    if ($("hook-token")) $("hook-token").value = cfg.token || "";
    if ($("ai-base")) $("ai-base").value = cfg.base || "";
    if ($("ai-model")) $("ai-model").value = cfg.model || "";
    if ($("ai-key")) $("ai-key").value = cfg.key || "";
    if (cfg.webhook || cfg.base) setSyncStatus("Ready. Crossings POST to your webhook. Ask uses your model.");
  }

  function readConnectForm() {
    return {
      webhook: $("hook-url") ? $("hook-url").value.trim() : "",
      token: $("hook-token") ? $("hook-token").value : "",
      base: $("ai-base") ? $("ai-base").value.trim() : "",
      model: $("ai-model") ? $("ai-model").value.trim() : "",
      key: $("ai-key") ? $("ai-key").value : ""
    };
  }

  function bind() {
    $("arm").addEventListener("click", onArm);
    $("mark").addEventListener("click", function () {
      if (state.phase !== "armed" && state.phase !== "running") return;
      stampCrossing("mark");
    });
    $("orient").addEventListener("click", function () {
      SplitLine.toggleOrientation();
      if (SplitLine.placed) drawLine();
      renderChrome();
    });
    $("threshold").addEventListener("input", function () {
      state.threshold = Number($("threshold").value);
      $("th-val").textContent = String(state.threshold);
    });
    $("goal").addEventListener("change", function () {
      state.goalText = $("goal").value.trim();
      state.goalSec = parseGoal(state.goalText);
      renderSplits();
    });
    $("planned").addEventListener("change", function () {
      var n = parseInt($("planned").value, 10);
      if (!isFinite(n) || n < 1) n = 1;
      if (n > 20) n = 20;
      state.planned = n;
      $("planned").value = String(n);
      renderSplits();
    });

    var i;
    var evs = document.querySelectorAll("[data-event]");
    for (i = 0; i < evs.length; i++) {
      evs[i].addEventListener("click", function (e) {
        applyEvent(e.currentTarget.getAttribute("data-event"));
      });
    }
    var mks = document.querySelectorAll("[data-mark]");
    for (i = 0; i < mks.length; i++) {
      mks[i].addEventListener("click", function (e) {
        state.mark = e.currentTarget.getAttribute("data-mark");
        renderChrome();
      });
    }

    var stage = $("stage");
    stage.addEventListener("pointerdown", onStagePointer);
    stage.addEventListener("dragover", function (ev) {
      ev.preventDefault();
      stage.classList.add("drop");
    });
    stage.addEventListener("dragleave", function () {
      stage.classList.remove("drop");
    });
    stage.addEventListener("drop", function (ev) {
      ev.preventDefault();
      stage.classList.remove("drop");
      var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (f) loadMedia(f);
    });

    $("file").addEventListener("change", function () {
      var f = $("file").files && $("file").files[0];
      if (f) loadMedia(f);
      $("file").value = "";
    });
    $("play").addEventListener("click", function () {
      var v = videoEl();
      if (!v || state.source !== "file") return;
      if (v.paused || v.ended) v.play().catch(function () {});
      else v.pause();
      renderChrome();
    });
    $("connect-toggle").addEventListener("click", function () {
      var box = $("connect");
      box.hidden = !box.hidden;
      $("connect-toggle").classList.toggle("on", !box.hidden);
    });
    $("dl-json").addEventListener("click", function () {
      if (!global.SplitSync) return;
      SplitSync.downloadJson(sessionPayload("session"), "split-session.json");
    });
    $("copy-json").addEventListener("click", function () {
      if (!global.SplitSync) return;
      SplitSync.copyJson(sessionPayload("session")).then(function (ok) {
        setSyncStatus(ok ? "JSON copied" : "Copy failed");
      });
    });
    $("sync-now").addEventListener("click", function () {
      if (!global.SplitSync) return;
      var cfg = readConnectForm();
      SplitSync.saveCfg(cfg);
      var payload = sessionPayload("session", { manual: true });
      SplitSync.rememberSession(payload);
      setSyncStatus("Syncing…");
      SplitSync.postWebhook(cfg, payload)
        .then(function (r) {
          setSyncStatus(r.skip ? "Saved. Add a webhook to push." : r.detail);
        })
        .catch(function () {
          setSyncStatus("Webhook blocked (CORS) — copy JSON instead");
        });
    });
    $("ai-ask").addEventListener("click", function () {
      if (!global.SplitSync) return;
      var cfg = readConnectForm();
      SplitSync.saveCfg(cfg);
      var q = $("ai-q").value.trim();
      $("ai-out").textContent = "…";
      SplitSync.askModel(cfg, sessionPayload("ask"), q)
        .then(function (r) {
          $("ai-out").textContent = r.ok ? r.text : r.detail;
          setSyncStatus(r.ok ? "Model replied" : r.detail);
        })
        .catch(function () {
          $("ai-out").textContent = "Request blocked. Local models (Ollama / LM Studio / Hermes proxy) work. Cloud APIs often need a local relay.";
          setSyncStatus("Model fetch blocked");
        });
    });
    ["hook-url", "hook-token", "ai-base", "ai-model", "ai-key"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener("change", function () {
        if (global.SplitSync) SplitSync.saveCfg(readConnectForm());
      });
    });

    window.addEventListener("resize", function () {
      resizeOverlay();
      if (SplitLine.placed) drawLine();
    });
  }

  function boot() {
    bind();
    applyEvent("800");
    if (fileBlocked()) {
      $("banner").hidden = false;
      setPhase("blocked");
    } else {
      setPhase("boot");
    }
    fillConnectForm();
    renderChrome();
    state.raf = requestAnimationFrame(tick);
  }

  global.SplitMath = {
    formatTime: formatTime,
    formatSigned: formatSigned,
    parseGoal: parseGoal,
    evenSplit: evenSplit,
    nextMust: nextMust
  };
  global.SplitApp = { boot: boot, state: state, sessionPayload: sessionPayload, loadMedia: loadMedia };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
