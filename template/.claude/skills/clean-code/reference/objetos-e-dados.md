# Objetos vs estruturas de dados — Clean Code, cap. 6

> Peça da skill `clean-code`. Estrutura: princípio → por quê → regras com exemplo → checklist → cross-links.

## Princípio

Objeto e estrutura de dados são **opostos**. Um **objeto** esconde os dados e expõe comportamento (`price.applyDiscount()`); uma **estrutura de dados** expõe os dados e quase não tem comportamento (`{ id, title, isPublished }`). Escolha um lado **de propósito** — o meio-termo (híbrido) junta as desvantagens dos dois.

## Por que importa — a anti-simetria

- **Estrutura de dados + funções** (procedural): somar comportamento novo é só somar uma função; mas mudar a *forma* do dado obriga a mexer em todas as funções.
- **Objeto**: somar um tipo novo é só somar uma classe; mas somar comportamento novo obriga a mexer em todas as classes.
- Nenhum lado é "o certo" — é certo o que torna **barata a mudança do eixo que mais varia**. Escolher por hábito é o erro.
- **No nosso stack isso já está decidido na maior parte:** o que o repositório devolve, os DTOs e as props do React são **estruturas de dados**; services e componentes são as **funções** que operam sobre elas. É majoritariamente procedural — e tudo bem. Só saiba o custo: a regra de negócio mora nos services, e trocar a forma de uma estrutura é a mudança cara.

## As regras (com exemplo no nosso stack)

### 1. Esconda a forma; exponha a essência
Abstração de dados **não** é pôr getter/setter na frente de cada campo — é expor o dado pela sua *essência* e esconder a representação (centavos, índice, flag).
```ts
// ruim: vaza a representação — quem lê precisa saber que é centavo
class CoursePrice { public amountInCents: number; }
// bom: expõe a essência; a unidade é detalhe interno
class CoursePrice {
  private amountInCents: number;
  amount(): Money { /* converte internamente */ }
  isFree(): boolean { return this.amountInCents === 0; }
}
```

### 2. Não construa híbrido
Decida: ou **estrutura de dados** (sem método com regra) ou **objeto** (dados privados). O híbrido — dados públicos **e** comportamento com regra — deixa a invariante furável.
```ts
// ruim (híbrido): status é público E há uma regra que deveria controlá-lo
class Enrollment {
  public status: 'ACTIVE' | 'CANCELLED';
  cancel() { if (this.status === 'ACTIVE') this.status = 'CANCELLED'; }
}
enrollment.status = 'CANCELLED'; // furou o cancel(): a regra não vale nada
```
No nosso stack a saída costuma ser a estrutura de dados pura, com a regra no service (`assertIsActive`) e a escrita no repositório (`cancel`).

### 3. Lei de Deméter: fale com amigos, não com estranhos
Um método só deve conversar com a própria classe, com o que ele **cria**, com seus **argumentos** e com seus **campos** — não com o que essas chamadas *retornam*.
```ts
// ruim: train wreck — navega o interior de outros objetos
const email = enrollment.getCourse().getInstructor().getEmail();
// bom: diga ao objeto o que fazer; ele conhece os próprios dados (Tell, Don't Ask)
await notifier.notifyInstructor(enrollment.courseId, message);
```

### 4. Ressalva: estrutura de dados pode encadear
Deméter fala de **objetos** (comportamento escondido). Uma **estrutura de dados** — o detalhe que o service monta (`{ ...course, lessons }`) — não esconde nada, então `courseDetail.lessons[0].title` é só navegação e **não** viola a lei. O sinal de alerta não é o `.`, é o `?.` **profundo e repetido**: ele denuncia acoplamento à forma interna — isole num seletor.
```ts
// ok: navegação de dados (estrutura, sem comportamento)
const firstLessonTitle = courseDetail.lessons[0].title;
// cheiro: optional-chaining fundo espalhado acopla a tela inteira à forma
const title = data?.course?.lessons?.[0]?.title ?? '—'; // isole num seletor reutilizável
```
Navegar dado é diferente de **buscar** dado: a estrutura que se navega foi montada pelo dono de cada parte, nunca por `include` atravessando para a tabela de outro módulo (`../../modulos-backend/reference/propriedade-de-tabelas.md`).

## Checklist (revisão rápida)

- [ ] A classe **esconde a representação** ou só pôs getter/setter na frente das variáveis?
- [ ] Isto é **objeto** (dados privados + comportamento) **ou** **estrutura de dados** (dados, sem regra) — e não um **híbrido**?
- [ ] Há **train wreck** sobre objetos com comportamento? → peça ao objeto, não navegue até os dados.
- [ ] Se a cadeia é sobre **estrutura de dados**, beleza — mas `?.` profundo repetido não está acoplando a base à forma?
- [ ] Alguma **invariante** de negócio pode ser furada por um campo público? → feche o acesso ou mova a regra.

## Cross-links

- `funcoes.md` — *Tell, Don't Ask* empurra a lógica para dentro de quem é dono do dado; a função continua fazendo uma coisa.
- `nomes.md` — esconder a representação começa por nomear a essência (`amount`), não a forma (`amountInCents` público).
- `smells.md` — *Feature Envy* e *train wreck* são os cheiros desta peça.
- `../../modulos-backend/reference/propriedade-de-tabelas.md` — quem monta cada parte do dado que se navega.
