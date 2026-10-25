// v3 bumps the cache name so the activate step purges everything cached by v1/v2, including /_next assets
// that went stale after code changes. App code under /_next is never cached here any more.
const CACHE = "nyayasetu-pwa-v3";
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["/nyayasetu.svg"])));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Only static assets are cached. Authenticated HTML navigations are never stored.
  if (request.mode === "navigate") return;
  if (url.pathname.startsWith("/icons/") || url.pathname === "/nyayasetu.svg") {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
      return response;
    })());
  }
});

// Web Push: show a notification with only the case id, event label and link. Never complaint text.
self.addEventListener("push", (event) => {
  let payload = { title: "NyayaSetu", body: "You have a new update.", link: "/" };
  try { payload = { ...payload, ...event.data.json() }; } catch { /* keep defaults */ }
  event.waitUntil(self.registration.showNotification(payload.title, { body: payload.body, data: { link: payload.link }, icon: "/nyayasetu.svg", tag: payload.link }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const open = clients.find((client) => new URL(client.url).pathname === link);
    if (open) return open.focus();
    return self.clients.openWindow(link);
  }));
});
