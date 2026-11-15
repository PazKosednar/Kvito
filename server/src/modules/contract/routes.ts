import { Router } from "express";
import { costsRouter } from "./costs.js";
import { depositRouter } from "./deposit.js";
import { rentRouter } from "./rent.js";
import { settlementsRouter } from "./settlements.js";

/** Money agreed in the contract: deposit, monthly cost advances and settlements, rent changes, closing a tenancy. */
export function contractRouter(): Router {
  const router = Router();
  router.use(depositRouter());
  router.use(settlementsRouter());
  router.use(costsRouter());
  router.use(rentRouter());
  return router;
}
