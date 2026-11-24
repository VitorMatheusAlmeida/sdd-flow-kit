# Consultas — medir, recortar, agrupar, paginar, indexar

## 1. Princípio

Desempenho se resolve **na ordem**, e só com dor medida: primeiro **medir**; depois a consulta traz **só o recorte** que a tela usa, **em lote**, **paginada no banco** e atendida por um **índice**; só quando isso não basta entram read model, cache e fila. A consulta mais barata é a que não se faz; a seguinte é a que traz pouco.

## 2. Por quê

Palpite de gargalo erra na maioria das vezes, e cada otimização cobra em complexidade. Os desperdícios reais de um backend com ORM são quase sempre os mesmos quatro: **over-fetching** (a linha inteira com relações que ninguém mostra), **N+1** (uma consulta por item da lista), **lista sem paginação** (que cresce com o uso até derrubar a tela) e **filtro sem índice** (varredura da tabela). Os quatro se corrigem no repositório, sem infraestrutura nova — e cache em cima de consulta ruim só esconde o problema até o dia em que a chave vence.

## 3. Exemplo

Todos os trechos são do [gabarito](./gabarito.md).

### A escada, nesta ordem

| Degrau | Quando | Onde |
|---|---|---|
| 1. **Medir** | sempre, antes de mexer | log de consulta, `EXPLAIN ANALYZE`, `pg_stat_statements`, p95 por rota |
| 2. **Recorte e lote** | over-fetching, N+1 | repositório (`select`), porta em lote |
| 3. **Paginação** | lista que cresce com o uso | repositório (`skip/take` ou cursor + `count`) |
| 4. **Índice** | filtro ou ordenação varrendo a tabela | schema (`@@index`) |
| 5. **Read model** | relatório que cruza domínios ou agrega muito | módulo de leitura dedicado, view materializada |
| 6. **Cache** | leitura repetida, cara, de dado que muda pouco | repositório do dono (`cache-e-filas.md`) |
| 7. **Fila** | trabalho lento que o usuário não precisa esperar | `<modulo>.jobs.ts` (`cache-e-filas.md`) |

Pular degrau é a forma mais comum de complicar à toa: cache (6) para resolver um N+1 (2) deixa o N+1 lá, mais uma fonte de dado velho.

### Medir

- **Em desenvolvimento:** o log de consulta do Prisma com a duração mostra quantas consultas uma rota dispara — uma rota de listagem que faz 21 consultas para 20 itens é N+1, sem precisar de mais nada.
- **Na consulta suspeita:** `EXPLAIN ANALYZE` diz se o Postgres varreu a tabela (`Seq Scan`) ou usou índice, e quanto tempo levou de verdade.
- **Em produção:** `pg_stat_statements` ordena as consultas por tempo médio e por tempo total; a de maior tempo total é a que mais pesa, mesmo que cada execução seja rápida.
- **Por rota:** tracing (OpenTelemetry com a instrumentação do Nest e do Prisma) dá o p95 de cada rota e mostra qual consulta dentro dela domina.

Registre o número de antes e o de depois. Otimização sem os dois números é palpite.

### Recorte: só o que a tela usa

```ts
// courses.repository.ts
const COURSE_SUMMARY = {
  id: true,
  title: true,
  isPublished: true,
  updatedAt: true,
} as const satisfies Prisma.CourseSelect;

async findById(id: number) {
  return this.db.course.findUnique({ where: { id }, select: COURSE_SUMMARY });
}
```

Sem `select`, o Prisma traz todas as colunas; com `include`, traz a relação inteira. A resposta da rota é o recorte — nunca a linha crua.

### Lote: uma consulta por página, não por item

**Ruim** — a porta é chamada dentro do `map`, e a listagem vira N+1:

```ts
const items = await Promise.all(
  page.items.map(async (enrollment) => ({
    ...enrollment,
    courseTitle: await this.courseCatalog.findTitle(enrollment.courseId), // uma consulta por item
  })),
);
```

**Bom** — a porta recebe os ids da página e responde de uma vez:

```ts
const titles = await this.courseCatalog.findTitles(page.items.map((enrollment) => enrollment.courseId));
const items = page.items.map((enrollment) => ({ ...enrollment, courseTitle: titles.get(enrollment.courseId) }));
```

Dentro do **próprio agregado**, o dono junta as tabelas dele numa consulta (`select` aninhado); entre **donos diferentes**, o lote passa pela porta. O `include` para a tabela de outro dono continua proibido, mesmo que "resolva" o N+1 (`propriedade-de-tabelas.md`).

### Paginação no banco, com o total dos mesmos filtros

```ts
// enrollments.repository.ts
async findAll({ courseId, page, pageSize }: FindEnrollmentsDto) {
  const where = { courseId };
  const [items, total] = await this.db.$transaction([
    this.db.enrollment.findMany({
      where,
      select: ENROLLMENT_SUMMARY,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    this.db.enrollment.count({ where }),
  ]);
  return { items, total };
}
```

- O `where` é **uma variável só**, usada nas duas consultas: o total nunca diverge da página.
- O `orderBy` é **determinístico**: termina numa coluna única (`id`), senão a mesma linha aparece em duas páginas.
- `pageSize` tem teto no DTO (`@Max(100)`): sem ele, `pageSize=100000` é uma lista sem paginação.
- Página profunda com `skip` grande fica lenta, porque o banco lê e descarta tudo antes. Lista que cresce sem fim e é lida em sequência (rolagem infinita, exportação) usa **cursor** (`cursor: { id }, skip: 1, take`), que vai direto ao ponto.

### Índice: pelo que a consulta filtra e ordena

A listagem acima filtra por `courseId` e ordena por `createdAt`. O `@@unique([courseId, studentEmail])` já começa por `courseId`, então o filtro é atendido. Se o `EXPLAIN ANALYZE` mostrar a ordenação custando caro numa lista grande, o índice que a atende é `@@index([courseId, createdAt])`. Índice se cria pelo plano medido, não por precaução — cada um pesa na escrita (`modelagem-prisma.md`).

### Transação curta

`$transaction` segura uma conexão do pool até terminar. Dentro dela só entram as escritas do banco: nada de e-mail, chamada HTTP ou espera por fila. Trabalho externo vem **depois** do commit — ou vai para a fila.

```ts
// ✅ enrollments.service.ts — grava, e só então enfileira o e-mail
const enrollment = await this.repository.create(dto);
await this.emails.add('welcome', { enrollmentId: enrollment.id }, { jobId: `welcome-${enrollment.id}` });
```

### Read model: leitura que cruza domínios ou agrega muito

Relatório que soma matrículas por curso por mês cruza domínios e agrega a tabela inteira. Ele não fica espalhado pelos módulos: vira um **módulo de leitura dedicado** (a exceção registrada de `propriedade-de-tabelas.md`), e quando a agregação pesa, uma **view materializada** atualizada por agendamento com `REFRESH MATERIALIZED VIEW CONCURRENTLY` (que exige um índice único na view e não bloqueia a leitura). O relatório aceita minutos de atraso; a tela de operação, não — e é essa tolerância que decide.

## 4. Checklist

- [ ] Há número de antes (consultas por rota, tempo, p95) — e haverá o de depois?
- [ ] A consulta tem `select` com o recorte que a tela usa, sem `include` de relação inteira?
- [ ] Nenhuma consulta dentro de `map`/laço: dado alheio vem em lote pela porta?
- [ ] Toda listagem pagina no banco, com `orderBy` determinístico, teto de `pageSize` e `total` dos mesmos filtros?
- [ ] Lista que cresce sem fim e é lida em sequência usa cursor?
- [ ] Filtro e ordenação das consultas reais têm índice que os atende, confirmado no `EXPLAIN`?
- [ ] Nenhuma chamada externa dentro de `$transaction`?
- [ ] Relatório que cruza domínios mora num read model, não espalhado pelos módulos?
- [ ] Cache ou fila só entraram depois dos degraus anteriores?

## 5. Cross-links

- O conjunto inteiro, de onde vêm os trechos: `gabarito.md`.
- Cache e fila, os dois últimos degraus: `cache-e-filas.md`.
- Por que o lote passa pela porta, e a exceção do read model: `propriedade-de-tabelas.md`.
- Índice composto e o custo de cada índice: `modelagem-prisma.md`.
- `findAll` e o vocabulário de leitura: `vocabulario-e-ordem.md`.
- Clareza antes de desempenho; medir antes de mudar: `../../clean-code/reference/refatoracao.md`.
