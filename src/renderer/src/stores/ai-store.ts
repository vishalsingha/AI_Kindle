import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Annotation } from './annotation-store'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface Conversation {
  id: string
  bookId: string
  title: string
  createdAt: string
}

// The single "Generate" action used when the user clicks Generate on
// selected highlights. Produces study-note-style Markdown with grouped
// bullets and LaTeX math — the most useful output for a mixed set of
// excerpts and the format best handled by the chat renderer.
const GENERATE_PROMPT =
  'Below are excerpts I highlighted while reading. Turn them into organized study notes in pure Markdown.\n\n' +
  'Format:\n' +
  '- Group related ideas under `## Heading` sections that reflect the source structure.\n' +
  '- Under each heading, list the key points as `- ` bullets, with supporting details as two-space-indented sub-bullets.\n' +
  '- **Bold** key terms and the lead concept of each bullet so the notes scan well.\n' +
  '- Output MUST be pure Markdown. No preamble, no framing sentences, no closing paragraph.\n' +
  '- For mathematical expressions / variables / formulas use `$ … $` (inline) or `$$ … $$` (block) LaTeX delimiters only — never `\\(`, `\\[`, or MathML.\n' +
  '- Preserve specific numbers, names, and technical terms verbatim; don\'t paraphrase them away.\n' +
  '- Cite the source page number in parentheses like `(p. 12)` whenever a bullet draws from a specific excerpt.\n' +
  '- Do not invent content that isn\'t grounded in the provided excerpts.'

function formatAnnotationsAsContext(annotations: Annotation[]): string {
  // Stable deterministic ordering so the LLM sees the passages in
  // reading order (by page, then by creation time).
  const sorted = [...annotations].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })
  const lines: string[] = []
  sorted.forEach((a, i) => {
    lines.push(`--- Excerpt ${i + 1} (page ${a.page}) ---`)
    if (a.selectedText?.trim()) {
      lines.push(`"${a.selectedText.trim()}"`)
    }
    if (a.content?.trim()) {
      lines.push(`My note: ${a.content.trim()}`)
    }
    lines.push('')
  })
  return lines.join('\n')
}

export type AIProvider = 'openai' | 'azure'

export interface AIConfig {
  provider: AIProvider
  hasKey: boolean
  maskedKey: string | null
  openai: { baseUrl: string }
  azure: { endpoint: string; apiVersion: string; deployments: string[] }
}

export interface SaveAIConfigArgs {
  provider: AIProvider
  apiKey?: string
  openai?: { baseUrl?: string }
  azure?: { endpoint?: string; apiVersion?: string; deployments?: string[] }
}

export interface TestAIConfigArgs {
  provider: AIProvider
  apiKey: string
  openai?: { baseUrl?: string }
  azure?: { endpoint?: string; apiVersion?: string }
}

export interface WebSearchSource {
  title: string
  url: string
  snippet: string
}

export interface PendingContext {
  id: string
  /** The verbatim selected text the user wants to feed the model. */
  text: string
  /** 1-indexed page in the source PDF (or 0 if the source doesn't have pages). */
  page: number
  /** Display label for the source — usually the book title. */
  sourceTitle: string
}

interface AIState {
  /** Whether an API key has been saved. */
  isConfigured: boolean
  config: AIConfig
  models: string[]
  selectedModel: string
  conversations: Conversation[]
  currentConversation: Conversation | null
  messages: Message[]
  isStreaming: boolean
  streamingContent: string
  streamError: string | null
  /** When true, the next message will be augmented with web search results. */
  webSearchEnabled: boolean
  /** True while the main process is running a web search for us. */
  isSearchingWeb: boolean
  /**
   * Selections the user has staged to send as context with the next message.
   * They render as removable chips above the chat composer and are folded
   * into `pdfContext` automatically when `sendMessage` runs.
   */
  pendingContexts: PendingContext[]

  refreshConfig: () => Promise<void>
  saveConfig: (args: SaveAIConfigArgs) => Promise<{ ok: boolean; error?: string }>
  testConfig: (args: TestAIConfigArgs) => Promise<{ ok: boolean; error?: string }>
  clearConfig: () => Promise<void>
  loadModels: () => Promise<void>
  setModel: (model: string) => void
  loadConversations: (bookId: string) => Promise<void>
  selectConversation: (conv: Conversation) => Promise<void>
  startConversation: (bookId: string) => Promise<void>
  setWebSearchEnabled: (value: boolean) => void
  addPendingContext: (input: Omit<PendingContext, 'id'>) => void
  removePendingContext: (id: string) => void
  clearPendingContexts: () => void
  sendMessage: (content: string, pdfContext: string) => Promise<void>
  summarize: (text: string) => Promise<void>
  explain: (text: string) => Promise<void>
  /**
   * Send a collection of annotations to the LLM as grounded context,
   * using a named prompt template. Starts a new chat if none is active,
   * streams the response into the AI panel. Returns once the stream
   * completes (or throws on failure).
   */
  generateFromAnnotations: (annotations: Annotation[]) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  setStreamingContent: (content: string) => void
  appendStreamChunk: (chunk: string) => void
  endStream: () => void
  setStreamError: (message: string | null) => void
}

// Fallback model list shown if /v1/models couldn't be fetched and the user
// hasn't configured Azure deployments yet.
const FALLBACK_OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'o4-mini', 'o3-mini']

const EMPTY_CONFIG: AIConfig = {
  provider: 'openai',
  hasKey: false,
  maskedKey: null,
  openai: { baseUrl: 'https://api.openai.com/v1' },
  azure: { endpoint: '', apiVersion: '2024-12-01-preview', deployments: [] }
}

// Shared runner for single-shot AI tools (Summarize, Explain, etc.) launched
// from the selection toolbar. The thin versions that just streamed into
// `streamingContent` never persisted anything, so the assistant bubble
// flashed for a moment and then vanished when isStreaming went false.
// This version mirrors sendMessage(): it persists a visible user prompt,
// awaits the full response from the main process, and saves the assistant
// reply as a real message so the chat history actually reflects what happened.
async function runAITool(
  get: () => AIState,
  set: (partial: Partial<AIState>) => void,
  opts: {
    text: string
    invoke: (text: string, model: string) => Promise<string>
    userPrompt: (text: string) => string
    errorFallback: string
  }
): Promise<void> {
  const trimmed = opts.text.trim()
  if (!trimmed) return

  const { selectedModel, currentConversation } = get()
  if (!selectedModel) {
    set({ streamError: 'No model selected. Pick one from the AI panel.' })
    return
  }
  if (!currentConversation) {
    set({ streamError: 'No active conversation. Open the AI panel and click "New Chat".' })
    return
  }

  let userMsg: Message
  try {
    userMsg = await window.api.addMessage(
      currentConversation.id,
      'user',
      opts.userPrompt(trimmed)
    )
  } catch (err) {
    set({ streamError: (err as Error)?.message ?? 'Failed to save prompt.' })
    return
  }

  const baseMessages = [...get().messages, userMsg]
  set({
    messages: baseMessages,
    isStreaming: true,
    streamingContent: '',
    streamError: null
  })

  try {
    const fullResponse = await opts.invoke(trimmed, selectedModel)
    if (fullResponse.trim()) {
      const assistantMsg = await window.api.addMessage(
        currentConversation.id,
        'assistant',
        fullResponse
      )
      set({
        messages: [...baseMessages, assistantMsg],
        isStreaming: false,
        streamingContent: ''
      })
    } else {
      // Empty response — error was already surfaced via ai:stream-error.
      set({ isStreaming: false, streamingContent: '' })
    }
  } catch (err) {
    set({
      isStreaming: false,
      streamingContent: '',
      streamError: (err as Error)?.message ?? opts.errorFallback
    })
  }
}

export const useAIStore = create<AIState>()(
  persist(
    (set, get) => ({
      isConfigured: false,
      config: EMPTY_CONFIG,
      models: [],
      selectedModel: 'gpt-4o-mini',
      conversations: [],
      currentConversation: null,
      messages: [],
      isStreaming: false,
      streamingContent: '',
      streamError: null,
      webSearchEnabled: false,
      isSearchingWeb: false,
      pendingContexts: [],

      refreshConfig: async () => {
        const config = await window.api.getAIConfig() as AIConfig
        set({ config, isConfigured: config.hasKey })
        if (config.hasKey) {
          get().loadModels()
        }
      },

      saveConfig: async (args) => {
        // Validate first so we don't persist a broken config.
        if (args.apiKey) {
          const probe = await window.api.testAIConfig({
            provider: args.provider,
            apiKey: args.apiKey,
            openai: args.openai,
            azure: args.azure
          })
          if (!probe.ok) return probe
        }
        const config = await window.api.saveAIConfig(args) as AIConfig
        set({ config, isConfigured: config.hasKey })
        await get().loadModels()
        return { ok: true }
      },

      testConfig: async (args) => window.api.testAIConfig(args),

      clearConfig: async () => {
        await window.api.clearAIConfig()
        set({
          isConfigured: false,
          config: EMPTY_CONFIG,
          models: [],
          streamError: null
        })
      },

      loadModels: async () => {
        const { config } = get()
        const models = await window.api.listModels()
        // Azure: the "models" are the user's configured deployments. If they
        // haven't added any yet, surface that explicitly rather than a
        // misleading OpenAI fallback list.
        let effective: string[]
        if (config.provider === 'azure') {
          effective = models.length > 0 ? models : config.azure.deployments
        } else {
          effective = models.length > 0 ? models : FALLBACK_OPENAI_MODELS
        }
        set({ models: effective })
        const current = get().selectedModel
        if (!current || !effective.includes(current)) {
          const defaultModel = config.provider === 'azure'
            ? (effective[0] ?? '')
            : (effective.includes('gpt-4o-mini') ? 'gpt-4o-mini' : (effective[0] ?? ''))
          set({ selectedModel: defaultModel })
        }
      },

      setModel: (selectedModel) => set({ selectedModel }),

      loadConversations: async (bookId) => {
        const conversations = await window.api.getConversations(bookId)
        const { currentConversation } = get()
        // If the active conversation belongs to a different book, or no
        // longer exists in the DB (e.g. its book was deleted, cascading
        // away the conversation), drop it so the next send starts fresh
        // instead of failing a FK constraint on messages.conversation_id.
        const stillValid =
          currentConversation &&
          currentConversation.bookId === bookId &&
          conversations.some((c) => c.id === currentConversation.id)
        if (currentConversation && !stillValid) {
          set({ conversations, currentConversation: null, messages: [] })
        } else {
          set({ conversations })
        }
      },

      selectConversation: async (conv) => {
        const messages = await window.api.getMessages(conv.id)
        set({ currentConversation: conv, messages })
      },

      startConversation: async (bookId) => {
        const conv = await window.api.createConversation(bookId)
        set({
          currentConversation: conv,
          messages: [],
          conversations: [conv, ...get().conversations]
        })
      },

      setWebSearchEnabled: (value) => set({ webSearchEnabled: value }),

      addPendingContext: (input) => {
        const trimmed = input.text.trim()
        if (!trimmed) return
        // Drop a duplicate if the user re-selects the same passage on the
        // same page — prevents the chip stack from ballooning when the
        // toolbar is clicked twice in a row.
        const existing = get().pendingContexts
        const dup = existing.find(
          (c) => c.page === input.page && c.text.trim() === trimmed
        )
        if (dup) return
        const id = `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        set({
          pendingContexts: [
            ...existing,
            { id, text: input.text, page: input.page, sourceTitle: input.sourceTitle }
          ]
        })
      },

      removePendingContext: (id) => {
        set({ pendingContexts: get().pendingContexts.filter((c) => c.id !== id) })
      },

      clearPendingContexts: () => set({ pendingContexts: [] }),

      sendMessage: async (content, pdfContext) => {
        const { selectedModel, pendingContexts } = get()
        if (!selectedModel) {
          set({ streamError: 'No model selected. Pick one from the OpenAI models dropdown.' })
          return
        }

        // Fold any user-staged context chips into the pdfContext block so
        // the model sees them as authoritative source material. We keep
        // each excerpt clearly labelled (book + page) and concatenate
        // anything the caller already passed in (e.g. legacy callers).
        const stagedContextBlock = pendingContexts.length > 0
          ? pendingContexts
              .map((c, i) => {
                const head =
                  c.page > 0
                    ? `Excerpt ${i + 1} from "${c.sourceTitle}" (page ${c.page})`
                    : `Excerpt ${i + 1} from "${c.sourceTitle}"`
                return `${head}:\n"${c.text.trim()}"`
              })
              .join('\n\n')
          : ''
        const mergedPdfContext = [pdfContext?.trim(), stagedContextBlock]
          .filter((s) => s && s.length > 0)
          .join('\n\n')

        // Ensure we have a live conversation. If the stored one got orphaned
        // (e.g. its book was deleted in a prior session), create a fresh one.
        const ensureConversation = async (): Promise<Conversation | null> => {
          const existing = get().currentConversation
          if (existing) return existing
          // Need a book to attach to; fall back to the most-recent conversation
          // list (loadConversations was called on book open).
          const convs = get().conversations
          if (convs.length > 0) {
            const conv = convs[0]
            set({ currentConversation: conv, messages: [] })
            return conv
          }
          // Can't recover without knowing the book — caller should have
          // created one explicitly. Surface a helpful error.
          set({ streamError: 'No active conversation. Click "New Chat" to start one.' })
          return null
        }

        const conv = await ensureConversation()
        if (!conv) return

        // Optimistically show the user message in the UI immediately; if the
        // DB write fails we'll roll back and surface the error.
        const optimisticUserMsg: Message = {
          id: `temp-${Date.now()}`,
          role: 'user',
          content,
          createdAt: new Date().toISOString()
        }
        const baseMessages = get().messages
        set({
          messages: [...baseMessages, optimisticUserMsg],
          isStreaming: true,
          streamingContent: '',
          streamError: null
        })

        // Helper: persist the user message to SQLite. On FK failure, try to
        // recreate the conversation and retry once before giving up.
        const persistUserMsg = async (conversationId: string): Promise<Message> => {
          try {
            return await window.api.addMessage(conversationId, 'user', content)
          } catch (err) {
            const msg = (err as Error)?.message ?? ''
            if (msg.includes('FOREIGN KEY')) {
              // Conversation was deleted out from under us. Try once to
              // recreate it attached to the same book and retry.
              const bookId = conv.bookId
              try {
                const fresh = await window.api.createConversation(bookId)
                set({
                  currentConversation: fresh,
                  conversations: [fresh, ...get().conversations.filter(c => c.id !== conversationId)]
                })
                return await window.api.addMessage(fresh.id, 'user', content)
              } catch (retryErr) {
                throw retryErr
              }
            }
            throw err
          }
        }

        try {
          const activeConv = get().currentConversation ?? conv
          const userMsg = await persistUserMsg(activeConv.id)
          const confirmedConv = get().currentConversation ?? activeConv

          // Replace the optimistic message with the real one.
          const confirmedMessages = get().messages.map(m =>
            m.id === optimisticUserMsg.id ? userMsg : m
          )
          // The staged context chips were already folded into
          // `mergedPdfContext` above; drop them now so they don't bleed
          // into the *next* prompt the user types.
          set({ messages: confirmedMessages, pendingContexts: [] })

          // If the user has the web-search toggle on, fetch fresh results
          // for this prompt and pass them as a separate context block. We
          // run this BEFORE the chat call so the streaming UI only flips
          // on once the model actually starts replying.
          let webContext = ''
          if (get().webSearchEnabled) {
            set({ isSearchingWeb: true })
            try {
              const results = await window.api.webSearch(content, 5)
              if (results.length > 0) {
                webContext = results
                  .map((r, i) => {
                    const lines = [`[${i + 1}] ${r.title} — ${r.url}`]
                    if (r.snippet) lines.push(r.snippet)
                    return lines.join('\n')
                  })
                  .join('\n\n')
              }
            } catch (searchErr) {
              // Surface the error inline but still let the chat proceed
              // without web context — losing the search shouldn't kill the
              // user's prompt.
              console.warn('[ai] web search failed:', searchErr)
              set({
                streamError:
                  `Web search failed: ${(searchErr as Error)?.message ?? 'unknown error'}. ` +
                  `Replying without live results.`
              })
            } finally {
              set({ isSearchingWeb: false })
            }
          }

          const chatMessages = confirmedMessages.map(m => ({ role: m.role, content: m.content }))
          const fullResponse = await window.api.chat(chatMessages, selectedModel, mergedPdfContext, webContext)

          if (fullResponse.trim()) {
            const assistantMsg = await window.api.addMessage(confirmedConv.id, 'assistant', fullResponse)
            set({
              messages: [...confirmedMessages, assistantMsg],
              isStreaming: false,
              streamingContent: ''
            })
          } else {
            // Empty response — error was already surfaced via onAIStreamError.
            set({ isStreaming: false, streamingContent: '' })
          }
        } catch (err) {
          console.error('Chat failed:', err)
          // Roll back the optimistic user message on failure so the user
          // can edit and resend instead of seeing their prompt stuck.
          set({
            messages: get().messages.filter(m => m.id !== optimisticUserMsg.id),
            isStreaming: false,
            isSearchingWeb: false,
            streamingContent: '',
            streamError: (err as Error)?.message ?? 'The AI request failed.'
          })
        }
      },

      summarize: async (text) => {
        await runAITool(get, set, {
          text,
          invoke: (t, model) => window.api.summarize(t, model),
          userPrompt: (t) => `Summarize the following:\n\n${t}`,
          errorFallback: 'Summarize failed.'
        })
      },

      explain: async (text) => {
        await runAITool(get, set, {
          text,
          invoke: (t, model) => window.api.explain(t, model),
          userPrompt: (t) => `Explain the following:\n\n${t}`,
          errorFallback: 'Explain failed.'
        })
      },

      generateFromAnnotations: async (annotations) => {
        if (annotations.length === 0) return
        const { selectedModel } = get()
        if (!selectedModel) {
          console.warn('[ai] No model selected; cannot generate from annotations')
          return
        }

        // Ensure we have an active conversation. If none, create one
        // attached to the book the first annotation belongs to.
        let conv = get().currentConversation
        if (!conv) {
          const bookId = annotations[0].bookId
          conv = await window.api.createConversation(bookId)
          set({
            currentConversation: conv,
            messages: [],
            conversations: [conv, ...get().conversations]
          })
        }

        const context = formatAnnotationsAsContext(annotations)
        const prompt =
          `${GENERATE_PROMPT}\n\nHere are the excerpts (${annotations.length} ` +
          `${annotations.length === 1 ? 'highlight' : 'highlights'}):\n\n${context}`

        // The existing chat pipeline already handles streaming + DB
        // persistence. Pass an empty pdfContext because the prompt is
        // fully self-contained — we don't want the main process to
        // inject "the user is reading a PDF…" system context on top.
        await get().sendMessage(prompt, '')
      },

      deleteConversation: async (id) => {
        await window.api.deleteConversation(id)
        const { currentConversation, conversations } = get()
        set({
          conversations: conversations.filter(c => c.id !== id),
          ...(currentConversation?.id === id ? { currentConversation: null, messages: [] } : {})
        })
      },

      renameConversation: async (id, title) => {
        const updated = await window.api.renameConversation(id, title)
        if (!updated) return
        const { conversations, currentConversation } = get()
        set({
          conversations: conversations.map(c => (c.id === id ? { ...c, title: updated.title } : c)),
          ...(currentConversation?.id === id
            ? { currentConversation: { ...currentConversation, title: updated.title } }
            : {})
        })
      },

      setStreamingContent: (streamingContent) => set({ streamingContent }),
      appendStreamChunk: (chunk) => set((s) => ({ streamingContent: s.streamingContent + chunk, streamError: null })),
      endStream: () => set({ isStreaming: false }),
      setStreamError: (streamError) => set({ streamError, isStreaming: false })
    }),
    {
      name: 'ai-kindle-ai',
      partialize: (state) => ({
        selectedModel: state.selectedModel,
        webSearchEnabled: state.webSearchEnabled
      })
    }
  )
)
