#!/usr/bin/env node
// Script layer of points 1, 10, 14 and 15: every call of the scenario × every account, with the whole
// response (status, code, message, body excerpt). It ADDS to the walkthrough and never replaces it: it
// does not say "passed", it dumps raw material and raises mechanical alerts for a person to read.
//
// Usage: node scan-accounts.mjs --flow R01 [--scenario <file>] [--password <test password>] > <dir>/scan-accounts-R01.md
//
// Alerts (codes; each only points where to look):
//   5xx            server error, or no response
//   foreign-2xx    an account that does NOT own the resource got a success (privacy; see `owners`)
//   off-catalog    4xx without the catalog code, or a raw framework message
//   sensitive      the body has a password, hash, document, token or secret key
//   slow           response above 2 s
// Parity (foreign × nonexistent): runs the call again with variables replaced by values that do not
// exist and compares status, code AND message; any difference reveals what exists.
import { cell, loadProject, parseArgs, run, today, walkthroughDir } from './lib/context.mjs';
import { translator } from './lib/i18n.mjs';
import { call, loadScenario, replace, requireSetup, runSteps, signIn } from './lib/scenario.mjs';

const RAW = /\b(Bad Request|Forbidden|Unauthorized|Not Found|Internal Server Error|Cannot (GET|POST|PUT|PATCH|DELETE)|Unprocessable|must be|should not be|is not valid|Validation failed)\b/i;
const SENSITIVE = /^(password|password_?hash|hash|senha|cpf|cnpj|ssn|rg|token|secret|refreshToken|access_token|accessToken)$/i;

function sensitiveKeys(value, where = '', out = []) {
  if (Array.isArray(value)) value.slice(0, 3).forEach((v, i) => sensitiveKeys(v, `${where}[${i}]`, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE.test(k) && v !== null && v !== undefined && v !== '') out.push(`${where}.${k}`.replace(/^\./, ''));
      sensitiveKeys(v, `${where}.${k}`, out);
    }
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const project = loadProject(args);
  const t = translator(project.locale);
  const scenario = loadScenario(project, walkthroughDir(project, args), args);
  const tokens = await signIn(project, scenario, args);
  const allAccounts = [...Object.keys(scenario.accounts), 'anonymous'];
  const shape = project.backend.errorShape;

  const summary = (r) => {
    const j = r.json;
    const raw = j?.[shape.message];
    return { code: j?.[shape.code] ?? '', message: String(Array.isArray(raw) ? raw.join('; ') : (raw ?? '')) };
  };
  const signature = (r) => {
    const { code, message } = summary(r);
    return `${r.status}|${code}|${message}`;
  };

  const { vars, failures: setupFailures } = await runSteps(project, scenario, tokens, scenario.setup);
  await requireSetup(project, scenario, tokens, vars, setupFailures, args);
  const perCall = [];
  const alerts = [];
  const parities = [];

  for (const c of scenario.calls ?? []) {
    const accounts = c.as ?? allAccounts;
    const owners = c.owners ?? scenario.owners ?? [];
    const rows = [];
    const responses = {};
    for (const account of accounts) {
      const r = await call(project, tokens[account], c.method, replace(c.path, vars), replace(c.body, vars));
      responses[account] = r;
      const { code, message } = summary(r);
      const flags = [];
      const ok = r.status >= 200 && r.status < 300;
      if (r.status >= 500 || r.status === 0) flags.push('5xx');
      if (!c.public && ok && (account === 'anonymous' || !owners.includes(account))) flags.push('foreign-2xx');
      // errorShape.code null: the API has no error code; only a raw message is off the catalog.
      if (r.status >= 400 && r.status < 500 && ((shape.code && !code) || RAW.test(message))) flags.push('off-catalog');
      const keys = sensitiveKeys(r.json);
      if (keys.length) flags.push(`sensitive(${keys.slice(0, 3).join(', ')})`);
      if (r.ms > 2000) flags.push('slow');
      for (const f of flags) alerts.push(`${c.name} · ${account}: ${f}`);
      rows.push(`| ${account} | ${r.status} | ${cell(code)} | ${cell(message).slice(0, 110)} | ${flags.join(' ') || '—'} | ${cell(r.text).slice(0, 160)} |`);
    }

    if (c.parity) {
      const account = c.parity.account;
      const swaps = Object.fromEntries(Object.entries(c.parity.replace ?? {}).map(([k, v]) => [k, v === '{null}' ? scenario.nullId : v]));
      const real = responses[account] ?? (await call(project, tokens[account], c.method, replace(c.path, vars), replace(c.body, vars)));
      const swapped = { ...vars, ...swaps };
      const missing = await call(project, tokens[account], c.method, replace(c.path, swapped), replace(c.body, swapped));
      const same = signature(real) === signature(missing);
      parities.push({ name: c.name, account, same, real: signature(real), missing: signature(missing) });
      if (!same) alerts.push(`${c.name} · ${account}: parity DIFFERS (foreign × nonexistent)`);
    }
    perCall.push({ c, rows });
  }

  const { failures: cleanupFailures } = await runSteps(project, scenario, tokens, scenario.cleanup, vars);

  console.log(`# ${t('acc.title', { name: scenario.name ?? scenario.file })}\n`);
  console.log(`${t('acc.meta', { api: scenario.api, accounts: allAccounts.join(', '), n: (scenario.calls ?? []).length, date: today() })}\n`);
  console.log(`${t('report.raw')}\n`);
  if (setupFailures.length) console.log(`${t('report.setupFailed')} ${setupFailures.join(' · ')}\n`);
  console.log(`## ${t('report.alerts')} (${alerts.length})\n`);
  console.log(alerts.length ? alerts.map((a) => `- ${a}`).join('\n') : t('report.noAlerts'));
  console.log(`\n## ${t('acc.parity')}\n`);
  if (!parities.length) console.log(t('acc.noParity'));
  else {
    console.log(`${t('acc.parityTable')}\n|---|---|---|---|---|`);
    for (const p of parities) console.log(`| ${cell(p.name)} | ${p.account} | ${p.same ? t('acc.same') : t('acc.differs')} | ${cell(p.real)} | ${cell(p.missing)} |`);
  }
  console.log(`\n## ${t('acc.responses')}\n`);
  for (const { c, rows } of perCall) {
    console.log(`### ${c.name}\n\n\`${c.method} ${c.path}\`\n`);
    console.log(`${t('acc.respTable')}\n|---|---|---|---|---|---|`);
    console.log(`${rows.join('\n')}\n`);
  }
  if (cleanupFailures.length) console.log(`${t('report.cleanupFailed')} ${cleanupFailures.join(' · ')}`);
}

run(main);
