// =========================================================
// 서비스 워커 — 정적 파일을 캐시해 오프라인에서도 앱이 열리게 한다
// 코드를 고칠 때는 CACHE_NAME의 버전을 올려서 새 파일이 반영되게 한다
// =========================================================
const CACHE_NAME = "vocab-flashcards-v1";

const PRECACHE_URLS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "storage.js",
  "manage.js",
  "settings.js",
  "toast.js",
  "speech.js",
  "words.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match("index.html"));
    })
  );
});
