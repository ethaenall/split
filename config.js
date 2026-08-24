/* Split — shareable meet setup. Generic presets. Persisted locally. No modules. */
(function (global) {
  "use strict";

  var STORE = "split.setup.v2";

  function uid(prefix) {
    return (prefix || "e") + "-" + Math.random().toString(36).slice(2, 8);
  }

  function stockEvents() {
    return [
      {
        id: "100",
        label: "100",
        planned: 1,
        defaultMark: "FINISH",
        defaultGoal: "",
        labels: { FINISH: ["100"] },
        note: "One crossing at the finish."
      },
      {
        id: "200",
        label: "200",
        planned: 1,
        defaultMark: "FINISH",
        defaultGoal: "",
        labels: { FINISH: ["200"], "200": ["200"] },
        note: "One crossing at this mark."
      },
      {
        id: "400",
        label: "400",
        planned: 1,
        defaultMark: "FINISH",
        defaultGoal: "",
        labels: { FINISH: ["400"], "200": ["200"] },
        note: "Finish camera: one crossing. A 200 camera will not see the finish."
      },
      {
        id: "800",
        label: "800",
        planned: 2,
        defaultMark: "FINISH",
        defaultGoal: "",
        labels: { FINISH: ["400", "800"], "200": ["200", "600"] },
        note: "Finish camera: crossing 1 = 400, crossing 2 = 800. One phone cannot see 200 and finish."
      },
      {
        id: "1500",
        label: "1500",
        planned: 4,
        defaultMark: "FINISH",
        defaultGoal: "",
        labels: { FINISH: ["300", "700", "1100", "1500"] },
        note: "Finish camera on a 400m track: four hits."
      },
      {
        id: "200r",
        label: "200-repeat",
        planned: 4,
        defaultMark: "200",
        defaultGoal: "",
        labels: { "200": ["200 #1", "200 #2", "200 #3", "200 #4"], FINISH: ["rep 1", "rep 2", "rep 3", "rep 4"] },
        note: "Each crossing is one repeat at this mark."
      }
    ];
  }

  function defaults() {
    return {
      version: 2,
      activeEventId: "800",
      mark: "FINISH",
      marks: ["FINISH", "200", "START"],
      events: stockEvents(),
      athlete: "",
      meet: "",
      detect: {
        threshold: 18,
        debounceMs: 800,
        calibrateMs: 1000,
        spikeFrames: 2,
        ema: 0.08
      }
    };
  }

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function normalize(raw) {
    var base = defaults();
    if (!raw || typeof raw !== "object") return base;
    if (Array.isArray(raw.marks) && raw.marks.length) {
      base.marks = raw.marks.map(function (m) { return String(m).trim(); }).filter(Boolean);
    }
    if (Array.isArray(raw.events) && raw.events.length) {
      base.events = raw.events.map(function (e, i) {
        var planned = parseInt(e.planned, 10);
        if (!isFinite(planned) || planned < 1) planned = 1;
        if (planned > 40) planned = 40;
        return {
          id: String(e.id || uid("e")),
          label: String(e.label || "Event " + (i + 1)),
          planned: planned,
          defaultMark: String(e.defaultMark || base.marks[0] || "FINISH"),
          defaultGoal: e.defaultGoal == null ? "" : String(e.defaultGoal),
          labels: e.labels && typeof e.labels === "object" ? e.labels : {},
          note: e.note == null ? "" : String(e.note)
        };
      });
    }
    if (raw.detect && typeof raw.detect === "object") {
      var d = raw.detect;
      if (isFinite(Number(d.threshold))) base.detect.threshold = Number(d.threshold);
      if (isFinite(Number(d.debounceMs))) base.detect.debounceMs = Math.max(100, Number(d.debounceMs));
      if (isFinite(Number(d.calibrateMs))) base.detect.calibrateMs = Math.max(200, Number(d.calibrateMs));
      if (isFinite(Number(d.spikeFrames))) base.detect.spikeFrames = Math.max(1, Number(d.spikeFrames) | 0);
      if (isFinite(Number(d.ema))) base.detect.ema = Number(d.ema);
    }
    if (typeof raw.athlete === "string") base.athlete = raw.athlete;
    if (typeof raw.meet === "string") base.meet = raw.meet;
    if (raw.activeEventId) base.activeEventId = String(raw.activeEventId);
    if (raw.mark) base.mark = String(raw.mark);
    if (!eventById(base, base.activeEventId) && base.events[0]) base.activeEventId = base.events[0].id;
    if (base.marks.indexOf(base.mark) < 0) base.marks.push(base.mark);
    return base;
  }

  function eventById(cfg, id) {
    var i;
    for (i = 0; i < cfg.events.length; i++) {
      if (cfg.events[i].id === id) return cfg.events[i];
    }
    return null;
  }

  function load() {
    try {
      return normalize(JSON.parse(localStorage.getItem(STORE) || "null"));
    } catch (e) {
      return defaults();
    }
  }

  function save(cfg) {
    localStorage.setItem(STORE, JSON.stringify(cfg));
    return cfg;
  }

  function labelsFor(ev, mark, planned) {
    var n = planned || (ev && ev.planned) || 1;
    var raw = ev && ev.labels && (ev.labels[mark] || ev.labels["*"]);
    var list = [];
    if (typeof raw === "string") {
      list = raw.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    } else if (Array.isArray(raw)) {
      list = raw.map(function (s) { return String(s); });
    }
    while (list.length < n) list.push("Hit " + (list.length + 1));
    return list.slice(0, n);
  }

  function applyQuery(cfg) {
    var q;
    try {
      q = new URLSearchParams(location.search);
    } catch (e) {
      return cfg;
    }
    var e = q.get("e") || q.get("event");
    var m = q.get("m") || q.get("mark");
    var g = q.get("g") || q.get("goal");
    var n = q.get("n") || q.get("crossings");
    if (e && eventById(cfg, e)) cfg.activeEventId = e;
    if (m) {
      cfg.mark = m;
      if (cfg.marks.indexOf(m) < 0) cfg.marks.push(m);
    }
    var ev = eventById(cfg, cfg.activeEventId);
    if (ev && g != null && String(g).length) ev.defaultGoal = String(g);
    if (ev && n) {
      var p = parseInt(n, 10);
      if (isFinite(p) && p > 0) ev.planned = p;
    }
    return cfg;
  }

  function writeQuery(cfg) {
    var ev = eventById(cfg, cfg.activeEventId);
    if (!ev || !history.replaceState) return;
    var q = new URLSearchParams();
    q.set("e", ev.id);
    q.set("m", cfg.mark);
    if (ev.defaultGoal) q.set("g", ev.defaultGoal);
    q.set("n", String(ev.planned));
    history.replaceState(null, "", location.pathname + "?" + q.toString() + location.hash);
  }

  function exportBlob(cfg) {
    return JSON.stringify(cfg, null, 2);
  }

  function fromJson(text) {
    return normalize(JSON.parse(text));
  }

  global.SplitSetup = {
    defaults: defaults,
    load: load,
    save: save,
    normalize: normalize,
    eventById: eventById,
    labelsFor: labelsFor,
    applyQuery: applyQuery,
    writeQuery: writeQuery,
    exportBlob: exportBlob,
    fromJson: fromJson,
    uid: uid,
    clone: clone
  };
})(window);
