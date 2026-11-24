#!/usr/bin/env node
// Copies template/ into a project. Never overwrites a file that already exists (it lists it instead),
// unless --force. Node 18+, no dependency.
//
//   node install.mjs <project-dir> [--dry-run] [--force] [--only <prefix,...>]
//   node install.mjs --user [--dry-run] [--force]    # the non-speckit skills into ~/.claude/skills
//
// --only limits the copy to paths starting with the given prefixes (e.g. --only .claude/skills,.specify).
// Updating the kit: pull it and run again with --force --only .claude/skills,.specify/scripts,.specify/templates
// (sdd.config.json, CLAUDE.md, extensions.yml and the constitution are yours after the first copy).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(KIT, 'template');
const USER_SKILLS = ['clean-code', 'modulos-backend', 'code-analyze', 'flow-walkthrough'];

function parse(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run' || a === '--force' || a === '--user') out[a.slice(2)] = true;
    else if (a === '--only') out.only = (argv[++i] ?? '').split(',').filter(Boolean);
    else out._.push(a);
  }
  return out;
}

function filesOf(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesOf(full, base));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

function plan(source, target, { force = false, only } = {}) {
  const files = filesOf(source).filter((rel) => !only?.length || only.some((p) => rel === p || rel.startsWith(p.endsWith('/') ? p : `${p}/`)));
  const copy = [];
  const skip = [];
  for (const rel of files) {
    const exists = fs.existsSync(path.join(target, rel));
    if (exists && !force) skip.push(rel);
    else copy.push({ rel, overwrite: exists });
  }
  return { copy, skip };
}

function apply(source, target, steps) {
  for (const { rel } of steps) {
    const to = path.join(target, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(source, rel), to);
  }
}

function report({ copy, skip }, dryRun) {
  const verb = dryRun ? 'to copy' : 'copied';
  console.log(`${copy.length} file(s) ${verb}${copy.some((c) => c.overwrite) ? ` (${copy.filter((c) => c.overwrite).length} overwritten)` : ''}.`);
  if (skip.length) {
    console.log(`\n${skip.length} file(s) already exist and were kept (merge by hand, or use --force):`);
    for (const rel of skip) console.log(`  - ${rel}`);
  }
}

function main() {
  const args = parse(process.argv.slice(2));

  if (args.user) {
    const target = path.join(os.homedir(), '.claude', 'skills');
    const source = path.join(TEMPLATE, '.claude', 'skills');
    const only = args.only?.length ? args.only : USER_SKILLS;
    const steps = plan(source, target, { force: args.force, only });
    if (!args['dry-run']) apply(source, target, steps.copy);
    report(steps, args['dry-run']);
    console.log(`\nSkills for the user at ${target}. The speckit-* skills stay per project (they depend on .specify/).`);
    return;
  }

  const target = args._[0] ? path.resolve(args._[0]) : null;
  if (!target || !fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    console.error('Usage: node install.mjs <project-dir> [--dry-run] [--force] [--only <prefix,...>]\n       node install.mjs --user [--dry-run] [--force]');
    process.exit(2);
  }
  if (path.resolve(target) === KIT) {
    console.error('The target is the kit itself. Pass the project folder.');
    process.exit(2);
  }
  const steps = plan(TEMPLATE, target, { force: args.force, only: args.only });
  if (!args['dry-run']) apply(TEMPLATE, target, steps.copy);
  report(steps, args['dry-run']);
  console.log(`
Next steps (README › Configure):
  1. Fill in ${path.join(target, 'sdd.config.json')}
  2. /speckit-constitution to write the project principles
  3. Optional quality gates: npm i -D husky lint-staged @commitlint/cli @commitlint/config-conventional
     npm pkg set scripts.prepare=husky && npm run prepare   (keeps the kit .husky/ hooks)`);
}

main();
