import { useReaderStore } from '@/stores/reader-store'
import { TableOfContents } from '@/components/reader/TableOfContents'
import { AnnotationSidebar } from '@/components/annotations/AnnotationSidebar'
import { ResizeHandle } from '@/components/layout/ResizeHandle'
import {
  useUIStore,
  SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH
} from '@/stores/ui-store'
import { cn } from '@/lib/utils'
import { List, MessageSquare } from 'lucide-react'

export function Sidebar() {
  const { sidebarOpen, sidebarTab, setSidebarTab } = useReaderStore()
  const sidebarWidth = useUIStore((s) => s.sidebarWidth)
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth)
  const resetSidebarWidth = useUIStore((s) => s.resetSidebarWidth)

  if (!sidebarOpen) return null

  return (
    <div className="flex shrink-0 animate-slide-in-left">
      <div
        className="border-r border-border bg-sidebar flex flex-col shrink-0 min-w-0"
        style={{ width: `${sidebarWidth}px` }}
      >
        {/* Tab headers */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setSidebarTab('toc')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium transition-colors',
              sidebarTab === 'toc'
                ? 'text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <List className="w-3.5 h-3.5" />
            Contents
          </button>
          <button
            onClick={() => setSidebarTab('annotations')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium transition-colors',
              sidebarTab === 'annotations'
                ? 'text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Notes
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto">
          {sidebarTab === 'toc' ? <TableOfContents /> : <AnnotationSidebar />}
        </div>
      </div>
      <ResizeHandle
        width={sidebarWidth}
        onResize={setSidebarWidth}
        onReset={resetSidebarWidth}
        side="left"
        min={SIDEBAR_MIN_WIDTH}
        max={SIDEBAR_MAX_WIDTH}
      />
    </div>
  )
}
