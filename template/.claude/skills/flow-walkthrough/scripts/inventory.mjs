#!/usr/bin/env node
// Creates or updates the walkthrough matrix of a flow from the code (screens + routes).
// Usage: node inventory.mjs --flow R01 [--dir <walkthrough dir>] [--out <matrix.md>]
// A section already in the matrix is kept (with what was filled in); a new screen or route comes in
// with every cell ⏳; what left the code is marked "(no longer in the code)".
import fs from 'node:fs';
import path from 'node:path';
import { loadFlow, loadProject, parseArgs, run } from './lib/context.mjs';
import { clientFiles, relative, routeUsage, routesOf, screensOf } from './lib/discovery.mjs';
import { allLabels, points, translator } from './lib/i18n.mjs';

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function table(t, list) {
  return [t('matrix.header'), '|---|---|---|---|', ...list.map(([n, name]) => `| ${n} | ${name} | ⏳ |  |`)].join('\n');
}

function existingSections(text, headings, goneMarkers) {
  const map = new Map();
  const re = new RegExp(`^## (${headings.map(escape).join('|')}): (.+)$`, 'gm');
  const gone = new RegExp(` (${goneMarkers.map(escape).join('|')})$`);
  const marks = [];
  let m;
  while ((m = re.exec(text))) marks.push({ kind: m[1], title: m[2].trim().replace(gone, ''), start: m.index });
  marks.forEach((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].start : text.length;
    map.set(`${mark.kind}: ${mark.title}`, text.slice(mark.start, end).trimEnd());
  });
  return map;
}

function main() {
  const args = parseArgs();
  const project = loadProject(args);
  const flow = loadFlow(project, args);
  const t = translator(project.locale);
  const list = points(project.locale, project.walkthrough.viewports);
  const out = path.resolve(typeof args.out === 'string' ? args.out : path.join(flow.dir, `matrix-${flow.id}.md`));

  const screens = screensOf(project, flow);
  const routes = routesOf(project, flow);
  const client = clientFiles(project);
  const usage = new Map(routes.map((r) => [r.key, r.method === '?' ? [] : routeUsage(r, client)]));

  const previous = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  const screenWord = t('matrix.screen');
  const routeWord = t('matrix.route');
  const headings = [...allLabels('matrix.screen'), ...allLabels('matrix.route')];
  const existing = existingSections(previous, headings, allLabels('matrix.gone'));
  const firstSection = new RegExp(`\\n## (${headings.map(escape).join('|')}): `).exec(previous);
  const header =
    previous.trim()
      ? (firstSection ? previous.slice(0, firstSection.index) : previous).trimEnd()
      : [
          `# ${t('matrix.title', { flow: flow.id, name: flow.name ? ` (${flow.name})` : '' })}`,
          '',
          t('matrix.legend'),
          '',
          `${t('matrix.secondRound')}: ⏳`,
          '',
          `## ${t('matrix.walkthrough')}`,
          '',
          table(t, list.walkthrough),
        ].join('\n');

  const sections = [];
  const seen = new Set();
  const keyOf = (kind, title) => [kind, ...allLabels(kind === screenWord ? 'matrix.screen' : 'matrix.route')].map((k) => `${k}: ${title}`);
  const findExisting = (kind, title) => keyOf(kind, title).map((k) => existing.get(k)).find(Boolean);

  for (const screen of screens) {
    keyOf(screenWord, screen.route).forEach((k) => seen.add(k));
    const fileLine = screen.rel ? `${t('matrix.file')}: \`${screen.rel}\`\n\n` : '';
    sections.push(findExisting(screenWord, screen.route) ?? `## ${screenWord}: ${screen.route}\n\n${fileLine}${table(t, list.screen)}`);
  }
  for (const route of routes) {
    keyOf(routeWord, route.key).forEach((k) => seen.add(k));
    const uses = usage.get(route.key);
    const where = route.file ? `${t('matrix.controller')}: \`${route.file}:${route.line}\` · ` : '';
    const usedBy = uses.length ? uses.map((u) => `\`${u}\``).join(', ') : t('matrix.noScreen');
    sections.push(findExisting(routeWord, route.key) ?? `## ${routeWord}: ${route.key}\n\n${where}${t('matrix.usedBy')}: ${usedBy}\n\n${table(t, list.route)}`);
  }
  for (const [key, content] of existing) {
    if (seen.has(key)) continue;
    sections.push(content.replace(/^## (.+)$/m, (_, title) => `## ${title} ${t('matrix.gone')}`));
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${header}\n\n${sections.join('\n\n')}\n`, 'utf8');

  const unused = routes.filter((r) => r.method !== '?' && usage.get(r.key).length === 0);
  const shown = relative(process.cwd(), out);
  console.log(`Matrix: ${shown.startsWith('..') ? out : shown}`);
  console.log(`Screens: ${screens.length} · Routes: ${routes.length} · Routes no screen calls: ${unused.length}`);
  for (const s of screens) console.log(`  screen  ${s.route}${s.rel ? `  (${s.rel})` : ''}`);
  for (const r of routes) console.log(`  route   ${r.key}${unused.includes(r) ? '   ← no screen uses it' : ''}`);
}

run(main);
