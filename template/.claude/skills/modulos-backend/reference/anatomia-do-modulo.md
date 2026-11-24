# Anatomia do módulo — o conjunto de arquivos e o que vai em cada um

## 1. Princípio

Um módulo de backend é um conjunto **flat** de arquivos na raiz da própria pasta — `<modulo>.module.ts`, `<modulo>.controller.ts`, `<modulo>.service.ts`, `<modulo>.repository.ts`, `<modulo>.tokens.ts` quando o módulo declara porta e `<modulo>.jobs.ts` quando ele tem fila ou agendamento — acompanhado de pastas de apoio de nome fixo (`dto/`, `ports/`, `adapters/`, `helpers/`). Há **um** controller, **um** service e **um** repository por pasta, e cada um tem uma responsabilidade que os outros dois não invadem.

## 2. Por quê

As três camadas separam o que muda por motivos diferentes: **o protocolo** (rota, status, documentação), **a regra** (o que o negócio decide) e **o acesso a dado** (como se lê e grava). Num arquivo só, uma mudança de rota arrasta teste de regra e uma troca de consulta arrasta o contrato HTTP.

O **prefixo** no nome (`courses.service.ts`, não `service.ts`) paga em duas situações reais: o editor com quinze abas continua legível, e o `import` diz de onde a classe vem sem precisar ler o caminho. O prefixo é **o nome da pasta**, sempre: em `lessons/`, os arquivos são `lessons.*`.

O layout ser **flat**, e não `services/`/`controllers/`/`repositories/`, é o que mantém um caso de uso legível num só lugar. Pasta por camada obriga a abrir três diretórios para entender um fluxo e agrupa arquivos pelo que têm de mecânico em comum; com dez casos de uso você fica com três pastas de dez arquivos e nenhuma pista de quais três formam uma unidade.

**Um** de cada por pasta é o que impede o módulo de virar depósito: quando aparece a necessidade do segundo service, a resposta é um submódulo nomeado, e a decisão de fronteira acontece ali, explicitamente, em vez de virar mais um arquivo no monte.

## 3. Exemplo

Todos os trechos são do [gabarito](./gabarito.md).

**Ruim** — crescimento resolvido por camada:

```text
courses/
├── courses.module.ts
├── controllers/
│   ├── courses.controller.ts
│   └── lessons.controller.ts
├── services/
│   ├── courses.service.ts
│   ├── lessons.service.ts
│   └── lesson-order.service.ts
└── repositories/
    ├── courses.repository.ts
    └── lessons.repository.ts
```

Para entender "aulas" abre-se três pastas, e nada indica que aqueles três arquivos são uma unidade.

**Bom** — conjunto flat na raiz, subdomínio com o seu próprio conjunto:

```text
courses/
├── courses.module.ts
├── courses.controller.ts
├── courses.service.ts
├── courses.repository.ts
├── dto/
├── adapters/
└── lessons/
    ├── lessons.module.ts
    ├── lessons.controller.ts
    ├── lessons.service.ts
    ├── lessons.repository.ts
    └── dto/
```

### `<modulo>.controller.ts`

Fronteira HTTP: recebe, valida pelo DTO, delega, documenta. Injeta a dependência como `service`. Guard declarado na classe, `@ApiTags` no plural do recurso, um `@ApiResponse` por status possível, `ParseIntPipe` em parâmetro numérico de rota. Métodos `async`. Nenhum `if` de regra, nenhum acesso a repositório.

```ts
@UseGuards(AccessTokenGuard)
@ApiTags('Courses')
@Controller('courses')
export class CoursesController {
  constructor(private readonly service: CoursesService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Detalhar curso, com as aulas' })
  @ApiResponse({ status: 200, description: 'Curso retornado.' })
  @ApiResponse({ status: 404, description: 'Curso não encontrado.' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
}
```

Em rota com corpo, `@ApiBody` traz **exemplos nomeados** pelo caso que ilustram (`apenasTitulo`, `comDescricao`), não um `default` genérico — é o que o front lê primeiro.

### `<modulo>.service.ts`

A regra. Valida o que o banco não valida, decide, orquestra, e lança a `HttpException` certa com a mensagem do conceito. Não importa o client do banco nem tipos `Prisma.*`: recebe do repositório os tipos que ele expõe. Constante de domínio no escopo do módulo, com nome que diz a regra (`MAX_LESSONS_PER_COURSE`). Públicos primeiro, privados ao final com prefixo de intenção.

```ts
@Injectable()
export class CoursesService {
  constructor(
    private readonly repository: CoursesRepository,
    private readonly lessonsService: LessonsService,
  ) {}

  async publish(id: number) {
    const course = await this.findById(id);
    this.assertNotPublished(course);
    const lessonCount = await this.lessonsService.countByCourse(id);
    this.assertHasLessons(lessonCount);
    return this.repository.update(id, { isPublished: true });
  }

  private assertHasLessons(lessonCount: number) {
    if (lessonCount === 0) throw new UnprocessableEntityException('Um curso precisa de ao menos uma aula para ser publicado');
  }
}
```

### `<modulo>.repository.ts`

Consulta e persiste as tabelas do módulo — e é o **único** arquivo do módulo autorizado a importar o client do banco e os tipos `Prisma.*` (junto com `adapters/`). Nenhuma regra: não decide, não valida formato, não escolhe mensagem, não captura erro do ORM — violação de restrição sobe para o filtro global (ver `vocabulario-e-ordem.md`). Leitura por id devolve `T | null`; quem transforma ausência em 404 é o service. O cache, quando a medição o justifica, também mora aqui, e as escritas do mesmo repositório o invalidam (`cache-e-filas.md`).

Sobre a forma da consulta: um `select` usado **em um lugar** fica escrito na própria consulta. Quando o mesmo recorte é reusado por vários métodos, ele vira uma constante no topo, tipada contra o schema:

```ts
const COURSE_SUMMARY = {
  id: true,
  title: true,
  isPublished: true,
  updatedAt: true,
} as const satisfies Prisma.CourseSelect;
```

O `satisfies` é o que faz a constante quebrar no build quando o schema muda, em vez de silenciosamente deixar de trazer um campo.

O que o service passa para gravar é um **tipo do repositório**, não um tipo do Prisma:

```ts
export type CourseChanges = Partial<Pick<Course, 'title' | 'description' | 'isPublished'>>;

async update(id: number, changes: CourseChanges) {
  return this.db.course.update({ where: { id }, data: changes, select: COURSE_SUMMARY });
}
```

**Transação mora dentro do repositório**, num método com nome de propósito. O `tx` nunca circula para fora — service que recebe `tx` como argumento está fazendo persistência. Quando a escrita é complexa, **o service calcula o plano** (puro, testável sem banco) e **o repositório aplica o plano** numa transação; o tipo do plano é exportado pelo repositório e vira o contrato entre os dois:

```ts
// lessons.repository.ts
export interface LessonOrder {
  lessonId: number;
  position: number;
}

async applyOrder(order: LessonOrder[]) {
  // Posições temporárias negativas: o @@unique([courseId, position]) não aceita trocar duas aulas direto.
  await this.db.$transaction([
    ...order.map(({ lessonId }, index) =>
      this.db.lesson.update({ where: { id: lessonId }, data: { position: -(index + 1) } }),
    ),
    ...order.map(({ lessonId, position }) => this.db.lesson.update({ where: { id: lessonId }, data: { position } })),
  ]);
}

// lessons.service.ts
private computeOrder(lessonIds: number[]): LessonOrder[] {
  return lessonIds.map((lessonId, index) => ({ lessonId, position: index + 1 }));
}
```

### `<modulo>.module.ts`

Só wiring: `imports`, `controllers`, `providers`, `exports`. O que se exporta depende de quem consome:

| Quem consome | O que o módulo exporta |
|---|---|
| módulo de **outro domínio** | o **token** da porta que aquele módulo declarou, provido aqui pelo adapter |
| o **pai**, sendo este um submódulo | o próprio service (mesmo agregado, sem porta) |

```ts
// courses.module.ts — dono do dado, provê a porta que enrollments declarou
@Module({
  imports: [LessonsModule],
  controllers: [CoursesController],
  providers: [
    CoursesService,
    CoursesRepository,
    { provide: COURSE_CATALOG_PROVIDER, useClass: CourseCatalogDbAdapter },
  ],
  exports: [COURSE_CATALOG_PROVIDER],
})
export class CoursesModule {}

// lessons.module.ts — submódulo, exporta o service para o pai
@Module({
  controllers: [LessonsController],
  providers: [LessonsService, LessonsRepository],
  exports: [LessonsService],
})
export class LessonsModule {}
```

O service de um domínio nunca é exportado para outro domínio: o outro domínio declara a porta de que precisa.

### `<modulo>.jobs.ts`

A entrada que não é HTTP: o consumidor da fila (`@Processor`) e a tarefa agendada. É o par do controller — recebe, delega ao service, não decide — e existe só quando o módulo tem fila ou agendamento. Um por pasta, como os outros.

```ts
@Processor(ENROLLMENT_EMAILS_QUEUE)
export class EnrollmentsJobs extends WorkerHost {
  constructor(private readonly service: EnrollmentsService) {
    super();
  }

  async process(job: Job<{ enrollmentId: number }>) {
    await this.service.sendWelcome(job.data.enrollmentId);
  }
}
```

Payload, `jobId`, tentativas e quando usar fila: `cache-e-filas.md`.

### `<modulo>.tokens.ts`

Existe quando o módulo **declara** porta: um `Symbol` por porta, um por linha. Arquivo-folha, sem import.

```ts
// enrollments.tokens.ts
export const COURSE_CATALOG_PROVIDER = Symbol('ICourseCatalogProvider');
```

`Symbol`, não string: colisão de string entre módulos é silenciosa e só aparece em runtime.

### Pastas de apoio

| Pasta | Conteúdo | Regra |
|---|---|---|
| `dto/` | entrada validada com `class-validator`, mensagem por regra | `UpdateXDto extends PartialType(CreateXDto)`; mora no módulo cuja rota o recebe |
| `ports/` | as portas que o módulo **consome**, uma por arquivo: `<recurso>.provider.ts` com `I<Recurso>Provider` | arquivo-folha: interfaces e tipos primitivos, sem import |
| `adapters/` | o que o módulo **serve** a outros, implementando a porta deles: `<recurso>.adapter.ts` com `<Recurso>DbAdapter` | pode tocar o banco direto |
| `helpers/` | função pura de domínio reusada por mais de um arquivo do módulo | sem estado, sem injeção; se precisa de dependência, é service |
| `types.ts` | tipos internos do módulo que não pertencem a um arquivo só | opcional; **porta não mora aqui** |

### O que fica fora dos módulos

Infraestrutura transversal mora em `core/`, agrupada por tipo e exposta por barris (`index.ts`): `database/`, `guards/`, `filters/`, `pipes/`, `validators/`, e, quando o projeto os usa, `cache/` (a interface `CacheStore` sobre o Redis), `queue/` (a conexão da fila) e `mail/` (a interface `Mailer`). Validador reusável e pipe de transformação são de `core/`, não do módulo que os usou primeiro.

O `ExceptionFilter` global normaliza **o formato** de toda resposta de erro e traduz a violação de restrição do banco para um status e uma mensagem **genéricos** e amigáveis (registro repetido → 409, registro em uso → 409, registro que sumiu → 404), sem nome de constraint, coluna ou `detail` do Postgres. Ele não substitui lançar a exceção certa no service: o filtro nunca decide regra de negócio.

## 4. Checklist

- [ ] Existe exatamente **um** controller, **um** service e **um** repository nesta pasta?
- [ ] Todos os arquivos do conjunto são prefixados pelo **nome da pasta**?
- [ ] Não existe pasta `services/`, `controllers/` ou `repositories/`?
- [ ] O controller está sem regra — nenhum `if` de negócio, nenhum acesso a repositório?
- [ ] `@ApiTags` no plural, `@ApiOperation` e um `@ApiResponse` por status possível em cada rota?
- [ ] Parâmetro numérico de rota passa por `ParseIntPipe`?
- [ ] O service não importa o client do banco nem tipos `Prisma.*`?
- [ ] O repositório está sem regra, sem mensagem e sem `try/catch` de erro do ORM?
- [ ] Toda transação está dentro do repositório, com nome de propósito, sem `tx` vazando?
- [ ] Recorte usado uma única vez está inline; recorte reusado é constante com `satisfies`?
- [ ] O módulo exporta token de porta para outro domínio, e service só para o próprio pai?
- [ ] `.tokens.ts` existe só se o módulo declara porta, e cada porta está em `ports/`?
- [ ] Fila e agendamento entram por um único `<modulo>.jobs.ts`, que só delega ao service?
- [ ] `helpers/` só tem função pura; `types.ts` não guarda porta?
- [ ] O que é transversal (validador, pipe, guard, filtro) está em `core/`?

## 5. Cross-links

- O conjunto inteiro, de onde vêm os trechos acima: `gabarito.md`.
- Quando esta pasta precisar de um segundo conjunto: `submodulos.md`.
- Quem pode consultar qual tabela: `propriedade-de-tabelas.md`.
- Nomes de operação, erros e ordem dos métodos: `vocabulario-e-ordem.md`.
- **Uma responsabilidade por classe** — o porquê de serem três: `../../clean-code/reference/classes.md`.
- **Nome revela intenção**, inclusive de arquivo e constante: `../../clean-code/reference/nomes.md`.
- **Encapsular o que vem de fora:** `../../clean-code/reference/fronteiras.md`.
- `select` enxuto, `orderBy` determinístico, sem N+1, paginação: `consultas.md`.
- Cache no repositório do dono, fila e `<modulo>.jobs.ts`: `cache-e-filas.md`.
