# Gabarito — o conjunto de módulos de onde saem todos os exemplos

## 1. Princípio

Todo exemplo das skills `modulos-backend` e `clean-code` sai **deste** domínio fictício — cursos, aulas e matrículas —, escrito por inteiro e coerente entre si. Nas peças da `modulos-backend`, o exemplo **bom** é um trecho deste arquivo, e o **ruim** é uma variação dele com o defeito à vista. Nas da `clean-code`, o trecho é pequeno e pode não estar aqui, mas usa este domínio, estes nomes e estas convenções. Nenhum exemplo vem de projeto real.

## 2. Por quê

O agente copia exemplo com mais força do que obedece texto. Exemplo tirado de projeto real carrega o que lá é acidental (um nome fora do padrão, uma exceção que só fazia sentido naquele caso) e prende a régua ao estado daquele código. Com um gabarito único, fictício e consistente, o exemplo e a regra nunca se contradizem, e o código do projeto aberto continua sendo o que deve ser: **medido** contra a régua, nunca copiado.

## 3. Exemplo

### Convenções que o gabarito fixa

- **Idioma:** identificadores, pastas e arquivos em **inglês**; mensagem que chega ao usuário, texto do Swagger e comentário em **pt-BR**.
- **Erro:** o service lança a `HttpException` certa, com a mensagem do conceito. O repositório não captura erro do ORM; violação de restrição do banco (unicidade, chave estrangeira, registro que sumiu entre ler e escrever) vai para o **filtro global** de `core/`, que responde com status e mensagem **genéricos**. Quando a frase precisa nomear o conceito, o service confere antes e a restrição do banco fica como rede de segurança.
- **`null`:** só o repositório devolve `T | null`, na leitura por id. O service converte em exceção na linha seguinte; dali para fora, `null` não circula como sinal de erro.
- **Prisma:** só `*.repository.ts` e `adapters/**` importam o client e os tipos `Prisma.*`. O repositório expõe tipos próprios (`CourseChanges`, `LessonOrder`) para o service.
- **Cache:** só existe onde a medição mostrou dor. Mora no **repositório do dono da tabela**, atrás da interface `CacheStore` de `core/cache`, e o mesmo repositório o invalida nas próprias escritas. Ausência não é cacheada. Quem consome o dado por porta ganha o cache sem saber dele.
- **Trabalho lento fora da requisição:** vai para fila (BullMQ, mesmo Redis), com payload só de ids e `jobId` determinístico. A entrada da fila é `<modulo>.jobs.ts`, que recebe e delega ao service, como o controller.

### Árvore

```text
src/core/
├── cache/
│   ├── cache.module.ts                   Redis via @nestjs/cache-manager + @keyv/redis
│   ├── cache-store.ts                    a interface que os repositórios usam, e o token
│   └── keyv-cache-store.ts               a implementação: single-flight, TTL com variação, sem cachear ausência
├── queue/
│   └── queue.module.ts                   conexão do BullMQ com o mesmo Redis
└── mail/
    └── mailer.ts                         a interface de envio de e-mail, e o token
src/modules/
├── courses/                              módulo com submódulo
│   ├── courses.module.ts
│   ├── courses.controller.ts
│   ├── courses.service.ts
│   ├── courses.repository.ts
│   ├── dto/
│   │   ├── create-course.dto.ts
│   │   ├── update-course.dto.ts
│   │   └── find-courses.dto.ts
│   ├── adapters/
│   │   └── course-catalog.adapter.ts     implementa a porta que enrollments declara
│   └── lessons/                          submódulo: o pai chama o filho
│       ├── lessons.module.ts
│       ├── lessons.controller.ts
│       ├── lessons.service.ts
│       ├── lessons.repository.ts
│       └── dto/
│           ├── create-lesson.dto.ts
│           └── reorder-lessons.dto.ts
└── enrollments/                          módulo cliente: precisa de dado de courses
    ├── enrollments.module.ts
    ├── enrollments.controller.ts
    ├── enrollments.service.ts
    ├── enrollments.repository.ts
    ├── enrollments.jobs.ts               entrada que não é HTTP: a fila de e-mails da matrícula
    ├── enrollments.tokens.ts
    ├── ports/
    │   └── course-catalog.provider.ts
    └── dto/
        ├── create-enrollment.dto.ts
        └── find-enrollments.dto.ts
```

`courses` não tem `.tokens.ts` porque não declara porta: o arquivo existe quando o módulo **consome** algo por porta.

### Schema

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

model Lesson {
  id              Int               @id @default(autoincrement())
  title           String            @db.VarChar(120)
  position        Int
  durationMinutes Int
  courseId        Int
  course          Course            @relation(fields: [courseId], references: [id], onDelete: Restrict)
  completions     CompletedLesson[]
  createdAt       DateTime          @default(now()) @db.Timestamptz(3)
  updatedAt       DateTime          @updatedAt @db.Timestamptz(3)

  @@unique([courseId, position])
  @@map("lessons")
}

enum EnrollmentStatus {
  ACTIVE
  CANCELLED
}

model Enrollment {
  id           Int               @id @default(autoincrement())
  studentEmail String            @db.VarChar(254)
  status       EnrollmentStatus  @default(ACTIVE)
  courseId     Int
  course       Course            @relation(fields: [courseId], references: [id], onDelete: Restrict)
  completions  CompletedLesson[]
  createdAt    DateTime          @default(now()) @db.Timestamptz(3)
  updatedAt    DateTime          @updatedAt @db.Timestamptz(3)

  @@unique([courseId, studentEmail])
  @@map("enrollments")
}

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

Donos: `courses` é dono de `courses`; `courses/lessons` de `lessons`; `enrollments` de `enrollments` e `completed_lessons`.

### `core/` — o que os módulos usam

```ts
// core/cache/cache-store.ts — a interface é nossa; o Redis é detalhe atrás dela
export interface CacheStore {
  getOrLoad<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T>;
  invalidate(...keys: string[]): Promise<void>;
}

export const CACHE_STORE = Symbol('CacheStore');
```

```ts
// core/cache/keyv-cache-store.ts
@Injectable()
export class KeyvCacheStore implements CacheStore {
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async getOrLoad<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const cached = await this.cache.get<T>(key);
    if (cached !== undefined) return cached;

    const pending = this.inFlight.get(key) ?? this.loadAndStore(key, ttlMs, load);
    this.inFlight.set(key, pending);
    return pending as Promise<T>;
  }

  async invalidate(...keys: string[]) {
    await Promise.all(keys.map((key) => this.cache.del(key)));
  }

  private async loadAndStore<T>(key: string, ttlMs: number, load: () => Promise<T>) {
    try {
      const value = await load();
      if (value !== null && value !== undefined) await this.cache.set(key, value, this.computeTtl(ttlMs));
      return value;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private computeTtl(ttlMs: number) {
    // ±10%: chaves gravadas juntas não vencem juntas e não derrubam o banco ao mesmo tempo.
    return Math.round(ttlMs * (0.9 + Math.random() * 0.2));
  }
}
```

`inFlight` é o *single-flight*: requisições simultâneas pela mesma chave ausente esperam uma única carga, em vez de cada uma ir ao banco. Ele vale por instância; com várias instâncias, a mesma ideia exige um lock no Redis (`SET … NX`). Ausência não vai para o cache: um curso criado depois não pode ficar "inexistente" até a chave vencer.

```ts
// core/cache/cache.module.ts
@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        stores: [createKeyv(`redis://${config.getOrThrow('REDIS_HOST')}:${config.getOrThrow('REDIS_PORT')}`)],
      }),
    }),
  ],
  providers: [{ provide: CACHE_STORE, useClass: KeyvCacheStore }],
  exports: [CACHE_STORE],
})
export class AppCacheModule {}
```

```ts
// core/queue/queue.module.ts
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { host: config.getOrThrow('REDIS_HOST'), port: Number(config.getOrThrow('REDIS_PORT')) },
        defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 1000 },
      }),
    }),
  ],
})
export class AppQueueModule {}
```

```ts
// core/mail/mailer.ts
export interface Mailer {
  send(message: { to: string; template: string; data: Record<string, string> }): Promise<void>;
}

export const MAILER = Symbol('Mailer');
```

### `courses/` — o módulo pai

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

```ts
// courses/courses.controller.ts
@UseGuards(AccessTokenGuard)
@ApiTags('Courses')
@Controller('courses')
export class CoursesController {
  constructor(private readonly service: CoursesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar cursos' })
  @ApiResponse({ status: 200, description: 'Página de cursos.' })
  async findAll(@Query() query: FindCoursesDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhar curso, com as aulas' })
  @ApiResponse({ status: 200, description: 'Curso retornado.' })
  @ApiResponse({ status: 404, description: 'Curso não encontrado.' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Criar curso (nasce não publicado)' })
  @ApiResponse({ status: 201, description: 'Curso criado.' })
  @ApiResponse({ status: 400, description: 'Dados inválidos.' })
  async create(@Body() dto: CreateCourseDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Alterar curso' })
  @ApiResponse({ status: 200, description: 'Curso alterado.' })
  @ApiResponse({ status: 404, description: 'Curso não encontrado.' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCourseDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publicar curso' })
  @ApiResponse({ status: 200, description: 'Curso publicado.' })
  @ApiResponse({ status: 404, description: 'Curso não encontrado.' })
  @ApiResponse({ status: 422, description: 'Curso já publicado ou sem aulas.' })
  async publish(@Param('id', ParseIntPipe) id: number) {
    return this.service.publish(id);
  }

  @Post(':id/lessons')
  @ApiOperation({ summary: 'Acrescentar aula ao curso' })
  @ApiResponse({ status: 201, description: 'Aula criada.' })
  @ApiResponse({ status: 404, description: 'Curso não encontrado.' })
  @ApiResponse({ status: 409, description: 'Já existe uma aula nesta posição.' })
  async addLesson(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateLessonDto) {
    return this.service.addLesson(id, dto);
  }
}
```

```ts
// courses/courses.service.ts
@Injectable()
export class CoursesService {
  constructor(
    private readonly repository: CoursesRepository,
    private readonly lessonsService: LessonsService,
  ) {}

  async findAll(query: FindCoursesDto) {
    return this.repository.findAll(query);
  }

  async findOne(id: number) {
    const course = await this.repository.findOne(id);
    if (!course) throw new NotFoundException('Curso não encontrado');
    const lessons = await this.lessonsService.findAll(id);
    return { ...course, lessons };
  }

  async findById(id: number) {
    const course = await this.repository.findById(id);
    if (!course) throw new NotFoundException('Curso não encontrado');
    return course;
  }

  async create(dto: CreateCourseDto) {
    return this.repository.create(dto);
  }

  async update(id: number, dto: UpdateCourseDto) {
    await this.findById(id);
    return this.repository.update(id, dto);
  }

  async publish(id: number) {
    const course = await this.findById(id);
    this.assertNotPublished(course);
    const lessonCount = await this.lessonsService.countByCourse(id);
    this.assertHasLessons(lessonCount);
    return this.repository.update(id, { isPublished: true });
  }

  async addLesson(courseId: number, dto: CreateLessonDto) {
    await this.findById(courseId);
    return this.lessonsService.create(courseId, dto);
  }

  private assertNotPublished(course: { isPublished: boolean }) {
    if (course.isPublished) throw new UnprocessableEntityException('Este curso já está publicado');
  }

  private assertHasLessons(lessonCount: number) {
    if (lessonCount === 0) throw new UnprocessableEntityException('Um curso precisa de ao menos uma aula para ser publicado');
  }
}
```

```ts
// courses/courses.repository.ts
const COURSE_SUMMARY = {
  id: true,
  title: true,
  isPublished: true,
  updatedAt: true,
} as const satisfies Prisma.CourseSelect;

export type CourseChanges = Partial<Pick<Course, 'title' | 'description' | 'isPublished'>>;

// Medido: findById está em toda publicação e em toda matrícula (pela porta), e o curso muda pouco.
const COURSE_CACHE_TTL_MS = 10 * 60 * 1000;
const courseCacheKey = (id: number) => `courses:${id}:summary`;

@Injectable()
export class CoursesRepository {
  constructor(
    private readonly db: DatabaseService,
    @Inject(CACHE_STORE) private readonly cache: CacheStore,
  ) {}

  async findAll({ page, pageSize }: FindCoursesDto) {
    const [items, total] = await this.db.$transaction([
      this.db.course.findMany({
        select: COURSE_SUMMARY,
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.course.count(),
    ]);
    return { items, total };
  }

  async findOne(id: number) {
    return this.db.course.findUnique({ where: { id }, select: { ...COURSE_SUMMARY, description: true } });
  }

  async findById(id: number) {
    return this.cache.getOrLoad(courseCacheKey(id), COURSE_CACHE_TTL_MS, () =>
      this.db.course.findUnique({ where: { id }, select: COURSE_SUMMARY }),
    );
  }

  async create(data: CreateCourseDto) {
    return this.db.course.create({ data, select: COURSE_SUMMARY });
  }

  async update(id: number, changes: CourseChanges) {
    const course = await this.db.course.update({ where: { id }, data: changes, select: COURSE_SUMMARY });
    await this.cache.invalidate(courseCacheKey(id));
    return course;
  }
}
```

O cache é do dono: só `CoursesRepository` grava na tabela `courses`, então só ele sabe quando a chave ficou velha — e ele a invalida na mesma operação. O service não sabe que há cache; `findById` continua devolvendo `T | null`.

```ts
// courses/adapters/course-catalog.adapter.ts — o dono implementa a porta que o consumidor declarou
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

### `courses/lessons/` — o submódulo

```ts
// courses/lessons/lessons.module.ts
@Module({
  controllers: [LessonsController],
  providers: [LessonsService, LessonsRepository],
  exports: [LessonsService],
})
export class LessonsModule {}
```

O filho exporta o próprio service para o pai: os dois são o mesmo agregado, e entre eles não há porta.

```ts
// courses/lessons/lessons.controller.ts — só rotas que tocam apenas a tabela do filho
@UseGuards(AccessTokenGuard)
@ApiTags('Lessons')
@Controller('lessons')
export class LessonsController {
  constructor(private readonly service: LessonsService) {}

  @Put('order')
  @ApiOperation({ summary: 'Reordenar as aulas de um curso' })
  @ApiResponse({ status: 200, description: 'Aulas na nova ordem.' })
  @ApiResponse({ status: 422, description: 'A lista não traz exatamente as aulas do curso.' })
  async reorder(@Body() dto: ReorderLessonsDto) {
    return this.service.reorder(dto.courseId, dto.lessonIds);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remover aula (apaga o registro)' })
  @ApiResponse({ status: 200, description: 'Aula removida.' })
  @ApiResponse({ status: 404, description: 'Aula não encontrada.' })
  @ApiResponse({ status: 409, description: 'Aula já concluída por algum aluno.' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.service.delete(id);
  }
}
```

A rota literal `order` vem antes de qualquer rota paramétrica do mesmo nível. Criar aula não está aqui: precisa saber se o curso existe, e isso é do pai — a rota é `POST /courses/:id/lessons`, e o pai passa o `courseId` por argumento.

```ts
// courses/lessons/lessons.service.ts
@Injectable()
export class LessonsService {
  constructor(private readonly repository: LessonsRepository) {}

  async findAll(courseId: number) {
    return this.repository.findAll(courseId);
  }

  async findById(id: number) {
    const lesson = await this.repository.findById(id);
    if (!lesson) throw new NotFoundException('Aula não encontrada');
    return lesson;
  }

  async countByCourse(courseId: number) {
    return this.repository.countByCourse(courseId);
  }

  async create(courseId: number, dto: CreateLessonDto) {
    await this.assertPositionIsFree(courseId, dto.position);
    return this.repository.create({ ...dto, courseId });
  }

  async reorder(courseId: number, lessonIds: number[]) {
    const lessons = await this.repository.findAll(courseId);
    this.assertSameLessons(lessons, lessonIds);
    await this.repository.applyOrder(this.computeOrder(lessonIds));
    return this.repository.findAll(courseId);
  }

  async delete(id: number) {
    await this.findById(id);
    return this.repository.delete(id);
  }

  private async assertPositionIsFree(courseId: number, position: number) {
    const isTaken = await this.repository.existsAtPosition(courseId, position);
    if (isTaken) throw new ConflictException('Já existe uma aula nesta posição do curso');
  }

  private assertSameLessons(lessons: { id: number }[], lessonIds: number[]) {
    const current = new Set(lessons.map((lesson) => lesson.id));
    const isSameSet = lessonIds.length === current.size && lessonIds.every((id) => current.has(id));
    if (!isSameSet) throw new UnprocessableEntityException('A nova ordem precisa trazer exatamente as aulas do curso');
  }

  private computeOrder(lessonIds: number[]): LessonOrder[] {
    return lessonIds.map((lessonId, index) => ({ lessonId, position: index + 1 }));
  }
}
```

`assertPositionIsFree` existe para a frase nomear o conceito. O `@@unique([courseId, position])` continua sendo a garantia: duas requisições simultâneas passam pela conferência, e a segunda cai no filtro genérico.

```ts
// courses/lessons/lessons.repository.ts
const LESSON_SUMMARY = {
  id: true,
  title: true,
  position: true,
  durationMinutes: true,
} as const satisfies Prisma.LessonSelect;

export interface NewLesson {
  courseId: number;
  title: string;
  position: number;
  durationMinutes: number;
}

export interface LessonOrder {
  lessonId: number;
  position: number;
}

@Injectable()
export class LessonsRepository {
  constructor(private readonly db: DatabaseService) {}

  async findAll(courseId: number) {
    return this.db.lesson.findMany({ where: { courseId }, select: LESSON_SUMMARY, orderBy: { position: 'asc' } });
  }

  async findById(id: number) {
    return this.db.lesson.findUnique({ where: { id }, select: LESSON_SUMMARY });
  }

  async countByCourse(courseId: number) {
    return this.db.lesson.count({ where: { courseId } });
  }

  async existsAtPosition(courseId: number, position: number) {
    const lesson = await this.db.lesson.findUnique({
      where: { courseId_position: { courseId, position } },
      select: { id: true },
    });
    return lesson !== null;
  }

  async create(data: NewLesson) {
    return this.db.lesson.create({ data, select: LESSON_SUMMARY });
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

  async delete(id: number) {
    return this.db.lesson.delete({ where: { id }, select: LESSON_SUMMARY });
  }
}
```

O service calcula o plano (`computeOrder`, puro, testável sem banco); o repositório aplica numa transação e exporta o tipo do plano. Apagar aula já concluída por algum aluno esbarra no `onDelete: Restrict` de `completed_lessons` e vira o 409 genérico do filtro.

### `enrollments/` — o módulo cliente

```ts
// enrollments/ports/course-catalog.provider.ts — arquivo-folha: nenhum import
export interface ICourseCatalogProvider {
  isOpenForEnrollment(courseId: number): Promise<boolean>;
  findTitles(courseIds: number[]): Promise<Map<number, string>>;
}
```

```ts
// enrollments/enrollments.tokens.ts — arquivo-folha
export const COURSE_CATALOG_PROVIDER = Symbol('ICourseCatalogProvider');
```

```ts
// enrollments/enrollments.module.ts — importa o dono, que provê e exporta o token
@Module({
  imports: [CoursesModule, BullModule.registerQueue({ name: ENROLLMENT_EMAILS_QUEUE })],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService, EnrollmentsRepository, EnrollmentsJobs],
})
export class EnrollmentsModule {}
```

```ts
// enrollments/enrollments.jobs.ts — entrada que não é HTTP: recebe e delega, como o controller
export const ENROLLMENT_EMAILS_QUEUE = 'enrollment-emails';

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

```ts
// enrollments/enrollments.service.ts
@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly repository: EnrollmentsRepository,
    @Inject(COURSE_CATALOG_PROVIDER) private readonly courseCatalog: ICourseCatalogProvider,
    @Inject(MAILER) private readonly mailer: Mailer,
    @InjectQueue(ENROLLMENT_EMAILS_QUEUE) private readonly emails: Queue,
  ) {}

  async findAll(query: FindEnrollmentsDto) {
    const page = await this.repository.findAll(query);
    const titles = await this.courseCatalog.findTitles(page.items.map((enrollment) => enrollment.courseId));
    const items = page.items.map((enrollment) => ({ ...enrollment, courseTitle: titles.get(enrollment.courseId) }));
    return { ...page, items };
  }

  async findById(id: number) {
    const enrollment = await this.repository.findById(id);
    if (!enrollment) throw new NotFoundException('Matrícula não encontrada');
    return enrollment;
  }

  async create(dto: CreateEnrollmentDto) {
    await this.assertCourseIsOpen(dto.courseId);
    await this.assertNotEnrolled(dto.courseId, dto.studentEmail);
    const enrollment = await this.repository.create(dto);
    await this.emails.add('welcome', { enrollmentId: enrollment.id }, { jobId: `welcome-${enrollment.id}` });
    return enrollment;
  }

  async cancel(id: number) {
    const enrollment = await this.findById(id);
    this.assertIsActive(enrollment);
    return this.repository.cancel(id);
  }

  async sendWelcome(enrollmentId: number) {
    const enrollment = await this.findById(enrollmentId);
    await this.mailer.send({ to: enrollment.studentEmail, template: 'enrollment-welcome', data: {} });
  }

  private async assertCourseIsOpen(courseId: number) {
    const isOpen = await this.courseCatalog.isOpenForEnrollment(courseId);
    if (!isOpen) throw new UnprocessableEntityException('Este curso não está aberto para matrícula');
  }

  private async assertNotEnrolled(courseId: number, studentEmail: string) {
    const isEnrolled = await this.repository.existsForStudent(courseId, studentEmail);
    if (isEnrolled) throw new ConflictException('Este aluno já está matriculado neste curso');
  }

  private assertIsActive(enrollment: { status: string }) {
    if (enrollment.status !== 'ACTIVE') throw new UnprocessableEntityException('Esta matrícula já foi cancelada');
  }
}
```

O título do curso chega **em lote** pela porta: uma consulta para a página inteira, sem `include` atravessando para a tabela de outro dono e sem N+1.

O e-mail de boas-vindas sai da requisição: a matrícula responde sem esperar o servidor de e-mail, e uma falha no envio é repetida pela fila com espera crescente, sem desfazer a matrícula. O payload leva só o id — dado pessoal não fica no Redis — e o `jobId` determinístico faz um segundo `add` da mesma matrícula ser ignorado. `sendWelcome` relê a matrícula para trabalhar com o estado atual. A entrega da fila é *ao menos uma vez*: o job pode rodar duas vezes. Para um e-mail de boas-vindas, a duplicata rara é aceitável; quando não for (cobrança, pagamento, nota), o job grava que já fez e confere antes de fazer.

```ts
// enrollments/enrollments.repository.ts
const ENROLLMENT_SUMMARY = {
  id: true,
  courseId: true,
  studentEmail: true,
  status: true,
  createdAt: true,
} as const satisfies Prisma.EnrollmentSelect;

@Injectable()
export class EnrollmentsRepository {
  constructor(private readonly db: DatabaseService) {}

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

  async findById(id: number) {
    return this.db.enrollment.findUnique({ where: { id }, select: ENROLLMENT_SUMMARY });
  }

  async existsForStudent(courseId: number, studentEmail: string) {
    const enrollment = await this.db.enrollment.findUnique({
      where: { courseId_studentEmail: { courseId, studentEmail } },
      select: { id: true },
    });
    return enrollment !== null;
  }

  async create(data: CreateEnrollmentDto) {
    return this.db.enrollment.create({ data, select: ENROLLMENT_SUMMARY });
  }

  async cancel(id: number) {
    return this.db.enrollment.update({ where: { id }, data: { status: 'CANCELLED' }, select: ENROLLMENT_SUMMARY });
  }
}
```

`cancel` tem nome de propósito e esconde o enum do Prisma: o service não precisa importar `EnrollmentStatus`.

### DTOs

```ts
// enrollments/dto/create-enrollment.dto.ts
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

```ts
// courses/dto/update-course.dto.ts
export class UpdateCourseDto extends PartialType(CreateCourseDto, { skipNullProperties: false }) {}
```

`isPublished` não entra no DTO: publicar é a operação `publish`, com regra própria, e não um campo que o cliente edita.

### Testes

```ts
// courses/courses.service.spec.ts
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

  it('publica curso com aulas', async () => {
    repository.findById.mockResolvedValue({ id: 1, isPublished: false });
    lessonsService.countByCourse.mockResolvedValue(3);

    await service.publish(1);

    expect(repository.update).toHaveBeenCalledWith(1, { isPublished: true });
  });
});
```

```ts
// courses/courses.controller.spec.ts — só a delegação; a regra é coberta no service
it('findOne repassa o id', async () => {
  const service = { findOne: jest.fn() };
  const controller = new CoursesController(service as never);

  await controller.findOne(7);

  expect(service.findOne).toHaveBeenCalledWith(7);
});
```

## 4. Checklist

- [ ] O exemplo novo de uma peça é um trecho deste gabarito, sem nome, regra ou tabela de projeto real?
- [ ] Mudou uma convenção (erro, `null`, idioma, porta)? O gabarito mudou junto, e as peças que o citam também?
- [ ] O código do projeto aberto está sendo **medido** contra o gabarito, e não o contrário?

## 5. Cross-links

- O porquê de cada arquivo do conjunto: `anatomia-do-modulo.md`.
- `courses` × `courses/lessons` × `enrollments`: `submodulos.md`.
- A porta de `enrollments` e o adapter de `courses`: `propriedade-de-tabelas.md`.
- Vocabulário, look-before, erros, DTO e testes: `vocabulario-e-ordem.md`.
- O schema acima, regra a regra: `modelagem-prisma.md`.
- Recorte, lote, paginação e índice das consultas acima: `consultas.md`.
- O cache de `CoursesRepository` e a fila de `enrollments`: `cache-e-filas.md`.
