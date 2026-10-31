import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/auth/authStore";
import { ApiError } from "@/types/api";
import { api, refreshAccessToken } from "./api";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  useAuthStore.setState({ status: "authenticated", accessToken: "old", user: null });
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const authHeader = (call: number) =>
  (fetchMock.mock.calls[call]?.[1]?.headers as Record<string, string> | undefined)?.["Authorization"];

describe("api client", () => {
  it("sends the access token", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    await expect(api("/api/me")).resolves.toEqual({ ok: true });
    expect(authHeader(0)).toBe("Bearer old");
  });

  it("refreshes once on 401 and retries with the new token", async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: "TOKEN_INVALID" } }))
      .mockResolvedValueOnce(json(200, { accessToken: "new" }))
      .mockResolvedValueOnce(json(200, { ok: true }));

    await expect(api("/api/me")).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/auth/refresh");
    expect(authHeader(2)).toBe("Bearer new");
    expect(useAuthStore.getState().accessToken).toBe("new");
  });

  it("signs out locally when the refresh fails", async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: "TOKEN_INVALID" } }))
      .mockResolvedValueOnce(json(401, { error: { code: "REFRESH_INVALID" } }));

    await expect(api("/api/me")).rejects.toMatchObject({ status: 401, code: "TOKEN_INVALID" });
    expect(useAuthStore.getState().status).toBe("anonymous");
  });

  it("keeps the session when the server is unreachable during refresh", async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: "TOKEN_INVALID" } }))
      .mockResolvedValueOnce(json(502, { error: { code: "BAD_GATEWAY" } }));
    await expect(api("/api/me")).rejects.toMatchObject({ code: "NETWORK" });
    expect(useAuthStore.getState().status).toBe("authenticated");
  });

  it("shares a single refresh request between concurrent callers", async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    const a = refreshAccessToken();
    const b = refreshAccessToken();
    resolve(json(200, { accessToken: "shared" }));
    await expect(Promise.all([a, b])).resolves.toEqual(["shared", "shared"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps error bodies and network failures to ApiError", async () => {
    fetchMock.mockResolvedValueOnce(json(400, { error: { code: "OTP_INVALID" } }));
    await expect(api("/api/auth/verify-code", { method: "POST", body: {}, auth: false })).rejects.toEqual(
      new ApiError(400, "OTP_INVALID"),
    );

    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(api("/api/me", { auth: false })).rejects.toMatchObject({ code: "NETWORK" });
  });
});
