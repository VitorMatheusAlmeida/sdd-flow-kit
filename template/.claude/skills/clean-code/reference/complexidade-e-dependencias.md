# Complexidade e dependências — a plataforma antes do pacote

> Peça da skill `clean-code`. Estrutura: princípio → por quê → regras com exemplo → checklist → cross-links.

## Princípio

Antes de acrescentar uma dependência — ou uma camada, uma opção de configuração, um wrapper —, desça a escada: **a linguagem e a plataforma** (Node, navegador) resolvem? **O framework** que já está no projeto (Nest, Next, Prisma) resolve? **Uma dependência já instalada** resolve? Só então um **pacote novo**, com o motivo registrado no plano ou no PR.

## Por que importa

- Toda dependência é código que você não escreveu, não revisou e vai ter que atualizar: dependências transitivas, vulnerabilidades, quebra em versão maior, pacote abandonado.
- Cada pacote a mais é uma segunda forma de fazer a mesma coisa: metade do projeto usa um, metade usa o outro, e o leitor precisa conhecer os dois.
- A plataforma avançou: muito do que pedia biblioteca há alguns anos (`fetch`, `AbortSignal.timeout`, `crypto.randomUUID`, `structuredClone`, `Intl`) hoje é nativo no Node e no navegador, sem instalar nada.
- Complexidade que entra no planejamento sem pergunta não sai mais: depois de implementada, removê-la vira refatoração.

## As regras (com exemplo no nosso stack)

### 1. A escada, nesta ordem
1. **Linguagem e plataforma** — o que o Node e o navegador já trazem.
2. **Framework do projeto** — o que Nest, Next e Prisma já fazem.
3. **Dependência já instalada** — o que o projeto já paga para manter.
4. **Pacote novo** — só com os critérios da regra 3, e com o motivo escrito.

```ts
// ruim: axios instalado para um GET com prazo
import axios from 'axios';
const { data } = await axios.get(`${baseUrl}/certificates/${enrollmentId}`, { timeout: 5000 });

// bom: a plataforma já faz — fetch e AbortSignal são nativos
const response = await fetch(`${baseUrl}/certificates/${enrollmentId}`, { signal: AbortSignal.timeout(5000) });
if (!response.ok) throw new BadGatewayException('O serviço de certificados não respondeu');
const certificate = (await response.json()) as CertificateResponse;
```
Cuidado que o pacote escondia e o nativo exige: `fetch` **não** lança em 4xx/5xx — confira `response.ok`. A chamada mora num adapter, atrás de uma interface nossa (`fronteiras.md`).

### 2. O que costuma ser instalado à toa

| Necessidade | Já existe | Pacote que costuma entrar sem precisar |
|---|---|---|
| Chamada HTTP | `fetch` + `AbortSignal.timeout` (Node e navegador) | `axios`, `node-fetch`, `request` |
| Id aleatório | `crypto.randomUUID()` | `uuid` |
| Cópia profunda | `structuredClone` | `lodash.clonedeep` |
| Moeda, número e data em pt-BR | `Intl.NumberFormat`, `Intl.DateTimeFormat` | `numeral`, `moment` |
| Query string | `URL`, `URLSearchParams` | `qs` |
| Listas: ordenar, filtrar, agrupar | `toSorted`, `filter`, `map`, `reduce` | `lodash`, `underscore` |
| Validar entrada no Nest | `class-validator` com `ValidationPipe` (já no projeto) | `joi`, `yup` em paralelo |
| Configuração no Nest | `ConfigModule` | leitura manual espalhada de `.env` |
| Cache e revalidação de dados no Next | o `fetch` do Next (cache, `revalidate`) e os Server Components | biblioteca de dados só para buscar e guardar |

A tabela não proíbe pacote: diz por onde começar. Se o nativo não cobre o caso real (fila distribuída, cliente Redis, gerador de PDF), o pacote entra pela regra 3.

### 3. Pacote novo: os critérios
- **O problema é presente**, não "vai que um dia".
- **A escada foi descida**: plataforma, framework e o que já está instalado foram comparados e não resolvem — e o motivo está escrito.
- **O pacote faz uma coisa** e é pequeno; dependências transitivas foram olhadas.
- **É mantido**: lançamento recente, issues respondidas, tipos para TypeScript, licença compatível, sem vulnerabilidade conhecida.
- **Entra atrás de uma interface nossa** quando é fronteira (Redis, fila, e-mail, gateway): trocar de pacote não toca em quem usa.
- **Substitui, não soma**: se o pacote novo faz o que um antigo fazia, o antigo sai no mesmo trabalho.

### 4. A mesma pergunta vale para complexidade que não é pacote
Camada, wrapper, opção de configuração, abstração genérica: cada uma precisa de um problema presente que ela resolve. Wrapper sobre wrapper, configuração que ninguém muda e "genérico para qualquer caso" são a mesma dívida de uma dependência desnecessária, só que escrita por nós. A exceção é deliberada: as camadas e as fronteiras da régua (`modulos-backend`) não entram nessa conta — a simplicidade vale **dentro** de cada camada.

### 5. No planejamento, não depois
A pergunta é feita quando o plano lista as dependências, antes da primeira linha de código: o plano declara cada pacote novo com o problema e o motivo de a escada não resolver, ou escreve "nenhuma". Pacote que aparece no PR sem ter passado pelo plano é achado de revisão.

## Checklist (revisão rápida)

- [ ] A linguagem, a plataforma, o framework ou uma dependência já instalada resolvem? (testado, não suposto)
- [ ] O pacote novo resolve um problema presente, e o motivo está no plano ou no PR?
- [ ] Ele é pequeno, mantido, tipado, de licença compatível e sem vulnerabilidade conhecida?
- [ ] Quando é fronteira, entra atrás de uma interface nossa?
- [ ] Se substitui um antigo, o antigo saiu?
- [ ] Camada, wrapper ou opção nova resolve um problema presente — sem contar as camadas da régua?

## Cross-links

- `fronteiras.md` — o pacote de terceiro entra atrás da **sua** interface.
- `padroes-de-projeto.md` — a mesma pergunta para padrão: a alternativa simples resolve?
- `design-e-concorrencia.md` — "mínimo de classes", a regra que segura o excesso.
- `smells.md` — *Speculative Generality* e código morto.
- `../../modulos-backend/reference/cache-e-filas.md` — Redis e fila: dependências que passam pelos critérios quando há dor medida.
