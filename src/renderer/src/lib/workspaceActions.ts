import { createContext, useContext, useLayoutEffect } from 'react'
import type { CommandId } from './keyboard'

export interface WorkspaceAction {
  run: (origin: HTMLElement | null) => void | Promise<void>
  unavailable?: (origin: HTMLElement | null) => string | undefined
  allowWhileTyping?: boolean
}

export type WorkspaceActions = Map<CommandId, WorkspaceAction>
export const WorkspaceActionsContext = createContext<WorkspaceActions | null>(null)

export function useWorkspaceActions(actions: Partial<Record<CommandId, WorkspaceAction>>): void {
  const registry = useContext(WorkspaceActionsContext)
  useLayoutEffect(() => {
    if (!registry) return
    const entries = Object.entries(actions) as [CommandId, WorkspaceAction][]
    for (const [id, action] of entries) registry.set(id, action)
    return () => {
      for (const [id, action] of entries) {
        if (registry.get(id) === action) registry.delete(id)
      }
    }
  }, [registry, actions])
}
