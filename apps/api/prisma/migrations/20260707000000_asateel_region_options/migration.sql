-- Replace legacy Asateel region enum values with the current business set.
CREATE TYPE "AsateelRegion_new" AS ENUM ('CENTRAL', 'EASTERN', 'WESTERN', 'PT_PROJECT', 'MAIN');

ALTER TABLE "Invoice"
  ALTER COLUMN "asateelRegion" TYPE "AsateelRegion_new"
  USING (
    CASE "asateelRegion"::text
      WHEN 'CENTRAL' THEN 'CENTRAL'::"AsateelRegion_new"
      WHEN 'PROJECTS' THEN 'PT_PROJECT'::"AsateelRegion_new"
      WHEN 'ADMIN' THEN 'MAIN'::"AsateelRegion_new"
      ELSE NULL
    END
  );

DROP TYPE "AsateelRegion";
ALTER TYPE "AsateelRegion_new" RENAME TO "AsateelRegion";
