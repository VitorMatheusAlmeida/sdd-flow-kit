// Screens and routes of a flow, from the code. Adapters by stack: frontend.router
// (next-app-router | manual | none) and backend.framework (nestjs | manual | none).
import fs from 'node:fs';
import path from 'node:path';

/** Simple glob: `**` (any depth), `*` (inside one level), `?`. Paths use `/`. */
export function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*';
      i += 1;
      if (glob[i + 1] === '/') i += 1;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export function listFiles(dir) {
  const out = [];
  if (!dir || !fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

export const relative = (base, file) => path.relative(base, file).split(path.sep).join('/');

export function filterByGlobs(base, files, include = [], exclude = []) {
  const inc = include.map(globToRegex);
  const exc = exclude.map(globToRegex);
  return files.filter((file) => {
    const rel = relative(base, file);
    return inc.some((r) => r.test(rel)) && !exc.some((r) => r.test(rel));
  });
}

const SOURCE = /\.(tsx|ts|jsx|js|vue|svelte)$/;

/** `(public)/courses/[slug]/page.tsx` → `/courses/[slug]` (route groups removed). */
export function nextRouteOf(rel) {
  const parts = rel
    .replace(/\/?page\.(tsx|ts|jsx|js|mdx)$/, '')
    .split('/')
    .filter((part) => part && !/^\(.*\)$/.test(part) && !part.startsWith('@'));
  return `/${parts.join('/')}`;
}

/** Each screen: { route, file?, rel? }. */
export function screensOf(project, flow) {
  const { router, pages, root } = project.frontend;
  if (router === 'none') return [];
  if (router === 'next-app-router') {
    const pageFiles = listFiles(pages).filter((f) => /[\\/]page\.(tsx|ts|jsx|js|mdx)$/.test(f));
    return filterByGlobs(pages, pageFiles, flow.screens ?? [], flow.exclude ?? [])
      .map((file) => ({ file, rel: relative(pages, file), route: nextRouteOf(relative(pages, file)) }))
      .sort((a, b) => a.route.localeCompare(b.route));
  }
  return (flow.screens ?? [])
    .map((screen) => (typeof screen === 'string' ? { route: screen } : screen))
    .map((screen) => {
      const file = screen.file && root ? path.resolve(root, screen.file) : undefined;
      return { route: screen.route, file, rel: screen.file };
    })
    .sort((a, b) => a.route.localeCompare(b.route));
}

export function componentsOf(project, flow) {
  const { root } = project.frontend;
  if (!root || !flow.components?.length) return [];
  const all = listFiles(root).filter((f) => SOURCE.test(f));
  return filterByGlobs(root, all, flow.components, flow.exclude ?? []).map((file) => ({ file, rel: relative(root, file) }));
}

/** Routes of a NestJS controller: `@Controller('x')` + `@Get('y')`. Versioning and global prefix are not read. */
export function nestRoutesOf(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const prefix = /@Controller\(\s*['"`]([^'"`]*)['"`]/.exec(text)?.[1] ?? '';
  const out = [];
  const re = /@(Get|Post|Put|Patch|Delete)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;
  let m;
  while ((m = re.exec(text))) {
    const line = text.slice(0, m.index).split('\n').length;
    const routePath = `/${[prefix, m[2] ?? ''].filter(Boolean).join('/')}`.replace(/\/+/g, '/');
    const method = m[1].toUpperCase();
    out.push({ method, path: routePath, key: `${method} ${routePath}`, line });
  }
  return out;
}

/** Each route: { method, path, key, file?, line? }. */
export function routesOf(project, flow) {
  const { framework, root } = project.backend;
  if (framework === 'none') return [];
  if (framework === 'nestjs') {
    const filters = (flow.routeFilter ?? []).map((r) => new RegExp(r));
    const out = [];
    for (const rel of flow.controllers ?? []) {
      const file = path.resolve(root, rel);
      if (!fs.existsSync(file)) {
        out.push({ method: '?', path: `(controller not found: ${rel})`, key: `? ${rel}`, file: rel, line: 0 });
        continue;
      }
      for (const route of nestRoutesOf(file)) {
        if (filters.length && !filters.some((f) => f.test(route.key))) continue;
        out.push({ ...route, file: rel });
      }
    }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  }
  return (flow.routes ?? [])
    .map((key) => {
      const [method, routePath] = key.trim().split(/\s+/);
      return { method: method.toUpperCase(), path: routePath, key: `${method.toUpperCase()} ${routePath}` };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** Client files that may call the API (frontend root). */
export function clientFiles(project) {
  const base = project.frontend.root ?? project.frontend.pages;
  return listFiles(base)
    .filter((f) => SOURCE.test(f))
    .map((file) => ({ file, rel: relative(base, file) }));
}

/**
 * A client that builds the URL through a helper (`const base = (id) => \`/courses/${id}/x\``) and calls
 * `${base(id)}/y`: replace the call with the helper body, so the whole path shows in the text.
 */
function expandUrlHelpers(text) {
  const helpers = new Map();
  const def = /const\s+(\w+)\s*=\s*\([^)]*\)\s*(?::\s*string\s*)?=>\s*`(\/[^`]*)`/g;
  let m;
  while ((m = def.exec(text))) helpers.set(m[1], m[2]);
  let out = text;
  for (const [name, body] of helpers) out = out.replace(new RegExp(`\\$\\{${name}\\([^)]*\\)\\}`, 'g'), body);
  return out;
}

/** Which client files mention the route path. Path parameters (`:id`, `{id}`) match anything. */
export function routeUsage(route, files) {
  const parts = route.path.split('/').filter(Boolean);
  if (!parts.length) return [];
  const re = new RegExp(
    parts
      .map((p) => (p.startsWith(':') || /^\{.+\}$/.test(p) ? "[^/'\"`]+" : p.replace(/[.+^${}()|[\]\\]/g, '\\$&')))
      .join('/'),
  );
  const uses = [];
  for (const { file, rel } of files) {
    const text = expandUrlHelpers(fs.readFileSync(file, 'utf8')).replace(/\$\{[^}]+\}/g, 'x');
    if (re.test(text)) uses.push(rel);
  }
  return uses;
}
