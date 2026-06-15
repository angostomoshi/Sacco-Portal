const { Pool } = require('pg');

const dbPool = new Pool({
  host: '192.168.4.10',
  port: 5432,
  database: 'sacco',
  user: 'postgres',
  password: 'legacy#007',
  ssl: false,
});

async function checkAllSchemas() {
  try {
    const memberNo = 'MS967';
    
    console.log(`\n🔍 Checking ALL schemas for member: ${memberNo}\n`);
    
    // Get all schemas
    const schemas = await dbPool.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
    `);
    
    for (const schema of schemas.rows) {
      // Get all tables in schema
      const tables = await dbPool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = $1 
        AND table_type = 'BASE TABLE'
      `, [schema.schema_name]);
      
      for (const table of tables.rows) {
        // Check if table has member_no column
        const hasMemberNo = await dbPool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = $1 
          AND table_name = $2 
          AND column_name = 'member_no'
        `, [schema.schema_name, table.table_name]);
        
        if (hasMemberNo.rows.length > 0) {
          const result = await dbPool.query(
            `SELECT * FROM ${schema.schema_name}.${table.table_name} WHERE member_no = $1`,
            [memberNo]
          );
          
          if (result.rows.length > 0) {
            console.log(`\n📊 ${schema.schema_name}.${table.table_name}: ${result.rows.length} records`);
            console.table(result.rows);
          }
        }
      }
    }
    
    await dbPool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkAllSchemas();