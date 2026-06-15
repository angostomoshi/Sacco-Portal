const { Pool } = require('pg');

const dbPool = new Pool({
  host: '192.168.4.10',
  port: 5432,
  database: 'sacco',
  user: 'postgres',
  password: 'legacy#007',
  ssl: false,
});

async function fixDuplicates() {
  try {
    console.log('🔍 Checking duplicates for MS967...');
    
    // See all duplicates
    const checkResult = await dbPool.query(
      'SELECT * FROM pb_sacco_passkey WHERE member_no = $1',
      ['MS967']
    );
    console.log(`Found ${checkResult.rows.length} records for MS967`);
    
    if (checkResult.rows.length > 1) {
      console.log('🗑️ Deleting duplicates...');
      
      // Delete duplicates keeping only the most recent
      const deleteResult = await dbPool.query(`
        DELETE FROM pb_sacco_passkey 
        WHERE member_no = $1 
        AND id NOT IN (
          SELECT id FROM pb_sacco_passkey 
          WHERE member_no = $1 
          ORDER BY cdate DESC 
          LIMIT 1
        )
      `, ['MS967']);
      
      console.log(`✅ Deleted ${deleteResult.rowCount} duplicate(s)`);
      
      // Verify
      const verifyResult = await dbPool.query(
        'SELECT * FROM pb_sacco_passkey WHERE member_no = $1',
        ['MS967']
      );
      console.log(`✅ Now ${verifyResult.rows.length} record(s) remain`);
    } else {
      console.log('✅ No duplicates found');
    }
    
    await dbPool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

fixDuplicates();