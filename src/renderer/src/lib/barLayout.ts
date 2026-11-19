export interface PackedBar<T> {
  bar: T
  column: number
  columnSpan: number
}

export interface BarLayout<T> {
  bars: Array<T & { column: number; columnSpan: number }>
  columnCount: number
}

const BAR_HEIGHT = 24

export interface ExcerptBar<T> {
  item: T
  /** Posições das linhas visuais cobertas pelo trecho, já centralizadas. */
  lineTops: number[]
}

/** Prefere o meio do trecho e usa outras linhas antes de dividir a largura.
 * Se todas as linhas estiverem ocupadas, reúne os códigos na mesma etiqueta:
 * cada membro continua associado a uma linha dentro do próprio trecho.
 */
export function distributeExcerptBars<T>(excerpts: ExcerptBar<T>[], spacing = BAR_HEIGHT): Array<{ items: T[]; top: number }> {
  const rows = new Map<number, Array<{ items: T[]; top: number; singleLine: boolean }>>()
  const bounds = new Map<T, { min: number; max: number }>()
  // Normaliza antes de ordenar: uma linha dividida em vários fragmentos
  // (pelas notas ou pela busca) ocupa uma linha só e precisa reservá-la
  // antes dos trechos multilinha, como qualquer trecho curto.
  const sorted = excerpts
    .map((excerpt) => ({
      item: excerpt.item,
      tops: [...new Set(excerpt.lineTops.map((top) => Math.round(top)))].sort((a, b) => a - b)
    }))
    .filter((excerpt) => excerpt.tops.length > 0)
    .sort((a, b) => a.tops.length - b.tops.length)
  for (const { item, tops } of sorted) {
    bounds.set(item, { min: tops[0], max: tops[tops.length - 1] })
    const middle = (tops[0] + tops[tops.length - 1]) / 2
    const preferred = [...tops].sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle) || a - b)
    const singleLine = tops.length === 1
    const free = preferred.find((top) => !rows.has(top))
    const top = free ?? preferred[0]
    const occupants = rows.get(top) ?? []
    if (occupants.length === 0 || (singleLine && occupants.every((bar) => bar.singleLine))) {
      occupants.push({ items: [item], top, singleLine })
      rows.set(top, occupants)
    } else {
      // Não cria colunas para trechos multilinha, mesmo em regiões muito densas.
      rows.set(top, [{ items: [...occupants.flatMap((bar) => bar.items), item], top, singleLine: false }])
    }
  }
  const bars = [...rows.values()].flat().map(({ items, top }) => ({ items, top }))
  // Entre duas linhas, o centro exato pode estar no espaço entre elas. Usa-o
  // quando estiver livre, sem desfazer a distribuição dos grupos mais densos.
  for (const bar of bars) {
    const min = Math.max(...bar.items.map((item) => bounds.get(item)!.min))
    const max = Math.min(...bar.items.map((item) => bounds.get(item)!.max))
    const middle = (min + max) / 2
    if (bars.every((other) => other === bar || Math.abs(other.top - middle) >= spacing)) {
      bar.top = middle
    }
  }
  return bars
}

// Distribui as etiquetas em colunas para que duas nunca se sobreponham na
// vertical. `minColumns` mantem o resultado monotonico: a largura da coluna de
// etiquetas altera a largura do texto, que re-quebra as linhas e muda as
// posicoes medidas -- deixar o numero de colunas encolher realimentaria esse
// ciclo indefinidamente.
export function packBarColumns<T extends { top: number }>(
  bars: T[],
  minColumns = 1,
  barHeight = BAR_HEIGHT
): BarLayout<T> {
  const sorted = [...bars].sort((a, b) => a.top - b.top)
  const columnBottoms: number[] = []
  const columnBars: T[][] = []
  const packed = sorted.map((bar) => {
    let column = columnBottoms.findIndex((bottom) => bottom <= bar.top)
    if (column === -1) {
      column = columnBottoms.length
      columnBottoms.push(0)
      columnBars.push([])
    }
    columnBottoms[column] = bar.top + barHeight
    columnBars[column].push(bar)
    return { ...bar, column }
  })
  const columnCount = Math.max(1, minColumns, columnBottoms.length)
  return {
    bars: packed.map((bar) => {
      let endColumn = columnCount
      for (let column = bar.column + 1; column < columnBars.length; column++) {
        const neighbors = columnBars[column]
        // Cada coluna está ordenada e sem sobreposição. Busca a primeira
        // etiqueta que termina depois do início desta, inclusive as que
        // começam mais acima: elas também bloqueiam a expansão horizontal.
        let low = 0
        let high = neighbors.length
        while (low < high) {
          const mid = Math.floor((low + high) / 2)
          if (neighbors[mid].top + barHeight <= bar.top) low = mid + 1
          else high = mid
        }
        if (low < neighbors.length && neighbors[low].top < bar.top + barHeight) {
          endColumn = column
          break
        }
      }
      return { ...bar, columnSpan: endColumn - bar.column }
    }),
    columnCount
  }
}

export interface LaneConfig {
  /** Largura minima de uma etiqueta mais o vao entre colunas. */
  minimoPorColuna: number
  /** Folga nas pontas da faixa. */
  padding: number
  /** Largura por coluna na medida automatica. */
  autoPorColuna: number
  /** Teto enquanto as colunas sao poucas. */
  tetoPadrao: number
  /** Piso absoluto, independente de quantas colunas existem. */
  pisoAbsoluto: number
}

export interface LaneSizes {
  /** Minimo abaixo do qual as etiquetas deixam de caber lado a lado. */
  minimo: number
  /** Teto do arrasto. */
  maximo: number
}

/**
 * Limites do arrasto da faixa de etiquetas.
 *
 * O teto era a constante 640, mas o piso cresce com as colunas
 * (`colunas * 80 + 16`) e passa dela em 8 colunas: a partir dai o arrasto
 * mudava o estado e a largura efetiva ficava presa no piso, entao o divisor
 * virava um no-op silencioso. O teto tambem precisa alcancar a largura de onde
 * o arrasto comeca, senao o primeiro pixel de movimento puxava a faixa para
 * 640 de uma vez -- mais de 500px de salto com 8 colunas.
 */
/**
 * Limites do arrasto da faixa de etiquetas.
 *
 * O teto era uma constante, mas o piso cresce com as colunas e passava dela a
 * partir de 8: o arrasto mudava o estado e a largura efetiva ficava presa no
 * piso, entao o divisor virava um no-op silencioso. O teto tambem precisa
 * alcancar a largura de onde o arrasto comeca, senao o primeiro pixel puxava a
 * faixa para o teto fixo de uma vez.
 *
 * As medidas vem por parametro de proposito: escritas aqui como numero, uma
 * mudanca nas constantes do painel faria esta funcao discordar em silencio e
 * reintroduziria o travamento que ela existe para consertar.
 */
export function laneBounds(
  colunas: number,
  cfg: LaneConfig,
  larguraInicial?: number
): LaneSizes {
  const minimo = Math.max(cfg.pisoAbsoluto, colunas * cfg.minimoPorColuna + cfg.padding)
  const automatica = Math.max(180, colunas * cfg.autoPorColuna + cfg.padding)
  const maximo = Math.max(cfg.tetoPadrao, automatica, minimo, larguraInicial ?? 0)
  return { minimo, maximo }
}

/** Largura resultante de arrastar o divisor, ja dentro dos limites. */
export function clampLaneWidth(
  desejada: number,
  colunas: number,
  cfg: LaneConfig,
  larguraInicial?: number
): number {
  const { minimo, maximo } = laneBounds(colunas, cfg, larguraInicial)
  return Math.min(maximo, Math.max(minimo, desejada))
}

/**
 * Le a largura guardada no localStorage.
 *
 * Sem teto de proposito: o teto do arrasto cresce com as colunas, entao uma
 * largura legitima de 900px era descartada na reabertura por ser maior que a
 * constante de 640 -- o arrasto destravado nao sobrevivia justamente nos casos
 * que o destravamento liberou. O piso de cada documento e aplicado depois, na
 * largura efetiva.
 */
export function larguraGuardada(cru: string | null, cfg: LaneConfig): number | null {
  if (cru == null || cru === '') return null
  const n = Number(cru)
  return Number.isFinite(n) && n >= cfg.pisoAbsoluto ? n : null
}
