# Cache e filas — Redis com dono, chave, prazo e invalidação

## 1. Princípio

Redis entra para três trabalhos, todos depois de medir: **cache** (não fazer a consulta), **fila** (tirar da requisição o trabalho lento) e **contador entre instâncias** (limite de requisições). Cada um tem dono e regra: o cache mora no **repositório do dono da tabela**, que o invalida nas próprias escritas; o job entra por `<modulo>.jobs.ts` com **payload só de ids**; e a infraestrutura fica em `core/`, atrás de uma interface nossa.

## 2. Por quê

Cada um desses recursos cobra um preço que a consulta direta não cobra:

- **Cache** acrescenta uma segunda fonte de verdade. O difícil nunca é gravar — é saber **quando a chave ficou velha**. Cache sem invalidação desenhada vira dado errado na tela, intermitente e difícil de reproduzir.
- **Fila** troca um erro que aparece na hora por um que aparece depois, num worker. Sem tentativas, idempotência e registro de falha, o trabalho some calado.
- **Contador em memória** vale por instância: com duas instâncias, o limite de tentativas dobra sem ninguém perceber.

A regra do dono único é o que torna o cache administrável: se só um módulo grava na tabela, só ele precisa saber invalidar — e ele sabe, porque é ele quem grava.

## 3. Exemplo

Todos os trechos bons são do [gabarito](./gabarito.md).

### Antes de cachear: quatro respostas

| Pergunta | No gabarito |
|---|---|
| **Que dor?** (número medido) | `findById` de curso em toda publicação e toda matrícula |
| **Que chave?** `<modulo>:<id>:<recorte>` | `courses:12:summary` |
| **Que prazo?** (o atraso aceitável se a invalidação falhar) | 10 min, com ±10% de variação |
| **Quem invalida, e quando?** | `CoursesRepository.update`, na mesma operação que grava |

Sem as quatro respostas, não há cache.

### O cache mora no repositório do dono

```ts
// courses.repository.ts
const COURSE_CACHE_TTL_MS = 10 * 60 * 1000;
const courseCacheKey = (id: number) => `courses:${id}:summary`;

async findById(id: number) {
  return this.cache.getOrLoad(courseCacheKey(id), COURSE_CACHE_TTL_MS, () =>
    this.db.course.findUnique({ where: { id }, select: COURSE_SUMMARY }),
  );
}

async update(id: number, changes: CourseChanges) {
  const course = await this.db.course.update({ where: { id }, data: changes, select: COURSE_SUMMARY });
  await this.cache.invalidate(courseCacheKey(id));
  return course;
}
```

- O service não sabe que há cache; o contrato do repositório não muda (`T | null`).
- O adapter que serve a porta de `enrollments` usa o mesmo `findById` — o consumidor ganha o cache sem saber dele.
- Toda escrita do repositório que muda o recorte cacheado invalida a chave. Escrita nova sem invalidação é bug, e o checklist existe para pegar isso.

**Ruim** — o consumidor cacheia dado de outro dono:

```ts
// enrollments.service.ts — quem invalida quando o curso é despublicado?
const isOpen = await this.cache.getOrLoad(`courses:${courseId}:open`, TTL, () =>
  this.courseCatalog.isOpenForEnrollment(courseId),
);
```

`enrollments` não grava em `courses` e nunca vai saber quando o curso mudou: esse cache só acerta por sorte. Quem quer cache de dado alheio pede ao dono, que o põe atrás da porta.

### O que o `CacheStore` garante

A interface é nossa (`core/cache/cache-store.ts`); o `@nestjs/cache-manager` com `@keyv/redis` é detalhe atrás dela. A implementação do gabarito cuida de três armadilhas:

| Armadilha | Defesa |
|---|---|
| **Estouro** (*stampede*): a chave quente vence e N requisições vão ao banco juntas | *single-flight*: a mesma chave ausente tem uma carga só por instância; com várias instâncias, lock no Redis (`SET … NX`) |
| **Vencimento em bloco**: chaves gravadas juntas vencem juntas | TTL com variação de ±10% |
| **Ausência cacheada**: o registro criado depois fica "inexistente" até a chave vencer | `null`/`undefined` não são gravados |

Configuração mal feita do `cache-manager` cai **calada** para memória local. Ao ligar o Redis, confirme que as chaves aparecem nele.

### O que não se cacheia

- **Resposta inteira de rota autenticada** com `CacheInterceptor`: a chave padrão é a URL, e o dado de um usuário é servido a outro.
- **Dado que depende de quem pergunta** (permissão, departamento), sem o escopo na chave.
- **Dado que muda a cada requisição**, ou leitura que já é barata: o cache só acrescenta risco.
- **Estado que decide escrita** sem conferência no banco: o cache informa, o banco garante.

### Cache no HTTP

Rota autenticada responde com `Cache-Control: no-store` — é o padrão, e o filtro/interceptor global de `core/` o aplica. Arquivo estático ou dado público e estável pode usar `public, max-age=…` com `ETag`, e a revalidação devolve `304` sem corpo. Na dúvida, `no-store`.

### Fila: trabalho lento fora da requisição

Vai para a fila o que o usuário **não precisa esperar**: e-mail, geração de PDF, importação, recálculo pesado, integração externa. Fica na requisição o que a resposta precisa mostrar.

```ts
// enrollments.service.ts — grava, e só então enfileira
async create(dto: CreateEnrollmentDto) {
  await this.assertCourseIsOpen(dto.courseId);
  await this.assertNotEnrolled(dto.courseId, dto.studentEmail);
  const enrollment = await this.repository.create(dto);
  await this.emails.add('welcome', { enrollmentId: enrollment.id }, { jobId: `welcome-${enrollment.id}` });
  return enrollment;
}

// enrollments.jobs.ts — entrada que não é HTTP: recebe e delega
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

Regras de cada job:

- **Payload só de ids.** O job relê o estado atual; dado pessoal não fica gravado em texto no Redis.
- **`jobId` determinístico** (`welcome-<id>`): um segundo `add` da mesma coisa é ignorado.
- **Entrega ao menos uma vez:** o job pode rodar duas vezes. Onde a duplicata dói (cobrança, pagamento, nota), ele grava que já fez e confere antes.
- **Tentativas com espera crescente** (padrão em `core/queue`), e o job que esgota as tentativas fica registrado como falho para alguém olhar — nunca some.
- **Enfileirar depois do commit**, nunca dentro de `$transaction`.
- `<modulo>.jobs.ts` é o par do controller: recebe, delega ao service, não decide. O service enfileira por `@InjectQueue`, como lança `HttpException`: é infraestrutura do Nest que a régua aceita.

### Agendamento

Tarefa periódica também entra por `<modulo>.jobs.ts` e delega ao service. `@Cron` do `@nestjs/schedule` roda **em cada instância**: com duas instâncias, a limpeza roda duas vezes. Enquanto houver uma instância só, `@Cron` serve; com mais de uma, a tarefa vira **job repetível** da fila, que roda uma vez no conjunto.

### Limite de requisições

Login, "esqueci a senha", envio de e-mail e rota pública com corpo têm limite (`@nestjs/throttler`, declarado no controller). O contador padrão é em memória e vale por instância; com mais de uma instância, o armazenamento do throttler vai para o Redis.

### Ambiente

- Redis em `core/` (`REDIS_HOST`, `REDIS_PORT`), local por container.
- Teste unitário usa dublê de `CacheStore` e de `Queue`; o service spec verifica o `add` com o `jobId` certo.
- O e2e sobe com o Redis do ambiente de teste, ou com o store em memória do Keyv por configuração — e o teste da invalidação roda contra o store real ao menos uma vez.

## 4. Checklist

- [ ] Há número medido que justifica o cache, e os degraus de `consultas.md` já foram feitos?
- [ ] As quatro respostas estão escritas: dor, chave, prazo, quem invalida?
- [ ] O cache mora no repositório do **dono** da tabela, atrás de `CacheStore`?
- [ ] Toda escrita do repositório que muda o recorte cacheado invalida a chave?
- [ ] Nenhum módulo cacheia dado de outro dono?
- [ ] Nenhuma resposta de rota autenticada é cacheada por URL; dado por usuário tem o escopo na chave?
- [ ] Ausência não é cacheada; TTL tem variação; chave quente tem single-flight?
- [ ] O job leva só ids, tem `jobId` determinístico e é seguro de rodar duas vezes?
- [ ] O job é enfileirado depois do commit e entra por `<modulo>.jobs.ts`, que só delega?
- [ ] Tarefa periódica com mais de uma instância é job repetível, não `@Cron`?
- [ ] Rota sensível tem limite, com armazenamento compartilhado quando há mais de uma instância?

## 5. Cross-links

- O `CacheStore`, a fila e o `Mailer` completos: `gabarito.md`.
- Os degraus que vêm antes do cache: `consultas.md`.
- Por que só o dono pode cachear e invalidar: `propriedade-de-tabelas.md`.
- Onde `<modulo>.jobs.ts` entra no conjunto: `anatomia-do-modulo.md`.
- **Encapsular o Redis atrás de uma interface nossa:** `../../clean-code/reference/fronteiras.md`.
- **Pacote novo (Redis, fila, throttler) só pelos critérios:** `../../clean-code/reference/complexidade-e-dependencias.md`.
- **Corrida de estado e operação atômica:** `../../clean-code/reference/design-e-concorrencia.md`.
