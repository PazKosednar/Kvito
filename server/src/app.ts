import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env, isProd } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { apiLimiter } from "./middleware/rateLimit.js";
import { requireAuth } from "./middleware/auth.js";
import { attachmentsRouter, filesPublicRouter } from "./modules/attachments/routes.js";
import { authRouter } from "./modules/auth/routes.js";
import { bankRouter } from "./modules/bank/routes.js";
import { chargesRouter } from "./modules/charges/routes.js";
import { contractRouter } from "./modules/contract/routes.js";
import { invitationsPublicRouter, invitationsRouter } from "./modules/invitations/routes.js";
import { documentsRouter } from "./modules/documents/routes.js";
import { handoversRouter } from "./modules/handovers/routes.js";
import { issuesRouter } from "./modules/issues/routes.js";
import { metersRouter } from "./modules/meters/routes.js";
import { notificationsRouter } from "./modules/notifications/routes.js";
import { messagesRouter } from "./modules/messages/routes.js";
import { privacyRouter } from "./modules/users/privacy.js";
import { referencesPublicRouter, referencesRouter } from "./modules/references/routes.js";
import { reportsRouter } from "./modules/reports/routes.js";
import { propertiesRouter } from "./modules/properties/routes.js";
import { tenanciesRouter } from "./modules/tenancies/routes.js";
import { upnRouter } from "./modules/upn/routes.js";
import { usersRouter } from "./modules/users/routes.js";
import type { EmailSender } from "./services/email/EmailSender.js";
import type { Storage } from "./services/storage/Storage.js";

export interface AppDeps {
  emailSender: EmailSender;
  storage: Storage;
  /** Public VAPID key; null/undefined when Web Push is not configured. */
  pushPublicKey?: string | null;
}

export function createApp(deps: AppDeps): Express {
  const app = express();

  // Railway (and most PaaS) terminate TLS at a single proxy hop.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "same-site" },
      contentSecurityPolicy: {
        directives: {
          // Fonts are bundled (no CDN); blob: is used for photo previews and the saved QR image.
          "default-src": ["'self'"],
          "img-src": ["'self'", "data:", "blob:"],
          "connect-src": ["'self'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "frame-ancestors": ["'none'"],
          // https-only upgrade would break plain-http local runs of the production build.
          "upgrade-insecure-requests": isProd ? [] : null,
        },
      },
    }),
  );
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  if (env.NODE_ENV !== "test") {
    app.use(
      pinoHttp({
        logger,
        autoLogging: { ignore: (req) => req.url === "/api/health" },
        // One compact line per request; never log bodies or query strings with signatures.
        serializers: {
          req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url.split("?")[0] }),
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
  // Public endpoints (no sign-in): signed file links, invitation preview, UPN test samples.
  app.use("/api", upnRouter());
  app.use("/api", filesPublicRouter(deps));
  app.use("/api", invitationsPublicRouter());
  app.use("/api", referencesPublicRouter());

  // Everything below requires a valid access token. Routers do not repeat this check.
  app.use("/api", requireAuth);
  app.use("/api", notificationsRouter(deps));
  app.use("/api", attachmentsRouter(deps));
  app.use("/api", invitationsRouter(deps));
  app.use("/api", propertiesRouter());
  app.use("/api", reportsRouter());
  app.use("/api", referencesRouter());
  app.use("/api", privacyRouter());
  app.use("/api", tenanciesRouter());
  app.use("/api", chargesRouter(deps));
  app.use("/api", contractRouter());
  app.use("/api", bankRouter());
  app.use("/api", messagesRouter());
  app.use("/api", issuesRouter());
  app.use("/api", metersRouter());
  app.use("/api", documentsRouter());
  app.use("/api", handoversRouter(deps));

  app.use("/api", notFoundHandler);

  // One service: the same server delivers the built web client (PWA) when it is there.
  if (env.SERVE_CLIENT ?? isProd) serveClient(app);

  app.use(errorHandler);
  return app;
}

const CLIENT_DIST = fileURLToPath(new URL("../../client/dist/", import.meta.url));

/** Static files with sane caching: hashed assets forever, the app shell and service worker never. */
function serveClient(app: Express): void {
  app.use(
    express.static(CLIENT_DIST, {
      index: false,
      setHeaders(res, file) {
        const name = path.basename(file);
        const immutable = file.includes(`${path.sep}assets${path.sep}`);
        res.setHeader("Cache-Control", immutable ? "public, max-age=31536000, immutable" : name === "sw.js" || name.endsWith(".html") || name === "manifest.webmanifest" ? "no-cache" : "public, max-age=3600");
      },
    }),
  );
  // Client-side routes (React Router): everything that is not API, realtime or a file gets the app shell.
  app.get(/^\/(?!api\/|socket\.io\/).*/, (req, res, next) => {
    if (path.extname(req.path)) return next();
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(CLIENT_DIST, "index.html"), (err) => err && next(err));
  });
}
