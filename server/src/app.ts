import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { apiLimiter } from "./middleware/rateLimit.js";
import { authRouter } from "./modules/auth/routes.js";
import { invitationsRouter } from "./modules/invitations/routes.js";
import { propertiesRouter } from "./modules/properties/routes.js";
import { tenanciesRouter } from "./modules/tenancies/routes.js";
import { usersRouter } from "./modules/users/routes.js";
import type { EmailSender } from "./services/email/EmailSender.js";

export interface AppDeps {
  emailSender: EmailSender;
}

export function createApp(deps: AppDeps): Express {
  const app = express();

  // Railway (and most PaaS) terminate TLS at a single proxy hop.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  if (env.NODE_ENV !== "test") {
    app.use(
      pinoHttp({
        logger,
        autoLogging: { ignore: (req) => req.url === "/api/health" },
        // One compact line per request; never log bodies (they may contain codes or personal data).
        serializers: {
          req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
          res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
        },
      }),
    );
  }

  app.get("/api/health", async (_req, res) => {
    const db = await prisma.$queryRaw`SELECT 1`.then(
      () => true,
      () => false,
    );
    res.status(db ? 200 : 503).json({ ok: db, db });
  });

  app.use("/api", apiLimiter);
  app.use("/api/auth", authRouter(deps));
  app.use("/api/me", usersRouter());
  // Routers below share the /api prefix. Each applies requireAuth to everything after its public routes,
  // so routers with public endpoints (invitation preview) must be mounted first.
  app.use("/api", invitationsRouter(deps));
  app.use("/api", propertiesRouter());
  app.use("/api", tenanciesRouter());

  app.use("/api", notFoundHandler);
  app.use(errorHandler);
  return app;
}
