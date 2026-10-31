import type { CostType } from "../generated/prisma/client.js";

/**
 * Default UPN purpose code per cost type. All codes are taken from the official ZBS list
 * ("Skrajšani nazivi kode namena", 2019-08-07) – see docs/UPN-QR.md. Landlords can override per charge.
 */
export const PURPOSE_CODE_BY_COST: Record<CostType, string> = {
  RENT: "RENT", // Najemnina
  ELECTRICITY: "ELEC", // Račun za elektriko
  WATER: "WTER", // Račun za vodo/vodarina
  GAS: "GASB", // Račun za plin
  HEATING: "ENRG", // Energetika
  WASTE: "UBIL", // Povezane komunalne storitve
  INTERNET: "PHON", // Račun za telefon
  TV: "CBTV", // Račun za kabelsko TV
  MAINTENANCE_FUND: "BLDM", // Vzdrževanje zgradb
  BUILDING_MANAGEMENT: "BLDM",
  CLEANING: "BLDM",
  OTHER: "OTHR", // Drugo
};

/** Deposit (varščina). */
export const DEPOSIT_PURPOSE_CODE = "DEPT";
