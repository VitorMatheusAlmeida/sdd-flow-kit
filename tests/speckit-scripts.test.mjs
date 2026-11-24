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

test('tables-dbml writes the filtered diagram, compares with the base and protects hand edits', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-tables-'));
  git(repo, 'init', '-q');
  fs.mkdirSync(path.join(repo, 'dbml'));
  const schema = path.join(repo, 'dbml', 'schema.dbml');
  fs.writeFileSync(schema, 'Table courses {\n  id String [pk]\n  title String [not null]\n}\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'base');
  fs.writeFileSync(schema, 'Table courses {\n  id String [pk]\n  title String [not null]\n  seatLimit Int\n}\n\nTable enrollments {\n  id String [pk]\n}\n');

  const feature = path.join(repo, 'specs', '001-x');
  fs.mkdirSync(feature, { recursive: true });
  fs.writeFileSync(path.join(feature, 'tabelas.filtro.json'), JSON.stringify({ title: 'Spec 001', base: 'HEAD', baseLabel: 'a base', groups: { inscricao: ['courses', 'enrollments'] } }));

  const first = run(repo, 'tables-dbml.mjs', feature);
  assert.equal(first.status, 0, first.stderr + first.stdout);
  const out = fs.readFileSync(path.join(feature, 'tabelas.dbml'), 'utf8');
  assert.match(out, /^\/\/ assinatura: [0-9a-f]{16}/);
  assert.match(out, /ALTERADA desde a base: \+seatLimit/);
  assert.match(out, /NOVA desde a base/);
  assert.match(run(repo, 'tables-dbml.mjs', feature, '--check').stdout, /up to date/);

  fs.writeFileSync(path.join(feature, 'tabelas.dbml'), out.replace('seatLimit Int', 'seatLimit Int [not null]'));
  const check = run(repo, 'tables-dbml.mjs', feature, '--check');
  assert.match(check.stdout + check.stderr, /hand edits/);
  assert.notEqual(run(repo, 'tables-dbml.mjs', feature).status, 0);
  assert.equal(run(repo, 'tables-dbml.mjs', feature, '--force').status, 0);
});
