# Vocabulário e ordem — nomes de operação, erros, DTO e testes

## 1. Princípio

As operações de um módulo usam um **vocabulário fixo** — `findAll`, `findOne`, `findById`, `create`, `update`, `delete` — e o que não é uma dessas recebe nome de **propósito**, nunca de recorte de colunas. Falha de negócio é sinalizada pelo **service**, com a `HttpException` certa e a mensagem do conceito de domínio; ausência é convertida em 404 no padrão *look-before*; violação de restrição do banco fica com o filtro global, que responde de forma genérica.

## 2. Por quê

Vocabulário fixo elimina uma decisão por método. Quando `findStatus`, `findDetail`, `findWithLessons` e `findTitleById` convivem, o nome descreve **o recorte de colunas** que o método devolve — informação que muda toda vez que a consulta muda, e que obriga a abrir o repositório para saber qual usar. `findById` e `findOne` descrevem **a pergunta**, que não muda.

O *look-before* resolve um problema de contrato: se `update` confia no erro do ORM para detectar ausência, o chamador recebe um erro técnico que precisa ser traduzido longe da causa. Com `findById` lançando 404 antes, o erro nasce com status e mensagem no ponto exato da falha, e o dado lido fica em mãos para as validações seguintes.

A mensagem falar o domínio não é preciosismo: ela **chega crua a quem consome a API** e normalmente é exibida ao usuário como está. "Este curso já está publicado" é utilizável; "course 12 isPublished=true" vaza o nome da propriedade, o id e o idioma do código.

## 3. Exemplo

Todos os trechos são do [gabarito](./gabarito.md).

### O vocabulário

| Nome | Devolve | Uso |
|---|---|---|
| `findAll(filtros)` | página, com `orderBy` determinístico e o `total` dos mesmos filtros | listagem |
| `findOne(id)` | detalhe, com o que a tela de detalhe usa | tela de detalhe |
| `findById(id)` | leitura enxuta | guarda de existência (look-before), e uso pelo pai |
| `create(dto)` | a entidade criada | |
| `update(id, dto)` | a entidade atualizada | |
| `delete(id)` | a entidade removida ou desativada | |

Operação fora dessa lista recebe nome do **propósito**: `publish`, `cancel`, `reorder`, `addLesson`, `countByCourse`, `existsAtPosition`, `applyOrder`. O teste do nome é uma pergunta: ele diz *o que a operação faz para o negócio*, ou *quais colunas ela traz*? O segundo caso reprova.

`delete` ser remoção física ou desativação é decisão de domínio, não de padrão — o que a régua exige é que o nome seja `delete` nas duas, e que o Swagger diga qual é. Quando a desativação tem nome próprio no negócio (cancelar uma matrícula), ela é operação de propósito: `cancel`.

### Look-before, e o que ele substitui

**Ruim** — guarda que joga fora o que leu, privado que não diz o que devolve, e mensagem com id:

```ts
async publish(id: number) {
  await this.ensureExists(id);
  const course = await this.repository.findStatus(id); // segunda leitura da mesma linha
  if (course.isPublished) throw new UnprocessableEntityException(`Course ${id} already published`);
  return this.repository.update(id, { isPublished: true });
}

private async ensureExists(id: number) {
  const course = await this.repository.findStatus(id);
  if (!course) throw new NotFoundException(`Curso ${id} não encontrado`);
}
```

**Bom** — a guarda é uma leitura nomeada, e o resultado é aproveitado:

```ts
async findById(id: number) {
  const course = await this.repository.findById(id);
  if (!course) throw new NotFoundException('Curso não encontrado');
  return course;
}

async publish(id: number) {
  const course = await this.findById(id);     // uma leitura, e o dado fica em mãos
  this.assertNotPublished(course);            // valida sem tocar o banco
  const lessonCount = await this.lessonsService.countByCourse(id);
  this.assertHasLessons(lessonCount);
  return this.repository.update(id, { isPublished: true });
}
```

`findById` é **público** de propósito: o pai o usa como look-before antes de coordenar o filho (`addLesson`).

O repositório devolve `T | null` na leitura por id — ausência é um valor na fronteira de persistência. **Só ali**: o service converte em 404 na linha seguinte, e dali para fora `null` não circula como sinal de erro.

### Privados com prefixo de intenção

`assert*` valida e lança; `compute*` calcula e devolve, sem efeito colateral:

```ts
private assertNotPublished(course: { isPublished: boolean }) {
  if (course.isPublished) throw new UnprocessableEntityException('Este curso já está publicado');
}

private computeOrder(lessonIds: number[]): LessonOrder[] {
  return lessonIds.map((lessonId, index) => ({ lessonId, position: index + 1 }));
}
```

O prefixo responde de fora se a chamada pode interromper o fluxo — que é a única coisa que o chamador precisa saber para ler o método público.

### Erros: quem lança, qual, e com que mensagem

| Situação | Quem trata | Resposta |
|---|---|---|
| não existe | service (look-before) | `NotFoundException` (404) |
| entrada malformada | DTO (`ValidationPipe`) | 400 com a mensagem da regra |
| conflito previsível com dado existente | service, conferindo antes | `ConflictException` (409) com a frase do conceito |
| regra de negócio recusa um estado válido | service (`assert*`) | `UnprocessableEntityException` (422) |
| sem permissão para a operação | guard, ou service quando depende do dado | `ForbiddenException` (403) |
| violação de restrição do banco (unicidade, FK, linha que sumiu) | filtro global de `core/` | 409 ou 404 com mensagem **genérica** |

O repositório **não** captura erro do ORM. A restrição do banco é a garantia; quando a frase precisa nomear o conceito, o service confere antes e o banco fica como rede de segurança:

```ts
async create(dto: CreateEnrollmentDto) {
  await this.assertCourseIsOpen(dto.courseId);
  await this.assertNotEnrolled(dto.courseId, dto.studentEmail);      // frase do conceito no caminho normal
  const enrollment = await this.repository.create(dto);              // @@unique pega a corrida: 409 genérico
  await this.emails.add('welcome', { enrollmentId: enrollment.id }, { jobId: `welcome-${enrollment.id}` });
  return enrollment;
}

private async assertNotEnrolled(courseId: number, studentEmail: string) {
  const isEnrolled = await this.repository.existsForStudent(courseId, studentEmail);
  if (isEnrolled) throw new ConflictException('Este aluno já está matriculado neste curso');
}
```

**A mensagem** nomeia o conceito, no idioma do usuário, **sem** id, nome de campo, nome de constraint ou detalhe do ORM. O contexto técnico (operação, id, causa) vai para o **log**, nunca para a mensagem. O filtro global nunca repassa mensagem crua do banco: nome de constraint, coluna e `detail` do Postgres (que pode conter a linha inteira, com dado pessoal) não vão para a resposta nem para o log.

### Ordem dentro do arquivo

**Repositório:** constantes de recorte e tipos exportados no topo; leituras, depois escritas. **Service:** públicos agrupados por caso de uso, privados ao final, `assert*` antes de `compute*`. **Controller:** leituras antes das escritas — com uma ressalva concreta: rota literal declarada **antes** de rota paramétrica do mesmo método e nível, senão o parâmetro captura a literal (`GET /courses/published` depois de `GET /courses/:id` devolve erro de conversão).

A ordem fixa é o que agrupa; comentário separador (`// ─── Leituras ───`) não é usado. Comentário só registra um **porquê** que o código não diz — uma invariante, o motivo de uma ordem (ver `../../clean-code/reference/comentarios.md`).

### DTO

Toda entrada externa passa por DTO com `class-validator`, e **cada regra carrega mensagem** no idioma do usuário, nomeando o conceito:

```ts
export class CreateEnrollmentDto {
  @ApiProperty({ example: 12 })
  @IsInt({ message: 'O curso escolhido é inválido' })
  courseId: number;

  @ApiProperty({ example: 'aluna@exemplo.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Informe um e-mail válido' })
  @MaxLength(254, { message: 'O e-mail pode ter no máximo 254 caracteres' })
  studentEmail: string;
}
```

`UpdateDto extends PartialType(CreateDto, { skipNullProperties: false })`: sem o `skipNullProperties: false`, `null` passa por campo obrigatório e estoura no banco em vez de na borda.

```ts
export class UpdateCourseDto extends PartialType(CreateCourseDto, { skipNullProperties: false }) {}
```

Campo que o cliente não deve editar não entra no DTO: `isPublished` muda pela operação `publish`, que tem regra própria.

Objeto aninhado precisa de `@ValidateNested({ each: true })` **e** `@Type(() => Dto)` — sem o `@Type`, o `class-transformer` não instancia e a validação do aninhado é silenciosamente ignorada.

### Testes das duas camadas com comportamento

**Service spec** — dublê do repositório, do service do filho e de cada porta; o caminho feliz e **cada exceção** lançada:

```ts
describe('CoursesService.publish', () => {
  const repository = { findById: jest.fn(), update: jest.fn() };
  const lessonsService = { countByCourse: jest.fn() };
  const service = new CoursesService(repository as never, lessonsService as never);

  beforeEach(() => jest.resetAllMocks());

  it('recusa publicar curso sem aulas', async () => {
    repository.findById.mockResolvedValue({ id: 1, isPublished: false });
    lessonsService.countByCourse.mockResolvedValue(0);

    const publishing = service.publish(1);

    await expect(publishing).rejects.toThrow(UnprocessableEntityException);
    expect(repository.update).not.toHaveBeenCalled();
  });
});
```

**Controller spec** — mais leve: instancia a classe com um dublê do service e verifica **só a delegação**, porque a regra já é coberta no service spec. Guard e permissão por rota se testam no teste de contrato ou no e2e, que sobem o módulo com os decorators.

```ts
it('findOne repassa o id', async () => {
  const service = { findOne: jest.fn() };
  const controller = new CoursesController(service as never);

  await controller.findOne(7);

  expect(service.findOne).toHaveBeenCalledWith(7);
});
```

Refatorar um comportamento exige teste cobrindo-o **antes** da mudança. Dívida de teste reconhecida fica marcada no código com `TODO(<eixo>): <o que falta>` — dívida não declarada transforma a régua em ficção.

## 4. Checklist

- [ ] Toda operação padrão usa o nome do vocabulário (`findAll`/`findOne`/`findById`/`create`/`update`/`delete`)?
- [ ] Nenhum método é nomeado pelo recorte de colunas que devolve?
- [ ] Operação fora do padrão tem nome de propósito de negócio?
- [ ] `findById` lança 404 e é chamado antes de `update`/`delete`/operação de propósito?
- [ ] O resultado do look-before é aproveitado, e não descartado?
- [ ] `null` só aparece no retorno de leitura do repositório, e o service o converte na linha seguinte?
- [ ] Privado que lança tem prefixo `assert`; privado puro tem prefixo `compute`?
- [ ] O service lança a `HttpException` certa (404/409/422/403), e o repositório não captura erro do ORM?
- [ ] Conflito com frase própria é conferido antes, com a restrição do banco mantida como garantia?
- [ ] Toda mensagem nomeia o conceito, sem id, nome de campo, constraint ou detalhe do ORM — e o contexto técnico vai para o log?
- [ ] No repositório, leituras antes das escritas; no service, privados ao final; sem comentário separador?
- [ ] No controller, rota literal declarada antes da paramétrica do mesmo método e nível?
- [ ] Todo campo de DTO tem mensagem por regra, no idioma do usuário?
- [ ] `UpdateDto` estende `PartialType(CreateDto)` com `skipNullProperties: false`?
- [ ] Aninhado tem `@ValidateNested` **e** `@Type(() => Dto)`?
- [ ] Existem specs de service (com cada exceção) e de controller (delegação)?
- [ ] O comportamento alterado já tinha teste **antes** da mudança?

## 5. Cross-links

- O conjunto inteiro, de onde vêm os trechos: `gabarito.md`.
- Onde cada um desses arquivos mora: `anatomia-do-modulo.md`.
- **Nomes revelam intenção:** `../../clean-code/reference/nomes.md`.
- **Função faz uma coisa, num nível de abstração:** `../../clean-code/reference/funcoes.md`.
- **Exceção no lugar de código de erro; onde `null` pode aparecer:** `../../clean-code/reference/tratamento-erros.md`.
- **Comentário só para o porquê:** `../../clean-code/reference/comentarios.md`.
- **F.I.R.S.T. e teste limpo:** `../../clean-code/reference/testes-limpos.md`.
- **Teste antes de refatorar:** `../../clean-code/reference/refatoracao.md`.
