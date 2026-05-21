import { BrainCircuit } from 'lucide-react'
import { useAIStore } from '@/stores/ai-store'
import { useReaderStore } from '@/stores/reader-store'
import { cn } from '@/lib/utils'

interface ExplainPopoverProps {
  text: string
  className?: string
}

export function ExplainPopover({ text, className }: ExplainPopoverProps) {
  const { explain, selectedModel, isStreaming, isConfigured } = useAIStore()
  const { toggleAIPanel, aiPanelOpen, currentBook } = useReaderStore()
  const { startConversation } = useAIStore()

  const handleExplain = async () => {
    if (!selectedModel || !currentBook) return
    if (!aiPanelOpen) toggleAIPanel()
    await startConversation(currentBook.id)
    await explain(text)
  }

  if (!isConfigured) return null

  return (
    <button
      onClick={handleExplain}
      disabled={isStreaming}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
        'bg-accent/10 text-accent-foreground hover:bg-accent/20',
        isStreaming && 'opacity-50 cursor-not-allowed',
        className
      )}
      title="Explain with AI"
    >
      <BrainCircuit className="w-3 h-3" />
      Explain
    </button>
  )
}
