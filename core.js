/* ============================================================
   Keyboard — core：共通ヘルパー・テーマ・バックアップ・PWA・オーディオ基盤・トースト
   各モジュールは window.KB を通じて連携する（読み込み順：i18n → core → keyboard → tuner → metronome → looper → recorder → log → app）
   ============================================================ */
(() => {
  "use strict";
  const KB = window.KB = {};

  const $ = id => document.getElementById(id);
  // 表示（DOM）以外に出す文字列は翻訳レイヤーを通す（prompt / confirm / alert / 共有テキスト）
  const T = str => (window.KB_I18N ? KB_I18N.t(str) : str);
  if ($("langBtn")) $("langBtn").addEventListener("click", () => { if (window.KB_I18N) KB_I18N.toggle(); });

  // ---------- localStorage ヘルパー ----------
  function hasLS() { try { return typeof localStorage !== "undefined"; } catch (_) { return false; } }
  function lsGet(k, d) { if (!hasLS()) return d; try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }
  function lsSet(k, v) { if (hasLS()) try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  const pad2 = n => String(n).padStart(2, "0");
  const fmtClock = s => `${pad2(Math.floor(s / 60))}:${pad2(Math.floor(s % 60))}`;
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // ---------- テーマ切替 ----------
  const THEME_KEY = "keyboard_theme";
  function applyTheme(t) {
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
    const isDark = t === "dark" || (t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    $("themeBtn").textContent = isDark ? "☀️ ライト" : "🌙 ダーク";
  }
  applyTheme(lsGet(THEME_KEY, null));
  $("themeBtn").addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    lsSet(THEME_KEY, next); applyTheme(next);
  });

  // ---------- バックアップ（localStorage の keyboard_* をJSONで書き出し / 読み込み） ----------
  const bkDlg = $("backupDlg");
  $("backupBtn").addEventListener("click", () => { $("bkStatus").textContent = ""; bkDlg.showModal(); });
  $("bkClose").addEventListener("click", () => bkDlg.close());
  bkDlg.addEventListener("click", e => { if (e.target === bkDlg) bkDlg.close(); });
  $("bkExport").addEventListener("click", () => {
    const out = { app: "Keyboard", version: 1, exported: new Date().toISOString(), data: {} };
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith("keyboard_")) continue;
      try { out.data[k] = JSON.parse(localStorage.getItem(k)); } catch (_) {}
    }
    const blob = new Blob([JSON.stringify(out, null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `keyboard-backup-${todayStr()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $("bkStatus").textContent = `${Object.keys(out.data).length} 項目を書き出しました。`;
  });
  $("bkImport").addEventListener("change", async e => {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    let obj;
    try { obj = JSON.parse(await file.text()); } catch (_) { $("bkStatus").textContent = "JSONとして読み込めませんでした。"; return; }
    if (!obj || obj.app !== "Keyboard" || typeof obj.data !== "object") { $("bkStatus").textContent = "Keyboard のバックアップファイルではありません。"; return; }
    if (!confirm(T("このブラウザの現在のデータを、ファイルの内容で上書きします。よろしいですか？"))) return;
    for (const k of Object.keys(localStorage)) if (k.startsWith("keyboard_")) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(obj.data)) if (k.startsWith("keyboard_")) lsSet(k, v);
    $("bkStatus").textContent = "読み込みました。ページを再読み込みします…";
    setTimeout(() => location.reload(), 600);
  });

  // ---------- PWA：Service Worker 登録（http/https で開いたときのみ） ----------
  if ("serviceWorker" in navigator && /^https?:/.test(location.protocol)) {
    window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  }

  // ---------- オーディオ基盤（全モジュール共通） ----------
  let ctx = null;
  let appBus = null;        // 全アプリ音のバス（出力＋録音タップ）
  let recDest = null;

  function ensureCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    if (!appBus) {
      appBus = ctx.createGain();
      appBus.gain.value = 1;
      appBus.connect(ctx.destination);
      recDest = ctx.createMediaStreamDestination();
      appBus.connect(recDest);
    }
  }
  function outNode() { ensureCtx(); return appBus; }

  // iOS 対策：マナーモード（サイレントスイッチ）でも Web Audio が鳴るように、
  // 最初のタッチで無音の <audio> をループ再生してオーディオセッションを「再生」モードにする。
  // あわせて AudioContext もユーザー操作の中で作成・再開しておく。
  const SILENT_WAV = "data:audio/wav;base64,UklGRvQHAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YdAHAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";
  let unlocked = false;
  function unlockAudio() {
    if (unlocked) return;
    unlocked = true;
    try {
      const a = new Audio(SILENT_WAV);
      a.loop = true; a.volume = 0.01; a.setAttribute("playsinline", "");
      a.play().catch(() => {});
      window.__kbSilent = a;
    } catch (_) {}
    try { ensureCtx(); } catch (_) {}
  }
  for (const ev of ["pointerdown", "touchend", "keydown"]) window.addEventListener(ev, unlockAudio, { capture: true, passive: true });

  // ---- トースト ----
  let toastT = null;
  function goalToast(text) {
    let el = $("goalToast");
    if (!el) { el = document.createElement("div"); el.id = "goalToast"; el.className = "goal-toast"; document.body.appendChild(el); }
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove("show"), 2600);
  }
  Object.assign(KB, {
    $, T, hasLS, lsGet, lsSet, pad2, fmtClock, todayStr, escapeHtml,
    ensureCtx, outNode, goalToast,
    // recStream：全アプリ音（鍵盤・メトロノーム・伴奏ループ・ドローン）の MediaStream。本格録音（record/）が別トラックとして録る
    audio: { get ctx() { return ctx; }, get appBus() { return appBus; }, get recStream() { return recDest ? recDest.stream : null; } }
  });
})();
