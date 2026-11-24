# Propriedade de tabelas — dono único, ports e adapters

## 1. Princípio

Toda tabela tem **exatamente um** módulo dono: aquele cujo repositório a consulta e a persiste. Só o dono monta query sobre ela. Dado de outro domínio se obtém por uma **porta que o consumidor declara** e um **adapter que o dono implementa e registra** — nunca importando o service alheio nem navegando até a tabela dele por relação.

## 2. Por quê

Com o client do ORM disponível em todo módulo, sem esta regra o **schema do banco vira o contrato compartilhado global**. Renomear ou mover uma coluna passa a quebrar, em cascata, todo módulo que a lia — longe de onde a decisão foi tomada, e sem que o autor da mudança tenha como saber quem depende dela. Com dono único, o alcance de uma mudança de schema fica dentro do dono e dos seus adapters.

A porta ser declarada **por quem consome** é o que inverte a dependência. Se o provedor definisse a interface, ela tenderia a espelhar a tabela dele, e o consumidor herdaria o vocabulário do banco alheio. Declarada pelo consumidor, ela expõe só o que ele usa e fala a linguagem dele; quando o dono muda o schema, o **adapter absorve** a mudança.

O adapter ser **registrado pelo dono** é o que mantém o concreto escondido. O consumidor importa o módulo do dono e recebe só o token; ele nunca importa a classe do adapter, nem sabe que existe um banco do outro lado.

E há um ganho que aparece na prática: **quem é dono valida o próprio dado**. Em vez de o consumidor consultar a tabela alheia para checar se um curso está aberto, ele pergunta ao dono — que sabe o que "aberto" significa naquele domínio (existe? publicado? com vagas?).

## 3. Exemplo

Todos os trechos são do [gabarito](./gabarito.md).

### O arranjo completo

```text
consumidor/ports/<recurso>.provider.ts   interface I<Recurso>Provider              ← folha, declarada pelo consumidor
consumidor/<consumidor>.tokens.ts        export const <RECURSO>_PROVIDER = Symbol(…) ← folha, declarada pelo consumidor
provedor/adapters/<recurso>.adapter.ts   class <Recurso>DbAdapter implements I<Recurso>Provider
provedor/<provedor>.module.ts            providers: [{ provide: <RECURSO>_PROVIDER, useClass: <Recurso>DbAdapter }]
                                         exports: [<RECURSO>_PROVIDER]
consumidor/<consumidor>.module.ts        imports: [<Provedor>Module]
```

**A porta, declarada pelo consumidor.** Só os métodos que ele usa, no vocabulário dele:

```ts
// enrollments/ports/course-catalog.provider.ts
export interface ICourseCatalogProvider {
  isOpenForEnrollment(courseId: number): Promise<boolean>;
  findTitles(courseIds: number[]): Promise<Map<number, string>>;
}
```

**O token, no `tokens.ts` do consumidor:**

```ts
// enrollments/enrollments.tokens.ts
export const COURSE_CATALOG_PROVIDER = Symbol('ICourseCatalogProvider');
```

**O adapter, implementado pelo dono:**

```ts
// courses/adapters/course-catalog.adapter.ts
@Injectable()
export class CourseCatalogDbAdapter implements ICourseCatalogProvider {
  constructor(
    private readonly db: DatabaseService,
    private readonly repository: CoursesRepository,
  ) {}

  async isOpenForEnrollment(courseId: number): Promise<boolean> {
    const course = await this.repository.findById(courseId); // a leitura que já existe, com o cache dela
    return course?.isPublished === true;
  }

  async findTitles(courseIds: number[]): Promise<Map<number, string>> {
    const courses = await this.db.course.findMany({
      where: { id: { in: courseIds } },
      select: { id: true, title: true },
    });
    return new Map(courses.map((course) => [course.id, course.title]));
  }
}
```

**O registro, no módulo do dono, que exporta o token:**

```ts
// courses/courses.module.ts
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
```

**O consumo, pela interface:**

```ts
// enrollments/enrollments.module.ts
@Module({
  imports: [CoursesModule],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService, EnrollmentsRepository],
})
export class EnrollmentsModule {}

// enrollments/enrollments.service.ts
constructor(
  private readonly repository: EnrollmentsRepository,
  @Inject(COURSE_CATALOG_PROVIDER) private readonly courseCatalog: ICourseCatalogProvider,
) {}
```

### Por que isso não cria ciclo

O módulo do **consumidor** importa o módulo do **provedor** — essa é a única seta entre módulos. O provedor, por sua vez, importa **dois arquivos-folha** do consumidor: a porta e o token. Não é ciclo porque folha não importa nada de volta: o provedor conhece o contrato que o consumidor escreveu, e nada mais dele — nem service, nem módulo, nem DTO.

**Regra concreta:** porta e token contêm só interfaces, tipos primitivos e `Symbol`. Sem `import` de service, de módulo, de DTO com decorador, de client do ORM.

### A porta expõe o mínimo, no vocabulário do consumidor

**Ruim** — a porta devolve a linha da tabela, e o vocabulário do banco vaza:

```ts
export interface ICourseCatalogProvider {
  findById(id: number): Promise<Course>; // tipo do ORM, todas as colunas
}
```

Quem consome passa a depender de tudo, inclusive do que não usa; e uma coluna nova no dono muda o tipo do consumidor.

**Bom** — só o que o consumidor usa, com nomes do domínio dele:

```ts
export interface ICourseCatalogProvider {
  isOpenForEnrollment(courseId: number): Promise<boolean>;
}
```

A porta responde à **pergunta** do consumidor ("está aberto para matrícula?"), não entrega o dado para ele decidir. E ela não devolve `null`: ou responde com um valor do domínio (`boolean`, lista, `Map` que pode vir vazio), ou lança.

Se dois consumidores precisam de recortes diferentes, são **duas portas**. Um único adapter pode implementar as duas — tipagem estrutural resolve, e o dono continua com um lugar só para manter.

### Dado alheio numa listagem: em lote

A listagem de matrículas mostra o título do curso. A tentação é o `include`; a regra manda a porta — e a porta resolve a página inteira numa consulta:

```ts
// enrollments/enrollments.service.ts
async findAll(query: FindEnrollmentsDto) {
  const page = await this.repository.findAll(query);
  const titles = await this.courseCatalog.findTitles(page.items.map((enrollment) => enrollment.courseId));
  const items = page.items.map((enrollment) => ({ ...enrollment, courseTitle: titles.get(enrollment.courseId) }));
  return { ...page, items };
}
```

Uma pergunta por item seria N+1. Uma pergunta por página custa uma consulta e mantém a fronteira.

### A chave estrangeira não é acesso

Uma tabela pode ter FK para tabela de outro dono, e **deve** ter: integridade referencial é responsabilidade do banco.

O que a regra proíbe é a **consulta** atravessar:

```ts
// ✅ filtrar pela coluna da própria tabela é permitido
where: { courseId }

// ❌ filtrar por coluna da tabela do outro dono
where: { course: { isPublished: true } }

// ❌ navegar para a tabela do outro dono
include: { course: { select: { title: true } } }

// ❌ consultar a tabela alheia direto
this.db.course.findMany(...)
```

O título e a situação do curso vêm pela porta. A relação fica declarada no schema para a integridade, não para ser navegada.

### A exceção, e como declará-la

Consulta de leitura que só se resolve com junção entre domínios — um relatório, uma listagem com filtro cruzado e paginação sobre o resultado — **pode** atravessar, para não trocar um join por N+1 ou por paginação errada. A exceção precisa de duas coisas: ser **explícita** (registrada no PR, na spec ou num `TODO(<eixo>): <motivo>` no código) e ser **localizada** (um read model dedicado, não acesso alheio espalhado pelos módulos).

Exceção silenciosa não existe. A diferença entre "exceção justificada" e "regra furada" é só o registro.

### Quem pode tocar o banco

Dentro de um módulo, apenas `*.repository.ts` e `adapters/**` importam o client e os tipos `Prisma.*`. O adapter é a segunda porta de entrada legítima porque ele **é** a implementação de persistência que o dono expõe — e mantê-lo fora do repositório evita que o repositório cresça com métodos que só existem para servir terceiros.

### Agregado: várias tabelas, um dono

Um módulo (ou submódulo) é dono de várias tabelas quando elas formam um agregado — a raiz, as filhas dependentes e as junções. Elas são escritas juntas, pelo repositório do dono, por *nested write* ou por transação. `enrollments` é dono de `enrollments` e de `completed_lessons`: a aula concluída não existe sem a matrícula, então a junção mora no conjunto de `enrollments` e não ganha módulo próprio. A FK de `completed_lessons` para `lessons` garante que a aula existe; qualquer regra a mais sobre a aula (ser do mesmo curso, estar publicada) é pergunta ao dono das aulas, por porta.

## 4. Checklist

- [ ] Cada tabela tem um único módulo cujo repositório a consulta?
- [ ] Nenhum módulo consulta tabela de outro dono — nem direto, nem por `include`/`select`/`where` através de relação?
- [ ] Toda porta é declarada por **quem consome**, em `ports/`, com o token no `tokens.ts` dele?
- [ ] Porta e token são folhas — sem import de service, módulo, DTO ou ORM?
- [ ] A porta responde à pergunta do consumidor, com o mínimo, sem devolver `null` nem a linha da tabela?
- [ ] O adapter mora em `adapters/` do **dono**, que o registra e **exporta o token**?
- [ ] O consumidor importa o módulo do dono e nunca a classe do adapter?
- [ ] Dado alheio em listagem vem em lote, numa consulta por página?
- [ ] Nenhum módulo cacheia dado de outro dono (quem cacheia e invalida é o dono, atrás da porta)?
- [ ] FK entre domínios existe no schema, mas nenhuma consulta navega por ela?
- [ ] Toda junção entre domínios está registrada com motivo e localizada num read model?
- [ ] Só `*.repository.ts` e `adapters/**` importam o client e os tipos do Prisma?

## 5. Cross-links

- O conjunto inteiro, com a porta de `enrollments` e o adapter de `courses`: `gabarito.md`.
- Onde o dono mora quando o agregado cresce: `submodulos.md`.
- Convenções de FK, junção e `onDelete`: `modelagem-prisma.md`.
- **Encapsular o que é de fora atrás de uma interface própria:** `../../clean-code/reference/fronteiras.md`.
- Lote pela porta, paginação e índice: `consultas.md`.
- Só o dono cacheia e invalida o próprio dado: `cache-e-filas.md`.
