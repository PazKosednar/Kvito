/**
 * Web Push endpoints come from the browser, i.e. from the client: without a check the server could be made to
 * send requests to any address (SSRF, e.g. the hosting provider's internal network). Only the push services of
 * the browsers are allowed: Chrome/Edge (Android) and Opera via FCM, Firefox, Safari/iOS, Edge on Windows.
 */
const PUSH_HOSTS: RegExp[] = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];

export function isPushEndpoint(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((re) => re.test(host));
}
