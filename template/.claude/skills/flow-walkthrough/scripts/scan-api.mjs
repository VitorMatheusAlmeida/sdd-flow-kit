#!/usr/bin/env node
// Calls the public routes of the flow (or as a signed-in account, with --token) and looks for data
// that should not leave the API: id, e-mail, document or phone of a person, secret, internal field. Point 14.
// Usage: node scan-api.mjs --flow R01 [--token <test token>] [--env local] > <dir>/scan-api-R01.md
import { loadFlow, loadProject, parseArgs, run } from './lib/context.mjs';
import { translator } from './lib/i18n.mjs';

const SENSITIVE = ['email', 'e-mail', 'cpf', 'cnpj', 'ssn', 'document', 'phone', 'phoneNumber', 'phone_number', 'telefone',
  'password', 'passwordHash', 'password_hash', 'senha', 'token', 'secret', 'accessToken', 'refreshToken', 'bankData',
  'pixKey', 'birthDate'];
const PERSON_ID = ['userId', 'ownerId', 'authorId', 'creatorId', 'createdById', 'updatedById', 'reviewedById'];
const PERSON_OBJECT = /^(user|owner|author|creator|createdBy|updatedBy|reviewedBy|member)$/i;

const anyOf = (list) => new RegExp(`^(${list.map((k) => k.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')).join('|')})$`, 'i');

function walk(value, where, found, keys, t, parent = '') {
  if (Array.isArray(value)) {
    value.slice(0, 5).forEach((item, i) => walk(item, `${where}[${i}]`, found, keys, t, parent));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, v] of Object.entries(value)) {
    const here = `${where}.${key}`;
    if (keys.sensitive.test(key) && v !== null && v !== undefined && v !== '') found.push({ where: here, reason: t('api.personal'), value: String(v).slice(0, 40) });
    else if (keys.personId.test(key) && v) found.push({ where: here, reason: t('api.personId'), value: String(v).slice(0, 40) });
    else if (key === 'id' && PERSON_OBJECT.test(parent) && v) found.push({ where: here, reason: t('api.accountIdIn', { parent }), value: String(v).slice(0, 40) });
    walk(v, here, found, keys, t, key);
  }
}

async function main() {
  const args = parseArgs();
  const project = loadProject(args);
  const flow = loadFlow(project, args);
  const t = translator(project.locale);
  const base = project.env.backendUrl;
  if (!base) throw new Error('No backendUrl in the environment of sdd.config.json (or pass --base).');
  const keys = {
    sensitive: anyOf([...SENSITIVE, ...project.walkthrough.sensitiveKeys]),
    personId: anyOf([...PERSON_ID, ...project.walkthrough.personKeys]),
  };
  const examples = flow.examples ?? {};
  const routes = flow.publicRoutes ?? [];

  console.log(`# ${t('api.title', { flow: flow.id, base })}\n`);
  if (!routes.length) {
    console.log(t('api.noPublic'));
    return;
  }
  let total = 0;
  for (const route of routes) {
    const [method, template] = route.trim().split(/\s+/);
    const routePath = template.replace(/\{(\w+)\}/g, (_, k) => examples[k] ?? `{${k}}`);
    if (/\{\w+\}/.test(routePath)) {
      console.log(`## ${route}\n\n${t('api.missingExample', { vars: routePath.match(/\{\w+\}/g).join(', ') })}\n`);
      continue;
    }
    let body;
    let status;
    try {
      const headers = typeof args.token === 'string' ? { authorization: `${project.auth.headerScheme} ${args.token}`.trim() } : {};
      const response = await fetch(`${base}${routePath}`, { method, headers });
      status = response.status;
      body = await response.json().catch(() => null);
    } catch (error) {
      console.log(`## ${route}\n\n${t('api.failed', { error: error.message })}\n`);
      continue;
    }
    const found = [];
    walk(body, '$', found, keys, t);
    total += found.length;
    console.log(`## ${method} ${routePath} → ${status}\n`);
    if (!found.length) {
      console.log(`${t('api.nothing')}\n`);
      continue;
    }
    console.log(`${t('api.table')}\n|---|---|---|`);
    for (const f of found.slice(0, 40)) console.log(`| \`${f.where}\` | ${f.reason} | \`${f.value}\` |`);
    if (found.length > 40) console.log(`| … | +${found.length - 40} | |`);
    console.log('');
  }
  console.log(t('api.total', { n: total }));
}

run(main);
