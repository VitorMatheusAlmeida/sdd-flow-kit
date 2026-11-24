# Nomes significativos — Clean Code, cap. 2

> Peça da skill `clean-code`. Estrutura: princípio → por quê → regras com exemplo → checklist → cross-links.

## Princípio

Um nome deve responder sozinho a três perguntas: **por que isto existe, o que faz e como é usado.** Se um nome precisa de comentário para ser entendido, o nome falhou — melhore o nome em vez de adicionar o comentário.

## Por que importa

- Você lê um nome dezenas de vezes para cada vez que o escreve; ele é a interface que custa caro.
- Nome ruim força "tradução mental" (o que era `d` mesmo?) e vira terreno fértil para bug por ambiguidade.
- Um bom nome é o único "comentário" que nunca desatualiza.

## As regras (com exemplo no nosso stack)

### 1. Revele a intenção
O nome carrega a intenção; tipo e valor são detalhe.
```ts
// ruim
const d = differenceInDays(today, e.createdAt);   // d de quê?
// bom
const daysSinceEnrollment = differenceInDays(today, enrollment.createdAt);
```

### 2. Evite desinformação
Não dê pistas falsas: não chame de `...List` o que não é lista; fuja de nomes quase iguais.
```ts
// ruim: é um Map, e "List" mente
const lessonList: Map<number, Lesson> = ...;
// bom
const lessonsById: Map<number, Lesson> = ...;
```

### 3. Faça distinções significativas
Fuja de ruído (`Info`, `Data`, `Object`) e de séries (`a1`, `a2`): diferença no nome tem que significar diferença real.
```ts
// ruim: qual a diferença entre elas?
findCourse(); findCourseInfo(); findCourseData();
// bom: cada nome é uma pergunta diferente
findById(id);   // leitura enxuta, guarda de existência
findOne(id);    // detalhe, com as aulas
```

### 4. Use nomes pesquisáveis (e mate o número mágico)
Nome que dá para procurar (`grep`) e constante nomeada no lugar do literal solto.
```ts
// ruim
if (lessonCount > 40) { ... }   // 40 = ? e o grep traz falsos positivos
// bom
const MAX_LESSONS_PER_COURSE = 40;
if (lessonCount > MAX_LESSONS_PER_COURSE) { ... }
```
Escopo curto tolera nome curto (`i` num loop trivial); escopo longo pede nome longo e buscável.

### 5. Classe é substantivo; método é verbo
```ts
// ruim
class PublishCourse {}   // classe não é ação
course.details();        // método não é coisa
// bom
class CoursesService {
  publish(id: number) {}
}
```
No front: componente React = substantivo (`LessonList`); handler = verbo (`handleSubmit`, `onConfirm`).

### 6. Uma palavra por conceito — e um idioma
Escolha um verbo por ideia e mantenha no projeto inteiro. Misturar `fetch`/`get`/`retrieve` faz o leitor procurar uma diferença que não existe. No backend, a palavra de leitura é **`find`**, com o vocabulário fixo da `modulos-backend` (`findAll`, `findOne`, `findById`).
```ts
// ruim
fetchCourse(); getLesson(); retrieveEnrollment();
// bom
findById(); findOne(); findAll();
```
Vale para **idioma** também: identificador (variável, função, classe, arquivo, pasta, coluna) em **inglês**; o que o usuário lê (mensagem, rótulo, texto do Swagger) e comentário em **pt-BR**. A regra é por camada, nunca palavra a palavra: `daysSinceEnrollment`, nunca `diasDesdeEnrollment`.

### 7. Não faça trocadilho
A mesma palavra não pode significar duas coisas. Se `add` em um lugar insere (`addLesson`) e em outro soma, o segundo ganha outro verbo (`sumDurations`).

### 8. Dê contexto — sem exagero
Variáveis soltas ganham sentido agrupadas num tipo; mas não prefixe tudo com o nome do módulo.
```ts
// ruim: courseId e position soltos não gritam "lugar da aula no curso"
function moveLesson(lessonId: number, courseId: number, position: number) {}
// bom: o tipo dá o contexto
function moveLesson(lessonId: number, target: LessonSlot) {}   // target.courseId, target.position
// exagero (contexto gratuito): lsnTitle, lsnPosition… ← o prefixo não agrega nada
```

## Checklist (revisão rápida)

- [ ] O nome diz a **intenção** sem precisar de comentário?
- [ ] Dá para **pronunciar** numa conversa? (`genymdhms` não)
- [ ] Dá para **buscar** sem afogar em falsos positivos?
- [ ] **Substantivo** para classe/variável/componente, **verbo** para função/handler?
- [ ] A **mesma palavra** significa o **mesmo conceito** em todo o projeto (no backend, leitura é `find`)?
- [ ] Identificador em **inglês**, texto para o usuário em **pt-BR**?
- [ ] As distinções carregam significado (nada de `Info`/`Data`/`1`/`2`)?
- [ ] Todo **número/string mágico** virou constante nomeada?

## Cross-links

- `funcoes.md` — função pequena e com uma só tarefa é muito mais fácil de nomear.
- `comentarios.md` — o melhor jeito de apagar um comentário é melhorar o nome.
- `smells.md` — os cheiros da família **N** (nomes) se conectam a estas regras.
- `../../modulos-backend/reference/vocabulario-e-ordem.md` — o vocabulário fixo de operações e os prefixos `assert*`/`compute*`.
