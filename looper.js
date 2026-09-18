/* ============================================================
   Keyboard — looper：伴奏ループ（拍単位のMIDI録音・テンポ追従再生・重ね録り・保存）
   ============================================================ */
(() => {
  "use strict";
  const KB = window.KB;
  const { $, lsGet, lsSet, escapeHtml, ensureCtx } = KB;
  const A = () => KB.audio.ctx;
  const { noteOn, noteOff, active } = KB.kb;
  const M = KB.metro;
  const { currentSig, playVoice, scheduleAt } = M;

  // ==========================================================
  //  伴奏ループ（ルーパー）：MIDIイベントを拍単位で録音・ループ再生・重ね録り
  //  ・トラック複数（オーバーダブ）。再生用には非ミュートのトラックを結合
  //  ・録音は拍(beat)単位で保持 → テンポ変更に追従
  // ==========================================================
  let lpTracks = [];        // [{events:[{beat,type,midi}], mute}]
  let lpEvents = [];        // 再生用：結合・ソート済み
  let lpLoopBeats = 0, lpBeatsPerBar = 4;
  let lpPattern = null;     // 録音時のメトロパターン [{beat, role}]
  let lpRecTempo = 120;
  let lpRec = "idle";       // idle | armed | recording
  let lpPlaying = false;
  let lpRecStart = 0, lpRecEvents = [], lpRecDub = false;
  let lpSuppress = false;   // 再生・ガイド・サウンドバック由来の noteOn を録音しない
  let lpPlayTimer = null, lpLoopStart = 0, lpNextIdx = 0, lpLoopCount = 0;
  let lpUiTimer = null, lpCountTimer = null, lpArmTimer = null;
  const lpClickDone = new Set();

  function lpBeatDur() { return 60 / (M.tempo || 120); }
  function lpHasContent() { return lpTracks.some(t => t.events.length) || !!(lpPattern && lpPattern.length); }
  function lpNoteCount() { return lpTracks.reduce((n, t) => n + t.events.filter(e => e.type === "on").length, 0); }
  function lpMerge() {
    lpEvents = [];
    for (const t of lpTracks) if (!t.mute) lpEvents.push(...t.events);
    lpEvents.sort((a, b) => a.beat - b.beat || (a.type === "off" ? -1 : 1));
    lpResync();
  }
  // 再生中にイベント列が変わったら、現在位置から再スケジュール
  function lpResync() {
    if (!lpPlaying) return;
    const elapsed = (A().currentTime - lpLoopStart) / lpBeatDur();
    lpLoopCount = Math.max(0, Math.floor(elapsed / lpLoopBeats));
    const pos = elapsed - lpLoopCount * lpLoopBeats;
    lpNextIdx = lpEvents.findIndex(e => e.beat >= pos);
    if (lpNextIdx < 0) lpNextIdx = lpEvents.length;
  }

  function lpSnapshotPattern(bars) {
    const pat = [];
    const nBeats = currentSig().n;
    for (let bar = 0; bar < bars; bar++) {
      for (let b = 0; b < nBeats; b++) {
        for (let s = 0; s < M.subs; s++) {
          const cell = M.grid[b] && M.grid[b][s];
          if (!cell) continue;
          const isBeatHead = s === 0, isBarHead = isBeatHead && b === 0;
          const role = cell === 2 ? "accent" : isBarHead ? "accent" : isBeatHead ? "beat" : "sub";
          pat.push({ beat: bar * nBeats + b + s / M.subs, role });
        }
      }
    }
    return pat;
  }

  function lpTapNote(type, midi) {
    if (lpRec !== "recording" || lpSuppress) return;
    const beat = (A().currentTime - lpRecStart) / lpBeatDur();
    if (beat < 0 || beat > lpLoopBeats) return;
    lpRecEvents.push({ beat, type, midi });
  }

  function lpSetStatus(msg) { $("lpStatus").textContent = msg; }
  function lpSetMeter(frac, label) {
    $("lpMeter").style.width = Math.max(0, Math.min(1, frac)) * 100 + "%";
    $("lpMeterLab").textContent = label || "";
  }
  function lpUpdateButtons() {
    const has = lpHasContent(), busy = lpRec !== "idle";
    $("lpRecBtn").disabled = busy ? lpRecDub : lpPlaying;
    $("lpDubBtn").disabled = !has || (busy && !lpRecDub);
    $("lpPlayBtn").disabled = !has || (busy && !lpRecDub);
    $("lpClearBtn").disabled = !has || busy;
    $("lpSaveBtn").disabled = !has || busy;
  }
  function lpRenderTracks() {
    const wrap = $("lpTracks"); wrap.innerHTML = "";
    lpTracks.forEach((t, i) => {
      const row = document.createElement("div"); row.className = "lp-track" + (t.mute ? " muted" : "");
      const n = t.events.filter(e => e.type === "on").length;
      row.innerHTML = `<span>トラック ${i + 1} ・ ${n}音</span>`;
      const mute = document.createElement("button"); mute.className = "lp-mute"; mute.textContent = t.mute ? "🔇 ミュート中" : "🔊 再生";
      mute.addEventListener("click", () => { t.mute = !t.mute; lpMerge(); lpRenderTracks(); });
      const del = document.createElement("button"); del.className = "row-del"; del.textContent = "✕";
      del.addEventListener("click", () => {
        lpTracks.splice(i, 1);
        lpMerge(); lpRenderTracks();
        if (!lpHasContent()) lpClear(); else lpUpdateButtons();
      });
      row.appendChild(mute); row.appendChild(del); wrap.appendChild(row);
    });
  }

  // ---- 録音（新規 / 重ね録り） ----
  function lpArmRecord(dub) {
    ensureCtx();
    if (lpRec !== "idle") return;
    if (dub && !lpHasContent()) return;
    lpRecDub = !!dub;
    lpRecEvents = [];
    let bars;
    if (!dub) {
      if (lpPlaying) lpStopPlay();
      lpBeatsPerBar = currentSig().n;
      lpRecTempo = M.tempo;
      bars = Math.max(1, Math.min(32, +$("lpBars").value || 4));
      lpLoopBeats = bars * lpBeatsPerBar;
      lpTracks = []; lpEvents = [];
      lpPattern = lpSnapshotPattern(bars);
      lpRenderTracks();
    } else {
      bars = lpLoopBeats / lpBeatsPerBar;
      if (!lpPlaying) lpStartPlay();
    }
    lpRec = "armed";
    const btn = dub ? $("lpDubBtn") : $("lpRecBtn");
    btn.classList.add("armed"); btn.textContent = dub ? "＋ 次のループ頭で開始…" : "● 準備…";
  
    const doStart = (startAt) => {
      if (lpRec !== "armed") return;
      lpRec = "recording";
      lpRecStart = startAt;
      btn.classList.remove("armed"); btn.classList.add("recording");
      btn.textContent = "■ 録音中（自動停止）";
      lpSetStatus(dub ? `重ね録り中：1周（${bars}小節）ぶん弾いてください。` : `録音中：${bars}小節ぶん弾いてください。`);
      lpUpdateButtons();
      lpUiTimer = setInterval(() => {
        const el = (A().currentTime - lpRecStart) / lpBeatDur();
        const barNow = Math.min(bars, Math.floor(Math.max(0, el) / lpBeatsPerBar) + 1);
        lpSetMeter(el / lpLoopBeats, `${dub ? "重ね録り" : "録音"} ${barNow}/${bars}小節`);
        if (el >= lpLoopBeats) lpFinishRecord();
      }, 30);
    };

    if (dub) {
      // 再生中のループの次の頭に合わせて開始
      const loopDur = lpLoopBeats * lpBeatDur();
      const k = Math.ceil((A().currentTime + 0.05 - lpLoopStart) / loopDur);
      const tB = lpLoopStart + k * loopDur;
      lpSetStatus("次のループ頭から重ね録りを開始します…");
      lpArmTimer = setTimeout(() => doStart(tB), Math.max(0, (tB - A().currentTime) * 1000));
    } else if ($("lpCountIn").checked) {
      const n = lpBeatsPerBar;
      const t0 = A().currentTime + 0.12;
      for (let i = 0; i < n; i++) playVoice(t0 + i * lpBeatDur(), i === 0 ? "accent" : "count");
      let cnt = 0;
      lpSetStatus(`カウントイン… ${n}拍`);
      lpCountTimer = setInterval(() => {
        cnt++;
        lpSetMeter(cnt / n, `カウント ${cnt}/${n}`);
        if (cnt >= n) { clearInterval(lpCountTimer); lpCountTimer = null; }
      }, lpBeatDur() * 1000);
      const tStart = t0 + n * lpBeatDur();
      lpArmTimer = setTimeout(() => doStart(tStart), (tStart - A().currentTime) * 1000);
    } else {
      doStart(A().currentTime);
    }
  }

  function lpFinishRecord() {
    if (lpUiTimer) { clearInterval(lpUiTimer); lpUiTimer = null; }
    if (lpCountTimer) { clearInterval(lpCountTimer); lpCountTimer = null; }
    clearTimeout(lpArmTimer);
    const wasRecording = lpRec === "recording";
    lpRec = "idle";
    const btn = lpRecDub ? $("lpDubBtn") : $("lpRecBtn");
    btn.classList.remove("recording", "armed");
    $("lpRecBtn").textContent = "● 録音";
    $("lpDubBtn").textContent = "＋ 重ね録り";
    if (wasRecording) {
      const openNotes = new Set();
      for (const e of lpRecEvents) { if (e.type === "on") openNotes.add(e.midi); else openNotes.delete(e.midi); }
      for (const midi of openNotes) lpRecEvents.push({ beat: lpLoopBeats, type: "off", midi });
      lpRecEvents.sort((a, b) => a.beat - b.beat || (a.type === "off" ? -1 : 1));
      if (lpRecEvents.length) lpTracks.push({ events: lpRecEvents, mute: false });
    }
    lpRecEvents = [];
    lpMerge(); lpRenderTracks();
    if (lpHasContent()) {
      const bars = lpLoopBeats / lpBeatsPerBar;
      const parts = [];
      const n = lpNoteCount();
      if (n) parts.push(`鍵盤${n}音（${lpTracks.length}トラック）`);
      if (lpPattern && lpPattern.length) parts.push("リズム");
      lpSetStatus(lpPlaying
        ? `重ね録り完了：${parts.join("＋")}・${bars}小節。そのままループ再生中です。`
        : `録音完了：${parts.join("＋")}・${bars}小節。「ループ再生」で流れます。`);
    } else {
      lpSetStatus("何も記録されませんでした。もう一度どうぞ。");
    }
    if (!lpPlaying) lpSetMeter(0, "");
    lpRecDub = false;
    lpUpdateButtons();
  }

  // ---- 再生 ----
  const LP_AHEAD = 0.12, LP_TICK = 25;
  function lpStartPlay() {
    if (!lpHasContent() || lpPlaying) return;
    ensureCtx();
    lpPlaying = true;
    lpLoopStart = A().currentTime + 0.1;
    lpNextIdx = 0; lpLoopCount = 0;
    lpClickDone.clear();
    $("lpPlayBtn").classList.add("on");
    $("lpPlayBtn").textContent = "■ 停止";
    lpSetStatus("ループ再生中。伴奏に合わせて練習しましょう。テンポを変えると追従します。");
    lpPlayTimer = setInterval(lpPlaySched, LP_TICK);
    lpUpdateButtons();
    KB.autoStartLog();
  }
  function lpPlaySched() {
    const beatDur = lpBeatDur();
    const loopDur = lpLoopBeats * beatDur;
    const horizon = A().currentTime + LP_AHEAD;
    while (true) {
      const loopBase = lpLoopStart + lpLoopCount * loopDur;
      if (lpNextIdx >= lpEvents.length) {
        lpLoopCount++; lpNextIdx = 0;
        if (lpLoopStart + lpLoopCount * loopDur > horizon) break;
        continue;
      }
      const ev = lpEvents[lpNextIdx];
      const evTime = loopBase + ev.beat * beatDur;
      if (evTime >= horizon) break;
      if (evTime >= A().currentTime - 0.02) lpScheduleEvent(ev, evTime);
      lpNextIdx++;
    }
    if ($("lpMetroOn").checked) lpSchedClicks(horizon, beatDur, loopDur);
    if (lpRec === "idle") {
      const pos = ((A().currentTime - lpLoopStart) % loopDur + loopDur) % loopDur;
      const barNow = Math.floor(pos / beatDur / lpBeatsPerBar) + 1;
      lpSetMeter(pos / loopDur, `再生 ${barNow}/${lpLoopBeats / lpBeatsPerBar}小節`);
    }
  }
  function lpSchedClicks(horizon, beatDur, loopDur) {
    if (!lpPattern || !lpPattern.length) return;
    const curLoop = Math.floor((A().currentTime - lpLoopStart) / loopDur);
    for (let li = curLoop; li <= curLoop + 1; li++) {
      if (li < 0) continue;
      const base = lpLoopStart + li * loopDur;
      for (let pi = 0; pi < lpPattern.length; pi++) {
        const t = base + lpPattern[pi].beat * beatDur;
        if (t < A().currentTime - 0.01 || t >= horizon) continue;
        const key = li * 100000 + pi;
        if (lpClickDone.has(key)) continue;
        lpClickDone.add(key);
        playVoice(t, lpPattern[pi].role);
      }
    }
    if (lpClickDone.size > 2048) {
      const cutoff = (curLoop - 1) * 100000;
      for (const v of lpClickDone) if (v < cutoff) lpClickDone.delete(v);
    }
  }
  function lpScheduleEvent(ev, when) {
    scheduleAt((when - A().currentTime) * 1000, () => {
      if (!lpPlaying) return;
      lpSuppress = true;
      if (ev.type === "on") noteOn(ev.midi); else noteOff(ev.midi);
      lpSuppress = false;
    });
  }
  function lpStopPlay() {
    if (lpRec !== "idle" && lpRecDub) lpFinishRecord();   // 重ね録り中なら打ち切って確定
    if (lpPlayTimer) { clearInterval(lpPlayTimer); lpPlayTimer = null; }
    lpPlaying = false;
    lpClickDone.clear();
    lpSuppress = true;
    for (const t of lpTracks) for (const e of t.events) if (active.has(e.midi)) noteOff(e.midi);
    lpSuppress = false;
    $("lpPlayBtn").classList.remove("on");
    $("lpPlayBtn").textContent = "▶ ループ再生";
    lpSetMeter(0, "");
    lpSetStatus(lpHasContent() ? "停止しました。" : "まだ伴奏がありません。");
    lpUpdateButtons();
  }
  function lpClear() {
    if (lpRec !== "idle") lpFinishRecord();
    if (lpPlaying) lpStopPlay();
    lpTracks = []; lpEvents = []; lpPattern = null;
    lpRenderTracks();
    lpSetMeter(0, "");
    lpSetStatus("消去しました。");
    lpUpdateButtons();
  }
  $("lpRecBtn").addEventListener("click", () => {
    if (lpRec === "recording" && !lpRecDub) { lpFinishRecord(); return; }
    if (lpRec !== "idle") return;
    lpArmRecord(false);
  });
  $("lpDubBtn").addEventListener("click", () => {
    if (lpRec === "recording" && lpRecDub) { lpFinishRecord(); return; }
    if (lpRec !== "idle") return;
    lpArmRecord(true);
  });
  $("lpPlayBtn").addEventListener("click", () => { lpPlaying ? lpStopPlay() : lpStartPlay(); });
  $("lpClearBtn").addEventListener("click", lpClear);
  function lpSyncSig() { const s = currentSig(); $("lpSig").textContent = `${s.n}/${s.d}`; }

  // ---- 伴奏ループの保存・呼び出し ----
  const LP_STORE_KEY = "keyboard_loops_v1";
  function lpLoadStore() { return lsGet(LP_STORE_KEY, {}); }
  function lpSaveStore(o) { lsSet(LP_STORE_KEY, o); }
  function lpSaveCurrent(name) {
    const o = lpLoadStore();
    o[name] = {
      tracks: lpTracks.map(t => ({ mute: !!t.mute, events: t.events.map(e => ({ b: +e.beat.toFixed(4), t: e.type === "on" ? 1 : 0, m: e.midi })) })),
      pattern: (lpPattern || []).map(p => ({ b: +p.beat.toFixed(4), r: p.role })),
      loopBeats: lpLoopBeats, beatsPerBar: lpBeatsPerBar, tempo: lpRecTempo, saved: Date.now()
    };
    lpSaveStore(o);
    lpRenderSaveList();
  }
  function lpRestore(name) {
    const d = lpLoadStore()[name]; if (!d) return;
    if (lpRec !== "idle") lpFinishRecord();
    if (lpPlaying) lpStopPlay();
    const conv = ev => ev.map(e => ({ beat: e.b, type: e.t ? "on" : "off", midi: e.m }));
    lpTracks = d.tracks ? d.tracks.map(t => ({ mute: !!t.mute, events: conv(t.events || []) }))
             : (d.events && d.events.length ? [{ mute: false, events: conv(d.events) }] : []);   // 旧形式
    lpPattern = (d.pattern || []).map(p => ({ beat: p.b, role: p.r }));
    lpLoopBeats = d.loopBeats; lpBeatsPerBar = d.beatsPerBar; lpRecTempo = d.tempo || 120;
    lpMerge(); lpRenderTracks();
    lpSetStatus(`「${name}」を呼び出しました（${lpNoteCount()}音・${lpTracks.length}トラック・${lpLoopBeats / lpBeatsPerBar}小節・録音時${Math.round(lpRecTempo)}BPM）。「ループ再生」で流れます。`);
    lpSetMeter(0, "");
    lpUpdateButtons();
  }
  function lpRenderSaveList() {
    const wrap = $("lpSaveList"); wrap.innerHTML = "";
    const o = lpLoadStore();
    const names = Object.keys(o);
    if (!names.length) { wrap.innerHTML = `<p class="note" style="margin:0">保存済みの伴奏はありません。</p>`; return; }
    names.forEach(name => {
      const d = o[name];
      const bars = d.loopBeats / d.beatsPerBar;
      const nNotes = d.tracks ? d.tracks.reduce((n, t) => n + (t.events || []).filter(e => e.t).length, 0) : (d.events || []).filter(e => e.t).length;
      const nTr = d.tracks ? d.tracks.length : (nNotes ? 1 : 0);
      const row = document.createElement("div"); row.className = "preset-row";
      row.innerHTML = `<span>${escapeHtml(name)}<small> ・${bars}小節・${nNotes}音・${nTr}トラック・${Math.round(d.tempo || 120)}BPM</small></span>`;
      const load = document.createElement("button"); load.className = "row-load"; load.textContent = "呼び出し";
      load.addEventListener("click", () => lpRestore(name));
      const del = document.createElement("button"); del.className = "row-del"; del.textContent = "✕";
      del.addEventListener("click", () => { const s = lpLoadStore(); delete s[name]; lpSaveStore(s); lpRenderSaveList(); });
      row.appendChild(load); row.appendChild(del); wrap.appendChild(row);
    });
  }
  $("lpSaveBtn").addEventListener("click", () => {
    const name = ($("lpSaveName").value || "").trim();
    if (!name) { $("lpSaveName").focus(); return; }
    if (!lpHasContent()) { lpSetStatus("保存できる伴奏がありません。先に録音してください。"); return; }
    lpSaveCurrent(name);
    $("lpSaveName").value = "";
    lpSetStatus(`「${name}」を保存しました。下の一覧からいつでも呼び出せます。`);
  });
  $("lpSaveName").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("lpSaveBtn").click(); } });
  lpUpdateButtons();

  KB.lpTapNote = lpTapNote;
  KB.lpSyncSig = lpSyncSig;
  KB.looper = { init() { lpRenderSaveList(); lpUpdateButtons(); } };
})();
