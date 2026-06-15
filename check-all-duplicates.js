const { Pool } = require('pg');

const dbPool = new Pool({
  host: '192.168.4.10',
  port: 5432,
  database: 'sacco',
  user: 'postgres',
  password: 'legacy#007',
  ssl: false,
});

async function checkAllTables() {
  try {
    const memberNo = 'MS967';
    
    console.log(`\n🔍 Checking all tables for member: ${memberNo}\n`);
    
    // Check pb_sacco_passkey
    let result = await dbPool.query('SELECT * FROM pb_sacco_passkey WHERE member_no = $1', [memberNo]);
    console.log(`📊 pb_sacco_passkey: ${result.rows.length} records`);
    
    // Check users table (if exists)
    result = await dbPool.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')");
    if (result.rows[0].exists) {
      result = await dbPool.query('SELECT * FROM users WHERE member_no = $1', [memberNo]);
      console.log(`📊 users: ${result.rows.length} records`);
      if (result.rows.length > 0) {
        console.table(result.rows);
      }
    }
    
    // Check pb_share_register (members)
    result = await dbPool.query('SELECT * FROM pb_share_register WHERE acc_no = $1', [memberNo]);
    console.log(`📊 pb_share_register: ${result.rows.length} records`);
    
    // Check app_user table (common Spring Boot default)
    result = await dbPool.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'app_user')");
    if (result.rows[0].exists) {
      result = await dbPool.query('SELECT * FROM app_user WHERE member_no = $1', [memberNo]);
      console.log(`📊 app_user: ${result.rows.length} records`);
    }
    
    // Check user_entity table
    result = await dbPool.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_entity')");
    if (result.rows[0].exists) {
      result = await dbPool.query('SELECT * FROM user_entity WHERE member_no = $1', [memberNo]);
      console.log(`📊 user_entity: ${result.rows.length} records`);
    }
    
    // Check any table with member_no column
    const tables = await dbPool.query(`
      SELECT table_name 
      FROM information_schema.columns 
      WHERE column_name = 'member_no' 
      AND table_schema = 'public'
      AND table_name NOT IN ('pb_sacco_passkey', 'users', 'app_user', 'user_entity', 'pb_share_register')
    `);
    
    for (const table of tables.rows) {
      result = await dbPool.query(`SELECT * FROM ${table.table_name} WHERE member_no = $1`, [memberNo]);
      if (result.rows.length > 0) {
        console.log(`\n📊 ${table.table_name}: ${result.rows.length} records`);
        console.table(result.rows.slice(0, 3));
      }
    }
    
    await dbPool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkAllTables();