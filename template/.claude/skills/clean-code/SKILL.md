---
name: clean-code
description: Use sempre que for escrever, alterar, revisar ou refatorar código (TypeScript, NestJS, React, Prisma) — para nomes, tamanho e foco de funções, comentários, formatação, tratamento de erros e de null, fronteiras com bibliotecas de terceiros, testes limpos, classes e code smells. Use também para desenho de objetos e padrões de projeto — "qual padrão usar aqui?", Adapter, Facade, Strategy, Decorator, Factory, Builder, Singleton — e para decidir quando NÃO usar padrão. Use ao planejar ou escolher biblioteca e dependência nova (ex.: axios × fetch nativo), camada ou abstração a mais. Princípios de Clean Code (Robert C. Martin) e dos padrões GoF.
---

# Clean Code — qualidade interna do código

**Premissa:** lemos código muito mais do que escrevemos. Otimize para quem vai ler depois (inclusive você daqui a três meses). Toda mudança deixa o trecho **mais limpo do que estava** (regra do escoteiro).

## A régua é esta skill, não o código ao redor

O padrão de nome, função, erro, comentário e teste vem daqui — **nunca** do arquivo vizinho. Código existente fora do padrão é para ser **medido**, não imitado: "o resto do arquivo faz assim" não justifica repetir um nome ruim, um `null` propagado ou uma função que faz três coisas.

Ao mexer num trecho fora do padrão:

1. O código **novo** nasce no padrão.
2. O que está fora do padrão ao redor vira **achado**, listado na resposta ou no PR.
3. Corrigir o vizinho é refatoração: só com teste cobrindo o comportamento antes (`reference/refatoracao.md`), e só dentro do escopo pedido.

**Precedência:** dentro da função — nome, tamanho, comentário, formatação, teste — vale esta skill. Em estrutura de módulo, camadas, fronteiras entre módulos, nomes de operação e erros, vale a `modulos-backend`.

**Idioma:** identificadores em **inglês**; mensagem que chega ao usuário e comentário em **pt-BR**. Todo exemplo das peças usa o domínio fictício de `../modulos-backend/reference/gabarito.md` (cursos, aulas, matrículas).

## Modelo mental

- **Nome bom > comentário.** Se precisa explicar com comentário, primeiro tente um nome/uma função melhor.
- **Função = um verbo, um nível.** Faz uma coisa, num único nível de abstração; o resto ela delega.
- **Erro é fluxo, não código de retorno.** Exceções e caminhos de erro separados do caminho feliz.
- **Teste sujo é pior que sem teste.** Teste ruim trava a mudança em vez de habilitá-la.
- **A plataforma antes do pacote.** Linguagem, framework e o que já está instalado vêm antes de dependência nova — e a pergunta é feita no planejamento.
- Qualidade interna não é perfeccionismo: é o que mantém o custo de mudança baixo.

## Mapa de referência

Carregue a peça do assunto:

| Assunto | Arquivo |
|---|---|
| Nomear variáveis, funções, classes; idioma | `reference/nomes.md` |
| Tamanho, foco e argumentos de funções | `reference/funcoes.md` |
| Quando (não) comentar; código comentado; TODO | `reference/comentarios.md` |
| Layout vertical, tamanho de arquivo, Prettier | `reference/formatacao.md` |
| Objeto vs estrutura de dados; Lei de Deméter | `reference/objetos-e-dados.md` |
| Exceções, `null`, mensagem, erro do banco | `reference/tratamento-erros.md` |
| Encapsular terceiros; Adapter; learning tests; Prisma | `reference/fronteiras.md` |
| Testes limpos: F.I.R.S.T, um conceito, AAA | `reference/testes-limpos.md` |
| Classe pequena: SRP, coesão, isolar mudança | `reference/classes.md` |
| Design simples (4 regras), DI, concorrência | `reference/design-e-concorrencia.md` |
| Padrões de projeto: onde já aparecem, Strategy em TS, quando não usar | `reference/padroes-de-projeto.md` |
| Dependência nova ou complexidade a mais: plataforma, framework, o que já existe | `reference/complexidade-e-dependencias.md` |
| Cheiros / heurísticas (índice cap. 17) | `reference/smells.md` |
| Refatorar: dois chapéus, rede de segurança, passos pequenos, spec de refatoração, reescrita | `reference/refatoracao.md` |

## Como aplicar numa revisão

Revisão e análise seguem a skill `code-analyze`: processo, caça a bugs, problemas de fluxo e inconsistências, prioridade (alta · média · baixa · nit, com o que bloqueia o merge) e templates. Daqui saem as regras que ela cita. Para cada achado: **onde · qual regra · por quê · como** (a refatoração mínima), sem reescrever tudo.

## Cross-links

- Estrutura de módulo, camadas e erros: `../modulos-backend/SKILL.md`.
