import { type JSX, useEffect, useState } from 'react'
import { TopBar } from './TopBar'
import { Sidebar } from './Sidebar'
import { TranscriptPanel } from './TranscriptPanel'
import { NotesPanel } from './NotesPanel'
import { CodeQuotationsDialog } from './CodeQuotationsDialog'
import { UnsavedTextDialog } from './UnsavedTextDialog'
import { useAppStore } from '@/stores/appStore'
import type { CodeWithCount } from '@shared/types'

export function Workspace(): JSX.Element {
  const [viewCode, setViewCode] = useState<CodeWithCount | null>(null)
  const notesPanelOpen = useAppStore((s) => s.notesPanelOpen)
  const podeSairDoTexto = useAppStore((s) => s.podeSairDoTexto)

  // O main só pede isto quando há texto não salvo (#31).
  useEffect(
    () =>
      window.api.app.onCloseRequested(async () => {
        if (await podeSairDoTexto()) window.api.app.confirmClose()
      }),
    [podeSairDoTexto]
  )

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar onViewCode={setViewCode} />
        <TranscriptPanel />
        {notesPanelOpen && <NotesPanel />}
      </div>
      <CodeQuotationsDialog
        code={viewCode}
        onOpenChange={(o) => !o && setViewCode(null)}
      />
      <UnsavedTextDialog />
    </div>
  )
}
