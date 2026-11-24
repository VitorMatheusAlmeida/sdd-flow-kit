// Text checks by locale (point 7): words that are almost always wrong without an accent, words that
// reveal a text explaining the mechanism, connectives ignored by the sentence-case check, and a
// money format that is wrong in the locale. A locale without a pack only gets the generic checks.

const ptBR = {
  missingAccents: {
    nao: 'não', voce: 'você', voces: 'vocês', ja: 'já', ate: 'até', tambem: 'também', entao: 'então',
    sera: 'será', serao: 'serão', estao: 'estão', ola: 'olá', apos: 'após', alem: 'além', porem: 'porém',
    numero: 'número', endereco: 'endereço', enderecos: 'endereços', informacao: 'informação',
    informacoes: 'informações', configuracao: 'configuração', configuracoes: 'configurações',
    verificacao: 'verificação', aprovacao: 'aprovação', inscricao: 'inscrição', inscricoes: 'inscrições',
    descricao: 'descrição', codigo: 'código', preco: 'preço', precos: 'preços', proximo: 'próximo',
    proxima: 'próxima', proximos: 'próximos', pagina: 'página', usuario: 'usuário', usuarios: 'usuários',
    servico: 'serviço', servicos: 'serviços', opcao: 'opção', opcoes: 'opções', sessao: 'sessão',
    conexao: 'conexão', conexoes: 'conexões', notificacao: 'notificação', notificacoes: 'notificações',
    publico: 'público', publica: 'pública', unico: 'único', unica: 'única', analise: 'análise',
    credito: 'crédito', debito: 'débito', cartao: 'cartão', cartoes: 'cartões', acao: 'ação', acoes: 'ações',
    operacao: 'operação', situacao: 'situação', avancar: 'avançar', juridica: 'jurídica', fisica: 'física',
    valido: 'válido', valida: 'válida', invalido: 'inválido', invalida: 'inválida', disponivel: 'disponível',
    disponiveis: 'disponíveis', possivel: 'possível', impossivel: 'impossível', obrigatorio: 'obrigatório',
    obrigatoria: 'obrigatória', automatico: 'automático', automatica: 'automática', historico: 'histórico',
    horario: 'horário', horarios: 'horários', calendario: 'calendário', comentario: 'comentário',
    relatorio: 'relatório', relatorios: 'relatórios', ultimo: 'último', ultima: 'última', ultimos: 'últimos',
    minimo: 'mínimo', maximo: 'máximo', periodo: 'período', saida: 'saída', conteudo: 'conteúdo',
    titulo: 'título', midia: 'mídia', video: 'vídeo', audio: 'áudio', inicio: 'início', termino: 'término',
    comeca: 'começa', comecar: 'começar', transferencia: 'transferência', experiencia: 'experiência',
    estatisticas: 'estatísticas', rapido: 'rápido', facil: 'fácil', dificil: 'difícil',
    solicitacao: 'solicitação', solicitacoes: 'solicitações', exclusao: 'exclusão', criacao: 'criação',
    edicao: 'edição', sugestao: 'sugestão', sugestoes: 'sugestões', promocao: 'promoção', atencao: 'atenção',
    seguranca: 'segurança', agencia: 'agência', digito: 'dígito', tres: 'três', mes: 'mês',
  },
  mechanism: [
    /\bservidor(es)?\b/i, /\barmazen/i, /\bcriptograf/i, /\btoken\b/i, /\bbanco de dados\b/i,
    /\bwebhook\b/i, /\bAPI\b/, /\bcache\b/i, /\bautomaticamente\b/i, /\bpor seguran[çc]a\b/i,
    /\bnunca (é|são)? ?(guardad|armazenad)/i, /\bID\b/, /\bsincroniz/i,
  ],
  connectives: ['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'para', 'por', 'com', 'a', 'o', 'as', 'os'],
  // R$ 12.00 or R$ 1.234.56: decimal point instead of comma.
  wrongMoney: 'R\\$\\s?\\d{1,3}(?:\\.\\d{3})*\\.\\d{2}\\b',
  plural: /\b\d+ \w+(eis|ões|s)\b/,
};

const en = {
  missingAccents: {},
  mechanism: [
    /\bserver(s)?\b/i, /\bstored\b/i, /\bencrypt/i, /\btoken\b/i, /\bdatabase\b/i, /\bwebhook\b/i,
    /\bAPI\b/, /\bcache\b/i, /\bautomatically\b/i, /\bfor security reasons\b/i, /\bID\b/, /\bsync(hroniz)/i,
  ],
  connectives: ['of', 'the', 'and', 'or', 'in', 'on', 'to', 'for', 'with', 'a', 'an', 'at', 'by'],
  wrongMoney: '',
  plural: /\b\d+ \w+s\b/,
};

const PACKS = { 'pt-BR': ptBR, en };

export function textRules(locale) {
  return PACKS[locale] ?? { ...en, mechanism: [], connectives: [] };
}

export function missingAccentsIn(text, rules) {
  const found = [];
  for (const word of text.toLowerCase().normalize('NFC').match(/[a-zçãõáéíóúâêôà]+/g) ?? []) {
    const right = rules.missingAccents[word];
    if (right) found.push(`${word} → ${right}`);
  }
  return found;
}

/** "Finish Order", "Dados Do Pedido": two or more common words after the first, all capitalized. */
export function isTitleCase(text, rules) {
  const words = text.trim().split(/\s+/).filter((w) => /^[A-Za-zÀ-ú]/.test(w));
  if (words.length < 2) return false;
  const connectives = new Set(rules.connectives);
  const after = words.slice(1).filter((w) => !connectives.has(w.toLowerCase()) && w.length > 2);
  const capitalized = after.filter((w) => /^[A-ZÀ-Ú][a-zà-ú]/.test(w));
  // A proper name in the middle is common: require two or more capitalized words.
  return capitalized.length >= 2 && capitalized.length === after.length;
}
