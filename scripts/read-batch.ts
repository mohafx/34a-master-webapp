import * as fs from 'fs';

const start = parseInt(process.argv[2]);
const count = parseInt(process.argv[3]);

const raw = JSON.parse(fs.readFileSync('scripts/raw-questions.json', 'utf8'));
const batch = raw.slice(start, start + count);

fs.writeFileSync('scripts/current_batch_raw.json', JSON.stringify(batch, null, 2));
console.log(`Wrote ${batch.length} questions to scripts/current_batch_raw.json`);
