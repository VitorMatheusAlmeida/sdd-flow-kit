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

// reference: a card that names another step ("volta para …", "segue no R08") instead of a long connector.
const KINDS = ['start', 'end', 'screen', 'input', 'action', 'decision', 'error', 'variant', 'external', 'note', 'reference'];

// Files generated before the English tooling used Portuguese kind names.
const LEGACY_KINDS = {
  inicio: 'start', fim: 'end', tela: 'screen', entrada: 'input', acao: 'action',
  decisao: 'decision', erro: 'error', variacao: 'variant', externo: 'external', nota: 'note',
};

// Every color is fixed (fill, line, text, label background, canvas): left to the default, draw.io's dark mode
// paints text and lines light over the light fills, and the diagram becomes unreadable.
const TEXT = 'fontColor=#1a1a1a;';
const STYLE = {
  start: `ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;${TEXT}`,
  end: `ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;strokeWidth=2;${TEXT}`,
  screen: `rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;${TEXT}`,
  input: `shape=parallelogram;perimeter=parallelogramPerimeter;whiteSpace=wrap;html=1;fixedSize=1;fillColor=#fff2cc;strokeColor=#d6b656;${TEXT}`,
  action: `rounded=1;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;${TEXT}`,
  decision: `rhombus;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;${TEXT}`,
  error: `rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;${TEXT}`,
  variant: `rounded=1;whiteSpace=wrap;html=1;dashed=1;fillColor=#ffe6cc;strokeColor=#d79b00;${TEXT}`,
  external: `shape=document;whiteSpace=wrap;html=1;boundedLbl=1;dashed=1;fillColor=#ffffff;strokeColor=#666666;${TEXT}`,
  note: `shape=note;whiteSpace=wrap;html=1;size=14;fillColor=#ffffff;strokeColor=#999999;align=left;spacingLeft=6;${TEXT}`,
  reference: `shape=offPageConnector;whiteSpace=wrap;html=1;size=0.25;fillColor=#eeeeee;strokeColor=#666666;${TEXT}`,
};
const SIZE = {
  start: [170, 50], end: [170, 50], decision: [190, 100], input: [210, 70],
  screen: [210, 60], action: [210, 60], error: [210, 70], variant: [210, 60], external: [210, 70], note: [210, 80], reference: [210, 70],
};
const LANE_STYLE = `swimlane;startSize=30;html=1;fillColor=#f9f9f9;strokeColor=#999999;fontStyle=1;${TEXT}`;
const EDGE_STYLE = `edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;endFill=1;strokeColor=#4d4d4d;labelBackgroundColor=#ffffff;${TEXT}`;
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
  // A process map with `flowPages: true` is followed by one page per flow (R##): the same shapes, only that flow,
  // to read one journey at a time. The full map stays the first page.
  const expanded = source.pages.flatMap((page) => (page.layout === 'horizontal' && page.flowPages ? [page, ...flowPages(page)] : [page]));
  const pages = expanded.map(renderPage).join('\n');
  fs.writeFileSync(outputFile, `<mxfile host="speckit-flows" agent="flows-drawio.mjs" version="24.0.0">\n${pages}\n</mxfile>\n`);
  console.log(`generated ${outputFile} (${expanded.length} page(s))`);
}

function flowPages(page) {
  const codes = [...new Set(page.nodes.map((node) => node.id.match(/^R\d{2}/)?.[0]).filter(Boolean))].sort();
  return codes.map((code) => {
    const nodes = page.nodes.filter((node) => node.id.startsWith(`${code}-`));
    const minCol = Math.min(...nodes.map((node) => node.col));
    const ids = new Set(nodes.map((node) => node.id));
    const zone = (page.flowTitles ?? []).find((z) => z.id === code); // titles only: no frames on the map
    return {
      id: code,
      name: `${code} — ${zone?.title ?? code}`,
      layout: 'horizontal',
      title: `${code} · ${zone?.title ?? ''}`,
      subtitle: zone?.subtitle,
      nodes: nodes.map((node) => ({ ...node, col: node.col - minCol })),
      edges: page.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)),
    };
  });
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
  if (page.layout === 'horizontal') return renderHorizontalPage(page);
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
    '    <mxGraphModel grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" math="0" shadow="0" background="#ffffff" adaptiveColors="none">\n' +
    `      <root>\n        ${cells.join('\n        ')}\n      </root>\n    </mxGraphModel>\n  </diagram>`
  );
}

// ───────────── generate: process map (one page, left to right, dark theme) ─────────────
//
// Technical-drawing rules, applied to every page with `layout: "horizontal"`:
// - one reading direction: the happy path runs left to right on its row; start on the far left, end on the far right;
// - branches leave the main row at an angle: errors and alternative tracks below (row + 1), side effects such as
//   e-mails above (row − 1), each offset 0.28 of a column to the right so the connector reads as a diagonal;
// - the shape holds only the actor tag and a short title; the detail is a caption next to the shape (below it, or
//   above it for shapes whose caption side is "above"), indented so a vertical connector can run along its left
//   margin without touching the text;
// - return lines (fix and try again, go back) run underneath (or above) through a channel, never across a shape;
// - every flow (R##) is a zone: a frame drawn behind its shapes, titled with the flow id, the journey and the actors.
// Captions and decorations are read back as part of their node (`role="caption" of="<id>"`) or ignored
// (`role="decor"`), so text, diff and validate keep working.

const DARK = { canvas: '#0d1117', text: '#e6edf3', muted: '#8b949e', caption: '#c9d1d9', zone: '#161b22', zoneLine: '#30363d' };
const DARK_KIND = {
  start: { fill: '#12301f', stroke: '#3fb950', shape: 'ellipse;' },
  end: { fill: '#12301f', stroke: '#3fb950', shape: 'ellipse;strokeWidth=3;' },
  screen: { fill: '#0f2742', stroke: '#58a6ff', shape: 'rounded=0;strokeWidth=2;' },
  input: { fill: '#33270a', stroke: '#d29922', shape: 'shape=parallelogram;perimeter=parallelogramPerimeter;fixedSize=1;size=14;' },
  action: { fill: '#21262d', stroke: '#8b949e', shape: 'rounded=1;arcSize=18;' },
  decision: { fill: '#271a3d', stroke: '#bc8cff', shape: 'rhombus;' },
  error: { fill: '#3a1214', stroke: '#f85149', shape: 'rounded=1;arcSize=18;' },
  variant: { fill: '#3a220c', stroke: '#db6d28', shape: 'rounded=1;arcSize=18;dashed=1;' },
  external: { fill: '#0b2b2e', stroke: '#39c5cf', shape: 'shape=document;boundedLbl=1;size=0.16;dashed=1;' },
  note: { fill: '#161b22', stroke: '#6e7681', shape: 'shape=note;size=14;align=left;spacingLeft=8;' },
  reference: { fill: '#1c2128', stroke: '#768390', shape: 'shape=offPageConnector;size=0.22;' },
};
const H_SIZE = {
  start: [250, 60], end: [250, 60], screen: [250, 60], input: [250, 52], action: [250, 56],
  decision: [250, 100], error: [250, 56], variant: [250, 56], external: [250, 64], note: [270, 90], reference: [250, 76],
};
const H = { columnWidth: 360, rowHeight: 390, originX: 80, originY: 360, captionIndent: 22, captionLine: 15, strip: 0.05 };
const EDGE = {
  happy: { color: '#c9d1d9', width: 2 },
  error: { color: '#f85149', width: 1.5 },
  ret: { color: '#e5534b', width: 1.2, dashed: true },
  external: { color: '#39c5cf', width: 1.5, dashed: true },
  variant: { color: '#db6d28', width: 1.5, dashed: true },
  link: { color: '#58a6ff', width: 2.5 },
};

const shapeStyle = (kind) =>
  `${DARK_KIND[kind].shape}whiteSpace=wrap;html=1;fillColor=${DARK_KIND[kind].fill};strokeColor=${DARK_KIND[kind].stroke};` +
  `fontColor=${DARK.text};fontSize=13;fontFamily=Helvetica;spacing=6;`;
const CAPTION_STYLE =
  `text;html=1;align=left;verticalAlign=top;whiteSpace=wrap;fontSize=11;fontFamily=Helvetica;fontColor=${DARK.caption};spacing=0;`;
const htmlLines = (text) => String(text).split('\n').map(escapeXml).join('<br>');
// A caption line that starts with "Label:" gets the label in bold (Campos:, Mensagem:, Regra:, Botões:…).
const captionHtml = (text) =>
  String(text)
    .split('\n')
    .map((line) => {
      const match = line.match(/^([A-Za-zÀ-ú][A-Za-zÀ-ú ]{1,24}):(\s.*)?$/);
      return match ? `<b>${escapeXml(match[1])}:</b>${escapeXml(match[2] ?? '')}` : escapeXml(line);
    })
    .join('<br>');
const shapeLabel = (actor, title) =>
  (actor ? `<span style="font-size:9px;letter-spacing:1px;color:${DARK.muted}">${escapeXml(actor.toUpperCase())}</span><br>` : '') +
  `<b>${htmlLines(title)}</b>`;
// Captions breathe: a blank line between list items, and before a "Label:" section that follows a long block.
function breathe(text) {
  const out = [];
  let block = 0;
  let bullets = 0;
  for (const line of String(text).split('\n')) {
    const isBullet = line.trim().startsWith('•');
    const isSection = /^[A-Za-zÀ-ú][A-Za-zÀ-ú ]{1,24}:(\s|$)/.test(line);
    if (out.length && out[out.length - 1] !== '' && ((isBullet && bullets >= 1) || (isSection && block >= 3))) out.push('');
    if (line.trim() === '') [block, bullets] = [0, 0];
    else if (isSection) [block, bullets] = [1, 0];
    else [block, bullets] = [block + 1, bullets + (isBullet ? 1 : 0)];
    out.push(line);
  }
  return out.join('\n');
}
const captionHeight = (caption) => breathe(caption).split('\n').length * H.captionLine + 8;
const flowOf = (id) => String(id).match(/^R\d{2}/)?.[0] ?? '';
// The layout a project owner drew by hand and kept as the default (distances in px).
const HANG = { errorGap: 123, captionGap: 17, captionWidth: 312, captionClear: 24, nextGap: 63, mailGap: 188 };

function renderHorizontalPage(page) {
  const nodes = page.nodes ?? [];
  for (const node of nodes) {
    if (!node.title) fail(`${node.id}: horizontal layout needs "title" (short) — the detail goes in "caption"`);
    if (node.col === undefined || node.row === undefined) fail(`${node.id}: horizontal layout needs "col" and "row"`);
  }
  const minRow = Math.min(0, ...nodes.map((node) => node.row));
  const rowTop = (row) => H.originY + (row - minRow) * H.rowHeight;
  const geometry = new Map();
  for (const node of nodes) {
    const [width, height] = H_SIZE[node.kind];
    const side = node.captionSide ?? 'below';
    const x = H.originX + node.col * H.columnWidth;
    // Shapes of a row share one centre line (not one top), so connectors between shapes of different heights run straight.
    const y = side === 'above' ? rowTop(node.row) + H.rowHeight - height - 40 : rowTop(node.row) + 50 - height / 2;
    const capH = node.caption ? captionHeight(node.caption) : 0;
    const capY = side === 'above' ? y - 8 - capH : y + height + 8;
    geometry.set(node.id, { x, y, width, height, side, capY, capH, row: node.row, col: node.col, kind: node.kind });
  }

  // Hanging branches, applied after the grid (the source only says which row and roughly which column):
  // - a branch that leaves a main-row step downwards hangs straight below it (one column to the right per extra
  //   branch of the same step), its caption to the left of that vertical so the connector runs down clear of text;
  //   when the step itself has a caption below, that caption moves to the right of the vertical;
  // - whatever a hanging node leads to further down hangs below its caption, on the same vertical; a next step on
  //   the same row goes one column to the right, on the same centre line;
  // - an e-mail or variant above a main-row step sits straight above it; a second one goes one column to the right
  //   and leaves from the same middle point.
  // Every connector leaves and enters through the middle of a side.
  const edgeList = page.edges ?? [];
  const hangPorts = new Map();
  const spineRow = new Map(nodes.filter((node) => node.id.endsWith('-INI')).map((node) => [flowOf(node.id), node.row]));
  const nodeRow = new Map(nodes.map((node) => [node.id, node.row]));
  const placed = new Set();
  const DOWN = 'exitX=0.5;exitY=1;entryX=0.5;entryY=0;';
  // Caption beside the vertical a branch hangs on: left by default; right for the second branch of the same step.
  const captionBesideVertical = (g, side = 'left') => {
    g.capX = side === 'left' ? g.x + g.width / 2 - HANG.captionClear - HANG.captionWidth : g.x + g.width / 2 + HANG.captionClear;
    g.capW = HANG.captionWidth;
    g.capY = g.y + g.height + HANG.captionGap;
  };
  const captionBottom = (g) => (g.capH ? g.capY + g.capH : g.y + g.height);
  // Right of the vertical, starting below the tallest shape of the row (a decision) and stopping before the next column.
  const captionRightOfVertical = (g) => {
    g.capX = g.x + g.width / 2 + HANG.captionClear;
    g.capW = H.columnWidth - g.width / 2 - HANG.captionClear - 20;
    g.capY = g.y + g.height / 2 + H_SIZE.decision[1] / 2 + 8;
  };
  const follow = (id, side) => {
    const g = geometry.get(id);
    let below = captionBottom(g);
    for (const edge of edgeList.filter((e) => e.from === id && !e.ports)) {
      const t = geometry.get(edge.to);
      if (!t || placed.has(edge.to) || flowOf(edge.from) !== flowOf(edge.to) || nodeRow.get(edge.to) === spineRow.get(flowOf(edge.to))) continue;
      placed.add(edge.to);
      t.side = 'below';
      if (nodeRow.get(edge.to) > nodeRow.get(id)) {
        Object.assign(t, { x: g.x + g.width / 2 - t.width / 2, y: below + HANG.nextGap });
        captionBesideVertical(t, side);
        below = captionBottom(t);
        hangPorts.set(edge, DOWN);
      } else {
        // Next step of a branch, on the same row: same centre line; its caption right of its vertical, so whatever
        // hangs below it goes down clear.
        Object.assign(t, { x: g.x + H.columnWidth, y: g.y + g.height / 2 - t.height / 2 });
        captionRightOfVertical(t);
        hangPorts.set(edge, 'exitX=1;exitY=0.5;entryX=0;entryY=0.5;');
      }
      follow(edge.to, side);
    }
  };
  const countBelow = new Map();
  const countAbove = new Map();
  for (const edge of edgeList) {
    const from = geometry.get(edge.from);
    const to = geometry.get(edge.to);
    if (edge.ports || !from || !to || placed.has(edge.to) || flowOf(edge.from) !== flowOf(edge.to)) continue;
    if (nodeRow.get(edge.from) !== spineRow.get(flowOf(edge.from))) continue;
    if (nodeRow.get(edge.to) > nodeRow.get(edge.from)) {
      const index = countBelow.get(edge.from) ?? 0;
      countBelow.set(edge.from, index + 1);
      let gap = HANG.errorGap;
      if (from.kind !== 'decision' && from.capH && from.capX === undefined) {
        captionRightOfVertical(from);
      }
      if (from.kind !== 'decision' && from.capH) gap = Math.max(gap, captionBottom(from) - (from.y + from.height) + 40);
      Object.assign(to, { x: from.x + from.width / 2 - to.width / 2 + index * H.columnWidth, y: from.y + from.height + gap, side: 'below' });
      const side = index === 0 ? 'left' : 'right';
      captionBesideVertical(to, side);
      hangPorts.set(edge, DOWN);
      placed.add(edge.to);
      follow(edge.to, side);
    } else if (nodeRow.get(edge.to) < nodeRow.get(edge.from) && ['external', 'variant', 'reference'].includes(to.kind)) {
      const index = countAbove.get(edge.from) ?? 0;
      countAbove.set(edge.from, index + 1);
      Object.assign(to, { x: from.x + from.width / 2 - to.width / 2 + index * H.columnWidth, y: from.y - HANG.mailGap - to.height, side: 'above' });
      to.capY = to.y - 8 - to.capH;
      to.capX = to.x + 13;
      to.capW = to.width - 13;
      hangPorts.set(edge, 'exitX=0.5;exitY=0;entryX=0.5;entryY=1;');
      placed.add(edge.to);
    }
  }
  // `captionBeside: 'left' | 'right'` in the source puts a caption beside the shape's vertical (e.g. where a connector
  // to another flow leaves straight up or down through that vertical).
  for (const node of nodes) {
    const g = geometry.get(node.id);
    if (!node.captionBeside || !g.capH) continue;
    g.capW = HANG.captionWidth;
    g.capX = node.captionBeside === 'left' ? g.x + g.width / 2 - HANG.captionClear - HANG.captionWidth : g.x + g.width / 2 + HANG.captionClear;
    if (g.side !== 'above') g.capY = g.y + g.height + HANG.captionGap;
  }
  // A caption left of its vertical that would land on a branch hanging from the previous column switches to the right.
  const box = (g) => [g.x, g.y, g.x + g.width, g.y + g.height];
  const captionBox = (g) => {
    if (!g.capH) return null;
    const x = g.capX ?? g.x + H.captionIndent;
    return [x, g.capY, x + (g.capW ?? g.width - H.captionIndent - 4), g.capY + g.capH];
  };
  const overlaps = (a, b) => a && b && a[0] < b[2] + 4 && b[0] < a[2] + 4 && a[1] < b[3] + 4 && b[1] < a[3] + 4;
  const clashes = (id, rect) =>
    [...geometry].some(([other, h]) => other !== id && (overlaps(rect, box(h)) || overlaps(rect, captionBox(h))));
  for (const [id, g] of geometry) {
    if (g.capW !== HANG.captionWidth || !clashes(id, captionBox(g))) continue;
    const right = g.x + g.width / 2 + HANG.captionClear;
    if (!clashes(id, [right, g.capY, right + g.capW, g.capY + g.capH])) g.capX = right;
  }
  // A connector that comes back up into a step enters from below; that step's caption moves to the right of the vertical.
  for (const edge of edgeList) {
    const from = geometry.get(edge.from);
    const to = geometry.get(edge.to);
    if (!from || !to || edge.ports || edge.route || hangPorts.has(edge)) continue;
    if (to.row < from.row && to.capH && to.side === 'below' && to.capX === undefined) captionRightOfVertical(to);
  }

  const cells = ['<mxCell id="0" />', '<mxCell id="1" parent="0" />'];
  const decor = (id, value, style, x, y, width, height) =>
    cells.push(
      `<object id="${page.id}-${id}" label="${escapeXml(value)}" role="decor">` +
        `<mxCell style="${style}" vertex="1" parent="1">` +
        `<mxGeometry x="${Math.round(x)}" y="${Math.round(y)}" width="${Math.round(width)}" height="${Math.round(height)}" as="geometry" /></mxCell></object>`,
    );

  // Title, subtitle and symbol key.
  decor('titulo', `<b>${htmlLines(page.title ?? page.name)}</b>`,
    `text;html=1;align=left;verticalAlign=top;whiteSpace=wrap;fontSize=26;fontColor=${DARK.text};`, H.originX, 30, 2400, 40);
  if (page.subtitle) {
    decor('subtitulo', htmlLines(page.subtitle),
      `text;html=1;align=left;verticalAlign=top;whiteSpace=wrap;fontSize=14;fontColor=${DARK.muted};`, H.originX, 76, 2400, 60);
  }
  const keyKinds = page.showKey ? ['start', 'screen', 'action', 'decision', 'error', 'variant', 'external', 'end'] : [];
  const keyNames = { start: 'início', screen: 'tela', action: 'ação', decision: 'decisão', error: 'erro', variant: 'variação', external: 'e-mail / aviso', end: 'fim' };
  keyKinds.forEach((kind, index) => {
    decor(`legenda-${kind}`, `<b>${keyNames[kind]}</b>`, `${shapeStyle(kind)}fontSize=11;`, H.originX + index * 150, 150, 130, 40);
  });
  const lineKey = !page.showKey ? [] : [
    ['happy', 'caminho feliz'], ['error', 'para um erro'], ['ret', 'volta e tenta de novo'],
    ['external', 'e-mail enviado'], ['variant', 'variação'], ['link', 'liga um fluxo a outro'],
  ];
  lineKey.forEach(([kind, name], index) => {
    const x = H.originX + index * 200;
    const { color, width, dashed } = EDGE[kind];
    cells.push(
      `<object id="${page.id}-legenda-linha-${kind}" label="" role="decor"><mxCell style="endArrow=block;endFill=1;html=1;strokeColor=${color};strokeWidth=${width};${dashed ? 'dashed=1;' : ''}" edge="1" parent="1">` +
        `<mxGeometry relative="1" as="geometry"><mxPoint x="${x}" y="230" as="sourcePoint" /><mxPoint x="${x + 60}" y="230" as="targetPoint" /></mxGeometry></mxCell></object>`,
    );
    decor(`legenda-linha-${kind}-texto`, name, `text;html=1;align=left;verticalAlign=middle;fontSize=11;fontColor=${DARK.caption};`, x + 68, 220, 130, 20);
  });

  // Zones: one frame per flow, behind its shapes and captions.
  for (const zone of page.zones ?? []) {
    const members = nodes.filter((node) => flowOf(node.id) === zone.id).map((node) => geometry.get(node.id));
    if (members.length === 0) continue;
    const left = Math.min(...members.map((g) => g.x)) - 40;
    const right = Math.max(...members.map((g) => g.x + g.width + 40)) + 40;
    const top = Math.min(...members.map((g) => Math.min(g.y, g.capH ? g.capY : g.y))) - 70;
    const bottom = Math.max(...members.map((g) => Math.max(g.y + g.height, g.capH ? g.capY + g.capH : 0))) + 40;
    decor(`zona-${zone.id}`, `<b>${escapeXml(zone.id)} · ${escapeXml(zone.title)}</b><br><span style="font-size:11px;color:${DARK.muted}">${escapeXml(zone.subtitle ?? '')}</span>`,
      `rounded=1;arcSize=2;whiteSpace=wrap;html=1;align=left;verticalAlign=top;spacingLeft=16;spacingTop=10;fontSize=16;` +
      `fillColor=${DARK.zone};strokeColor=${DARK.zoneLine};strokeWidth=1;fontColor=${DARK.text};dashed=1;dashPattern=8 6;`,
      left, top, right - left, bottom - top);
  }

  for (const node of nodes) {
    const g = geometry.get(node.id);
    const attrs = `id="${escapeXml(node.id)}" label="${escapeXml(node.kind === 'note' ? captionHtml(node.title) : shapeLabel(node.actor, node.title))}" kind="${node.kind}"` +
      (node.actor ? ` actor="${escapeXml(node.actor)}"` : '');
    const style = node.kind === 'note' ? `${shapeStyle('note')}fontSize=11;fontColor=${DARK.caption};align=left;` : shapeStyle(node.kind);
    cells.push(
      `<object ${attrs}><mxCell style="${style}" vertex="1" parent="1">` +
        `<mxGeometry x="${Math.round(g.x)}" y="${Math.round(g.y)}" width="${g.width}" height="${g.height}" as="geometry" /></mxCell></object>`,
    );
    if (node.caption) {
      cells.push(
        `<object id="${escapeXml(node.id)}-legenda" label="${escapeXml(captionHtml(breathe(node.caption)))}" role="caption" of="${escapeXml(node.id)}">` +
          `<mxCell style="${CAPTION_STYLE}" vertex="1" parent="1">` +
          `<mxGeometry x="${Math.round(g.capX ?? g.x + H.captionIndent)}" y="${Math.round(g.capY)}" width="${Math.round(g.capW ?? g.width - H.captionIndent - 4)}" height="${g.capH}" as="geometry" /></mxCell></object>`,
      );
    }
  }

  // Connectors. Ports follow the drawing; "route" sends a return line through a channel; "ports" overrides.
  const channelUse = new Map();
  (page.edges ?? []).forEach((edge, index) => {
    const from = geometry.get(edge.from);
    const to = geometry.get(edge.to);
    const sameFlow = flowOf(edge.from) === flowOf(edge.to);
    const kind = edge.kind ??
      (!sameFlow ? 'link' : edge.route ? 'ret' : to.kind === 'error' ? 'error' : to.kind === 'external' ? 'external' : to.kind === 'variant' ? 'variant' : 'happy');
    const look = EDGE[kind];
    const captionBelow = (g) => g.capH > 0 && g.side === 'below';
    const captionAbove = (g) => g.capH > 0 && g.side === 'above';
    let ports = '';
    let points = '';
    if (edge.ports) ports = edge.ports;
    else if (hangPorts.has(edge)) ports = hangPorts.get(edge);
    else if (edge.route) {
      const under = edge.route.side !== 'over';
      const key = `${edge.route.channel}`;
      const slot = channelUse.get(key) ?? 0;
      channelUse.set(key, slot + 1);
      // channel 2.9 = 90% down row 2; floor/fraction also for negative rows (−0.78 = 22% down row −1)
      const channelRow = Math.floor(edge.route.channel);
      const channelY = rowTop(channelRow) + (edge.route.channel - channelRow) * H.rowHeight + (under ? slot * 9 : -slot * 9);
      // A jump (e.g. a step skipped for some users) leaves and enters through the middle: over the top or underneath.
      const sx = from.x + from.width / 2;
      const tx = to.x + to.width / 2;
      ports = under ? 'exitX=0.5;exitY=1;entryX=0.5;entryY=1;' : 'exitX=0.5;exitY=0;entryX=0.5;entryY=0;';
      points = `<Array as="points"><mxPoint x="${Math.round(sx)}" y="${Math.round(channelY)}" /><mxPoint x="${Math.round(tx)}" y="${Math.round(channelY)}" /></Array>`;
    } else if (to.row === from.row && to.col > from.col) ports = 'exitX=1;exitY=0.5;entryX=0;entryY=0.5;';
    else if (to.row > from.row) {
      // Always through the middle of a side: down from the bottom, or sideways when a caption sits below.
      const sideways = from.kind !== 'decision' && captionBelow(from);
      const exit = sideways ? (to.x >= from.x ? 'exitX=1;exitY=0.5;' : 'exitX=0;exitY=0.5;') : 'exitX=0.5;exitY=1;';
      const entry = captionAbove(to) ? (to.x >= from.x ? 'entryX=0;entryY=0.5;' : 'entryX=1;entryY=0.5;') : 'entryX=0.5;entryY=0;';
      ports = exit + entry;
    } else if (to.row < from.row) {
      // Back up to a step (e.g. a refused request rejoining the main row): leave sideways, enter from below,
      // and if the target has a caption below, it moves to the right of the vertical.
      const exit = captionAbove(from) ? (to.x >= from.x ? 'exitX=1;exitY=0.5;' : 'exitX=0;exitY=0.5;') : to.col === from.col ? 'exitX=0.5;exitY=0;' : (to.x > from.x ? 'exitX=1;exitY=0.5;' : 'exitX=0;exitY=0.5;');
      ports = exit + 'entryX=0.5;entryY=1;';
    }
    const style =
      `edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;` +
      `strokeWidth=${look.width};strokeColor=${look.color};${look.dashed ? 'dashed=1;' : ''}${ports}` +
      `fontSize=11;fontStyle=1;fontColor=${DARK.text};labelBackgroundColor=${DARK.canvas};`;
    const labelOffset = from.kind === 'decision' ? ' x="-0.45"' : '';
    cells.push(
      `<mxCell id="${page.id}-L${String(index + 1).padStart(3, '0')}" value="${textToLabel(edge.label ?? '')}" ` +
        `style="${style}" edge="1" parent="1" source="${escapeXml(edge.from)}" target="${escapeXml(edge.to)}">` +
        `<mxGeometry${labelOffset} relative="1" as="geometry">${points}</mxGeometry></mxCell>`,
    );
  });

  return (
    `  <diagram id="${escapeXml(page.id)}" name="${escapeXml(page.name)}">\n` +
    '    <mxGraphModel grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" ' +
    `math="0" shadow="0" background="${DARK.canvas}" adaptiveColors="none">\n` +
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
  if (/fillColor=#(f8cecc|3a1214)/i.test(value)) return 'error';
  if (/fillColor=#(ffe6cc|3a220c)/i.test(value)) return 'variant';
  if (/fillColor=#(dae8fc|0f2742)/i.test(value)) return 'screen';
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
      role: wrapper?.role,
      captionOf: wrapper?.of,
      actor: wrapper?.actor,
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

  // Horizontal layout: a caption is part of its node's text; decorations (title, symbol key) are not nodes.
  const captions = new Map();
  for (const cell of cells.values()) {
    if (cell.role === 'caption' && cell.captionOf) captions.set(cell.captionOf, cell.label);
  }

  const nodes = [];
  for (const cell of cells.values()) {
    if (!cell.isVertex || cells.get(cell.parent)?.isEdge) continue;
    if (cell.role === 'decor' || cell.role === 'caption') continue;
    const kind = cell.declaredKind ?? inferKind(cell.style);
    if (kind === 'lane') continue;
    if (kind === 'text' && !cell.label) continue;
    const text = [cell.label, captions.get(cell.id)].filter(Boolean).join('\n');
    nodes.push({ id: cell.id, kind, text, lane: laneOf(cell) || cell.actor || '' });
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
    if (!['end', 'error', 'external', 'variant', 'reference'].includes(node.kind) && !outgoing.has(node.id)) {
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
    // A flow is either its own page (R## — …) or, in a single-page process map, the nodes whose id starts with R##.
    const ownPage = pages.find((candidate) => candidate.id === code || candidate.name.startsWith(code));
    const mapPage = pages.find((candidate) => candidate.nodes.some((node) => node.id.startsWith(`${code}-`)));
    const page = ownPage ?? (mapPage && {
      ...mapPage,
      nodes: mapPage.nodes.filter((node) => node.id.startsWith(`${code}-`)),
      edges: mapPage.edges.filter((edge) => edge.from.startsWith(`${code}-`) || edge.to.startsWith(`${code}-`)),
    });
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
