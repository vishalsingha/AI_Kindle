import { Plus, FolderPlus } from 'lucide-react'
import { useState } from 'react'

interface Props {
  onImportFiles: () => void
  onImportFolder: () => void
  busy?: boolean
}

export function ImportButton({ onImportFiles, onImportFolder, busy }: Props) {
  const [showMenu, setShowMenu] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={busy}
        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity shadow-sm disabled:opacity-60"
      >
        <Plus className="w-4 h-4" />
        {busy ? 'Importing…' : 'Import'}
      </button>

      {showMenu && !busy && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute top-full right-0 mt-2 w-48 bg-popover border border-border rounded-lg shadow-xl py-1 z-50 animate-pop-in">
            <button
              onClick={() => { onImportFiles(); setShowMenu(false) }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-secondary transition-colors"
            >
              <Plus className="w-4 h-4 text-muted-foreground" />
              Import Files
            </button>
            <button
              onClick={() => { onImportFolder(); setShowMenu(false) }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-secondary transition-colors"
            >
              <FolderPlus className="w-4 h-4 text-muted-foreground" />
              Import Folder
            </button>
          </div>
        </>
      )}
    </div>
  )
}
