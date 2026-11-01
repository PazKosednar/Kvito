export interface PushPayload {
  title: string;
  body: string;
  /** Path inside the app that opens when the notification is tapped. */
  url?: string | null;
  tag?: string;
}

export interface PushTarget {
  provider: "WEB_PUSH" | "FCM" | "APNS";
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
}

export type PushResult = "sent" | "gone" | "failed";

/**
 * Transport-agnostic push. Web Push (VAPID) is the first implementation; FCM/APNs arrive with Capacitor
 * as further implementations of this interface.
 */
export interface PushSender {
  /** Public key the browser needs to subscribe; null when push is not configured. */
  readonly publicKey: string | null;
  send(target: PushTarget, payload: PushPayload): Promise<PushResult>;
}
