# Tratamento de erros — Clean Code, cap. 7

> Peça da skill `clean-code`. Estrutura: princípio → por quê → regras com exemplo → checklist → cross-links.

## Princípio

Trate erro como uma preocupação **separada** do caminho feliz. Use **exceções** — não códigos de erro nem `null` circulando; a mensagem fala com **quem usa**, o contexto técnico vai para o **log**; e classifique a exceção pelo que o **chamador** precisa decidir. No backend, o arranjo é fixo: o service lança a `HttpException` certa, e o erro do banco fica com o filtro global (ver `modulos-backend`).

## Por que importa

- Código de erro e checagem de `null` se **misturam** à lógica e a escondem. Exceção separa o "o que fazer" do "se der errado" — dá para ler cada um isolado.
- `null` que vaza vira `Cannot read properties of null` **longe da origem**; o chamador paga por uma decisão que não foi dele.
- A mensagem chega crua a quem usa o sistema. Id, nome de campo ou código do ORM nela confundem quem lê e vazam a estrutura interna.
- **TS não tem *checked exceptions***: nada na assinatura diz o que uma função lança. Por isso o prefixo `assert*` e a exceção certa no ponto exato da falha pesam ainda mais.

## As regras (com exemplo no nosso stack)

### 1. Exceção, não código de erro
Código de erro obriga o chamador a checar e ramificar a cada passo. Exceção deixa o caminho feliz limpo.
```ts
// ruim: o chamador tem que checar e ramificar
const result = await this.cancel(id);
if (result === CancelResult.NotFound) { /* ... */ }
// bom: o caminho feliz fica limpo; a resposta de erro sai pelo filtro do NestJS
await this.cancel(id); // lança NotFoundException ou UnprocessableEntityException
```

### 2. `null` só na fronteira de persistência — e convertido na hora
`T | null` espalha `if (x)` por todo chamador. A única fonte legítima é a leitura do repositório por id: ausência é um valor ali. O service converte em exceção **na linha seguinte**, uma vez, e dali para fora `null` não circula.
```ts
// ruim: o null atravessa o service e cada chamador precisa lembrar de checar
async findById(id: number) {
  return this.repository.findById(id); // Promise<Course | null>
}
// bom: a ausência vira 404 uma vez, na origem
async findById(id: number) {
  const course = await this.repository.findById(id);
  if (!course) throw new NotFoundException('Curso não encontrado');
  return course;
}
```
Quando "não ter" é resposta normal, não é erro: devolva lista vazia, `false` ou um valor padrão (regra 5).

### 3. A mensagem é para quem usa; o contexto é para o log
A mensagem nomeia o **conceito de domínio**, em pt-BR, sem id, nome de campo, nome de constraint ou detalhe do ORM. O contexto técnico (operação, id, causa) vai para o log, quando a falha é inesperada.
```ts
// ruim: id, nome técnico e idioma do código na cara do usuário
throw new ConflictException(`Enrollment ${courseId}/${studentEmail} duplicated`);
// bom
throw new ConflictException('Este aluno já está matriculado neste curso');
```

### 4. Classifique pela necessidade do chamador — e não capture o ORM
No NestJS, o chamador final é o cliente HTTP, e a hierarquia `HttpException` é a classificação: 404 não existe, 409 conflito, 422 regra recusa, 403 sem permissão. Quem lança é o **service**. O erro do Prisma **não** é capturado nem no service nem no repositório: violação de restrição do banco sobe para o filtro global, que responde com status e mensagem genéricos. Quando a frase precisa nomear o conceito, o service **confere antes**, e a restrição do banco continua como garantia.
```ts
// ruim: o service conhece o código do Prisma
try {
  return await this.repository.create(dto);
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictException('Este aluno já está matriculado neste curso');
  }
  throw error;
}
// bom: a frase vem da conferência; a corrida rara cai no 409 genérico do filtro
await this.assertNotEnrolled(dto.courseId, dto.studentEmail);
return this.repository.create(dto);
```

### 5. Defina o fluxo normal (Special Case) — não trate o esperado como erro
Quando a "exceção" é um caso de negócio **comum**, devolva um valor normal em vez de espalhar `try/catch`.
```ts
// ruim: "curso sem aulas" tratado como erro
let lessons: Lesson[];
try { lessons = await this.lessonsService.findAll(courseId); } catch { lessons = []; }
// bom: lista vazia é resposta normal
const lessons = await this.lessonsService.findAll(courseId); // [] quando não há aulas
```

### 6. Lance só `Error` — e nunca engula o `catch`
`throw "texto"` perde o *stack trace*; `catch {}` vazio esconde o bug e mente que deu tudo certo. Se não sabe tratar, **relança**.
```ts
// ruim
try { await this.syncCatalog(); } catch {}            // erro some sem rastro
// bom
try {
  await this.syncCatalog();
} catch (error) {
  this.logger.error('sincronização do catálogo falhou', error);
  throw error;
}
```

> No front, o mesmo princípio aparece como **Error Boundary** (erro de render) e **estado de erro explícito** no fetch — não engula o erro dentro do componente, e falha de carga não vira lista vazia.

## Checklist (revisão rápida)

- [ ] A função sinaliza falha por **exceção**, não por código de erro?
- [ ] `null` só aparece na leitura do repositório, e o service o converte na linha seguinte?
- [ ] A mensagem nomeia o conceito, em pt-BR, sem id, campo, constraint ou detalhe do ORM?
- [ ] O service lança a `HttpException` certa (404/409/422/403)?
- [ ] Nenhum `try/catch` de erro do Prisma no service ou no repositório? Frase específica vem de conferência prévia?
- [ ] Caso de negócio comum é **fluxo normal** (Special Case), não `try/catch`?
- [ ] Nenhum `catch` está **vazio**? O que não sei tratar é **relançado**?

## Cross-links

- `funcoes.md` — o miolo do `try` deve ser "uma coisa"; extraia o corpo para uma função bem nomeada.
- `objetos-e-dados.md` — Special Case é um objeto que encapsula o caso excepcional (Tell, Don't Ask).
- `fronteiras.md` — o Prisma é fronteira: só o repositório o toca, e o erro dele não vaza para dentro.
- `smells.md` — "código de erro", "`null` retornado" e "`catch` vazio" são cheiros desta peça.
- `../../modulos-backend/reference/vocabulario-e-ordem.md` — a tabela de quem trata cada erro e o filtro global genérico.
