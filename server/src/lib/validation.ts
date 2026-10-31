import { z } from "zod";
import { isValidIban, normalizeIban } from "./iban.js";
import { parseDateOnly } from "./dates.js";

/** Shared zod building blocks. Error messages are codes; the client translates them. */

export const text = (max: number) => z.string().trim().min(1).max(max);
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const cents = z.number().int().min(0).max(99_999_999_999);
export const positiveCents = z.number().int().min(1).max(99_999_999_999);

export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    try {
      parseDateOnly(v);
      return true;
    } catch {
      return false;
    }
  }, "INVALID_DATE")
  .transform(parseDateOnly);

export const iban = z
  .string()
  .transform(normalizeIban)
  .refine(isValidIban, "INVALID_IBAN");

export const idParam = z.string().min(1).max(64);

export const COST_TYPES = [
  "RENT",
  "ELECTRICITY",
  "WATER",
  "GAS",
  "HEATING",
  "WASTE",
  "INTERNET",
  "TV",
  "MAINTENANCE_FUND",
  "BUILDING_MANAGEMENT",
  "CLEANING",
  "OTHER",
] as const;
export const costType = z.enum(COST_TYPES);
export const splitMethod = z.enum(["EQUAL", "PERCENTAGE", "PER_PERSON"]);
