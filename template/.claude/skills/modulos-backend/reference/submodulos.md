# Submódulos — quando dividir, e para que lado

## 1. Princípio

Segunda responsabilidade dentro de um módulo ganha **uma pasta com o nome do subdomínio**, contendo o seu próprio conjunto completo e o seu próprio `.module.ts`. O pai importa o filho e injeta o service dele; **o filho nunca conhece o pai**. A profundidade máxima é de **dois níveis**: quando um submódulo precisaria de submódulos próprios, ele é promovido a módulo irmão.

## 2. Por quê

Dividir por subdomínio mantém junto o que muda junto. "Montar as aulas de um curso" muda quando muda o jeito de organizar conteúdo; "publicar o curso" muda quando muda o critério de publicação. Gatilhos diferentes, rotas diferentes, testes diferentes — dois conjuntos, não um service com quinze métodos.

A **direção** da dependência é o que evita o nó. Pai conhece filho é hierarquia: lê-se de cima para baixo e o filho é testável sozinho, com um dublê só do próprio repositório. Filho conhece pai fecha um ciclo — e ciclo entre módulos custa três coisas concretas: o Nest só resolve com `forwardRef`, o teste do filho passa a exigir o pai inteiro, e o grafo de módulos deixa de ter ponto de entrada.

O limite de dois níveis existe porque o terceiro não acrescenta informação — só esconde. `courses/lessons/materials/attachments/` não diz melhor onde algo mora do que subdomínios irmãos; diz apenas que alguém foi empurrando para dentro. A necessidade de um terceiro nível é o sinal de que o subdomínio do meio ficou grande o bastante para ser módulo por conta própria.

## 3. Exemplo

Todos os trechos são do [gabarito](./gabarito.md).

### Submódulo ou módulo cliente: quem chama quem?

Antes de criar a pasta filha, pergunte: **algum caso de uso do pai chama este módulo?**

- **Sim** → submódulo. O pai importa o filho, o filho não conhece o pai, e o pai coordena passando o dado por argumento. É `courses/lessons/`: publicar um curso conta as aulas, e acrescentar aula passa pelo pai, que confere se o curso existe.
- **Não, e é o módulo quem precisa de dado do pai** → módulo **cliente**. Fica **ao lado** do pai, não dentro dele: importa o módulo do pai, declara a porta de que precisa, o pai provê e exporta o token, e o módulo tem o próprio controller. É `enrollments/`: `courses` nunca chama matrícula, mas a matrícula precisa saber se o curso está aberto.
- **Cheiro que denuncia**: `forwardRef` entre pasta-pai e pasta-filha, ou um "filho" que só existe para ler dado do pai.
- **Volta a ser submódulo** se o fluxo passar a alterar estado do pai na mesma transação — aí o dono da regra é o pai.

A pasta reflete o grafo de imports, não a proximidade de assunto. O Nest não lê pasta; uma pasta aninhada promete hierarquia, e se o grafo aponta ao contrário a promessa é falsa.

```text
courses/                                  ← não importa enrollments
├── adapters/course-catalog.adapter.ts    ← implementa a porta de enrollments
└── lessons/                              ← submódulo: courses chama lessons
enrollments/                              ← importa CoursesModule
├── enrollments.tokens.ts
└── ports/course-catalog.provider.ts      ← declarada aqui
```

### Quando dividir

Divida quando os três sinais aparecerem **juntos**:

1. **Gatilho próprio** — o motivo de mudança é outro, ou quem dispara o fluxo é outra pessoa.
2. **Rotas próprias** — endpoints que não são variação dos do pai.
3. **Tabela própria**, ou um agregado próprio a persistir.

Com um ou dois dos três, é método no service do pai. Com os três, é submódulo.

**Contraexemplo deliberado:** tabela filha que só é escrita através da raiz do agregado **não** ganha submódulo. `completed_lessons` pertence à matrícula: não tem rota própria nem ciclo de vida próprio, então mora no conjunto de `enrollments`, escrita pelo repositório dele.

### A direção da dependência

O pai injetar o service do filho é legítimo e é o arranjo normal — eles pertencem à mesma fronteira, então não há porta no meio:

```ts
// courses/courses.module.ts — o pai importa o módulo do filho
@Module({
  imports: [LessonsModule],
  controllers: [CoursesController],
  providers: [CoursesService, CoursesRepository /* …adapter de enrollments */],
})
export class CoursesModule {}

// courses/courses.service.ts — e injeta o service do filho direto
async publish(id: number) {
  const course = await this.findById(id);
  this.assertNotPublished(course);
  const lessonCount = await this.lessonsService.countByCourse(id); // pergunta ao dono das aulas
  this.assertHasLessons(lessonCount);
  return this.repository.update(id, { isPublished: true });
}
```

Repare que a contagem é **delegada ao dono**: o pai não monta query sobre a tabela do filho.

**Ruim** — o filho sobe para o pai (para criar uma aula, o filho vai conferir se o curso existe):

```ts
// courses/lessons/lessons.module.ts
@Module({
  imports: [forwardRef(() => CoursesModule)], // ← o forwardRef é o sintoma
  providers: [LessonsService, LessonsRepository],
})
export class LessonsModule {}

// courses/lessons/lessons.service.ts
constructor(
  private readonly repository: LessonsRepository,
  private readonly coursesService: CoursesService, // ← filho conhecendo o pai
) {}

async create(courseId: number, dto: CreateLessonDto) {
  await this.coursesService.findById(courseId);
  return this.repository.create({ ...dto, courseId });
}
```

**Bom** — o pai coordena e passa o que só ele sabe:

```ts
// courses/courses.service.ts — "o curso existe" é conhecimento do pai
async addLesson(courseId: number, dto: CreateLessonDto) {
  await this.findById(courseId);
  return this.lessonsService.create(courseId, dto);
}

// courses/lessons/lessons.service.ts — autossuficiente
async create(courseId: number, dto: CreateLessonDto) {
  await this.assertPositionIsFree(courseId, dto.position);
  return this.repository.create({ ...dto, courseId });
}
```

Três ganhos medíveis: o ciclo desaparece, a consulta ao curso acontece uma vez, e o teste do filho deixa de precisar de um dublê do service do pai.

**Regra prática:** quando um fluxo **do pai** precisa de dado dos dois lados, o pai coordena. O que só o pai sabe entra no filho como **argumento**, nunca como dependência injetada.

**Quando essa receita não serve.** Ela pressupõe que o pai chama o filho. Se nenhum caso de uso do pai chama o módulo — a matrícula é o exemplo: quem matricula é o aluno, e `courses` nunca a dispara —, forçar o pai a coordenar faz dele orquestrador de um agregado que não é seu, e o service do pai cresce a cada mudança do fluxo alheio. Isso é módulo cliente (ver "quem chama quem?"), não submódulo.

### O filho não abre porta para o pai

Ports e adapters servem para atravessar **fronteira de domínio**, e a inversão que eles fazem existe para permitir dependência entre domínios sem ciclo. Entre pai e filho não há fronteira a atravessar: eles são o mesmo agregado, e a direção já está resolvida pela hierarquia.

Então o filho **não declara uma porta para o pai implementar**, mesmo que isso "resolvesse" tecnicamente o ciclo:

```ts
// ❌ courses/lessons/ports/course-existence.provider.ts
export interface ICourseExistenceProvider {
  exists(courseId: number): Promise<boolean>;
}
// e courses.module.ts provendo o token com um adapter do próprio pai
```

O ciclo de *import* desaparece, mas o problema real fica: o filho continua **iniciando** uma pergunta que sobe a hierarquia, o teste dele volta a precisar de um dublê do mundo do pai, e a leitura de cima para baixo se perde. A porta ali é **cerimônia com o custo do acoplamento e sem o benefício da inversão**. O que resolve é o pai passar o dado como argumento — e a assinatura do filho fica dizendo exatamente de que ele precisa.

Isso vale também para o caso que mais tenta: **notificação**. Um filho que avisa alguém não busca o destinatário — ele **recebe** a lista. Quem sabe quem deve ser avisado é quem coordena o fluxo.

### Onde mora a rota

A pasta em que uma operação mora é decidida pelo dado que ela toca; **a rota** é decidida por onde o efeito termina. Há uma resposta só para cada caso:

| A rota… | Controller |
|---|---|
| só lê ou grava tabelas do próprio submódulo | do **filho** (`PUT /lessons/order`, `DELETE /lessons/:id`) |
| precisa de dado do pai ou dispara efeito que é do pai | do **pai** (`POST /courses/:id/lessons`) |
| é iniciada pelo recurso de um **módulo cliente** | do **módulo cliente**, com o dado alheio por porta (`POST /enrollments`) |

A escrita continua no repositório do dono; o que muda de lugar é a **coordenação**. O que **não** é aceitável é o filho disparar o efeito que é do pai para poder manter a rota em casa.

Um efeito colateral bom dessa regra: ela sustenta **um service por módulo**. Sem ela, a tentação é criar um segundo service no filho só para orquestrar o que atravessa — e o segundo service é o primeiro passo para a pasta `services/`.

### Submódulo, irmão do pai, ou módulo separado

| Sinal | Fica submódulo | Vira módulo irmão |
|---|---|---|
| O subdomínio só existe ligado ao pai | ✅ | |
| Consumidores externos pedem dado dele, mas sempre a partir do pai | ✅ | |
| Precisaria de submódulos próprios | | ✅ |
| Ganhou ciclo de vida independente — existe sem o pai | | ✅ |
| Tem consumidor externo cujo assunto não é o pai | | ✅ |

**Registre esses gatilhos por escrito** ao decidir manter dentro. Sem isso, a próxima discussão vira intuição e a resposta muda conforme quem está cansado.

### Dois subdomínios irmãos em vez de um aninhado

Quando o subdomínio novo é *sobre* um existente — materiais de apoio são sobre as aulas —, a tentação é aninhar. Preferir irmãos dentro do mesmo pai mantém os dois níveis, e o prefixo do nome carrega o vínculo:

```text
courses/
├── courses.{module,controller,service,repository}.ts
├── lessons/               aulas do curso
└── lesson-materials/      materiais de apoio das aulas
```

Cada um segue com um controller, um service, um repository.

## 4. Checklist

- [ ] O subdomínio tem gatilho próprio, rotas próprias **e** tabela própria? (menos que os três: é método no pai)
- [ ] A pasta tem nome de subdomínio, não de camada?
- [ ] O submódulo tem `.module.ts` próprio, e o pai o importa?
- [ ] Nenhum arquivo do submódulo importa service, módulo ou DTO do pai?
- [ ] Algum caso de uso do pai chama este módulo? (não, e ele precisa de dado do pai: é módulo cliente, ao lado do pai)
- [ ] Nenhum `forwardRef` entre pai e filho?
- [ ] Fluxo que cruza os dois lados é coordenado pelo pai, com o dado entrando por argumento?
- [ ] O pai delega ao filho o que é do filho (contar, validar, gravar), em vez de consultar a tabela dele?
- [ ] Cada rota está no controller que a tabela acima indica, sem alternativa "por conveniência"?
- [ ] A profundidade ficou em dois níveis?
- [ ] Os gatilhos de promoção a módulo irmão estão registrados na decisão escrita?

## 5. Cross-links

- O conjunto `courses` / `courses/lessons` / `enrollments` inteiro: `gabarito.md`.
- Layout do conjunto e das pastas de apoio: `anatomia-do-modulo.md`.
- Quem pode consultar qual tabela, e o que atravessa por porta: `propriedade-de-tabelas.md`.
- **Dividir módulo é refatoração — exige teste antes:** `../../clean-code/reference/refatoracao.md`.
