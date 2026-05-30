# Configuration

AI Kindle works fully without any configuration — drop in PDFs, annotate, take notes, you're done. The pieces below are for when you want to turn on AI features or know where your data lives.

[[toc]]

## AI provider

AI features are optional. To enable them you need API credentials from one of two providers:

| Provider | What you need | Where to get it |
|---|---|---|
| **OpenAI** | An API key starting with `sk-…` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Azure OpenAI** | Endpoint + API key + API version + deployment names | Azure Portal → your OpenAI resource → Keys, Endpoint, Deployments |

### Setting up OpenAI

1. Open the AI panel (`⌘J` / `Ctrl+J` or the brain icon in the titlebar).
2. Choose **OpenAI** in the provider tabs.
3. Paste your API key.
4. (Optional) Change the **Base URL** if you're using a compatible proxy — see [Compatible endpoints](#compatible-endpoints) below.
5. Click **Save & Connect**.

AI Kindle validates the key by calling `/v1/models` and populates the model dropdown with every chat-capable model your account can use. `gpt-4o-mini` is the recommended default — fast, cheap, accurate enough for summaries and explanations.

### Setting up Azure OpenAI

Azure OpenAI's request shape is slightly different from OpenAI's. Each request routes to:

```
{endpoint}/openai/deployments/{deployment}/chat/completions?api-version={version}
```

So you need four things instead of one:

| Field | Example |
|---|---|
| **Endpoint** | `https://your-resource.openai.azure.com/` *(no trailing path)* |
| **API key** | `abc123def456…` |
| **API version** | `2024-12-01-preview` |
| **Deployments** | `gpt-4.1` (one per line, can be multiple) |

The "model" dropdown in the AI panel will show your deployment names instead of OpenAI model IDs.

::: warning Common Azure mistakes
- **Endpoint shape**: must be the *resource* URL, not a *deployment* URL. Wrong: `https://your-resource.openai.azure.com/openai/deployments/gpt-4.1`. Right: `https://your-resource.openai.azure.com/`.
- **API version mismatch**: each Azure API version supports slightly different fields. If validation fails with a 400, copy the exact version string from Azure Portal → your resource → Quotas → API versions.
- **Deployment vs model**: deployment names are user-chosen. They look like `gpt-4.1` but they're really aliases. Use the exact text shown under "Deployments" in Azure Portal, not the model ID it maps to.
:::

### How your key is stored

When you click **Save & Connect**:

1. AI Kindle calls `/models` to validate the credentials.
2. If valid, the key is encrypted with **Electron's `safeStorage`** API, which uses:
   - **macOS** — Keychain
   - **Windows** — DPAPI (Data Protection API)
   - **Linux** — `libsecret` / `kwallet`, depending on your desktop environment
3. The encrypted blob is stored in the `settings` table of your local SQLite database (`ai-kindle.db`, key `ai.apiKey.encrypted`).
4. On every AI request, the key is decrypted in-process, used for that single HTTPS call, and thrown away.

The encrypted blob is **OS-specific** — copying your `ai-kindle.db` to a different machine or OS will leave the key unreadable. You'll just re-paste it once on the new device.

### Compatible endpoints

Under the OpenAI provider, you can change the base URL to any OpenAI-compatible endpoint:

| Endpoint | Notes |
|---|---|
| `https://api.openai.com/v1` | Default. Real OpenAI. |
| `https://openrouter.ai/api/v1` | [OpenRouter](https://openrouter.ai) — single key, many models. |
| `http://localhost:4000/v1` | [LiteLLM](https://github.com/BerriAI/litellm) running locally. |
| `http://localhost:8000/v1` | Self-hosted [vLLM](https://github.com/vllm-project/vllm) or similar. |
| `https://api.groq.com/openai/v1` | Groq. Very fast inference. |
| `https://api.together.xyz/v1` | Together.ai. |

Any service implementing OpenAI's `/v1/chat/completions` SSE protocol will work. Each request goes directly from your machine to that URL — AI Kindle is just a thin client.

### Generate from highlights

In the annotation sidebar of any open book, you can multi-select highlights and click **Generate** to run a prompt template across them. Built-in templates:

- **Study notes** — convert highlights to a clean Markdown outline.
- **Flashcards** — Q/A pairs ready for Anki import.
- **Themes** — distill highlights into top recurring ideas.
- **Quiz** — questions you can use to self-test.

The templates are sent verbatim to your configured provider with the selected highlights as context.

## Where your data lives

Everything AI Kindle knows about you lives in one directory:

| Platform | Path |
|---|---|
| **macOS** | `~/Library/Application Support/ai-kindle/` |
| **Linux** | `~/.config/ai-kindle/` |
| **Windows** | `%APPDATA%\ai-kindle\` |

Inside that directory:

```text
ai-kindle.db                 SQLite — books, annotations, notes, conversations, settings
ai-kindle.db-wal             SQLite write-ahead log (managed automatically)
ai-kindle.db-shm             SQLite shared-memory file
library/                     Imported PDFs (renamed to <id>.pdf)
thumbnails/                  Cached JPEG covers
Preferences                  Window position, theme, etc.
Cache/, GPUCache/, …         Chromium caches (safe to delete when app is closed)
```

### Backing up

When the app is closed, the entire directory is a single self-contained backup. Tar it up:

```bash
sqlite3 ai-kindle.db "PRAGMA wal_checkpoint(TRUNCATE);"
tar -czf ai-kindle-backup.tgz ai-kindle.db library thumbnails
```

The first command flushes the WAL into the main DB file so the backup includes everything written up to that point.

### Resetting

Quit the app and `rm -rf` the data directory. Next launch starts fresh.

### Porting between machines

Since v1.2.0, every file path inside `ai-kindle.db` is stored as a basename (e.g. `abc123.pdf`) and resolved against the *current* machine's library directory on every read. That means you can copy the whole data directory between macOS / Linux / Windows installs and it just works — see [Syncing across devices](/guide/syncing).

## Theme

Toggle light / dark with `⌘D` (macOS) or `Ctrl+D` (Linux/Windows), or via the moon/sun icon in the titlebar. Choice is persisted to the local DB; you'll see the same theme on every launch.

## Telemetry and network

AI Kindle has **no telemetry**, **no account system**, **no sync server**, and **no background network activity** of any kind. It reads local files, writes to local SQLite, and only opens an outbound connection when you actively invoke the AI assistant — at which point the request goes directly to whichever provider you've configured (OpenAI, Azure, or any compatible endpoint).

Electron's `webSecurity` flag is disabled in the renderer so PDFs from your local library can be loaded via `file://` URLs; external URLs are never loaded by the renderer process itself.
