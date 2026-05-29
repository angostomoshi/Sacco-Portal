// backend/test-db.js
const { Client } = require('pg');

const client = new Client({
  host: '192.168.4.10',
  port: 5432,
  database: 'sacco',
  user: 'postgres',
  password: 'legacy#007'
});

client.connect()
  .then(() => {
    console.log('✅ Successfully connected to database!');
    return client.query('SELECT NOW() as current_time');
  })
  .then(result => {
    console.log('Database time:', result.rows[0].current_time);
    client.end();
  })
  .catch(err => {
    console.error('❌ Connection error:', err.message);
    console.log('\nPossible issues:');
    console.log('1. Wrong password');
    console.log('2. Database server is not accessible');
    console.log('3. PostgreSQL not running on 192.168.4.10');
    console.log('4. Firewall blocking connection');
    client.end();
  });