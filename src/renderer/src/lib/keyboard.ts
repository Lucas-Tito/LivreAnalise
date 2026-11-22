export interface KeyBinding {
  key: string
  mod?: boolean
  shift?: boolean
}

export interface KeyboardCommand {
  label: string
  group: string
  keys?: readonly KeyBinding[]
  hint?: string
}

const mod = (key: string, shift = false): KeyBinding => ({ key, mod: true, shift })

export const keyboardCommands = {
  palette: { label: 'Paleta de comandos', group: 'Área de trabalho', keys: [mod('k')] },
  help: { label: 'Ajuda de atalhos', group: 'Área de trabalho', keys: [{ key: 'F1' }] },
  nextArea: { label: 'Ir para a próxima área', group: 'Área de trabalho', keys: [{ key: 'F6' }] },
  previousArea: { label: 'Ir para a área anterior', group: 'Área de trabalho', keys: [{ key: 'F6', shift: true }] },
  focusToolbar: { label: 'Ir para a barra superior', group: 'Área de trabalho' },
  focusSidebar: { label: 'Ir para a barra lateral', group: 'Área de trabalho' },
  focusDocument: { label: 'Navegar pelo texto', group: 'Documentos' },
  focusNotes: { label: 'Ir para o painel de notas', group: 'Notas e memos' },
  quickDocument: { label: 'Abrir documento', group: 'Documentos', keys: [mod('p')] },
  importDocuments: { label: 'Importar documentos', group: 'Documentos' },
  findText: { label: 'Buscar no documento', group: 'Documentos', keys: [mod('f')] },
  searchNext: { label: 'Próximo resultado da busca no documento', group: 'Documentos', hint: 'F3 ou Enter na busca' },
  searchPrevious: { label: 'Resultado anterior da busca no documento', group: 'Documentos', hint: 'Shift+F3 ou Shift+Enter na busca' },
  renameDocument: { label: 'Renomear documento', group: 'Documentos', keys: [{ key: 'F2' }] },
  editText: { label: 'Entrar ou sair da edição de texto', group: 'Documentos', keys: [mod('e')] },
  saveText: { label: 'Salvar o texto em edição', group: 'Documentos', keys: [mod('s')] },
  readText: { label: 'Mover o cursor de análise', group: 'Documentos', hint: 'Setas, Home/End e Page Up/Page Down' },
  selectText: { label: 'Selecionar texto no modo de análise', group: 'Documentos', hint: 'Shift+setas' },
  codeSelection: { label: 'Codificar o trecho selecionado', group: 'Códigos', keys: [mod('Enter')] },
  chooseCode: { label: 'Escolher uma opção no menu de códigos', group: 'Códigos', hint: '↑/↓ e Enter' },
  newCode: { label: 'Criar código', group: 'Códigos' },
  editCode: { label: 'Editar código ou renomear categoria/grupo em foco', group: 'Códigos' },
  treeNavigate: { label: 'Percorrer a árvore de códigos', group: 'Códigos', hint: 'Setas e Home/End' },
  treeSelect: { label: 'Selecionar códigos na árvore', group: 'Códigos', hint: 'Espaço ou Shift+↑/↓' },
  treeActions: { label: 'Abrir ações do item em foco na árvore', group: 'Códigos', hint: 'Shift+F10 ou tecla Menu' },
  newNote: { label: 'Criar nota do trecho ou do documento', group: 'Notas e memos', keys: [mod('n', true)] },
  toggleNotes: { label: 'Abrir ou fechar painel de notas', group: 'Notas e memos', keys: [mod('o', true)] },
  openMemo: { label: 'Abrir memo do código, categoria ou grupo em foco', group: 'Notas e memos', keys: [mod('m', true)] },
  saveNote: { label: 'Salvar nota ou memo', group: 'Notas e memos', keys: [mod('s')] },
  settings: { label: 'Abrir configurações', group: 'Projeto' },
  versions: { label: 'Ver versões do projeto', group: 'Projeto' },
  exportQdpx: { label: 'Exportar projeto (QDPX / REFI-QDA)', group: 'Projeto' },
  exportAi: { label: 'Exportar texto para IA', group: 'Projeto' },
  undo: { label: 'Desfazer', group: 'Projeto', keys: [mod('z')] },
  redo: { label: 'Refazer', group: 'Projeto', keys: [mod('z', true), mod('y')] },
  cancel: { label: 'Fechar menu, busca ou diálogo ativo', group: 'Área de trabalho', keys: [{ key: 'Escape' }] }
} satisfies Record<string, KeyboardCommand>

export type CommandId = keyof typeof keyboardCommands
export const commandIds = Object.keys(keyboardCommands) as CommandId[]

export function matchesCommand(event: KeyboardEvent, id: CommandId): boolean {
  const command: KeyboardCommand = keyboardCommands[id]
  return !event.altKey && !!command.keys?.some((binding) =>
    event.key.toLowerCase() === binding.key.toLowerCase() &&
    (event.ctrlKey || event.metaKey) === !!binding.mod &&
    event.shiftKey === !!binding.shift
  )
}

export function shortcutLabel(id: CommandId): string {
  const command: KeyboardCommand = keyboardCommands[id]
  const modifier = /Mac/i.test(navigator.platform) ? 'Cmd' : 'Ctrl'
  return command.hint ?? command.keys?.map(({ key, mod, shift }) =>
    [mod && modifier, shift && 'Shift', key === 'Escape' ? 'Esc' : key.length === 1 ? key.toUpperCase() : key]
      .filter(Boolean).join('+')
  ).join(' / ') ?? ''
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return !target.readOnly && !target.hasAttribute('data-analysis-reader')
  }
  return target instanceof HTMLSelectElement
}

export function hasKeyboardLayer(): boolean {
  return !!document.querySelector(':is([role="dialog"], [role="alertdialog"], [role="menu"]):not([data-state="closed"])')
}

export interface FocusAnchor {
  element: HTMLElement
  key?: string
  area?: string
}

export function captureFocus(element = document.activeElement): FocusAnchor | null {
  if (!(element instanceof HTMLElement) || element === document.body) return null
  return {
    element,
    key: element.dataset.focusKey,
    area: element.closest<HTMLElement>('[data-workspace-area]')?.dataset.workspaceArea
  }
}

const focusable = 'button, input, textarea, select, a[href], [tabindex]'

function tryFocus(element: HTMLElement | null | undefined): boolean {
  if (!element?.isConnected || element.matches(':disabled') || element.closest('[hidden], [inert]')) return false
  element.focus({ preventScroll: true })
  return document.activeElement === element
}

export function focusArea(area: HTMLElement, anchor?: FocusAnchor | null): boolean {
  if (anchor?.element && area.contains(anchor.element) && tryFocus(anchor.element)) return true
  if (anchor?.key) {
    const replacement = Array.from(area.querySelectorAll<HTMLElement>('[data-focus-key]'))
      .find((element) => element.dataset.focusKey === anchor.key)
    if (tryFocus(replacement)) return true
  }
  return tryFocus(area.querySelector<HTMLElement>('[data-area-default]')) ||
    Array.from(area.querySelectorAll<HTMLElement>(focusable))
      .some((element) => element.tabIndex >= 0 && tryFocus(element))
}

export function restoreFocus(anchor: FocusAnchor | null, fallback?: HTMLElement | null): void {
  if (tryFocus(anchor?.element)) return
  const area = anchor?.area
    ? document.querySelector<HTMLElement>(`[data-workspace-area="${anchor.area}"]`)
    : null
  if (area && focusArea(area, anchor)) return
  tryFocus(fallback)
}
