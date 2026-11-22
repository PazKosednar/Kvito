-- A house, an apartment or a commercial space is let as a whole and has exactly one unit (created with the
-- property since 22. 11. 2026). Existing ones without a unit get it now. Data only; re-running adds nothing.
INSERT INTO "Unit" ("id", "propertyId", "name", "createdAt", "updatedAt")
SELECT 'u' || replace(gen_random_uuid()::text, '-', ''),
       p."id",
       CASE p."type" WHEN 'HOUSE' THEN 'Cela hiša' WHEN 'APARTMENT' THEN 'Celo stanovanje' ELSE 'Cel prostor' END,
       now(),
       now()
FROM "Property" p
WHERE p."deletedAt" IS NULL
  AND p."type" IN ('HOUSE', 'APARTMENT', 'COMMERCIAL')
  AND NOT EXISTS (SELECT 1 FROM "Unit" u WHERE u."propertyId" = p."id" AND u."deletedAt" IS NULL);
