import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "../config/env.js";
import { bus } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { assertTenancyAccess } from "../modules/access/access.js";
import { verifyAccessToken } from "../modules/auth/tokens.js";
import { messageDto, messageInclude } from "../modules/messages/routes.js";

const room = (tenancyId: string) => `t:${tenancyId}`;

/**
 * Realtime layer: authenticated sockets join tenancy rooms (access checked like any API call) and receive
 * new messages, read markers and "something changed" hints. Clients fall back to polling when this is down.
 */
export function attachRealtime(http: HttpServer): Server {
  const io = new Server(http, {
    path: "/socket.io",
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
    serveClient: false,
  });

  io.use(async (socket, next) => {
    const token = (socket.handshake.auth as { token?: unknown }).token;
    const userId = typeof token === "string" ? await verifyAccessToken(token) : null;
    if (!userId) return next(new Error("UNAUTHORIZED"));
    socket.data.userId = userId;
    next();
  });

  io.on("connection", (socket) => {
    socket.on("join", async (tenancyId: unknown, ack?: (ok: boolean) => void) => {
      if (typeof tenancyId !== "string" || tenancyId.length > 64) return ack?.(false);
      try {
        await assertTenancyAccess(socket.data.userId as string, tenancyId);
        await socket.join(room(tenancyId));
        ack?.(true);
      } catch {
        ack?.(false);
      }
    });
    socket.on("leave", (tenancyId: unknown) => {
      if (typeof tenancyId === "string") void socket.leave(room(tenancyId));
    });
  });

  bus.on("message.created", ({ tenancyId, messageId }) => {
    void prisma.message
      .findUnique({ where: { id: messageId }, include: messageInclude })
      .then((m) => {
        if (m) io.to(room(tenancyId)).emit("message", messageDto(m));
      })
      .catch((err: unknown) => logger.warn({ err }, "realtime message emit failed"));
  });
  bus.on("conversation.read", (p) => io.to(room(p.tenancyId)).emit("read", p));
  bus.on("tenancy.changed", (p) => io.to(room(p.tenancyId)).emit("changed", p));

  return io;
}
