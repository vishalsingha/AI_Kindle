import { useState, useEffect, useRef } from 'react'
import {
  Send, Plus, Trash2, BrainCircuit, AlertCircle, X,
  MessageSquare, Settings, Pencil, Check, Globe, Loader2, Quote
} from 'lucide-react'
import { useAIStore } from '@/stores/ai-store'
import { useReaderStore } from '@/stores/reader-store'
import {
  useUIStore,
  AI_PANEL_MIN_WIDTH, AI_PANEL_MAX_WIDTH
} from '@/stores/ui-store'
import { ResizeHandle } from '@/components/layout/ResizeHandle'
import { ChatMessage } from './ChatMessage'
import { ApiKeySettings } from './ApiKeySettings'
import { cn } from '@/lib/utils'

export function AIPanel() {
  const {
    isConfigured, config, models, selectedModel, conversations, currentConversation,
    messages, isStreaming, streamingContent, streamError,
    webSearchEnabled, isSearchingWeb, setWebSearchEnabled,
    pendingContexts, removePendingContext, clearPendingContexts,
    refreshConfig, setModel, loadConversations,
    selectConversation, startConversation, sendMessage, deleteConversation,
    renameConversation,
    appendStreamChunk, endStream, setStreamError
  } = useAIStore()
  const { currentBook } = useReaderStore()
  const aiPanelWidth = useUIStore((s) => s.aiPanelWidth)
  const setAIPanelWidth = useUIStore((s) => s.setAIPanelWidth)
  const resetAIPanelWidth = useUIStore((s) => s.resetAIPanelWidth)
  const [input, setInput] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [showKeyEditor, setShowKeyEditor] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // Containers for the chat-history popover + its toggle button. Used to
  // detect outside clicks so the popover closes when the user clicks
  // anywhere else in the panel (messages, composer, header, etc.).
  const historyRef = useRef<HTMLDivElement>(null)
  const historyToggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    refreshConfig()
  }, [refreshConfig])

  useEffect(() => {
    if (currentBook) {
      loadConversations(currentBook.id)
    }
  }, [currentBook, loadConversations])

  // Drop any context chips the user staged from a previous book the
  // moment the active book changes. Without this, excerpts from book A
  // would silently come along when the user switches to book B and
  // would be folded into the next prompt's context block.
  const prevBookIdRef = useRef<string | null>(null)
  useEffect(() => {
    const nextId = currentBook?.id ?? null
    if (prevBookIdRef.current !== nextId) {
      // First mount has prev=null; only clear when the *previous* value
      // was a real book (so initial app launch doesn't fight the chip
      // stack the user might have just staged).
      if (prevBookIdRef.current !== null) {
        clearPendingContexts()
      }
      prevBookIdRef.current = nextId
    }
  }, [currentBook?.id, clearPendingContexts])

  useEffect(() => {
    const cleanupChunk = window.api.onAIStream((chunk) => {
      appendStreamChunk(chunk)
    })
    const cleanupEnd = window.api.onAIStreamEnd(() => {
      endStream()
    })
    const cleanupError = window.api.onAIStreamError((message) => {
      setStreamError(message)
    })
    return () => {
      cleanupChunk()
      cleanupEnd()
      cleanupError()
    }
  }, [appendStreamChunk, endStream, setStreamError])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // Close the history popover when the user clicks anywhere outside of it
  // (or presses Escape). Without this the popover stays open until the
  // toggle button is pressed again, which feels broken — especially since
  // it covers the top of the messages list.
  useEffect(() => {
    if (!showHistory) return

    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as Node | null
      if (!target) return
      if (historyRef.current?.contains(target)) return
      if (historyToggleRef.current?.contains(target)) return
      setShowHistory(false)
      // Also drop any in-progress rename so it doesn't keep editing a
      // hidden input.
      setRenamingId(null)
      setRenameDraft('')
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setShowHistory(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [showHistory])

  // Auto-grow the input textarea so long prompts are fully visible while
  // composing, instead of scrolling inside a 1-row box. We reset to 'auto'
  // first so the height also SHRINKS when the user deletes lines.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    // Cap the growth at ~8 lines so the composer never eats the whole panel.
    const max = 200
    const next = Math.min(el.scrollHeight, max)
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
  }, [input])

  const handleSend = async (): Promise<void> => {
    if (!input.trim() || isStreaming || !currentBook) return
    const text = input.trim()
    setInput('')
    if (!currentConversation) {
      await startConversation(currentBook.id)
    }
    await sendMessage(text, '')
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const beginRename = (id: string, currentTitle: string): void => {
    setRenamingId(id)
    setRenameDraft(currentTitle)
  }

  const cancelRename = (): void => {
    setRenamingId(null)
    setRenameDraft('')
  }

  const commitRename = async (id: string): Promise<void> => {
    const next = renameDraft.trim()
    if (next) {
      await renameConversation(id, next)
    }
    cancelRename()
  }

  return (
    <div className="flex shrink-0 animate-slide-in-right">
      <ResizeHandle
        width={aiPanelWidth}
        onResize={setAIPanelWidth}
        onReset={resetAIPanelWidth}
        side="right"
        min={AI_PANEL_MIN_WIDTH}
        max={AI_PANEL_MAX_WIDTH}
      />
    <div
      className="border-l border-border bg-sidebar flex flex-col shrink-0 min-w-0"
      style={{ width: `${aiPanelWidth}px` }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">AI Assistant</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className={cn(
                'w-2 h-2 rounded-full',
                isConfigured ? 'bg-green-500' : 'bg-red-400'
              )} />
              <span className="text-[10px] text-muted-foreground">
                {isConfigured
                  ? `${config.provider === 'azure' ? 'Azure' : 'OpenAI'} · ${config.maskedKey || 'Connected'}`
                  : 'Not configured'}
              </span>
            </div>
            {isConfigured && (
              <button
                onClick={() => setShowKeyEditor((s) => !s)}
                className={cn(
                  'focus-ring p-1 rounded-md transition-colors',
                  showKeyEditor
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}
                title="OpenAI settings"
                aria-label="Toggle AI provider settings"
                aria-pressed={showKeyEditor}
              >
                <Settings className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {isConfigured && !showKeyEditor && (
          <>
            {/* Model selector */}
            {models.length > 0 && (
              <select
                value={selectedModel}
                onChange={(e) => setModel(e.target.value)}
                className="w-full mt-2 px-2.5 py-1.5 bg-secondary/60 border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
              >
                {models.map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            )}

            {/* New chat / History */}
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => currentBook && startConversation(currentBook.id)}
                className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
              >
                <Plus className="w-3 h-3" />
                New Chat
              </button>
              <button
                ref={historyToggleRef}
                onClick={() => setShowHistory(!showHistory)}
                className={cn(
                  'focus-ring p-1.5 rounded-lg transition-colors',
                  showHistory
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}
                title="Chat history"
                aria-label="Toggle chat history"
                aria-pressed={showHistory}
                aria-expanded={showHistory}
              >
                <MessageSquare className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Onboarding: no key saved */}
      {!isConfigured && (
        <div className="flex-1 overflow-auto">
          <ApiKeySettings mode="onboarding" />
        </div>
      )}

      {/* Editing an existing key */}
      {isConfigured && showKeyEditor && (
        <div className="flex-1 overflow-auto">
          <ApiKeySettings mode="editing" onDone={() => setShowKeyEditor(false)} />
        </div>
      )}

      {/* Normal chat surface */}
      {isConfigured && !showKeyEditor && (
        <>
          {/* Chat history dropdown */}
          {showHistory && conversations.length > 0 && (
            <div ref={historyRef} className="border-b border-border max-h-40 overflow-auto">
              {conversations.map(conv => {
                const isRenaming = renamingId === conv.id
                const handlePick = (): void => {
                  // Don't auto-switch chats while editing the same row's
                  // title — that would silently commit and navigate at once.
                  if (isRenaming) return
                  selectConversation(conv)
                  setShowHistory(false)
                }
                return (
                  <div
                    key={conv.id}
                    className={cn(
                      'group flex items-center gap-1 px-3 py-2 hover:bg-secondary/60 transition-colors',
                      currentConversation?.id === conv.id && 'bg-primary/5'
                    )}
                  >
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            commitRename(conv.id)
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            cancelRename()
                          }
                        }}
                        onBlur={() => commitRename(conv.id)}
                        className="flex-1 bg-secondary/80 border border-primary/40 rounded px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-primary/30"
                        maxLength={120}
                      />
                    ) : (
                      <button
                        onClick={handlePick}
                        title="Open chat"
                        className="flex-1 text-left text-xs truncate cursor-pointer"
                      >
                        {conv.title}
                      </button>
                    )}
                    {isRenaming ? (
                      <button
                        // onMouseDown so we commit before onBlur fires (which
                        // would otherwise commit + then try to commit again).
                        onMouseDown={(e) => { e.preventDefault(); commitRename(conv.id) }}
                        className="focus-ring p-1 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        title="Save name"
                        aria-label={`Save name for chat: ${conv.title}`}
                      >
                        <Check className="w-3 h-3" aria-hidden="true" />
                      </button>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); beginRename(conv.id, conv.title) }}
                        className="focus-ring p-1 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="Rename chat"
                        aria-label={`Rename chat: ${conv.title}`}
                      >
                        <Pencil className="w-3 h-3" aria-hidden="true" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id) }}
                      className="focus-ring p-1 rounded text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      title="Delete chat"
                      aria-label={`Delete chat: ${conv.title}`}
                    >
                      <Trash2 className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {streamError && (
            <div
              role="alert"
              className="mx-3 mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive animate-fade-in"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <p className="flex-1 text-[11px] leading-snug break-words">{streamError}</p>
              <button
                onClick={() => setStreamError(null)}
                className="focus-ring shrink-0 p-0.5 rounded hover:bg-destructive/10 transition-colors"
                title="Dismiss"
                aria-label="Dismiss error"
              >
                <X className="w-3 h-3" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-auto p-3">
            {messages.length === 0 && !isStreaming ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <BrainCircuit className="w-10 h-10 text-primary/30 mb-3" />
                <p className="text-sm font-medium">Ask me anything</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Select text and use AI tools, or ask questions about the document
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {messages.map(msg => (
                  <ChatMessage key={msg.id} message={msg} />
                ))}
                {isStreaming && streamingContent && (
                  <ChatMessage
                    message={{
                      id: 'streaming',
                      role: 'assistant',
                      content: streamingContent,
                      createdAt: new Date().toISOString()
                    }}
                    isStreaming
                  />
                )}
                {isStreaming && !streamingContent && (
                  <div className="flex items-center gap-1 px-3 py-2">
                    <div className="streaming-dot w-1.5 h-1.5 rounded-full bg-primary" />
                    <div className="streaming-dot w-1.5 h-1.5 rounded-full bg-primary" />
                    <div className="streaming-dot w-1.5 h-1.5 rounded-full bg-primary" />
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border">
            {/* Staged context chips. Each one is a passage the user sent
                from the PDF via the selection toolbar; they're folded into
                the model's PDF-context block on the next send. */}
            {pendingContexts.length > 0 && (
              <div className="mb-2 flex flex-col gap-1.5 animate-fade-in">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Context · {pendingContexts.length}
                  </span>
                  <button
                    onClick={clearPendingContexts}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    title="Remove all staged context"
                  >
                    Clear all
                  </button>
                </div>
                {pendingContexts.map((ctx) => (
                  <div
                    key={ctx.id}
                    className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-primary/5 border border-primary/15 text-[11px]"
                  >
                    <Quote className="w-3 h-3 mt-0.5 shrink-0 text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-muted-foreground truncate">
                        {ctx.sourceTitle}
                        {ctx.page > 0 ? ` · page ${ctx.page}` : ''}
                      </p>
                      <p
                        className="text-foreground/90 leading-snug line-clamp-2"
                        title={ctx.text}
                      >
                        {ctx.text.trim()}
                      </p>
                    </div>
                    <button
                      onClick={() => removePendingContext(ctx.id)}
                      className="focus-ring shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      title="Remove this context"
                      aria-label={`Remove context excerpt from ${ctx.sourceTitle}${ctx.page > 0 ? `, page ${ctx.page}` : ''}`}
                    >
                      <X className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {isSearchingWeb && (
              <div className="mb-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/15 text-primary text-[11px] animate-fade-in">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Searching the web…</span>
              </div>
            )}
            <div className="flex items-end gap-2 bg-secondary/60 border border-border rounded-xl px-3 py-2 focus-within:ring-1 focus-within:ring-primary/30 focus-within:border-primary/50 transition-colors">
              <button
                type="button"
                onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                title={webSearchEnabled
                  ? 'Web search is on — click to disable'
                  : 'Use web search for the next message'}
                aria-pressed={webSearchEnabled}
                aria-label={webSearchEnabled
                  ? 'Disable web search for the next message'
                  : 'Enable web search for the next message'}
                className={cn(
                  'focus-ring p-1.5 rounded-lg transition-colors shrink-0 self-end',
                  webSearchEnabled
                    ? 'bg-primary/15 text-primary hover:bg-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}
              >
                <Globe className="w-4 h-4" aria-hidden="true" />
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={webSearchEnabled
                  ? 'Search the web and ask…'
                  : 'Ask about the document...'}
                rows={1}
                className="flex-1 bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground leading-relaxed"
                style={{ minHeight: '24px', maxHeight: '200px' }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isStreaming || isSearchingWeb}
                aria-label="Send message"
                title="Send message"
                className={cn(
                  'focus-ring p-1.5 rounded-lg transition-colors shrink-0',
                  input.trim() && !isStreaming && !isSearchingWeb
                    ? 'text-primary hover:bg-primary/10'
                    : 'text-muted-foreground/40'
                )}
              >
                <Send className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            {webSearchEnabled && !isSearchingWeb && (
              <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">
                Web search is on. Replies will cite live sources from DuckDuckGo.
              </p>
            )}
          </div>
        </>
      )}
    </div>
    </div>
  )
}
