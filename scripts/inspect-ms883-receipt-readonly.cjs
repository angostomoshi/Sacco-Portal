const dotenv = require('dotenv');
const { Pool } = require('pg');
dotenv.config({quiet:true});
const pool = new Pool({host:process.env.PGHOST || '192.168.4.10',port:process.env.PGPORT || 5432,database:process.env.PGDATABASE || 'metrosacco',user:process.env.PGUSER || 'centre',password:process.env.PGPASSWORD || process.env.DB_PASSWORD,connectionTimeoutMillis:10000,statement_timeout:20000});
(async()=>{const c=await pool.connect();try{
await c.query('BEGIN READ ONLY');
const receipt='UJ5QZ8R8E5';
const tables=await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%mpesa%' OR table_name IN ('ac_wdeposit_payable','ac_shares_ledger','ac_debtors'))`);
for(const {table_name:t} of tables.rows){
 const cols=await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,[t]);
 const names=cols.rows.map(r=>r.column_name);
 const keys=names.filter(n=>/receipt|trans_id|transaction_id|reference_no|cheque_no/i.test(n));
 if(!keys.length)continue;
 const qi=s=>'"'+s.replace(/"/g,'""')+'"';
 const selected=names.filter(n=>/^(id|member_no|account_no|account_reference|purpose|amount|status|result_code|result_desc|mpesa_receipt_no|receipt_no|trans_id|transaction_id|bill_ref_number|receipted|ledger_posted|credit|debit|reference_no|cheque_no|transaction_date|trans_time|date|created_at|updated_at|checkout_request_id)$/.test(n));
 const r=await c.query(`SELECT ${selected.map(n=>qi(n)+'::text AS '+qi(n)).join(',')} FROM ${qi(t)} WHERE ${keys.map(k=>qi(k)+'::text = $1').join(' OR ')} LIMIT 15`,[receipt]);
 console.log(JSON.stringify({table:t,matches:r.rows}));
}
const ledger=await c.query(`SELECT account_no,activity_code,reference_no,receipt_no,credit,debit,date::text FROM ac_wdeposit_payable WHERE upper(trim(account_no))=$1 ORDER BY date DESC NULLS LAST LIMIT 6`,['MS883']);
console.log(JSON.stringify({recentSavings:ledger.rows}));
await c.query('ROLLBACK');
}finally{c.release();await pool.end();}})().catch(e=>{console.error(e.message);process.exit(1);});
