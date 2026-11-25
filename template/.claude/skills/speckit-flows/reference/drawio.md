# `fluxos.drawio` conventions

## Process map (default)

One file per feature, generated with `layout: "horizontal"` and `flowPages: true`: **page 1 is the whole process map** (every flow, linked), read left to right, in the dark theme, that the front uses as the contract for its screens; **then one page per flow** (`R## — <jornada>`), the same shapes of that flow only, to read one journey at a time. Titles of the flow pages come from `flowTitles: [{ id, title, subtitle }]` (no frames are drawn). Both views come from the same source, so they never disagree when generated; the owner edits the full map, and the flow pages are regenerated from it. Rules (technical drawing and flowchart practice):

- **One reading direction.** The happy path of the whole feature runs left to right on row 0, flow after flow; start far left, end far right. Side journeys are bands above (negative rows) or below (positive rows), linked by their real trigger.
- **Branches spread on both sides of the main row** (the layout a project owner drew by hand and kept as the default):
  - an error hangs **straight below its decision**, on the same vertical, ~120 px under it; its caption sits **to the left of that vertical** (≈312 px wide, ending 24 px before the line), so the connector runs down clear of text;
  - the reference card ("↩ Volta para…") goes **below the error's caption**, on the same vertical, or to the side of the step it returns to;
  - an e-mail sits **straight above the action that sends it**, ~190 px over it, with its caption above; a second e-mail from the same action goes one column to the right;
  - variants may stay offset half a column above or below.
    `generate` applies these placements by itself (constants `HANG` in the script): in the source, a branch only needs an edge from the main-row step it leaves (and a `row` below or above it), and whatever follows a hanging node only needs an edge from it; `col`/`row` of those nodes are overridden. An edge with explicit `ports` opts out.
- **Straight connectors.** Shapes of a row share one centre line (not one top), so the main path is a straight line across shapes of different heights. Every connector leaves and enters through the **middle of a side** — never a corner or an offset point. When a branch has to go down from a shape that has a caption below, that caption moves to the right of the vertical; a second branch of the same step puts its caption on the right; a connector coming back up into a step enters from below and moves that step's caption to the right. A caption that would land on a neighbouring branch switches sides.
  Connectors use draw.io's default style (orthogonal, square corners).
- **Captions breathe.** A blank line between list items and before a section that follows a long block (`Campos:`, `Botões:`, `Leva:`).
- **Condense.** Checks in a row that lead to the same place are one decision; their failures are one error whose caption lists each case with its message.
- **Text outside the shape.** The shape carries the actor tag and a short title (2–3 lines); the detail is a caption next to it — below, or above for shapes in the upper rows — with short lines broken at phrase boundaries and labelled (`Campos:`, `Mensagem:`, `Botões:`, `Regra:`). The caption is indented so a connector can run along its left margin.
- **No connector crosses a shape or a caption**, and no shape overlaps another. Going back to an earlier step is a reference card, not a line; a return line through a channel (`route`) is only for a short, obvious loop.
- **Colour only with meaning**, no key on the page: kind of shape (start/end green, screen blue, action grey, decision purple, error red, variant orange, e-mail teal, reference grey) and kind of line (happy path, to an error, e-mail, variant, link between flows).
- **No zone frames.** The flow id in each node id (`R##-…`) is what groups it; a flow in the validator is the set of nodes whose id starts with `R##-`. Ids of reference cards: `R##-G01`…

Source, per node: `id`, `kind`, `actor`, `title` (short), `caption` (detail), `col` (may be fractional), `row` (may be negative), `captionSide` (`above` for the upper rows). Per edge: `from`, `to`, `label`, and optionally `route: { channel, side }` (return line through a channel; `channel` is a row with a fraction, e.g. `1.9` = 90% down row 1; `side: "over"` for a channel above), `kind` (`link`, `ret`…) or `ports` (raw draw.io ports, for odd cases). Per page: `title`, `subtitle`, `zones: [{ id, title, subtitle }]`.

In the file, a caption is `<object role="caption" of="<node id>">` and is read back as part of its node's text; title, key and zone frames are `role="decor"` and are not nodes. `text`, `diff` and `validate` keep working on both layouts.

## Lane layout (older files)

One file per feature, **one page per flow** (`R## — <Jornada>`) and a `Visão geral` page. The script reads any `.drawio` (compressed or not), but the generated file is **uncompressed**, so the git history stays readable — in draw.io, keep _File › Properties › Compressed_ unchecked.

Labels are generated content: **pt-BR**. Kinds, ids and attribute names are tooling: English.

## Lanes

Vertical columns (`swimlane`), one per acting role, in the order they enter the flow, plus `Sistema` (what the backend does on its own) and `E-mail` when something is sent. A node belongs to the lane it is drawn in.

## Node kinds

The kind lives in the node's `kind` attribute (_Edit Data_ in draw.io). A node without `kind` gets its kind inferred from shape and color — so, to add a node, **copy a node of the same kind** instead of taking a shape from the palette. Files created before the English tooling used a `tipo` attribute with Portuguese values; the script still reads them.

| `kind`     | Shape and color             | What goes in the label (pt-BR)                                                                   |
| ---------- | --------------------------- | ------------------------------------------------------------------------------------------------ |
| `start`    | green ellipse               | the trigger: "Aluno abre Cursos › detalhe do curso"                                              |
| `end`      | green ellipse, thick border | the observable result: "Inscrição confirmada"                                                    |
| `screen`   | blue rectangle              | the screen that opens, with the name shown on it                                                 |
| `input`    | yellow parallelogram        | the input: **field** · required? · rule (format, size, origin)                                   |
| `action`   | grey rounded rectangle      | who does what: "[Inscrever-se]" (button, with the on-screen text) or "Sistema grava a inscrição" |
| `decision` | purple rhombus              | the question: "Ainda há vaga?" — **every exit labeled**                                          |
| `error`    | red rectangle               | `E#` and the exact message: "E1 · As vagas deste curso acabaram."                                |
| `variant`  | dashed orange rectangle     | an alternative path that is not an error (the ✎ of the script)                                   |
| `external` | dashed document             | effect outside the screen: e-mail (to whom, with what), notice to another role                   |
| `note`     | note                        | a rule that does not fit a box, linked to the node it applies to                                 |

Edges to or from an `external` node are dashed (it happens elsewhere — the `─ ─ ─►` of the script).

## Ids

The id is what ties drawing, script and diff together. Moving, recoloring or resizing changes nothing; changing the id means removing a node and creating another.

| Id                              | Is                                            |
| ------------------------------- | --------------------------------------------- |
| `R##-INI`, `R##-FIM` (`-FIM2`…) | start and ends                                |
| `R##-P01`…                      | happy-path step — the `①` of the script       |
| `R##-E01`…                      | error — the `E1` of the script's stress table |
| `R##-I01`…                      | input that is not a step                      |
| `R##-A01`…                      | action that is not a step                     |
| `R##-D01`…                      | decision                                      |
| `R##-V01`…                      | variant                                       |
| `R##-X01`…                      | external effect                               |
| `R##-N01`…                      | note                                          |
| `R##-L001`…                     | edge (generated; no need to keep)             |

A node drawn by hand in draw.io gets a random id; `diff` flags it as "(no flow id)" and `/speckit-flows sync` replaces it with the convention id.

## Source for `generate`

Used only to create the file (the draw.io becomes the source afterwards). `row` and `column` place the node inside its lane (row 1 at the top; column 0 on the left, 1 and 2 to the right for error and variant branches). Without `row`, the node goes one row below the previous one.

```json
{
  "pages": [
    {
      "id": "visao-geral",
      "name": "Visão geral",
      "lanes": ["Fluxos"],
      "nodes": [
        { "id": "R01", "kind": "action", "text": "R01 · Inscrever-se num curso" },
        { "id": "R02", "kind": "action", "text": "R02 · Acompanhar as inscrições" }
      ],
      "edges": [{ "from": "R01", "to": "R02", "label": "inscrição confirmada" }]
    },
    {
      "id": "R01",
      "name": "Inscrever-se num curso",
      "lanes": ["Aluno", "Sistema", "E-mail"],
      "nodes": [
        {
          "id": "R01-INI",
          "kind": "start",
          "text": "Aluno abre\nCursos › detalhe do curso",
          "lane": "Aluno",
          "row": 1
        },
        {
          "id": "R01-P01",
          "kind": "input",
          "text": "Turma · obrigatória\numa das turmas abertas",
          "lane": "Aluno",
          "row": 2
        },
        { "id": "R01-P02", "kind": "action", "text": "[Inscrever-se]", "lane": "Aluno", "row": 3 },
        { "id": "R01-D01", "kind": "decision", "text": "Ainda há vaga?", "lane": "Sistema", "row": 3 },
        {
          "id": "R01-E01",
          "kind": "error",
          "text": "E1 · As vagas deste curso acabaram.",
          "lane": "Sistema",
          "row": 3,
          "column": 1
        },
        {
          "id": "R01-A01",
          "kind": "action",
          "text": "Sistema grava a inscrição\ne reserva a vaga",
          "lane": "Sistema",
          "row": 4
        },
        {
          "id": "R01-X01",
          "kind": "external",
          "text": "E-mail ao aluno:\ninscrição confirmada",
          "lane": "E-mail",
          "row": 4
        },
        { "id": "R01-FIM", "kind": "end", "text": "Inscrição confirmada", "lane": "Sistema", "row": 5 }
      ],
      "edges": [
        { "from": "R01-INI", "to": "R01-P01" },
        { "from": "R01-P01", "to": "R01-P02" },
        { "from": "R01-P02", "to": "R01-D01" },
        { "from": "R01-D01", "to": "R01-E01", "label": "Sim" },
        { "from": "R01-D01", "to": "R01-A01", "label": "Não" },
        { "from": "R01-A01", "to": "R01-X01" },
        { "from": "R01-A01", "to": "R01-FIM" }
      ]
    }
  ]
}
```

The `visao-geral` page is not checked against a script (only `R##` pages are).
