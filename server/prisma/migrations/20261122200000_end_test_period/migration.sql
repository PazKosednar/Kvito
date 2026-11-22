-- End of the test period (docs/NAROCNINA.md, 4): plan limits now always apply.
-- Data only, no schema change. Safe to run once; re-running changes nothing new.

-- 1. Founding price (-30 %, forever) for every landlord who signed up during the test period.
INSERT INTO "Subscription" ("userId", "founder", "createdAt", "updatedAt")
SELECT u."id", true, now(), now()
FROM "User" u
WHERE 'LANDLORD' = ANY(u."roles") AND u."deletedAt" IS NULL
ON CONFLICT ("userId") DO UPDATE SET "founder" = true, "updatedAt" = now();

-- 2. Landlords with more than one unit and no package yet get 30 days of the package that fits their units
--    (Kvito's own trial: TRIALING without a provider subscription; after trialEndsAt the plan is FREE again).
WITH counts AS (
  SELECT p."ownerId" AS "userId", count(*) AS n
  FROM "Unit" un
  JOIN "Property" p ON p."id" = un."propertyId"
  WHERE un."deletedAt" IS NULL AND p."deletedAt" IS NULL
  GROUP BY p."ownerId"
)
UPDATE "Subscription" s
SET "plan" = (CASE WHEN c.n <= 3 THEN 'PLUS' WHEN c.n <= 10 THEN 'PRO' ELSE 'MANAGER' END)::"Plan",
    "status" = 'TRIALING',
    "trialEndsAt" = now() + interval '30 days',
    "updatedAt" = now()
FROM counts c
WHERE c."userId" = s."userId"
  AND c.n > 1
  AND s."plan" = 'FREE'
  AND s."providerSubscriptionId" IS NULL
  AND s."trialEndsAt" IS NULL;
