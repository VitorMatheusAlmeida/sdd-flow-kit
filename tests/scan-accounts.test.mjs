import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, '..', 'template', '.claude', 'skills', 'flow-walkthrough', 'scripts', 'scan-accounts.mjs');

/** API that answers a foreign course and a nonexistent one with different messages (the leak parity must catch). */
function fakeApi() {
  const tokens = { 'owner@example.test': 'T-OWNER', 'other@example.test': 'T-OTHER' };
  const created = new Set();
  return http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const send = (status, json) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(json));
      };
      const auth = req.headers.authorization;
      if (req.method === 'POST' && req.url === '/auth/login') {
        const { email, password } = JSON.parse(body);
        return password === 'secret' && tokens[email] ? send(200, { access_token: tokens[email] }) : send(401, { code: 'BAD_LOGIN', message: 'Senha incorreta' });
      }
      if (req.method === 'POST' && req.url === '/courses') {
        created.add('c1');
        return send(201, { id: 'c1' });
      }
      const match = /^\/courses\/([\w-]+)$/.exec(req.url);
      if (match && req.method === 'GET') {
        if (!created.has(match[1])) return send(404, { code: 'COURSE_NOT_FOUND', message: 'Curso não encontrado' });
        if (auth === 'Bearer T-OWNER') return send(200, { id: match[1], title: 'QA_Curso' });
        return send(404, { code: 'COURSE_NOT_FOUND', message: 'Você não tem acesso a este curso' });
      }
      if (match && req.method === 'DELETE') {
        created.delete(match[1]);
        return send(200, {});
      }
      return send(404, { message: 'Cannot GET' });
    });
  });
}

function runAsync(cwd, args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, env: { ...process.env, ...env } });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

test('scan-accounts signs in, runs setup and cleanup, and catches a parity leak', async () => {
  const server = fakeApi();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-accounts-'));
  fs.writeFileSync(
    path.join(dir, 'sdd.config.json'),
    JSON.stringify({
      project: { name: 'fixture', locale: 'pt-BR' },
      environments: { local: { backendUrl: `http://127.0.0.1:${port}` } },
      accounts: { passwordEnv: 'FIXTURE_PASSWORD', roles: { owner: 'owner@example.test', otherOwner: 'other@example.test' } },
      walkthrough: { outputDir: 'walkthrough' },
    }),
  );
  fs.mkdirSync(path.join(dir, 'walkthrough'));
  fs.writeFileSync(
    path.join(dir, 'walkthrough', 'scenarios-R01.json'),
    JSON.stringify({
      name: 'R01 — fixture',
      owners: ['owner'],
      setup: [{ as: 'owner', method: 'POST', path: '/courses', body: { title: '{prefix}Curso' }, save: { course: 'id' } }],
      calls: [{ name: 'Detalhe', method: 'GET', path: '/courses/{course}', parity: { account: 'otherOwner', replace: { course: '{null}' } } }],
      cleanup: [{ as: 'owner', method: 'DELETE', path: '/courses/{course}' }],
    }),
  );

  try {
    const r = await runAsync(dir, ['--flow', 'R01'], { FIXTURE_PASSWORD: 'secret' });
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /^# Varredura de contas — R01 — fixture/);
    assert.match(r.out, /Detalhe · otherOwner: parity DIFFERS/);
    assert.match(r.out, /\*\*DIFERE\*\*/);
    assert.doesNotMatch(r.out, /Detalhe · owner: foreign-2xx/);
    assert.doesNotMatch(r.out, /Limpeza com falha/);

    const wrong = await runAsync(dir, ['--flow', 'R01'], { FIXTURE_PASSWORD: 'wrong' });
    assert.equal(wrong.code, 2);
    assert.match(wrong.err, /did not sign in/);
  } finally {
    server.close();
  }
});
