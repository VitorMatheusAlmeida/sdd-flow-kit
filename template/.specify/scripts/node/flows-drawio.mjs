#!/usr/bin/env node
// Feature flowchart in draw.io: generate, read, list changes and check against the walkthrough scripts.
// The script only reads and lists; judging whether a change is valid is the agent's job (speckit-flows skill).
// No dependencies besides git (node:fs, node:path, node:zlib, node:child_process).
//
//   node flows-drawio.mjs generate <source.json> <fluxos.drawio>
//   node flows-drawio.mjs text     <fluxos.drawio>
//   node flows-drawio.mjs diff     <fluxos.drawio> [<git-ref> | <before.drawio>]   default: the last commit (HEAD)
//   node flows-drawio.mjs validate <fluxos.drawio> <roteiros-dir>
//
// Conventions (kinds, ids, lanes): .claude/skills/speckit-flows/reference/drawio.md

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const KINDS = ['start', 'end', 'screen', 'input', 'action', 'decision', 'error', 'variant', 'external', 'note'];

// Files generated before the English tooling used Portuguese kind names.
const LEGACY_KINDS = {
  inicio: 'start', fim: 'end', tela: 'screen', entrada: 'input', acao: 'action',
  decisao: 'decision', erro: 'error', variacao: 'variant', externo: 'external', nota: 'note',
};

const STYLE = {
  start: 'ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;',
  end: 'ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;strokeWidth=2;',
  screen: 'rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;',
  input: 'shape=parallelogram;perimeter=parallelogramPerimeter;whiteSpace=wrap;html=1;fixedSize=1;fillColor=#fff2cc;strokeColor=#d6b656;',
  action: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;',
  decision: 'rhombus;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;',
  error: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;',
  variant: 'rounded=1;whiteSpace=wrap;html=1;dashed=1;fillColor=#ffe6cc;strokeColor=#d79b00;',
  external: 'shape=document;whiteSpace=wrap;html=1;boundedLbl=1;dashed=1;fillColor=#ffffff;strokeColor=#666666;',
  note: 'shape=note;whiteSpace=wrap;html=1;size=14;fillColor=#ffffff;strokeColor=#999999;align=left;spacingLeft=6;',
};
const SIZE = {
  start: [170, 50], end: [170, 50], decision: [190, 100], input: [210, 70],
  screen: [210, 60], action: [210, 60], error: [210, 70], variant: [210, 60], external: [210, 70], note: [210, 80],
};
const LANE_STYLE = 'swimlane;startSize=30;html=1;fillColor=#f9f9f9;strokeColor=#999999;fontStyle=1;';
const EDGE_STYLE = 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;endFill=1;';
const EXTERNAL_EDGE_STYLE = `${EDGE_STYLE}dashed=1;`;

const COLUMN_WIDTH = 250;
const ROW_HEIGHT = 130;
const LANE_HEADER = 50;

// ───────────── helpers ─────────────

const fail = (message) => {
  console.error(message);
  process.exit(2);
};
const escapeXml = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unescapeXml = (value) =>
  String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
// With html=1, the attribute value is escaped HTML. Back to plain text, keeping line breaks.
const labelToText = (value) => {
  const html = unescapeXml(value ?? '');
  return unescapeXml(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(div|p|li)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
};
const textToLabel = (text) => escapeXml(String(text).split('\n').map(escapeXml).join('<br>'));
const slugify = (value) =>
  String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const parseAttributes = (source) => {
  const attributes = {};
  for (const match of source.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) attributes[match[1]] = match[2];
  return attributes;
};
const isFlowId = (id) => /^R\d{2}(-|$)/.test(id);
const oneLine = (text) => text.replace(/\n/g, ' / ');

// ───────────── generate ─────────────

function generate(sourceFile, outputFile) {
  const source = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  if (!Array.isArray(source.pages) || source.pages.length === 0) fail('source has no "pages"');
  const pages = source.pages.map(renderPage).join('\n');
  fs.writeFileSync(outputFile, `<mxfile host="speckit-flows" agent="flows-drawio.mjs" version="24.0.0">\n${pages}\n</mxfile>\n`);
  console.log(`generated ${outputFile} (${source.pages.length} page(s))`);
}

function assertPageIsConsistent(page) {
  if (!page.id || !page.name) fail('page without "id" or "name"');
  const ids = new Set();
  for (const node of page.nodes ?? []) {
    if (!node.id) fail(`${page.id}: node without id`);
    if (ids.has(node.id)) fail(`${page.id}: duplicated id ${node.id}`);
    ids.add(node.id);
    if (!KINDS.includes(node.kind)) fail(`${node.id}: kind "${node.kind}" is not one of ${KINDS.join(', ')}`);
  }
  for (const edge of page.edges ?? []) {
    if (!ids.has(edge.from)) fail(`${page.id}: edge from unknown node ${edge.from}`);
    if (!ids.has(edge.to)) fail(`${page.id}: edge to unknown node ${edge.to}`);
  }
}

function renderPage(page) {
  assertPageIsConsistent(page);
  const nodes = page.nodes ?? [];
  const lanes = page.lanes?.length ? page.lanes : [...new Set(nodes.map((node) => node.lane ?? 'Fluxo'))];
  let lastRow = 0;
  for (const node of nodes) {
    node.lane = node.lane ?? lanes[0];
    if (!lanes.includes(node.lane)) fail(`${node.id}: lane "${node.lane}" is not in "lanes"`);
    node.row = node.row ?? lastRow + 1;
    lastRow = Math.max(lastRow, node.row);
    node.column = node.column ?? 0;
  }
  const rowCount = Math.max(1, ...nodes.map((node) => node.row));
  const laneHeight = LANE_HEADER + rowCount * ROW_HEIGHT + 30;

  const cells = ['<mxCell id="0" />', '<mxCell id="1" parent="0" />'];
  let laneX = 0;
  for (const lane of lanes) {
    const laneNodes = nodes.filter((node) => node.lane === lane);
    const columnCount = Math.max(1, ...laneNodes.map((node) => node.column + 1));
    const laneWidth = 30 + columnCount * COLUMN_WIDTH;
    const laneId = `${page.id}-lane-${slugify(lane)}`;
    cells.push(
      `<mxCell id="${laneId}" value="${textToLabel(lane)}" style="${LANE_STYLE}" vertex="1" parent="1">` +
        `<mxGeometry x="${laneX}" y="0" width="${laneWidth}" height="${laneHeight}" as="geometry" /></mxCell>`,
    );
    for (const node of laneNodes) {
      const [width, height] = SIZE[node.kind];
      const x = 15 + node.column * COLUMN_WIDTH + (COLUMN_WIDTH - 20 - width) / 2;
      const y = LANE_HEADER + (node.row - 1) * ROW_HEIGHT + (ROW_HEIGHT - 20 - height) / 2;
      cells.push(
        `<object id="${escapeXml(node.id)}" label="${textToLabel(node.text ?? '')}" kind="${node.kind}">` +
          `<mxCell style="${STYLE[node.kind]}" vertex="1" parent="${laneId}">` +
          `<mxGeometry x="${Math.round(x)}" y="${Math.round(y)}" width="${width}" height="${height}" as="geometry" /></mxCell></object>`,
      );
    }
    laneX += laneWidth;
  }
  const kindById = new Map(nodes.map((node) => [node.id, node.kind]));
  (page.edges ?? []).forEach((edge, index) => {
    const isExternal = kindById.get(edge.to) === 'external' || kindById.get(edge.from) === 'external';
    cells.push(
      `<mxCell id="${page.id}-L${String(index + 1).padStart(3, '0')}" value="${textToLabel(edge.label ?? '')}" ` +
        `style="${isExternal ? EXTERNAL_EDGE_STYLE : EDGE_STYLE}" edge="1" parent="1" source="${escapeXml(edge.from)}" target="${escapeXml(edge.to)}">` +
        '<mxGeometry relative="1" as="geometry" /></mxCell>',
    );
  });

  return (
    `  <diagram id="${escapeXml(page.id)}" name="${escapeXml(`${page.id} — ${page.name}`)}">\n` +
    '    <mxGraphModel grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" math="0" shadow="0">\n' +
    `      <root>\n        ${cells.join('\n        ')}\n      </root>\n    </mxGraphModel>\n  </diagram>`
  );
}

// ───────────── read ─────────────

const readDrawio = (file) => parseDrawio(fs.readFileSync(file, 'utf8'));

function parseDrawio(xml) {
  const pages = [];
  for (const diagram of xml.matchAll(/<diagram\b([^>]*)>([\s\S]*?)<\/diagram>/g)) {
    const attributes = parseAttributes(diagram[1]);
    let model = diagram[2].trim();
    if (!model.includes('<mxGraphModel')) {
      // Compressed page: base64 → raw deflate → URI encoded.
      model = decodeURIComponent(zlib.inflateRawSync(Buffer.from(model, 'base64')).toString('utf8'));
    }
    pages.push(readPage(unescapeXml(attributes.name ?? attributes.id ?? '?'), attributes.id ?? attributes.name, model));
  }
  return pages;
}

function inferKind(style) {
  const value = style ?? '';
  if (/^swimlane|;swimlane/.test(value)) return 'lane';
  if (/rhombus/.test(value)) return 'decision';
  if (/parallelogram/.test(value)) return 'input';
  if (/shape=document/.test(value)) return 'external';
  if (/shape=note/.test(value)) return 'note';
  if (/ellipse/.test(value)) return /strokeWidth=2/.test(value) ? 'end' : 'start';
  if (/fillColor=#f8cecc/i.test(value)) return 'error';
  if (/fillColor=#ffe6cc/i.test(value)) return 'variant';
  if (/fillColor=#dae8fc/i.test(value)) return 'screen';
  if (/edgeLabel/.test(value)) return 'edge-label';
  if (/^text;|;text;/.test(value)) return 'text';
  return 'action';
}

function readPage(name, id, model) {
  const cells = new Map();
  let wrapper = null;
  for (const tag of model.matchAll(/<(\/?)(object|UserObject|mxCell)\b([^>]*?)(\/?)>/g)) {
    const [, isClosing, tagName, body, isSelfClosing] = tag;
    if (tagName !== 'mxCell') {
      wrapper = isClosing || isSelfClosing ? null : parseAttributes(body);
      continue;
    }
    if (isClosing) continue;
    const attributes = parseAttributes(body);
    const cellId = wrapper?.id ?? attributes.id;
    const declaredKind = wrapper?.kind ?? wrapper?.tipo;
    cells.set(cellId, {
      id: cellId,
      label: labelToText(wrapper?.label ?? attributes.value ?? ''),
      declaredKind: LEGACY_KINDS[declaredKind] ?? declaredKind,
      style: attributes.style ?? '',
      isVertex: attributes.vertex === '1',
      isEdge: attributes.edge === '1',
      parent: attributes.parent,
      source: attributes.source,
      target: attributes.target,
    });
  }

  const laneOf = (cell) => {
    let current = cells.get(cell.parent);
    while (current) {
      if (inferKind(current.style) === 'lane') return current.label || current.id;
      current = cells.get(current.parent);
    }
    return '';
  };

  // An edge label may live in a vertex whose parent is the edge (edgeLabel).
  const extraEdgeLabels = new Map();
  for (const cell of cells.values()) {
    const parent = cells.get(cell.parent);
    if (cell.isVertex && parent?.isEdge && cell.label) {
      extraEdgeLabels.set(parent.id, [extraEdgeLabels.get(parent.id), cell.label].filter(Boolean).join(' '));
    }
  }

  const nodes = [];
  for (const cell of cells.values()) {
    if (!cell.isVertex || cells.get(cell.parent)?.isEdge) continue;
    const kind = cell.declaredKind ?? inferKind(cell.style);
    if (kind === 'lane') continue;
    if (kind === 'text' && !cell.label) continue;
    nodes.push({ id: cell.id, kind, text: cell.label, lane: laneOf(cell) });
  }
  const edges = [];
  for (const cell of cells.values()) {
    if (!cell.isEdge) continue;
    edges.push({
      from: cell.source ?? '(loose)',
      to: cell.target ?? '(loose)',
      label: [cell.label, extraEdgeLabels.get(cell.id)].filter(Boolean).join(' '),
    });
  }
  nodes.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  edges.sort((a, b) => `${a.from}>${a.to}`.localeCompare(`${b.from}>${b.to}`, 'en', { numeric: true }));
  const lanes = [...cells.values()].filter((cell) => cell.isVertex && inferKind(cell.style) === 'lane').map((cell) => cell.label || cell.id);
  return { id, name, lanes, nodes, edges };
}

// ───────────── text ─────────────

function printText(file) {
  for (const page of readDrawio(file)) {
    console.log(`## ${page.name}\n`);
    const nodesByLane = new Map(page.lanes.map((lane) => [lane, []]));
    for (const node of page.nodes) nodesByLane.set(node.lane, [...(nodesByLane.get(node.lane) ?? []), node]);
    for (const [lane, nodes] of nodesByLane) {
      if (nodes.length === 0) continue;
      console.log(`### ${lane || '(outside any lane)'}`);
      for (const node of nodes) {
        console.log(`- [${node.kind}] ${node.id}${isFlowId(node.id) ? '' : ' (no flow id)'}: ${oneLine(node.text) || '(no text)'}`);
      }
      console.log('');
    }
    console.log('### Edges');
    for (const edge of page.edges) console.log(`- ${edge.from} → ${edge.to}${edge.label ? ` [${edge.label}]` : ''}`);
    console.log('');
  }
}

// ───────────── diff ─────────────

// The base is git: the change history lives in the commits, not in copies of the file.
function readBaseVersion(file, baseArgument) {
  if (baseArgument && fs.existsSync(baseArgument)) return { label: baseArgument, pages: readDrawio(baseArgument) };
  const ref = baseArgument ?? 'HEAD';
  const folder = path.dirname(path.resolve(file));
  const name = path.basename(file);
  const git = (args) =>
    execFileSync('git', args, { encoding: 'utf8', cwd: folder, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  try {
    git(['rev-parse', '--is-inside-work-tree']);
  } catch {
    return fail(`${file} is not inside a git repository: pass the previous version as a second file`);
  }
  try {
    // "<ref>:./<name>" is resolved by git relative to the file's own folder, whatever the drive path looks like.
    return { label: `${name} at ${ref}`, pages: parseDrawio(git(['show', `${ref}:./${name}`])) };
  } catch {
    return fail(`${name} is not in git at "${ref}": commit the generated file first, so there is a base to compare with`);
  }
}

const edgeKey = (edge) => `${edge.from} → ${edge.to}`;
const groupEdgeLabels = (edges) => {
  const groups = new Map();
  for (const edge of edges) groups.set(edgeKey(edge), [...(groups.get(edgeKey(edge)) ?? []), edge.label]);
  return groups;
};
const formatLabels = (labels) => (labels.filter(Boolean).length ? ` [${labels.filter(Boolean).join(' | ')}]` : '');

function diffPage(before, after) {
  const lines = [];
  if (before.name !== after.name) lines.push(`~ page renamed: "${before.name}" → "${after.name}"`);
  const nodesBefore = new Map(before.nodes.map((node) => [node.id, node]));
  const nodesAfter = new Map(after.nodes.map((node) => [node.id, node]));
  for (const [id, node] of nodesAfter) {
    if (!nodesBefore.has(id)) {
      lines.push(`+ node [${node.kind}] ${id}${isFlowId(id) ? '' : ' (no flow id)'} in "${node.lane}": ${oneLine(node.text)}`);
    }
  }
  for (const [id, node] of nodesBefore) if (!nodesAfter.has(id)) lines.push(`- node [${node.kind}] ${id}: ${oneLine(node.text)}`);
  for (const [id, node] of nodesAfter) {
    const previous = nodesBefore.get(id);
    if (!previous) continue;
    if (previous.text !== node.text) lines.push(`~ ${id} text: "${oneLine(previous.text)}" → "${oneLine(node.text)}"`);
    if (previous.kind !== node.kind) lines.push(`~ ${id} kind: ${previous.kind} → ${node.kind}`);
    if (previous.lane !== node.lane) lines.push(`~ ${id} lane: "${previous.lane}" → "${node.lane}"`);
  }
  const edgesBefore = groupEdgeLabels(before.edges);
  const edgesAfter = groupEdgeLabels(after.edges);
  for (const [key, labels] of edgesAfter) if (!edgesBefore.has(key)) lines.push(`+ edge ${key}${formatLabels(labels)}`);
  for (const [key, labels] of edgesBefore) if (!edgesAfter.has(key)) lines.push(`- edge ${key}${formatLabels(labels)}`);
  for (const [key, labels] of edgesAfter) {
    const previous = edgesBefore.get(key);
    if (previous && [...previous].sort().join('|') !== [...labels].sort().join('|')) {
      lines.push(`~ edge ${key} label: [${previous.join(' | ')}] → [${labels.join(' | ')}]`);
    }
  }
  return lines;
}

function diff(file, baseArgument) {
  const before = readBaseVersion(file, baseArgument);
  const after = readDrawio(file);
  const pagesBefore = new Map(before.pages.map((page) => [page.id, page]));
  const pagesAfter = new Map(after.map((page) => [page.id, page]));
  const lines = [];
  for (const [id, page] of pagesAfter) if (!pagesBefore.has(id)) lines.push(`+ new page: ${page.name} (${page.nodes.length} nodes)`);
  for (const [id, page] of pagesBefore) if (!pagesAfter.has(id)) lines.push(`- removed page: ${page.name}`);
  for (const [id, page] of pagesAfter) {
    const previous = pagesBefore.get(id);
    if (!previous) continue;
    const pageLines = diffPage(previous, page);
    if (pageLines.length) lines.push(`\n## ${page.name}`, ...pageLines);
  }
  if (lines.length === 0) console.log(`no changes compared with ${before.label}`);
  else console.log(`Changes compared with ${before.label}:\n${lines.join('\n')}`);
}

// ───────────── validate against the walkthrough scripts ─────────────

const CIRCLED_DIGITS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

// Script section titles: "Caminho feliz" / "Happy path" and "Estresse" / "Stress" (the bundled template is pt-BR).
const HAPPY_PATH = /^(caminho feliz|happy path)/;
const STRESS = /^(estresse|stress)/;
function readScript(file) {
  const steps = new Set();
  const errors = new Set();
  let section = '';
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const title = line.match(/^\*\*([^*]+)\*\*/) ?? line.match(/^#{2,4}\s+(.+)/);
    if (title) section = title[1].toLowerCase();
    const firstCell = line.match(/^\|\s*([^|]+?)\s*\|/)?.[1];
    if (!firstCell) continue;
    if (HAPPY_PATH.test(section)) {
      const index = CIRCLED_DIGITS.indexOf(firstCell);
      if (index >= 0) steps.add(index + 1);
    }
    if (STRESS.test(section)) {
      const error = firstCell.match(/^E(\d+)$/);
      if (error) errors.add(Number(error[1]));
    }
  }
  return { steps, errors };
}

function validatePage(code, page, script) {
  const problems = [];
  const pad = (number) => String(number).padStart(2, '0');
  const ids = new Set(page.nodes.map((node) => node.id));
  for (const step of script.steps) {
    if (!ids.has(`${code}-P${pad(step)}`)) problems.push(`${code}: step ${CIRCLED_DIGITS[step - 1]} has no node ${code}-P${pad(step)}`);
  }
  for (const error of script.errors) {
    if (!ids.has(`${code}-E${pad(error)}`)) problems.push(`${code}: E${error} has no node ${code}-E${pad(error)}`);
  }
  for (const id of ids) {
    const step = id.match(new RegExp(`^${code}-P(\\d+)$`));
    if (step && !script.steps.has(Number(step[1]))) problems.push(`${code}: node ${id} has no happy-path step in the script`);
    const error = id.match(new RegExp(`^${code}-E(\\d+)$`));
    if (error && !script.errors.has(Number(error[1]))) problems.push(`${code}: node ${id} has no E${Number(error[1])} row in the script's stress table`);
    if (!isFlowId(id)) problems.push(`${code}: node without a flow id (${id}); rename it by convention`);
  }
  const incoming = new Set(page.edges.map((edge) => edge.to));
  const outgoing = new Set(page.edges.map((edge) => edge.from));
  for (const node of page.nodes) {
    if (node.kind === 'note') continue;
    if (node.kind !== 'start' && !incoming.has(node.id)) problems.push(`${code}: node ${node.id} has no incoming edge`);
    if (!['end', 'error', 'external', 'variant'].includes(node.kind) && !outgoing.has(node.id)) {
      problems.push(`${code}: node ${node.id} [${node.kind}] has no exit`);
    }
    if (node.kind === 'decision') {
      const exits = page.edges.filter((edge) => edge.from === node.id);
      if (exits.length < 2) problems.push(`${code}: decision ${node.id} has fewer than two exits`);
      if (exits.some((edge) => !edge.label)) problems.push(`${code}: decision ${node.id} has an unlabeled exit`);
    }
  }
  return problems;
}

function validate(file, scriptsDir) {
  const pages = readDrawio(file);
  const scriptFiles = fs.readdirSync(scriptsDir).filter((name) => /^R\d{2}.*\.md$/.test(name)).sort();
  const codes = new Set(scriptFiles.map((name) => name.slice(0, 3)));
  const problems = [];
  for (const scriptFile of scriptFiles) {
    const code = scriptFile.slice(0, 3);
    const page = pages.find((candidate) => candidate.id === code || candidate.name.startsWith(code));
    if (!page) {
      problems.push(`${scriptFile}: no ${code} page in the draw.io`);
      continue;
    }
    problems.push(...validatePage(code, page, readScript(path.join(scriptsDir, scriptFile))));
  }
  for (const page of pages) {
    const code = (page.id.match(/^R\d{2}/) ?? page.name.match(/^R\d{2}/))?.[0];
    if (code && !codes.has(code)) problems.push(`page ${page.name}: no ${code}-*.md script`);
  }
  if (problems.length === 0) {
    console.log(`ok: ${scriptFiles.length} script(s) match the draw.io`);
    return;
  }
  console.log(`${problems.length} divergence(s):\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
  process.exit(1);
}

// ───────────── entry ─────────────

const [command, ...args] = process.argv.slice(2);
const usage =
  'usage: flows-drawio.mjs generate <source.json> <output.drawio> | text <drawio> | diff <drawio> [<git-ref> | <before.drawio>] | validate <drawio> <roteiros-dir>';
if (command === 'generate' && args.length === 2) generate(args[0], args[1]);
else if (command === 'text' && args.length === 1) printText(args[0]);
else if (command === 'diff' && (args.length === 1 || args.length === 2)) diff(args[0], args[1]);
else if (command === 'validate' && args.length === 2) validate(args[0], args[1]);
else fail(usage);
