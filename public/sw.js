/* Signal Petal notification worker.
   Its only job is to own reminder notifications so they survive a backgrounded
   tab and so clicking one brings the workspace back to the front. */

// Take over immediately instead of waiting for every old tab to close.
// Without this the very first showNotification() call runs against a
// registration that has no active worker yet, and it throws.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
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
