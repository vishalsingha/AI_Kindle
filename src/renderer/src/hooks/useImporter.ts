import { useCallback, useRef, useState } from 'react'
import { useLibraryStore } from '@/stores/library-store'
import type { ImportConflict, ImportDecision } from '@/components/library/ImportDialog'

interface QueueItem {
  filePath: string
}

interface ActiveConflict {
  conflict: ImportConflict
  filePath: string
  resolve: (d: ImportDecision) => void
}

export function useImporter(): {
  importPaths: (paths: string[]) => Promise<void>
  importFiles: () => Promise<void>
  importFolder: () => Promise<void>
  activeConflict: ActiveConflict | null
  progress: { current: number; total: number }
  resolveConflict: (decision: ImportDecision) => void
  busy: boolean
} {
  const { loadBooks } = useLibraryStore()
  const [activeConflict, setActiveConflict] = useState<ActiveConflict | null>(null)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [busy, setBusy] = useState(false)
  const pendingResolveRef = useRef<((d: ImportDecision) => void) | null>(null)

  const askUser = useCallback((conflict: ImportConflict, filePath: string): Promise<ImportDecision> => {
    return new Promise<ImportDecision>((resolve) => {
      pendingResolveRef.current = resolve
      setActiveConflict({ conflict, filePath, resolve })
    })
  }, [])

  const resolveConflict = useCallback((decision: ImportDecision) => {
    const r = pendingResolveRef.current
    pendingResolveRef.current = null
    setActiveConflict(null)
    if (r) r(decision)
  }, [])

  const importPaths = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return
    setBusy(true)
    setProgress({ current: 0, total: paths.length })
    try {
      for (let i = 0; i < paths.length; i++) {
        setProgress({ current: i + 1, total: paths.length })
        const filePath = paths[i]
        const info = await window.api.inspectPDF(filePath)

        let decision: ImportDecision | null = null
        if (info.duplicateByHash) {
          decision = await askUser({
            kind: 'duplicate-hash',
            filename: info.filename,
            existingTitle: info.duplicateByHash.title,
            suggestedTitle: info.suggestedTitle
          }, filePath)
        } else if (info.duplicateByTitle) {
          decision = await askUser({
            kind: 'duplicate-name',
            filename: info.filename,
            takenTitle: info.duplicateByTitle.title,
            suggestedTitle: info.suggestedTitle
          }, filePath)
        } else {
          decision = { action: 'import' }
        }

        if (decision.action === 'skip') continue
        await window.api.importOne(filePath, decision.title ? { title: decision.title } : undefined)
      }
      await loadBooks()
    } finally {
      setBusy(false)
      setProgress({ current: 0, total: 0 })
    }
  }, [askUser, loadBooks])

  const importFiles = useCallback(async () => {
    const paths = await window.api.pickPDFs()
    await importPaths(paths)
  }, [importPaths])

  const importFolder = useCallback(async () => {
    const paths = await window.api.pickFolderPDFs()
    await importPaths(paths)
  }, [importPaths])

  return { importPaths, importFiles, importFolder, activeConflict, progress, resolveConflict, busy }
}
