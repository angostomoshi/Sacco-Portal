const { Pool } = require('pg');

const dbPool = new Pool({
  host: '192.168.4.10',
  port: 5432,
  database: 'sacco',
  user: 'postgres',
  password: 'legacy#007',
  ssl: false,
});

async function checkDuplicates() {
  try {
    console.log('\n🔍 Checking duplicates for MS967...\n');
    
    const result = await dbPool.query(
      'SELECT * FROM pb_sacco_passkey WHERE member_no = $1 ORDER BY cdate DESC',
      ['MS967']
    );
    
    console.log(`Found ${result.rows.length} record(s) for MS967\n`);
    
    if (result.rows.length === 1) {
      console.log('✅ CLEAN! Only 1 record exists.');
      console.log('   The backend team has run the cleanup.');
    } else if (result.rows.length > 1) {
      console.log(`❌ Still have ${result.rows.length} duplicates!`);
      console.log('   The backend team has NOT run the cleanup yet.');
    } else {
      console.log('⚠️ No records found for MS967');
    }
    
    if (result.rows.length > 0) {
      console.table(result.rows);
    }
    
    await dbPool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkDuplicates();