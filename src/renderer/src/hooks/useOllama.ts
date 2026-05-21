import { useEffect } from 'react'
import { useAIStore } from '@/stores/ai-store'

/**
 * Kept as `useOllama` only for backwards compatibility with call sites
 * written before we switched to OpenAI. Loads the user's stored key
 * status + model list on mount.
 *
 * @deprecated Prefer `useAIStore()` directly and rename this hook later.
 */
export function useOllama(): {
  isConfigured: boolean
  models: string[]
  selectedModel: string
} {
  const { refreshConfig, isConfigured, models, selectedModel } = useAIStore()

  useEffect(() => {
    refreshConfig()
  }, [refreshConfig])

  return { isConfigured, models, selectedModel }
}
