# R##. <Jornada>

<!--
  Template for /speckit-flows. Copy to roteiros/R##-<name>.md, delete this comment and the "How to fill in" section.
  The generated script is written in the project language (`project.locale`; this template is pt-BR); keep the section titles below as they are ("Caminho feliz" and "Estresse"
  are read by the validate command).
-->

> Página no draw.io: `R## — <Jornada>` em [`../fluxos.drawio`](../fluxos.drawio). Cada passo `①` é o nó `R##-P01`; cada `E#` é o nó `R##-E01`.

**Quem:** <papéis, na ordem em que agem>. **Onde:** <telas do front e rotas do back>.
**Para quê:** <o objetivo de quem usa, em uma frase>.
**Histórias e requisitos:** <US# e FR-### da spec que este fluxo cobre>.

**Antes de testar**

| Preciso de           | Como                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------- |
| <conta/estado>       | <conta de `accounts.roles` (sdd.config.json), ou "criar na hora com o prefixo `walkthrough.testDataPrefix`"> |
| Ver o e-mail enviado | <onde o e-mail aparece no ambiente local; o único endereço real permitido é o de teste> |

**O fluxo, passo a passo**

```text
 ① <primeiro passo>
        ▼
 ② <ação> ─► [Botão]
        │   ╲ ✗ CASO DE ERRO ......... "<a frase que deve aparecer>"            (E1)
        │    ╲ ✎ VARIAÇÃO ............ <o que muda, sem ser erro>
        ▼
 ③ <resultado> ─ ─ ─► <acontece fora: e-mail, outro papel, outra tela>
```

| Símbolo  | Significa                                                        |
| -------- | ---------------------------------------------------------------- |
| `① ② ③`  | passo do caminho feliz, mesmo número da tabela e do nó `R##-P##` |
| `✗ NOME` | ramo de falha; termina com `(E#)` e é o nó `R##-E##`             |
| `✎ NOME` | variação que não é erro                                          |
| `─ ─ ─►` | acontece em outro lugar                                          |

**Caminho feliz** (faça na ordem)

| Passo | Faça | Esperado | Situação |
| ----- | ---- | -------- | -------- |
| ①     |      |          | ⏳       |

**Estresse**

| #   | Passo | Faça | Esperado | Situação |
| --- | ----- | ---- | -------- | -------- |
| E1  | ②     |      |          | ⏳       |

**Acesso** (bloco fixo, por URL direta e pela rota)

| #   | Como                                         | Esperado                                               | Situação |
| --- | -------------------------------------------- | ------------------------------------------------------ | -------- |
| X1  | Sem login                                    | Vai ao login; nenhum dado na tela; a rota responde 401 | ⏳       |
| X2  | Papel sem permissão                          | "Página não encontrada"; a rota recusa                 | ⏳       |
| X3  | Papel certo, dado de outra pessoa ou equipe  | "Página não encontrada"; a rota trata como inexistente | ⏳       |
| X4  | <outro papel do domínio>                     | Só o que a permissão dele cobre                        | ⏳       |

**Visual** (janela larga e 390 px, com nome e razão social longos e lista com mais de uma página)

| Tela | Visibilidade | Redundância | Padrão | 390 px |
| ---- | ------------ | ----------- | ------ | ------ |
|      | ⏳           | ⏳          | ⏳     | ⏳     |

**Ausências** (o que a tela **deveria** ter e não tem — olhar de fora para dentro)

| Tela / entidade | Deveria existir                                      | Existe? | Se não existe          |
| --------------- | ---------------------------------------------------- | ------- | ---------------------- |
|                 | editar                                               | ⏳      | achado ou reformulação |
|                 | excluir / cancelar / desativar                       | ⏳      |                        |
|                 | desfazer / voltar atrás                              | ⏳      |                        |
|                 | caminho de saída em estado de erro e em estado vazio | ⏳      |                        |

**CRUD coberto**

| Entidade | Criar | Ler | Editar | Excluir / cancelar | Observação |
| -------- | ----- | --- | ------ | ------------------ | ---------- |
|          |       |     |        |                    |            |

**Situação do R##**

| Eixo   | Resultado | Quais |
| ------ | --------- | ----- |
| Função | ⏳        |       |
| Acesso | ⏳        |       |
| Visual | ⏳        |       |

---

### Notas de rodapé (origem no código, fora do corpo do passo)

- <E#: arquivo e função que produzem a mensagem — preenchido na passagem>

---

## How to fill in (delete afterwards)

- **Written in the plan, executed in the walkthrough.** In `/speckit-plan` the script is born with the "Esperado"
  the spec promises and everything ⏳. In the walkthrough (`flow-walkthrough` skill) each row gets status, date and evidence.
- **The script and the draw.io are the same flow.** The ASCII drawing is the summary; the draw.io has the detail
  (every input, every system action, every decision). Change one, change the other — `/speckit-flows` checks it.
- **The battery checks absence, not only what was built.** A missing edit, delete, cancel, undo or exit path is a
  finding just like a broken button.
- One verifiable result per row. For an error, **the exact message the user sees** — never "should fail".
- Every `✗` in the drawing has an `E#`; every `E#` points to a step.
- No endpoint, table, component or file names in the step body — those go to the footnotes.
- Content in the project language, using the words on the screen (if the button says "Validar", the case says "Validar").
- Status: `✅ ⚠️ ❌ ⏳ 🔒 ⛔ 🚫`. `🔒` (code reading only), `⛔` (blocked by the environment) and `🚫` (out by the
  owner's decision) need a justification on the row and never become ✅ by another route.
