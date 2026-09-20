import fs from 'node:fs';

const sql = fs.readFileSync('remote_dump.sql', 'utf8');
const lines = sql.split('\n');

const progressInserts = [];
const appStateInserts = [];

for (const line of lines) {
  const trimmed = line.trim();
  if (trimmed.startsWith('INSERT INTO "progress"')) {
    // Check if it's for 'main' workspace
    if (trimmed.includes("VALUES('main',") || trimmed.includes('VALUES("main",')) {
      progressInserts.push(trimmed);
    }
  } else if (trimmed.startsWith('INSERT INTO "app_state"')) {
    if (trimmed.includes("VALUES('main',") || trimmed.includes('VALUES("main",')) {
      appStateInserts.push(trimmed);
    }
  }
}

console.log(`Found ${progressInserts.length} progress rows for main`);
console.log(`Found ${appStateInserts.length} app_state rows for main`);

// Generate import SQL
const importSql = [
  '-- Sync production data for workspace main',
  'DELETE FROM progress WHERE workspace_id = \'main\';',
  'DELETE FROM app_state WHERE workspace_id = \'main\';',
  '',
  ...progressInserts,
  '',
  ...appStateInserts,
  ''
].join('\n');

fs.writeFileSync('sync_main.sql', importSql, 'utf8');
console.log('Successfully wrote sync_main.sql');
