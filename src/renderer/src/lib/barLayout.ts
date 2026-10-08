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
export function laneBounds(
  colunas: number,
  tetoPadrao: number,
  pisoAbsoluto: number,
  larguraInicial?: number
): LaneSizes {
  const minimo = Math.max(pisoAbsoluto, colunas * 80 + 16)
  // O teto tem que crescer com as colunas igual o piso, senao em 8 colunas os
  // dois se encontram e o divisor trava de novo. A largura automatica
  // (150px por coluna) e a referencia do quanto a faixa pode legitimamente
  // ocupar; o teto fixo so vale enquanto as colunas sao poucas.
  const automatica = Math.max(180, colunas * 150 + 16)
  const maximo = Math.max(tetoPadrao, automatica, minimo, larguraInicial ?? 0)
  return { minimo, maximo }
}

/** Largura resultante de arrastar o divisor, ja dentro dos limites. */
export function clampLaneWidth(
  desejada: number,
  colunas: number,
  tetoPadrao: number,
  pisoAbsoluto: number,
  larguraInicial?: number
): number {
  const { minimo, maximo } = laneBounds(colunas, tetoPadrao, pisoAbsoluto, larguraInicial)
  return Math.min(maximo, Math.max(minimo, desejada))
}
