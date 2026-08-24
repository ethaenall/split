/* Split — body wireframes. MediaPipe Pose via CDN. Luma still stamps if this fails. */
(function (global) {
  "use strict";

  var VISION = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
  var WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
  var MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
  var STORE = "split.wire.v1";
  var MIN_VIS = 0.35;
  var DEAD = 0.012;
  var INFER_MS = 50;
  var MAX_POSES = 4;

  var EDGES = [
    [11, 12],
    [11, 13], [13, 15], [15, 19],
    [12, 14], [14, 16], [16, 20],
    [11, 23], [12, 24], [23, 24],
    [23, 25], [25, 27], [27, 31],
    [24, 26], [26, 28], [28, 32],
    [0, 11], [0, 12]
  ];

  function vis(lm) {
    if (!lm) return 0;
    if (typeof lm.visibility === "number") return lm.visibility;
    if (typeof lm.presence === "number") return lm.presence;
    return 1;
  }

  function mid(a, b) {
    if (!a || !b) return null;
    if (vis(a) < MIN_VIS || vis(b) < MIN_VIS) return null;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, visibility: Math.min(vis(a), vis(b)) };
  }

  function pickAnchor(lms) {
    var hip = mid(lms[23], lms[24]);
    if (hip) return hip;
    if (lms[23] && vis(lms[23]) >= MIN_VIS) return lms[23];
    if (lms[24] && vis(lms[24]) >= MIN_VIS) return lms[24];
    var sh = mid(lms[11], lms[12]);
    if (sh) return sh;
    return null;
  }

  function coverPoint(nx, ny, vw, vh, ow, oh) {
    if (!vw || !vh || !ow || !oh) return { x: nx * ow, y: ny * oh, nx: nx, ny: ny };
    var vr = vw / vh;
    var orr = ow / oh;
    var sx;
    var ox = 0;
    var oy = 0;
    if (vr > orr) {
      sx = oh / vh;
      ox = (ow - vw * sx) / 2;
    } else {
      sx = ow / vw;
      oy = (oh - vh * sx) / 2;
    }
    var x = ox + nx * vw * sx;
    var y = oy + ny * vh * sx;
    return { x: x, y: y, nx: x / ow, ny: y / oh };
  }

  function loadEnabled() {
    try {
      var v = localStorage.getItem(STORE);
      if (v === "0") return false;
    } catch (e) {}
    return true;
  }

  var Pose = {
    status: "off",
    enabled: loadEnabled(),
    people: [],
    lastSides: {},
    lastInfer: 0,
    lastTs: 0,
    landmarker: null,
    ready: null,
    work: null,
    workCtx: null,

    setEnabled: function (on) {
      this.enabled = !!on;
      try {
        localStorage.setItem(STORE, this.enabled ? "1" : "0");
      } catch (e) {}
      if (this.enabled) this.load();
      else {
        this.people = [];
        this.lastSides = {};
      }
    },

    resetTrack: function () {
      this.lastSides = {};
    },

    load: function () {
      if (!this.enabled) return Promise.resolve(false);
      if (this.status === "ready") return Promise.resolve(true);
      if (this.ready) return this.ready;
      var self = this;
      this.status = "loading";
      this.ready = Promise.resolve()
        .then(function () {
          return import(VISION);
        })
        .then(function (mod) {
          return mod.FilesetResolver.forVisionTasks(WASM).then(function (fileset) {
            function make(delegate) {
              return mod.PoseLandmarker.createFromOptions(fileset, {
                baseOptions: { modelAssetPath: MODEL, delegate: delegate },
                runningMode: "VIDEO",
                numPoses: MAX_POSES,
                minPoseDetectionConfidence: 0.35,
                minPosePresenceConfidence: 0.35,
                minTrackingConfidence: 0.35
              });
            }
            return make("GPU").catch(function () {
              return make("CPU");
            });
          });
        })
        .then(function (lm) {
          self.landmarker = lm;
          self.status = "ready";
          return true;
        })
        .catch(function () {
          self.status = "fail";
          self.ready = null;
          return false;
        });
      return this.ready;
    },

    ensureWork: function (video) {
      var vw = video.videoWidth | 0;
      var vh = video.videoHeight | 0;
      if (!vw || !vh) return null;
      var w = vw > 480 ? 480 : vw;
      var h = Math.max(1, Math.round(vh * (w / vw)));
      if (!this.work) {
        this.work = document.createElement("canvas");
        this.workCtx = this.work.getContext("2d", { willReadFrequently: true });
      }
      if (this.work.width !== w || this.work.height !== h) {
        this.work.width = w;
        this.work.height = h;
      }
      this.workCtx.drawImage(video, 0, 0, w, h);
      return this.work;
    },

    infer: function (video, now) {
      if (!this.enabled || this.status !== "ready" || !this.landmarker || !video) return;
      if (now - this.lastInfer < INFER_MS) return;
      var frame = this.ensureWork(video);
      if (!frame) return;
      var ts = now | 0;
      if (ts <= this.lastTs) ts = this.lastTs + 1;
      this.lastTs = ts;
      this.lastInfer = now;
      var result;
      try {
        result = this.landmarker.detectForVideo(frame, ts);
      } catch (e) {
        this.lastTs = 0;
        return;
      }
      var list = (result && result.landmarks) || [];
      var people = [];
      var i;
      for (i = 0; i < list.length; i++) {
        var lms = list[i];
        var a = pickAnchor(lms);
        if (!a) continue;
        people.push({
          id: String(i),
          lms: lms,
          ax: a.x,
          ay: a.y
        });
      }
      this.people = people;
    },

    mapPeople: function (video, overlay) {
      var vw = video && video.videoWidth | 0;
      var vh = video && video.videoHeight | 0;
      var ow = overlay.width;
      var oh = overlay.height;
      var i;
      for (i = 0; i < this.people.length; i++) {
        var p = this.people[i];
        var pt = coverPoint(p.ax, p.ay, vw, vh, ow, oh);
        p.x = pt.x;
        p.y = pt.y;
        p.nx = pt.nx;
        p.ny = pt.ny;
      }
      return { vw: vw, vh: vh, ow: ow, oh: oh };
    },

    crossedLine: function (line, video, overlay) {
      if (!line || !line.placed || !this.people.length) return false;
      this.mapPeople(video, overlay);
      var hit = false;
      var i;
      for (i = 0; i < this.people.length; i++) {
        var p = this.people[i];
        var v = line.orientation === "vertical" ? p.nx : p.ny;
        var side = 0;
        if (v < line.t - DEAD) side = -1;
        else if (v > line.t + DEAD) side = 1;
        var prev = this.lastSides[p.id];
        if (prev && side && prev !== side) {
          hit = true;
          p.hit = true;
        }
        if (side) this.lastSides[p.id] = side;
      }
      return hit;
    },

    draw: function (overlay, video) {
      if (!this.enabled || !overlay || !this.people.length) return;
      var ctx = overlay.getContext("2d");
      var map = this.mapPeople(video, overlay);
      var i;
      for (i = 0; i < this.people.length; i++) {
        drawOne(ctx, this.people[i], map, i);
      }
    }
  };

  function drawOne(ctx, person, map, idx) {
    var lms = person.lms;
    var color = person.hit ? "#ffffff" : idx === 0 ? "#e8ff3d" : "rgba(244,244,241,0.72)";
    var w = Math.max(2, map.ow / 280);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = w;
    var e;
    for (e = 0; e < EDGES.length; e++) {
      var a = lms[EDGES[e][0]];
      var b = lms[EDGES[e][1]];
      if (!a || !b || vis(a) < MIN_VIS || vis(b) < MIN_VIS) continue;
      var pa = coverPoint(a.x, a.y, map.vw, map.vh, map.ow, map.oh);
      var pb = coverPoint(b.x, b.y, map.vw, map.vh, map.ow, map.oh);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
    var joints = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
    var j;
    for (j = 0; j < joints.length; j++) {
      var lm = lms[joints[j]];
      if (!lm || vis(lm) < MIN_VIS) continue;
      var pt = coverPoint(lm.x, lm.y, map.vw, map.vh, map.ow, map.oh);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, w * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (person.x != null) {
      ctx.beginPath();
      ctx.arc(person.x, person.y, w * 2.2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  global.SplitPose = Pose;
})(window);
