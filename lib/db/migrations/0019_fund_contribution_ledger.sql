-- Additive only. Apply to the intended database after explicit approval.
BEGIN;
ALTER TABLE organisation_treasuries ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
ALTER TABLE organisation_treasuries ADD COLUMN IF NOT EXISTS history_complete boolean NOT NULL DEFAULT false;
ALTER TABLE organisation_treasuries ADD COLUMN IF NOT EXISTS history_cursor text;
CREATE TABLE IF NOT EXISTS fund_contributions (
  id uuid PRIMARY KEY,
  fund_id integer NOT NULL REFERENCES organisation_funds(id),
  donor_user_id integer NOT NULL REFERENCES users(id),
  amount_lamports numeric(20,0) NOT NULL CHECK (amount_lamports > 0 AND amount_lamports <= 1000000000000000000),
  reference text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','cancelled','confirmed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  verification_message text
);
CREATE UNIQUE INDEX IF NOT EXISTS fund_contributions_reference_unique ON fund_contributions(reference);
CREATE UNIQUE INDEX IF NOT EXISTS fund_contributions_pending_unique ON fund_contributions(donor_user_id,fund_id,amount_lamports) WHERE status='pending';
CREATE INDEX IF NOT EXISTS fund_contributions_donor_idx ON fund_contributions(donor_user_id,created_at);
CREATE TABLE IF NOT EXISTS treasury_deposits (
  id serial PRIMARY KEY,
  treasury_id integer NOT NULL REFERENCES organisation_treasuries(id),
  fund_id integer REFERENCES organisation_funds(id),
  contribution_id uuid REFERENCES fund_contributions(id),
  cluster text NOT NULL CHECK (cluster IN ('mainnet-beta','devnet','testnet')),
  signature text NOT NULL,
  instruction_index text NOT NULL,
  sender text NOT NULL,
  amount_lamports numeric(20,0) NOT NULL CHECK (amount_lamports > 0),
  attribution text NOT NULL DEFAULT 'unattributed' CHECK (attribution IN ('reference','memo','unattributed')),
  block_time timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS treasury_deposits_transfer_unique ON treasury_deposits(cluster,signature,instruction_index);
CREATE UNIQUE INDEX IF NOT EXISTS treasury_deposits_contribution_unique ON treasury_deposits(contribution_id);
CREATE INDEX IF NOT EXISTS treasury_deposits_treasury_idx ON treasury_deposits(treasury_id,id);
CREATE INDEX IF NOT EXISTS treasury_deposits_fund_idx ON treasury_deposits(fund_id);
-- This is a backend-only ledger. Clients must use the profile-authorized API.
ALTER TABLE fund_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE treasury_deposits ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS treasury_payouts (
  id uuid PRIMARY KEY,
  treasury_id integer NOT NULL REFERENCES organisation_treasuries(id),
  fund_id integer REFERENCES organisation_funds(id),
  recipient_user_id integer NOT NULL REFERENCES users(id),
  wallet_address text NOT NULL,
  amount_lamports numeric(20,0) NOT NULL CHECK (amount_lamports > 0 AND amount_lamports <= 1000000000000000000),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','cancelled','paid')),
  signature text,
  instruction_index text,
  cluster text NOT NULL CHECK (cluster IN ('mainnet-beta','devnet','testnet')),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  verification_message text
);
CREATE UNIQUE INDEX IF NOT EXISTS treasury_payouts_transfer_unique ON treasury_payouts(cluster,signature,instruction_index);
CREATE INDEX IF NOT EXISTS treasury_payouts_recipient_idx ON treasury_payouts(recipient_user_id);
CREATE INDEX IF NOT EXISTS treasury_payouts_treasury_idx ON treasury_payouts(treasury_id);
ALTER TABLE treasury_payouts ENABLE ROW LEVEL SECURITY;
COMMIT;
