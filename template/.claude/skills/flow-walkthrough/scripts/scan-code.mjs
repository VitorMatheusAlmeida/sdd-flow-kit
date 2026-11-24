#!/usr/bin/env node
// Static scan of the screens (and components) of a flow. Decides nothing: it lists what must be
// looked at. Each item becomes a fix or a justification in the matrix.
// Usage: node scan-code.mjs --flow R01 [--files a.tsx,b.tsx] > <dir>/scan-code-R01.md
// Project rules (the ratchet) come from walkthrough.codeRules in sdd.config.json.
import fs from 'node:fs';
import path from 'node:path';
import { loadFlow, loadProject, parseArgs, run } from './lib/context.mjs';
import { componentsOf, relative, screensOf } from './lib/discovery.mjs';
import { translator } from './lib/i18n.mjs';
import { isTitleCase, missingAccentsIn, textRules } from './lib/text-rules.mjs';

const BUILT_IN = [
  { point: 6, re: /toast\.(success|info|warning|loading|promise)\(/g, key: 'code.toastSuccess' },
  { point: 6, re: /toast\.error\(/g, key: 'code.toastError' },
  { point: 8, re: /\.toFixed\(\s*2\s*\)/g, key: 'code.toFixed' },
  { point: 7, re: /className="[^"]*\bcapitalize\b/g, key: 'code.capitalize', when: (p) => p.walkthrough.decisions.sentenceCase },
  { point: 13, re: /<Link\b[^>]*>\s*<Button\b/g, key: 'code.nestedInteractive' },
  { point: 13, re: /<Label>(?![^<]*htmlFor)/g, key: 'code.labelNoFor' },
  { point: 13, re: /<label(?![^>]*htmlFor)[^>]*>/g, key: 'code.labelLowerNoFor' },
  { point: 10, re: /catch\s*(\([^)]*\))?\s*\{\s*\}/g, key: 'code.emptyCatch' },
  { point: 10, re: /\.catch\(\s*\(\)\s*=>\s*(\[\]|null|\{\s*\}|undefined)\s*\)/g, key: 'code.catchToEmpty' },
  { point: 10, re: /\bconsole\.(log|error|warn)\(/g, key: 'code.console' },
  { point: 14, re: /window\.open\([^)]*\)/g, key: 'code.windowOpen', filter: (m) => !/noopener/.test(m) },
  { point: 14, re: /dangerouslySetInnerHTML|v-html=/g, key: 'code.rawHtml' },
  { point: 10, re: /response\?\.data\?\.message|err(or)?\.message\b/g, key: 'code.rawErrorMessage' },
  { point: 16, re: /(?:router\.(?:push|replace)\(|href=\{?)`[^`]*\?(email|token|cpf|ssn|password|senha)=/g, key: 'code.personalInUrl' },
  { point: 14, re: /startsWith\(\s*["']\/["']\s*\)/g, key: 'code.startsWithSlash' },
  { point: 14, re: /(?:localStorage|sessionStorage)\.setItem\(\s*[^,)]*(?:token|jwt|session|senha|password|cpf|ssn)[^,)]*,/gi, key: 'code.tokenInStorage' },
  { point: 14, re: /document\.cookie\s*=\s*[^;]*(?:token|jwt|session)/gi, key: 'code.cookieByScript' },
  { point: 16, re: /(?:href=\{|router\.(?:push|replace)\()`[^`]*\$\{[^}]*[A-Za-z]*[iI]d\}[^`]*`/g, key: 'code.dbIdInLink', when: (p) => p.walkthrough.decisions.dbIdsInUrl !== 'ignore' },
];

/** Dynamic route folder carrying the database id (`[id]`, `[courseId]`): the address shows the primary key. */
const ID_SEGMENT = /\[(?:id|[A-Za-z]*Id)\]/;

/** Visible texts: JSX between > <, string literals in text attributes and in notice or error calls. */
function textsOf(content) {
  const out = [];
  content.split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*|import )/.test(line)) return;
    for (const m of line.matchAll(/>([^<>{}]*[A-Za-zÀ-ú]{2,}[^<>{}]*)</g)) out.push({ line: i + 1, text: m[1].trim() });
    for (const m of line.matchAll(/(?:label|title|placeholder|description|aria-label|alt|message)=?\s*[:=]?\s*["'`]([^"'`]{3,})["'`]/g))
      out.push({ line: i + 1, text: m[1].trim() });
    for (const m of line.matchAll(/(?:toast\.\w+|setError\w*|set\w*Error\w*)\(\s*["'`]([^"'`]{3,})["'`]/g)) out.push({ line: i + 1, text: m[1].trim() });
    // JSX text alone on its line (no tags)
    if (!/[<>{}=;()]/.test(line) && /^\s+[A-Za-zÀ-ú"][^]*[A-Za-zÀ-ú.!?:)"]\s*$/.test(line) && line.trim().split(/\s+/).length >= 2)
      out.push({ line: i + 1, text: line.trim() });
  });
  return out.filter((x) => x.text && !/^[a-z]+(\.[a-z]+)+$/i.test(x.text) && !/^[\w-]+$/.test(x.text));
}

function rulesOf(project) {
  const builtIn = BUILT_IN.filter((r) => !r.when || r.when(project));
  const custom = (project.walkthrough.codeRules ?? []).map((r) => ({
    point: r.point,
    re: new RegExp(r.pattern, r.flags?.includes('g') ? r.flags : `${r.flags ?? ''}g`),
    onlyIn: r.onlyIn ? new RegExp(r.onlyIn) : undefined,
    message: r.message,
  }));
  return [...builtIn, ...custom];
}

function scan(file, rel, project, t, rules, text) {
  const content = fs.readFileSync(file, 'utf8');
  const lineOf = (index) => content.slice(0, index).split('\n').length;
  const items = [];
  const relPath = String(rel).split('\\').join('/');
  const segment = ID_SEGMENT.exec(relPath);
  if (segment && project.walkthrough.decisions.dbIdsInUrl !== 'ignore') items.push({ point: 16, line: 1, msg: t('code.dbIdSegment'), excerpt: segment[0] });
  for (const rule of rules) {
    if (rule.onlyIn && !rule.onlyIn.test(relPath)) continue;
    for (const m of content.matchAll(rule.re)) {
      if (rule.filter && !rule.filter(m[0])) continue;
      items.push({ point: rule.point, line: lineOf(m.index), msg: rule.message ?? t(rule.key), excerpt: m[0].slice(0, 70) });
    }
  }
  for (const { line, text: value } of textsOf(content)) {
    const accents = missingAccentsIn(value, text);
    if (accents.length) items.push({ point: 7, line, msg: t('code.missingAccent', { words: accents.join(', ') }), excerpt: value.slice(0, 70) });
    if (project.walkthrough.decisions.sentenceCase && isTitleCase(value, text) && value.length < 60) items.push({ point: 7, line, msg: t('code.titleCase'), excerpt: value });
    if (text.mechanism.some((re) => re.test(value))) items.push({ point: 7, line, msg: t('code.mechanism'), excerpt: value.slice(0, 90) });
    if (value.length > 140) items.push({ point: 7, line, msg: t('code.longText', { n: value.length }), excerpt: `${value.slice(0, 80)}…` });
    if (text.plural.test(value) && /\{[^}]*\}/.test(value)) items.push({ point: 7, line, msg: t('code.pluralVariable'), excerpt: value });
  }
  return items.sort((a, b) => a.line - b.line);
}

function targetsOf(project, flow, args) {
  if (typeof args.files === 'string') return args.files.split(',').map((f) => ({ file: path.resolve(f), rel: f }));
  const screens = screensOf(project, flow).filter((s) => s.file && fs.existsSync(s.file));
  // Client components living in the folder of each page (e.g. CourseActions.tsx).
  const neighbours = screens.flatMap((s) =>
    fs
      .readdirSync(path.dirname(s.file))
      .filter((n) => /\.(tsx|ts|jsx|js|vue|svelte)$/.test(n) && !/^(page|layout|loading|error|not-found)\./.test(n))
      .map((n) => path.join(path.dirname(s.file), n)),
  );
  const base = project.frontend.root ?? project.frontend.pages;
  const all = [...screens.map((s) => s.file), ...neighbours, ...componentsOf(project, flow).map((c) => c.file)];
  return [...new Set(all)].map((file) => ({ file, rel: relative(base, file), route: screens.find((s) => s.file === file)?.route }));
}

function main() {
  const args = parseArgs();
  const project = loadProject(args);
  const flow = loadFlow(project, args);
  const t = translator(project.locale);
  const rules = rulesOf(project);
  const text = textRules(project.locale);
  const targets = targetsOf(project, flow, args);

  let total = 0;
  console.log(`# ${t('code.title', { flow: flow.id })}\n`);
  console.log(`${t('code.intro')}\n`);
  for (const target of targets) {
    const items = scan(target.file, target.rel, project, t, rules, text);
    if (!items.length) continue;
    total += items.length;
    console.log(`## ${target.rel}${target.route ? `  (${target.route})` : ''}\n`);
    console.log(`${t('code.table')}\n|---|---|---|---|`);
    for (const i of items) console.log(`| ${i.line} | ${i.point} | ${i.msg} | \`${i.excerpt.replace(/\|/g, '\\|').replace(/`/g, "'")}\` |`);
    console.log('');
  }
  console.log(t('code.total', { n: total, files: targets.length }));
}

run(main);
