/* Signal Petal's local-first worker owns reminders and keeps the last working
   application shell available when the device is offline. */
const CACHE = "signal-petal-shell-v2";
const SHELL = ["/", "/manifest.webmanifest", "/favicon.svg"];

// Take over immediately instead of waiting for every old tab to close.
// Without this the very first showNotification() call runs against a
// registration that has no active worker yet, and it throws.
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.allSettled(SHELL.map((path) => cache.add(path))),
      ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) => key.startsWith("signal-petal-shell-") && key !== CACHE,
              )
              .map((key) => caches.delete(key)),
          ),
        ),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  if (
    ["style", "script", "font", "image"].includes(request.destination) ||
    SHELL.includes(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok)
              caches
                .open(CACHE)
                .then((cache) => cache.put(request, response.clone()));
            return response;
          }),
      ),
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((client) => "focus" in client);
        return existing ? existing.focus() : self.clients.openWindow("/");
      }),
  );
});

/* ---------------------------------------------------------------------------
   Reminders.

   The page used to decide whether a reminder was due AND deliver it, which meant
   reminders only existed while a tab was open and watching, and two open tabs could
   fire the same one twice. The decision now lives here, once.

   The schedule and the record of what has been sent are kept in the cache rather
   than in a variable: a service worker is stopped and restarted at the browser's
   discretion, so anything held in memory is gone by the next wake.

   What this can and cannot do: the worker is woken by the app being opened, by any
   other tab of it, and by periodic background sync where the browser offers it. It
   cannot wake a sleeping machine or a browser that is not running - nothing in a web
   app can - so a reminder that comes due meanwhile is delivered at the next wake and
   the app says so rather than pretending it arrived on time.
--------------------------------------------------------------------------- */
const REMINDER_CACHE = "signal-petal-reminders-v1";
const SCHEDULE_URL = "https://signal-petal.local/schedule";
const SENT_URL = "https://signal-petal.local/sent";
const OUTBOX_URL = "https://signal-petal.local/outbox";
/* Enough to answer "did today's fire?" and to catch up after a weekend away. */
const SENT_LIMIT = 30;

async function readJson(url, fallback) {
  try {
    const cache = await caches.open(REMINDER_CACHE);
    const response = await cache.match(url);
    if (!response) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
}

async function writeJson(url, value) {
  try {
    const cache = await caches.open(REMINDER_CACHE);
    await cache.put(
      url,
      new Response(JSON.stringify(value), {
        headers: { "content-type": "application/json" },
      }),
    );
  } catch {
    /* A worker that cannot remember still delivers; it just repeats itself. */
  }
}

async function remember(record) {
  const sent = await readJson(SENT_URL, []);
  const next = [
    ...sent.filter((item) => item.key !== record.key),
    record,
  ].slice(-SENT_LIMIT);
  await writeJson(SENT_URL, next);
  return next;
}

async function rememberOutbox(record) {
  const outbox = await readJson(OUTBOX_URL, []);
  const next = [
    ...outbox.filter((item) => item.id !== record.id),
    record,
  ].slice(-100);
  await writeJson(OUTBOX_URL, next);
  await announce({ type: "signal-petal-outbox", outbox: next });
  return next;
}

async function deliver(record) {
  const queuedAt = Date.now();
  await rememberOutbox({ ...record, status: "queued", queuedAt });
  try {
    await self.registration.showNotification(record.title, {
      body: record.body,
      tag: record.id,
      icon: "/favicon.svg",
    });
    await rememberOutbox({
      ...record,
      status: "delivered",
      queuedAt,
      deliveredAt: Date.now(),
    });
    return true;
  } catch (error) {
    await rememberOutbox({
      ...record,
      status: "failed",
      queuedAt,
      failedAt: Date.now(),
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function announce(message) {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  clients.forEach((client) => client.postMessage(message));
}

/* Every reminder has a key that includes the day it belongs to, so one is delivered
   once per day however many times the worker is woken. */
async function runReminderCheck(now = Date.now()) {
  const schedule = await readJson(SCHEDULE_URL, null);
  if (!schedule || !schedule.remindersOn) return;
  if (self.Notification && self.Notification.permission !== "granted") return;
  const sent = await readJson(SENT_URL, []);
  const already = new Set(sent.map((record) => record.key));
  let latest = sent;

  const taskKey = `tasks|${schedule.day}|${schedule.overdue}|${schedule.upcoming}`;
  if ((schedule.overdue || schedule.upcoming) && !already.has(taskKey)) {
    const parts = [
      schedule.overdue ? `${schedule.overdue} overdue` : "",
      schedule.upcoming ? `${schedule.upcoming} due within 24 hours` : "",
    ]
      .filter(Boolean)
      .join(" and ");
    const delivered = await deliver({
      id: taskKey,
      channel: "browser",
      kind: "task-attention",
      title: "Signal Petal needs attention",
      body: `${parts}. Open your queue to record the next move.`,
    });
    if (delivered)
      latest = await remember({
        key: taskKey,
        at: now,
        title: "Work needing attention",
      });
  }

  const checkInKey = `check-in|${schedule.day}`;
  if (
    schedule.checkInAt !== null &&
    now >= schedule.checkInAt &&
    !already.has(checkInKey)
  ) {
    const delivered = await deliver({
      id: checkInKey,
      channel: "browser",
      kind: "daily-check-in",
      title: "Daily Signal Petal check-in",
      body: "Take a moment to update your work and write down how the day felt.",
    });
    if (delivered)
      latest = await remember({
        key: checkInKey,
        at: now,
        title: "Daily check-in",
      });
  }

  if (latest !== sent)
    await announce({ type: "signal-petal-sent", sent: latest });
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "signal-petal-schedule") {
    event.waitUntil(
      writeJson(SCHEDULE_URL, data.schedule).then(() => runReminderCheck()),
    );
    return;
  }
  if (data.type === "signal-petal-check") {
    event.waitUntil(runReminderCheck());
    return;
  }
  if (data.type === "signal-petal-sent?") {
    event.waitUntil(
      readJson(SENT_URL, []).then((sent) =>
        announce({ type: "signal-petal-sent", sent }),
      ),
    );
    return;
  }
  if (data.type === "signal-petal-outbox?") {
    event.waitUntil(
      readJson(OUTBOX_URL, []).then((outbox) =>
        announce({ type: "signal-petal-outbox", outbox }),
      ),
    );
  }
});

/* Offered by some browsers to an installed app; where it exists, this is the path
   that fires with no tab open at all. Where it does not, nothing here changes. */
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "signal-petal-reminders")
    event.waitUntil(runReminderCheck());
});

self.addEventListener("sync", (event) => {
  if (event.tag === "signal-petal-reminders")
    event.waitUntil(runReminderCheck());
});
