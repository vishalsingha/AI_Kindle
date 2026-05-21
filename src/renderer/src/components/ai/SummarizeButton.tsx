import { Sparkles } from 'lucide-react'
import { useAIStore } from '@/stores/ai-store'
import { useReaderStore } from '@/stores/reader-store'
import { cn } from '@/lib/utils'

interface SummarizeButtonProps {
  text: string
  className?: string
}

export function SummarizeButton({ text, className }: SummarizeButtonProps) {
  const { summarize, selectedModel, isStreaming, isConfigured } = useAIStore()
  const { toggleAIPanel, aiPanelOpen, currentBook } = useReaderStore()
  const { startConversation } = useAIStore()

  const handleSummarize = async () => {
    if (!selectedModel || !currentBook) return
    if (!aiPanelOpen) toggleAIPanel()
    await startConversation(currentBook.id)
    await summarize(text)
  }

  if (!isConfigured) return null

  return (
    <button
      onClick={handleSummarize}
      disabled={isStreaming}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
        'bg-primary/10 text-primary hover:bg-primary/20',
        isStreaming && 'opacity-50 cursor-not-allowed',
        className
      )}
      title="Summarize with AI"
    >
      <Sparkles className="w-3 h-3" />
      Summarize
    </button>
  )
}
