import { memo, useLayoutEffect, useRef, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { BrainCircuit, User, Check, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { normalizeMathDelimiters } from '@/lib/markdown-utils'
import type { Message } from '@/stores/ai-store'

// User prompts are clamped to 2 visible lines by default, with "Show more"
// to expand. Keep this as a constant so UI copy/comments stay in sync.
const USER_CLAMP_CLASS = 'line-clamp-2'

interface ChatMessageProps {
  message: Message
  isStreaming?: boolean
}

/**
 * Chat bubble for a single message. Assistant messages are rendered as
 * GitHub-flavored Markdown (with code blocks, tables, task lists, etc.).
 * User messages stay as plain text so the user's input renders exactly
 * as they typed it.
 */
function ChatMessageImpl({ message, isStreaming }: ChatMessageProps): JSX.Element {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)

  const handleCopyAll = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked; ignore */
    }
  }

  return (
    <div className={cn('flex gap-2.5 group min-w-0', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div className={cn(
        'w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5',
        isUser ? 'bg-primary/15 text-primary' : 'bg-accent/15 text-accent'
      )}>
        {isUser
          ? <User className="w-3 h-3" />
          : <BrainCircuit className="w-3 h-3" />}
      </div>

      {/* Bubble column. `flex-1 min-w-0` makes the column fill the row
          (minus the avatar) so the bubble's `max-w-[85%]` below actually
          resolves against the full available width — otherwise the bubble
          would just size to its content and long prompts wouldn't wrap. */}
      <div className={cn('flex flex-col flex-1 min-w-0', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed chat-bubble-selectable',
            'max-w-[85%] min-w-0',
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-sm break-words'
              : 'bg-card border border-border rounded-tl-sm break-words'
          )}
          // `overflow-wrap: anywhere` breaks inside long unbroken tokens
          // (URLs, base64 blobs, code) so a pasted prompt can't blow out
          // the bubble's width. `word-break: break-word` is a Safari alias.
          style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
        >
          {isUser
            ? <UserMessageBody content={message.content} />
            : <MarkdownContent content={message.content} />}
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-current opacity-60 animate-pulse ml-0.5 align-middle" />
          )}
        </div>

        {/* Actions row — only for assistant messages, and only once streaming
            has finished so we don't flicker a stale "copy" while tokens stream. */}
        {!isUser && !isStreaming && message.content.trim() && (
          <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              onClick={handleCopyAll}
              className={cn(
                'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors',
                copied
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              )}
              title={copied ? 'Copied' : 'Copy message'}
            >
              {copied
                ? <Check className="w-3 h-3" />
                : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export const ChatMessage = memo(ChatMessageImpl, (prev, next) => {
  // Reuse the rendered bubble unless the text or streaming state actually changed.
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.isStreaming === next.isStreaming
  )
})

/**
 * Opens links in the user's default browser via Electron shell.openExternal,
 * rather than navigating inside the app window (which would replace the UI).
 */
function handleLinkClick(e: React.MouseEvent<HTMLAnchorElement>): void {
  const href = e.currentTarget.getAttribute('href')
  if (!href) return
  e.preventDefault()
  void window.api.openExternal(href).catch(() => { /* ignore */ })
}

/**
 * Compact, styled code block with a one-click "Copy" button.
 */
/**
 * User prompt body with a 2-line clamp + "Show more" toggle. Keeps long
 * pasted prompts from dominating the chat scroll, while still being
 * a single click away if the user wants to re-read what they sent.
 *
 * Overflow detection compares scrollHeight (full content) to clientHeight
 * (visible, clamped) — so the toggle only appears when the prompt is
 * actually too long, not for every two-line message.
 */
function UserMessageBody({ content }: { content: string }): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const textRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = textRef.current
    if (!el) return
    // Give the browser one frame to apply the clamp class before measuring;
    // without this the first check can report 0 height under some flex layouts.
    const check = (): void => {
      setOverflowing(el.scrollHeight - el.clientHeight > 1)
    }
    check()
    // Re-check on window resize because the clamp threshold depends on how
    // many characters fit per line, which changes with the panel width.
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [content, expanded])

  return (
    <>
      <div
        ref={textRef}
        className={cn(
          'whitespace-pre-wrap',
          !expanded && USER_CLAMP_CLASS
        )}
      >
        {content}
      </div>
      {(overflowing || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            'mt-1 -mx-1 px-1 py-0.5 rounded text-[10px] font-medium inline-flex items-center gap-0.5',
            'text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/10 transition-colors'
          )}
        >
          {expanded
            ? <>Show less <ChevronUp className="w-2.5 h-2.5" /></>
            : <>Show more <ChevronDown className="w-2.5 h-2.5" /></>}
        </button>
      )}
    </>
  )
}

function CodeBlock({ language, children }: { language: string; children: string }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(children)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }

  return (
    <div className="relative group my-2 rounded-lg bg-secondary/80 border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1 border-b border-border text-[10px] text-muted-foreground">
        <span className="font-mono">{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-background transition-colors"
          title={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="px-3 py-2 text-[11.5px] leading-snug overflow-x-auto font-mono">
        <code>{children}</code>
      </pre>
    </div>
  )
}

// Mapping of markdown element types to our styled React components. Keeping
// these stable (defined outside the component) avoids re-mounting subtrees
// every render while a stream is in progress.
const markdownComponents: Components = {
  p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,

  h1: ({ children }) => <h2 className="text-sm font-bold mt-3 mb-1.5 first:mt-0">{children}</h2>,
  h2: ({ children }) => <h3 className="text-sm font-semibold mt-3 mb-1.5 first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="text-xs font-semibold mt-2 mb-1 first:mt-0 uppercase tracking-wide text-muted-foreground">{children}</h4>,
  h4: ({ children }) => <h5 className="text-xs font-semibold mt-2 mb-1 first:mt-0">{children}</h5>,
  h5: ({ children }) => <h6 className="text-[11px] font-semibold mt-2 mb-1 first:mt-0">{children}</h6>,
  h6: ({ children }) => <h6 className="text-[11px] font-semibold mt-2 mb-1 first:mt-0 text-muted-foreground">{children}</h6>,

  ul: ({ children }) => <ul className="my-1.5 ml-4 list-disc marker:text-muted-foreground space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 ml-4 list-decimal marker:text-muted-foreground space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed [&>p]:my-0">{children}</li>,

  blockquote: ({ children }) => (
    <blockquote className="my-2 pl-3 border-l-2 border-primary/40 text-muted-foreground italic [&>p]:my-0">
      {children}
    </blockquote>
  ),

  a: ({ href, children }) => (
    <a
      href={href}
      onClick={handleLinkClick}
      className="text-primary underline decoration-dotted hover:decoration-solid"
      rel="noreferrer"
    >
      {children}
    </a>
  ),

  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="opacity-60 line-through">{children}</del>,

  // react-markdown hands us the whole <pre> unconditionally; inline `code`
  // comes through the `code` renderer with inline=true.
  code: ({ className, children, ...props }) => {
    // @ts-expect-error — react-markdown types don't surface `inline` cleanly
    const inline: boolean = props.inline
    const content = Array.isArray(children) ? children.join('') : String(children ?? '')
    if (inline) {
      return (
        <code className="px-1 py-0.5 bg-secondary rounded text-[11.5px] font-mono break-words">
          {content}
        </code>
      )
    }
    const language = /language-(\w+)/.exec(className ?? '')?.[1] ?? ''
    return <CodeBlock language={language}>{content.replace(/\n$/, '')}</CodeBlock>
  },
  pre: ({ children }) => <>{children}</>, // CodeBlock provides its own <pre>

  hr: () => <hr className="my-3 border-border" />,

  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-md border border-border">
      <table className="text-xs min-w-full">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-secondary/60">{children}</thead>,
  th: ({ children }) => (
    <th className="px-2 py-1 text-left font-semibold border-b border-border">{children}</th>
  ),
  td: ({ children }) => <td className="px-2 py-1 border-b border-border/50">{children}</td>,
  tr: ({ children }) => <tr>{children}</tr>,

  // GFM task-list items (- [ ] / - [x]) come through as <input type="checkbox">
  input: ({ type, checked }) =>
    type === 'checkbox' ? (
      <input
        type="checkbox"
        checked={!!checked}
        readOnly
        className="mr-1.5 align-middle accent-primary"
      />
    ) : null
}

function MarkdownContent({ content }: { content: string }): JSX.Element {
  const normalized = normalizeMathDelimiters(content)
  return (
    <div className="text-sm chat-md">
      {/* remark-gfm:  GitHub-flavored markdown (tables, task lists, strikethrough)
       *  remark-math: parse $…$ (inline) and $$…$$ (block) LaTeX math
       *  rehype-katex: render the parsed math nodes via KaTeX into HTML+CSS */}
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false, output: 'htmlAndMathml' }]]}
        components={markdownComponents}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  )
}
