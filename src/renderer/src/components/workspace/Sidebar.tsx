import { useState } from 'react'
import { FileText, Tags, Layers } from 'lucide-react'
import { DocumentsPanel } from './DocumentsPanel'
import { CodesPanel } from './CodesPanel'
import { GroupsPanel } from './GroupsPanel'
import { cn } from '@/lib/utils'
import type { CodeWithCount } from '@shared/types'

type Tab = 'documents' | 'codes' | 'groups'

interface Props {
  onViewCode: (code: CodeWithCount) => void
}

export function Sidebar({ onViewCode }: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>('documents')

  const tabs: { id: Tab; label: string; icon: JSX.Element }[] = [
    { id: 'documents', label: 'Documentos', icon: <FileText className="h-4 w-4" /> },
    { id: 'codes', label: 'Codigos', icon: <Tags className="h-4 w-4" /> },
    { id: 'groups', label: 'Grupos', icon: <Layers className="h-4 w-4" /> }
  ]

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r bg-card">
      <div className="flex border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 py-2 text-xs transition-colors',
              tab === t.id
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'documents' && <DocumentsPanel />}
        {tab === 'codes' && <CodesPanel onViewCode={onViewCode} />}
        {tab === 'groups' && <GroupsPanel />}
      </div>
    </div>
  )
}
