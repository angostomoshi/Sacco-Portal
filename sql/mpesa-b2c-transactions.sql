CREATE TABLE IF NOT EXISTS pb_mpesa_b2c_transactions (
  id                         SERIAL PRIMARY KEY,
  originator_conversation_id VARCHAR(100),
  conversation_id            VARCHAR(100),
  loan_no                    VARCHAR(50) NOT NULL,
  member_no                  VARCHAR(50) NOT NULL,
  phone_no                   VARCHAR(15) NOT NULL,
  amount                     NUMERIC(14,2) NOT NULL,
  period_days                INTEGER NOT NULL DEFAULT 7,
  charge                     NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_repayable            NUMERIC(14,2) NOT NULL,
  status                     VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending|success|failed|timeout
  response_code              VARCHAR(20),
  response_desc              TEXT,
  result_code                INTEGER,
  result_desc                TEXT,
  transaction_id             VARCHAR(50),
  voucher_no                 VARCHAR(30),
  interest_reference_no      VARCHAR(30),
  accounting_user            VARCHAR(100),
  request_raw                JSONB,
  result_raw                 JSONB,
  ledger_posted              BOOLEAN NOT NULL DEFAULT false,
  ledger_posted_at           TIMESTAMP,
  receipt_emailed            BOOLEAN NOT NULL DEFAULT false,
  created_at                 TIMESTAMP NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mpesa_b2c_member ON pb_mpesa_b2c_transactions(member_no);
CREATE INDEX IF NOT EXISTS idx_mpesa_b2c_loan ON pb_mpesa_b2c_transactions(loan_no);
CREATE INDEX IF NOT EXISTS idx_mpesa_b2c_originator ON pb_mpesa_b2c_transactions(originator_conversation_id);
CREATE INDEX IF NOT EXISTS idx_mpesa_b2c_conversation ON pb_mpesa_b2c_transactions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_mpesa_b2c_status ON pb_mpesa_b2c_transactions(status);

ALTER TABLE pb_mpesa_b2c_transactions
  ADD COLUMN IF NOT EXISTS period_days INTEGER NOT NULL DEFAULT 7;

ALTER TABLE pb_mpesa_b2c_transactions
  ADD COLUMN IF NOT EXISTS receipt_emailed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE pb_mpesa_b2c_transactions
  ADD COLUMN IF NOT EXISTS voucher_no VARCHAR(30);

ALTER TABLE pb_mpesa_b2c_transactions
  ADD COLUMN IF NOT EXISTS interest_reference_no VARCHAR(30);

ALTER TABLE pb_mpesa_b2c_transactions
  ADD COLUMN IF NOT EXISTS accounting_user VARCHAR(100);
