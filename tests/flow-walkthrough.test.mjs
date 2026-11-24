import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { verifyMatrix } from '../template/.claude/skills/flow-walkthrough/scripts/lib/matrix.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const scripts = path.join(here, '..', 'template', '.claude', 'skills', 'flow-walkthrough', 'scripts');

function fixtureCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-kit-'));
  fs.cpSync(path.join(here, 'fixtures', 'project'), dir, { recursive: true });
  return dir;
}

function runScript(cwd, script, ...args) {
  const r = spawnSync(process.execPath, [path.join(scripts, script), ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const fillAll = (text) =>
  text
    .replace(/\| ⏳ \|  \|/g, '| ✅ | captura captures-R01/x-390.png |')
    .replace(/(Segunda passagem|Second walkthrough): ⏳/, '$1: 2026-01-01');

test('inventory builds the matrix from screens and routes, in the project locale', () => {
  const dir = fixtureCopy();
  const r = runScript(dir, 'inventory.mjs', '--flow', 'R01');
  assert.equal(r.code, 0, r.err);
  const matrix = fs.readFileSync(path.join(dir, 'walkthrough', 'matrix-R01.md'), 'utf8');
  assert.match(matrix, /^# Matriz da passagem — R01 \(Inscrever-se num curso\)/);
  assert.match(matrix, /## Tela: \/courses\/\[slug\]/);
  assert.match(matrix, /## Tela: \/enrollments/);
  assert.match(matrix, /## Rota: GET \/courses\/:id\/lessons/);
  assert.match(matrix, /Usada por: `lib\/api\.ts`/);
  assert.match(matrix, /Celular 390 px/);
});

test('a second inventory keeps what was filled in and marks what left the code', () => {
  const dir = fixtureCopy();
  runScript(dir, 'inventory.mjs', '--flow', 'R01');
  const file = path.join(dir, 'walkthrough', 'matrix-R01.md');
  fs.writeFileSync(file, fillAll(fs.readFileSync(file, 'utf8')));

  const flowsFile = path.join(dir, 'walkthrough', 'flows.json');
  const flows = JSON.parse(fs.readFileSync(flowsFile, 'utf8'));
  flows.flows.R01.controllers = ['courses/courses.controller.ts'];
  fs.writeFileSync(flowsFile, JSON.stringify(flows));
  runScript(dir, 'inventory.mjs', '--flow', 'R01');

  const matrix = fs.readFileSync(file, 'utf8');
  assert.match(matrix, /Segunda passagem: 2026-01-01/);
  assert.doesNotMatch(matrix, /\| ⏳ \|/);
  assert.match(matrix, /## Rota: GET \/enrollments \(não existe mais no código\)/);
  const { failures } = verifyMatrix(matrix);
  assert.ok(failures.some((f) => f.includes('não existe mais no código')));
});

test('verify-matrix fails on a fresh matrix and passes on a complete one', () => {
  const dir = fixtureCopy();
  runScript(dir, 'inventory.mjs', '--flow', 'R01');
  const file = path.join(dir, 'walkthrough', 'matrix-R01.md');
  assert.equal(runScript(dir, 'verify-matrix.mjs', file).code, 1);
  fs.writeFileSync(file, fillAll(fs.readFileSync(file, 'utf8')));
  const r = runScript(dir, 'verify-matrix.mjs', file);
  assert.equal(r.code, 0, r.out);
});

test('verify-matrix refuses "from the code" and a justification that is too short', () => {
  const matrix = ['Second walkthrough: 2026-01-01', '## Screen: /x', '| 1 | Happy path | ✅ | from the code |', '| 4 | Absences | n.a. | no |'].join('\n');
  const { failures } = verifyMatrix(matrix);
  assert.equal(failures.length, 2);
  assert.match(failures[0], /from the code/);
  assert.match(failures[1], /without justification/);
});

test('scan-code raises the built-in checks and the project rules', () => {
  const dir = fixtureCopy();
  const r = runScript(dir, 'scan-code.mjs', '--flow', 'R01');
  assert.equal(r.code, 0, r.err);
  for (const expected of ['toast.success(', 'contêiner sem recuo', 'nao → não', '.toFixed(2)', '<Link href="/enrollments"><Button']) {
    assert.ok(r.out.includes(expected), `missing: ${expected}`);
  }
});

test('scripts fall back to English and the default folder without a locale', () => {
  const dir = fixtureCopy();
  const configFile = path.join(dir, 'sdd.config.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  delete config.project.locale;
  delete config.walkthrough.outputDir;
  fs.writeFileSync(configFile, JSON.stringify(config));
  fs.mkdirSync(path.join(dir, 'specs', '001-x'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.specify'));
  fs.writeFileSync(path.join(dir, '.specify', 'feature.json'), JSON.stringify({ feature_directory: 'specs/001-x' }));
  fs.cpSync(path.join(dir, 'walkthrough'), path.join(dir, 'specs', '001-x', 'walkthrough'), { recursive: true });

  const r = runScript(dir, 'inventory.mjs', '--flow', 'R01');
  assert.equal(r.code, 0, r.err);
  const matrix = fs.readFileSync(path.join(dir, 'specs', '001-x', 'walkthrough', 'matrix-R01.md'), 'utf8');
  assert.match(matrix, /^# Walkthrough matrix — R01/);
  assert.match(matrix, /## Screen: \/enrollments/);
});

test('a missing sdd.config.json stops with a clear message', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-empty-'));
  const r = runScript(dir, 'inventory.mjs', '--flow', 'R01');
  assert.equal(r.code, 2);
  assert.match(r.err, /sdd\.config\.json not found/);
});

test('the project .env fills unset variables (testEmailEnv, password) and the shell wins', async () => {
  const { loadProject } = await import('../template/.claude/skills/flow-walkthrough/scripts/lib/context.mjs');
  const dir = fixtureCopy();
  const configFile = path.join(dir, 'sdd.config.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  config.testEmailEnv = 'KIT_FIXTURE_TEST_EMAIL';
  fs.writeFileSync(configFile, JSON.stringify(config));
  fs.writeFileSync(path.join(dir, '.env'), 'KIT_FIXTURE_TEST_EMAIL=qa@example.test\nKIT_FIXTURE_SHELL=from-file\n');
  process.env.KIT_FIXTURE_SHELL = 'from-shell';
  const project = loadProject({ config: configFile });
  assert.equal(project.testEmail, 'qa@example.test');
  assert.equal(process.env.KIT_FIXTURE_SHELL, 'from-shell');
});
