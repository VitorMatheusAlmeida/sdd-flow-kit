import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const node = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'template', '.specify', 'scripts', 'node');
const run = (cwd, script, ...args) => spawnSync(process.execPath, [path.join(node, script), ...args], { cwd, encoding: 'utf8' });
const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=kit', '-c', 'user.email=kit@example.test', ...args], { cwd, encoding: 'utf8' });

const SOURCE = {
  pages: [
    {
      id: 'R01',
      name: 'Inscrever-se num curso',
      lanes: ['Aluno', 'Sistema'],
      nodes: [
        { id: 'R01-INI', kind: 'start', text: 'Aluno abre o curso', lane: 'Aluno', row: 1 },
        { id: 'R01-P01', kind: 'action', text: '[Inscrever-se]', lane: 'Aluno', row: 2 },
        { id: 'R01-D01', kind: 'decision', text: 'Ainda há vaga?', lane: 'Sistema', row: 3 },
        { id: 'R01-E01', kind: 'error', text: 'E1 · As vagas acabaram.', lane: 'Sistema', row: 3, column: 1 },
        { id: 'R01-P02', kind: 'action', text: 'Sistema grava a inscrição', lane: 'Sistema', row: 4 },
        { id: 'R01-FIM', kind: 'end', text: 'Inscrição confirmada', lane: 'Sistema', row: 5 },
      ],
      edges: [
        { from: 'R01-INI', to: 'R01-P01' },
        { from: 'R01-P01', to: 'R01-D01' },
        { from: 'R01-D01', to: 'R01-E01', label: 'Não' },
        { from: 'R01-D01', to: 'R01-P02', label: 'Sim' },
        { from: 'R01-E01', to: 'R01-FIM' },
        { from: 'R01-P02', to: 'R01-FIM' },
      ],
    },
  ],
};

const script = (happy, stress) =>
  [`**${happy}**`, '', '| # | Passo | Esperado | Situação |', '|---|---|---|---|', '| ① | a | b | ⏳ |', '| ② | c | d | ⏳ |', '', `**${stress}**`, '', '| # | Caso | Esperado | Situação |', '|---|---|---|---|', '| E1 | x | y | ⏳ |', ''].join('\n');

test('flows-drawio generates a draw.io and validates it against a script, in pt-BR or English titles', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-flows-'));
  fs.writeFileSync(path.join(dir, 'source.json'), JSON.stringify(SOURCE));
  const drawio = path.join(dir, 'fluxos.drawio');
  const generated = run(dir, 'flows-drawio.mjs', 'generate', path.join(dir, 'source.json'), drawio);
  assert.equal(generated.status, 0, generated.stderr + generated.stdout);
  assert.match(run(dir, 'flows-drawio.mjs', 'text', drawio).stdout, /Ainda há vaga\?/);

  fs.mkdirSync(path.join(dir, 'roteiros'));
  for (const [happy, stress] of [['Caminho feliz', 'Estresse'], ['Happy path', 'Stress']]) {
    fs.writeFileSync(path.join(dir, 'roteiros', 'R01-inscrever.md'), script(happy, stress));
    const valid = run(dir, 'flows-drawio.mjs', 'validate', drawio, path.join(dir, 'roteiros'));
    assert.equal(valid.status, 0, `${happy}: ${valid.stdout}${valid.stderr}`);
  }

  fs.writeFileSync(path.join(dir, 'roteiros', 'R01-inscrever.md'), script('Caminho feliz', 'Estresse').replace('| ② | c | d | ⏳ |\n', ''));
  assert.notEqual(run(dir, 'flows-drawio.mjs', 'validate', drawio, path.join(dir, 'roteiros')).status, 0);
});

test('tables-dbml checks that the planned file opens on its own and lists what changes against the schema', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-tables-'));
  git(repo, 'init', '-q');
  fs.mkdirSync(path.join(repo, 'dbml'));
  fs.writeFileSync(path.join(repo, 'sdd.config.json'), JSON.stringify({ tables: { source: 'dbml/schema.dbml' } }));
  const level = 'Enum Level {\n  BASIC\n  ADVANCED\n}\n';
  fs.writeFileSync(path.join(repo, 'dbml', 'schema.dbml'), `Table courses {\n  id String [pk]\n  title String [not null]\n}\n\n${level}`);
  const feature = path.join(repo, 'specs', '001-x');
  fs.mkdirSync(feature, { recursive: true });
  const planned = path.join(feature, 'tabelas.planejado.dbml');
  const courses = 'Table courses {\n  id String [pk]\n  title String [not null]\n  seatLimit Int\n}\n';
  const enrollments = 'Table enrollments {\n  id String [pk]\n  courseId String [ref: > courses.id]\n  level Level\n}\n';

  fs.writeFileSync(planned, enrollments);
  const missing = run(repo, 'tables-dbml.mjs', feature);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /ref to "courses"/);
  assert.match(missing.stderr, /enum "Level" is used but not defined/);

  fs.writeFileSync(planned, `${courses}\n${enrollments}\n${level}\nTableGroup inscricao {\n  courses\n  enrollments\n}\n`);
  const ok = run(repo, 'tables-dbml.mjs', feature);
  assert.equal(ok.status, 0, ok.stderr + ok.stdout);
  assert.match(ok.stdout, /courses: changes \+seatLimit/);
  assert.match(ok.stdout, /enrollments: new/);
  assert.deepEqual(fs.readdirSync(feature), ['tabelas.planejado.dbml']);
});
