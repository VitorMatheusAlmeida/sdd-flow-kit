// Shared context of the walkthrough scripts: command-line arguments, the project configuration
// (sdd.config.json, found from the current folder up), the walkthrough folder and the flows file.
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith('--')) {
      out._.push(current);
      continue;
    }
    const key = current.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

export function findConfig(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    const candidate = path.join(dir, 'sdd.config.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** The project's `.env` (next to sdd.config.json) fills variables that are not set yet; the shell always wins. */
function loadDotEnv(root) {
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return;
  for (const [key, value] of Object.entries(parseEnv(fs.readFileSync(file, 'utf8')))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const trimSlash = (url) => (typeof url === 'string' ? url.replace(/\/+$/, '') : undefined);

/** Reads sdd.config.json and fills the defaults. `--frontend`, `--pages`, `--backend`, `--base`, `--site` override (e.g. a worktree). */
export function loadProject(args = {}) {
  const file = typeof args.config === 'string' ? path.resolve(args.config) : findConfig();
  if (!file || !fs.existsSync(file)) {
    throw new Error('sdd.config.json not found (searched from the current folder up). Install sdd-flow-kit in the project (node install.mjs <project>) or copy its template/sdd.config.json to the project root.');
  }
  const root = path.dirname(file);
  loadDotEnv(root);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const fromConfig = (p) => (typeof p === 'string' ? path.resolve(root, p) : undefined);
  const fromArg = (p) => (typeof p === 'string' ? path.resolve(p) : undefined);
  const envName = typeof args.env === 'string' ? args.env : Object.keys(raw.environments ?? {})[0];
  const env = raw.environments?.[envName] ?? {};
  const walkthrough = raw.walkthrough ?? {};
  const locale = raw.project?.locale ?? 'en';

  return {
    raw,
    file,
    root,
    locale,
    frontend: {
      router: 'manual',
      ...raw.frontend,
      root: fromArg(args.frontend) ?? fromConfig(raw.frontend?.root),
      pages: fromArg(args.pages) ?? fromConfig(raw.frontend?.pages),
    },
    backend: {
      framework: 'manual',
      healthPath: '/health',
      docsPath: '/api',
      ...raw.backend,
      errorShape: { code: 'code', message: 'message', ...raw.backend?.errorShape },
      root: fromArg(args.backend) ?? fromConfig(raw.backend?.root),
    },
    auth: {
      loginPath: '/auth/login',
      loginBody: { email: '{email}', password: '{password}' },
      tokenPath: 'access_token',
      headerScheme: 'Bearer',
      cookieName: 'token',
      ...raw.auth,
    },
    env: {
      name: envName,
      frontendUrl: trimSlash(typeof args.site === 'string' ? args.site : env.frontendUrl),
      backendUrl: trimSlash(typeof args.base === 'string' ? args.base : env.backendUrl),
    },
    accounts: { passwordEnv: 'SDD_TEST_PASSWORD', roles: {}, ...raw.accounts },
    testEmail: raw.testEmail ?? (raw.testEmailEnv ? process.env[raw.testEmailEnv] : undefined),
    commands: raw.commands ?? {},
    walkthrough: {
      outputDir: 'walkthrough',
      viewports: [1280, 390],
      minTouchTargetPx: 40,
      testDataPrefix: 'QA_',
      notFoundText: locale === 'pt-BR' ? 'Página não encontrada' : 'Page not found',
      domainRules: [],
      sensitiveKeys: [],
      personKeys: [],
      codeRules: [],
      ...walkthrough,
      decisions: { dbIdsInUrl: 'forbid', sentenceCase: true, ...walkthrough.decisions },
      text: { pluralNouns: [], ...walkthrough.text },
      selectors: { toast: '[data-sonner-toast]', ...walkthrough.selectors },
    },
  };
}

/** `--dir`, else `<feature>/<outputDir>` when spec-kit tracks a current feature, else `<root>/<outputDir>`. */
export function walkthroughDir(project, args = {}) {
  if (typeof args.dir === 'string') return path.resolve(args.dir);
  const featureFile = path.join(project.root, '.specify', 'feature.json');
  if (fs.existsSync(featureFile)) {
    const feature = JSON.parse(fs.readFileSync(featureFile, 'utf8')).feature_directory;
    if (feature) return path.resolve(project.root, feature, project.walkthrough.outputDir);
  }
  return path.resolve(project.root, project.walkthrough.outputDir);
}

export function loadFlow(project, args) {
  const dir = walkthroughDir(project, args);
  const file = typeof args.flows === 'string' ? path.resolve(args.flows) : path.join(dir, 'flows.json');
  if (!fs.existsSync(file)) throw new Error(`Flows file not found: ${file}. See reference/files.md of flow-walkthrough.`);
  const flows = JSON.parse(fs.readFileSync(file, 'utf8')).flows ?? {};
  const id = args.flow;
  if (typeof id !== 'string') throw new Error(`Pass --flow <id>. Flows in ${file}: ${Object.keys(flows).join(', ') || '(none)'}`);
  if (!flows[id]) throw new Error(`Flow "${id}" is not in ${file}. There are: ${Object.keys(flows).join(', ') || '(none)'}`);
  return { id, dir, file, ...flows[id] };
}

export const today = () => new Date().toISOString().slice(0, 10);

/** Markdown table cell: no pipes, no line breaks. */
export const cell = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/** Runs `main` and turns a thrown error into a short message and exit code 2. */
export function run(main) {
  Promise.resolve()
    .then(main)
    .catch((error) => {
      console.error(error?.message ?? error);
      process.exit(2);
    });
}
