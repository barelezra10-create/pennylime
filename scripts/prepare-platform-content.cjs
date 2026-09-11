// Prepare a reviewable, reversible update for an existing CMS platform page.
// Apply/verify with funding-content-db.cjs using the same audit directory.
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ quiet: true });
const { Client } = require('pg');

async function main() {
  const [input, directory] = process.argv.slice(2);
  if (!input || !directory) throw new Error('Usage: node scripts/prepare-platform-content.cjs <content.json> <audit-directory>');
  const { slug, ...fields } = JSON.parse(fs.readFileSync(input, 'utf8'));
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query('SELECT * FROM "PlatformPage" WHERE slug = $1', [slug]);
    if (rows.length !== 1) throw new Error('Expected an existing platform page');
    const before = rows[0];
    const changes = Object.entries(fields).flatMap(([field, after]) => {
      if (!(field in before) || ['id', 'platformName', 'createdAt', 'updatedAt'].includes(field)) throw new Error('Unsupported field: ' + field);
      return before[field] === after ? [] : [{ table: 'PlatformPage', id: before.id, field, before: before[field], after }];
    });
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'content-before.json'), JSON.stringify(before, null, 2));
    fs.writeFileSync(path.join(directory, 'content-changes.json'), JSON.stringify(changes, null, 2));
    console.log(JSON.stringify({ slug, fields: changes.map(c => c.field), headline: fields.heroHeadline }));
  } finally { await client.end(); }
}
main().catch(error => { console.error(error.message); process.exit(1); });
