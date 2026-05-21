import { useState, useEffect } from 'react'
import { pdfjs } from 'react-pdf'
import { ChevronRight, FileText } from 'lucide-react'
import { useReaderStore } from '@/stores/reader-store'
import { cn } from '@/lib/utils'
import { configurePdfWorker } from '@/lib/pdf-setup'

configurePdfWorker()

interface OutlineItem {
  title: string
  dest: any
  items: OutlineItem[]
  pageNumber?: number
}

export function TableOfContents() {
  const { pdfUrl, currentPage, setPage } = useReaderStore()
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!pdfUrl) return

    const loadOutline = async () => {
      setLoading(true)
      try {
        const loadingTask = pdfjs.getDocument(pdfUrl)
        const pdf = await loadingTask.promise
        const rawOutline = await pdf.getOutline()

        if (rawOutline && rawOutline.length > 0) {
          const resolved = await resolveOutline(rawOutline, pdf)
          setOutline(resolved)
        } else {
          // No outline - generate page list
          const pages: OutlineItem[] = []
          for (let i = 1; i <= pdf.numPages; i++) {
            pages.push({ title: `Page ${i}`, dest: null, items: [], pageNumber: i })
          }
          setOutline(pages)
        }
      } catch {
        setOutline([])
      }
      setLoading(false)
    }

    loadOutline()
  }, [pdfUrl])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  if (outline.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
        <FileText className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm">No table of contents</p>
      </div>
    )
  }

  return (
    <div className="py-2">
      {outline.map((item, index) => (
        <TOCItem key={index} item={item} depth={0} currentPage={currentPage} onPageClick={setPage} />
      ))}
    </div>
  )
}

interface TOCItemProps {
  item: OutlineItem
  depth: number
  currentPage: number
  onPageClick: (page: number) => void
}

function TOCItem({ item, depth, currentPage, onPageClick }: TOCItemProps) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = item.items && item.items.length > 0
  const isActive = item.pageNumber === currentPage

  const handleClick = () => {
    if (item.pageNumber) {
      onPageClick(item.pageNumber)
    }
    if (hasChildren) {
      setExpanded(!expanded)
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
          isActive
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-foreground/80 hover:bg-secondary',
        )}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        {hasChildren && (
          <ChevronRight className={cn(
            'w-3 h-3 shrink-0 transition-transform',
            expanded && 'rotate-90'
          )} />
        )}
        <span className="truncate">{item.title}</span>
        {item.pageNumber && (
          <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{item.pageNumber}</span>
        )}
      </button>
      {hasChildren && expanded && (
        <div>
          {item.items.map((child, i) => (
            <TOCItem key={i} item={child} depth={depth + 1} currentPage={currentPage} onPageClick={onPageClick} />
          ))}
        </div>
      )}
    </div>
  )
}

async function resolveOutline(items: any[], pdf: any): Promise<OutlineItem[]> {
  const resolved: OutlineItem[] = []

  for (const item of items) {
    let pageNumber: number | undefined

    try {
      if (item.dest) {
        let dest = item.dest
        if (typeof dest === 'string') {
          dest = await pdf.getDestination(dest)
        }
        if (dest && dest[0]) {
          const pageIndex = await pdf.getPageIndex(dest[0])
          pageNumber = pageIndex + 1
        }
      }
    } catch {
      // Could not resolve destination
    }

    const children = item.items ? await resolveOutline(item.items, pdf) : []

    resolved.push({
      title: item.title,
      dest: item.dest,
      items: children,
      pageNumber
    })
  }

  return resolved
}
