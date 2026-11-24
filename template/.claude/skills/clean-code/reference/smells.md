# Heurísticas e cheiros — Clean Code, cap. 17

> Peça da skill `clean-code`. Esta é a peça-**índice**: cada cheiro aponta para a peça que o trata e para a skill de refatoração que o cura. Formato adaptado — é um checklist navegável, não um tópico único.

## Princípio

Um **cheiro** (*code smell*) é um sintoma localizável na superfície do código que denuncia um problema mais fundo. Ele não é a doença — é a pista. O valor de **nomear** o cheiro é que cada nome aponta para uma **refatoração** específica.

## Por que importa

- "Está ruim" não é acionável; "isto é *Feature Envy*" é — o nome conecta o sintoma à cura.
- Numa revisão, varrer uma lista de cheiros conhecidos acha mais do que reler no escuro.
- É a **ponte** entre Clean Code (reconhecer o cheiro) e Refatoração de Fowler (a mecânica de corrigir em passos seguros).

## O mapa dos cheiros (famílias de Martin)

Cada linha: **cheiro** — sintoma → onde tratar.

### C — Comentários → `comentarios.md`
Código comentado (C5); comentário redundante (C3), obsoleto (C2) ou mal escrito (C4).

### F — Funções → `funcoes.md`
Argumentos demais (F1); argumento de saída (F2); argumento-flag (F3); função morta (F4).

### N — Nomes → `nomes.md`
Nome não descritivo (N1) ou ambíguo (N4); nome no nível errado de abstração (N2); *encoding*/notação húngara (N6); idioma misturado no mesmo identificador.

### T — Testes → `testes-limpos.md`
Testes insuficientes (T1); condições de borda não testadas (T5); teste lento (T9); teste ignorado é uma pergunta em aberto (T4).

### E — Ambiente
Build (E1) e testes (E2) devem rodar com **um comando** cada.

### G — Gerais (os de maior retorno)
- **G5 Duplicação** — o cheiro nº 1; mesma lógica em dois lugares → extraia para um só. (`funcoes.md`)
- **G14 Feature Envy** — código mexe mais nos dados de **outro** dono que nos seus → mova-o para o dono do dado. (`objetos-e-dados.md`)
- **G36 Navegação transitiva** — *train wreck* `a.b().c().d()` sobre objetos → Lei de Deméter. (`objetos-e-dados.md`)
- **G23 Prefira polimorfismo a if/else** — `switch` repetido por tipo → Strategy/State. (`padroes-de-projeto.md`)
- **G28 Encapsule condicionais** — `if (isAttending(enrollment, course))` no lugar da condição crua; e evite negativa (G29).
- **G30/G34 Uma coisa, um nível** — função que faz várias coisas ou mistura abstrações. (`funcoes.md`)
- **G6/G17 Abstração/responsabilidade no lugar errado** — código onde não pertence. (`classes.md`, `../../modulos-backend/SKILL.md`)
- **G9/G12 Código morto e entulho** — apague; o git guarda.
- **G10 Separação vertical** — declare a variável perto do uso. (`formatacao.md`)
- **G16/G19 Intenção obscura** — use variável/método explicativo. (`nomes.md`)
- **G25 Número mágico** — substitua por constante nomeada. (`nomes.md`)

Exemplo do mais didático — **G14 Feature Envy**, no nosso stack:
```ts
// cheiro: enrollments.service.ts calcula sobre dados que são das aulas
const lessons = await this.lessonsDirectory.findAll(courseId);
const totalMinutes = lessons.reduce((sum, lesson) => sum + lesson.durationMinutes, 0);
// cura: o dono do dado responde à pergunta
const totalMinutes = await this.lessonsDirectory.totalDuration(courseId);
```
No backend, "mover para o dono" é mover para o **módulo dono da tabela**, e o consumidor pergunta por porta.

## Checklist (os de maior retorno numa revisão)

- [ ] **Duplicação** (G5) — a lógica repetida virou uma função/abstração única?
- [ ] **Função longa / faz várias coisas** (F, G30)?
- [ ] **Feature Envy / train wreck** (G14, G36) — o comportamento está perto do dado e do dono dele?
- [ ] **Condicional complexa** (G28) — dá para nomear num método (`isAttending()`)?
- [ ] **Número/string mágico** (G25) — virou constante?
- [ ] **Código morto/comentado** (G9, C5) — apagado?
- [ ] **Nome obscuro** (N1, G16) — revela a intenção?

## Cross-links

- As peças citadas em cada família: `nomes`, `funcoes`, `comentarios`, `formatacao`, `objetos-e-dados`, `classes`, `testes-limpos`.
- `refatoracao.md` — a mecânica de corrigir cada cheiro em passos seguros.
- `padroes-de-projeto.md` — G23 (polimorfismo no lugar de `switch`) e quando **não** usar padrão.
