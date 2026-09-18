/* ============================================================
   Keyboard — recorder：録音（マイク＋アプリ音ミックス → WebM / WAV、IndexedDB 保存）
   ============================================================ */
(() => {
  "use strict";
  const KB = window.KB;
  const { $, T, fmtClock, ensureCtx } = KB;
  const A = () => KB.audio.ctx;

  // ==========================================================
  //  録音（マイク＋アプリ音ミックス → WebM / WAV）
  // ==========================================================
  let mediaRec = null, recChunks = [], recStartT = 0, recTimer = null, recMicStream = null;
  const recordings = []; // {id, url, time, dur, blob, ext}

  // ---- IndexedDB：録音ファイルをブラウザ内に保存（リロードしても残る） ----
  const DB_NAME = "keyboard_db", DB_STORE = "recordings";
  function idbOpen() {
    return new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error("no idb"));
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore(DB_STORE, { keyPath: "id" }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  function idbReq(mode, fn) {
    return idbOpen().then(db => new Promise((res, rej) => {
      const tx = db.transaction(DB_STORE, mode);
      const rq = fn(tx.objectStore(DB_STORE));
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
      tx.oncomplete = () => db.close();
    }));
  }
  const idbAll = () => idbReq("readonly", st => st.getAll());
  const idbPut = rec => idbReq("readwrite", st => st.put(rec));
  const idbDel = id => idbReq("readwrite", st => st.delete(id));
  async function loadRecordings() {
    try {
      const rows = await idbAll();
      rows.sort((a, b) => b.id - a.id);
      for (const r of rows) recordings.push({ ...r, url: URL.createObjectURL(r.blob) });
      renderRecordings();
    } catch (_) { /* IndexedDB が使えない環境ではセッション内のみ保持 */ }
  }

  async function startRecording() {
    ensureCtx();
    const wantMic = $("recMic").checked, wantApp = $("recApp").checked;
    if (!wantMic && !wantApp) { $("recNote").textContent = "マイクかアプリ音のどちらかを選んでください。"; return; }
    const mixDest = A().createMediaStreamDestination();
    if (wantApp && KB.audio.appBus) KB.audio.appBus.connect(mixDest);
    if (wantMic) {
      try {
        recMicStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        A().createMediaStreamSource(recMicStream).connect(mixDest);
      } catch (e) {
        $("recNote").textContent = "マイクを取得できませんでした（許可が必要です）。アプリ音のみで録音します。";
      }
    }
    let mime = "";
    for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) { mime = m; break; }
    }
    try {
      mediaRec = new MediaRecorder(mixDest.stream, mime ? { mimeType: mime } : undefined);
    } catch (e) {
      $("recNote").textContent = "この環境では録音に対応していません。";
      return;
    }
    recChunks = [];
    mediaRec.ondataavailable = e => { if (e.data.size) recChunks.push(e.data); };
    mediaRec.onstop = () => {
      const blob = new Blob(recChunks, { type: mime || "audio/webm" });
      const url = URL.createObjectURL(blob);
      const dur = Math.round((performance.now() - recStartT) / 1000);
      const rec = { id: Date.now(), time: new Date().toLocaleString(), dur, blob, ext: mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm" };
      recordings.unshift({ ...rec, url });
      renderRecordings();
      idbPut(rec).catch(() => {});
      if (recMicStream) { recMicStream.getTracks().forEach(t => t.stop()); recMicStream = null; }
      try { if (wantApp && KB.audio.appBus) KB.audio.appBus.disconnect(mixDest); } catch (_) {}
    };
    mediaRec.start();
    recStartT = performance.now();
    $("recBtn").textContent = "■ 停止";
    $("recBtn").classList.add("on");
    KB.autoStartLog();
    recTimer = setInterval(() => { $("recTime").textContent = fmtClock((performance.now() - recStartT) / 1000); }, 250);
  }
  function stopRecording() {
    if (mediaRec && mediaRec.state !== "inactive") mediaRec.stop();
    clearInterval(recTimer);
    $("recBtn").textContent = "● 録音開始";
    $("recBtn").classList.remove("on");
    $("recTime").textContent = "00:00";
  }
  function renderRecordings() {
    const wrap = $("recList"); wrap.innerHTML = "";
    recordings.forEach((r, i) => {
      const row = document.createElement("div"); row.className = "rec-item";
      const audio = document.createElement("audio"); audio.controls = true; audio.src = r.url;
      const meta = document.createElement("span"); meta.className = "rec-meta";
      meta.textContent = `${r.time}・${fmtClock(r.dur)}`;
      const stamp = r.time.replace(/[^0-9]/g, "");
      const dl = document.createElement("a"); dl.className = "rec-dl"; dl.textContent = "元形式で保存";
      dl.href = r.url; dl.download = `practice_${stamp}.${r.ext}`;
      const wav = document.createElement("button"); wav.className = "rec-dl"; wav.textContent = "WAVで保存";
      wav.addEventListener("click", async () => {
        wav.textContent = "変換中…"; wav.disabled = true;
        try {
          const wurl = URL.createObjectURL(await blobToWav(r.blob));
          const a = document.createElement("a");
          a.href = wurl; a.download = `practice_${stamp}.wav`;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(wurl), 1000);
        } catch (err) { alert(T("WAV変換に失敗しました")); }
        wav.textContent = "WAVで保存"; wav.disabled = false;
      });
      const del = document.createElement("button"); del.className = "row-del"; del.textContent = "✕";
      del.addEventListener("click", () => {
        if (!confirm(T("この録音を削除しますか？"))) return;
        URL.revokeObjectURL(r.url); recordings.splice(i, 1); renderRecordings();
        if (r.id) idbDel(r.id).catch(() => {});
      });
      row.append(audio, meta, dl, wav, del);
      wrap.appendChild(row);
    });
  }
  async function blobToWav(blob) {
    ensureCtx();
    const arr = await blob.arrayBuffer();
    return encodeWav(await A().decodeAudioData(arr.slice(0)));
  }
  function encodeWav(buf) {
    const numCh = buf.numberOfChannels, sr = buf.sampleRate, len = buf.length;
    const chans = [];
    for (let c = 0; c < numCh; c++) chans.push(buf.getChannelData(c));
    const blockAlign = numCh * 2, dataSize = len * blockAlign;
    const out = new ArrayBuffer(44 + dataSize);
    const view = new DataView(out);
    const wr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    wr(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); wr(8, "WAVE");
    wr(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true); view.setUint32(24, sr, true);
    view.setUint32(28, sr * blockAlign, true); view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true); wr(36, "data"); view.setUint32(40, dataSize, true);
    let off = 44;
    for (let i = 0; i < len; i++) for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2;
    }
    return new Blob([out], { type: "audio/wav" });
  }
  $("recBtn").addEventListener("click", () => {
    (mediaRec && mediaRec.state === "recording") ? stopRecording() : startRecording();
  });

  KB.recorder = { init() { renderRecordings(); loadRecordings(); } };
})();
