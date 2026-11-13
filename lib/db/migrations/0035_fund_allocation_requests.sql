BEGIN;

CREATE TABLE "organisation_fund_allocation_requests" (
  "id" serial PRIMARY KEY,
  "fund_id" integer NOT NULL REFERENCES "organisation_funds"("id") ON DELETE RESTRICT,
  "treasury_id" integer NOT NULL REFERENCES "organisation_treasuries"("id") ON DELETE RESTRICT,
  "requested_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "amount_lamports" numeric(20, 0) NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "organisation_fund_allocation_requests_status_check"
    CHECK ("status" IN ('pending', 'cancelled')),
  CONSTRAINT "organisation_fund_allocation_requests_amount_check"
    CHECK ("amount_lamports" > 0 AND "amount_lamports" <= 1000000000000000000)
);

CREATE INDEX "organisation_fund_allocation_requests_fund_created_idx"
  ON "organisation_fund_allocation_requests" ("fund_id", "created_at", "id");
CREATE INDEX "organisation_fund_allocation_requests_treasury_status_idx"
  ON "organisation_fund_allocation_requests" ("treasury_id", "status", "created_at");

COMMIT;
