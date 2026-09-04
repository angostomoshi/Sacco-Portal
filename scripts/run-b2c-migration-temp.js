require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'mpesa-b2c-transactions.sql'), 'utf8');
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log('B2C migration applied.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
