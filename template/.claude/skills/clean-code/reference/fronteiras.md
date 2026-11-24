# Fronteiras — Clean Code, cap. 8

> Peça da skill `clean-code`. Estrutura: princípio → por quê → regras com exemplo → checklist → cross-links.

## Princípio

A **fronteira** é onde seu código encontra o que você **não controla** — libs de terceiros, APIs externas, o framework, o ORM. Mantenha esse contato **num só lugar**: encapsule o terceiro atrás de uma interface que **você** define e não deixe os tipos dele vazarem para dentro do sistema.

## Por que importa

- O provedor otimiza a API para o caso **geral**; você quer o **seu**. Usar a interface ampla crua espalha poder e detalhe de que você não precisa.
- Se o tipo do terceiro **atravessa** o sistema, trocar a lib — ou só subir a versão — toca em todo arquivo que o menciona. Encapsulado, a troca é num ponto.
- Você depende de algo que **muda quando o dono quiser**. Dependa do que você controla (sua interface), não do que controla você.

## As regras (com exemplo no nosso stack)

### 1. Encapsule o terceiro; não vaze o tipo dele
Envolva a lib num adapter seu; o resto do app fala com a **sua** interface, nunca com o tipo da lib.
```ts
// ruim: o tipo do gateway atravessa a aplicação
async chargeEnrollment(dto: ChargeEnrollmentDto): Promise<Stripe.PaymentIntent> { /* ... */ }
// bom: a fronteira fica dentro do adapter; fora circula o SEU tipo
async charge(amount: Money, card: CardToken): Promise<Payment> {
  const intent = await this.stripe.paymentIntents.create(/* ... */); // só aqui
  return toPayment(intent);
}
```

### 2. Defina a interface que VOCÊ quer (Adapter + DI)
Em vez de moldar seu código à API deles, declare o contrato que sua aplicação precisa e adapte o fornecedor por trás. Ganha troca de fornecedor **e** dublê em teste.
```ts
// a interface é sua; o provedor é detalhe atrás dela
interface PaymentGateway {
  charge(amount: Money, card: CardToken): Promise<Payment>;
}
class StripePaymentGateway implements PaymentGateway { /* adapta a Stripe */ }
// NestJS: injeta por token; trocar de gateway não toca em quem usa
```
É o mesmo desenho das portas entre módulos: quem consome declara a interface, quem implementa se adapta a ela (`../../modulos-backend/reference/propriedade-de-tabelas.md`).

### 3. Learning Test: aprenda a lib num teste isolado
Escreva um teste curto que exercita a API de terceiro **do jeito que você vai usar**. Custa quase nada (você ia aprender a API de qualquer forma) e vira **alarme** quando a lib muda de versão.
```ts
// fixa o comportamento de que você depende; quebra se a nova versão mudar
it('differenceInDays trunca a fração', () => {
  const endsAt = parseISO('2026-01-02T23:00');
  const startsAt = parseISO('2026-01-01T00:00');
  expect(differenceInDays(endsAt, startsAt)).toBe(1); // 1d23h → 1, não 2
});
```

### 4. O Prisma é uma fronteira — só o repositório e os adapters o tocam
O client e os tipos `Prisma.*` ficam em `*.repository.ts` e `adapters/**`. O service recebe os tipos que o repositório expõe (`CourseChanges`, `LessonOrder`) e nunca importa o client; o erro do ORM não é capturado no módulo (vai para o filtro global). A resposta HTTP é o **recorte do `select`** do repositório, nunca a linha inteira com relações.
```ts
// ruim: o service fala com o Prisma e devolve a linha crua
async findById(id: number) {
  return this.prisma.course.findUnique({ where: { id } });
}
// bom: o repositório encapsula o Prisma e devolve só o recorte
// courses.repository.ts
async findById(id: number) {
  return this.db.course.findUnique({ where: { id }, select: COURSE_SUMMARY });
}
```

## Checklist (revisão rápida)

- [ ] O tipo de um terceiro **atravessa** suas assinaturas públicas? → mapeie para um tipo seu.
- [ ] A lib está espalhada por **muitos** arquivos, ou **encapsulada** num ponto?
- [ ] Existe uma **interface sua** entre o app e o fornecedor (dá para trocar/dublar)?
- [ ] Há um **learning test** fixando o comportamento de que você depende?
- [ ] Só o repositório e os adapters importam o client e os tipos do Prisma?
- [ ] A resposta HTTP é o recorte do `select`, e não a linha crua com relações?

## Cross-links

- `tratamento-erros.md` — o erro do ORM não atravessa o módulo: o filtro global responde de forma genérica.
- `objetos-e-dados.md` — o tipo seu na fronteira é a estrutura de dados que você controla.
- `testes-limpos.md` — learning tests seguem o F.I.R.S.T como qualquer teste.
- `../../modulos-backend/reference/propriedade-de-tabelas.md` — portas e adapters entre módulos: a mesma fronteira, dentro do sistema.
