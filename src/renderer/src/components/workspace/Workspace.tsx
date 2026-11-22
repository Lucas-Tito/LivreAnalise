import { type JSX, useEffect, useRef, useState } from 'react'
import { TopBar } from './TopBar'
import { Sidebar } from './Sidebar'
import { TranscriptPanel } from './TranscriptPanel'
import { NotesPanel } from './NotesPanel'
import { CodeQuotationsDialog } from './CodeQuotationsDialog'
import { UnsavedTextDialog } from './UnsavedTextDialog'
import { useAppStore } from '@/stores/appStore'
import type { CodeWithCount } from '@shared/types'
import { mensagemDeErro } from '@/lib/erros'
import { QuickDocumentDialog } from './QuickDocumentDialog'
import { KeyboardDialog } from './KeyboardDialog'
import {
  captureFocus, commandIds, focusArea, hasKeyboardLayer, isTypingTarget, matchesCommand, restoreFocus,
  type CommandId, type FocusAnchor
} from '@/lib/keyboard'
import { WorkspaceActionsContext, type WorkspaceAction, type WorkspaceActions } from '@/lib/workspaceActions'

export function Workspace(): JSX.Element {
  const [viewCode, setViewCode] = useState<CodeWithCount | null>(null)
  const [surface, setSurface] = useState<'quick' | 'palette' | 'help' | null>(null)
  const [actions] = useState<WorkspaceActions>(() => new Map())
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(new Set<CommandId>())
  const workspaceRef = useRef<HTMLDivElement>(null)
  const lastFocus = useRef(new Map<string, FocusAnchor>())
  const lastOutsideNotes = useRef<FocusAnchor | null>(null)
  const noteOrigin = useRef<{ id: number; documentGuid: string | undefined; anchor: FocusAnchor | null } | null>(null)
  const surfaceOrigin = useRef<FocusAnchor | null>(null)
  const codeOrigin = useRef<FocusAnchor | null>(null)
  const notesPanelOpen = useAppStore((s) => s.notesPanelOpen)
  const currentDocument = useAppStore((s) => s.currentDocument)
  const documents = useAppStore((s) => s.documents)
  const busy = useAppStore((s) => s.busy)
  const history = useAppStore((s) => s.history)

  const moveTo = (name: string, remember = true): boolean => {
    const area = workspaceRef.current?.querySelector<HTMLElement>(`[data-workspace-area="${name}"]`)
    if (!area || !focusArea(area, remember ? lastFocus.current.get(name) : null)) return false
    if (name === 'document' && document.activeElement?.hasAttribute('data-focus-document')) {
      (document.activeElement as HTMLButtonElement).click()
    }
    return true
  }

  const cycle = (direction: 1 | -1): void => {
    const areas = Array.from(workspaceRef.current?.querySelectorAll<HTMLElement>('[data-workspace-area]') ?? [])
    const current = areas.findIndex((area) => area.contains(document.activeElement))
    const origin = current < 0 ? (direction === 1 ? -1 : 0) : current
    for (let step = 1; step <= areas.length; step++) {
      const area = areas[(origin + direction * step + areas.length * 2) % areas.length]
      if (moveTo(area.dataset.workspaceArea ?? '')) break
    }
  }

  const launchSurface = (next: 'quick' | 'palette' | 'help'): void => {
    surfaceOrigin.current = captureFocus()
    setSurface(next)
  }

  const rememberNoteOrigin = (id: number, anchor: FocusAnchor | null): void => {
    noteOrigin.current = { id, documentGuid: currentDocument?.guid, anchor }
  }

  const returnFromNotes = (noteId: number | null): void => {
    const saved = noteOrigin.current
    const origin = (saved && saved.id === noteId && saved.documentGuid === useAppStore.getState().currentDocument?.guid
      ? saved.anchor : null) ?? lastOutsideNotes.current ?? lastFocus.current.get('document') ?? null
    restoreFocus(origin, workspaceRef.current?.querySelector('[data-area-default]'))
  }

  const toggleNotes = async (origin: HTMLElement | null): Promise<void> => {
    const store = useAppStore.getState()
    const wasOpen = store.notesPanelOpen
    await store.toggleNotesPanel()
    requestAnimationFrame(() => {
      if (!wasOpen) moveTo('notes')
      else if (!origin?.isConnected || origin.closest('[data-workspace-area="notes"]')) returnFromNotes(store.editorNoteId)
    })
  }

  const noDocument = (): string | undefined => currentDocument ? undefined : 'Abra um documento primeiro.'
  const ownActions: Partial<Record<CommandId, WorkspaceAction>> = {
    palette: { run: () => launchSurface('palette'), allowWhileTyping: true },
    help: { run: () => launchSurface('help'), allowWhileTyping: true },
    nextArea: { run: () => cycle(1), allowWhileTyping: true },
    previousArea: { run: () => cycle(-1), allowWhileTyping: true },
    quickDocument: { run: () => launchSurface('quick'), allowWhileTyping: true, unavailable: () => documents.length ? undefined : 'Nenhum documento importado.' },
    focusToolbar: { run: () => { moveTo('toolbar') } },
    focusSidebar: { run: () => { moveTo('sidebar') } },
    focusDocument: { run: () => { moveTo('document', false) }, unavailable: noDocument },
    focusNotes: { run: () => { moveTo('notes') }, unavailable: () => notesPanelOpen ? undefined : 'Abra o painel de notas primeiro.' },
    toggleNotes: { run: toggleNotes, allowWhileTyping: true },
    importDocuments: {
      run: () => useAppStore.getState().importDocuments(),
      unavailable: () => busy ? 'Uma importação já está em andamento.' : undefined
    },
    undo: {
      run: async () => { await useAppStore.getState().undo() },
      unavailable: () => history.canUndo ? undefined : 'Nada para desfazer.'
    },
    redo: {
      run: async () => { await useAppStore.getState().redo() },
      unavailable: () => history.canRedo ? undefined : 'Nada para refazer.'
    }
  }
  const codeFocusRequired: WorkspaceAction = {
    run: () => {},
    unavailable: () => 'Foque um código, categoria ou grupo na árvore.'
  }
  const live = useRef(ownActions)
  live.current = ownActions
  const actionFor = (id: CommandId): WorkspaceAction | undefined => live.current[id] ?? actions.get(id) ??
    (id === 'openMemo' || id === 'editCode' ? codeFocusRequired : undefined)
  const execute = (id: CommandId, action: WorkspaceAction, origin: HTMLElement | null): void => {
    if (inFlight.current.has(id)) return
    const reportError = (reason: unknown): void => setError(mensagemDeErro(reason, 'Não foi possível executar o comando.'))
    setError(null)
    try {
      const result = action.run(origin)
      if (result) {
        inFlight.current.add(id)
        void result.catch(reportError).finally(() => inFlight.current.delete(id))
      }
    } catch (reason) { reportError(reason) }
  }

  useEffect(() => {
    const rememberFocus = (event: FocusEvent): void => {
      if (!(event.target instanceof HTMLElement) || event.target.closest('[role="dialog"], [role="menu"]')) return
      const origin = captureFocus(event.target)
      if (!origin?.area) return
      lastFocus.current.set(origin.area, origin)
      if (origin.area !== 'notes') lastOutsideNotes.current = origin
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing || hasKeyboardLayer()) return
      const id = commandIds.find((key) => key !== 'undo' && key !== 'redo' &&
        matchesCommand(event, key) && actionFor(key))
      const action = id && actionFor(id)
      if (!id || !action || (!action.allowWhileTyping && isTypingTarget(event.target))) return
      const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null
      if (id !== 'quickDocument' && action.unavailable?.(origin)) return
      event.preventDefault()
      if (!event.repeat) execute(id, action, origin)
    }
    document.addEventListener('focusin', rememberFocus)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('focusin', rememberFocus)
      window.removeEventListener('keydown', onKey)
    }
  }, [actions])

  const closeSurface = (id: CommandId | null): void => {
    const origin = surfaceOrigin.current
    surfaceOrigin.current = null
    restoreFocus(origin, workspaceRef.current?.querySelector('[data-area-default]'))
    if (!id) return
    const action = actionFor(id)
    if (action && !action.unavailable?.(origin?.element ?? null)) {
      execute(id, action, origin?.element ?? null)
    }
  }
  const showCode = (code: CodeWithCount | null, origin?: HTMLElement | null): void => {
    if (code) codeOrigin.current = captureFocus(origin ?? document.activeElement)
    setViewCode(code)
  }

  const origin = surfaceOrigin.current?.element ?? null
  const entries = commandIds.filter((id) => id !== 'palette' && actionFor(id))
    .map((id) => ({ id, unavailable: actionFor(id)?.unavailable?.(origin) }))

  return (
    <WorkspaceActionsContext.Provider value={actions}>
    <div ref={workspaceRef} className="flex h-full flex-col">
      <div data-workspace-area="toolbar"><TopBar onKeyboardHelp={() => launchSurface('help')} onToggleNotes={toggleNotes} /></div>
      {error && <p role="alert" className="px-3 py-1 text-sm text-destructive">{error}</p>}
      <div className="flex min-h-0 flex-1">
        <div data-workspace-area="sidebar" className="contents"><Sidebar onViewCode={showCode} /></div>
        <div data-workspace-area="document" className="flex min-w-0 flex-1"><TranscriptPanel onNoteOpened={rememberNoteOrigin} /></div>
        {notesPanelOpen && <div data-workspace-area="notes" className="contents"><NotesPanel onReturnFocus={returnFromNotes} /></div>}
      </div>
      <CodeQuotationsDialog
        code={viewCode}
        returnFocus={codeOrigin.current}
        onOpenChange={(o) => !o && setViewCode(null)}
      />
      <UnsavedTextDialog />
      <QuickDocumentDialog open={surface === 'quick'} onOpenChange={(open) => { if (!open) setSurface(null) }}
        onCanceled={() => { surfaceOrigin.current = null }}
        onAfterOpen={() => {
          surfaceOrigin.current = null
          moveTo('document', false)
        }} />
      <KeyboardDialog mode="palette" open={surface === 'palette'} entries={entries}
        onClose={() => setSurface(null)} onClosed={closeSurface} />
      <KeyboardDialog mode="help" open={surface === 'help'} entries={[]}
        onClose={() => setSurface(null)} onClosed={closeSurface} />
    </div>
    </WorkspaceActionsContext.Provider>
  )
}
