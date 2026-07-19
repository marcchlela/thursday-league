self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", event => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = {
        body: event.data.text()
      };
    }
  }

  const title =
    typeof payload.title === "string"
      ? payload.title
      : "Thursday League";

  const options = {
    body:
      typeof payload.body === "string"
        ? payload.body
        : "You have a new league update.",
    icon: "/icon.svg",
    data: {
      url: typeof payload.url === "string" ? payload.url : "/"
    },
    tag:
      typeof payload.tag === "string"
        ? payload.tag
        : "thursday-league-update"
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const relativeUrl = event.notification.data?.url || "/";
  const targetUrl = new URL(relativeUrl, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({
        type: "window",
        includeUncontrolled: true
      })
      .then(async windowClients => {
        const existingClient = windowClients.find(client =>
          client.url.startsWith(self.location.origin)
        );

        if (existingClient) {
          await existingClient.navigate(targetUrl);
          return existingClient.focus();
        }

        return self.clients.openWindow(targetUrl);
      })
  );
});