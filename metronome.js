/* ============================================================
   Keyboard — metronome：スケジューラ・リズムグリッド・音色・練習モード・プリセット・共有URL
   ============================================================ */
(() => {
  "use strict";
  const KB = window.KB;
  const { $, T, lsGet, lsSet, hasLS, escapeHtml, ensureCtx, outNode, goalToast } = KB;
  const A = () => KB.audio.ctx;

  // ==========================================================
  //  メトロノーム・エンジン
  // ==========================================================
  let mRunning = false, mTimer = null;
  let mTempo = 120;
  let mBeatN = 4, mBeatD = 4;
  let mSubs = 1;
  let grid = [];       // grid[beat][sub] = 0(休) / 1(鳴) / 2(アクセント)
  let polyGrid = [];
  let polyOn = false, polyDiv = 3;
  let nextTime = 0, curBeat = 0, curSub = 0, curBar = 0;
  let barMuted = false;
  let visualMute = false;
  let counting = false, countBeat = 0, countBar = 0, countBarsTotal = 0;
  const LOOKAHEAD = 25, AHEAD = 0.12;

  const TEMPO_NAMES = [
    [40,"Grave"],[45,"Largo"],[50,"Lento"],[55,"Larghetto"],[65,"Adagio"],
    [72,"Andante"],[80,"Andantino"],[95,"Moderato"],[110,"Allegretto"],
    [132,"Allegro"],[160,"Vivace"],[184,"Presto"],[500,"Prestissimo"]
  ];
  const tempoName = t => { for (const [max, n] of TEMPO_NAMES) if (t <= max) return n; return ""; };

  let mVol = 1.0, volAccent = 1.7, volBeat = 1.0, volSub = 0.65;

  let metroMaster = null, metroLimiter = null;
  function ensureMetroBus() {
    if (metroMaster) return;
    metroLimiter = A().createDynamicsCompressor();
    metroLimiter.threshold.value = -2; metroLimiter.knee.value = 4;
    metroLimiter.ratio.value = 4; metroLimiter.attack.value = 0.004; metroLimiter.release.value = 0.08;
    metroMaster = A().createGain(); metroMaster.gain.value = 1;
    metroMaster.connect(metroLimiter).connect(outNode());
  }

  // ---- 音色 ----  role: "accent"/"beat"/"sub"/"count"/"poly"
  const VOICES = { beep: "電子ビープ", click: "クリック（木製）", cowbell: "カウベル", woodblock: "ウッドブロック", tick: "ソフトTick" };
  let voice = "beep";
  for (const [k, name] of Object.entries(VOICES)) { const o = document.createElement("option"); o.value = k; o.textContent = name; $("voiceSel").appendChild(o); }
  $("voiceSel").value = voice;
  function roleGain(role) {
    if (role === "accent") return volAccent;
    if (role === "beat" || role === "count") return volBeat;
    if (role === "sub") return volSub;
    if (role === "poly") return volBeat;
    return 1;
  }
  function roleFreq(role) {
    switch (role) {
      case "accent": return 1760;
      case "beat":   return 1320;
      case "sub":    return 990;
      case "count":  return 1500;
      case "poly":   return 660;
      default:       return 1200;
    }
  }
  function playVoice(t, role) {
    ensureMetroBus();
    if (visualMute) return;
    metroMaster.gain.setValueAtTime(mVol, t);
    const g = A().createGain();
    const amp = roleGain(role);
    const f = roleFreq(role);
    const vc = voice;
    let o;
    if (vc === "beep") {
      o = A().createOscillator(); o.type = "square"; o.frequency.value = f;
      const dur = role === "accent" ? 0.075 : 0.045;
      g.gain.setValueAtTime((role === "accent" ? 0.7 : 0.55) * amp, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(metroMaster); o.start(t); o.stop(t + dur + 0.02);
    } else if (vc === "click") {
      o = noiseBurst(t, 0.02); const bp = A().createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = f * 1.4; bp.Q.value = 6;
      g.gain.setValueAtTime(0.9 * amp, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      o.connect(bp).connect(g).connect(metroMaster);
    } else if (vc === "cowbell") {
      const o1 = A().createOscillator(), o2 = A().createOscillator();
      o1.type = o2.type = "square";
      o1.frequency.value = f * 0.8; o2.frequency.value = f * 1.19;
      g.gain.setValueAtTime(0.4 * amp, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      const bp = A().createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 2;
      o1.connect(bp); o2.connect(bp); bp.connect(g).connect(metroMaster);
      o1.start(t); o2.start(t); o1.stop(t + 0.13); o2.stop(t + 0.13);
    } else if (vc === "woodblock") {
      o = A().createOscillator(); o.type = "triangle"; o.frequency.setValueAtTime(f * 1.6, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.9, t + 0.03);
      g.gain.setValueAtTime(0.8 * amp, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g).connect(metroMaster); o.start(t); o.stop(t + 0.06);
    } else { // tick
      o = A().createOscillator(); o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.5 * amp, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      o.connect(g).connect(metroMaster); o.start(t); o.stop(t + 0.04);
    }
  }
  function noiseBurst(t, dur) {
    const n = Math.floor(A().sampleRate * dur);
    const buf = A().createBuffer(1, n, A().sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = A().createBufferSource(); src.buffer = buf; src.start(t); src.stop(t + dur);
    return src;
  }

  // ---- グリッド ----
  let accentGroups = null; // [3,2,2] など。null=自動（小節頭のみ）
  function initGrid(fill) {
    grid = Array.from({ length: mBeatN }, (_, b) =>
      Array.from({ length: mSubs }, (_, s) => (fill ? (fill(b, s) ? 1 : 0) : (s === 0 ? 1 : 0))));
    applyAutoAccents();
  }
  function applyAutoAccents() {
    for (let b = 0; b < mBeatN; b++)
      for (let s = 0; s < mSubs; s++)
        if (grid[b][s] === 2) grid[b][s] = 1;
    const heads = accentGroups ? groupHeads(accentGroups) : [0];
    for (const b of heads) if (grid[b] && grid[b][0] !== 0) grid[b][0] = 2;
  }
  function groupHeads(groups) {
    const heads = []; let acc = 0;
    for (const g of groups) { heads.push(acc % mBeatN); acc += g; }
    return heads;
  }
  function renderGrid() {
    const wrap = $("mGrid"); wrap.innerHTML = "";
    for (let b = 0; b < mBeatN; b++) {
      const beatBox = document.createElement("div"); beatBox.className = "mg-beat";
      for (let s = 0; s < mSubs; s++) {
        const c = document.createElement("div");
        c.dataset.b = b; c.dataset.s = s;
        c.title = `${b + 1}拍目${mSubs > 1 ? ` (${s + 1}/${mSubs})` : ""}`;
        setCellClass(c, b, s);
        c.addEventListener("click", () => {
          grid[b][s] = (grid[b][s] + 1) % 3;
          setCellClass(c, b, s);
          clearChipSel();
        });
        beatBox.appendChild(c);
      }
      wrap.appendChild(beatBox);
    }
    renderPolyGrid();
    updateSummaries();
  }
  function setCellClass(c, b, s) {
    const v = grid[b][s];
    c.className = "mg-cell " + (v === 0 ? "off" : v === 2 ? "accent head" : (s === 0 ? "head" : "on"));
  }
  function cellAt(b, s) { return $("mGrid").querySelector(`[data-b="${b}"][data-s="${s}"]`); }

  function initPolyGrid() {
    polyGrid = Array.from({ length: mBeatN }, () => Array.from({ length: polyDiv }, () => 1));
  }
  function renderPolyGrid() {
    const wrap = $("mGridPoly");
    if (!polyOn) { wrap.hidden = true; wrap.innerHTML = ""; return; }
    wrap.hidden = false; wrap.innerHTML = "";
    for (let b = 0; b < mBeatN; b++) {
      const box = document.createElement("div"); box.className = "mg-beat";
      for (let s = 0; s < polyDiv; s++) {
        const c = document.createElement("div");
        c.className = "mg-cell poly " + (s === 0 ? "head on" : "on");
        c.dataset.b = b; c.dataset.s = s;
        box.appendChild(c);
      }
      wrap.appendChild(box);
    }
  }
  function polyCellAt(b, s) { return $("mGridPoly").querySelector(`[data-b="${b}"][data-s="${s}"]`); }

  // ---- リズムプリセット ----
  const PRESETS = {
    beat:       { subs: 1, fill: () => true },
    eighth:     { subs: 2, fill: () => true },
    triplet:    { subs: 3, fill: () => true },
    tripletmid: { subs: 3, fill: (b, s) => s !== 1 },
    sixteenth:  { subs: 4, fill: () => true },
    offbeat:    { subs: 2, fill: (b, s) => s === 1 },
    clave:      { subs: 4, fill: (b, s) => (b % 2 === 0 ? (s === 0 || s === 3) : s === 2) }
  };
  function clearChipSel() {
    document.querySelectorAll("#mChips .chip.sel").forEach(c => c.classList.remove("sel"));
    updateSummaries();
  }
  $("mChips").addEventListener("click", e => {
    const btn = e.target.closest(".chip"); if (!btn) return;
    const p = PRESETS[btn.dataset.p];
    mSubs = p.subs; $("subSel").value = String(p.subs);
    initGrid(p.fill); renderGrid();
    document.querySelectorAll("#mChips .chip.sel").forEach(c => c.classList.remove("sel"));
    btn.classList.add("sel");
    curSub = 0;
  });

  // ---- サマリー ----
  function updateSummaries() {
    $("sumAccent").textContent = accentGroups ? accentGroups.join("+") : "自動";
    $("sumSound").textContent = VOICES[voice];
    $("sumVol").textContent = Math.round(mVol * 100) + "%・" + VOL_PRESETS[volPreset].name;
    $("sumCount").textContent = $("countInOn").checked ? (`${$("countInBars").value}小節`) : "なし";
    $("sumPoly").textContent = polyOn ? `${polyDiv}:${mSubs}` : "オフ";
    refreshPolyHint();
    const gap = $("gapSel").value, tr = $("trainerOn").checked;
    $("sumPractice").textContent = (gap === "off" && !tr) ? "オフ" : "オン";
    if (KB.lpSyncSig) KB.lpSyncSig();
  }

  function currentSig() { return { n: mBeatN, d: mBeatD }; }

  // ---- スケジューラ ----
  function decideBarMute(barIdx) {
    const mode = $("gapSel").value;
    if (mode === "alt") return barIdx % 2 === 1;
    if (mode === "31") return barIdx % 4 === 3;
    if (mode === "rand") return Math.random() < 0.4;
    return false;
  }
  function scheduleAt(delayMs, fn) { setTimeout(fn, Math.max(0, delayMs)); }

  function scheduler() {
    const beatDur = 60 / mTempo;
    while (nextTime < A().currentTime + AHEAD) {
      if (counting) {
        const sig = currentSig();
        playVoice(nextTime, countBeat === 0 ? "accent" : "count");
        const cb = countBeat, cbar = countBar;
        scheduleAt((nextTime - A().currentTime) * 1000, () => {
          $("mgBar").textContent = `カウント ${cbar + 1}/${countBarsTotal}・${cb + 1}`;
        });
        nextTime += beatDur;
        countBeat++;
        if (countBeat >= sig.n) { countBeat = 0; countBar++; if (countBar >= countBarsTotal) counting = false; }
        continue;
      }

      const subDur = beatDur / mSubs;
      const isBeatHead = curSub === 0;
      const isBarHead = isBeatHead && curBeat === 0;

      if (isBarHead) {
        barMuted = decideBarMute(curBar);
        if ($("trainerOn").checked && curBar > 0) {
          const every = Math.max(1, +$("trainerBars").value || 4);
          if (curBar % every === 0) setTempo(0, mTempoExact + (+$("trainerStep").value || 5));
        }
        const barNow = curBar, mutedNow = barMuted;
        scheduleAt((nextTime - A().currentTime) * 1000, () => {
          $("mgBar").textContent = "小節 " + (barNow + 1) + (mutedNow ? "（無音）" : "");
        });
      }

      // 主声
      const cell = grid[curBeat] && grid[curBeat][curSub];
      if (cell && !barMuted) playVoice(nextTime, cell === 2 ? "accent" : (isBeatHead ? "beat" : "sub"));

      // プレイヘッド
      const b = curBeat, s = curSub, mb = barMuted;
      scheduleAt((nextTime - A().currentTime) * 1000, () => {
        document.querySelectorAll(".mg-cell.playing").forEach(c => c.classList.remove("playing", "muted-bar"));
        const c = cellAt(b, s);
        if (c) { c.classList.add("playing"); if (mb) c.classList.add("muted-bar"); }
      });

      // 第2声（ポリリズム）
      if (polyOn && isBeatHead && !barMuted) {
        const polySubDur = beatDur / polyDiv;
        for (let k = 0; k < polyDiv; k++) {
          const pt = nextTime + k * polySubDur;
          playVoice(pt, "poly");
          const bb = curBeat, kk = k;
          scheduleAt((pt - A().currentTime) * 1000, () => {
            document.querySelectorAll(".mg-cell.poly.playing").forEach(c => c.classList.remove("playing"));
            const pc = polyCellAt(bb, kk);
            if (pc) { pc.classList.add("playing"); setTimeout(() => pc.classList.remove("playing"), Math.max(40, polySubDur * 1000 * 0.6)); }
          });
        }
      }

      nextTime += subDur;
      curSub++;
      if (curSub >= mSubs) {
        curSub = 0; curBeat++;
        if (curBeat >= mBeatN) { curBeat = 0; curBar++; }
      }
    }
  }

  function startMetro() {
    ensureCtx();
    mRunning = true;
    KB.autoStartLog();
    curBeat = 0; curSub = 0; curBar = 0; barMuted = false;
    if ($("countInOn").checked) {
      counting = true; countBeat = 0; countBar = 0;
      countBarsTotal = Math.max(1, Math.min(4, +$("countInBars").value || 1));
    } else counting = false;
    $("mgBar").textContent = counting ? "カウント…" : "小節 1";
    nextTime = A().currentTime + 0.08;
    mTimer = setInterval(scheduler, LOOKAHEAD);
    $("metroBtn").textContent = "■ 停止";
    $("metroBtn").classList.add("on");
  }
  function stopMetro() {
    mRunning = false; clearInterval(mTimer);
    document.querySelectorAll(".mg-cell.playing").forEach(c => c.classList.remove("playing", "muted-bar"));
    $("metroBtn").textContent = "▶ 開始";
    $("metroBtn").classList.remove("on");
  }
  $("metroBtn").addEventListener("click", () => { mRunning ? stopMetro() : startMetro(); });

  // ---- 視覚のみ / フラッシュ ----
  $("muteBtn").addEventListener("click", () => {
    visualMute = !visualMute;
    $("muteBtn").classList.toggle("on", visualMute);
    $("muteBtn").textContent = visualMute ? "🔈 音を出す" : "🔇 視覚のみ";
  });
  // ---- テンポ ----
  let mTempoExact = 120;
  const TEMPO_MAX = 100000, TEMPO_MIN = 0.01;
  function fmtTempo(v) { return v >= 20 ? Math.round(v) : Math.round(v * 100) / 100; }
  function setTempo(t, exact) {
    mTempoExact = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, exact !== undefined ? exact : t));
    mTempo = mTempoExact;
    $("mTempoIn").value = fmtTempo(mTempo);
    $("tempoSlider").value = Math.max(15, Math.min(400, mTempo));
    $("mTempoName").textContent = tempoName(Math.round(mTempo));
  }
  $("mTempoIn").addEventListener("change", e => {
    const v = +e.target.value; if (v > 0) setTempo(v); else $("mTempoIn").value = fmtTempo(mTempo);
  });
  $("mTempoIn").addEventListener("keydown", e => { if (e.key === "Enter") e.target.blur(); });
  $("tempoSlider").addEventListener("input", e => setTempo(+e.target.value));
  $("tempoDown").addEventListener("click", () => setTempo(0, mTempoExact - 1));
  $("tempoUp").addEventListener("click", () => setTempo(0, mTempoExact + 1));
  for (const [id, d] of [["tempoDown", -1], ["tempoUp", 1]]) {
    let hold = null; const el = $(id);
    const start = () => { clearInterval(hold); hold = setInterval(() => setTempo(0, mTempoExact + d), 90); };
    const end = () => clearInterval(hold);
    el.addEventListener("mousedown", start);
    el.addEventListener("touchstart", start, { passive: true });
    for (const ev of ["mouseup", "mouseleave", "touchend", "touchcancel"]) el.addEventListener(ev, end);
  }

  // ---- BPM計算機 ----
  function applyMul(num, den) { setTempo(0, mTempoExact * num / den); }
  document.querySelectorAll(".cbtn[data-mul]").forEach(b => {
    b.addEventListener("click", () => {
      const m = b.dataset.mul;
      if (m === "0.5") applyMul(1, 2);
      else if (m === "2") applyMul(2, 1);
      else if (m === "0.333333") applyMul(1, 3);
      else if (m === "3") applyMul(3, 1);
    });
  });
  const clampN = () => { const n = Math.max(0.01, Math.min(100, +$("calcN").value || 2)); $("calcN").value = n; return n; };
  $("calcMul").addEventListener("click", () => applyMul(clampN(), 1));
  $("calcDiv").addEventListener("click", () => applyMul(1, clampN()));

  // ---- 音量スライダー群 ----
  function bindVol(id, valId, setter) {
    $(id).addEventListener("input", e => {
      const v = +e.target.value; setter(v / 100); $(valId).textContent = v + "%";
      updateSummaries();
    });
  }
  bindVol("volSlider", "mVolVal", v => mVol = v);
  // 役割別音量はプリセットで切替（アクセント / 拍 / 分割 の比率）
  const VOL_PRESETS = {
    normal: { name: "標準",           accent: 1.7, beat: 1.0, sub: 0.65 },
    flat:   { name: "フラット",       accent: 1.0, beat: 1.0, sub: 1.0 },
    accent: { name: "アクセント強調", accent: 2.0, beat: 1.0, sub: 0.7 },
    subq:   { name: "裏を弱く",       accent: 1.7, beat: 1.0, sub: 0.35 }
  };
  let volPreset = "normal";
  function setVolPreset(k) {
    const p = VOL_PRESETS[k] || VOL_PRESETS.normal;
    volPreset = k in VOL_PRESETS ? k : "normal";
    volAccent = p.accent; volBeat = p.beat; volSub = p.sub;
    document.querySelectorAll("#vbPresets .chip").forEach(c => c.classList.toggle("sel", c.dataset.vp === volPreset));
    updateSummaries();
  }
  $("vbPresets").addEventListener("click", e => { const b = e.target.closest(".chip"); if (b) setVolPreset(b.dataset.vp); });

  // ---- 音色 ----
  $("voiceSel").addEventListener("change", e => { voice = e.target.value; updateSummaries(); });
  // ---- 拍子・分割 ----
  function resizeGrid() {
    const old = grid;
    grid = Array.from({ length: mBeatN }, (_, b) =>
      Array.from({ length: mSubs }, (_, s) =>
        old[b] && old[b][s] !== undefined ? old[b][s] : (s === 0 ? 1 : 0)));
    if (polyOn) initPolyGrid();
    applyAutoAccents();
    renderGrid();
    curBeat = 0; curSub = 0;
  }
  $("beatN").addEventListener("change", e => {
    mBeatN = Math.max(1, Math.min(64, Math.round(+e.target.value || 4)));
    e.target.value = mBeatN; accentGroups = null; $("groupIn").value = ""; resizeGrid();
  });
  $("beatD").addEventListener("change", e => {
    mBeatD = Math.max(1, Math.min(64, Math.round(+e.target.value || 4)));
    e.target.value = mBeatD; updateSummaries();
  });
  $("subSel").addEventListener("change", e => {
    mSubs = Math.max(1, Math.min(32, Math.round(+e.target.value || 1)));
    e.target.value = mSubs; clearChipSel(); resizeGrid();
  });

  // ---- アクセント／グルーピング ----
  $("groupApply").addEventListener("click", () => {
    const raw = $("groupIn").value.trim();
    if (!raw) { accentGroups = null; applyAutoAccents(); renderGrid(); return; }
    const parts = raw.split("+").map(x => parseInt(x.trim(), 10)).filter(x => x > 0);
    const sum = parts.reduce((a, b) => a + b, 0);
    if (parts.length && sum === mBeatN) {
      accentGroups = parts;
    } else if (parts.length && sum !== mBeatN) {
      mBeatN = sum; $("beatN").value = sum; accentGroups = parts; resizeGrid();
    }
    applyAutoAccents(); renderGrid();
  });
  $("groupIn").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("groupApply").click(); } });

  // ---- カウントイン ----
  for (const id of ["countInOn", "countInBars"]) $(id).addEventListener("change", updateSummaries);
  for (const id of ["gapSel", "trainerOn"]) $(id).addEventListener("change", updateSummaries);

  // ---- ポリリズム ----
  function refreshPolyHint() { $("polyHint").textContent = `→ ${polyDiv} : ${mSubs}`; }
  $("polyOn").addEventListener("change", e => {
    polyOn = e.target.checked;
    if (polyOn) initPolyGrid();
    renderGrid(); refreshPolyHint(); updateSummaries();
  });
  $("polyDiv").addEventListener("change", e => {
    polyDiv = Math.max(1, Math.min(32, Math.round(+e.target.value || 3)));
    e.target.value = polyDiv;
    if (polyOn) { initPolyGrid(); renderPolyGrid(); }
    refreshPolyHint(); updateSummaries();
  });

  // ---- TAP ----
  let taps = [];
  $("tapBtn").addEventListener("click", () => {
    const now = performance.now();
    taps = taps.filter(t => now - t < 3000); taps.push(now);
    if (taps.length >= 2) {
      const iv = []; for (let i = 1; i < taps.length; i++) iv.push(taps[i] - taps[i - 1]);
      setTempo(60000 / (iv.reduce((a, b) => a + b) / iv.length));
    }
  });

  // ---- メトロノーム設定プリセット ----
  const LS_KEY = "keyboard_metroPresets_v1";
  function loadPresets() { return lsGet(LS_KEY, {}); }
  function savePresets(o) { lsSet(LS_KEY, o); }
  function snapshot() {
    return {
      tempo: mTempoExact, beatN: mBeatN, beatD: mBeatD, subs: mSubs,
      grid, accentGroups, voice,
      vol: mVol, volPreset,
      polyOn, polyDiv,
      countIn: $("countInOn").checked, countBars: +$("countInBars").value,
      gap: $("gapSel").value, trainerOn: $("trainerOn").checked,
      trainerBars: +$("trainerBars").value, trainerStep: +$("trainerStep").value
    };
  }
  function restore(s) {
    setTempo(0, s.tempo);
    mBeatN = s.beatN; mBeatD = s.beatD; mSubs = s.subs;
    $("beatN").value = mBeatN; $("beatD").value = mBeatD; $("subSel").value = mSubs;
    accentGroups = s.accentGroups || null;
    if (s.grid) grid = s.grid.map(r => r.slice()); else initGrid();
    if (grid.length !== mBeatN || (grid[0] && grid[0].length !== mSubs)) resizeGrid();
    $("groupIn").value = accentGroups ? accentGroups.join("+") : "";
    voice = s.voice || "beep"; $("voiceSel").value = voice;
    mVol = s.vol;
    $("volSlider").value = Math.round(mVol * 100); $("mVolVal").textContent = Math.round(mVol * 100) + "%";
    setVolPreset(s.volPreset || "normal");
    polyOn = !!s.polyOn; polyDiv = s.polyDiv || 3; $("polyOn").checked = polyOn; $("polyDiv").value = polyDiv;
    if (polyOn) initPolyGrid();
    $("countInOn").checked = !!s.countIn; $("countInBars").value = s.countBars || 1;
    $("gapSel").value = s.gap || "off"; $("trainerOn").checked = !!s.trainerOn;
    $("trainerBars").value = s.trainerBars || 4; $("trainerStep").value = s.trainerStep || 5;
    refreshPolyHint(); renderGrid(); updateSummaries();
  }
  function renderPresetList() {
    const wrap = $("presetList"); wrap.innerHTML = "";
    const ps = loadPresets();
    const names = Object.keys(ps);
    $("sumPreset").textContent = names.length ? `${names.length}件` : "";
    if (!names.length) { wrap.innerHTML = `<p class="note" style="margin:0">保存済みプリセットはありません。</p>`; }
    names.forEach(name => {
      const row = document.createElement("div"); row.className = "preset-row";
      row.innerHTML = `<span>${escapeHtml(name)}</span>`;
      const load = document.createElement("button"); load.className = "row-load"; load.textContent = "呼び出し";
      load.addEventListener("click", () => restore(ps[name]));
      const del = document.createElement("button"); del.className = "row-del"; del.textContent = "✕";
      del.addEventListener("click", () => { const o = loadPresets(); delete o[name]; savePresets(o); renderPresetList(); });
      row.appendChild(load); row.appendChild(del); wrap.appendChild(row);
    });
    if (!hasLS()) $("presetNote").textContent = "※この環境では保存が使えない場合があります。";
  }
  $("presetSave").addEventListener("click", () => {
    const name = ($("presetName").value || "").trim(); if (!name) { $("presetName").focus(); return; }
    const o = loadPresets(); o[name] = snapshot(); savePresets(o);
    $("presetName").value = ""; renderPresetList();
  });
  $("presetName").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("presetSave").click(); } });

  // ---- 共有URL：メトロノーム設定を #m= に埋め込む ----
  function b64u(str) { return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function unb64u(str) { return decodeURIComponent(escape(atob(str.replace(/-/g, "+").replace(/_/g, "/")))); }
  function shareUrl() {
    const sn = snapshot();
    const c = { t: +mTempoExact.toFixed(2), n: sn.beatN, d: sn.beatD, s: sn.subs, g: sn.grid.map(r => r.join("")).join("|"),
      a: sn.accentGroups || undefined, v: sn.voice !== "beep" ? sn.voice : undefined, vp: sn.volPreset !== "normal" ? sn.volPreset : undefined,
      p: sn.polyOn ? sn.polyDiv : undefined, c: sn.countIn ? sn.countBars : undefined, gp: sn.gap !== "off" ? sn.gap : undefined,
      tr: sn.trainerOn ? [sn.trainerBars, sn.trainerStep] : undefined };
    return location.origin + location.pathname + "#m=" + b64u(JSON.stringify(c));
  }
  function loadShared() {
    const m = location.hash.match(/[#&]m=([A-Za-z0-9_-]+)/);
    if (!m) return;
    try {
      const c = JSON.parse(unb64u(m[1]));
      const grid = String(c.g || "").split("|").map(r => r.split("").map(Number));
      restore({
        tempo: +c.t || 120, beatN: +c.n || 4, beatD: +c.d || 4, subs: +c.s || 1, grid: grid.length && grid[0].length ? grid : null,
        accentGroups: Array.isArray(c.a) ? c.a : null, voice: c.v || "beep", vol: 1, volPreset: c.vp || "normal",
        polyOn: !!c.p, polyDiv: +c.p || 3, countIn: !!c.c, countBars: +c.c || 1, gap: c.gp || "off",
        trainerOn: Array.isArray(c.tr), trainerBars: c.tr ? c.tr[0] : 4, trainerStep: c.tr ? c.tr[1] : 5
      });
      const tab = document.querySelector('.tab[data-tab="metro"]');
      if (!tab.classList.contains("active")) tab.click();
      history.replaceState(null, "", location.pathname);
      goalToast("🔗 共有されたメトロノーム設定を読み込みました");
    } catch (_) {}
  }
  $("shareBtn").addEventListener("click", async () => {
    const url = shareUrl();
    const text = T(`${fmtTempo(mTempoExact)} BPM ・ ${mBeatN}/${mBeatD}${mSubs > 1 ? ` ・ ${mSubs}連` : ""} — Keyboard メトロノーム`);
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) { await navigator.share({ title: "Keyboard", text, url }); return; }
      await navigator.clipboard.writeText(url);
      goalToast("🔗 共有URLをコピーしました");
    } catch (_) { prompt(T("この URL をコピーして共有してください"), url); }
  });

  KB.metro = {
    get subs() { return mSubs; }, get grid() { return grid; }, get tempo() { return mTempoExact; },
    get beatN() { return mBeatN; }, get beatD() { return mBeatD; },
    currentSig, playVoice, scheduleAt, setTempo, fmtTempo,
    init() { setTempo(120); initGrid(); renderGrid(); refreshPolyHint(); renderPresetList(); updateSummaries(); loadShared(); }
  };
})();
