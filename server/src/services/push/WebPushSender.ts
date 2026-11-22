import webpush from "web-push";
import { logger } from "../../lib/logger.js";
import { isPushEndpoint } from "../../lib/push-endpoint.js";
import type { PushPayload, PushResult, PushSender, PushTarget } from "./PushSender.js";

export class WebPushSender implements PushSender {
  constructor(
    readonly publicKey: string,
    privateKey: string,
    subject: string,
  ) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  }

  async send(target: PushTarget, payload: PushPayload): Promise<PushResult> {
    if (target.provider !== "WEB_PUSH" || !target.p256dh || !target.auth) return "failed";
    // Subscriptions stored before the endpoint check: never call an address outside the push services; drop them.
    if (!isPushEndpoint(target.endpoint)) return "gone";
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        { TTL: 24 * 60 * 60 },
      );
      return "sent";
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // 404/410: the browser dropped the subscription – remove it.
      if (status === 404 || status === 410) return "gone";
      // Not the error object: it carries the endpoint, which is a secret capability URL.
      logger.warn({ status }, "Web Push failed");
      return "failed";
    }
  }
}

/** Used when no VAPID keys are configured: nothing is pushed, notifications fall back to e-mail. */
export class NullPushSender implements PushSender {
  readonly publicKey = null;
  async send(): Promise<PushResult> {
    return "failed";
  }
}
