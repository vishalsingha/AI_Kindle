import { ipcMain } from 'electron'

// Minimal, key-less web search backed by DuckDuckGo's no-JS HTML endpoint.
// We POST to https://html.duckduckgo.com/html/ and parse the returned
// markup with regex — this avoids pulling in an HTML parser dep, and the
// no-JS variant has stayed remarkably stable. Each result we surface is
// the public landing page (we unwrap DDG's `l/?uddg=…` redirect wrapper).

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const DDG_HTML_URL = 'https://html.duckduckgo.com/html/'

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
}

function stripHtml(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
}

/**
 * DDG wraps every result href in a redirect of the form
 * `//duckduckgo.com/l/?uddg=<encoded-url>&rut=…`. Pull the real URL out
 * of the `uddg` query param so the model and the UI both see the
 * canonical destination.
 */
function unwrapDdgRedirect(href: string): string {
  try {
    let h = href.trim()
    if (h.startsWith('//')) h = 'https:' + h
    if (!/^https?:/i.test(h)) return h
    const u = new URL(h)
    const uddg = u.searchParams.get('uddg')
    if (uddg) return decodeURIComponent(uddg)
    return h
  } catch {
    return href
  }
}

function parseResults(html: string, maxResults: number): WebSearchResult[] {
  const results: WebSearchResult[] = []
  // Each search hit is a <div class="result …"> block. We walk the
  // document in order and stop once we have enough hits, so we don't
  // pay to parse the long tail of related-search modules.
  const linkRe =
    /<a[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(html)) !== null && results.length < maxResults) {
    const url = unwrapDdgRedirect(m[1])
    const title = stripHtml(m[2])
    if (!url || !title) continue
    if (seen.has(url)) continue
    seen.add(url)

    // Look for the matching snippet that follows this result link. DDG
    // emits `result__snippet` either as <a> or <div>; try both.
    const tail = html.slice(linkRe.lastIndex, linkRe.lastIndex + 4000)
    const snipM =
      /<a[^>]*class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(tail) ??
      /<div[^>]*class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(tail)
    const snippet = snipM ? stripHtml(snipM[1]) : ''

    results.push({ title, url, snippet })
  }
  return results
}

export async function searchWeb(
  query: string,
  maxResults = 5
): Promise<WebSearchResult[]> {
  const q = query.trim()
  if (!q) return []

  let response: Response
  try {
    response = await fetch(DDG_HTML_URL, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9'
      },
      body: `q=${encodeURIComponent(q)}&kl=us-en`,
      signal: AbortSignal.timeout(15000)
    })
  } catch (e) {
    throw new Error(`Web search request failed: ${(e as Error)?.message ?? e}`)
  }

  if (!response.ok) {
    throw new Error(`Web search failed: HTTP ${response.status}`)
  }

  const html = await response.text()
  return parseResults(html, Math.max(1, Math.min(maxResults, 10)))
}

/**
 * Render a list of results as a Markdown-ish block suitable for injecting
 * into a system prompt. Numbered so the model can cite as `[1]`, `[2]`, …
 */
export function formatResultsForPrompt(results: WebSearchResult[]): string {
  if (results.length === 0) return ''
  return results
    .map((r, i) => {
      const lines = [`[${i + 1}] ${r.title} — ${r.url}`]
      if (r.snippet) lines.push(r.snippet)
      return lines.join('\n')
    })
    .join('\n\n')
}

export function registerWebSearchHandlers(): void {
  ipcMain.handle(
    'web:search',
    async (_event, query: string, maxResults?: number): Promise<WebSearchResult[]> => {
      try {
        return await searchWeb(query, maxResults ?? 5)
      } catch (e) {
        console.error('[web-search] failed:', (e as Error)?.message ?? e)
        throw e
      }
    }
  )
}
