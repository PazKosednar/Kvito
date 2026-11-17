import "dotenv/config";
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4180),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.string().min(1),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5180"),
  JWT_ACCESS_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_SECURE: bool.default(false),
  UPLOAD_DIR: z.string().default("uploads"),
  /** Serve the built web client from this server (one Railway service). Default: on in production. */
  SERVE_CLIENT: bool.optional(),
  /** E-mail over SMTP (any EU provider). Required in production, otherwise e-mails are only printed. */
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: bool.default(false),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(3).default("Kvito <obvestila@kvito.si>"),
  /**
   * Temporary escape hatch for a test deployment without an SMTP provider: e-mails (including login codes)
   * are written to the server log. Never enable it once real users sign in.
   */
  EMAIL_CONSOLE_IN_PRODUCTION: bool.default(false),
  /**
   * Temporary, for testing without an SMTP provider: a new account signs in right away, without the e-mailed code,
   * and an unconfirmed e-mail does not block login. The e-mail stays unconfirmed (emailVerifiedAt = null).
   * An e-mail that already has an account cannot be signed up again, so nobody can take over an unconfirmed one.
   */
  SKIP_EMAIL_VERIFICATION: bool.default(false),
  /** "local" = UPLOAD_DIR on disk (development). "s3" = S3-compatible EU object storage (production). */
  STORAGE_DRIVER: z.enum(["local", "s3"]).optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).default("eu-central-1"),
  S3_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_FORCE_PATH_STYLE: bool.default(false),
  /** Web Push (VAPID). Without keys push is switched off and e-mail is used. Generate: npm run vapid -w server */
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z.string().min(1).default("mailto:podpora@kvito.si"),
  /** Kvito assistant for landlords (Claude API). Without a key the assistant is switched off. */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ASSISTANT_MODEL: z.string().min(1).default("claude-haiku-5-5"),
  /** Claude API address (overridden only in tests with a local stand-in). */
  ANTHROPIC_BASE_URL: z.string().url().default("https://api.anthropic.com"),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration (see server/.env.example):\n${issues}`);
  }
  const data = parsed.data;
  if (data.NODE_ENV === "production") {
    // Mistakes that silently weaken a live deployment are refused at start-up instead.
    const problems: string[] = [];
    if (!data.CLIENT_ORIGIN.startsWith("https://")) problems.push("CLIENT_ORIGIN must be an https:// address in production");
    if (/change[_-]?me/i.test(data.JWT_ACCESS_SECRET)) problems.push("JWT_ACCESS_SECRET is still the placeholder from .env.example");
    if (new Set(data.JWT_ACCESS_SECRET).size < 12) problems.push("JWT_ACCESS_SECRET is not random enough (generate it as described in .env.example)");
    if (problems.length) throw new Error(`Unsafe production configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  }
  return data;
}

export const env = loadEnv();
export const isProd = env.NODE_ENV === "production";
