/* Split node tests. No npm. node test/run.js */
"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var assert = require("assert");

var root = path.join(__dirname, "..");
var failed = 0;
var passed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("PASS  " + name);
  } catch (err) {
    failed += 1;
    console.log("FAIL  " + name);
    console.log("      " + (err && err.stack ? err.stack.split("\n").slice(0, 4).join("\n      ") : err));
  }
}

function mockEl(id) {
  return {
    id: id,
    textContent: "",
    className: "",
    value: "",
    hidden: false,
    disabled: false,
    style: {},
    classList: { add: function () {}, remove: function () {}, toggle: function () {} },
    replaceChildren: function () {},
    appendChild: function () {},
    addEventListener: function () {},
    removeAttribute: function () {},
    setAttribute: function () {},
    getBoundingClientRect: function () {
      return { width: 320, height: 240, left: 0, top: 0 };
    },
    getContext: function () {
      return {
        clearRect: function () {},
        drawImage: function () {},
        getImageData: function () {
          return { data: new Uint8ClampedArray(4) };
        },
        beginPath: function () {},
        moveTo: function () {},
        lineTo: function () {},
        stroke: function () {},
        arc: function () {},
        fill: function () {}
      };
    },
    play: function () {
      return Promise.resolve();
    },
    pause: function () {},
    load: function () {},
    click: function () {},
    files: null
  };
}

function loadApp(omitIds) {
  var html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  var ids = [];
  html.replace(/\sid="([^"]+)"/g, function (_, id) {
    ids.push(id);
    return _;
  });
  var els = {};
  ids.forEach(function (id) {
    if (!omitIds || omitIds.indexOf(id) < 0) els[id] = mockEl(id);
  });
  var windowObj = {
    devicePixelRatio: 1,
    addEventListener: function () {},
    localStorage: {
      store: {},
      getItem: function (k) {
        return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null;
      },
      setItem: function (k, v) {
        this.store[k] = String(v);
      },
      removeItem: function (k) {
        delete this.store[k];
      }
    },
    location: { protocol: "http:", search: "", pathname: "/", hash: "", href: "http://127.0.0.1/" },
    history: { replaceState: function () {} },
    navigator: {},
    performance: { now: function () { return 0; } },
    requestAnimationFrame: function () { return 0; },
    setTimeout: function (fn) { return 0; },
    clearTimeout: function () {},
    URL: { createObjectURL: function () { return "blob:x"; }, revokeObjectURL: function () {} },
    URLSearchParams: URLSearchParams,
    Float32Array: Float32Array,
    JSON: JSON,
    Math: Math,
    parseInt: parseInt,
    isFinite: isFinite,
    Number: Number,
    String: String,
    Date: Date,
    console: console
  };
  windowObj.document = {
    readyState: "complete",
    body: { setAttribute: function () {} },
    documentElement: {},
    getElementById: function (id) {
      return els[id] || null;
    },
    createElement: function (tag) {
      return mockEl(tag);
    },
    addEventListener: function () {}
  };
  windowObj.window = windowObj;
  var ctx = vm.createContext(windowObj);
  ["line.js", "config.js", "sync.js", "split.js"].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
  });
  return ctx;
}

check("boot does not throw when #vs-even is missing", function () {
  var ctx = loadApp(["vs-even"]);
  assert.ok(ctx.SplitApp, "SplitApp missing");
  assert.ok(ctx.SplitMath, "SplitMath missing");
  assert.strictEqual(ctx.SplitApp.state.phase, "boot");
});

check("formatTime / parseGoal / even / nextMust", function () {
  var ctx = loadApp();
  var m = ctx.SplitMath;
  assert.strictEqual(m.formatTime(0), "0:00.00");
  assert.strictEqual(m.formatTime(127.04), "2:07.04");
  assert.strictEqual(m.formatTime(55.25), "0:55.25");
  assert.strictEqual(m.parseGoal("2:07.04"), 127.04);
  assert.strictEqual(m.parseGoal("55.25"), 55.25);
  assert.ok(!isFinite(m.parseGoal("")));
  assert.strictEqual(m.evenSplit(120, 2), 60);
  assert.strictEqual(m.nextMust(120, 62, 1), 58);
});

check("labelsFor pads and slices", function () {
  var ctx = loadApp();
  var ev = ctx.SplitSetup.eventById(ctx.SplitSetup.defaults(), "800");
  var names = ctx.SplitSetup.labelsFor(ev, "FINISH", 2);
  assert.strictEqual(names.join(","), "400,800");
  var padded = ctx.SplitSetup.labelsFor(ev, "FINISH", 3);
  assert.strictEqual(padded[2], "Hit 3");
});

check("energyAgainst is mean absolute error", function () {
  var ctx = loadApp();
  ctx.SplitLine.profile = Float32Array.from([10, 20, 30, 40]);
  var e = ctx.SplitLine.energyAgainst(Float32Array.from([10, 22, 30, 36]));
  assert.ok(Math.abs(e - 1.5) < 1e-9);
});

check("overlayToVideoT keeps center and maps cover crop", function () {
  var ctx = loadApp();
  var L = ctx.SplitLine;
  assert.ok(typeof L.overlayToVideoT === "function", "overlayToVideoT missing");
  L.orientation = "vertical";
  assert.ok(Math.abs(L.overlayToVideoT(0.5, 1920, 1080, 1080, 1080) - 0.5) < 1e-9);
  var left = L.overlayToVideoT(0, 1920, 1080, 1080, 1080);
  var right = L.overlayToVideoT(1, 1920, 1080, 1080, 1080);
  assert.ok(Math.abs(left - 0.21875) < 1e-6, "left " + left);
  assert.ok(Math.abs(right - 0.78125) < 1e-6, "right " + right);
  L.orientation = "horizontal";
  assert.ok(Math.abs(L.overlayToVideoT(0.25, 1920, 1080, 1080, 1080) - 0.25) < 1e-9);
});

check("visibleRange crops the hidden axis only", function () {
  var ctx = loadApp();
  var L = ctx.SplitLine;
  assert.ok(typeof L.visibleRange === "function", "visibleRange missing");
  var wide = L.visibleRange(1920, 1080, 1080, 1080);
  assert.ok(Math.abs(wide.x0 - 0.21875) < 1e-6);
  assert.strictEqual(wide.y0, 0);
  assert.strictEqual(wide.y1, 1);
  var tall = L.visibleRange(1080, 1920, 1080, 1080);
  assert.strictEqual(tall.x0, 0);
  assert.strictEqual(tall.x1, 1);
  assert.ok(Math.abs(tall.y0 - 0.21875) < 1e-6);
});

check("live ARM stays clickable and DRAW LINE until the line is placed", function () {
  var ctx = loadApp();
  ctx.SplitApp.setPhase("live");
  ctx.SplitLine.placed = false;
  ctx.SplitApp.renderChrome();
  var arm = ctx.document.getElementById("arm");
  assert.strictEqual(arm.textContent, "DRAW LINE");
  assert.strictEqual(arm.disabled, false);
  ctx.SplitLine.placed = true;
  ctx.SplitApp.renderChrome();
  assert.strictEqual(arm.textContent, "ARM");
  assert.strictEqual(arm.disabled, false);
});

check("two hot frames stamp a luma crossing", function () {
  var ctx = loadApp();
  var app = ctx.SplitApp;
  app.state.phase = "running";
  app.state.running = true;
  app.state.cal = Float32Array.from([10, 10, 10, 10]);
  app.state.threshold = 18;
  app.state.lastDetectAt = -1e9;
  app.state.spikeRun = 0;
  app.state.elapsed = 62.04;
  ctx.SplitLine.placed = true;
  ctx.SplitLine.sample = function () {
    ctx.SplitLine.profile = Float32Array.from([40, 40, 40, 40]);
    return 40;
  };
  ctx.SplitLine.energyAgainst = function () { return 30; };
  app.onDetectFrame(1000);
  assert.strictEqual(app.state.crossings.length, 0);
  app.onDetectFrame(1016);
  assert.strictEqual(app.state.crossings.length, 1);
  assert.strictEqual(app.state.crossings[0].source, "line");
  assert.strictEqual(app.state.crossings[0].name, "400");
  var payload = app.sessionPayload("session");
  assert.strictEqual(payload.crossings.length, 1);
  assert.strictEqual(payload.mark, "FINISH");
});

console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
