# Classes — Clean Code, cap. 10

> Peça da skill `clean-code`. Estrutura: princípio → por quê → regras com exemplo → checklist → cross-links.

## Princípio

Uma classe deve ser **pequena** — e o tamanho se mede em **responsabilidades**, não em linhas. Ela tem **uma só razão para mudar** (SRP) e é **coesa**: poucos campos, e os métodos de fato usam esses campos.

## Por que importa

- Classe com várias responsabilidades muda por vários motivos; cada mudança arrisca quebrar as outras responsabilidades que moram junto.
- Classe enorme é a "gaveta onde se joga tudo": achar e alterar algo exige varrer o que não tem relação. Muitas classes pequenas e rotuladas se navegam melhor, não pior.
- Baixa coesão (métodos que não compartilham campos) é o sinal de que há **duas classes** disfarçadas de uma.

## As regras (com exemplo no nosso stack)

### 1. Pequena = uma responsabilidade (e o nome denuncia)
Se você não consegue nomear a classe sem "Manager/Processor/Util" nem sem usar "e/ou", ela faz coisas demais. Teste: descreva-a em ~25 palavras sem "se/e/ou".
```ts
// ruim: o nome já confessa o acúmulo
class CourseManager {
  publish() {} enroll() {} sendWelcomeEmail() {} exportReport() {}
}
// bom: cada razão para mudar no seu conjunto (ver modulos-backend)
class CoursesService { publish() {} }       // courses/ — regra do curso
class EnrollmentsService { create() {} }    // enrollments/ — regra da matrícula
class CourseReportsService { export() {} }  // courses/reports/ — relatório, submódulo
```
No backend, "separar a classe" é decidir **onde ela mora**: o segundo service nunca vai para a mesma pasta, vira submódulo ou módulo irmão.

### 2. SRP: uma, e só uma, razão para mudar
Separe o que muda por motivos diferentes. No NestJS: **controller fino** (só HTTP), **service** com a regra, **repository** com o acesso a dado.
```ts
// ruim: o controller decide regra de negócio, fala HTTP e consulta o banco
@Post()
async create(@Body() dto: CreateEnrollmentDto) {
  const existing = await this.db.enrollment.findUnique(/* ... */);
  if (existing) throw new ConflictException('Este aluno já está matriculado neste curso');
  return this.db.enrollment.create({ data: dto });
}
// bom: o controller só delega; a regra mora no service, o acesso no repositório
@Post()
async create(@Body() dto: CreateEnrollmentDto) {
  return this.service.create(dto);
}
```

### 3. Coesão: poucos campos, e os métodos os usam
Se um grupo de métodos não toca nenhum campo que os outros usam, a classe provavelmente são duas.
```ts
// cheiro: 'mailer' só é usado por um método; o resto opera sobre 'repository'
class EnrollmentsService {
  constructor(private readonly repository: EnrollmentsRepository, private readonly mailer: Mailer) {}
  create() { /* usa repository */ }
  cancel() { /* usa repository */ }
  sendReminder() { /* usa só mailer — provável que seja de outro módulo */ }
}
```

### 4. Isole da mudança: dependa de abstração, não de concreto
Campo do tipo de uma **interface sua**, injetado — não o concreto instanciado com `new`. Estruture para que adicionar comportamento seja **estender**, não **modificar**.
```ts
// ruim: amarrado ao concreto → difícil testar e trocar
class EnrollmentCheckout { private gateway = new StripePaymentGateway(API_KEY); }
// bom: depende da abstração; o concreto entra por injeção
class EnrollmentCheckout { constructor(private readonly gateway: PaymentGateway) {} }
```

## Checklist (revisão rápida)

- [ ] Dá para **nomear** a classe sem "Manager/Processor/Util" e descrevê-la em ~25 palavras sem "e/ou"?
- [ ] Ela tem **uma só razão para mudar**?
- [ ] Os métodos **compartilham** os campos (coesão), ou há um grupo que vive isolado?
- [ ] O **controller** está fino (HTTP), a **regra** no service e o **acesso a dado** no repositório?
- [ ] Os campos são **abstrações injetadas**, não concretos criados com `new`?

## Cross-links

- `funcoes.md` — classe pequena é feita de funções pequenas; a *stepdown rule* vale dentro da classe.
- `objetos-e-dados.md` — classe coesa esconde dados e expõe comportamento (é "objeto", não saco de dados).
- `fronteiras.md` — depender de abstração começa por encapsular o terceiro atrás da **sua** interface.
- `smells.md` — "classe grande", "nome genérico" e "baixa coesão" são cheiros desta peça.
- `../../modulos-backend/reference/anatomia-do-modulo.md` — o que vai em cada uma das três camadas.
