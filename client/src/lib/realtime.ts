import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "@/auth/authStore";
import { API_BASE_URL } from "@/constants";
import { refreshAccessToken } from "./api";

/**
 * One shared Socket.IO connection for the signed-in user. Rooms are joined per tenancy; the server checks
 * access exactly like the REST API. If the socket is down, callers fall back to polling.
 */
let socket: Socket | null = null;

export function getSocket(): Socket | null {
  const token = useAuthStore.getState().accessToken;
  if (!token) return null;
  if (socket) return socket;
  socket = io(API_BASE_URL || undefined, {
    path: "/socket.io",
    auth: (cb) => cb({ token: useAuthStore.getState().accessToken }),
    transports: ["websocket", "polling"],
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });
  // An expired access token is refreshed and the connection retried.
  socket.on("connect_error", (err) => {
    if (err.message === "UNAUTHORIZED") void refreshAccessToken().then((t) => t && socket?.connect());
  });
  // The server closes a socket when its access token expires; Socket.IO does not reconnect by itself after a
  // server-side disconnect, so get a fresh token and connect again (rooms are re-joined on "connect").
  socket.on("disconnect", (reason) => {
    if (reason !== "io server disconnect") return;
    void refreshAccessToken()
      .then((t) => t && socket?.connect())
      .catch(() => undefined); // offline: screens keep polling until the next sign-in or reload
  });
  return socket;
}

export function closeSocket() {
  socket?.close();
  socket = null;
}
