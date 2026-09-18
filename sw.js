/* Keyboard — Service Worker
   オフラインでも開けるように自分のファイルをキャッシュ。
   ネットワーク優先（HTTPキャッシュを使わず毎回サーバーに確認＝更新をすぐ反映）→ 失敗したらキャッシュ。 */
const CACHE = "keyboard-v6";
const ASSETS = ["./", "./index.html", "./style.css", "./i18n.js", "./core.js", "./keyboard.js", "./tuner.js",
                "./metronome.js", "./looper.js", "./recorder.js", "./log.js", "./app.js", "./manifest.json",
                "./icon-192.png", "./icon-512.png", "./icon-512-maskable.png"];

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
    }).catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});
