/* ============================================================
   Keyboard — tuner：ドローン・チューナー（自己相関）・ロングトーン練習
   ============================================================ */
(() => {
  "use strict";
  const KB = window.KB;
  const { $, T, lsGet, lsSet, pad2, ensureCtx, outNode } = KB;
  const A = () => KB.audio.ctx;
  const { noteName, soundingFreq, voicePartials } = KB.kb;
  let drone = null; // { oscs:[{osc,h}], gain, midi }

  // ==========================================================
  //  ドローン（参照音：実音・現在の音律で鳴り続ける）
  // ==========================================================
  function droneMidi() { return (+$("drNote").value) + ((+$("drOct").value) + 1) * 12; }
  function droneStart() {
    ensureCtx();
    droneStop(true);
    const midi = droneMidi();
    const base = soundingFreq(midi);
    const gain = A().createGain();
    gain.gain.setValueAtTime(0, A().currentTime);
    gain.gain.linearRampToValueAtTime(+$("drVol").value / 100, A().currentTime + 0.08);
    gain.connect(outNode());
    const oscs = [];
    for (const p of voicePartials(base)) {
      const osc = A().createOscillator(); osc.type = "sine"; osc.frequency.value = base * p.h;
      const g = A().createGain(); g.gain.value = p.g;
      osc.connect(g).connect(gain); osc.start();
      oscs.push({ osc, h: p.h });
    }
    drone = { oscs, gain, midi };
    $("drBtn").classList.add("on"); $("drBtn").textContent = "■ ドローン停止";
    KB.autoStartLog();
  }
  function droneStop(silent) {
    if (!drone) return;
    const t = A().currentTime;
    drone.gain.gain.cancelScheduledValues(t);
    drone.gain.gain.setValueAtTime(drone.gain.gain.value, t);
    drone.gain.gain.linearRampToValueAtTime(0, t + 0.1);
    for (const o of drone.oscs) o.osc.stop(t + 0.12);
    drone = null;
    if (!silent) { $("drBtn").classList.remove("on"); $("drBtn").textContent = "▶ ドローン"; }
  }
  function droneRefresh() {
    if (!drone) return;
    const base = soundingFreq(drone.midi);
    for (const o of drone.oscs) o.osc.frequency.value = base * o.h;
  }
  $("drBtn").addEventListener("click", () => { drone ? droneStop() : droneStart(); });
  for (const id of ["drNote", "drOct"]) $(id).addEventListener("change", () => { if (drone) droneStart(); });
  $("drVol").addEventListener("input", e => {
    $("drVolVal").textContent = e.target.value + "%";
    if (drone) drone.gain.gain.setTargetAtTime(+e.target.value / 100, A().currentTime, 0.03);
  });

  // ==========================================================
  //  チューナー（マイク入力＋自己相関ピッチ検出）＋サウンドバック
  // ==========================================================
  let tunerRunning = false, tunerRAF = null, micStream = null, micSource = null, analyser = null, tbuf = null;

  function autoCorrelate(buf, sampleRate) {
    let SIZE = buf.length, rms = 0;
    for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1;
    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
    buf = buf.slice(r1, r2); SIZE = buf.length;
    const c = new Array(SIZE).fill(0);
    for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE - i; j++) c[i] += buf[j] * buf[j + i];
    let d = 0; while (d < SIZE - 1 && c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
    let T0 = maxpos;
    const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2, b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);
    if (!T0 || !isFinite(T0)) return -1;
    return sampleRate / T0;
  }

  function updateTuner() {
    if (!tunerRunning) return;
    analyser.getFloatTimeDomainData(tbuf);
    let inRms = 0;   // 入力レベル（ロングトーンの無音判定用）
    for (let i = 0; i < tbuf.length; i++) inRms += tbuf[i] * tbuf[i];
    inRms = Math.sqrt(inRms / tbuf.length);
    const f = autoCorrelate(tbuf, A().sampleRate);
    $("tRef").textContent = KB.kb.baseA;
    let detectedNearest = null, detectedCents = null;
    if (f > 0 && f < 5000) {
      const midi = 69 + 12 * Math.log2(f / KB.kb.baseA);
      const nearest = Math.round(midi);
      detectedNearest = nearest;
      const cents = Math.round((midi - nearest) * 100);
      detectedCents = (midi - nearest) * 100;

      const nm = noteName(nearest);
      const m = nm.match(/^(.+?)(-?\d+)$/);
      $("tNote").textContent = m ? m[1] : nm;
      $("tOct").textContent = m ? m[2] : "";

      const inTune = Math.abs(cents) <= 5;
      $("tFlat").classList.toggle("on", cents < -5);
      $("tSharp").classList.toggle("on", cents > 5);

      const nx = Math.max(-50, Math.min(50, cents));
      const needle = $("tNeedle");
      needle.style.transform = "rotate(" + (nx / 50 * 60) + "deg)";
      needle.classList.toggle("intune", inTune);
      $("tZero").classList.toggle("on", inTune);

      const litC = Math.round(cents / 5) * 5;
      document.querySelectorAll(".lcd-meter .tick").forEach(t => {
        t.classList.toggle("lit", parseInt(t.dataset.c, 10) === Math.max(-50, Math.min(50, litC)) && !inTune);
      });
      $("tCents").textContent = (cents > 0 ? "+" : cents < 0 ? "−" : "±") + Math.abs(cents) + "¢";
      $("tHz").textContent = f.toFixed(1) + " Hz";
    } else {
      $("tFlat").classList.remove("on");
      $("tSharp").classList.remove("on");
      $("tZero").classList.remove("on");
      document.querySelectorAll(".lcd-meter .tick.lit").forEach(t => t.classList.remove("lit"));
    }

    // ロングトーン計測
    if (ltOn) ltFeed(performance.now(), inRms >= LT_MIN_RMS ? detectedNearest : null, detectedCents);

    tunerRAF = requestAnimationFrame(updateTuner);
  }

  async function startTuner() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $("tunerStatus").textContent = window.isSecureContext
        ? "このブラウザはマイク入力に対応していません"
        : "マイクは https:// か localhost でのみ使えます（file:// では使えません）";
      return;
    }
    try {
      ensureCtx();
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      micSource = A().createMediaStreamSource(micStream);
      analyser = A().createAnalyser();
      analyser.fftSize = 2048;
      tbuf = new Float32Array(analyser.fftSize);
      micSource.connect(analyser); // スピーカーには繋がない（ハウリング防止）
      tunerRunning = true;
      $("tunerDisplay").hidden = false;
      $("tunerBtn").textContent = "■ チューナー停止";
      $("tunerBtn").classList.add("on");
      $("tunerStatus").textContent = "マイク入力中";
      updateTuner();
    } catch (err) {
      const n = err && err.name;
      let msg = "マイクを使用できません";
      if (n === "NotAllowedError" || n === "SecurityError") msg = "マイクが拒否されました。ブラウザのアドレスバーのマイク許可、またはOSのマイク権限を確認してください";
      else if (n === "NotFoundError" || n === "DevicesNotFoundError") msg = "マイクが見つかりません（接続を確認してください）";
      else if (n === "NotReadableError") msg = "他のアプリがマイクを使用中の可能性があります";
      else if (n) msg = "マイクエラー: " + n;
      $("tunerStatus").textContent = msg;
    }
  }
  function stopTuner() {
    tunerRunning = false;
    if (tunerRAF) cancelAnimationFrame(tunerRAF);
    if (micStream) micStream.getTracks().forEach(t => t.stop());
    if (micSource) { try { micSource.disconnect(); } catch (_) {} }
    if (ltOn) ltSetOn(false);
    $("tunerBtn").textContent = "🎤 チューナー開始（マイク）";
    $("tunerBtn").classList.remove("on");
    $("tunerStatus").textContent = "";
  }
  $("tunerBtn").addEventListener("click", () => { tunerRunning ? stopTuner() : startTuner(); });

  // ==========================================================
  //  ロングトーン練習：保持時間・範囲内時間・安定度を計測し、ピッチの推移を描画
  // ==========================================================
  const LT_KEY = "keyboard_longtone_v1";
  const LT_GAP_MS = 500;     // この時間無音なら1回分を終了
  const LT_MIN_MS = 1000;    // これ未満の短い音は記録しない
  const LT_SPAN_MS = 12000;  // グラフに表示する時間幅
  const LT_MIN_RMS = 0.012;  // これ未満の入力は無音扱い
  let ltOn = false, ltCur = null, ltSamples = [];
  let ltHist = lsGet(LT_KEY, []);
  const ltCanvas = $("ltCanvas");

  function ltTol() { return Math.max(1, Math.min(30, +$("ltTol").value || 5)); }
  function ltSetOn(on) {
    ltOn = on;
    $("ltBtn").classList.toggle("on", on);
    $("ltBtn").textContent = on ? "■ 計測停止" : "▶ ロングトーン計測";
    $("ltSum").textContent = on ? "計測中" : "オフ";
    if (!on) { ltFinalize(performance.now()); ltSamples = []; ltDraw(); ltLive(null); }
  }
  function ltFeed(now, nearest, cents) {
    const valid = nearest !== null && cents !== null;
    const tol = ltTol();
    if (valid) {
      if (ltCur && ltCur.midi !== nearest) ltFinalize(now);     // 別の音に移った
      if (!ltCur) ltCur = { midi: nearest, start: now, lastT: now, dur: 0, inTune: 0, sumAbs: 0, maxDev: 0 };
      const dt = Math.min(200, now - ltCur.lastT);
      ltCur.dur += dt;
      if (Math.abs(cents) <= tol) ltCur.inTune += dt;
      ltCur.sumAbs += Math.abs(cents) * dt;
      ltCur.maxDev = Math.max(ltCur.maxDev, Math.abs(cents));
      ltCur.lastT = now;
    } else if (ltCur && now - ltCur.lastT > LT_GAP_MS) {
      ltFinalize(now);
    }
    ltSamples.push({ t: now, c: valid ? cents : null });
    while (ltSamples.length && now - ltSamples[0].t > LT_SPAN_MS) ltSamples.shift();
    ltLive(ltCur);
    ltDraw();
  }
  function ltFinalize(now) {
    if (!ltCur) return;
    const a = ltCur; ltCur = null;
    if (a.dur < LT_MIN_MS) return;
    ltHist.unshift({
      midi: a.midi, dur: +(a.dur / 1000).toFixed(1), inTune: +(a.inTune / 1000).toFixed(1),
      pct: Math.round(a.inTune / a.dur * 100), avg: +(a.sumAbs / a.dur).toFixed(1),
      max: Math.round(a.maxDev), tol: ltTol(), at: Date.now()
    });
    ltHist = ltHist.slice(0, 50);
    lsSet(LT_KEY, ltHist);
    ltRenderList();
  }
  function ltLive(a) {
    if (!a) { $("ltNote").textContent = "–"; $("ltDur").textContent = "0.0"; $("ltIn").textContent = "0.0"; $("ltPct").textContent = "–"; return; }
    $("ltNote").textContent = noteName(a.midi);
    $("ltDur").textContent = (a.dur / 1000).toFixed(1);
    $("ltIn").textContent = (a.inTune / 1000).toFixed(1);
    $("ltPct").textContent = a.dur > 0 ? Math.round(a.inTune / a.dur * 100) : "–";
  }
  function ltDraw() {
    if (!ltCanvas.isConnected || ltCanvas.offsetParent === null) return;
    const dpr = window.devicePixelRatio || 1;
    const W = ltCanvas.clientWidth, H = ltCanvas.clientHeight;
    if (ltCanvas.width !== Math.round(W * dpr) || ltCanvas.height !== Math.round(H * dpr)) { ltCanvas.width = Math.round(W * dpr); ltCanvas.height = Math.round(H * dpr); }
    const g = ltCanvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const cs = getComputedStyle(document.documentElement);
    const col = { text: cs.getPropertyValue("--lcd-text").trim(), ok: cs.getPropertyValue("--success").trim(), ng: cs.getPropertyValue("--accent").trim(), band: cs.getPropertyValue("--success-soft").trim() };
    const tol = ltTol();
    const yOf = c => H / 2 - Math.max(-50, Math.min(50, c)) / 50 * (H / 2 - 8);
    // 合格帯・中心線・目盛り
    g.fillStyle = col.band; g.fillRect(0, yOf(tol), W, yOf(-tol) - yOf(tol));
    g.strokeStyle = col.text; g.globalAlpha = .25; g.lineWidth = 1;
    for (const c of [-50, -25, 25, 50]) { g.beginPath(); g.moveTo(0, yOf(c)); g.lineTo(W, yOf(c)); g.stroke(); }
    g.globalAlpha = .6; g.beginPath(); g.moveTo(0, yOf(0)); g.lineTo(W, yOf(0)); g.stroke();
    g.globalAlpha = .7; g.font = "700 10px " + cs.getPropertyValue("--font-num"); g.fillStyle = col.text;
    g.fillText("+50", 4, yOf(50) + 10); g.fillText("0", 4, yOf(0) - 3); g.fillText("-50", 4, yOf(-50) - 3);
    g.globalAlpha = 1;
    // 軌跡
    if (!ltSamples.length) return;
    const now = ltSamples[ltSamples.length - 1].t;
    const xOf = t => W - (now - t) / LT_SPAN_MS * W;
    g.lineWidth = 2.2; g.lineJoin = "round"; g.lineCap = "round";
    let prev = null;
    for (const s of ltSamples) {
      if (s.c === null) { prev = null; continue; }
      if (prev) {
        g.strokeStyle = Math.abs(s.c) <= tol ? col.ok : col.ng;
        g.beginPath(); g.moveTo(xOf(prev.t), yOf(prev.c)); g.lineTo(xOf(s.t), yOf(s.c)); g.stroke();
      }
      prev = s;
    }
  }
  function ltRenderList() {
    const wrap = $("ltList"); wrap.innerHTML = "";
    if (!ltHist.length) { wrap.innerHTML = `<p class="note" style="margin:0">まだ結果がありません。チューナーを起動して音を伸ばしてみましょう。</p>`; return; }
    ltHist.slice(0, 12).forEach(r => {
      const row = document.createElement("div"); row.className = "lt-row";
      const d = new Date(r.at);
      row.innerHTML =
        `<span class="lt-n">${noteName(r.midi)}</span>
         <span class="lt-bar"><i style="width:${r.pct}%"></i></span>
         <span class="lt-pct${r.pct < 60 ? " bad" : ""}">${r.pct}%</span>
         <span class="lt-meta">${r.dur}秒 ・ 平均 ${r.avg}¢ ・ 最大 ${r.max}¢ ・ ${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}</span>`;
      wrap.appendChild(row);
    });
  }
  $("ltBtn").addEventListener("click", async () => {
    if (ltOn) { ltSetOn(false); return; }
    if (!tunerRunning) await startTuner();
    if (!tunerRunning) return;
    $("ltSec").open = true;
    ltSetOn(true);
  });
  $("ltClear").addEventListener("click", () => {
    if (!ltHist.length || !confirm(T("ロングトーンの結果をすべて消しますか？"))) return;
    ltHist = []; lsSet(LT_KEY, ltHist); ltRenderList();
  });
  $("ltSec").addEventListener("toggle", () => { if ($("ltSec").open) ltDraw(); });
  window.addEventListener("resize", () => { if (ltOn) ltDraw(); });
  ltRenderList();
  ltDraw();

  KB.droneRefresh = droneRefresh;
})();
