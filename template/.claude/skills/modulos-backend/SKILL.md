---
name: modulos-backend
description: Use sempre que for escrever, alterar, revisar, dividir ou refatorar código de backend NestJS + Prisma — criar ou mudar rota, service, repositório, DTO, módulo ou schema; decidir layout de pastas, submódulo ou módulo irmão, dono de tabela, ports e adapters, nomes de operação e tratamento de erro. Use também para desempenho e infraestrutura do backend — consulta lenta, N+1, over-fetching, paginação, índice, medir antes de otimizar, cache com Redis e invalidação, fila e job em segundo plano (BullMQ), tarefa agendada, limite de requisições — e quando a pergunta for "que estrutura este módulo deveria ter", "onde este arquivo deveria morar" ou "está lento, o que faço?".
---

# Módulos de backend — a forma canônica

Este documento define **um arranjo único** para módulos de backend em NestJS + Prisma. Ele existe para que a resposta a "que forma este módulo deveria ter" seja sempre a mesma, independentemente do repositório aberto.

## A regra que vem antes de todas

**Nunca use código existente como modelo de estrutura** — nem outro módulo do projeto em análise, nem módulo de outro projeto. Não vale "os outros módulos fazem assim", não vale "para ficar consistente com o resto", não vale imitar o vizinho.

O motivo é prático: o código que se quer refatorar é justamente o que está fora do padrão. Usá-lo como espelho congela o problema, transforma cada refatoração numa discussão sobre "consistência", e faz o alvo se mover conforme qual arquivo foi aberto primeiro. Com um alvo fixo, divergência é **achado**, não precedente.

O modelo é esta skill, e todo exemplo dela sai de um único conjunto fictício: [`reference/gabarito.md`](reference/gabarito.md). Módulo existente serve para uma coisa só: ser **medido** contra a régua, gerando a lista do que difere. Ao mexer num módulo fora do padrão, o código **novo** nasce no padrão, a divergência do vizinho vira item da lista, e ela só é refatorada com teste cobrindo antes.

**Exceção única, e é estreita:** convenções mecânicas já estabelecidas no repositório se reaproveitam — formatação, alias de import (`@core/*`, `@modules/*`), ordem de imports, nome de script npm, gerador do client Prisma. Forma de módulo, nomes de operação, fronteiras, tratamento de erro e propriedade de tabela, não.

**Idioma:** identificadores, pastas e arquivos em **inglês**; mensagem que chega ao usuário, texto do Swagger e comentário em **pt-BR**.

**Precedência:** em estrutura, camadas, fronteiras, nomes de operação e erros, vale esta skill. Dentro da função — nome de variável, tamanho, comentário, formatação — vale a `clean-code`.

## As três camadas, e o fluxo entre elas

Todo módulo de domínio tem três responsabilidades separadas, com dependência em **uma** direção — `Controller → Service → Repository`. Nunca invertida, nunca pulada.

| Camada | Faz | Não faz |
|---|---|---|
| **Controller** | rota, `ParseIntPipe`, DTO, guard, Swagger | nenhuma regra de negócio; não conhece o repositório |
| **Service** | regra de negócio, validação que o banco não faz, orquestração; lança a `HttpException` certa | não importa o client do banco nem tipos `Prisma.*` |
| **Repository** | único ponto autorizado a tocar o Prisma (junto com `adapters/`) | nenhuma regra, nenhuma mensagem, nenhum `try/catch` de erro do ORM |

A fronteira vale pela régua, com ou sem regra de lint no projeto. Onde o código existente a fura, isso é achado da medição — não autorização para furar de novo.

## O arranjo físico

As três camadas acima são obrigatórias. **Como elas se distribuem em arquivos e pastas é uma decisão** — e a decisão adotada aqui é o arranjo **flat por sufixo**:

```text
<modulo>/
├── <modulo>.module.ts          wiring de DI — só imports, providers, controllers, exports
├── <modulo>.controller.ts
├── <modulo>.service.ts
├── <modulo>.repository.ts
├── <modulo>.tokens.ts          (quando o módulo declara porta) um Symbol por porta
├── <modulo>.jobs.ts            (quando há fila ou agendamento) entrada que não é HTTP; só delega
├── types.ts                    (opcional) tipos internos; porta não mora aqui
├── dto/                        entrada validada
├── ports/                      as portas que o módulo CONSOME, uma por arquivo
├── adapters/                   implementações que o módulo SERVE a outros módulos
├── helpers/                    (opcional) função pura de domínio reusada dentro do módulo
└── <subdominio>/               (quando houver) outro conjunto completo, mesma forma
```

**Um controller, um service, um repository por pasta.** Nunca dois. O prefixo dos arquivos é o nome da pasta.

É **proibido** resolver crescimento com `services/`, `controllers/`, `repositories/`. Pasta por camada espalha um caso de uso por três diretórios e agrupa arquivos pelo que têm de mecânico em comum, não pelo que têm de domínio. As únicas pastas por tipo são as de apoio acima — elas guardam peças, não casos de uso.

## Crescimento: submódulo nomeado

Segunda responsabilidade ganha **uma pasta com o nome do subdomínio**, contendo o seu próprio conjunto completo. O pai importa o módulo do filho e injeta o service dele; **o filho nunca importa o pai**.

Profundidade máxima: **dois níveis**. Quando um submódulo precisaria de submódulos próprios, ele é promovido a módulo irmão, ou o novo subdomínio entra como irmão dele dentro do mesmo pai.

**Antes de aninhar, pergunte quem chama quem.** Se nenhum caso de uso do pai chama o módulo e é ele quem precisa de dado do pai, ele não é submódulo: é **módulo cliente**, fica ao lado do pai, tem o próprio controller e recebe o dado por porta que ele declara.

Detalhe em `reference/submodulos.md`.

## Dado de outro módulo: porta declarada por quem consome

O grafo de módulos é **acíclico**: o módulo **consumidor** importa o módulo **provedor**, nunca o contrário.

Quando o consumidor precisa de dado de outro domínio, ele **declara a interface** do que precisa, e o dono **implementa e registra**:

```text
consumidor/ports/<recurso>.provider.ts   interface I<Recurso>Provider              ← folha
consumidor/<consumidor>.tokens.ts        export const <RECURSO>_PROVIDER = Symbol(…) ← folha
provedor/adapters/<recurso>.adapter.ts   class <Recurso>DbAdapter implements I<Recurso>Provider
provedor/<provedor>.module.ts            providers: [{ provide: <RECURSO>_PROVIDER, useClass: <Recurso>DbAdapter }]
                                         exports: [<RECURSO>_PROVIDER]
consumidor/<consumidor>.module.ts        imports: [<Provedor>Module]
```

O provedor conhece **só as duas folhas** do consumidor — a porta e o token —, e nada mais dele. O consumidor conhece só o token e a interface: nunca a classe do adapter. A porta responde à pergunta do consumidor, com o mínimo, sem devolver `null` nem a linha da tabela.

Detalhe em `reference/propriedade-de-tabelas.md`.

## Propriedade de tabela

Toda tabela tem **exatamente um** módulo dono: aquele cujo repositório a consulta e a persiste. Só ele monta query sobre ela.

Um módulo (ou submódulo) pode ser dono de **várias** tabelas quando formam um agregado: a raiz, suas filhas dependentes e as tabelas de junção vão juntas, escritas pelo repositório do dono. Chave estrangeira entre domínios é legítima — integridade é do banco; **navegar** por ela com `include`/`select`/`where` para ler tabela alheia, não.

## Vocabulário de operações

`findAll` · `findOne` (detalhe) · `findById` (leitura enxuta, que também é a guarda de existência) · `create` · `update` · `delete`. Operação que não é uma dessas recebe nome de **propósito** (`publish`, `cancel`, `reorder`, `countByCourse`), nunca nome de recorte de colunas.

Privados com prefixo de intenção: `assert*` valida e lança, `compute*` calcula puro.

## Erros

- O **service** lança a `HttpException` certa (404, 409, 422, 403) com a mensagem do **conceito de domínio**, sem id, nome de campo ou detalhe técnico. Contexto técnico vai para o log.
- Ausência é tratada no padrão *look-before*: o repositório devolve `T | null` na leitura por id, e o service converte em 404 na linha seguinte. `null` não circula dali para fora.
- O repositório **não** captura erro do ORM. Violação de restrição do banco (unicidade, FK, linha que sumiu) vai para o **filtro global** de `core/`, que responde com status e mensagem **genéricos**.
- Quando a frase precisa nomear o conceito ("Este aluno já está matriculado neste curso"), o service confere antes; a restrição do banco continua como garantia contra a corrida.

Detalhe em `reference/vocabulario-e-ordem.md`.

## Modelagem do schema

Model em `PascalCase` singular e tabela `snake_case` no plural via `@@map`, campos `camelCase`; PK `Int @id @default(autoincrement())`; todo instante em `@db.Timestamptz(3)`; entidade editável com `createdAt` **e** `updatedAt`; junção e registro append-only sem `updatedAt`; chave natural com `@unique`; N:N sempre por **tabela de junção explícita** com `@@id([a, b])` composto; `onDelete` escolhido pela semântica, e `Cascade` nunca atravessa fronteira de domínio.

Detalhe em `reference/modelagem-prisma.md`.

## Desempenho: consulta, cache e fila

Só com dor medida, e na ordem: **medir** → recorte (`select`) e **lote** pela porta → **paginação** no banco → **índice** confirmado no `EXPLAIN` → **read model** para relatório que cruza domínios → **cache** → **fila**. Pular degrau é complicar à toa.

- **Cache** (Redis, atrás da interface `CacheStore` de `core/cache`) mora no **repositório do dono da tabela**, que o invalida nas próprias escritas. Antes de cachear, quatro respostas: dor, chave (`<modulo>:<id>:<recorte>`), prazo, quem invalida. Nenhum módulo cacheia dado de outro dono; nenhuma rota autenticada é cacheada por URL; ausência não vai para o cache.
- **Fila** (BullMQ, mesmo Redis) tira da requisição o que o usuário não precisa esperar. O job entra por `<modulo>.jobs.ts`, leva **só ids**, tem `jobId` determinístico, é seguro de rodar duas vezes e é enfileirado **depois** do commit.
- **Agendamento** com mais de uma instância é job repetível da fila; `@Cron` roda em cada instância.
- **Limite de requisições** em login, recuperação de senha, envio de e-mail e rota pública com corpo; com mais de uma instância, o contador fica no Redis.

Detalhe em `reference/consultas.md` e `reference/cache-e-filas.md`.

## Quando NÃO seguir ao pé da letra

- **Não crie submódulo por antecipação.** Subdomínio nasce quando existem gatilho, rotas e tabela próprios — não porque "vai crescer".
- **Tabela filha dependente não ganha submódulo.** Se ela só é escrita através da raiz do agregado, mora no conjunto da raiz.
- **Porta não é para dado do mesmo agregado.** Entre pai e submódulo, injeção direta resolve (respeitando a direção); porta ali é cerimônia sem ganho.
- **Não force padrão de projeto** onde a solução simples resolve. Padrão sem o problema que ele cura é complexidade acidental.
- Toda exceção à régua é **documentada com o motivo** — no PR, na spec ou num `TODO(<eixo>): <motivo>` no código. Exceção silenciosa não existe.

## Mapa de referência

| Assunto | Arquivo |
|---|---|
| O conjunto fictício completo de onde saem todos os exemplos | `reference/gabarito.md` |
| O conjunto de arquivos, o que vai em cada um, pastas de apoio | `reference/anatomia-do-modulo.md` |
| Quando dividir, submódulo vs cliente vs irmão, direção da dependência, onde mora a rota | `reference/submodulos.md` |
| Dono de tabela, ports e adapters, o que atravessa fronteira | `reference/propriedade-de-tabelas.md` |
| Nomes de operação, look-before, erros, DTO, ordem, testes | `reference/vocabulario-e-ordem.md` |
| Convenções de schema Prisma | `reference/modelagem-prisma.md` |
| Medir, recorte, lote, paginação, índice, read model | `reference/consultas.md` |
| Cache com Redis, invalidação, fila, agendamento, limite de requisições | `reference/cache-e-filas.md` |

## Procedência

As três camadas, o grafo acíclico com ports e adapters, o look-before e as convenções de schema vêm da prática consolidada em projetos NestJS + Prisma e da literatura de fronteiras (Clean Code, Clean Architecture). O **arranjo físico** é uma escolha desta skill: há projetos que aceitam dois arranjos (camadas em pastas e flat por sufixo), e é exatamente essa abertura que faz a estrutura variar de módulo para módulo e torna a refatoração uma negociação a cada arquivo. Esta skill fecha a abertura: o flat por sufixo é **o** arranjo, para projeto novo e como alvo de refatoração dos antigos.

## Cross-links (não duplicar)

- **Um motivo de mudança por classe** — o porquê de três camadas: `../clean-code/reference/classes.md`.
- **Função faz uma coisa, num nível de abstração:** `../clean-code/reference/funcoes.md`.
- **Encapsular o que vem de fora** é o princípio de ports/adapters: `../clean-code/reference/fronteiras.md`.
- **Exceção no lugar de código de erro; onde `null` pode aparecer:** `../clean-code/reference/tratamento-erros.md`.
- **Padrões de projeto** (Adapter, Facade, Strategy…) e quando não usar: `../clean-code/reference/padroes-de-projeto.md`.
- **Mover código só com teste cobrindo antes:** `../clean-code/reference/refatoracao.md`.
