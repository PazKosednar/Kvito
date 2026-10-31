import { useAuthStore } from "@/auth/authStore";
import { API_BASE_URL } from "@/constants";
import { ApiError, type ApiErrorBody } from "@/types/api";

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

interface RequestOptions {
  method?: Method;
  /** JSON body. */
  body?: unknown;
  /** Raw body (file upload); sent with the blob's own Content-Type. */
  file?: Blob;
  /** Attach the access token and transparently refresh it once on 401. Default: true. */
  auth?: boolean;
  signal?: AbortSignal;
}

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Exchanges the httpOnly refresh cookie for a new access token. Concurrent callers share one request.
 * Returns null only when the server REJECTS the session (401/403). A network error or a server that is
 * restarting (5xx) throws ApiError("NETWORK") – that must never sign the person out.
 */
export function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= (async () => {
    try {
      let res: Response;
      try {
        res = await fetch(`${API_BASE_URL}/api/auth/refresh`, { method: "POST", credentials: "include" });
      } catch {
        throw new ApiError(0, "NETWORK");
      }
      if (res.status === 401 || res.status === 403) return null;
      if (!res.ok) throw new ApiError(res.status, "NETWORK");
      const { accessToken } = (await res.json()) as { accessToken: string };
      useAuthStore.getState().setAccessToken(accessToken);
      return accessToken;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function request(path: string, options: RequestOptions): Promise<Response> {
  const { method = "GET", body, file, auth = true, signal } = options;

  const send = (token: string | null) =>
    fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(file ? { "Content-Type": file.type || "application/octet-stream" } : {}),
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : file ? { body: file } : {}),
      ...(signal ? { signal } : {}),
    });

  let res: Response;
  try {
    res = await send(useAuthStore.getState().accessToken);
    if (auth && res.status === 401) {
      const token = await refreshAccessToken();
      if (!token) {
        useAuthStore.getState().clear();
      } else {
        res = await send(token);
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    if (err instanceof ApiError) throw err;
    throw new ApiError(0, "NETWORK");
  }

  if (!res.ok) {
    const data: unknown = await res.json().catch(() => null);
    const error = (data as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, error?.code ?? "UNKNOWN", error?.details);
  }
  return res;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await request(path, options);
  if (res.status === 204) return undefined as T;
  return (await res.json().catch(() => null)) as T;
}

/** Binary responses (e.g. the UPN QR as PNG). */
export async function apiBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  return (await request(path, options)).blob();
}

/** Absolute URL for links returned by the API (signed file URLs are relative to the API origin). */
export const apiUrl = (path: string) => (path.startsWith("http") ? path : `${API_BASE_URL}${path}`);
