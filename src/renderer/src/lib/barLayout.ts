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

// Distribui as etiquetas em colunas para que duas nunca se sobreponham na
// vertical. `minColumns` mantem o resultado monotonico: a largura da coluna de
// etiquetas altera a largura do texto, que re-quebra as linhas e muda as
// posicoes medidas -- deixar o numero de colunas encolher realimentaria esse
// ciclo indefinidamente.
export function packBarColumns<T extends { top: number }>(
  bars: T[],
  minColumns = 1
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
    columnBottoms[column] = bar.top + BAR_HEIGHT
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
          if (neighbors[mid].top + BAR_HEIGHT <= bar.top) low = mid + 1
          else high = mid
        }
        if (low < neighbors.length && neighbors[low].top < bar.top + BAR_HEIGHT) {
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
