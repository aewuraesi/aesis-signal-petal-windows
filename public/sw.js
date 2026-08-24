/* Signal Petal's local-first worker owns reminders and keeps the last working
   application shell available when the device is offline. */
const CACHE = "signal-petal-shell-v2";
const SHELL = ["/", "/manifest.webmanifest", "/favicon.svg"];

// Take over immediately instead of waiting for every old tab to close.
// Without this the very first showNotification() call runs against a
// registration that has no active worker yet, and it throws.
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => Promise.allSettled(SHELL.map(path => cache.add(path)))));
});

self.addEventListener("activate", event => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("signal-petal-shell-") && key !== CACHE).map(key => caches.delete(key)))),
  ]));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put("/", copy));
      return response;
    }).catch(() => caches.match("/")));
    return;
  }

  if (["style", "script", "font", "image"].includes(request.destination) || SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
      return response;
    })));
  }
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
      const existing = clients.find(client => "focus" in client);
      return existing ? existing.focus() : self.clients.openWindow("/");
    })
  );
});
