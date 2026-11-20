-- Apartment size as in Slovenian listings (garsonjera, enosobno, …) replaces the numeric room count.
CREATE TYPE "UnitLayout" AS ENUM ('STUDIO', 'ONE', 'ONE_HALF', 'TWO', 'TWO_HALF', 'THREE', 'THREE_HALF', 'FOUR', 'FOUR_HALF', 'FIVE_PLUS', 'OTHER');

ALTER TABLE "Unit" ADD COLUMN "layout" "UnitLayout";

-- Keep what was already entered as a room count.
UPDATE "Unit" SET "layout" = (CASE
  WHEN "rooms" < 1 THEN 'STUDIO'
  WHEN "rooms" = 1 THEN 'ONE'
  WHEN "rooms" = 1.5 THEN 'ONE_HALF'
  WHEN "rooms" = 2 THEN 'TWO'
  WHEN "rooms" = 2.5 THEN 'TWO_HALF'
  WHEN "rooms" = 3 THEN 'THREE'
  WHEN "rooms" = 3.5 THEN 'THREE_HALF'
  WHEN "rooms" = 4 THEN 'FOUR'
  WHEN "rooms" = 4.5 THEN 'FOUR_HALF'
  ELSE 'FIVE_PLUS'
END)::"UnitLayout"
WHERE "rooms" IS NOT NULL;

ALTER TABLE "Unit" DROP COLUMN "rooms";
