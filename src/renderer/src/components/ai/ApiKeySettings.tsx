import { useEffect, useState } from 'react'
import { Key, Check, AlertCircle, ExternalLink, Eye, EyeOff, Trash2, Plus, X } from 'lucide-react'
import { useAIStore, type AIProvider } from '@/stores/ai-store'
import { cn } from '@/lib/utils'

/**
 * Inline settings surface for AI provider credentials. The user picks
 * between OpenAI (cloud) or Azure OpenAI, fills in the appropriate
 * fields, and AI Kindle validates the credentials before persisting.
 *
 * - `onboarding` mode takes over the AI panel body when no key is saved.
 * - `editing` mode is shown when the user clicks the gear in the header
 *   to change keys or switch providers.
 */
interface Props {
  mode: 'onboarding' | 'editing'
  onDone?: () => void
}

export function ApiKeySettings({ mode, onDone }: Props) {
  const { config, saveConfig, clearConfig } = useAIStore()

  // Local form state — seeded from the persisted config but edited freely.
  const [provider, setProvider] = useState<AIProvider>(config.provider)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)

  // OpenAI fields
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState(config.openai.baseUrl)

  // Azure fields
  const [azureEndpoint, setAzureEndpoint] = useState(config.azure.endpoint)
  const [azureApiVersion, setAzureApiVersion] = useState(config.azure.apiVersion)
  const [deployments, setDeployments] = useState<string[]>(
    config.azure.deployments.length > 0 ? config.azure.deployments : ['']
  )

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-sync local form when the store config changes (e.g. after saving).
  useEffect(() => {
    setProvider(config.provider)
    setOpenaiBaseUrl(config.openai.baseUrl)
    setAzureEndpoint(config.azure.endpoint)
    setAzureApiVersion(config.azure.apiVersion)
    setDeployments(config.azure.deployments.length > 0 ? config.azure.deployments : [''])
  }, [config])

  const updateDeployment = (i: number, value: string): void => {
    setDeployments(prev => prev.map((d, idx) => (idx === i ? value : d)))
  }

  const addDeployment = (): void => setDeployments(prev => [...prev, ''])

  const removeDeployment = (i: number): void => {
    setDeployments(prev => (prev.length === 1 ? [''] : prev.filter((_, idx) => idx !== i)))
  }

  const handleSave = async (): Promise<void> => {
    setError(null)
    const trimmedKey = apiKey.trim()

    // When editing with no new key typed, we must have an existing stored key.
    if (!trimmedKey && !config.hasKey) {
      setError('API key is required.')
      return
    }

    if (provider === 'azure') {
      if (!azureEndpoint.trim()) {
        setError('Azure endpoint is required.')
        return
      }
      const cleanDeployments = deployments.map(d => d.trim()).filter(Boolean)
      if (cleanDeployments.length === 0) {
        setError('Add at least one deployment name.')
        return
      }
    }

    setBusy(true)
    const result = await saveConfig({
      provider,
      apiKey: trimmedKey || undefined, // keep existing key if left blank
      openai: provider === 'openai' ? { baseUrl: openaiBaseUrl.trim() } : undefined,
      azure: provider === 'azure'
        ? {
            endpoint: azureEndpoint.trim(),
            apiVersion: azureApiVersion.trim(),
            deployments: deployments.map(d => d.trim()).filter(Boolean)
          }
        : undefined
    })
    setBusy(false)

    if (!result.ok) {
      setError(result.error ?? 'Could not validate credentials.')
      return
    }
    setApiKey('')
    onDone?.()
  }

  const handleRemove = async (): Promise<void> => {
    if (!confirm('Remove the saved AI credentials? You can add them again later.')) return
    await clearConfig()
  }

  const showStoredKey = mode === 'editing' && config.hasKey && config.maskedKey

  return (
    <div className="p-4 space-y-3">
      {mode === 'onboarding' && (
        <div className="flex flex-col items-center text-center mb-1">
          <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center mb-2">
            <Key className="w-5 h-5 text-primary" />
          </div>
          <h3 className="text-sm font-semibold">Connect your AI provider</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            Paste your credentials to enable summarizing, explaining, and chatting about your PDFs. Everything is encrypted and stored locally.
          </p>
        </div>
      )}

      {showStoredKey && (
        <div className="flex items-center justify-between rounded-lg bg-secondary/60 border border-border px-3 py-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Key className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <span className="font-mono truncate">{config.maskedKey}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">
              ({config.provider === 'azure' ? 'Azure' : 'OpenAI'})
            </span>
          </div>
          <button
            onClick={handleRemove}
            className="shrink-0 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Remove saved credentials"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Provider picker */}
      <div className="flex items-center gap-1 bg-secondary/40 p-0.5 rounded-lg">
        {(['openai', 'azure'] as const).map(p => (
          <button
            key={p}
            type="button"
            onClick={() => setProvider(p)}
            className={cn(
              'flex-1 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all',
              provider === p
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {p === 'openai' ? 'OpenAI' : 'Azure OpenAI'}
          </button>
        ))}
      </div>

      {/* API key — used by both providers */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">
          {showStoredKey ? 'Replace with a new key (optional)' : 'API Key'}
        </label>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={provider === 'azure' ? 'Azure OpenAI key' : 'sk-…'}
            className="w-full pl-3 pr-9 py-2 bg-secondary/60 border border-border rounded-lg text-xs font-mono placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => setShowKey((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
            title={showKey ? 'Hide key' : 'Show key'}
          >
            {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* OpenAI-only fields */}
      {provider === 'openai' && (
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">
            Base URL (advanced — leave default for openai.com)
          </label>
          <input
            type="text"
            value={openaiBaseUrl}
            onChange={(e) => setOpenaiBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="w-full px-3 py-2 bg-secondary/60 border border-border rounded-lg text-xs font-mono placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
            spellCheck={false}
          />
        </div>
      )}

      {/* Azure-only fields */}
      {provider === 'azure' && (
        <>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Endpoint</label>
            <input
              type="text"
              value={azureEndpoint}
              onChange={(e) => setAzureEndpoint(e.target.value)}
              placeholder="https://your-resource.openai.azure.com/"
              className="w-full px-3 py-2 bg-secondary/60 border border-border rounded-lg text-xs font-mono placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
              spellCheck={false}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">API version</label>
            <input
              type="text"
              value={azureApiVersion}
              onChange={(e) => setAzureApiVersion(e.target.value)}
              placeholder="2024-12-01-preview"
              className="w-full px-3 py-2 bg-secondary/60 border border-border rounded-lg text-xs font-mono placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
              spellCheck={false}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">
              Deployment names
            </label>
            <div className="space-y-1.5">
              {deployments.map((d, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={d}
                    onChange={(e) => updateDeployment(i, e.target.value)}
                    placeholder="e.g. gpt-4.1"
                    className="flex-1 px-3 py-2 bg-secondary/60 border border-border rounded-lg text-xs font-mono placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
                    spellCheck={false}
                  />
                  {deployments.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDeployment(i)}
                      className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Remove deployment"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addDeployment}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add deployment
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              The deployment name you chose when creating the model in Azure — this becomes the "model" in the chat dropdown.
            </p>
          </div>
        </>
      )}

      {error && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <p className="flex-1 text-[11px] leading-snug break-words">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={busy}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
            busy
              ? 'bg-secondary text-muted-foreground cursor-not-allowed'
              : 'bg-primary text-primary-foreground hover:opacity-90'
          )}
        >
          {busy ? (
            <>
              <div className="w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              Verifying…
            </>
          ) : (
            <>
              <Check className="w-3.5 h-3.5" />
              {mode === 'editing' ? 'Save changes' : 'Save & Connect'}
            </>
          )}
        </button>
        {mode === 'editing' && onDone && (
          <button
            onClick={onDone}
            className="px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
        {provider === 'azure' ? 'Set up a deployment at ' : 'Get a key at '}
        <a
          href={provider === 'azure'
            ? 'https://portal.azure.com'
            : 'https://platform.openai.com/api-keys'}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-dotted hover:text-foreground inline-flex items-center gap-0.5"
        >
          {provider === 'azure' ? 'Azure Portal' : 'platform.openai.com/api-keys'}
          <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </p>
    </div>
  )
}
