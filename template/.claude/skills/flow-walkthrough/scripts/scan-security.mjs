#!/usr/bin/env node
// Security scan of a flow (point 14). Decides nothing: it lists what must be looked at.
// Part 1 (code, NestJS): flow routes that check a password or receive a file without their own
// attempt limit, id parameters without validation. Part 2 (live): API headers with and without a
// session, documentation route, screen headers.
// Usage: node scan-security.mjs --flow R01 [--token <test token>] [--env local] > <dir>/scan-security-R01.md
import fs from 'node:fs';
import path from 'node:path';
import { loadFlow, loadProject, parseArgs, run } from './lib/context.mjs';
import { listFiles, routesOf, screensOf } from './lib/discovery.mjs';
import { translator } from './lib/i18n.mjs';

/** Decorators and signature of a route: from the decorators above the HTTP one to the method opening. */
function routeBlock(text, line) {
  const lines = text.split('\n');
  let start = line - 1;
  while (start > 0 && /^\s*(@|\/\/|\*|\/\*)/.test(lines[start - 1])) start -= 1;
  let end = line - 1;
  while (end < lines.length - 1 && !/\)\s*(:\s*[^{]+)?\{\s*$/.test(lines[end])) end += 1;
  return lines.slice(start, end + 1).join('\n');
}

const dtoCache = new Map();
/** Does the body DTO have a password field? Looks for `class <Name>` in the backend code. */
function dtoHasPassword(project, name) {
  if (dtoCache.has(name)) return dtoCache.get(name);
  let has = false;
  for (const file of listFiles(project.backend.root).filter((f) => f.endsWith('.ts'))) {
    const text = fs.readFileSync(file, 'utf8');
    const i = text.indexOf(`class ${name}`);
    if (i < 0) continue;
    const body = text.slice(i, text.indexOf('\n}', i));
    has = /\b(password|senha|currentPassword|senhaAtual)\??\s*[:!]/.test(body);
    break;
  }
  dtoCache.set(name, has);
  return has;
}

function scanCode(project, flow, t) {
  if (project.backend.framework !== 'nestjs') return [];
  const items = [];
  for (const route of routesOf(project, flow)) {
    if (route.method === '?' || !route.file) continue;
    const text = fs.readFileSync(path.resolve(project.backend.root, route.file), 'utf8');
    const block = routeBlock(text, route.line);
    const limited = /@Throttle\(/.test(block);
    const dto = /@Body\(\)\s*\w+\s*:\s*(\w+)/.exec(block)?.[1];
    if (!limited && /FileInterceptor|FilesInterceptor/.test(block)) items.push({ route: route.key, msg: t('sec.fileNoThrottle') });
    if (!limited && dto && dtoHasPassword(project, dto)) items.push({ route: route.key, msg: t('sec.passwordNoThrottle', { dto }) });
    for (const m of block.matchAll(/@Param\(\s*['"`](\w+)['"`]\s*\)/g)) {
      if (/(^id$|Id$)/.test(m[1])) items.push({ route: route.key, msg: t('sec.paramNoValidation', { param: m[1] }) });
    }
  }
  return items;
}

async function headersOf(url, options = {}) {
  try {
    const r = await fetch(url, { redirect: 'manual', ...options });
    return { status: r.status, h: r.headers };
  } catch (error) {
    return { status: 0, error: String(error.message ?? error) };
  }
}

async function scanLive(project, flow, args, t) {
  const items = [];
  const base = project.env.backendUrl;
  const site = project.env.frontendUrl;

  if (base) {
    // Signed-in responses are not cached; the server does not announce itself.
    if (typeof args.token === 'string') {
      const gets = routesOf(project, flow).filter((r) => r.method === 'GET' && !/[:{]/.test(r.path));
      for (const route of gets) {
        const auth = `${project.auth.headerScheme} ${args.token}`.trim();
        const { status, h, error } = await headersOf(base + route.path, { headers: { authorization: auth } });
        if (!status) items.push({ where: route.key, msg: t('sec.noResponse', { error }) });
        else if (status < 400 && !/no-store/i.test(h.get('cache-control') ?? '')) items.push({ where: route.key, msg: t('sec.noStore') });
      }
    } else items.push({ where: 'API', msg: t('sec.noToken') });
    const health = await headersOf(base + project.backend.healthPath);
    if (health.status && health.h.get('x-powered-by')) items.push({ where: 'API', msg: t('sec.poweredBy', { value: health.h.get('x-powered-by') }) });
    if (health.status && !health.h.get('strict-transport-security') && !health.h.get('x-frame-options')) items.push({ where: 'API', msg: t('sec.noHelmet') });
    // Resolved as a URL reference: '/docs' is at the server root (Swagger usually sits outside the global prefix), 'docs' below backendUrl.
    const docsUrl = new URL(project.backend.docsPath, `${base}/`).href;
    const docs = await headersOf(docsUrl);
    if (docs.status === 200) items.push({ where: docsUrl, msg: t('sec.docsOpen') });
  }

  // Screens: headers against clickjacking, MIME sniffing and origin leaks.
  if (site) {
    for (const screen of screensOf(project, flow).filter((s) => !/[[{:]/.test(s.route))) {
      const { status, h, error } = await headersOf(site + screen.route);
      if (!status) {
        items.push({ where: screen.route, msg: t('sec.noResponse', { error }) });
        continue;
      }
      const csp = h.get('content-security-policy') ?? '';
      if (!h.get('x-frame-options') && !/frame-ancestors/.test(csp)) items.push({ where: screen.route, msg: t('sec.frameable') });
      if (!h.get('x-content-type-options')) items.push({ where: screen.route, msg: t('sec.noNosniff') });
      if (!h.get('referrer-policy')) items.push({ where: screen.route, msg: t('sec.noReferrer') });
      if (h.get('x-powered-by')) items.push({ where: screen.route, msg: t('sec.poweredBy', { value: h.get('x-powered-by') }) });
    }
  }
  return items;
}

async function main() {
  const args = parseArgs();
  const project = loadProject(args);
  const flow = loadFlow(project, args);
  const t = translator(project.locale);
  console.log(`# ${t('sec.title', { flow: flow.id })}\n`);

  const code = scanCode(project, flow, t);
  console.log(`## ${t('sec.code')}\n`);
  if (!code.length) console.log(`${t('sec.nothing')}\n`);
  else {
    console.log(`${t('sec.tableRoute')}\n|---|---|`);
    for (const i of code) console.log(`| \`${i.route}\` | ${i.msg} |`);
    console.log('');
  }

  const live = await scanLive(project, flow, args, t);
  console.log(`## ${t('sec.live')}\n`);
  if (!live.length) console.log(`${t('sec.nothing')}\n`);
  else {
    console.log(`${t('sec.tableWhere')}\n|---|---|`);
    for (const i of live) console.log(`| \`${i.where}\` | ${i.msg} |`);
    console.log('');
  }

  console.log(`## ${t('sec.deps')}\n`);
  console.log(`${t('sec.depsHint', { audit: project.commands.audit ?? 'npm audit --omit=dev' })}\n`);
  console.log(t('sec.total', { n: code.length + live.length }));
}

run(main);
