import { pino } from "pino";
import { env, isProd } from "../config/env.js";

export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL,
  redact: ["req.headers.authorization", "req.headers.cookie", "res.headers['set-cookie']"],
  ...(isProd ? {} : { transport: { target: "pino-pretty", options: { colorize: true, singleLine: true, ignore: "pid,hostname" } } }),
});
