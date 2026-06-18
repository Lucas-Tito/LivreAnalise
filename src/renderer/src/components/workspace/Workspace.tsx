import { useState } from 'react'
import { TopBar } from './TopBar'
import { Sidebar } from './Sidebar'
import { TranscriptPanel } from './TranscriptPanel'
import { CodeQuotationsDialog } from './CodeQuotationsDialog'
import type { CodeWithCount } from '@shared/types'

export function Workspace(): JSX.Element {
  const [viewCode, setViewCode] = useState<CodeWithCount | null>(null)

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar onViewCode={setViewCode} />
        <TranscriptPanel />
      </div>
      <CodeQuotationsDialog
        code={viewCode}
        onOpenChange={(o) => !o && setViewCode(null)}
      />
    </div>
  )
}
