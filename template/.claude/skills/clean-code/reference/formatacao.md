# Formatação — Clean Code, cap. 5

> Peça da skill `clean-code`. Estrutura: princípio → por quê → regras com exemplo → checklist → cross-links.

## Princípio

Formatação é **comunicação** — e comunicação é a primeira tarefa do profissional. O leitor acha as coisas pelo olho: o que está **relacionado fica perto** e a leitura **desce do alto nível ao detalhe**. A parte mecânica (espaços, largura, aspas) é da ferramenta; o que sobra — *o que fica perto de quê e em que ordem* — é seu.

## Por que importa

- Você navega código por memória espacial ("era lá embaixo, perto da função X"). Layout consistente vira mapa; layout aleatório obriga a reler.
- Proximidade comunica relação: o que está junto, o olho lê como junto. Distância força *scroll* e o fio se perde.
- Brigar sobre vírgula/aspas em PR é desperdício. A ferramenta zera esse debate e libera a revisão para o que importa.

## As regras (com exemplo no nosso stack)

### 1. A mecânica é da ferramenta — Prettier + ESLint
Largura de linha, aspas, ponto-e-vírgula, indentação, espaço ao redor de operador: **nada disso é decisão humana**. É a "regra de equipe" de Martin — o time concorda **uma vez** (no config do projeto) e a máquina aplica em todo save/commit. Use a configuração que o repositório já tem; sua energia vai para as regras abaixo, que a ferramenta **não** resolve.

### 2. Arquivo pequeno conta uma história (a metáfora do jornal)
O nome no topo diz do que se trata; vêm primeiro os conceitos de alto nível, e o detalhe desce. Arquivo de mil linhas é o sintoma — quebre por responsabilidade, no lugar que a estrutura de módulo indica.
```text
// ruim: courses.service.ts com 1200 linhas — curso, aulas, matrícula, relatório
// bom: cada responsabilidade no seu conjunto (ver modulos-backend)
//   courses/courses.service.ts · courses/lessons/lessons.service.ts · enrollments/enrollments.service.ts
```
Nunca resolva o arquivo grande com vários services na mesma pasta: o segundo service é um submódulo ou um módulo irmão.

### 3. Linha em branco separa pensamentos; a ausência dela os une
Espaço vertical entre blocos com ideias diferentes; **sem** espaço entre linhas fortemente ligadas.
```ts
// ruim: obter, validar e agir amontoados sem respiro
const course = await this.findById(id);
this.assertNotPublished(course);
const lessonCount = await this.lessonsService.countByCourse(id);
this.assertHasLessons(lessonCount);
return this.repository.update(id, { isPublished: true });
// bom: cada par "obter + validar" junto; a ação separada
const course = await this.findById(id);
this.assertNotPublished(course);

const lessonCount = await this.lessonsService.countByCourse(id);
this.assertHasLessons(lessonCount);

return this.repository.update(id, { isPublished: true });
```

### 4. Declare a variável perto de onde ela é usada
A variável nasce onde serve, não num bloco de declarações no topo da função.
```ts
// ruim: declarada no alto, usada 15 linhas depois
let totalMinutes = 0;
// ...muita coisa no meio...
totalMinutes = sumDurations(lessons);
// bom: nasce no ponto de uso
const totalMinutes = sumDurations(lessons);
```

### 5. Ordem vertical: o alto nível no topo, o detalhe abaixo
A chamada aponta para baixo — a função chamada vem **depois** da que chama. No NestJS: métodos públicos no topo, privados embaixo.
```ts
// bom: lê-se de cima (o quê) para baixo (como)
async create(courseId: number, dto: CreateLessonDto) {
  await this.assertPositionIsFree(courseId, dto.position);
  return this.repository.create({ ...dto, courseId });
}

private async assertPositionIsFree(courseId: number, position: number) { /* ... */ }
```

### 6. Agrupe por afinidade, não por categoria
O que é **lido junto e muda junto** fica junto. Não espalhe um fluxo só porque as peças são "de tipos diferentes".
```tsx
// ruim: todos os useState no topo, longe de quem os usa
const [isOpen, setIsOpen] = useState(false);
const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
// ...50 linhas...
// bom: o estado da edição mora junto do handler que o move
const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
const startEditing = (lesson: Lesson) => setEditingLesson(lesson);
```

## Checklist (revisão rápida)

- [ ] **Prettier/ESLint** do projeto rodam no save/commit? (a mecânica não chega à PR)
- [ ] O arquivo **cabe na cabeça**? (centenas, não milhares, de linhas → uma responsabilidade)
- [ ] Arquivo grande foi dividido pela estrutura de módulo, e não com vários services na mesma pasta?
- [ ] Linhas em branco separam **blocos de pensamento** — e o fortemente ligado está grudado?
- [ ] Cada variável **nasce perto** de onde é usada?
- [ ] A leitura **desce** do alto nível ao detalhe (chamador acima do chamado)?
- [ ] O que é **lido junto está junto** (afinidade), não espalhado por categoria?

## Cross-links

- `funcoes.md` — função e arquivo pequenos são pré-condição da boa formatação; ordem vertical = chamador acima do chamado.
- `nomes.md` — a metáfora do jornal começa num nome de arquivo que já diz do que se trata.
- `comentarios.md` — banner e separador feitos de comentário são ruído; linha em branco e ordem fixa resolvem.
- `smells.md` — arquivo gigante e ordem vertical bagunçada são cheiros da família **G**.
- `../../modulos-backend/reference/submodulos.md` — onde o arquivo grande se divide.
