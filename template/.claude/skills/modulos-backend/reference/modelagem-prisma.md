# Modelagem no Prisma — convenções de schema

## 1. Princípio

O schema segue um conjunto fixo de convenções: model em `PascalCase` no singular e tabela em `snake_case` no plural via `@@map`, campos `camelCase`, PK `Int @id @default(autoincrement())`, todo instante em `@db.Timestamptz(3)`, entidade editável com `createdAt` **e** `updatedAt`, chave natural com `@unique`, e relação N:N sempre por **tabela de junção explícita** com chave primária composta — nunca a relação implícita do ORM.

## 2. Por quê

As convenções existem para que a **forma** de uma tabela nova não seja decidida de novo a cada migration. Cada uma paga um custo específico:

- **`@@map` com `snake_case` no plural** mantém o banco legível por quem o consulta fora da aplicação (BI, `psql`) sem forçar o código a abandonar `camelCase`. Sem isso, metade das tabelas fica num estilo e metade no outro, e toda query manual precisa de consulta prévia ao schema.
- **`Timestamptz`** grava o instante com fuso. `timestamp` sem fuso guarda um relógio de parede ambíguo, e o erro só aparece quando servidor, banco e usuário estão em fusos diferentes — tarde demais para corrigir os dados já gravados.
- **`createdAt`/`updatedAt` em entidade editável** é o que permite responder "quando isso mudou" sem tabela de auditoria. Onde a tabela é append-only (evento, junção), `updatedAt` seria uma coluna que nunca muda — ruído.
- **Junção explícita** é a diferença entre poder e não poder evoluir a relação. A relação implícita do ORM cria uma tabela que o schema não descreve: não dá para acrescentar uma coluna (a data da conclusão, a ordem do item), nem indexar do outro lado, nem escrever a migration sem lutar contra o gerador.
- **Chave natural com `@unique`** move a garantia para o banco. Verificar duplicidade só no service perde a corrida entre duas requisições simultâneas.

## 3. Exemplo

Todos os trechos são do [gabarito](./gabarito.md).

### Entidade

```prisma
model Course {
  id          Int          @id @default(autoincrement())
  title       String       @db.VarChar(120)
  description String?
  isPublished Boolean      @default(false)
  lessons     Lesson[]
  enrollments Enrollment[]
  createdAt   DateTime     @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime     @updatedAt @db.Timestamptz(3)

  @@map("courses")
}
```

Ordem dos campos: `id`, escalares, FKs, relações, `createdAt`/`updatedAt`, atributos `@@`. Ler duas tabelas lado a lado fica possível porque a ordem é a mesma.

`@db.VarChar(n)` quando há **limite de negócio** (título, e-mail, sigla); `String` puro para texto livre (descrição). O limite no banco e o `@MaxLength` no DTO andam juntos — o DTO dá a mensagem amigável, a coluna garante.

### Junção explícita, com carga

```prisma
/// Junção com carga, dona: enrollments. A aula é de outro dono: a FK existe, a navegação não.
model CompletedLesson {
  enrollmentId Int
  lessonId     Int
  completedAt  DateTime   @default(now()) @db.Timestamptz(3)
  enrollment   Enrollment @relation(fields: [enrollmentId], references: [id], onDelete: Cascade)
  lesson       Lesson     @relation(fields: [lessonId], references: [id], onDelete: Restrict)

  @@id([enrollmentId, lessonId])
  @@index([lessonId])
  @@map("completed_lessons")
}
```

Pontos a copiar:

- `@@id([a, b])` composto: a unicidade do par é estrutural, não um índice a mais.
- `@@index` na coluna que **não** é prefixo da PK: sem ele, perguntar "quem concluiu esta aula" varre a tabela.
- `onDelete` diferente nas duas pontas, porque a semântica é diferente (abaixo).
- Junção não leva `updatedAt`; a carga (`completedAt`) é o dado da relação.

### `onDelete`: a escolha é semântica

| Valor | Quando | Significado | No gabarito |
|---|---|---|---|
| `Cascade` | a linha só existe por causa do pai, **no mesmo agregado** | some com o pai | `completed_lessons` → `enrollments` |
| `Restrict` | referência a dado de outro dono, ou a cadastro que outros dados usam | impede apagar o pai enquanto houver filho | `lessons` → `courses`, `completed_lessons` → `lessons` |
| `SetNull` | vínculo opcional que pode ser desfeito | a FK é anulável | — |

`Cascade` nunca atravessa fronteira de domínio: apagar uma aula não pode apagar, calado, o histórico de matrículas de outro módulo. Com `Restrict`, apagar aula já concluída **falha** — e a falha vira o 409 genérico do filtro global em vez de uma perda silenciosa. Quando a regra é "nunca apagar", o par é `Restrict` no schema + `delete` que desativa no código. Um projeto pode proibir `Cascade` de vez; essa decisão é registrada na constituição dele.

### Unicidade

```prisma
@@unique([courseId, position])      // composta: uma aula por posição em cada curso
@@unique([courseId, studentEmail])  // chave natural da matrícula
```

O Prisma gera a chave composta para consulta (`courseId_position`), e o repositório a usa para responder perguntas de propósito (`existsAtPosition`).

Unicidade **condicional** — "só uma matrícula ativa por aluno e curso" — é a ferramenta mais subestimada: ela substitui uma transação por uma restrição. Em Postgres é um índice único parcial; onde o Prisma não o descreve, ele é escrito no SQL da migration, com um comentário `///` no model registrando que existe.

### Índices: pelo que a consulta filtra

Índice composto serve consulta que filtra pelo **prefixo** dele. `[a, b]` atende `where a` e `where a AND b`, não `where b` sozinho — por isso `@@unique([courseId, position])` já atende "aulas do curso", e `completed_lessons` precisa do `@@index([lessonId])` à parte. Indexe o que as consultas reais filtram e ordenam — e lembre que índice pesa na escrita.

### Enum: quando o conjunto é fechado e do domínio

```prisma
enum EnrollmentStatus {
  ACTIVE
  CANCELLED
}
```

Estado com conjunto fechado é enum, não `String`: o banco recusa valor fora da lista e o client gera o tipo. O custo é que acrescentar valor exige migration — aceitável quando o conjunto muda por decisão de negócio, não por dado.

Coluna de estado **não** deve ser anulável quando a linha só existe se houver o que avaliar: `status` nulo e linha ausente significando a mesma coisa é ambiguidade que se paga em cada `where`.

### Onde a invariante é garantida

| Lugar | Garante | Custo |
|---|---|---|
| DTO | formato, na borda, com a mensagem amigável | não protege escrita por outro caminho |
| Service | regra que precisa de contexto, com a frase do conceito | perde corrida entre requisições simultâneas |
| Banco (`@unique`, `CHECK`, FK, trigger) | sempre | a violação chega como erro genérico, pelo filtro global |

Unicidade e integridade referencial ficam **no banco**. Regra que depende de contexto fica no service. Formato fica nos dois. Quando a mesma invariante está no service (pela frase) e no banco (pela garantia), não é duplicação: são dois trabalhos diferentes.

Quando uma restrição existe só no SQL da migration — `CHECK`, índice parcial, trigger —, registre-a no model com comentário `///`, senão ela desaparece do documento que todo mundo lê.

### A migration

Uma migration faz **uma** coisa, e o SQL gerado é revisado antes de aplicar: `DROP COLUMN` inesperado, tipo recriado, ordem de operações que falha em base com dado. Mudança de schema é compatível para frente e para trás quando o deploy não é atômico — coluna nova entra anulável, o código passa a escrever, e só depois ela vira obrigatória.

## 4. Checklist

- [ ] Model em `PascalCase` singular, `@@map("snake_case_plural")`, campos `camelCase`?
- [ ] PK é `Int @id @default(autoincrement())` (ou há motivo registrado para não ser)?
- [ ] Todo `DateTime` de instante tem `@db.Timestamptz(3)`; data de calendário usa `@db.Date`?
- [ ] Entidade editável tem `createdAt` **e** `updatedAt`; junção/append-only não tem `updatedAt`?
- [ ] `@db.VarChar(n)` onde existe limite de negócio, e o DTO tem o `@MaxLength` correspondente?
- [ ] Ordem dos campos segue `id` → escalares → FKs → relações → timestamps → `@@`?
- [ ] Toda relação N:N é tabela explícita com `@@id([a, b])`, sem relação implícita do ORM?
- [ ] Junção tem índice na coluna que não é prefixo da PK?
- [ ] Cada `onDelete` foi escolhido pela semântica, e `Cascade` não atravessa fronteira de domínio?
- [ ] Chave natural tem `@unique`; unicidade condicional está no banco, registrada com `///`?
- [ ] Índice composto atende consulta que filtra pelo prefixo dele?
- [ ] Estado de conjunto fechado é enum, e não é anulável quando a linha implica o estado?
- [ ] A migration faz uma coisa, o SQL foi revisado, e a mudança é compatível para frente?

## 5. Cross-links

- O schema completo do gabarito: `gabarito.md`.
- Quem consulta cada tabela: `propriedade-de-tabelas.md`.
- Onde o DTO espelha a coluna, e o filtro genérico: `vocabulario-e-ordem.md`.
- Índice confirmado pelo `EXPLAIN`, paginação e read model: `consultas.md`.
