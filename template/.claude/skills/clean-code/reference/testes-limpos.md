# Testes de unidade — Clean Code, cap. 9

> Peça da skill `clean-code`. Estrutura: princípio → por quê → regras com exemplo → checklist → cross-links.

## Princípio

Teste é código de **primeira classe** — tão importante quanto o de produção, porque é ele que te deixa **mudar** o código sem medo. Um teste limpo é, acima de tudo, **legível**, cobre **um conceito** e obedece ao **F.I.R.S.T**.

## Por que importa

- Sem teste, toda mudança é um bug em potencial → você para de refatorar → o código apodrece. O teste é o que **habilita** a mudança.
- Teste **sujo** é pior que lento: custa cada vez mais para manter, até o time o abandonar — e aí se volta ao ponto acima.
- Legibilidade pesa **mais** em teste: ele é a **especificação executável** do comportamento. Se não dá para ler, não documenta nada.

## As regras (com exemplo no nosso stack)

> Exemplos em Jest (default do NestJS); em Vitest a API é equivalente (`vi` no lugar de `jest`). O nome do `it` é a frase do comportamento, em pt-BR.

### 1. F.I.R.S.T — as cinco marcas de um teste limpo
- **Fast** — rápido, ou você não roda a cada save.
- **Independent** — não depende de outro teste nem da ordem de execução.
- **Repeatable** — mesmo resultado em qualquer ambiente (sem rede, relógio real ou banco de produção).
- **Self-validating** — passa ou falha sozinho (booleano); você não lê um log para decidir.
- **Timely** — escrito junto/antes do código de produção (idealmente).

### 2. Arrange-Act-Assert: três blocos, um conceito
Cada teste **prepara**, **age** e **verifica** — e cobre **um** comportamento.
```ts
// bom: três blocos visíveis, um conceito ("recusa matrícula repetida")
it('recusa matrícula de aluno já matriculado', async () => {
  courseCatalog.isOpenForEnrollment.mockResolvedValue(true);   // arrange
  repository.existsForStudent.mockResolvedValue(true);

  const enrolling = service.create(dto);                        // act

  await expect(enrolling).rejects.toThrow(ConflictException);  // assert
});
```

### 3. Um conceito por teste (não "um assert", e sim um motivo de falhar)
Não empilhe comportamentos diferentes num `it`: cada teste deve falhar por **um** motivo, com nome que descreve o comportamento.
```ts
// ruim: três conceitos num teste; qual deles quebrou?
it('cancela matrícula', async () => {
  expect(result.status).toBe('CANCELLED');
  expect(mailer.send).toHaveBeenCalled();
  expect(repository.cancel).toHaveBeenCalledTimes(1);
});
// bom: um conceito por it
it('marca a matrícula como cancelada', async () => { /* ... */ });
it('avisa o aluno do cancelamento', async () => { /* ... */ });
```

### 4. Teste é código de primeira classe — com uma DSL própria
Nomes, funções e DRY valem no teste também. Extraia **factories/helpers** para o setup repetido — a "linguagem de teste" que evolui por refatoração e deixa a intenção à vista.
```ts
// ruim: objeto literal repetido em cada teste só para ter uma matrícula válida
const dto = { courseId: 12, studentEmail: 'aluna@exemplo.com' /* ... */ };
// bom: o helper vira a DSL; lê-se a intenção, não o setup
const dto = makeEnrollmentDto({ courseId: 12 });
```

### 5. Repeatable de verdade: controle o tempo e as dependências
Não dependa de `new Date()`, rede ou banco real: injete/dubla a dependência e use *fake timers* para o tempo.
```ts
// ruim: depende do relógio real → passa hoje, falha na virada do dia
expect(isEnrollmentWindowOpen(course)).toBe(true);
// bom: tempo congelado e explícito
jest.useFakeTimers().setSystemTime(new Date('2026-06-15T12:00:00Z'));
expect(isEnrollmentWindowOpen(course)).toBe(true);
```

## Checklist (revisão rápida)

- [ ] **F**ast o bastante para rodar a cada save?
- [ ] **I**ndependente (passa em qualquer ordem; `beforeEach` reseta o estado/dublês)?
- [ ] **R**epetível (sem relógio real, rede ou banco de produção)?
- [ ] **S**elf-validating (booleano; nada de ler log no olho)?
- [ ] Cada teste cobre **um conceito**, com nome que descreve o comportamento?
- [ ] O teste está tão **limpo** quanto o código de produção (sem duplicação, com helpers)?

## Cross-links

- `funcoes.md` — "um conceito por teste" é o "faz uma coisa" aplicado ao teste.
- `nomes.md` — o nome do `it` é a frase que descreve o comportamento; capriche como em qualquer nome.
- `fronteiras.md` — learning tests também seguem o F.I.R.S.T; e dublar a **sua** interface (não a lib) vem de lá.
- `smells.md` — "teste frágil", "teste insuficiente" e "setup duplicado" são cheiros desta peça.
- `../../modulos-backend/reference/vocabulario-e-ordem.md` — o que cada spec cobre (service com cada exceção, controller só delegação).
- `refatoracao.md` — teste como pré-requisito para refatorar com segurança.
