CREATE OR REPLACE VIEW public.sms_changepasskey AS
SELECT
  initcap(sc.holders_name::text) AS recipient_name,
  sc.tel1 AS recipient_no,
  (
    'Dear '
    || COALESCE(NULLIF(sc.holders_name::text, ''), pb_sacco_passkey.member_no::text)
    || ', your Metro Sacco password reset code is '
    || pb_sacco_passkey.pass_key::text
    || '. Do not share it. If you did not request it, ignore this SMS.'
  ) AS message,
  'pb_sacco_passkey'::text AS reftable,
  'member_no'::text AS reffield,
  pb_sacco_passkey.member_no AS refvalue,
  'sms_sent'::text AS refupdatefield
FROM pb_sacco_passkey
JOIN pb_share_register sc
  ON pb_sacco_passkey.member_no::text = sc.acc_no::text
WHERE pb_sacco_passkey.sms_sent <> true
  AND pb_sacco_passkey.key_used = false
  AND pb_sacco_passkey.logged_in = true;

CREATE OR REPLACE VIEW public.sms_passkey AS
SELECT
  initcap(sc.holders_name::text) AS recipient_name,
  pb_sacco_passkey.phone_no AS recipient_no,
  (
    'Dear '
    || COALESCE(NULLIF(sc.holders_name::text, ''), pb_sacco_passkey.member_no::text)
    || ', your Metro Sacco account verification code is '
    || pb_sacco_passkey.pass_key::text
    || '. Use member number '
    || pb_sacco_passkey.member_no::text
    || ' to complete registration at memberportal.metro-sacco.co.ke.'
  ) AS message,
  'pb_sacco_passkey'::text AS reftable,
  'member_no'::text AS reffield,
  pb_sacco_passkey.member_no AS refvalue,
  'sms_sent'::text AS refupdatefield
FROM pb_sacco_passkey
JOIN pb_share_register sc
  ON pb_sacco_passkey.member_no::text = sc.acc_no::text
WHERE pb_sacco_passkey.sms_sent <> true
  AND pb_sacco_passkey.key_used = false
  AND pb_sacco_passkey.logged_in = false;

CREATE OR REPLACE VIEW public.sms_loanapp AS
SELECT
  initcap(pb_share_register.holders_name::text) AS recipient_name,
  pb_share_register.tel1 AS recipient_no,
  (
    'Dear '
    || COALESCE(NULLIF(pb_share_register.holders_name::text, ''), pb_saccoloan.mem_no::text)
    || ', your '
    || pb_saccoloan.lpurpose::text
    || ' application (Loan No. '
    || pb_saccoloan.loan_no::text
    || ') for KES '
    || trim(to_char(pb_saccoloan.amount, 'FM999,999,999,990.00'))
    || ' has been received and is pending review. Metro Sacco.'
  ) AS message,
  'pb_saccoloan'::text AS reftable,
  'loan_no'::text AS reffield,
  pb_saccoloan.loan_no AS refvalue,
  'sms_sent'::text AS refupdatefield
FROM pb_share_register
JOIN pb_saccoloan
  ON pb_share_register.acc_no::text = pb_saccoloan.mem_no::text
WHERE pb_saccoloan.sms_sent <> true
  AND pb_saccoloan.input_date > (CURRENT_DATE - 2)
  AND pb_saccoloan.processed = false

UNION ALL

SELECT
  initcap('Ndungu'::text) AS recipient_name,
  '0720327605'::character varying AS recipient_no,
  (
    'New instant loan application: '
    || COALESCE(NULLIF(pb_share_register.holders_name::text, ''), pb_saccoloan.mem_no::text)
    || ' ('
    || COALESCE(NULLIF(pb_share_register.tel1::text, ''), 'No phone')
    || ') requested KES '
    || trim(to_char(pb_saccoloan.amount, 'FM999,999,999,990.00'))
    || '. Loan No. '
    || pb_saccoloan.loan_no::text
    || '. Please review.'
  ) AS message,
  'pb_saccoloan'::text AS reftable,
  'loan_no'::text AS reffield,
  pb_saccoloan.loan_no AS refvalue,
  'sms_sent'::text AS refupdatefield
FROM pb_share_register
JOIN pb_saccoloan
  ON pb_share_register.acc_no::text = pb_saccoloan.mem_no::text
WHERE pb_saccoloan.sms_sent <> true
  AND pb_saccoloan.input_date > (CURRENT_DATE - 2)
  AND pb_saccoloan.lpurpose::text = 'METRO SACCO INSTANT LOAN'::text
  AND pb_saccoloan.processed = false

UNION ALL

SELECT
  initcap('Dan'::text) AS recipient_name,
  '0785278786'::character varying AS recipient_no,
  (
    'New instant loan application: '
    || COALESCE(NULLIF(pb_share_register.holders_name::text, ''), pb_saccoloan.mem_no::text)
    || ' ('
    || COALESCE(NULLIF(pb_share_register.tel1::text, ''), 'No phone')
    || ') requested KES '
    || trim(to_char(pb_saccoloan.amount, 'FM999,999,999,990.00'))
    || '. Loan No. '
    || pb_saccoloan.loan_no::text
    || '. Please review.'
  ) AS message,
  'pb_saccoloan'::text AS reftable,
  'loan_no'::text AS reffield,
  pb_saccoloan.loan_no AS refvalue,
  'sms_sent'::text AS refupdatefield
FROM pb_share_register
JOIN pb_saccoloan
  ON pb_share_register.acc_no::text = pb_saccoloan.mem_no::text
WHERE pb_saccoloan.sms_sent <> true
  AND pb_saccoloan.input_date > (CURRENT_DATE - 2)
  AND pb_saccoloan.lpurpose::text = 'METRO SACCO INSTANT LOAN'::text
  AND pb_saccoloan.processed = false

UNION ALL

SELECT
  initcap('Calvince'::text) AS recipient_name,
  '0705767392'::character varying AS recipient_no,
  (
    'New instant loan application: '
    || COALESCE(NULLIF(pb_share_register.holders_name::text, ''), pb_saccoloan.mem_no::text)
    || ' ('
    || COALESCE(NULLIF(pb_share_register.tel1::text, ''), 'No phone')
    || ') requested KES '
    || trim(to_char(pb_saccoloan.amount, 'FM999,999,999,990.00'))
    || '. Loan No. '
    || pb_saccoloan.loan_no::text
    || '. Please review.'
  ) AS message,
  'pb_saccoloan'::text AS reftable,
  'loan_no'::text AS reffield,
  pb_saccoloan.loan_no AS refvalue,
  'sms_sent'::text AS refupdatefield
FROM pb_share_register
JOIN pb_saccoloan
  ON pb_share_register.acc_no::text = pb_saccoloan.mem_no::text
WHERE pb_saccoloan.sms_sent <> true
  AND pb_saccoloan.input_date > (CURRENT_DATE - 2)
  AND pb_saccoloan.lpurpose::text = 'METRO SACCO INSTANT LOAN'::text
  AND pb_saccoloan.processed = false;

CREATE OR REPLACE VIEW public.sms_loanprocessed AS
SELECT
  initcap(pb_share_register.holders_name::text) AS recipient_name,
  pb_share_register.tel1 AS recipient_no,
  (
    'Dear '
    || COALESCE(NULLIF(pb_share_register.holders_name::text, ''), pb_saccoloan.mem_no::text)
    || ', your '
    || pb_saccoloan.lpurpose::text
    || ' (Loan No. '
    || pb_saccoloan.loan_no::text
    || ') has been approved and processed. Repayment will start soon. Metro Sacco.'
  ) AS message,
  'pb_saccoloan'::text AS reftable,
  'loan_no'::text AS reffield,
  pb_saccoloan.loan_no AS refvalue,
  'sms_processed'::text AS refupdatefield
FROM pb_share_register
JOIN pb_saccoloan
  ON pb_share_register.acc_no::text = pb_saccoloan.mem_no::text
WHERE pb_saccoloan.sms_processed <> true
  AND pb_saccoloan.processed = true
  AND pb_saccoloan.input_date >= (CURRENT_DATE - 2);
