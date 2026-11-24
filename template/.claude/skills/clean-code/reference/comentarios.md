# Comentários — Clean Code, cap. 4

> Peça da skill `clean-code`. Estrutura: princípio → por quê → regras com exemplo → checklist → cross-links.

## Princípio

Um comentário é, na melhor das hipóteses, um **mal necessário**: ele existe para compensar nossa falha em expressar a intenção no próprio código. Antes de escrever um, tente um **nome melhor** ou uma **função extraída**. O objetivo não é "comentar bem" — é precisar de menos comentário. Quando ele existe, é em **pt-BR** e explica um **porquê**.

## Por que importa

- Código muda; comentário não acompanha. Comentário desatualizado **mente** — e o leitor confia nele.
- Só o código é verificado (pelo compilador, pelos testes, pela execução). O comentário é a única "documentação" que apodrece sem ninguém perceber.
- Comentário redundante é ruído: ele treina o olho a **pular** comentários — inclusive os poucos que importam.

## A regra-mãe: não comente código ruim — reescreva

Quase todo comentário "explicativo" é um nome ou uma função pedindo para nascer. Pague a dívida na fonte, não com uma legenda.
```ts
// ruim: o comentário existe porque a condição é ilegível
// matrícula ativa em curso publicado
if (e.status === 'ACTIVE' && c.isPublished) { ... }
// bom: o nome conta a intenção; o comentário some
if (isAttending(enrollment, course)) { ... }
```

## Comentários que pioram o código (apague)

### 1. Redundante — narra o "o quê"
Diz o que o código já diz. Custa para ler e não acrescenta nada.
```ts
// ruim
position++;                                   // incrementa a posição
const totalMinutes = sumDurations(lessons);   // soma as durações
```

### 2. Código comentado — delete
Ninguém ousa apagar porque "talvez precise". O **git** já guarda — é exatamente para isso que ele serve.
```ts
// ruim
// const maxLessons = 30;
const maxLessons = 40;
```

### 3. Diário / changelog / autoria
Histórico de quem mudou o quê e quando é trabalho do `git log`/`git blame`, não de um bloco no topo do arquivo.
```ts
// ruim
// 12/06 - Ana: ajusta cálculo da posição
// 03/05 - Bruno: cria função
```

### 4. Obrigatório (JSDoc em tudo)
Comentar todo método/parâmetro por regra gera ruído sem informação. Doc só onde há contrato a explicar (ver bloco abaixo).
```ts
// ruim: não diz nada que o tipo já não diga
/** @param courseId o id do curso */
function findById(courseId: number) {}
```

### 5. Ruído posicional
Marcadores, banners, "fim do if", `// ====`, separador de seção (`// ─── Leituras ───`), créditos. Estrutura é trabalho da **formatação** e da **ordem fixa** do arquivo (públicos antes de privados, leituras antes de escritas), não de comentário.

### 6. Enganoso / desatualizado
O pior de todos: sutilmente falso. Se não dá para mantê-lo verdadeiro junto com o código, ele não deve existir.

## Os poucos comentários que se justificam

Todos têm algo em comum: explicam o que o código **não consegue** dizer sozinho — quase sempre um **porquê**, não um **o quê**.

### 1. Intenção / "por quê"
A decisão por trás da linha — uma restrição ou um contorno que o código não revela.
```ts
// Posições temporárias negativas: o @@unique([courseId, position]) não aceita trocar duas aulas direto.
...order.map(({ lessonId }, index) => this.db.lesson.update({ where: { id: lessonId }, data: { position: -(index + 1) } })),
```

### 2. Aviso de consequência
Protege quem vier depois de uma armadilha não óbvia.
```ts
// Recalcula a ordem de todas as aulas do curso — caro. Não chame dentro de loop.
await this.lessonsService.reorder(courseId, lessonIds);
```

### 3. Clarificação do que você não pode mudar
Tradução de um comportamento obscuro de lib de terceiros ou de uma API que não dá para renomear.
```ts
// date-fns: differenceInDays trunca; +1 para incluir o dia final do período.
const days = differenceInDays(endsAt, startsAt) + 1;
```

### 4. TODO — dívida explícita e rastreável
Formato único: `// TODO(<eixo>): <o que falta e por quê>`, em que o eixo é o da régua de pronto (`nomes`, `funcoes`, `erros`, `performance`, `estrutura`, `testes`, `schema`). Pesquisável e classificado. Não vire depósito: TODO velho é só mais um comentário que mente.
```ts
// TODO(testes): falta cobrir a recusa de curso já publicado antes de mexer no publish.
```

### 5. Doc de API pública
JSDoc no **contrato público** de um pacote/lib que outros consomem (e cujo código eles não leem). Em código de aplicação, prefira o nome; a rota HTTP se documenta pelo Swagger.

## Checklist (revisão rápida)

- [ ] O comentário narra o **"o quê"**? → apague; o código já diz.
- [ ] Dá para trocá-lo por um **nome melhor** ou uma **função extraída**? → faça isso.
- [ ] É **código comentado**, **changelog/autoria** ou **separador**? → delete.
- [ ] Se sobrou, ele explica um **porquê** (intenção, aviso, contrato público), em pt-BR?
- [ ] TODO está no formato `TODO(<eixo>): <o que falta>`?
- [ ] Ele ainda está **verdadeiro** em relação ao código ao lado?

## Cross-links

- `nomes.md` — a primeira alternativa a um comentário é um nome que revela a intenção.
- `funcoes.md` — extrair uma função bem nomeada costuma apagar o comentário que explicava o bloco.
- `formatacao.md` — linha em branco e ordem fixa agrupam melhor que banner.
- `smells.md` — "comentário redundante", "código comentado" e "comentário desatualizado" são cheiros da família **C**.
