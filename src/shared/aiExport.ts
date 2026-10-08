import { buildLibraryTree, type CodeNode } from './codeTree'
import { computeSegments } from './segments'
import type { Code, Coding, Collection, CollectionMember, Note } from './types'

export type AiExportScope = 'structure' | 'document' | 'full'

export interface AiExportDocument {
  id?: number
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
  // opt-in explícito: notas entram como comentário do pesquisador, nunca
  // escondidas no escopo "só estrutura" sem aviso
  includeNotes?: boolean
  projectNotes?: Note[]
  notesByDocument?: Map<number, Note[]> | Record<number, Note[]>
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

function notesForDocument(
  notesByDocument: Map<number, Note[]> | Record<number, Note[]>,
  documentId: number
): Note[] {
  if (notesByDocument instanceof Map) return notesByDocument.get(documentId) ?? []
  return (notesByDocument as Record<number, Note[]>)[documentId] ?? []
}

const NOTA_MAX = 2000

/**
 * O export ensina a IA a ler a estrutura ("## Documento:", «trecho» [CODIGO]).
 * Uma nota que contenha esse padrao forja a estrutura e desloca tudo que vem
 * depois para o documento errado -- e nao precisa de ma fe: basta o pesquisador
 * ter escrito um memo sobre a propria ferramenta.
 */
export function sanearNota(texto: string): string {
  const cortado =
    texto.length > NOTA_MAX ? `${texto.slice(0, NOTA_MAX)}… (nota truncada)` : texto
  return cortado
    // cabecalho no comeco de linha e o que define secao no arquivo
    .replace(/^(\s*)(#{1,6})(\s)/gm, '$1\u200b$2$3')
    // as aspas angulares delimitam trecho codificado
    .replace(/[«»]/g, '"')
    .replace(/\r?\n/g, ' ')
}

function linhaDaNota(nota: Note, texto: string | null): string {
  const titulo = nota.title ? `${sanearNota(nota.title)} — ` : ''
  const corpo = sanearNota(nota.body)
  if (nota.scope === 'excerpt' && nota.anchorStatus === 'attached' && nota.startPos != null && nota.endPos != null && texto != null) {
    // o trecho vem do documento e pode ter quebra de linha: sem sanear, a linha
    // do item partia em duas e o resto aparecia solto, fora de qualquer nota
    const trecho = sanearNota(texto.slice(nota.startPos, nota.endPos))
    return `- [trecho ${nota.startPos}–${nota.endPos} «${trecho}»] ${titulo}${corpo}`
  }
  if (nota.scope === 'excerpt' && nota.anchorStatus === 'detached') {
    const original = nota.anchorText
      ? ` (âncora perdida, texto original: «${sanearNota(nota.anchorText)}»)`
      : ' (âncora perdida)'
    return `- [trecho desvinculado] ${titulo}${corpo}${original}`
  }
  if (nota.scope === 'document') return `- [documento] ${titulo}${corpo}`
  return `- ${titulo}${corpo}`
}

// Notas como comentário do pesquisador: marcadas, por documento + globais.
// No escopo "só estrutura" com opt-in, só contagem/títulos — nunca o corpo.
export function buildNotesSection(
  scope: AiExportScope,
  projectNotes: Note[],
  documentNotes: Note[],
  documentName: string | null,
  texto: string | null
): string {
  const linhas = [
    scope === 'structure'
      ? '## Notas do pesquisador (só títulos — escopo estrutura)'
      : documentName
        ? `## Notas do pesquisador — ${documentName}`
        : '## Notas do pesquisador'
  ]
  linhas.push('')
  linhas.push('_Comentário do pesquisador, não fala de participante._')
  linhas.push('')
  if (scope === 'structure') {
    if (projectNotes.length === 0 && documentNotes.length === 0) {
      linhas.push('_(nenhuma)_')
    } else {
      linhas.push(`Notas de projeto: ${projectNotes.length}`)
      for (const n of projectNotes) linhas.push(`- ${n.title ?? '(sem título)'}`)
      if (documentNotes.length > 0) {
        linhas.push(`Notas de documentos/trechos: ${documentNotes.length} (títulos omitidos no escopo estrutura)`)
      }
    }
    return linhas.join('\n')
  }
  if (documentNotes.length === 0 && (documentName || projectNotes.length === 0)) {
    linhas.push('_(nenhuma)_')
    return linhas.join('\n')
  }
  for (const n of documentNotes) linhas.push(linhaDaNota(n, texto))
  if (!documentName && projectNotes.length > 0) {
    linhas.push('', '### Notas do projeto')
    linhas.push('')
    for (const n of projectNotes) linhas.push(linhaDaNota(n, null))
  }
  return linhas.join('\n')
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
  if (input.includeNotes && input.scope !== 'structure') {
    blocos.push('Notas do pesquisador vêm em seção própria, marcadas como comentário do pesquisador.', '')
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
    if (input.includeNotes && documento.id != null) {
      blocos.push(
        '',
        buildNotesSection(
          input.scope,
          [],
          notesForDocument(input.notesByDocument ?? {}, documento.id),
          documento.name,
          documento.plainText
        )
      )
    }
  }

  if (input.includeNotes && input.scope === 'full' && (input.projectNotes ?? []).length > 0) {
    blocos.push('', buildNotesSection(input.scope, input.projectNotes ?? [], [], null, null))
  }

  if (input.includeNotes && input.scope === 'structure') {
    const docNotes: Note[] = []
    const source = input.notesByDocument ?? {}
    const all = source instanceof Map
      ? [...source.values()].flat()
      : Object.values(source).flat()
    docNotes.push(...all)
    blocos.push('', buildNotesSection(input.scope, input.projectNotes ?? [], docNotes, null, null))
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
code_group_members(group_id, code_id), codings(document_id, code_id, start_pos, end_pos),
notes(scope, document_id, start_pos, end_pos, anchor_status)

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
