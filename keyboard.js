/* ============================================================
   Keyboard — keyboard：鍵盤（合成・描画・PCキー・マルチタッチ・MIDI・練習ハブ）
   ============================================================ */
(() => {
  "use strict";
  const KB = window.KB;
  const { $, T, lsGet, lsSet, ensureCtx, outNode } = KB;
  const A = () => KB.audio.ctx;
  const active = new Map(); // midi -> {oscs, master}

  // ==========================================================
  //  鍵盤
  // ==========================================================
  // 音名表記：管楽器で一般的な英語音名（黒鍵は Db Eb F# Ab Bb）
  const NOTE_NAMES = ["C","Db","D","Eb","E","F","F#","G","Ab","A","Bb","B"];
  const BLACK_PCS = new Set([1, 3, 6, 8, 10]);
  const isBlack = n => BLACK_PCS.has(n % 12);
  // 表示範囲: A0(MIDI21) 〜 C8(MIDI108)
  const START = 21, END = 108;
  let baseA = 442;
  let transpose = 0;    // 移調（管）による半音シフト
  let octShift = 0;     // オクターブ移動
  let justMode = false; // 純正律モード
  let rootPc = 0;       // 純正律の主音（0=C 〜 11=B）

  // 純正律（5リミット）: 主音からの各度数の純正な整数比 → 平均律との差（セント）
  const JUST_RATIOS = [[1,1],[16,15],[9,8],[6,5],[5,4],[4,3],[45,32],[3,2],[8,5],[5,3],[16,9],[15,8]];
  const JUST_CENTS = JUST_RATIOS.map(([a, b], i) => 1200 * Math.log2(a / b) - i * 100);


  // 実音MIDI → 周波数（基準ピッチ・音律を反映）
  function soundingFreq(sounding) {
    let cents = 0;
    if (justMode) {
      const degree = (((sounding - rootPc) % 12) + 12) % 12;
      cents = JUST_CENTS[degree];
    }
    return baseA * Math.pow(2, (sounding - 69) / 12 + cents / 1200);
  }
  // 鍵盤MIDI（記譜音）→ 移調・オクターブを足した実音の周波数
  function freq(midi) { return soundingFreq(midi + transpose + octShift * 12); }

  // 加算合成：奇数倍音のみ・なめらかな減衰（三角波寄りの柔らかい音）
  // 低い基音は小型スピーカーで鳴らないので倍音群で音高を知覚させる
  const ROLLOFF = 1.7;
  // 鍵盤の音色：倍音構成の違い
  const TIMBRES = {
    soft:  { name: "標準（丸い）",  amp: n => (n % 2 ? Math.pow(n, -ROLLOFF) : 0) },                 // 奇数倍音・三角波寄り
    sine:  { name: "サイン波",      amp: n => (n === 1 ? 1 : 0) },
    organ: { name: "オルガン",      amp: n => ({ 1: 1, 2: .6, 3: .4, 4: .3, 6: .15, 8: .1 })[n] || 0 }, // ドローバー風
    brass: { name: "ブラス風",      amp: n => Math.pow(n, -1.1) }                                       // 全倍音・明るい
  };
  let timbre = "soft";
  function voicePartials(base) {
    const raw = [];
    const MAX_F = 6000, MAX_N = 21;
    const ampOf = TIMBRES[timbre].amp;
    for (let n = 1; n <= MAX_N && n * base <= MAX_F; n++) {
      const f = n * base;
      let amp = ampOf(n);
      if (!amp) continue;
      if (f < 200) amp *= Math.max(0.15, f / 200);
      if (f > 4000) amp *= Math.max(0, 1 - (f - 4000) / 5000);
      if (amp >= 0.0015) raw.push({ h: n, g: amp });
    }
    if (raw.length === 0) raw.push({ h: 1, g: 1 });
    const total = raw.reduce((s, p) => s + p.g, 0);
    return raw.map(p => ({ h: p.h, g: p.g / total }));
  }
  function noteOn(midi) {
    ensureCtx();
    if (active.has(midi)) return;
    const base = freq(midi);
    const v = $("vol").value / 100;
    const master = A().createGain();
    master.gain.setValueAtTime(0, A().currentTime);
    master.gain.linearRampToValueAtTime(v, A().currentTime + 0.01);
    master.connect(outNode());
    const oscs = [];
    for (const p of voicePartials(base)) {
      const osc = A().createOscillator();
      osc.type = "sine";
      osc.frequency.value = base * p.h;
      const g = A().createGain();
      g.gain.value = p.g;
      osc.connect(g).connect(master);
      osc.start();
      oscs.push({ osc, h: p.h });
    }
    active.set(midi, { oscs, master });
    setKey(midi, true);
    hubShowNote(midi, base);
    KB.autoStartLog();
    KB.lpTapNote("on", midi);
  }
  function noteOff(midi) {
    const node = active.get(midi);
    if (!node) return;
    const t = A().currentTime;
    node.master.gain.cancelScheduledValues(t);
    node.master.gain.setValueAtTime(node.master.gain.value, t);
    node.master.gain.linearRampToValueAtTime(0, t + 0.08);
    for (const o of node.oscs) o.osc.stop(t + 0.09);
    active.delete(midi);
    setKey(midi, false);
    KB.lpTapNote("off", midi);
  }
  function setKey(midi, on) {
    const el = document.querySelector(`[data-midi="${midi}"]`);
    if (el) el.classList.toggle("active", on);
  }

  // ---- 鍵盤描画 ----
  const kb = $("keyboard");
  let whiteW = 40, blackW = 26;   // 鍵盤サイズ（設定で 30 / 40 / 50）
  let whiteIndex = 0;
  const blacks = [];
  const labelEls = [];
  function noteName(midi) {
    return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
  }
  for (let m = START; m <= END; m++) {
    if (!isBlack(m)) {
      const el = document.createElement("div");
      el.className = "white";
      el.dataset.midi = m;
      if (NOTE_NAMES[m % 12] === "C") {
        const lab = document.createElement("span");
        lab.className = "notelabel";
        el.appendChild(lab);
        labelEls.push({ el: lab, midi: m });
      }
      kb.appendChild(el);
      el._x = whiteIndex * whiteW;
      whiteIndex++;
    } else {
      blacks.push(m);
    }
  }
  function updateLabels() {
    for (const { el, midi } of labelEls) el.textContent = noteName(midi + transpose + octShift * 12);
  }
  for (const m of blacks) {
    const prevWhite = kb.querySelector(`[data-midi="${m-1}"]`);
    if (!prevWhite) continue;
    const el = document.createElement("div");
    el.className = "black";
    el.dataset.midi = m;
    kb.appendChild(el);
  }
  // 鍵盤サイズを適用（白鍵幅から黒鍵の位置・高さを計算）
  function applyKeySize(w) {
    whiteW = w; blackW = Math.round(w * 0.65);
    const h = Math.round(w * 5), bh = Math.round(h * 0.625);
    kb.style.setProperty("--kw", w + "px"); kb.style.setProperty("--kh", h + "px");
    kb.style.setProperty("--bw", blackW + "px"); kb.style.setProperty("--bh", bh + "px");
    let i = 0;
    for (const el of kb.querySelectorAll(".white")) { el._x = i * w; i++; }
    for (const el of kb.querySelectorAll(".black")) {
      const prev = kb.querySelector(`[data-midi="${+el.dataset.midi - 1}"]`);
      el.style.left = (prev._x + w - blackW / 2) + "px";
    }
    document.querySelectorAll("#keySize .chip").forEach(c => c.classList.toggle("sel", +c.dataset.kw === w));
  }
  $("keySize").addEventListener("click", e => {
    const b = e.target.closest(".chip"); if (!b) return;
    applyKeySize(+b.dataset.kw); saveKbSettings();
  });
  $("timbreSel").addEventListener("change", e => { timbre = e.target.value in TIMBRES ? e.target.value : "soft"; saveKbSettings(); });
  for (const [k, v] of Object.entries(TIMBRES)) { const o = document.createElement("option"); o.value = k; o.textContent = v.name; $("timbreSel").appendChild(o); }

  // ---- 保持（ホールド）モード ----
  let holdMode = false;
  const holdBtn = $("holdBtn");
  holdBtn.addEventListener("click", () => {
    holdMode = !holdMode;
    holdBtn.textContent = holdMode ? "ON" : "OFF";
    holdBtn.classList.toggle("on", holdMode);
    saveKbSettings();
  });
  $("stopBtn").addEventListener("click", () => {
    for (const m of [...active.keys()]) noteOff(m);
    sustained.clear();
    pointerNotes.clear();
    keyHeld.clear();
  });

  // ---- サステインペダル（スペースキー） ----
  let sustainOn = false;
  const sustained = new Set();

  // ---- ポインタ操作（マルチタッチ対応） ----
  const pointerNotes = new Map();
  function midiFromEvent(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    return el && el.dataset.midi ? parseInt(el.dataset.midi) : null;
  }
  function noteHeldElsewhere(m, exceptPid) {
    for (const [pid, mm] of pointerNotes) if (pid !== exceptPid && mm === m) return true;
    for (const v of keyHeld.values()) if (v === m) return true;
    return false;
  }
  kb.addEventListener("pointerdown", e => {
    e.preventDefault();
    const m = midiFromEvent(e);
    if (m === null) return;
    if (pickRoot) {
      rootPc = (((m + transpose + octShift * 12) % 12) + 12) % 12;
      setPickRoot(false);
      updateRootHighlight();
      refreshFreqs();
      saveKbSettings();
      return;
    }
    if (holdMode) {
      if (active.has(m)) noteOff(m); else noteOn(m);
      return;
    }
    try { kb.setPointerCapture(e.pointerId); } catch (_) {}
    pointerNotes.set(e.pointerId, m);
    noteOn(m);
  });
  kb.addEventListener("pointermove", e => {
    if (holdMode || !pointerNotes.has(e.pointerId)) return;
    const m = midiFromEvent(e);
    const cur = pointerNotes.get(e.pointerId);
    if (m === cur) return;
    if (cur != null && !noteHeldElsewhere(cur, e.pointerId)) noteOff(cur);
    pointerNotes.set(e.pointerId, m);
    if (m != null) noteOn(m);
  });
  function endPointer(e) {
    if (!pointerNotes.has(e.pointerId)) return;
    const m = pointerNotes.get(e.pointerId);
    pointerNotes.delete(e.pointerId);
    if (m != null && !noteHeldElsewhere(m, e.pointerId)) {
      if (sustainOn) sustained.add(m); else noteOff(m);
    }
  }
  window.addEventListener("pointerup", endPointer);
  window.addEventListener("pointercancel", endPointer);
  // iOS Safari：鍵盤上のタッチではブラウザ既定の動作（ダブルタップ拡大・ピンチ拡大・スクロール）を止める
  for (const ev of ["touchstart", "touchmove", "touchend"]) kb.addEventListener(ev, e => e.preventDefault(), { passive: false });
  for (const ev of ["gesturestart", "gesturechange"]) document.addEventListener(ev, e => { if (pointerNotes.size || e.target.closest?.(".keyboard, .m-grid")) e.preventDefault(); }, { passive: false });

  // ---- PCキーボード（JIS配列対応・上下2段の2マニュアル） ----
  let kbBase = 60; // C4
  const KEY_OFFSETS = {
    "z":0,"x":2,"c":4,"v":5,"b":7,"n":9,"m":11,",":12,".":14,"/":16,
    "s":1,"d":3,"g":6,"h":8,"j":10,"l":13,";":15,"]":18,
    "q":12,"w":14,"e":16,"r":17,"t":19,"y":21,"u":23,"i":24,"o":26,"p":28,"@":29,"[":31,
    "2":13,"3":15,"5":18,"6":20,"7":22,"9":25,"0":27,"^":30
  };
  const CODE_OFFSETS = { "IntlRo": 17, "IntlYen": 32 };
  const CODE_LABELS = { "IntlRo": "\\", "IntlYen": "\\" };
  function offsetForEvent(e) {
    if (e.code && e.code in CODE_OFFSETS) return CODE_OFFSETS[e.code];
    const k = e.key.toLowerCase();
    return (k in KEY_OFFSETS) ? KEY_OFFSETS[k] : undefined;
  }
  function eventId(e) {
    return (e.code && e.code in CODE_OFFSETS) ? e.code : e.key.toLowerCase();
  }
  function noteFromOffset(off) {
    if (off === undefined) return null;
    const m = kbBase + off;
    return (m >= START && m <= END) ? m : null;
  }
  function updateKeyHints() {
    document.querySelectorAll(".keyhint").forEach(e => e.remove());
    const addHint = (m, label) => {
      if (m < START || m > END) return;
      const el = kb.querySelector(`[data-midi="${m}"]`);
      if (!el || el.querySelector(".keyhint")) return;
      const s = document.createElement("span");
      s.className = "keyhint"; s.textContent = label;
      el.appendChild(s);
    };
    for (const k in KEY_OFFSETS) addHint(kbBase + KEY_OFFSETS[k], k.toUpperCase());
    for (const code in CODE_OFFSETS) addHint(kbBase + CODE_OFFSETS[code], CODE_LABELS[code]);
    $("pcBase").textContent = noteName(kbBase);
    if ($("kbSettingSum")) updateKbSettingSum();
  }
  function shiftKb(delta) {
    kbBase = Math.max(START, Math.min(96, kbBase + delta));
    updateKeyHints();
    saveKbSettings();
  }

  const keyHeld = new Map();
  window.addEventListener("keydown", e => {
    const k = e.key.toLowerCase();
    const tag = ((document.activeElement && document.activeElement.tagName) || "").toLowerCase();
    const typing = tag === "input" || tag === "select" || tag === "textarea";

    if (!typing) {
      // Enter：メトロノーム開始/停止 ／ Shift+Enter：タップ
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) $("tapBtn").click(); else $("metroBtn").click();
        return;
      }
      // Shift+矢印：テンポ（↑↓=±1, ←→=±10）
      if (e.shiftKey && ["arrowup","arrowdown","arrowleft","arrowright"].includes(k)) {
        e.preventDefault();
        const d = k === "arrowup" ? 1 : k === "arrowdown" ? -1 : k === "arrowright" ? 10 : -10;
        KB.metro.setTempo(0, KB.metro.tempo + d);
        return;
      }
      // Shift+R：録音
      if (e.shiftKey && k === "r") { e.preventDefault(); $("recBtn").click(); return; }
    }

    if (!typing && k === " ") { e.preventDefault(); sustainOn = true; return; }
    if (!typing && !e.shiftKey && ["arrowleft","arrowright","arrowup","arrowdown"].includes(k)) {
      e.preventDefault();
      shiftKb(k === "arrowleft" ? -12 : k === "arrowright" ? 12 : k === "arrowup" ? 1 : -1);
      return;
    }
    if (e.repeat || typing) return;
    const m = noteFromOffset(offsetForEvent(e));
    if (m === null) return;
    const id = eventId(e);
    if (keyHeld.has(id)) return;
    keyHeld.set(id, m);
    sustained.delete(m);
    if (holdMode) { if (active.has(m)) noteOff(m); else noteOn(m); }
    else noteOn(m);
  });
  window.addEventListener("keyup", e => {
    if (e.key === " ") {
      sustainOn = false;
      for (const m of sustained) if (!noteHeldElsewhere(m, -1)) noteOff(m);
      sustained.clear();
      return;
    }
    const id = eventId(e);
    if (!keyHeld.has(id)) return;
    const m = keyHeld.get(id);
    keyHeld.delete(id);
    if (holdMode) return;
    if (sustainOn) { sustained.add(m); return; }
    if (!noteHeldElsewhere(m, -1)) noteOff(m);
  });
  $("pcDown").addEventListener("click", () => shiftKb(-12));
  $("pcUp").addEventListener("click", () => shiftKb(12));

  // ---- コントロール ----
  function refreshFreqs() {
    for (const [m, node] of active) {
      const base = freq(m);
      for (const o of node.oscs) o.osc.frequency.value = base * o.h;
    }
    if (KB.droneRefresh) KB.droneRefresh();
  }
  const DEGREE_NAMES = ["主音（完全1度）","短2度","長2度","短3度","長3度","完全4度","増4度","完全5度","短6度","長6度","短7度","長7度"];
  const fmtCents = c => (Math.abs(c) < 0.05 ? "±0" : (c > 0 ? "+" : "−") + Math.abs(c).toFixed(1)) + "¢";
  function hubShowNote(midi, freqHz) {
    const sounding = midi + transpose + octShift * 12;
    $("hubNote").textContent = noteName(sounding);
    $("hubHz").textContent = freqHz.toFixed(1);
    hubShowCents(sounding);
  }
  // 純正律との差タイル
  function hubShowCents(sounding) {
    const tile = $("hubCentsTile");
    if (!justMode) {
      tile.classList.remove("on");
      $("hubCentsVal").textContent = "平均律";
      $("hubCentsSub").textContent = "音律を純正律にすると、平均律との差をここに表示";
      return;
    }
    tile.classList.add("on");
    if (sounding == null) {
      $("hubCentsVal").textContent = "–";
      $("hubCentsSub").textContent = `主音 ${NOTE_NAMES[rootPc]}・鍵盤を押すと表示`;
      return;
    }
    const degree = (((sounding - rootPc) % 12) + 12) % 12;
    const c = JUST_CENTS[degree];
    const etHz = baseA * Math.pow(2, (sounding - 69) / 12);
    $("hubCentsVal").textContent = fmtCents(c);
    $("hubCentsSub").textContent = `${NOTE_NAMES[rootPc]} からの${DEGREE_NAMES[degree]}（平均律なら ${etHz.toFixed(1)} Hz）`;
  }
  $("hubA").textContent = baseA;

  $("pitch").addEventListener("input", e => {
    baseA = parseInt(e.target.value);
    $("pitchVal").textContent = baseA;
    $("hubA").textContent = baseA;
    updateKbSettingSum();
    refreshFreqs();
    saveKbSettings();
  });
  $("vol").addEventListener("input", e => {
    $("volVal").textContent = e.target.value;
    const v = e.target.value / 100;
    for (const [, node] of active) node.master.gain.value = v;
    saveKbSettings();
  });
  $("transpose").addEventListener("change", e => {
    transpose = parseInt(e.target.value);
    refreshFreqs(); updateLabels(); updateRootHighlight(); saveKbSettings();
  });
  $("oct").addEventListener("change", e => {
    octShift = parseInt(e.target.value);
    refreshFreqs(); updateLabels(); updateRootHighlight(); saveKbSettings();
  });

  // ---- 鍵盤設定の永続化 ----
  const KB_KEY = "keyboard_kbSettings_v1";
  function saveKbSettings() {
    lsSet(KB_KEY, {
      baseA, temperament: justMode ? "just" : "equal", rootPc,
      transpose, octShift, vol: +$("vol").value, holdMode, kbBase, keyW: whiteW, timbre
    });
  }
  function loadKbSettings() {
    const s = lsGet(KB_KEY, null);
    if (!s) return;
    if (typeof s.baseA === "number") { baseA = s.baseA; $("pitch").value = baseA; $("pitchVal").textContent = baseA; $("hubA").textContent = baseA; }
    if (typeof s.vol === "number") { $("vol").value = s.vol; $("volVal").textContent = s.vol; }
    if (typeof s.transpose === "number") { transpose = s.transpose; $("transpose").value = s.transpose; }
    if (typeof s.octShift === "number") { octShift = s.octShift; $("oct").value = s.octShift; }
    if (typeof s.kbBase === "number") kbBase = s.kbBase;
    if ([30, 40, 50].includes(s.keyW)) applyKeySize(s.keyW);
    if (s.timbre in TIMBRES) { timbre = s.timbre; $("timbreSel").value = timbre; }
    if (s.temperament === "just") { justMode = true; $("temperament").value = "just"; }
    if (typeof s.rootPc === "number") { rootPc = s.rootPc; rootBtn.textContent = NOTE_NAMES[rootPc]; }
    if (s.holdMode) { holdMode = true; holdBtn.textContent = "ON"; holdBtn.classList.add("on"); }
  }

  // ---- 主音を鍵盤で選ぶ ----
  let pickRoot = false;
  const rootBtn = $("rootBtn");
  function updateKbSettingSum() {
    $("kbSettingSum").textContent = `A=${baseA}Hz ・ PCキー ${noteName(kbBase)}`;
    $("rootCtrl").hidden = !justMode;
  }
  function setPickRoot(on) {
    pickRoot = on;
    rootBtn.classList.toggle("on", on);
    rootBtn.textContent = on ? "鍵盤を押す…" : NOTE_NAMES[rootPc];
  }
  function updateRootHighlight() {
    document.querySelectorAll(".white, .black").forEach(el => {
      const pc = (((parseInt(el.dataset.midi) + transpose + octShift * 12) % 12) + 12) % 12;
      el.classList.toggle("root", justMode && pc === rootPc);
      // 純正律のとき：各キーに平均律との差（セント）を表示
      let lab = el.querySelector(".justcent");
      if (!justMode) { if (lab) lab.remove(); return; }
      if (!lab) { lab = document.createElement("span"); lab.className = "justcent"; el.appendChild(lab); }
      const c = JUST_CENTS[(((pc - rootPc) % 12) + 12) % 12];
      const r = Math.round(c);
      lab.textContent = r === 0 ? "0" : (r > 0 ? "+" : "−") + Math.abs(r);
      lab.classList.toggle("zero", r === 0);
    });
    hubShowCents(null);
  }
  rootBtn.addEventListener("click", () => { if (justMode) setPickRoot(!pickRoot); });
  $("temperament").addEventListener("change", e => {
    justMode = e.target.value === "just";
    updateKbSettingSum();
    if (!justMode) setPickRoot(false);
    rootBtn.textContent = NOTE_NAMES[rootPc];
    updateRootHighlight(); refreshFreqs(); saveKbSettings();
  });

  applyKeySize(40);
  loadKbSettings();
  updateLabels();
  updateKeyHints();
  updateRootHighlight();
  updateKbSettingSum();
  refreshFreqs();

  // 起動時、C4付近を表示
  {
    const wrap = document.querySelector(".keyboard-wrap");
    const c4 = kb.querySelector('[data-midi="60"]');
    if (wrap && c4) wrap.scrollLeft = c4.offsetLeft - 30;
  }

  // ==========================================================
  //  Web MIDI 入力（MIDIノート＝鍵盤の記譜音として扱う）
  // ==========================================================
  let midiAccess = null;
  const midiHeld = new Set();
  function midiSetStatus(msg, on) {
    $("midiStatus").textContent = msg;
    $("midiBtn").classList.toggle("on", !!on);
    $("midiBtn").textContent = on ? "🎛 切断" : "🎛 接続";
  }
  function midiBind() {
    if (!midiAccess) return;
    const names = [];
    for (const inp of midiAccess.inputs.values()) { inp.onmidimessage = onMidiMessage; names.push(inp.name || "MIDI"); }
    midiSetStatus(names.length ? "接続中: " + names.join(", ") : "MIDI機器が見つかりません（接続すると自動で認識）", true);
  }
  function onMidiMessage(e) {
    const [st, d1, d2] = e.data;
    const cmd = st & 0xf0;
    if (cmd === 0x90 && d2 > 0) midiNoteOn(d1);
    else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) midiNoteOff(d1);
    else if (cmd === 0xb0 && d1 === 64) midiPedal(d2 >= 64);
  }
  function midiNoteOn(n) {
    if (n < START || n > END) return;
    midiHeld.add(n);
    sustained.delete(n);
    if (holdMode) { if (active.has(n)) noteOff(n); else noteOn(n); }
    else noteOn(n);
  }
  function midiNoteOff(n) {
    midiHeld.delete(n);
    if (holdMode) return;
    if (sustainOn) { sustained.add(n); return; }
    if (!noteHeldElsewhere(n, -1)) noteOff(n);
  }
  function midiPedal(on) {
    sustainOn = on;
    if (!on) {
      for (const m of sustained) if (!noteHeldElsewhere(m, -1) && !midiHeld.has(m)) noteOff(m);
      sustained.clear();
    }
  }
  $("midiBtn").addEventListener("click", async () => {
    if (midiAccess) {
      for (const inp of midiAccess.inputs.values()) inp.onmidimessage = null;
      midiAccess.onstatechange = null; midiAccess = null;
      midiSetStatus("", false);
      return;
    }
    if (!navigator.requestMIDIAccess) { midiSetStatus("このブラウザは Web MIDI 非対応です（Chrome / Edge 推奨）", false); return; }
    try {
      midiAccess = await navigator.requestMIDIAccess();
      midiAccess.onstatechange = midiBind;
      midiBind();
    } catch (err) {
      midiSetStatus("MIDIアクセスが拒否されました", false);
    }
  });

  KB.kb = {
    noteOn, noteOff, noteName, NOTE_NAMES, active, soundingFreq, voicePartials,
    get baseA() { return baseA; }, get transpose() { return transpose; }, get octShift() { return octShift; },
    get justMode() { return justMode; }, get rootPc() { return rootPc; }
  };
})();
