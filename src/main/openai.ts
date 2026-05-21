import { ipcMain, BrowserWindow, safeStorage } from 'electron'
import { getSetting, setSetting, deleteSetting } from './database'

// ─────────────────────────────────────────────────────────────────────────
// Config model
//
// AI Kindle supports two provider shapes today:
//   1. OpenAI cloud       https://api.openai.com/v1/chat/completions
//                         Auth: Authorization: Bearer sk-…
//                         Model name lives in the request body.
//   2. Azure OpenAI       {endpoint}openai/deployments/{deployment}/chat/completions?api-version=…
//                         Auth: api-key: <key>
//                         "Model" is actually the deployment name baked into the URL.
//
// A user configures one provider at a time. For Azure, they supply the
// endpoint + api-version + a list of deployment names that becomes the
// "model" dropdown in the UI. The key itself is always encrypted via
// Electron safeStorage before being persisted.
// ─────────────────────────────────────────────────────────────────────────

export type Provider = 'openai' | 'azure'

export interface AIConfigPublic {
  provider: Provider
  hasKey: boolean
  maskedKey: string | null
  openai: { baseUrl: string }
  azure: {
    endpoint: string
    apiVersion: string
    deployments: string[]
  }
}

interface StoredConfig {
  provider: Provider
  openai: { baseUrl: string }
  azure: { endpoint: string; apiVersion: string; deployments: string[] }
}

const DEFAULT_OPENAI_BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
const DEFAULT_AZURE_API_VERSION = '2024-12-01-preview'

// Setting keys
const KEY_PROVIDER = 'ai.provider'
const KEY_OPENAI_BASE = 'ai.openai.baseUrl'
const KEY_AZURE_ENDPOINT = 'ai.azure.endpoint'
const KEY_AZURE_API_VERSION = 'ai.azure.apiVersion'
const KEY_AZURE_DEPLOYMENTS = 'ai.azure.deployments'
// Encrypted API key (for whichever provider is active)
const KEY_ENCRYPTED_KEY = 'ai.apiKey.encrypted'
// Plaintext fallback when safeStorage isn't available (headless Linux, etc.)
const KEY_PLAINTEXT_KEY = 'ai.apiKey.plain'

// ─── Key storage ──────────────────────────────────────────────────────
function saveKey(key: string): void {
  const trimmed = key.trim()
  if (!trimmed) {
    deleteSetting(KEY_ENCRYPTED_KEY)
    deleteSetting(KEY_PLAINTEXT_KEY)
    return
  }
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(trimmed)
    setSetting(KEY_ENCRYPTED_KEY, encrypted.toString('base64'))
    deleteSetting(KEY_PLAINTEXT_KEY)
  } else {
    console.warn('[ai] safeStorage unavailable, storing API key in plaintext')
    setSetting(KEY_PLAINTEXT_KEY, trimmed)
    deleteSetting(KEY_ENCRYPTED_KEY)
  }
}

function loadKey(): string | null {
  const encrypted = getSetting(KEY_ENCRYPTED_KEY)
  if (encrypted && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch (err) {
      console.error('[ai] failed to decrypt API key:', err)
      return null
    }
  }
  return getSetting(KEY_PLAINTEXT_KEY)
}

function maskKey(key: string): string {
  if (key.length <= 8) return '••••'
  return `${key.slice(0, 3)}…${key.slice(-4)}`
}

// ─── Config storage ───────────────────────────────────────────────────
function loadConfig(): StoredConfig {
  const provider: Provider = getSetting(KEY_PROVIDER) === 'azure' ? 'azure' : 'openai'
  const openaiBaseUrl = getSetting(KEY_OPENAI_BASE) || DEFAULT_OPENAI_BASE
  const azureEndpoint = getSetting(KEY_AZURE_ENDPOINT) || ''
  const azureApiVersion = getSetting(KEY_AZURE_API_VERSION) || DEFAULT_AZURE_API_VERSION
  const azureDeploymentsRaw = getSetting(KEY_AZURE_DEPLOYMENTS) || '[]'
  let azureDeployments: string[] = []
  try {
    const parsed = JSON.parse(azureDeploymentsRaw)
    if (Array.isArray(parsed)) azureDeployments = parsed.filter(s => typeof s === 'string' && s.trim())
  } catch { /* ignore */ }

  return {
    provider,
    openai: { baseUrl: openaiBaseUrl },
    azure: {
      endpoint: azureEndpoint.replace(/\/+$/, ''), // drop trailing slash
      apiVersion: azureApiVersion,
      deployments: azureDeployments
    }
  }
}

function publicConfig(): AIConfigPublic {
  const cfg = loadConfig()
  const key = loadKey()
  return {
    provider: cfg.provider,
    hasKey: !!key && key.length > 0,
    maskedKey: key ? maskKey(key) : null,
    openai: cfg.openai,
    azure: cfg.azure
  }
}

interface SaveConfigArgs {
  provider: Provider
  apiKey?: string  // optional — omit to keep the existing stored key
  openai?: { baseUrl?: string }
  azure?: { endpoint?: string; apiVersion?: string; deployments?: string[] }
}

function saveConfig(args: SaveConfigArgs): void {
  setSetting(KEY_PROVIDER, args.provider)
  if (args.openai?.baseUrl !== undefined) {
    setSetting(KEY_OPENAI_BASE, args.openai.baseUrl.trim() || DEFAULT_OPENAI_BASE)
  }
  if (args.azure) {
    if (args.azure.endpoint !== undefined) {
      setSetting(KEY_AZURE_ENDPOINT, args.azure.endpoint.trim().replace(/\/+$/, ''))
    }
    if (args.azure.apiVersion !== undefined) {
      setSetting(KEY_AZURE_API_VERSION, args.azure.apiVersion.trim() || DEFAULT_AZURE_API_VERSION)
    }
    if (args.azure.deployments !== undefined) {
      const cleaned = args.azure.deployments
        .map(d => d.trim())
        .filter(Boolean)
      setSetting(KEY_AZURE_DEPLOYMENTS, JSON.stringify(cleaned))
    }
  }
  if (args.apiKey !== undefined) {
    saveKey(args.apiKey)
  }
}

function clearAll(): void {
  for (const key of [
    KEY_PROVIDER, KEY_OPENAI_BASE, KEY_AZURE_ENDPOINT,
    KEY_AZURE_API_VERSION, KEY_AZURE_DEPLOYMENTS,
    KEY_ENCRYPTED_KEY, KEY_PLAINTEXT_KEY
  ]) {
    deleteSetting(key)
  }
}

// ─── Endpoint + auth helpers ──────────────────────────────────────────
function chatEndpoint(cfg: StoredConfig, modelOrDeployment: string): string {
  if (cfg.provider === 'azure') {
    // Azure: path encodes the deployment, api-version is a query param.
    const deployment = encodeURIComponent(modelOrDeployment)
    const endpoint = cfg.azure.endpoint
    return `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${encodeURIComponent(cfg.azure.apiVersion)}`
  }
  return `${cfg.openai.baseUrl.replace(/\/+$/, '')}/chat/completions`
}

function authHeaders(cfg: StoredConfig, key: string): Record<string, string> {
  if (cfg.provider === 'azure') {
    return { 'api-key': key, 'Content-Type': 'application/json' }
  }
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
}

// ─── Testing a config ─────────────────────────────────────────────────
async function testConfig(args: {
  provider: Provider
  apiKey: string
  openai?: { baseUrl?: string }
  azure?: { endpoint?: string; apiVersion?: string }
}): Promise<{ ok: boolean; error?: string }> {
  const key = args.apiKey.trim()
  if (!key) return { ok: false, error: 'API key is empty.' }

  if (args.provider === 'azure') {
    const endpoint = (args.azure?.endpoint || '').trim().replace(/\/+$/, '')
    const apiVersion = (args.azure?.apiVersion || DEFAULT_AZURE_API_VERSION).trim()
    if (!endpoint) return { ok: false, error: 'Azure endpoint is required.' }
    const url = `${endpoint}/openai/models?api-version=${encodeURIComponent(apiVersion)}`
    try {
      const response = await fetch(url, {
        headers: { 'api-key': key },
        signal: AbortSignal.timeout(10000)
      })
      if (response.ok) return { ok: true }
      let detail = ''
      try { detail = (await response.json())?.error?.message ?? '' } catch { /* ignore */ }
      return { ok: false, error: detail || `HTTP ${response.status}` }
    } catch (err) {
      return { ok: false, error: (err as Error)?.message ?? 'Network error' }
    }
  }

  // OpenAI
  const baseUrl = (args.openai?.baseUrl || DEFAULT_OPENAI_BASE).trim().replace(/\/+$/, '')
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000)
    })
    if (response.ok) return { ok: true }
    let detail = ''
    try { detail = (await response.json())?.error?.message ?? '' } catch { /* ignore */ }
    return { ok: false, error: detail || `HTTP ${response.status}` }
  } catch (err) {
    return { ok: false, error: (err as Error)?.message ?? 'Network error' }
  }
}

// ─── Listing models ───────────────────────────────────────────────────
async function listModels(): Promise<string[]> {
  const cfg = loadConfig()
  const key = loadKey()
  if (!key) return cfg.provider === 'azure' ? cfg.azure.deployments : []

  if (cfg.provider === 'azure') {
    // For Azure, the "models" the user cares about are their own deployments.
    // /openai/deployments requires higher privileges; we trust the user-provided
    // deployments list instead.
    return cfg.azure.deployments
  }

  try {
    const response = await fetch(`${cfg.openai.baseUrl.replace(/\/+$/, '')}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000)
    })
    if (!response.ok) return []
    const data = await response.json()
    const allowed = /^(gpt-|o\d|chatgpt-)/
    const excluded = /(audio|transcribe|realtime|tts|image|vision-preview|embed|moderation|instruct)/i
    const names: string[] = (data.data || [])
      .map((m: { id: string }) => m.id)
      .filter((id: string) => allowed.test(id) && !excluded.test(id))
    names.sort()
    return names
  } catch (err) {
    console.warn('[ai] listModels failed:', (err as Error)?.message ?? err)
    return []
  }
}

// ─── Streaming chat ───────────────────────────────────────────────────
async function streamChat(
  win: BrowserWindow,
  messages: Array<{ role: string; content: string }>,
  model: string,
  context: string,
  webContext: string = ''
): Promise<string> {
  const cfg = loadConfig()
  const key = loadKey()

  if (!key) {
    const err = 'No API key configured. Add your credentials in the AI panel.'
    win.webContents.send('ai:stream-error', err)
    win.webContents.send('ai:stream-end')
    throw new Error(err)
  }
  if (!model || !model.trim()) {
    const err = cfg.provider === 'azure'
      ? 'No deployment selected. Add one in the AI settings.'
      : 'No model selected. Pick one from the AI panel.'
    win.webContents.send('ai:stream-error', err)
    win.webContents.send('ai:stream-end')
    throw new Error(err)
  }
  if (cfg.provider === 'azure' && !cfg.azure.endpoint) {
    const err = 'Azure endpoint is missing. Open the AI settings to fix.'
    win.webContents.send('ai:stream-error', err)
    win.webContents.send('ai:stream-end')
    throw new Error(err)
  }

  // The renderer runs remark-math + rehype-katex over the reply, which
  // parses exactly $…$ (inline) and $$…$$ (block) LaTeX delimiters.
  // Anything else — \(…\), \[…\], raw HTML, MathML, Unicode-only math —
  // is NOT rendered as math. We tell the model to stick to those two
  // delimiters so every formula it produces lands as real typeset math.
  const MATH_INSTRUCTION =
    'When writing mathematical expressions, equations, variables, or formulas, ALWAYS wrap them in LaTeX delimiters using ONLY these two forms:\n' +
    '- `$ ... $` for inline math inside a sentence (e.g. "The vector $x \\in \\mathbb{R}^{H \\times W \\times C}$").\n' +
    '- `$$ ... $$` on their own lines for display-mode (block) equations.\n\n' +
    'Do NOT use `\\( ... \\)`, `\\[ ... \\]`, MathML, raw HTML, or plain-text math (Unicode subscripts, asterisks for multiplication, etc.). Do not escape the dollar signs. Even a single variable like $x$ should be wrapped so it typesets correctly. Everything outside of math should remain regular GitHub-flavored Markdown.'

  // Compose the system prompt out of three optional sections so that PDF
  // context and live web-search results can both be supplied at once.
  const sections: string[] = [
    'You are a helpful AI study assistant. Be concise, clear, and educational. Use bullet points and formatting when helpful.'
  ]
  if (context.trim()) {
    sections.push(
      `The user is reading a PDF document. Here is the relevant context from the document:\n\n---\n${context}\n---`
    )
  }
  if (webContext.trim()) {
    sections.push(
      'The following are recent results from a web search the user just ran. ' +
        'Treat them as fresh, possibly authoritative sources. When you use a fact ' +
        'from a result, cite it inline as `[1]`, `[2]`, … matching the numbers below, ' +
        'and end your reply with a short `**Sources**` Markdown list whose items are ' +
        'Markdown links to the cited URLs. Do NOT invent sources or numbers that are ' +
        'not in this list. If the results don\'t actually answer the question, say so.\n\n' +
        '---\n' +
        webContext +
        '\n---'
    )
  }
  sections.push(MATH_INSTRUCTION)

  const systemMessage = {
    role: 'system' as const,
    content: sections.join('\n\n')
  }

  const url = chatEndpoint(cfg, model)
  // Azure doesn't want `model` in the body (deployment is already in the URL).
  const body: Record<string, unknown> = {
    messages: [systemMessage, ...messages],
    stream: true
  }
  if (cfg.provider === 'openai') body.model = model

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: authHeaders(cfg, key),
      body: JSON.stringify(body)
    })
  } catch (e) {
    const msg = `Cannot reach ${cfg.provider === 'azure' ? 'Azure OpenAI' : 'OpenAI'} (${url}): ${(e as Error)?.message ?? e}`
    console.error('[ai] fetch failed:', msg)
    win.webContents.send('ai:stream-error', msg)
    win.webContents.send('ai:stream-end')
    throw new Error(msg)
  }

  if (!response.ok) {
    let detail = ''
    try { detail = await response.text() } catch { /* ignore */ }
    const parsed = (() => { try { return JSON.parse(detail) } catch { return null } })()
    const explanation = parsed?.error?.message || detail || `HTTP ${response.status}`
    const providerLabel = cfg.provider === 'azure' ? 'Azure OpenAI' : 'OpenAI'
    const msg = `${providerLabel} error: ${explanation}`
    console.error('[ai]', msg)
    win.webContents.send('ai:stream-error', msg)
    win.webContents.send('ai:stream-end')
    throw new Error(msg)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    win.webContents.send('ai:stream-error', 'Empty response body from the AI provider.')
    win.webContents.send('ai:stream-end')
    throw new Error('No response body')
  }

  const decoder = new TextDecoder()
  let fullResponse = ''
  let buffer = ''
  let sawAnyContent = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let newlineIdx: number
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const rawLine = buffer.slice(0, newlineIdx)
        buffer = buffer.slice(newlineIdx + 1)
        const line = rawLine.trim()
        if (!line) continue

        const content = parseSSELine(line, win)
        if (content) {
          fullResponse += content
          sawAnyContent = true
          win.webContents.send('ai:stream-chunk', content)
        }
      }
    }
  } finally {
    try { reader.releaseLock() } catch { /* ignore */ }
  }

  if (!sawAnyContent) {
    win.webContents.send(
      'ai:stream-error',
      `The model "${model}" returned no content. Check your deployment settings.`
    )
  }

  win.webContents.send('ai:stream-end')
  return fullResponse
}

/** Parse one SSE line from an OpenAI-compatible chat completions stream. */
function parseSSELine(line: string, win: BrowserWindow): string | null {
  if (!line.startsWith('data:')) return null
  const payload = line.slice(5).trim()
  if (payload === '[DONE]') return null

  let data: any
  try {
    data = JSON.parse(payload)
  } catch {
    console.warn('[ai] non-JSON SSE payload:', payload.slice(0, 200))
    return null
  }

  if (data.error) {
    console.error('[ai] stream error:', data.error)
    win.webContents.send('ai:stream-error', `Upstream: ${data.error.message || data.error}`)
    return null
  }

  // Azure sometimes emits an initial chunk with no choices (content filter
  // prompt annotations) — ignore those safely.
  const delta = data.choices?.[0]?.delta?.content
  return typeof delta === 'string' && delta.length > 0 ? delta : null
}

async function summarize(win: BrowserWindow, text: string, model: string): Promise<string> {
  const prompt =
    'Summarize the following text as a set of concise Markdown bullet points.\n\n' +
    'Strict rules for your output:\n' +
    '- Use ONLY Markdown. No prose paragraphs, no preamble, no conclusion, no framing sentences like "Here is a summary" or "In summary".\n' +
    '- Every top-level bullet must start with `- `.\n' +
    '- Group related details as nested sub-bullets (two-space indent) under their parent point so the structure reflects the content.\n' +
    '- Put the most important idea of each bullet in **bold** at the start of the line.\n' +
    '- Preserve specific numbers, names, and technical terms verbatim; don\'t paraphrase them away.\n' +
    '- For any mathematical expressions, variables, or formulas use `$ … $` (inline) or `$$ … $$` (block) LaTeX delimiters only — never `\\(`, `\\[`, or MathML.\n' +
    '- Keep each bullet self-contained — a reader should understand it without having read the previous bullet.\n' +
    '- Aim for a useful density: enough bullets to cover the material, but no filler or restating of the same point.\n\n' +
    'Text to summarize:\n\n---\n' +
    text +
    '\n---'

  return streamChat(
    win,
    [{ role: 'user', content: prompt }],
    model,
    text
  )
}

async function explain(win: BrowserWindow, text: string, model: string): Promise<string> {
  return streamChat(
    win,
    [{ role: 'user', content: `Please explain the following text in simple, easy-to-understand terms. Break down complex concepts and use analogies if helpful:\n\n${text}` }],
    model,
    text
  )
}

export function registerOpenAIHandlers(): void {
  ipcMain.handle('ai:get-config', () => publicConfig())
  ipcMain.handle('ai:save-config', (_, args: SaveConfigArgs) => {
    saveConfig(args)
    return publicConfig()
  })
  ipcMain.handle('ai:test-config', (_, args) => testConfig(args))
  ipcMain.handle('ai:clear-config', () => { clearAll() })
  ipcMain.handle('ai:list-models', () => listModels())

  ipcMain.handle('ai:chat', (event, messages, model, context, webContext) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No window found')
    return streamChat(win, messages, model, context, webContext ?? '')
  })

  ipcMain.handle('ai:summarize', (event, text, model) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No window found')
    return summarize(win, text, model)
  })

  ipcMain.handle('ai:explain', (event, text, model) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No window found')
    return explain(win, text, model)
  })
}
