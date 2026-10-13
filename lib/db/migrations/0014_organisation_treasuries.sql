BEGIN;

CREATE TABLE "organisation_treasuries" (
  "id" serial PRIMARY KEY,
  "organisation_id" integer NOT NULL UNIQUE REFERENCES "organisations"("id"),
  "wallet_address" text NOT NULL UNIQUE,
  "cluster" text NOT NULL DEFAULT 'mainnet-beta'
    CHECK ("cluster" IN ('mainnet-beta', 'devnet', 'testnet')),
  "created_by_user_id" integer NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "organisation_treasuries_cluster_idx"
  ON "organisation_treasuries" ("cluster");

COMMIT;
