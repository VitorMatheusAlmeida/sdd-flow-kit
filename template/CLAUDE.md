# Project instructions

This project uses **sdd-flow-kit**: spec-driven development with spec-kit, flowcharts and walkthrough scripts, table diagrams, and walkthroughs (manual test batteries with fixes) per flow. Adapt this file to the project; keep it short.

## Where project facts live

- **`sdd.config.json`** (repository root) is the single source of project setup: language, base branch, frontend and backend paths, how to run lint and tests, environments, test accounts, walkthrough decisions. Skills read it; do not hard-code its values anywhere else, and do not guess them — when a key is missing, ask.
- **`specs/<feature>/`** holds each feature: `spec.md`, `plan.md`, `tasks.md`, `fluxos.drawio`, `roteiros/`, `tabelas.planejado.dbml`, and the walkthrough folder.
- **`.specify/memory/constitution.md`** holds the project principles (`/speckit-constitution`).

## How work flows

1. `/speckit-specify` → `/speckit-clarify` (when needed) → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`.
2. `/speckit-tables` and `/speckit-flows` are optional but recommended, like `/speckit-clarify`: the hooks in `.specify/extensions.yml` suggest them after plan, tasks and implement, and before `/speckit-converge`; they run when invoked. The owner edits `fluxos.drawio` and `tabelas.planejado.dbml`; the next run judges each edit before absorbing it.
3. Each flow (`R##`) is closed by a walkthrough with the `flow-walkthrough` skill: 18 points, matrix, second round. The PR goes out only when the matrix is complete and the owner asks.

## Quality bar — before calling anything done

- **Names** reveal intent; **functions** do one thing at one level of abstraction → `clean-code`.
- **Errors**: exceptions, not error codes; `null` only from a repository read, turned into an exception right away → `clean-code`.
- **Backend structure**: flat module set (`<module>.{module,controller,service,repository}.ts` + `dto/`, `ports/`, `adapters/`), one of each per folder, `Controller → Service → Repository`, only repositories and adapters touch the database, every table has one owner, foreign data through a port → `modulos-backend`. The reference is the skill, never a neighbouring module.
- **Queries and performance**: measure first; no N+1, lean `select`, pagination, index where the query hurts; cache and queues only with measured pain → `modulos-backend`.
- **Dependencies**: the language and platform first, then the framework, then what is installed, and only then a new package (e.g. native `fetch` before `axios`) — decided at planning → `clean-code`.
- **Schema** changes are compatible forwards and backwards → `modulos-backend`.
- **Refactoring** only with tests covering the behaviour first, in small steps, never mixed with a behaviour change → `clean-code`.
- **Screens** go through the walkthrough points → `flow-walkthrough`. Reviews use `code-analyze`.

## Language

Tooling (skills `speckit-*`, scripts, templates) is in English. Generated documents (specs, plans, tasks, walkthrough scripts, matrices, diagram labels) are in `project.locale`. Code identifiers are in English.

## Rules

- No commit without the owner's explicit permission. Commit messages follow Conventional Commits: `type(scope): subject`.
- Confirm before anything hard to reverse (migrations, deletes, force pushes, publishing).
- A question asks for analysis, not an edit: change code only when asked.
- Test data uses `walkthrough.testDataPrefix`; e-mails go only to `testEmail`; never real people's data in development.
