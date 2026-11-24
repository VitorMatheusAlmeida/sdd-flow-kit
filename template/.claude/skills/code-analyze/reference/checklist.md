# Checklist de análise — por eixo, com a peça da régua

Use os eixos que o diff toca. Cada item que falha vira um ponto com prioridade (`../SKILL.md`, seção 2) e cita a peça que define a regra.

## Estrutura e camadas (backend) — `modulos-backend`

- [ ] Um controller, um service e um repository por pasta; crescimento virou submódulo nomeado, sem `services/`, `controllers/` ou `repositories/`? → `anatomia-do-modulo.md`, `submodulos.md`
- [ ] Controller sem regra; service sem client do banco e sem tipos `Prisma.*`; só repositório e `adapters/` tocam o Prisma? → `anatomia-do-modulo.md`
- [ ] Cada tabela consultada só pelo repositório do dono; dado de outro módulo por porta declarada pelo consumidor, sem `include` atravessando? → `propriedade-de-tabelas.md`
- [ ] Filho não importa o pai; nenhum `forwardRef`; fluxo que cruza é coordenado pelo pai, com o dado por argumento? → `submodulos.md`
- [ ] Nomes de operação do vocabulário (`findAll`, `findOne`, `findById`, `create`, `update`, `delete`) ou de propósito; privados `assert*`/`compute*`? → `vocabulario-e-ordem.md`
- [ ] Fila e agendamento entram por `<modulo>.jobs.ts`, que só delega? → `cache-e-filas.md`

## Erros e `null` — `modulos-backend` + `clean-code`

- [ ] O service lança a `HttpException` certa (404/409/422/403); o repositório não captura erro do ORM? → `vocabulario-e-ordem.md`
- [ ] `null` só no retorno de leitura do repositório, convertido em exceção na linha seguinte? → `tratamento-erros.md`
- [ ] Mensagem em pt-BR, com o conceito de domínio, sem id, nome de campo, constraint ou detalhe do ORM; contexto técnico no log? → `tratamento-erros.md`
- [ ] Nenhum `catch` vazio; o que não se sabe tratar é relançado? → `tratamento-erros.md`

## Schema e migration — `modulos-backend`

- [ ] `@@map` em `snake_case` plural, instantes em `Timestamptz`, `createdAt`/`updatedAt` em entidade editável? → `modelagem-prisma.md`
- [ ] Unicidade e integridade no banco; `onDelete` escolhido pela semântica, `Cascade` sem atravessar domínio? → `modelagem-prisma.md`
- [ ] Migration faz uma coisa, SQL revisado (sem `DROP` inesperado), compatível para frente quando o deploy não é atômico? → `modelagem-prisma.md`

## Consultas e desempenho — `modulos-backend`

- [ ] `select` com o recorte usado; nenhuma consulta dentro de laço; dado alheio em lote? → `consultas.md`
- [ ] Listagem paginada no banco, `orderBy` determinístico, teto de `pageSize`, `total` com os mesmos filtros? → `consultas.md`
- [ ] Nenhuma chamada externa dentro de `$transaction`? → `consultas.md`
- [ ] Cache só com dor medida, no repositório do dono, com chave, prazo e invalidação; nenhuma rota autenticada cacheada por URL? → `cache-e-filas.md`
- [ ] Job com payload só de ids, `jobId` determinístico, seguro de rodar duas vezes, enfileirado depois do commit? → `cache-e-filas.md`

## Código — `clean-code`

- [ ] Nomes revelam intenção, em inglês, uma palavra por conceito; mensagens e comentários em pt-BR? → `nomes.md`
- [ ] Função faz uma coisa, num nível de abstração; sem flag booleana; sem efeito escondido? → `funcoes.md`
- [ ] Comentário só para o porquê, verdadeiro em relação ao código; TODO no formato `TODO(<eixo>): …`? → `comentarios.md`
- [ ] Terceiro encapsulado atrás de interface nossa; tipo do terceiro não atravessa assinatura pública? → `fronteiras.md`
- [ ] Padrão de projeto só com problema presente; a alternativa simples foi comparada? → `padroes-de-projeto.md`
- [ ] Dependência nova com motivo escrito (plataforma, framework e o que já está instalado não resolviam); camada ou abstração com problema presente? → `complexidade-e-dependencias.md`
- [ ] Mudança de estrutura separada de mudança de comportamento, com teste fixando o comportamento antes? → `refatoracao.md`

## Testes — `clean-code` + `modulos-backend`

- [ ] Regra nova ou alterada tem teste; o service spec cobre cada exceção; o controller spec só a delegação? → `vocabulario-e-ordem.md`
- [ ] Testes citados no commit ou no PR existem no diff?
- [ ] Teste legível, um conceito por `it`, sem relógio real nem rede? → `testes-limpos.md`
- [ ] Permissão e guarda por rota cobertas no teste de contrato ou no e2e?

## Segurança e acesso

- [ ] Toda rota tem guarda, e a permissão (departamento, dono do dado) é conferida no servidor, não só na tela?
- [ ] Dado de outra pessoa ou empresa é tratado como inexistente (o mesmo 404), testado com duas contas?
- [ ] Nenhum segredo, token ou dado pessoal real em código, log, payload de fila ou mensagem de erro?
- [ ] Entrada externa passa por DTO com validação; nada de SQL montado com texto do usuário?
- [ ] Rota sensível (login, recuperação de senha, envio de e-mail) tem limite de requisições?
- [ ] Resposta autenticada sai com `no-store`?

## Front (Next/React)

- [ ] O front segue o back: nenhuma regra de negócio recriada na tela; lacuna da rota vira pedido ao back?
- [ ] Estados cobertos: vazio, carregando, erro com nova tentativa, sem permissão, sessão vencida; falha de carga não vira lista vazia? → `flow-walkthrough`
- [ ] Quem não pode ver o dado vê "Página não encontrada"? → `flow-walkthrough`
- [ ] Efeito que depende de ref lista tudo o que decide se a ref existe; nada criado fora do React sem recriar ao remontar?
- [ ] Biblioteca pesada ou só de cliente carregada com `import()` dinâmico, com carregamento, erro e alternativa?
- [ ] `dangerouslySetInnerHTML` só com origem conhecida e conteúdo sanitizado?
- [ ] 390 px sem rolagem horizontal, alvos de toque ≥ 40 px, rótulo ligado ao campo? → `flow-walkthrough`

## Contrato entre back e front

- [ ] Mudança de rota que o front usa é compatível (só acrescenta) ou vem com o PR do front que acompanha?
- [ ] Quebra inevitável segue expandir → migrar → contrair, sem derrubar quem já consome?

## Tipagem

- [ ] Sem `as` para calar o compilador onde um tipo ligado resolveria; `satisfies` em constante de configuração?
- [ ] Sem `any` novo; quando inevitável, comentado com o porquê?

## Ambiente e histórico

- [ ] Variável de ambiente nova está no `.env.example`?
- [ ] Funciona fora do ambiente de quem escreveu (CI, deploy), não só localmente?
- [ ] Antes de sugerir remover uma abstração, o `git log` do arquivo explica por que ela surgiu?

## Peças citadas

- `modulos-backend`: `../../modulos-backend/reference/` — `anatomia-do-modulo.md`, `submodulos.md`, `propriedade-de-tabelas.md`, `vocabulario-e-ordem.md`, `modelagem-prisma.md`, `consultas.md`, `cache-e-filas.md`, `gabarito.md`.
- `clean-code`: `../../clean-code/reference/` — `nomes.md`, `funcoes.md`, `comentarios.md`, `tratamento-erros.md`, `fronteiras.md`, `testes-limpos.md`, `padroes-de-projeto.md`, `complexidade-e-dependencias.md`, `refatoracao.md`.
- `flow-walkthrough`: `../../flow-walkthrough/SKILL.md` e `../../flow-walkthrough/reference/points.md`.
