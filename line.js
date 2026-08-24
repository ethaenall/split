/* Split — line geometry + luma sample. Vanilla. No modules. */
(function (global) {
  "use strict";

  var SAMPLE_N = 64;

  function clamp01(v) {
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
  }

  function lumaAt(data, idx) {
    var r = data[idx];
    var g = data[idx + 1];
    var b = data[idx + 2];
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  var Line = {
    orientation: "vertical",
    t: 0.5,
    placed: false,
    flashUntil: 0,
    sampleN: SAMPLE_N,
    profile: null,
    work: null,
    workCtx: null,

    reset: function () {
      this.orientation = "vertical";
      this.t = 0.5;
      this.placed = false;
      this.flashUntil = 0;
      this.profile = null;
    },

    toggleOrientation: function () {
      this.orientation = this.orientation === "vertical" ? "horizontal" : "vertical";
    },

    placeFromEvent: function (el, ev) {
      var rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var src = ev.touches && ev.touches.length ? ev.touches[0] : ev;
      var x = (src.clientX - rect.left) / rect.width;
      var y = (src.clientY - rect.top) / rect.height;
      if (this.orientation === "vertical") this.t = clamp01(x);
      else this.t = clamp01(y);
      this.placed = true;
    },

    flash: function (ms) {
      this.flashUntil = performance.now() + (ms || 240);
    },

    isFlashing: function (now) {
      return (now || performance.now()) < this.flashUntil;
    },

    ensureWork: function (w, h) {
      if (!this.work) {
        this.work = document.createElement("canvas");
        this.workCtx = this.work.getContext("2d", { willReadFrequently: true });
      }
      if (this.work.width !== w || this.work.height !== h) {
        this.work.width = w;
        this.work.height = h;
      }
    },

    /* Fill this.profile[0..n) with luma along the line. Returns mean or -1. */
    sample: function (video) {
      var vw = video.videoWidth | 0;
      var vh = video.videoHeight | 0;
      if (!vw || !vh) return -1;

      this.ensureWork(vw, vh);
      this.workCtx.drawImage(video, 0, 0, vw, vh);

      var n = this.sampleN;
      if (!this.profile || this.profile.length !== n) {
        this.profile = new Float32Array(n);
      }

      var t = this.t;
      var mean = 0;
      var i, img, data, px, py, idx;

      if (this.orientation === "vertical") {
        px = Math.max(0, Math.min(vw - 1, Math.round(t * (vw - 1))));
        img = this.workCtx.getImageData(px, 0, 1, vh);
        data = img.data;
        for (i = 0; i < n; i++) {
          py = Math.max(0, Math.min(vh - 1, Math.round((i / (n - 1)) * (vh - 1))));
          idx = py * 4;
          this.profile[i] = lumaAt(data, idx);
          mean += this.profile[i];
        }
      } else {
        py = Math.max(0, Math.min(vh - 1, Math.round(t * (vh - 1))));
        img = this.workCtx.getImageData(0, py, vw, 1);
        data = img.data;
        for (i = 0; i < n; i++) {
          px = Math.max(0, Math.min(vw - 1, Math.round((i / (n - 1)) * (vw - 1))));
          idx = px * 4;
          this.profile[i] = lumaAt(data, idx);
          mean += this.profile[i];
        }
      }
      return mean / n;
    },

    energyAgainst: function (baseline) {
      if (!this.profile || !baseline || baseline.length !== this.profile.length) return 0;
      var s = 0;
      var i;
      for (i = 0; i < this.profile.length; i++) {
        var d = this.profile[i] - baseline[i];
        if (d < 0) d = -d;
        s += d;
      }
      return s / this.profile.length;
    },

    copyProfile: function () {
      if (!this.profile) return null;
      return Float32Array.from(this.profile);
    },

    draw: function (overlay, videoEl, now) {
      var ctx = overlay.getContext("2d");
      var w = overlay.width;
      var h = overlay.height;
      ctx.clearRect(0, 0, w, h);
      if (!this.placed && !videoEl) return;

      var flashing = this.isFlashing(now);
      var x;
      var y;
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";

      if (this.orientation === "vertical") {
        x = Math.round(this.t * (w - 1)) + 0.5;
        ctx.strokeStyle = flashing ? "#ffffff" : "rgba(232,255,61,0.95)";
        ctx.lineWidth = flashing ? 6 : 3;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        if (flashing) {
          ctx.strokeStyle = "rgba(255,255,255,0.35)";
          ctx.lineWidth = 18;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
      } else {
        y = Math.round(this.t * (h - 1)) + 0.5;
        ctx.strokeStyle = flashing ? "#ffffff" : "rgba(232,255,61,0.95)";
        ctx.lineWidth = flashing ? 6 : 3;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        if (flashing) {
          ctx.strokeStyle = "rgba(255,255,255,0.35)";
          ctx.lineWidth = 18;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
      }
    }
  };

  global.SplitLine = Line;
})(window);
