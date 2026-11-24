# Padrões de projeto — quando usar, e quando a solução simples ganha

> Peça da skill `clean-code`. Estrutura: princípio → por quê → regras com exemplo → checklist → cross-links.

## Princípio

Um padrão é uma **solução nomeada** para um problema recorrente de desenho, num contexto. Ele serve para dar **vocabulário** ("isto é um Adapter") e reusar uma estrutura testada — e só entra quando o **problema é real e presente** e a alternativa simples não resolve.

## Por que importa

- Cada padrão acrescenta indireção: mais um salto para ler, mais um arquivo para depurar. Ela só se paga se comprar uma flexibilidade que vai mesmo ser usada.
- Padrão para dor hipotética é *Speculative Generality*, o cheiro de quem desenhou para um futuro que não chegou.
- Em TypeScript, muito do que pedia classe e hierarquia em Java vira **função, `Record` de funções, união de tipos ou composição**. O padrão continua o mesmo; a forma fica menor.
- No NestJS, vários padrões já vêm prontos (injeção de dependência, provider único, decorator, `useFactory`). Reimplementá-los à mão é desperdício.

## As regras (com exemplo no nosso stack)

### 1. A regra de ouro: quatro perguntas antes de qualquer padrão
1. **Há um problema real e presente?** Sem dor, não aplique.
2. **A alternativa simples resolve?** Função, `Record`, união de tipos, composição — compare sempre.
3. **A que princípio ele serve?** Quase todos realizam "aberto para extensão, fechado para modificação" ou "dependa da abstração". Padrão é meio, não fim.
4. **A indireção se paga?** Só se a flexibilidade comprada vai ser usada.

Quando a dor aparece num código que já existe, **refatore para o padrão** em passos seguros, em vez de já nascer com ele.

### 2. Onde os padrões já aparecem no nosso stack

| Padrão | Problema que resolve | No gabarito e no Nest |
|---|---|---|
| **Adapter** | o que existe não tem a interface que eu preciso | `CourseCatalogDbAdapter` implementa a porta que `enrollments` declarou; `KeyvCacheStore` adapta o `cache-manager` à interface `CacheStore` |
| **Facade** | um subsistema complexo atrás de uma entrada simples | `CacheStore`: Redis, Keyv, single-flight e TTL atrás de `getOrLoad` e `invalidate` |
| **Strategy** | o mesmo `switch` por tipo repetido em vários lugares | `Record` de funções por tipo (regra 3) |
| **Decorator** | acrescentar comportamento sem mexer no código | decorators e interceptors do Nest (`@UseGuards`, o interceptor que aplica `no-store`) |
| **Factory** | criação que depende de configuração ou de contexto | `useFactory` do `CacheModule.registerAsync`; `makeEnrollmentDto` nos testes |
| **Builder** | objeto com muitas partes opcionais | dado de teste montado passo a passo; raro em código de produção |
| **Singleton** | uma instância só | todo provider do Nest já é único por padrão — nunca `static instance` à mão |

O vocabulário vale mais que a implementação: dizer "o adapter do dono" numa revisão já explica de onde vem o dado e quem o mantém.

### 3. Strategy em TypeScript: um `Record`, não uma hierarquia
```ts
// ruim: o mesmo switch em três lugares (preço, descrição, nota fiscal)
function computePrice(course: PricedCourse) {
  switch (course.pricing) {
    case 'FREE': return 0;
    case 'FIXED': return course.priceCents;
    case 'PER_LESSON': return course.lessonCount * course.lessonPriceCents;
  }
}
// bom: uma estratégia por tipo, num lugar; tipo novo = uma linha, e o compilador cobra a ausência
const PRICE_BY_PRICING: Record<PricingType, (course: PricedCourse) => number> = {
  FREE: () => 0,
  FIXED: (course) => course.priceCents,
  PER_LESSON: (course) => course.lessonCount * course.lessonPriceCents,
};

const price = PRICE_BY_PRICING[course.pricing](course);
```
Um `switch` só, num lugar só, não é cheiro: fica como está. O sinal para o Strategy é o **mesmo** `switch` aparecendo de novo (regra dos três).

### 4. Quando NÃO usar
- **Interface com uma implementação** que não vai ganhar outra: é indireção sem troca. A exceção é a fronteira com terceiro (Redis, e-mail, gateway), onde a interface protege da troca de fornecedor e permite o dublê no teste.
- **Hierarquia de classes para dois casos:** uma condição resolve.
- **Abstract Factory para uma família só**, **Builder para três campos**, **Singleton à mão** num container que já injeta: complexidade sem o problema que a justifica.
- **Padrão "para o futuro":** o futuro pede uma refatoração quando chegar; o padrão antecipado costuma errar a direção.

## Checklist (revisão rápida)

- [ ] O padrão resolve um problema **presente**, com dor que dá para apontar no código?
- [ ] A alternativa simples (função, `Record`, união de tipos, composição) foi comparada e perdeu?
- [ ] A indireção acrescentada compra uma flexibilidade que vai ser usada?
- [ ] O padrão não reimplementa algo que o Nest já dá (DI, provider único, decorator, `useFactory`)?
- [ ] Interface com uma implementação só existe por ser fronteira com terceiro?
- [ ] O nome do padrão aparece onde ajuda a entender (`…Adapter`), e não como enfeite?

## Cross-links

- `fronteiras.md` — Adapter na fronteira com terceiro; a interface é sua.
- `smells.md` — G23 (`switch` repetido por tipo) é o gatilho do Strategy.
- `design-e-concorrencia.md` — "mínimo de classes": a regra de menor prioridade do design simples, e a que segura o excesso de padrão.
- `classes.md` — depender de abstração injetada, não de concreto.
- `../../modulos-backend/reference/propriedade-de-tabelas.md` — o adapter do dono que implementa a porta do consumidor.
- `../../modulos-backend/reference/cache-e-filas.md` — o `CacheStore` como fachada do Redis.
- `refatoracao.md` — refatorar para o padrão em passos seguros, quando a dor aparece.
