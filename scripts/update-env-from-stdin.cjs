const fs = require('fs');

const key = process.argv[2];
if (!key || !/^[A-Z0-9_]+$/.test(key)) {
  console.error('Usage: node scripts/update-env-from-stdin.cjs ENV_KEY');
  process.exit(1);
}

let value = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  value += chunk;
});

process.stdin.on('end', () => {
  value = value.trim();
  if (!value) {
    console.error('No value received on stdin.');
    process.exit(1);
  }

  const file = '.env';
  const existing = fs.readFileSync(file, 'utf8');
  const newline = existing.includes('\r\n') ? '\r\n' : '\n';
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const line = `${key}=${value}`;
  const regex = new RegExp(`^${escapedKey}=.*$`, 'm');
  const next = regex.test(existing)
    ? existing.replace(regex, line)
    : `${existing.replace(/\s*$/, '')}${newline}${line}${newline}`;

  fs.writeFileSync(file, next);
  console.log(JSON.stringify({ updated: key, valueLength: value.length }, null, 2));
});
