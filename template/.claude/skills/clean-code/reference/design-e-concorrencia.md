# Design simples e concorrência — Clean Code, cap. 11-13

> Peça da skill `clean-code`. Estrutura: princípio → por quê → regras com exemplo → checklist → cross-links.
> Condensa três capítulos: Sistemas (11), Design Emergente (12) e Concorrência (13).

## Princípio

Três ideias que fazem o design **emergir** em vez de ser adivinhado: o **design simples** (as 4 regras de Kent Beck), **separar a construção do uso** (montar o sistema é uma preocupação à parte do que ele faz) e tratar **concorrência** como uma decisão de design **isolada**, não um detalhe espalhado.

## Por que importa

- Você não precisa adivinhar o design certo de antemão: se roda os testes, remove duplicação e expressa a intenção, um bom design **emerge** da refatoração contínua.
- Misturar "como eu construo os objetos" com "o que eles fazem" acopla *startup* e regra de negócio — e mata a testabilidade (não dá para injetar um dublê).
- Concorrência espalhada gera bugs que "não se reproduzem" e por isso são ignorados como caso isolado. Isolada, ela é contível e testável.

## As regras (com exemplo no nosso stack)

### 1. Design simples: as 4 regras, nesta ordem (Kent Beck)
1. **Roda todos os testes** — um design verificável puxa para classes pequenas e baixo acoplamento.
2. **Sem duplicação** — o inimigo nº 1 do design limpo; refatore para um único lugar.
3. **Expressa a intenção** — nomes, funções pequenas, testes como documentação.
4. **Mínimo de classes/métodos** — não leve as regras 2 e 3 ao ponto de inflar; é a de **menor** prioridade.

A ordem **é** a prioridade: primeiro faça passar, depois limpe (duplicação → expressividade).

### 2. Separe a construção do uso (DI, não `new` no meio da regra)
A montagem das dependências é uma preocupação à parte da lógica. No NestJS o container injeta; a classe só recebe e usa.
```ts
// ruim: lazy-init mistura construção com uso e impede injetar um dublê no teste
get mailer() { return (this.cachedMailer ??= new SmtpMailer(env.SMTP_URL)); }
// bom: recebe pronto; o módulo faz o wiring, o teste injeta um dublê
constructor(private readonly mailer: Mailer) {}
```
*Cross-cutting concerns* (log, transação, autenticação) → Interceptors/Guards do NestJS, não espalhados pela regra.

### 3. Concorrência no Node é corrida de ESTADO, não de memória
JS é single-thread + *event loop*: não há memória compartilhada entre threads como em Java. O perigo é o **estado externo** — duas requisições lendo-modificando-escrevendo a mesma linha. A seção crítica mora no **repositório**: uma **operação atômica** no banco, uma **transação**, ou uma **restrição** que o banco garante.
```ts
// ruim (no repositório, supondo uma coluna seatsLeft): ler-modificar-escrever → a 2ª requisição sobrescreve a 1ª
const course = await this.db.course.findUnique({ where: { id }, select: { seatsLeft: true } });
await this.db.course.update({ where: { id }, data: { seatsLeft: course.seatsLeft - 1 } });
// bom: atômico no banco — sem janela entre ler e escrever
await this.db.course.update({ where: { id }, data: { seatsLeft: { decrement: 1 } } });
```
Conferência prévia no service (o look-before que dá a frase do conceito) **não** é proteção contra corrida: quem protege é a restrição do banco. Mantenha o pouco código de concorrência **separado** (SRP) e prefira **dados imutáveis/cópias** a estado compartilhado.

## Checklist (revisão rápida)

- [ ] Os **testes passam** e o código é testável (design verificável)?
- [ ] **Zero duplicação** de lógica (um conceito, um lugar)?
- [ ] O código **expressa a intenção** (nomes, funções pequenas)?
- [ ] Sem **classes/métodos a mais** só por dogma?
- [ ] As dependências são **injetadas**, não construídas no meio da regra?
- [ ] Todo **ler-modificar-escrever** de estado compartilhado é atômico, está em transação ou é garantido por restrição do banco?

## Cross-links

- `funcoes.md` / `nomes.md` — "sem duplicação" e "expressivo" são essas peças aplicadas ao design inteiro.
- `classes.md` — "roda os testes" empurra para SRP e injeção de dependência.
- `testes-limpos.md` — a regra nº 1 do design simples depende de testes limpos.
- `smells.md` — duplicação e código especulativo são cheiros desta peça.
- `../../modulos-backend/reference/modelagem-prisma.md` — onde cada invariante é garantida (DTO, service, banco).
- `padroes-de-projeto.md` — "mínimo de classes" = não introduzir padrão sem problema real.
