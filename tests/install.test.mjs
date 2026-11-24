import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const kit = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const install = (...args) => spawnSync(process.execPath, [path.join(kit, 'install.mjs'), ...args], { encoding: 'utf8' });

test('install copies the template and keeps what the project already has', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-install-'));
  fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# mine\n');

  const dry = install(project, '--dry-run');
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(fs.existsSync(path.join(project, 'sdd.config.json')), false);

  const r = install(project);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /- CLAUDE\.md/);
  assert.equal(fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf8'), '# mine\n');
  for (const file of [
    'sdd.config.json',
    '.specify/extensions.yml',
    '.specify/sdd.config.schema.json',
    '.specify/scripts/node/flows-drawio.mjs',
    '.claude/skills/speckit-specify/SKILL.md',
    '.claude/skills/flow-walkthrough/scripts/inventory.mjs',
    '.husky/pre-commit',
  ]) {
    assert.ok(fs.existsSync(path.join(project, file)), `missing: ${file}`);
  }

  const forced = install(project, '--force', '--only', 'CLAUDE.md');
  assert.equal(forced.status, 0, forced.stderr);
  assert.notEqual(fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf8'), '# mine\n');
});

test('install refuses a folder that does not exist', () => {
  const r = install(path.join(os.tmpdir(), 'sdd-does-not-exist-123'));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Usage/);
});

test('the template config is valid JSON and points to the bundled schema', () => {
  const config = JSON.parse(fs.readFileSync(path.join(kit, 'template', 'sdd.config.json'), 'utf8'));
  assert.equal(config.$schema, './.specify/sdd.config.schema.json');
  JSON.parse(fs.readFileSync(path.join(kit, 'template', '.specify', 'sdd.config.schema.json'), 'utf8'));
});
