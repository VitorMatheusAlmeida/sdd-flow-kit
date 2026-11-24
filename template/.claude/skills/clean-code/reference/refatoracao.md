# Refatoração — mudar a estrutura sem mudar o comportamento

> Peça da skill `clean-code`. Estrutura: princípio → por quê → regras com exemplo → checklist → cross-links.
> Base: Refactoring (Martin Fowler), cap. 1 a 4.

## Princípio

Refatorar é **alterar a estrutura interna do código para torná-lo mais fácil de entender e mais barato de mudar, sem mudar o comportamento observável**. Faz-se em **passos pequenos**, com os **testes verdes a cada passo**, e nunca no mesmo passo em que se acrescenta ou corrige comportamento. Sem teste cobrindo o comportamento atual, não há refatoração — há "mexer e torcer".

## Por que importa

- **O design apodrece sozinho.** Cada mudança feita "só para funcionar" deixa o código um pouco mais difícil. Sem limpeza contínua, a velocidade de entregar despenca.
- **Misturar estrutura e comportamento esconde bugs.** Se a estrutura e a regra mudam no mesmo passo e o teste quebra, não se sabe qual das duas causou.
- **Passo pequeno é passo diagnosticável.** Se quebrou, foi o último passo — e desfazer custa um passo, não um dia.

## As regras (com exemplo no nosso stack)

### 1. O que é "comportamento observável"
O que o **cliente do código** enxerga: mesmas entradas → mesmas saídas e mesmos efeitos visíveis. No backend: a rota, o status, o corpo da resposta, a mensagem de erro, o que foi gravado, o e-mail enviado. Pode mudar livremente: nomes internos, divisão em funções, classes e arquivos, e o desempenho.

**Corrigir bug não é refatorar** — isso muda o comportamento. Dá para refatorar para *enxergar* o bug; a correção é outro passo, com outro chapéu.

### 2. Os dois chapéus (Kent Beck)
A qualquer momento você usa **um** chapéu, e sabe qual:

- **Acrescentar comportamento:** escreve teste novo e o faz passar; mexe na estrutura só o necessário.
- **Refatorar:** melhora a estrutura; **não** escreve teste de comportamento novo e **não** muda comportamento. Os testes existentes ficam verdes o tempo todo.

Trocar de chapéu toda hora é normal; trocar **sem perceber** é a origem do bug difícil.

### 3. Antes de mexer: o teste que fixa o comportamento atual
Quando o trecho não tem teste, o primeiro passo é escrever testes que descrevem o que ele **faz hoje** — inclusive o que parece estranho. Eles passam **antes** de qualquer mudança; dali em diante, qualquer vermelho é regressão real.
```ts
// fixa o comportamento de hoje, mesmo que pareça errado: hoje um curso publica com uma aula só
it('publica curso com uma única aula', async () => {
  repository.findById.mockResolvedValue({ id: 1, isPublished: false });
  lessonsService.countByCourse.mockResolvedValue(1);

  await service.publish(1);

  expect(repository.update).toHaveBeenCalledWith(1, { isPublished: true });
});
```
Se o comportamento de hoje está errado, o teste continua fixando-o durante a refatoração. Mudar a regra ("ao menos três aulas") é outra tarefa, com outro chapéu, depois.

### 4. Primeiro torne a mudança fácil, depois faça a mudança fácil
Quando uma funcionalidade é desconfortável de encaixar, não force: refatore antes para abrir espaço, e só então acrescente. É a **refatoração preparatória**.
```ts
// ruim: a regra nova entra empilhada num método que calcula e grava
async create(dto: CreateEnrollmentDto) {
  let priceCents = dto.basePriceCents;
  if (dto.couponCode) priceCents = Math.round(priceCents * 0.9);
  if (dto.isPartner) priceCents = Math.round(priceCents * 0.5); // regra nova jogada no meio
  return this.repository.create({ ...dto, priceCents });
}

// 1) chapéu de refatorar — extrai o cálculo; o resultado não muda, os testes seguem verdes
async create(dto: CreateEnrollmentDto) {
  return this.repository.create({ ...dto, priceCents: this.computePrice(dto) });
}

private computePrice(dto: CreateEnrollmentDto) {
  return dto.couponCode ? Math.round(dto.basePriceCents * 0.9) : dto.basePriceCents;
}

// 2) chapéu de acrescentar — a regra nova cabe num lugar só, com teste novo
private computePrice(dto: CreateEnrollmentDto) {
  const withCoupon = dto.couponCode ? Math.round(dto.basePriceCents * 0.9) : dto.basePriceCents;
  return dto.isPartner ? Math.round(withCoupon * 0.5) : withCoupon;
}
```

### 5. Quando refatorar — três gatilhos, e a regra dos três
1. **Preparatória** — antes de uma funcionalidade ou correção, para deixar o terreno pronto.
2. **De compreensão** — ao entender um trecho, registre o entendimento no código: renomeie, extraia função.
3. **Oportunista** — limpe de passagem o que você tocou, dentro do escopo e com teste.

**Regra dos três** (Don Roberts): na primeira vez, faça; na segunda, incomode-se; na terceira, refatore. Evita os dois extremos — abstração antes da hora e duplicação já espalhada.

### 6. O vizinho fora do padrão
Ao mexer num arquivo que está fora da régua (`modulos-backend`, esta skill), o código **novo** nasce no padrão e a divergência do vizinho vira **achado**, listado no PR. Corrigir o vizinho é refatoração: só com teste cobrindo antes e só dentro do escopo pedido. Divergência grande (módulo inteiro fora da forma) não é limpeza de passagem — vira uma **spec de refatoração**.

### 7. A refatoração planejada (spec de refatoração)
Quando a refatoração é o próprio trabalho, o plano tem uma forma fixa:

1. **Linha de base verde** — a suíte inteira passa antes de começar, e o resultado fica registrado.
2. **Rede de segurança** — testes que fixam o comportamento atual (regra 3). É uma fase que **bloqueia** todas as outras.
3. **Checkpoint** — a partir daqui, qualquer vermelho é regressão.
4. **Passos pequenos**, cada tarefa deixando a suíte verde.
5. **Remoção do antigo** no fim, quando nada mais o usa.

O requisito principal da spec é "**comportamento observável preservado**", com a lista do que conta como comportamento ali (rotas, respostas, mensagens, e-mails, dado gravado). Em projeto com spec-kit, o template de spec e o de tarefas já trazem essa forma.

### 8. Refatoração ou reescrita
Refatorar pressupõe poder testar e caminhar em passos. Quando o trecho não tem como ser testado em pedaços, ou está tão degradado que cada passo quebra o resto, é **reescrita**: a rede de segurança sobe de nível (teste de contrato das rotas, e2e do fluxo), o novo nasce ao lado do antigo, e a troca é feita de uma vez, com a rede verde dos dois lados.

## Checklist (antes e durante)

- [ ] Sei **qual chapéu** estou usando agora — refatorar **ou** acrescentar, nunca os dois no mesmo passo?
- [ ] Existe teste fixando o comportamento atual **antes** de mexer — e ele passa?
- [ ] A mudança preserva o **comportamento observável** (rota, resposta, mensagem, gravação, e-mail)?
- [ ] Estou em **passos pequenos**, com a suíte verde a cada passo?
- [ ] A funcionalidade está difícil de encaixar? Então refatorei antes para torná-la fácil?
- [ ] Divergência do vizinho ficou listada, e só foi corrigida dentro do escopo e com teste?
- [ ] Refatoração grande virou spec, com linha de base, rede de segurança bloqueante e checkpoint?
- [ ] Sem como testar em pedaços? Então é reescrita, com rede no nível do contrato.

## Cross-links

- `testes-limpos.md` — o desenho do teste que serve de rede de segurança.
- `smells.md` — o cheiro concreto que indica o que refatorar.
- `funcoes.md` — extrair função num nível de abstração é a refatoração de compreensão mais comum.
- `design-e-concorrencia.md` — "tornar a mudança fácil" é aplicar as quatro regras do design simples.
- `padroes-de-projeto.md` — refatorar **para** um padrão quando a dor aparece, não nascer com ele.
- `../../modulos-backend/SKILL.md` — a régua contra a qual o código existente é medido antes de refatorar.
