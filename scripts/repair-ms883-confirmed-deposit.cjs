// Targeted recovery: provider-confirmed request, receipt supplied by operator.
require('dotenv').config({quiet:true});
const {Pool}=require('pg');
const {execFileSync}=require('node:child_process');
const checkout='ws_CO_05102026004744473711165116', receipt='UJ5QZ8R8E5';
const provider=JSON.parse(execFileSync(process.execPath,[require('node:path').join(__dirname,'query-mpesa-stk.cjs'),checkout],{encoding:'utf8'}));
if(provider.environment!=='production'||String(provider.resultCode)!=='0'||provider.checkoutRequestId!==checkout)throw Error('Provider success not confirmed');
const p=new Pool({host:process.env.PGHOST||'192.168.4.10',port:process.env.PGPORT||5432,database:process.env.PGDATABASE||'metrosacco',user:process.env.PGUSER||'centre',password:process.env.PGPASSWORD||process.env.DB_PASSWORD,connectionTimeoutMillis:10000,statement_timeout:20000});
function check(ok,message){if(!ok)throw Error(message);}
(async()=>{const c=await p.connect();try{
await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");
await c.query('LOCK TABLE pb_mpesa_transactions, ac_shares_ledger, ac_cash_collection, ac_cash_book IN SHARE ROW EXCLUSIVE MODE');
const t=(await c.query('SELECT * FROM pb_mpesa_transactions WHERE id=194 FOR UPDATE')).rows[0];
check(t&&t.member_no==='MS883'&&t.purpose==='member_deposit'&&t.account_reference==='MS883'&&Number(t.amount)===10000&&t.checkout_request_id===checkout,'Target mismatch');
check(t.status==='pending'&&!t.receipted&&!t.ledger_posted&&t.receipt_no==='N/A'&&!t.mpesa_receipt_no,'Already processed or changed; stop');
check((await c.query(`SELECT id FROM pb_mpesa_transactions WHERE status='success' AND (receipt_no='N/A' OR (receipted=false AND receipt_no<>'N/A'))`)).rowCount===0,'Other eligible trigger rows exist');
check((await c.query(`SELECT 1 FROM ac_shifts WHERE user_name='auto_receipt' AND cash_point='Cashier' AND status IN ('Running','Suspended')`)).rowCount===1,'Ambiguous cashier shift');
check((await c.query(`SELECT 1 FROM pb_share_register WHERE acc_no='MS883'`)).rowCount===1,'Member register mismatch');
check((await c.query(`SELECT 1 FROM pb_wdeposit_register WHERE acc_no='MS883'`)).rowCount===0,'Unexpected withdrawable account');
for(const sql of [
'SELECT 1 FROM pb_mpesa_transactions WHERE mpesa_receipt_no=$1',
'SELECT 1 FROM mpesa_stk_call_back WHERE mpesa_receipt_no=$1',
'SELECT 1 FROM mpesa_c2b_transactions WHERE trans_id=$1',
'SELECT 1 FROM ac_cash_book WHERE voucher_no=$1',
'SELECT 1 FROM ac_cash_collection WHERE card_no=$1 OR card_name=$1',
'SELECT 1 FROM ac_shares_ledger WHERE receipt_no=$1 OR reference_no=$1'
])check((await c.query(sql,[receipt])).rowCount===0,'Existing receipt detected');
const before=Number((await c.query(`SELECT COALESCE(sum(credit-debit),0) AS balance FROM ac_shares_ledger WHERE account_no='MS883'`)).rows[0].balance);
const audit={source:'manual_reconciliation',reason:'Missing callback; recovery requested by operator',receipt_source:'operator_supplied',mpesa_receipt_no:receipt,payment_date:'2026-10-05',payment_time_verified:false,provider_status_query:provider,reconciled_at:new Date().toISOString(),original_status:t.status,original_created_at_preserved:true};
await c.query(`UPDATE pb_mpesa_transactions SET status='success',result_code=0,result_desc=$2,mpesa_receipt_no=$3,tno=checkout_request_id,callback_raw=$4,updated_at=now() WHERE id=$1`,[194,'Reconciled manually: M-Pesa STK status query confirmed success; receipt supplied by operator.',receipt,JSON.stringify(audit)]);
const posted=(await c.query('SELECT receipt_no FROM pb_mpesa_transactions WHERE id=194')).rows[0].receipt_no;
check(posted&&posted!=='N/A','Receipt trigger did not allocate receipt');
const shares=(await c.query(`SELECT account_no,credit,debit FROM ac_shares_ledger WHERE receipt_no=$1`,[posted])).rows;
check(shares.length===1&&shares[0].account_no==='MS883'&&Number(shares[0].credit)===10000&&Number(shares[0].debit)===0,'Savings posting mismatch');
const book=(await c.query('SELECT debit,credit,voucher_no FROM ac_cash_book WHERE receipt_no=$1',[posted])).rows;
check(book.length===1&&Number(book[0].debit)===10000&&Number(book[0].credit)===0&&book[0].voucher_no===receipt,'Cashbook posting mismatch');
const cash=(await c.query('SELECT debit,credit,card_no FROM ac_cash_collection WHERE receipt_no=$1',[posted])).rows;
check(cash.length===2&&cash.every(r=>r.card_no===receipt)&&cash.reduce((s,r)=>s+Number(r.debit),0)===10000&&cash.reduce((s,r)=>s+Number(r.credit),0)===10000,'Cash collection mismatch');
// Trigger uses request creation date, which is one day behind provider request date.
await c.query(`UPDATE ac_shares_ledger SET date=DATE '2026-10-05' WHERE receipt_no=$1 AND account_no='MS883'`,[posted]);
await c.query(`UPDATE ac_cash_book SET date=DATE '2026-10-05',date_banked=DATE '2026-10-05' WHERE receipt_no=$1 AND voucher_no=$2`,[posted,receipt]);
await c.query(`UPDATE ac_cash_collection SET date=DATE '2026-10-05' WHERE receipt_no=$1 AND card_no=$2`,[posted,receipt]);
await c.query('UPDATE pb_mpesa_transactions SET receipted=true,ledger_posted=true,ledger_posted_at=now(),updated_at=now() WHERE id=194');
const after=Number((await c.query(`SELECT COALESCE(sum(credit-debit),0) AS balance FROM ac_shares_ledger WHERE account_no='MS883'`)).rows[0].balance);
check(after-before===10000,'Unexpected savings balance change');
await c.query('COMMIT');
console.log(JSON.stringify({committed:true,member:'MS883',amount:10000,mpesaReceipt:receipt,systemReceipt:posted,savingsBefore:before,savingsAfter:after,savingsRows:shares.length,cashbookRows:book.length,cashCollectionRows:cash.length,paymentDate:'2026-10-05'}));
console.log(JSON.stringify({verified:(await c.query('SELECT id,status,mpesa_receipt_no,receipt_no,receipted,ledger_posted FROM pb_mpesa_transactions WHERE id=194')).rows}));
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await p.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
