/**
 * Normaliza texto para busca: tira acento e caixa.
 *
 * Procurar "comunicacao" nao achava "COMUNICAÇÃO", e digitar o termo com acento
 * exato e justamente o que ninguem faz ao filtrar uma lista de 399 codigos.
 * O NFD separa a letra do diacritico, e aí os diacriticos somem; a decomposicao
 * tambem resolve ç -> c, que nao e um acento mas se decompoe igual.
 */
export function normalizarBusca(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

/** `alvo` contem `termo`, ignorando acento e caixa. Termo vazio casa com tudo. */
export function casaBusca(alvo: string, termo: string): boolean {
  const t = normalizarBusca(termo.trim())
  if (t === '') return true
  return normalizarBusca(alvo).includes(t)
}

/** `alvo` e exatamente `termo`, ignorando acento e caixa. */
export function mesmoTermo(alvo: string, termo: string): boolean {
  return normalizarBusca(alvo) === normalizarBusca(termo.trim())
}

export interface Ocorrencia {
  start: number
  end: number
}

/**
 * Todas as ocorrencias de `termo` em `texto`, em posicoes do texto ORIGINAL.
 *
 * Normalizar pode mudar o comprimento (um caractere acentuado composto vira
 * dois no NFD), entao nao da para buscar no texto normalizado e usar o indice
 * direto -- as posicoes sairiam deslocadas e o destaque cairia no lugar errado.
 * Daí o mapa de indices: para cada caractere do texto normalizado, de qual
 * caractere do original ele veio.
 */
export function acharOcorrencias(texto: string, termo: string): Ocorrencia[] {
  const t = normalizarBusca(termo)
  if (t === '') return []

  let normalizado = ''
  const origem: number[] = []
  for (let i = 0; i < texto.length; i++) {
    const pedaco = normalizarBusca(texto[i])
    for (let j = 0; j < pedaco.length; j++) origem.push(i)
    normalizado += pedaco
  }

  const achados: Ocorrencia[] = []
  let de = normalizado.indexOf(t)
  while (de !== -1) {
    const start = origem[de]
    // +1 porque `origem` guarda o indice do caractere, e o fim e exclusivo
    const end = (origem[de + t.length - 1] ?? texto.length - 1) + 1
    achados.push({ start, end })
    de = normalizado.indexOf(t, de + 1)
  }
  return achados
}
