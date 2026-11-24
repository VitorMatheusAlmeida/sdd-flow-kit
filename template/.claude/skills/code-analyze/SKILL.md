---
name: code-analyze
description: Use quando o pedido for analisar, revisar ou avaliar código — revisão de PR ou de branch, relatório de review, comentário de review, "revisa este código", "analisa este módulo", "tem bug aqui?". Caça bugs, problemas de fluxo e inconsistências reais (código × spec, contrato × front, regra × mensagem), e mede o código pela régua das skills clean-code e modulos-backend (estrutura, camadas, dono de tabela, nomes, funções, erros, consultas, cache, dependências, testes) e por boas práticas de segurança, desempenho e front.
---

# Análise de código — bugs, fluxo, inconsistência e régua

Uma análise diz **o que está errado, onde, por quê, quanto pesa e o que fazer** — e separa o que bloqueia do que é preferência. O foco, nesta ordem: **bug**, **problema de fluxo**, **inconsistência**, **quebra da régua**. Só entra o que é **válido**: confirmado lendo o código, rodando ou vendo o teste — ou marcado como "vale testar" quando não deu para confirmar. Ruído especulativo não entra.

A régua é a das skills, nunca o código ao redor: divergência do vizinho é achado, não modelo.

## Escolha a saída

| Pedido | Saída |
|---|---|
| "revisa a branch", "analisa o PR", "relatório de review" | **Relatório** (seção 6), ordenado por prioridade |
| "comenta no PR", "escreve o review" | **Comentário** (seção 7), um por ponto escolhido |
| "analisa este módulo/arquivo" (sem diff) | **Medição**: lista de achados e de divergências contra a régua, no formato do relatório |

## 1. Processo

1. **Tamanho e forma da mudança:** `git log --oneline <base>..<branch>` e `git diff --stat <base>...<branch>`. Separe código escrito de gerado (client do Prisma, `dbml/`, lockfile, migration gerada) e de binário.
2. **Leia os arquivos inteiros, não só o diff.** Estado, ciclo de vida, efeito colateral, caminho de erro e fronteira entre camadas só aparecem no arquivo completo — e no chamador.
3. **Leia a intenção:** spec, contrato, roteiro e fluxograma do fluxo, issue, mensagens de commit e descrição do PR. Cada um é uma promessa; o código precisa cumpri-la.
4. **Caçe bugs** (seção 2), **problemas de fluxo** (seção 3) e **inconsistências** (seção 4), nessa ordem.
5. **Meça pela régua** do que mudou: backend → `modulos-backend`; qualquer código → `clean-code`; tela → os pontos de tela da `flow-walkthrough`. Checklist em [`reference/checklist.md`](reference/checklist.md).
6. **Confirme antes de afirmar.** Siga o dado: de onde vem, por onde passa, onde é gravado. Comportamento de biblioteca se confere na documentação ou no código dela (`node_modules`). Rode o teste quando puder. Sem confirmar, escreva "vale testar", nunca "está quebrado".
7. **Novo ou pré-existente?** Problema que já existia é citado, mas só bloqueia se o PR o piora ou depende dele.
8. **Classifique** (seção 5) e diga explicitamente o que bloqueia o merge.

## 2. Bugs — onde procurar

- **Caminho de erro e borda:** lista vazia, `null`/`undefined`, valor zero, texto vazio, id inexistente, página além da última, data no limite do dia ou do fuso.
- **Assíncrono:** `await` esquecido, `Promise` não tratada, `forEach` com `async`, `Promise.all` que deveria parar no primeiro erro (ou o contrário).
- **Concorrência de estado:** ler-modificar-escrever fora de transação ou de operação atômica; conferência prévia tratada como garantia; duas abas, clique duplo.
- **Transação:** escrita que precisa ser atômica e não está; chamada externa (e-mail, HTTP, fila) dentro da transação; trabalho enfileirado antes do commit.
- **Dados:** filtro que some quando o parâmetro não vem; `total` de paginação com filtro diferente da página; ordenação não determinística; cópia rasa que altera o original.
- **Permissão:** rota sem guarda; dado de outra pessoa ou empresa acessível; conferência só na tela.
- **Tipos mentindo:** `as` que esconde um `null` real; campo opcional tratado como obrigatório; resposta da API tipada diferente do que a rota devolve.
- **Front:** efeito com dependência faltando; estado que não reseta ao trocar de item; falha de carga que vira lista vazia; formulário que envia duas vezes.

## 3. Problemas de fluxo

O fluxo é a jornada de quem usa, de ponta a ponta (spec, `fluxos.drawio`, roteiros).

- **Beco sem saída:** estado de onde a pessoa não sai — link vencido sem reenvio, cadastro pendente sem caminho para completar, erro sem nova tentativa.
- **Passo faltando ou fora de ordem:** o código permite pular uma etapa que o fluxo exige, ou exige uma que o fluxo não tem.
- **Transição inválida:** estado que vai para outro que a regra não permite (cancelar o que já foi cancelado, aprovar o que já foi decidido).
- **Saída de decisão sem tratamento:** o fluxo prevê "sim" e "não"; o código só trata um.
- **Efeito fora esquecido:** e-mail, aviso a outro papel ou fila que o fluxo promete e o código não dispara — ou dispara em caso que o fluxo não prevê.
- **Mensagem diferente da prometida:** a frase do erro no código não é a do roteiro.

## 4. Inconsistências válidas

Só entra a inconsistência que muda o comportamento ou engana quem lê:

- **Código × spec/roteiro/contrato:** a regra implementada não é a prometida.
- **Back × front:** campo, status ou mensagem que a rota devolve diferente do que a tela espera.
- **Regra × mensagem/comentário:** comentário ou mensagem que promete uma regra mais forte que a implementada. Na divergência, não assuma qual lado está certo: aponte e pergunte qual é a regra.
- **Commit/PR × diff:** "teste e2e" no commit sem teste no diff; "corrige X" sem mudança em X.
- **Regra × regra:** a mesma regra escrita de dois jeitos em dois lugares.

Diferença de estilo sem efeito não é inconsistência: é nit, se tanto.

## 5. Prioridade

| Prioridade | Quando | Bloqueia o merge? |
|---|---|---|
| **Alta** | bug no fluxo principal, perda de dado, falha de segurança (dado alheio visível, rota sem guarda, segredo exposto), beco sem saída no fluxo principal | Sim |
| **Média** | comportamento errado em caso real, problema de fluxo fora do caminho principal, inconsistência que muda comportamento, quebra da régua estrutural (service tocando o banco, tabela de outro dono, pasta por camada), regra só na tela, migration faltando | Normalmente sim |
| **Baixa** | robustez, desempenho sem dor medida, caso de borda raro, higiene de tipos e de testes, dependência sem motivo escrito | Não |
| **Nit** | estilo, nome, texto, ordem | Não |

Cada ponto diz a **certeza**: "confirmado" (li o código, rodei, vi o teste) ou "vale testar".

## 6. Template de relatório

```md
# Análise: `<branch>` × `<base>`

<N commits, ~X linhas (quanto é gerado ou binário)>.

**Resumo:** <estado geral em uma ou duas frases; o que precisa mudar antes do merge>.

## O que está bom

- **<Aspecto>:** <por que é bom>.

---

## 1. <Título do ponto> (prioridade <alta | média | baixa>)

<O que acontece, onde (`arquivo:linha`), em que cenário, e por que é problema. Qual regra, fluxo ou promessa quebra.
Confirmado ou "vale testar"; novo ou pré-existente.>

- **Mudar:** <o que fazer, com código curto se ajudar>.
  - Prós: <…>
  - Contras: <…>
- **Deixar como está:** <quando é aceitável, se for>.

## 2. …

## Divergências pré-existentes (não bloqueiam)

- `<arquivo>`: <o que difere da régua>.

## Detalhes menores

- **<Arquivo ou assunto>:** <nit em uma frase>.

**Ordem sugerida:** <o que resolver antes do merge, o que entra junto, o que vira follow-up, o que é opcional>.
```

- Ordene por prioridade, não pela ordem dos arquivos.
- Bug e problema de fluxo trazem o **cenário que reproduz** (entrada, estado, passo).
- Um ponto por problema; se dois têm a mesma solução, diga nos dois.
- Com mais de uma solução, dê prós e contras e diga qual recomenda.

## 7. Template de comentário

```md
Entendi a intenção de <o que o autor quis resolver>, e faz sentido porque <benefício real>.
Encontrei <N> pontos:

1. **<Ponto curto>** (<prioridade>). <O que acontece e em que cenário.> <Sugestão.>
2. **<Ponto curto>** (<prioridade>). <…>

<exemplo de código, se ajudar>

<Nada disso bloqueia o merge / O ponto 1 é bloqueante>.
```

Tom direto e respeitoso: diga o problema concreto, a certeza e a sugestão. Sempre em pt-BR.

## 8. Fronteiras desta skill

- **Não edita código** na análise. Correção só quando pedida, e então pela régua das skills.
- **Não mede pelo código existente.** O vizinho fora do padrão entra em "divergências pré-existentes".
- **Não inventa certeza.** O que não foi confirmado fica como "vale testar"; o que não muda comportamento nem engana quem lê não vira achado.
