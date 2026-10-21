require('dotenv').config({quiet:true});
const {Pool}=require('pg');
const p=new Pool({host:process.env.PGHOST||'192.168.4.10',port:process.env.PGPORT||5432,database:process.env.PGDATABASE||'metrosacco',user:process.env.PGUSER||'centre',password:process.env.PGPASSWORD||process.env.DB_PASSWORD,connectionTimeoutMillis:10000,statement_timeout:15000});
(async()=>{const c=await p.connect();try{await c.query('BEGIN READ ONLY');
const m=await c.query(`SELECT acc_no,COALESCE(loan_blacklisted,false) AS loan_blacklisted,tel1 FROM pb_share_register WHERE upper(trim(acc_no))=$1`,['MS708']);
console.log(JSON.stringify({member:m.rows.map(r=>({...r,tel1:undefined,phone_present:!!r.tel1,phone_digits:String(r.tel1||'').replace(/\D/g,'').length,phone_suffix:String(r.tel1||'').slice(-3),phone_prefix:String(r.tel1||'').slice(0,4)}))}));
console.log(JSON.stringify({attempts:(await c.query(`SELECT id,loan_no,amount,period_days,status,response_code,response_desc,result_code,result_desc,ledger_posted,created_at::text FROM pb_mpesa_b2c_transactions WHERE member_no=$1 ORDER BY id DESC LIMIT 10`,['MS708'])).rows}));
await c.query('ROLLBACK');}finally{c.release();await p.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
