export function excerptAction(codingIds: number[], noteIds: number[]): 'code' | 'note' | 'choose' | 'none' {
  if (codingIds.length + noteIds.length > 1) return 'choose'
  if (noteIds.length === 1) return 'note'
  if (codingIds.length === 1) return 'code'
  return 'none'
}
