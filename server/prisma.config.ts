import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Prisma 7 reads the seed command from here (package.json#prisma.seed is no longer supported).
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Not env("DATABASE_URL"): that throws when the variable is missing, and `prisma generate`
    // (part of the build on Railway) must work without a database. Migrations still need it.
    url: process.env.DATABASE_URL ?? "",
  },
});
