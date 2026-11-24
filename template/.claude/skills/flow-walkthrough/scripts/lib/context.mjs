// Shared context of the walkthrough scripts: command-line arguments, the project configuration
// (sdd.config.json, found from the current folder up), the walkthrough folder and the flows file.
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { relative } from './discovery.mjs';
import { readNestFacts } from './nest.mjs';

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

/** Env file of an environment: `local` → `.env`, any other name → `.env.<name>`. */
export const envFileOf = (name) => (name === 'local' ? '.env' : `.env.${name}`);

/** Folder of the backend env files: `backend.envDir`, else the nearest folder above `backend.root` with a package.json, else the config folder. */
function envDirOf(raw, root) {
  if (typeof raw.backend?.envDir === 'string') return path.resolve(root, raw.backend.envDir);
  if (typeof raw.backend?.root === 'string') {
    for (let dir = path.resolve(root, raw.backend.root); ; dir = path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
      if (path.dirname(dir) === dir) break;
    }
  }
  return root;
}

/**
 * Environments: the explicit `environments` of the config, else one per env file found in the backend env folder:
 * `.env.test` → test (the default when it exists), `.env` → local.
 */
function environmentsOf(raw, envDir) {
  if (raw.environments && Object.keys(raw.environments).length) return raw.environments;
  const out = {};
  if (fs.existsSync(path.join(envDir, '.env.test'))) out.test = {};
  if (fs.existsSync(path.join(envDir, '.env'))) out.local = {};
  return out;
}

/** Loads ONE env file, the chosen environment's, without overriding what the shell already set. */
function loadEnvFile(file) {
  if (!file || !fs.existsSync(file)) return;
  for (const [key, value] of Object.entries(parseEnv(fs.readFileSync(file, 'utf8')))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const trimSlash = (url) => (typeof url === 'string' ? url.replace(/\/+$/, '') : undefined);

/**
 * Reads sdd.config.json and fills in what the code and the env file already own. With a NestJS backend, the global
 * prefix, Swagger path, health and login routes, login body, session cookie and error body come from the code; the
 * API URL comes from PORT (+ prefix) and the frontend URL from FRONTEND_URL of the environment's env file. A key
 * written in the config overrides what was read. `project.sources` tells where each value came from
 * (show-config.mjs). `--frontend`, `--pages`, `--backend`, `--base`, `--site` override (e.g. a worktree).
 */
export function loadProject(args = {}) {
  const file = typeof args.config === 'string' ? path.resolve(args.config) : findConfig();
  if (!file || !fs.existsSync(file)) {
    throw new Error('sdd.config.json not found (searched from the current folder up). Install sdd-flow-kit in the project (node install.mjs <project>) or copy its template/sdd.config.json to the project root.');
  }
  const root = path.dirname(file);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const fromConfig = (p) => (typeof p === 'string' ? path.resolve(root, p) : undefined);
  const fromArg = (p) => (typeof p === 'string' ? path.resolve(p) : undefined);
  const sources = {};
  const pick = (key, configValue, fact, fallback) => {
    if (configValue !== undefined) {
      sources[key] = 'sdd.config.json';
      return configValue;
    }
    if (fact) {
      sources[key] = `code: ${fact.from}`;
      return fact.value;
    }
    sources[key] = 'default';
    return fallback;
  };

  const envDir = envDirOf(raw, root);
  const environments = environmentsOf(raw, envDir);
  const envName = typeof args.env === 'string' ? args.env : Object.keys(environments)[0];
  const env = environments[envName] ?? {};
  const envFile = env.envFile ? path.resolve(root, env.envFile) : envName ? path.join(envDir, envFileOf(envName)) : undefined;
  loadEnvFile(envFile);
  const envLabel = envFile ? relative(root, envFile) : 'shell';

  const backendRoot = fromArg(args.backend) ?? fromConfig(raw.backend?.root);
  const framework = raw.backend?.framework ?? 'manual';
  const facts = framework === 'nestjs' ? readNestFacts(backendRoot) : {};
  const prefix = pick('backend.prefix', raw.backend?.prefix, facts.prefix, '');

  const port = process.env.PORT;
  let backendUrl;
  if (typeof args.base === 'string') [backendUrl, sources['env.backendUrl']] = [args.base, '--base'];
  else if (env.backendUrl) [backendUrl, sources['env.backendUrl']] = [env.backendUrl, 'sdd.config.json'];
  else if (port) [backendUrl, sources['env.backendUrl']] = [`http://localhost:${port}${prefix}`, `${envLabel}: PORT + prefix`];
  else sources['env.backendUrl'] = 'missing';

  let frontendUrl;
  if (typeof args.site === 'string') [frontendUrl, sources['env.frontendUrl']] = [args.site, '--site'];
  else if (env.frontendUrl) [frontendUrl, sources['env.frontendUrl']] = [env.frontendUrl, 'sdd.config.json'];
  else if (process.env.FRONTEND_URL) [frontendUrl, sources['env.frontendUrl']] = [process.env.FRONTEND_URL, `${envLabel}: FRONTEND_URL`];
  else sources['env.frontendUrl'] = 'missing';

  const walkthrough = raw.walkthrough ?? {};
  const locale = raw.project?.locale ?? 'en';

  return {
    raw,
    file,
    root,
    locale,
    sources,
    frontend: {
      router: 'manual',
      ...raw.frontend,
      root: fromArg(args.frontend) ?? fromConfig(raw.frontend?.root),
      pages: fromArg(args.pages) ?? fromConfig(raw.frontend?.pages),
    },
    backend: {
      framework,
      root: backendRoot,
      prefix,
      healthPath: pick('backend.healthPath', raw.backend?.healthPath, facts.healthPath, '/health'),
      docsPath: pick('backend.docsPath', raw.backend?.docsPath, facts.docsPath, '/api'),
      errorShape: pick('backend.errorShape', raw.backend?.errorShape, facts.errorShape, { code: 'code', message: 'message' }),
    },
    auth: {
      loginPath: pick('auth.loginPath', raw.auth?.loginPath, facts.loginPath, '/auth/login'),
      loginBody: pick('auth.loginBody', raw.auth?.loginBody, facts.loginBody, { email: '{login}', password: '{password}' }),
      tokenPath: pick('auth.tokenPath', raw.auth?.tokenPath, facts.tokenPath, 'access_token'),
      cookieName: pick('auth.cookieName', raw.auth?.cookieName, facts.cookieName, 'token'),
      headerScheme: raw.auth?.headerScheme ?? 'Bearer',
    },
    env: { name: envName, file: envFile, frontendUrl: trimSlash(frontendUrl), backendUrl: trimSlash(backendUrl) },
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
