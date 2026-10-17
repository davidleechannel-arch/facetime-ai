// Shows routine notifications and opens the right screen when tapped.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const hash = (event.notification.data && event.notification.data.url) || "#/";
  const target = new URL(self.registration.scope).href + hash;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if (c.url.startsWith(self.registration.scope)) {
          await c.focus();
          return c.navigate(target);
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
