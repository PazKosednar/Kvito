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
  OTP_PEPPER: z.string().min(32),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  OTP_TTL_MIN: z.coerce.number().int().positive().default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_MAX_PER_HOUR: z.coerce.number().int().positive().default(5),
  COOKIE_SECURE: bool.default(false),
  UPLOAD_DIR: z.string().default("uploads"),
  /** Web Push (VAPID). Without keys push is switched off and e-mail is used. Generate: npm run vapid -w server */
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z.string().min(1).default("mailto:podpora@kvito.si"),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration (see server/.env.example):\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
export const isProd = env.NODE_ENV === "production";
