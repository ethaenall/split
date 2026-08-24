/* Split — camera, arm, detect, clock, even-split math. Vanilla. No modules. */
(function (global) {
  "use strict";

  var FLASH_MS = 240;

  var setup = null;

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
    goalSec: NaN,
    goalText: "",
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
    return setup ? SplitSetup.eventById(setup, state.eventId) : null;
  }

  function detectCfg() {
    return (setup && setup.detect) || {
      threshold: 18,
      debounceMs: 800,
      calibrateMs: 1000,
      spikeFrames: 2,
      ema: 0.08
    };
  }

  function persistSetup() {
    if (!setup || !global.SplitSetup) return;
    SplitSetup.save(setup);
    SplitSetup.writeQuery(setup);
  }

  function splitName(index) {
    var ev = eventDef();
    var names = SplitSetup.labelsFor(ev, state.mark, state.planned);
    return names[index] || "Hit " + (index + 1);
  }

  function geometryNote() {
    var ev = eventDef();
    var names = SplitSetup.labelsFor(ev, state.mark, state.planned);
    var line = "Camera is on " + state.mark + ".";
    if (ev && ev.note) return line + " " + ev.note;
    if (names.length) return line + " Crossings: " + names.join(", ") + ". One camera sees one mark.";
    return line + " One camera sees one mark.";
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
      athlete: setup && setup.athlete ? setup.athlete : "",
      meet: setup && setup.meet ? setup.meet : "",
      mark: state.mark,
      event: state.eventId,
      eventLabel: eventDef() ? eventDef().label : state.eventId,
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

  function updateWireLabel() {
    var el = $("wire");
    if (!el || !global.SplitPose) return;
    var p = SplitPose;
    var next;
    if (!p.enabled) next = "Wire off";
    else if (p.status === "loading") next = "Wire…";
    else if (p.status === "fail") next = "Luma only";
    else if (p.people.length) next = "Wire " + p.people.length;
    else next = "Wire";
    if (el.textContent !== next) el.textContent = next;
  }

  function paintOverlay(now) {
    resizeOverlay();
    var overlay = $("overlay");
    if (!overlay) return;
    var ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (global.SplitPose && SplitPose.enabled) SplitPose.draw(overlay, videoEl());
    if (SplitLine.placed) SplitLine.draw(overlay, videoEl(), now || performance.now(), true);
  }

  function drawLine() {
    paintOverlay(performance.now());
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
    updateWireLabel();

    renderEventChips();
    renderMarkChips();

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

  function renderEventChips() {
    var host = $("event-chips");
    if (!host || !setup) return;
    host.replaceChildren();
    setup.events.forEach(function (ev) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = ev.label;
      b.className = ev.id === state.eventId ? "on" : "";
      b.addEventListener("click", function () {
        applyEvent(ev.id);
      });
      host.appendChild(b);
    });
  }

  function renderMarkChips() {
    var host = $("mark-chips");
    if (!host || !setup) return;
    host.replaceChildren();
    setup.marks.forEach(function (m) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = m;
      b.className = m === state.mark ? "on" : "";
      b.addEventListener("click", function () {
        state.mark = m;
        setup.mark = m;
        persistSetup();
        fillSetupForm();
        renderChrome();
      });
      host.appendChild(b);
    });
  }

  function fillSetupForm() {
    if (!setup) return;
    var ev = eventDef();
    if ($("cfg-athlete")) $("cfg-athlete").value = setup.athlete || "";
    if ($("cfg-meet")) $("cfg-meet").value = setup.meet || "";
    if (ev) {
      if ($("cfg-label")) $("cfg-label").value = ev.label;
      if ($("cfg-def-mark")) $("cfg-def-mark").value = ev.defaultMark || "";
      if ($("cfg-labels")) $("cfg-labels").value = SplitSetup.labelsFor(ev, state.mark, ev.planned).join(", ");
      if ($("cfg-note")) $("cfg-note").value = ev.note || "";
    }
    if ($("cfg-cal")) $("cfg-cal").value = String(detectCfg().calibrateMs);
    if ($("cfg-deb")) $("cfg-deb").value = String(detectCfg().debounceMs);
  }

  function applyEvent(id) {
    var ev = setup ? SplitSetup.eventById(setup, id) : null;
    if (!ev) return;
    state.eventId = ev.id;
    setup.activeEventId = ev.id;
    if (ev.defaultMark) {
      state.mark = ev.defaultMark;
      setup.mark = ev.defaultMark;
      if (setup.marks.indexOf(ev.defaultMark) < 0) setup.marks.push(ev.defaultMark);
    }
    state.planned = ev.planned;
    state.goalText = ev.defaultGoal || "";
    state.goalSec = parseGoal(state.goalText);
    persistSetup();
    resetRace(false);
    fillSetupForm();
    renderChrome();
  }

  function applySetup(cfg) {
    setup = SplitSetup.normalize(cfg);
    var ev = SplitSetup.eventById(setup, setup.activeEventId) || setup.events[0];
    if (ev) {
      state.eventId = ev.id;
      state.planned = ev.planned;
      state.goalText = ev.defaultGoal || "";
      state.goalSec = parseGoal(state.goalText);
    }
    state.mark = setup.mark;
    state.threshold = detectCfg().threshold;
    persistSetup();
    fillSetupForm();
    renderChrome();
  }

  function resetRace(keepCal) {
    state.crossings = [];
    state.elapsed = 0;
    state.running = false;
    state.armedAt = 0;
    state.lastDetectAt = 0;
    state.spikeRun = 0;
    if (global.SplitPose) SplitPose.resetTrack();
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
    state.calUntil = performance.now() + detectCfg().calibrateMs;
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
        state.cal[j] = state.cal[j] * (1 - detectCfg().ema) + SplitLine.profile[j] * detectCfg().ema;
      }
    }

    if (!(state.phase === "armed" || state.phase === "running")) return;
    if (now - state.lastDetectAt < detectCfg().debounceMs) {
      state.spikeRun = 0;
      return;
    }

    if (energy >= state.threshold) state.spikeRun += 1;
    else state.spikeRun = 0;

    if (state.spikeRun >= detectCfg().spikeFrames) {
      if (state.phase === "armed") setPhase("running");
      state.spikeRun = 0;
      state.lastDetectAt = now;
      stampCrossing("line");
    }
  }

  function maybePoseCrossing(now) {
    if (!global.SplitPose || !SplitPose.enabled || SplitPose.status !== "ready") return false;
    if (!(state.phase === "armed" || state.phase === "running")) return false;
    if (now - state.lastDetectAt < detectCfg().debounceMs) return false;
    if (!SplitPose.crossedLine(SplitLine, videoEl(), $("overlay"))) return false;
    if (state.phase === "armed") setPhase("running");
    state.spikeRun = 0;
    state.lastDetectAt = now;
    stampCrossing("pose");
    return true;
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

    resizeOverlay();
    if (hasFeed() && global.SplitPose && SplitPose.enabled) SplitPose.infer(videoEl(), now);

    if (hasFeed() && SplitLine.placed) {
      if (state.phase === "calibrating") onDetectFrame(now);
      else if (state.phase === "armed" || state.phase === "running") {
        maybePoseCrossing(now);
        onDetectFrame(now);
      }
    }
    paintOverlay(now);
    $("energy").textContent = state.energy ? state.energy.toFixed(1) : "0.0";
    updateWireLabel();
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
      if (global.SplitPose) SplitPose.load();
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
      if (global.SplitPose) SplitPose.load();
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
    if ($("wire")) {
      $("wire").addEventListener("click", function () {
        if (!global.SplitPose) return;
        SplitPose.setEnabled(!SplitPose.enabled);
        updateWireLabel();
      });
    }
    $("threshold").addEventListener("input", function () {
      state.threshold = Number($("threshold").value);
      $("th-val").textContent = String(state.threshold);
      if (setup) {
        setup.detect.threshold = state.threshold;
        persistSetup();
      }
    });
    $("goal").addEventListener("change", function () {
      state.goalText = $("goal").value.trim();
      state.goalSec = parseGoal(state.goalText);
      var ev = eventDef();
      if (ev) ev.defaultGoal = state.goalText;
      persistSetup();
      renderSplits();
    });
    $("planned").addEventListener("change", function () {
      var n = parseInt($("planned").value, 10);
      if (!isFinite(n) || n < 1) n = 1;
      if (n > 40) n = 40;
      state.planned = n;
      $("planned").value = String(n);
      var ev = eventDef();
      if (ev) ev.planned = n;
      persistSetup();
      fillSetupForm();
      renderSplits();
    });

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
      if (!box.hidden) {
        $("setup").hidden = true;
        $("setup-toggle").classList.remove("on");
      }
    });
    $("setup-toggle").addEventListener("click", function () {
      var box = $("setup");
      box.hidden = !box.hidden;
      $("setup-toggle").classList.toggle("on", !box.hidden);
      if (!box.hidden) {
        $("connect").hidden = true;
        $("connect-toggle").classList.remove("on");
        fillSetupForm();
      }
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

    $("cfg-save").addEventListener("click", function () {
      var ev = eventDef();
      if (!ev) return;
      ev.label = $("cfg-label").value.trim() || ev.label;
      ev.defaultMark = $("cfg-def-mark").value.trim() || ev.defaultMark;
      ev.note = $("cfg-note").value.trim();
      ev.labels = ev.labels || {};
      ev.labels[state.mark] = $("cfg-labels").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      setup.athlete = $("cfg-athlete").value.trim();
      setup.meet = $("cfg-meet").value.trim();
      setup.detect.calibrateMs = Math.max(200, parseInt($("cfg-cal").value, 10) || 1000);
      setup.detect.debounceMs = Math.max(100, parseInt($("cfg-deb").value, 10) || 800);
      persistSetup();
      fillSetupForm();
      renderChrome();
      $("cfg-status").textContent = "Saved. Share the URL or export JSON.";
    });
    $("cfg-add-mark").addEventListener("click", function () {
      var name = $("cfg-new-mark").value.trim();
      if (!name) return;
      if (setup.marks.indexOf(name) < 0) setup.marks.push(name);
      state.mark = name;
      setup.mark = name;
      $("cfg-new-mark").value = "";
      persistSetup();
      renderChrome();
    });
    $("cfg-add-event").addEventListener("click", function () {
      var label = $("cfg-new-event").value.trim() || "Custom";
      var ev = {
        id: SplitSetup.uid("e"),
        label: label,
        planned: state.planned || 1,
        defaultMark: state.mark,
        defaultGoal: state.goalText || "",
        labels: {},
        note: "One camera. One mark."
      };
      ev.labels[state.mark] = [];
      setup.events.push(ev);
      $("cfg-new-event").value = "";
      persistSetup();
      applyEvent(ev.id);
      $("cfg-status").textContent = "Added " + label + ". Edit names, then Save event.";
    });
    $("cfg-del").addEventListener("click", function () {
      if (!setup || setup.events.length < 2) {
        $("cfg-status").textContent = "Keep at least one event.";
        return;
      }
      setup.events = setup.events.filter(function (e) { return e.id !== state.eventId; });
      applyEvent(setup.events[0].id);
      $("cfg-status").textContent = "Event removed.";
    });
    $("cfg-export").addEventListener("click", function () {
      $("cfg-json").value = SplitSetup.exportBlob(setup);
      SplitSync.downloadJson(setup, "split-setup.json");
    });
    $("cfg-import").addEventListener("click", function () {
      try {
        applySetup(SplitSetup.fromJson($("cfg-json").value));
        $("cfg-status").textContent = "Imported setup.";
      } catch (e) {
        $("cfg-status").textContent = "Import failed. Paste setup JSON.";
      }
    });
    $("cfg-reset").addEventListener("click", function () {
      localStorage.removeItem("split.setup.v2");
      applySetup(SplitSetup.applyQuery(SplitSetup.defaults()));
      $("cfg-status").textContent = "Stock presets restored.";
    });
    ["cfg-athlete", "cfg-meet"].forEach(function (id) {
      $(id).addEventListener("change", function () {
        if (!setup) return;
        setup.athlete = $("cfg-athlete").value.trim();
        setup.meet = $("cfg-meet").value.trim();
        persistSetup();
      });
    });

    window.addEventListener("resize", function () {
      resizeOverlay();
      if (SplitLine.placed) drawLine();
    });
  }

  function boot() {
    bind();
    setup = SplitSetup.applyQuery(SplitSetup.load());
    applySetup(setup);
    if (fileBlocked()) {
      $("banner").hidden = false;
      setPhase("blocked");
    } else {
      setPhase("boot");
    }
    fillConnectForm();
    renderChrome();
    if (global.SplitPose) SplitPose.load();
    state.raf = requestAnimationFrame(tick);
  }

  global.SplitMath = {
    formatTime: formatTime,
    formatSigned: formatSigned,
    parseGoal: parseGoal,
    evenSplit: evenSplit,
    nextMust: nextMust
  };
  global.SplitApp = { boot: boot, state: state, sessionPayload: sessionPayload, loadMedia: loadMedia, setup: function () { return setup; } };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
