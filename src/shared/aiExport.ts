import { buildLibraryTree, type CodeNode } from './codeTree'
import { computeSegments } from './segments'
import type { Code, Coding, Collection, CollectionMember } from './types'

export type AiExportScope = 'structure' | 'document' | 'full'

export interface AiExportDocument {
  name: string
  plainText: string
  codings: Coding[]
}

export interface AiExportInput {
  projectName: string
  scope: AiExportScope
  codes: Code[]
  collections: Collection[]
  members: CollectionMember[]
  documents: AiExportDocument[]
  // contagem de uso dos códigos: vale em todos os escopos, inclusive no que não
  // leva texto nenhum
  allCodings: Coding[]
}

const AVISO =
  'AVISO: este arquivo contém material de pesquisa. Ao enviá-lo para um serviço de ' +
  'IA, esse material sai do seu computador. Em entrevistas isso pode incluir fala de ' +
  'participante identificável — confirme o consentimento e as regras do seu comitê de ' +
  'ética antes.'

const LEGENDA =
  'Trechos entre « » estão codificados, e o código aparece entre colchetes logo ' +
  'depois: «trecho» [CÓDIGO]. Quando mais de um código cobre o mesmo trecho, eles ' +
  'aparecem separados por vírgula.'

function contagem(codings: Coding[]): Map<number, number> {
  const total = new Map<number, number>()
  for (const c of codings) total.set(c.codeId, (total.get(c.codeId) ?? 0) + 1)
  return total
}

function linhaDoCodigo(
  node: CodeNode,
  usos: Map<number, number>,
  nivel: number
): string[] {
  const recuo = '  '.repeat(nivel)
  const grupo = node.children.length > 0
  const uso = usos.get(node.code.id) ?? 0
  const sufixo = grupo ? ' (grupo)' : uso > 0 ? ` — ${uso} citações` : ''
  const linhas = [`${recuo}- ${node.code.name}${sufixo}`]
  for (const filho of node.children) {
    linhas.push(...linhaDoCodigo(filho, usos, nivel + 1))
  }
  return linhas
}

export function buildStructureSection(
  codes: Code[],
  collections: Collection[],
  members: CollectionMember[],
  todasAsCodings: Coding[]
): string {
  const usos = contagem(todasAsCodings)
  const arvore = buildLibraryTree(codes, collections, members)
  const linhas: string[] = ['## Códigos, grupos e coleções', '']

  for (const colecao of arvore.collections) {
    linhas.push(`### Coleção: ${colecao.collection.name}`)
    if (colecao.children.length === 0) linhas.push('_(vazia)_')
    for (const filho of colecao.children) linhas.push(...linhaDoCodigo(filho, usos, 0))
    linhas.push('')
  }

  if (arvore.loose.length > 0) {
    linhas.push('### Sem coleção')
    for (const node of arvore.loose) linhas.push(...linhaDoCodigo(node, usos, 0))
    linhas.push('')
  }

  return linhas.join('\n')
}

// Reaproveita o computeSegments que pinta os destaques na tela: o texto marcado
// sai igual ao que o usuário vê, e a sobreposição de códigos é resolvida uma vez só.
export function buildDocumentSection(
  documento: AiExportDocument,
  codes: Code[]
): string {
  const nomePorId = new Map(codes.map((c) => [c.id, c.name]))
  const codingPorId = new Map(documento.codings.map((c) => [c.id, c]))
  const segmentos = computeSegments(documento.plainText.length, documento.codings)

  const partes: string[] = []
  for (const seg of segmentos) {
    const trecho = documento.plainText.slice(seg.start, seg.end)
    if (seg.codingIds.length === 0) {
      partes.push(trecho)
      continue
    }
    const nomes = seg.codingIds
      .map((id) => codingPorId.get(id))
      .map((coding) => (coding ? nomePorId.get(coding.codeId) : undefined))
      .filter((nome): nome is string => Boolean(nome))
    const unicos = [...new Set(nomes)]
    partes.push(unicos.length > 0 ? `«${trecho}» [${unicos.join(', ')}]` : trecho)
  }

  return `## Documento: ${documento.name}\n\n${partes.join('')}`
}

export function buildAiExport(input: AiExportInput): string {
  const blocos: string[] = [
    `# ${input.projectName} — exportação para IA`,
    '',
    AVISO,
    ''
  ]

  if (input.scope !== 'structure') {
    blocos.push(LEGENDA, '')
  }

  blocos.push(
    buildStructureSection(
      input.codes,
      input.collections,
      input.members,
      input.allCodings
    )
  )

  for (const documento of input.documents) {
    blocos.push('', buildDocumentSection(documento, input.codes))
  }

  return blocos.join('\n').trimEnd() + '\n'
}

// Nome sugerido no diálogo de salvar; o usuário pode trocar.
export function suggestedFileName(
  projectName: string,
  scope: AiExportScope
): string {
  const rotulo =
    scope === 'structure' ? 'estrutura' : scope === 'document' ? 'documento' : 'completo'
  return `${projectName} - para IA (${rotulo}).txt`
}

// Modo avançado: instruções para uma IA de terminal ler o projeto direto, sem
// export manual. O somente-leitura aqui é garantia do driver, não promessa.
export function buildCliInstructions(projectPath: string): string {
  return `Este é um projeto do LivreAnalise. O arquivo é um banco SQLite.

Abra SEMPRE em modo somente-leitura — nunca escreva neste arquivo, é o material de
pesquisa de alguém:

  sqlite3 -readonly "${projectPath}"

Em Python:  sqlite3.connect("file:CAMINHO?mode=ro", uri=True)
Em Node:    new Database("CAMINHO", { readonly: true })

Três regras do modelo que o esquema não deixa óbvias:

1. "grupo" não é tabela: é um código que tem filhos (codes.parent_id apontando
   para ele). O código-folha é o único que recebe citação.
2. "coleção" é a tabela code_groups, e code_group_members liga coleção a código.
   O nome da tabela é histórico.
3. A citação é posição de caractere no texto do documento. O trecho sai com:
   substr(d.plain_text, c.start_pos + 1, c.end_pos - c.start_pos)

Tabelas: project_meta, documents(plain_text), codes(parent_id), code_groups,
code_group_members(group_id, code_id), codings(document_id, code_id, start_pos, end_pos)

Consultas de exemplo:

-- códigos mais usados
SELECT c.name, COUNT(g.id) AS usos FROM codes c
LEFT JOIN codings g ON g.code_id = c.id
GROUP BY c.id ORDER BY usos DESC;

-- todos os trechos de um código
SELECT d.name, substr(d.plain_text, g.start_pos + 1, g.end_pos - g.start_pos) AS trecho
FROM codings g JOIN documents d ON d.id = g.document_id
JOIN codes c ON c.id = g.code_id WHERE c.name = 'NOME DO CÓDIGO';

-- a árvore coleção > grupo > código
SELECT col.name AS colecao, pai.name AS grupo, f.name AS codigo
FROM code_groups col
JOIN code_group_members m ON m.group_id = col.id
JOIN codes pai ON pai.id = m.code_id
LEFT JOIN codes f ON f.parent_id = pai.id
ORDER BY col.name, pai.name, f.name;

-- códigos que aparecem no mesmo trecho (co-ocorrência)
SELECT a.name, b.name, COUNT(*) AS juntos
FROM codings x JOIN codings y
  ON x.document_id = y.document_id AND x.id < y.id
  AND x.start_pos < y.end_pos AND y.start_pos < x.end_pos
JOIN codes a ON a.id = x.code_id JOIN codes b ON b.id = y.code_id
GROUP BY a.id, b.id ORDER BY juntos DESC;`
}
