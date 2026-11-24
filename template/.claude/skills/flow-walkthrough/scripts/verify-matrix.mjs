#!/usr/bin/env node
// Fails (exit 1) while a matrix has a cell not done or a justification missing.
// Usage: node verify-matrix.mjs <matrix.md> [<matrix.md> ...]
import fs from 'node:fs';
import { verifyMatrix } from './lib/matrix.mjs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node verify-matrix.mjs <matrix.md> [<matrix.md> ...]');
  process.exit(2);
}

let failed = false;
for (const file of files) {
  if (!fs.existsSync(file)) {
    console.error(`Not found: ${file}`);
    process.exit(2);
  }
  const { failures, totals } = verifyMatrix(fs.readFileSync(file, 'utf8'));
  console.log(`${file}: ${totals.done}/${totals.cells} cells done.`);
  if (!failures.length) {
    console.log('Matrix complete.');
    continue;
  }
  failed = true;
  console.log(`\n${failures.length} pending item(s):`);
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed ? 1 : 0);
