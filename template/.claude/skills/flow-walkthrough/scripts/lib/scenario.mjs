// Shared by scan-accounts.mjs and scan-screens.mjs: the flow scenario (scenarios-<flow>.json), sign-in
// of the test accounts (sdd.config.json: accounts + auth), setup and cleanup steps, variable
// replacement and the API call. Format in reference/files.md.
import fs from 'node:fs';
import path from 'node:path';

const DAY = 864e5;

export function loadScenario(project, dir, args) {
  const file = typeof args.scenario === 'string' ? path.resolve(args.scenario) : path.join(dir, `scenarios-${args.flow}.json`);
  if (!fs.existsSync(file)) throw new Error(`Scenario not found: ${file}. Pass --scenario or --flow.`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!project.env.backendUrl) throw new Error('No backendUrl in the environment of sdd.config.json.');
  const roles = project.accounts.roles ?? {};
  const wanted = data.accounts ?? Object.keys(roles);
  const accounts = Array.isArray(wanted)
    ? Object.fromEntries(wanted.map((name) => [name, roles[name]]))
    : wanted;
  const missing = Object.entries(accounts).filter(([, email]) => !email).map(([name]) => name);
  if (missing.length) throw new Error(`Accounts not in accounts.roles of sdd.config.json: ${missing.join(', ')}`);
  return {
    ...data,
    file,
    accounts,
    api: project.env.backendUrl,
    web: project.env.frontendUrl,
    nullId: data.nullId ?? '00000000-0000-4000-8000-000000000000',
  };
}

export function testPassword(project, args) {
  if (typeof args.password === 'string') return args.password;
  const value = process.env[project.accounts.passwordEnv];
  if (value) return value;
  throw new Error(`No test password: pass --password or set ${project.accounts.passwordEnv}.`);
}

export const pick = (object, dotPath) => dotPath.split('.').reduce((o, k) => (o == null ? undefined : o[k]), object);

export async function call(project, token, method, routePath, body) {
  const start = Date.now();
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `${project.auth.headerScheme} ${token}`.trim();
  let response;
  try {
    response = await fetch(project.env.backendUrl + routePath, {
      method,
      headers,
      body: body === undefined || body === null ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    return { status: 0, json: null, text: `no response: ${error.message}`, ms: Date.now() - start };
  }
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: response.status, json, text, ms: Date.now() - start, headers: response.headers };
}

/** Signs in with every account of the scenario and returns name → token; `anonymous` is always null. */
export async function signIn(project, scenario, args) {
  const tokens = { anonymous: null };
  const accounts = Object.entries(scenario.accounts);
  if (!accounts.length) return tokens;
  const password = testPassword(project, args);
  const failures = [];
  for (const [name, email] of accounts) {
    // The account value is the login identifier (e-mail or username): {email}, {login} and {username} all take it.
    const body = replace(project.auth.loginBody, { email, login: email, username: email, password });
    const r = await call(project, null, 'POST', project.auth.loginPath, body);
    tokens[name] = pick(r.json, project.auth.tokenPath) ?? null;
    if (!tokens[name]) failures.push(`${name} (${r.status})`);
  }
  // A report produced with an account that did not sign in, or with the API down, is garbage that looks like a result.
  if (failures.length) {
    throw new Error(`Aborted: account(s) that did not sign in: ${failures.join(', ')}. Is the API up and the password right?`);
  }
  return tokens;
}

/** `{name}` → variable; `{inDays:40}` and `{daysAgo:3}` → ISO dates; `{null}` → nonexistent id. Walks objects and arrays. */
export function replace(value, vars) {
  if (typeof value === 'string') {
    return value.replace(/\{(\w+)(?::(-?\d+(?:\.\d+)?))?\}/g, (match, name, n) => {
      if (name === 'inDays') return new Date(Date.now() + Number(n) * DAY).toISOString();
      if (name === 'daysAgo') return new Date(Date.now() - Number(n) * DAY).toISOString();
      return vars[name] !== undefined ? String(vars[name]) : match;
    });
  }
  if (Array.isArray(value)) return value.map((v) => replace(v, vars));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replace(v, vars)]));
  return value;
}

/** `setup` and `cleanup` steps: { as, method, path, body?, save?: { variable: "dot.path.in.response" } }. */
export async function runSteps(project, scenario, tokens, steps = [], vars = {}) {
  const failures = [];
  // `{rand}`: unique suffix per run, for values the API requires unique (codes, e-mails).
  vars.rand ??= Math.random().toString(36).slice(2, 8).toUpperCase();
  vars.prefix ??= project.walkthrough.testDataPrefix;
  vars.null ??= scenario.nullId;
  // `fixed`: variables of data that already exists (seed), so the scenario needs no setup or cleanup.
  for (const [name, value] of Object.entries(scenario.fixed ?? {})) vars[name] ??= value;
  for (const step of steps) {
    const r = await call(project, tokens[step.as], step.method, replace(step.path, vars), replace(step.body, vars));
    if (r.status < 200 || r.status >= 300) failures.push(`${step.method} ${step.path} → ${r.status} ${r.text.slice(0, 120)}`);
    for (const [variable, where] of Object.entries(step.save ?? {})) vars[variable] = pick(r.json, where);
  }
  return { vars, failures };
}

/** A failed setup leaves variables unset ({slug} literal): better to stop than scan the wrong route. */
export async function requireSetup(project, scenario, tokens, vars, failures, args) {
  if (!failures.length || args.continue) return;
  // What the setup already created cannot stay in the database: clean before aborting.
  await runSteps(project, scenario, tokens, scenario.cleanup, vars);
  throw new Error(`Aborted: the setup failed (use --continue to ignore):\n  ${failures.join('\n  ')}`);
}
