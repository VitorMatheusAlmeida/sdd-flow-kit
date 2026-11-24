# Funções — Clean Code, cap. 3

> Peça da skill `clean-code`. Estrutura: princípio → por quê → regras com exemplo → checklist → cross-links.

## Princípio

Uma função deve ser **pequena**, fazer **uma coisa** e fazê-la num **único nível de abstração**. Você deve ler uma função de cima para baixo como um parágrafo: cada linha conta a próxima, e os detalhes ficam um nível abaixo, em funções que ela chama.

## Por que importa

- Função pequena com um só propósito é fácil de **nomear**, **testar** e **mudar** sem medo de efeito colateral.
- "Fazer uma coisa" é o que permite reusar e compor; função que faz três coisas só serve para um caso.
- Misturar níveis de abstração (regra de negócio + formatação de texto + consulta) força o leitor a trocar de marcha a cada linha — é onde o bug se esconde.

## As regras (com exemplo no nosso stack)

### 1. Pequenas — e depois menores ainda
Blocos de `if`/`else`/`while` devem ter **uma linha**: uma chamada de função bem nomeada. Isso mantém a função curta e dá nome ao bloco.
```ts
// ruim: o corpo do if é um parágrafo inteiro
if (!course.isPublished) {
  const lessonCount = await this.lessonsService.countByCourse(course.id);
  if (lessonCount > 0) { /* ...mais 10 linhas... */ }
}
// bom: o bloco vira uma chamada que se lê
if (!course.isPublished) {
  await this.publish(course.id);
}
```

### 2. Faça uma coisa só
Uma função faz uma coisa quando tudo nela está **um nível abaixo** do nome dela. Se dá para extrair outra função com um nome que não seja só uma reescrita da implementação, ela fazia mais de uma coisa.
```ts
// ruim: calcula a posição e grava, com o detalhe do cálculo no meio
async create(courseId: number, dto: CreateLessonDto) {
  const lessons = await this.repository.findAll(courseId);
  const lastPosition = lessons.reduce((max, lesson) => Math.max(max, lesson.position), 0);
  return this.repository.create({ ...dto, courseId, position: lastPosition + 1 });
}
// bom: cada nível delega para o próximo
async create(courseId: number, dto: CreateLessonDto) {
  const position = await this.computeNextPosition(courseId);
  return this.repository.create({ ...dto, courseId, position });
}
```

### 3. Um nível de abstração por função
Não misture política (regra de negócio) com detalhe (formatação, consulta, manipulação de string) na mesma função. É o sintoma mais comum de "faz mais de uma coisa".
```ts
// ruim: regra + detalhe de apresentação juntos
function describeCourse(lessons: Lesson[]) {
  const totalMinutes = lessons.reduce((sum, lesson) => sum + lesson.durationMinutes, 0);
  return `${Math.floor(totalMinutes / 60)}h${totalMinutes % 60}min`;
}
// bom: a regra fica num nível; a formatação, no de baixo
function describeCourse(lessons: Lesson[]) {
  const totalMinutes = sumDurations(lessons);
  return formatDuration(totalMinutes);
}
```

### 4. Poucos argumentos (0 é ideal; 3+ pede um objeto)
Cada argumento é uma coisa a mais para ler e testar. Acima de dois, **agrupe num objeto** — que muitas vezes já existe no domínio.
```ts
// ruim: 4 argumentos posicionais; fácil trocar a ordem
function scheduleLesson(lessonId: number, startsAt: Date, endsAt: Date, roomId: number) {}
// bom: o objeto nomeia cada campo e vira um conceito
function scheduleLesson(lessonId: number, slot: TimeSlot) {}
```
No NestJS isso já é natural: um **DTO** é o "objeto-argumento". No React, prefira uma `props`/`config` a uma lista longa de parâmetros posicionais.

### 5. Nada de argumento-flag (booleano que muda o comportamento)
Um booleano que escolhe entre dois caminhos grita que a função faz **duas** coisas. Quebre em duas funções.
```ts
// ruim
renderLesson(lesson, true);   // true = ...? o leitor tem que abrir a função
// bom: o nome diz qual comportamento
renderLessonSummary(lesson);
renderLessonDetail(lesson);
```

### 6. Sem efeitos colaterais escondidos
A função deve fazer **o que o nome promete e nada mais**. Uma consulta que de quebra envia e-mail mente sobre o que faz — e acopla coisas que deveriam ser independentes.
```ts
// ruim: o nome diz "verificar", mas também envia e-mail
async isEnrolled(courseId: number, studentEmail: string) {
  const isEnrolled = await this.repository.existsForStudent(courseId, studentEmail);
  if (isEnrolled) await this.mailer.sendReminder(studentEmail); // efeito oculto
  return isEnrolled;
}
// bom: cada coisa explícita no chamador
if (await this.isEnrolled(courseId, studentEmail)) {
  await this.sendReminder(studentEmail);
}
```

### 7. Comando ou consulta — nunca os dois (CQS)
Uma função ou **faz** algo (muda estado) ou **responde** algo (retorna dado), não as duas. Misturar leva a chamadas ambíguas como `if (await tryCancel(...))`.
```ts
// ruim: muda e responde ao mesmo tempo
if (await this.tryCancel(id)) { ... }   // "se cancelou"? "se já estava cancelada"?
// bom: separe a pergunta da ação
const enrollment = await this.findById(id);
this.assertIsActive(enrollment);
await this.repository.cancel(id);
```

### 8. Exceção em vez de código de erro
Retornar código de erro força o chamador a tratar na hora e aninha `if`s. Exceção separa o caminho feliz do tratamento. (Detalhe em `tratamento-erros.md`.)
```ts
// ruim
const result = await this.cancel(id);
if (result === CancelResult.NotFound) { ... }
// bom: cancel lança 404 ou 422; quem chama segue o caminho feliz
await this.cancel(id);
```

### 9. Não se repita (DRY)
Lógica duplicada é um lugar a mais para esquecer de corrigir o bug. Extraia para uma função com nome — é a refatoração mais barata e de maior retorno.

## Checklist (revisão rápida)

- [ ] Dá para ler a função inteira **de uma vez**, sem rolar muito?
- [ ] Ela faz **uma coisa**? (Consigo extrair outra função com nome que não seja só a implementação repetida?)
- [ ] Todas as linhas estão **no mesmo nível de abstração** (sem misturar regra + detalhe)?
- [ ] Tem **3 ou menos argumentos**? Nenhum deles é uma **flag booleana**?
- [ ] O nome promete tudo que ela faz (**sem efeito colateral** escondido)?
- [ ] É **comando ou consulta**, não os dois?
- [ ] Usa **exceção** em vez de devolver código de erro?

## Cross-links

- `nomes.md` — função pequena e com uma só tarefa é muito mais fácil de nomear; nome de função é verbo.
- `comentarios.md` — extrair uma função bem nomeada costuma apagar o comentário que explicava o bloco.
- `tratamento-erros.md` — "exceção, não código de erro" aprofundado; tratamento de erro também é "uma coisa".
- `smells.md` — função longa, lista de argumentos longa e código duplicado são cheiros da família **F/G**.
- `../../modulos-backend/reference/vocabulario-e-ordem.md` — `assert*` e `compute*`: o prefixo diz se a função pode interromper o fluxo.
- `refatoracao.md` — a mecânica de *Extract Function* em passos seguros.
