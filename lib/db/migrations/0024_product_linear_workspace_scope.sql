DELETE FROM "product_linear_connections" AS "connection"
WHERE "connection"."id" NOT IN (
  SELECT DISTINCT ON ("dedupe"."product_id") "dedupe"."id"
  FROM "product_linear_connections" AS "dedupe"
  ORDER BY "dedupe"."product_id", "dedupe"."created_at" ASC, "dedupe"."id" ASC
);

ALTER TABLE "product_linear_connections"
  ALTER COLUMN "linear_project_id" DROP NOT NULL;

DROP INDEX IF EXISTS "product_linear_connection_product_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "product_linear_connection_product_idx"
  ON "product_linear_connections" ("product_id");
