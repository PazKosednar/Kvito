/* Web Push handlers, pulled into the generated service worker via workbox.importScripts. */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* not JSON – show the generic text below */
  }
  const title = data.title || "Kvito";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/pwa-192x192.png",
      badge: "/favicon.ico",
      tag: data.tag,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          return w.navigate(target).then((c) => (c || w).focus());
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
