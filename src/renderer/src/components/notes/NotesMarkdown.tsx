import { memo, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Check, Copy } from 'lucide-react'
import 'katex/dist/katex.min.css'
import { normalizeMathDelimiters } from '@/lib/markdown-utils'
import { cn } from '@/lib/utils'

/**
 * Full-feature Markdown preview used by the long-form notes editor.
 * Mirrors the chat renderer (GFM + LaTeX math via KaTeX + external-link
 * handling + code-block copy button) but uses roomier prose styling
 * suited to a note-taking surface instead of a narrow chat bubble.
 */
interface Props {
  content: string
  className?: string
}

function handleLinkClick(e: React.MouseEvent<HTMLAnchorElement>): void {
  const href = e.currentTarget.getAttribute('href')
  if (!href) return
  e.preventDefault()
  void window.api.openExternal(href).catch(() => { /* ignore */ })
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
    <div className="relative group my-3 rounded-lg bg-muted border border-border overflow-hidden">
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
      <pre className="px-3 py-2 text-[12.5px] leading-snug overflow-x-auto font-mono">
        <code>{children}</code>
      </pre>
    </div>
  )
}

// Prose-styled components: larger headings, generous spacing, tables get
// a card-like chrome. Tuned for a wide notes column rather than a chat
// bubble (compare to ChatMessage's compact overrides).
const notesComponents: Components = {
  p: ({ children }) => <p className="my-2.5 first:mt-0 last:mb-0 leading-relaxed">{children}</p>,

  h1: ({ children }) => <h1 className="text-lg font-bold mt-5 mb-2 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="text-base font-bold mt-4 mb-2 first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold mt-3 mb-1.5 first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="text-sm font-semibold mt-3 mb-1.5 first:mt-0">{children}</h4>,
  h5: ({ children }) => <h5 className="text-[13px] font-semibold mt-2.5 mb-1 first:mt-0">{children}</h5>,
  h6: ({ children }) => (
    <h6 className="text-[12px] font-semibold mt-2.5 mb-1 first:mt-0 uppercase tracking-wide text-muted-foreground">
      {children}
    </h6>
  ),

  ul: ({ children }) => <ul className="my-2 ml-5 list-disc marker:text-muted-foreground space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 ml-5 list-decimal marker:text-muted-foreground space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed [&>p]:my-0">{children}</li>,

  blockquote: ({ children }) => (
    <blockquote className="my-3 pl-3 border-l-4 border-primary/40 text-muted-foreground italic [&>p]:my-1">
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

  code: ({ className, children, ...props }) => {
    // @ts-expect-error — react-markdown types don't surface `inline` cleanly
    const inline: boolean = props.inline
    const content = Array.isArray(children) ? children.join('') : String(children ?? '')
    if (inline) {
      return (
        <code className="px-1 py-0.5 bg-muted rounded text-[12.5px] font-mono break-words">
          {content}
        </code>
      )
    }
    const language = /language-(\w+)/.exec(className ?? '')?.[1] ?? ''
    return <CodeBlock language={language}>{content.replace(/\n$/, '')}</CodeBlock>
  },
  pre: ({ children }) => <>{children}</>, // CodeBlock provides its own <pre>

  hr: () => <hr className="my-4 border-border" />,

  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-md border border-border">
      <table className="text-sm min-w-full">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-secondary/60">{children}</thead>,
  th: ({ children }) => (
    <th className="px-2.5 py-1.5 text-left font-semibold border-b border-border">{children}</th>
  ),
  td: ({ children }) => <td className="px-2.5 py-1.5 border-b border-border/50">{children}</td>,
  tr: ({ children }) => <tr>{children}</tr>,

  // GFM task lists (- [ ] / - [x])
  input: ({ type, checked }) =>
    type === 'checkbox' ? (
      <input type="checkbox" checked={!!checked} readOnly className="mr-1.5 align-middle accent-primary" />
    ) : null,

  img: ({ src, alt }) => (
    <img src={src ?? ''} alt={alt ?? ''} className="max-w-full rounded my-2" draggable={false} />
  )
}

function NotesMarkdownImpl({ content, className }: Props): JSX.Element {
  const normalized = normalizeMathDelimiters(content)
  return (
    <div className={cn('notes-md', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false, output: 'htmlAndMathml' }]]}
        components={notesComponents}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  )
}

// Same markdown input → same output, so memoize on the content prop to avoid
// re-parsing on every keystroke of the editor when only the textarea changed.
export const NotesMarkdown = memo(NotesMarkdownImpl, (a, b) => a.content === b.content && a.className === b.className)
