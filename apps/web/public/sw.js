// Intentionally do not cache pages, API responses, prices, or signals.
// This keeps live market data from being presented as current after going offline.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const previousAppCaches = new Set([
    "start-url",
    "google-fonts-webfonts",
    "google-fonts-stylesheets",
    "static-font-assets",
    "static-image-assets",
    "static-audio-assets",
    "static-video-assets",
    "static-js-assets",
    "static-style-assets",
    "next-data",
    "apis",
    "others",
    "cross-origin",
  ]);

  event.waitUntil(
    caches.keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) =>
              previousAppCaches.has(cacheName) || cacheName.startsWith("workbox-precache-v2-"),
            )
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
