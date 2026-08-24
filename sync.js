/* Split — session JSON, webhook sync, BYO OpenAI-compatible endpoint. No modules. */
(function (global) {
  "use strict";

  var STORE = "split.sync.v1";
  var SESSIONS = "split.sessions.v1";
  var MAX_SESSIONS = 20;

  function loadCfg() {
    try {
      return JSON.parse(localStorage.getItem(STORE) || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function saveCfg(cfg) {
    localStorage.setItem(STORE, JSON.stringify(cfg));
  }

  function rememberSession(payload) {
    var list = [];
    try {
      list = JSON.parse(localStorage.getItem(SESSIONS) || "[]") || [];
    } catch (e) {
      list = [];
    }
    list.unshift({ at: Date.now(), payload: payload });
    if (list.length > MAX_SESSIONS) list = list.slice(0, MAX_SESSIONS);
    localStorage.setItem(SESSIONS, JSON.stringify(list));
  }

  function lastSessions() {
    try {
      return JSON.parse(localStorage.getItem(SESSIONS) || "[]") || [];
    } catch (e) {
      return [];
    }
  }

  async function postWebhook(cfg, payload) {
    var url = (cfg.webhook || "").trim();
    if (!url) return { ok: false, skip: true, detail: "no webhook" };
    var headers = { "Content-Type": "application/json" };
    if (cfg.token) headers.Authorization = "Bearer " + cfg.token;
    var res = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, status: res.status, detail: res.ok ? "synced" : "webhook " + res.status };
  }

  function downloadJson(payload, name) {
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name || "split-session.json";
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 1000);
  }

  async function copyJson(payload) {
    var text = JSON.stringify(payload, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  }

  async function askModel(cfg, payload, question) {
    var base = (cfg.base || "").replace(/\/+$/, "");
    var model = (cfg.model || "").trim();
    var key = cfg.key || "";
    if (!base || !model) {
      return { ok: false, detail: "set base URL and model" };
    }
    var url = /\/chat\/completions$/.test(base) ? base : base + "/chat/completions";
    var headers = { "Content-Type": "application/json" };
    if (key) headers.Authorization = "Bearer " + key;
    var body = {
      model: model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You receive Split race JSON (finish-line camera). Reply with compact facts only: crossings, even split, next-must, vs goal. No coaching. No filler."
        },
        {
          role: "user",
          content: JSON.stringify({ question: question || "Sync and summarize this session.", session: payload })
        }
      ]
    };
    var res = await fetch(url, { method: "POST", headers: headers, body: JSON.stringify(body) });
    if (!res.ok) {
      return { ok: false, detail: "model " + res.status };
    }
    var data = await res.json();
    var text =
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;
    if (!text) return { ok: false, detail: "empty model reply" };
    return { ok: true, text: String(text), detail: "ok" };
  }

  global.SplitSync = {
    loadCfg: loadCfg,
    saveCfg: saveCfg,
    rememberSession: rememberSession,
    lastSessions: lastSessions,
    postWebhook: postWebhook,
    downloadJson: downloadJson,
    copyJson: copyJson,
    askModel: askModel
  };
})(window);
