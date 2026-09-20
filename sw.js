/* Keyboard — Service Worker
   オフラインでも開けるように自分のファイルをキャッシュ。
   ネットワーク優先（HTTPキャッシュを使わず毎回サーバーに確認＝更新をすぐ反映）→ 失敗したらキャッシュ。
   record/（本格録音）の資源一覧と CACHE 名は、録音/web/tools/sync_keyboard.py が書き換える。 */
const CACHE = "keyboard-36255ef230";
const ASSETS = ["./", "./index.html", "./style.css", "./i18n.js", "./core.js", "./keyboard.js", "./tuner.js",
                "./metronome.js", "./looper.js", "./recorder.js", "./log.js", "./app.js",
                "./manifest.json", "./icon-192.png", "./icon-512.png", "./icon-512-maskable.png",
                "./record/apple-touch-icon.png", "./record/css/theme.css", "./record/icon-192.png",
                "./record/icon-512-maskable.png", "./record/icon-512.png", "./record/index.html",
                "./record/js/analysis.js", "./record/js/app.js", "./record/js/capture-core.js",
                "./record/js/capture-worker.js", "./record/js/disk-writer.js",
                "./record/js/edit.js", "./record/js/engine.js", "./record/js/finish.js",
                "./record/js/flac.js", "./record/js/host.js", "./record/js/i18n.js",
                "./record/js/importer.js", "./record/js/meterscale.js", "./record/js/miccal.js",
                "./record/js/model.js", "./record/js/quality.js", "./record/js/reverb.js",
                "./record/js/side.js", "./record/js/storage-worker.js", "./record/js/store.js",
                "./record/js/sweep.js", "./record/js/ui/context.js",
                "./record/js/ui/diagnostics.js", "./record/js/ui/export.js",
                "./record/js/ui/overdub.js", "./record/js/ui/record.js",
                "./record/js/ui/sessions.js", "./record/js/ui/settings.js", "./record/js/wav.js",
                "./record/js/waveform.js", "./record/js/worklets.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" }).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("./index.html")))
  );
});
