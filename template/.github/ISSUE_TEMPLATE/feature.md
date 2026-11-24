---
name: 📝 Story / Task
about: New feature, route, business rule or technical task
title: '[Scope] - Short description'
labels: enhancement
assignees: ''
---

## 📝 Overview

<!-- WHAT and WHY. Which problem it solves and for whom. -->

**Spec and flow:**
<!-- Link to the spec (specs/NNN-...), the flow (R##) and the walkthrough script. If none, write "Not applicable". -->

**Out of scope:**
<!-- What is NOT part of this issue, so it does not grow during development. -->

**Dependencies:**
<!-- Issues that must be done first (#123) or that depend on this one. Pair in another repository: owner/repo#000 -->

## 📐 Business rules

<!-- Domain rules, independent of implementation. One per line, numbered, to be cited in the PR and in the tests. -->

1.

## ✅ Acceptance criteria

<!-- What makes the task done, from the user's point of view. With a walkthrough script: the happy-path steps and the stress E#. -->

- [ ]

## 🛠️ Technical details

<!-- Delete what does not apply. -->

- [ ] New or changed module: <!-- which? Structure follows the `modulos-backend` skill; differences from the current module listed here -->
- [ ] New or changed route: <!-- method and path -->
- [ ] Contract used by another app changed (expand first, contract later)
- [ ] New or changed table (migration): <!-- which module owns it? -->
- [ ] Data of another module (port declared by the consumer + adapter of the owner)
- [ ] Permission (guard)
- [ ] New or changed e-mail
- [ ] New environment variable
- [ ] New scenario in the seed

### Contract

<!-- For each route: method, path, who may call it, body, response, and each error with its status and the exact sentence the user reads. -->

### Starting points

<!-- The structure reference is the `modulos-backend` skill and the code standard is `clean-code` — not the neighbouring module. -->

## 🧪 Validation

- [ ] A seed scenario exercises the case
- [ ] Unit tests cover the business rules and each error
- [ ] End-to-end tests cover the flow through the route
- [ ] Migration generated with its SQL reviewed, when the schema changes
- [ ] Walkthrough of the flow with `flow-walkthrough`, matrix complete

## ❓ Open questions

<!-- Pending decisions. Remove if none. -->
