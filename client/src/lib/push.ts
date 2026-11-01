import { api } from "@/lib/api";

/** Browser side of Web Push. Capacitor will swap this for FCM/APNs registration. */

export const pushSupported = (): boolean =>
  typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  // In development the service worker is switched off, so there is nothing to subscribe with.
  return pushSupported() ? navigator.serviceWorker.getRegistration() : undefined;
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

function keyToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Asks for permission, subscribes this device and registers it on the server. */
export async function enablePush(publicKey: string): Promise<"on" | "denied" | "unsupported"> {
  const reg = await registration();
  if (!reg) return "unsupported";
  if ((await Notification.requestPermission()) !== "granted") return "denied";
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }));
  const json = sub.toJSON();
  await api("/api/push/subscriptions", {
    method: "POST",
    body: { endpoint: sub.endpoint, keys: json.keys, userAgent: navigator.userAgent.slice(0, 300) },
  });
  return "on";
}

/** Removes this device from the server and the browser. Safe to call when nothing is subscribed. */
export async function disablePush(): Promise<void> {
  const sub = await currentPushSubscription();
  if (!sub) return;
  await api("/api/push/subscriptions", { method: "DELETE", body: { endpoint: sub.endpoint } }).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}
