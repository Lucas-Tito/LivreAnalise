export interface PackedBar<T> {
  bar: T
  column: number
}

export interface BarLayout<T> {
  bars: Array<T & { column: number }>
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
  const packed = sorted.map((bar) => {
    let column = columnBottoms.findIndex((bottom) => bottom <= bar.top)
    if (column === -1) {
      column = columnBottoms.length
      columnBottoms.push(0)
    }
    columnBottoms[column] = bar.top + BAR_HEIGHT
    return { ...bar, column }
  })
  return {
    bars: packed,
    columnCount: Math.max(1, minColumns, columnBottoms.length)
  }
}
