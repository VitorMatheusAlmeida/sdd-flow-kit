// Facts a NestJS backend already states in its code, read from the code so they never live in two places:
// global prefix and Swagger path (main.ts), health and login routes (controllers), login body (DTO), session
// cookie and token field (login handler), error body fields (exception filters). Each fact comes with the file it
// was read from; a fact not found is left out and the caller falls back to the config or a default.
import fs from 'node:fs';
import path from 'node:path';
import { listFiles, nestRoutesOf, relative } from './discovery.mjs';

const read = (file) => fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
const quoted = (re, text) => re.exec(text)?.[1];

function bootstrap(root, files, facts) {
  const main = files.find((f) => path.basename(f) === 'main.ts') ?? files.find((f) => /NestFactory\.create/.test(read(f)));
  if (!main) return '';
  const text = read(main);
  const where = relative(path.dirname(root), main);
  const prefix = quoted(/setGlobalPrefix\(\s*['"`]([^'"`]*)['"`]/, text);
  const docs = quoted(/SwaggerModule\.setup\(\s*['"`]([^'"`]+)['"`]/, text);
  if (prefix !== undefined) facts.prefix = { value: prefix ? `/${prefix.replace(/^\/+|\/+$/g, '')}` : '', from: where };
  // Swagger is served outside the global prefix unless setup says otherwise: '/docs' is resolved at the server root.
  if (docs) facts.docsPath = { value: `/${docs.replace(/^\/+/, '')}`, from: where };
  return facts.prefix?.value ?? '';
}

/** The class body of `name`, searched in the backend files. */
function classBody(files, name) {
  for (const file of files) {
    const text = read(file);
    const start = text.search(new RegExp(`class\\s+${name}\\b`));
    if (start < 0) continue;
    return { body: text.slice(start, text.indexOf('\n}', start)), file };
  }
  return null;
}

function login(root, files, controllers, facts) {
  for (const file of controllers) {
    const route = nestRoutesOf(file).find((r) => r.method === 'POST' && /(^|\/)login$/.test(r.path));
    if (!route) continue;
    const text = read(file);
    const where = relative(path.dirname(root), file);
    facts.loginPath = { value: route.path, from: `${where}:${route.line}` };
    const handler = text.slice(text.split('\n').slice(0, route.line - 1).join('\n').length);
    const handlerEnd = handler.search(/\n\s*@(Get|Post|Put|Patch|Delete)\(/);
    const block = handlerEnd > 0 ? handler.slice(0, handlerEnd) : handler;

    const dto = quoted(/@Body\(\)\s*\w+\s*:\s*(\w+)/, block);
    const found = dto && classBody(files, dto);
    if (found) {
      const field = (names) => names.find((n) => new RegExp(`\\b${n}[?!]?\\s*:`).test(found.body));
      const login = field(['username', 'email', 'login', 'cpf']);
      const password = field(['password', 'senha']);
      if (login && password) {
        facts.loginBody = { value: { [login]: '{login}', [password]: '{password}' }, from: relative(path.dirname(root), found.file) };
      }
    }
    const cookie = /\.cookie\(\s*['"`]([^'"`]+)['"`]\s*,\s*\w+\.(\w+)/.exec(block);
    if (cookie) {
      facts.cookieName = { value: cookie[1], from: where };
      facts.tokenPath = { value: cookie[2], from: where };
    }
    return;
  }
}

function health(root, controllers, facts) {
  for (const file of controllers) {
    const route = nestRoutesOf(file).find((r) => r.method === 'GET' && /(^|\/)health$/.test(r.path));
    if (route) {
      facts.healthPath = { value: route.path, from: `${relative(path.dirname(root), file)}:${route.line}` };
      return;
    }
  }
}

function errorShape(root, files, facts) {
  const filters = files.filter((f) => /@Catch\(/.test(read(f)));
  const keys = new Set();
  for (const file of filters) {
    for (const m of read(file).matchAll(/\.json\(\s*\{([^}]*)\}/g)) {
      for (const k of m[1].matchAll(/(?:^|,)\s*(\w+)\s*(?::|,|$)/g)) keys.add(k[1]);
    }
  }
  if (!keys.size) return;
  facts.errorShape = {
    value: { code: keys.has('code') ? 'code' : null, message: keys.has('message') ? 'message' : [...keys][0] },
    from: filters.map((f) => relative(path.dirname(root), f)).join(', '),
  };
}

export function readNestFacts(backendRoot) {
  const facts = {};
  if (!backendRoot || !fs.existsSync(backendRoot)) return facts;
  const files = listFiles(backendRoot).filter((f) => f.endsWith('.ts') && !/\.(spec|e2e-spec)\.ts$/.test(f) && !/[\\/]generated[\\/]/.test(f));
  const controllers = files.filter((f) => f.endsWith('.controller.ts'));
  bootstrap(backendRoot, files, facts);
  login(backendRoot, files, controllers, facts);
  health(backendRoot, controllers, facts);
  errorShape(backendRoot, files, facts);
  return facts;
}
