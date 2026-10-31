import { execSync } from "node:child_process";

/** Applies migrations to the test database once per run (creates it if missing). */
export default function setup() {
  const url = process.env["DATABASE_URL_TEST"];
  if (!url) {
    console.warn("[tests] DATABASE_URL_TEST ni nastavljen – integracijski testi bodo preskočeni.");
    return;
  }
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
