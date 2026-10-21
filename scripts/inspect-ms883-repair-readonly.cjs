require('dotenv').config({quiet:true});
const {Pool}=require('pg');
const p=new Pool({host:process.env.PGHOST||'192.168.4.10',port:process.env.PGPORT||5432,database:process.env.PGDATABASE||'metrosacco',user:process.env.PGUSER||'centre',password:process.env.PGPASSWORD||process.env.DB_PASSWORD,connectionTimeoutMillis:10000,statement_timeout:20000});
(async()=>{const c=await p.connect();try{await c.query('BEGIN READ ONLY');
for(const [name,sql,args] of [
['transaction',`SELECT id,member_no,purpose,amount,status,receipt_no,receipted,ledger_posted,created_at::text,transaction_date::text,callback_raw FROM pb_mpesa_transactions WHERE id=194`,[]],
['triggers',`SELECT tgrelid::regclass::text AS table_name,pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('pb_mpesa_transactions'::regclass,'ac_shares_ledger'::regclass,'ac_cash_collection'::regclass,'ac_cash_book'::regclass)`,[]],
['unpostedSuccess',`SELECT id,member_no,receipt_no FROM pb_mpesa_transactions WHERE status='success' AND (receipted=false OR receipt_no='N/A')`,[]],
['shift',`SELECT user_name,cash_point,shift_no,status FROM ac_shifts WHERE user_name='auto_receipt' AND cash_point='Cashier' AND status IN ('Running','Suspended')`,[]],
['register',`SELECT acc_no FROM pb_share_register WHERE acc_no='MS883'`,[]],
['savings',`SELECT receipt_no,reference_no,credit,debit,date::text FROM ac_shares_ledger WHERE account_no='MS883' ORDER BY date DESC NULLS LAST LIMIT 6`,[]],
['cashbookReceipt',`SELECT receipt_no,voucher_no,debit,credit,date::text FROM ac_cash_book WHERE voucher_no=$1`,['UJ5QZ8R8E5']],
['collectionReceipt',`SELECT receipt_no,card_no,debit,credit,date::text FROM ac_cash_collection WHERE card_no=$1 OR card_name=$1`,['UJ5QZ8R8E5']]
])console.log(JSON.stringify({name,rows:(await c.query(sql,args)).rows}));
await c.query('ROLLBACK');}finally{c.release();await p.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
