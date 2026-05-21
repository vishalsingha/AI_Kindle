import { ElectronAPI } from '@electron-toolkit/preload'

interface BookData {
  id: string
  hash: string
  title: string
  author: string
  filename: string
  filepath: string
  pageCount: number
  currentPage: number
  status: 'todo' | 'done'
  lastAnnotationPage: number
  annotationCount: number
  tags: string[]
  dateAdded: string
  lastRead: string | null
}

interface AnnotationData {
  id: string
  bookId: string
  type: 'highlight' | 'comment' | 'text_note' | 'underline'
  page: number
  content: string
  selectedText: string
  color: string
  rects: Array<{ x: number; y: number; width: number; height: number }>
  createdAt: string
  updatedAt: string
}

interface ConversationData {
  id: string
  bookId: string
  title: string
  createdAt: string
}

interface NoteData {
  id: string
  bookId: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

interface MessageData {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

interface WebSearchResultData {
  title: string
  url: string
  snippet: string
}

type AIProvider = 'openai' | 'azure'

interface AIConfigPublic {
  provider: AIProvider
  hasKey: boolean
  maskedKey: string | null
  openai: { baseUrl: string }
  azure: { endpoint: string; apiVersion: string; deployments: string[] }
}

interface SaveAIConfigArgs {
  provider: AIProvider
  apiKey?: string
  openai?: { baseUrl?: string }
  azure?: { endpoint?: string; apiVersion?: string; deployments?: string[] }
}

interface TestAIConfigArgs {
  provider: AIProvider
  apiKey: string
  openai?: { baseUrl?: string }
  azure?: { endpoint?: string; apiVersion?: string }
}

interface InspectResult {
  filePath: string
  filename: string
  suggestedTitle: string
  hash: string
  duplicateByHash: BookData | null
  duplicateByTitle: BookData | null
}

interface API {
  pickPDFs: () => Promise<string[]>
  pickFolderPDFs: () => Promise<string[]>
  resolveDroppedPaths: (paths: string[]) => Promise<string[]>
  inspectPDF: (filePath: string) => Promise<InspectResult>
  importOne: (filePath: string, opts?: { title?: string }) => Promise<BookData | null>
  listBooks: () => Promise<BookData[]>
  markBookOpened: (id: string) => Promise<void>
  deleteBook: (id: string) => Promise<void>
  readPDFFile: (filepath: string) => Promise<Uint8Array>
  revealInFinder: (filepath: string) => Promise<void>
  openExternal: (url: string) => Promise<void>
  storageUsage: () => Promise<{ totalFiles: number; totalSize: number }>
  updateBook: (id: string, data: Partial<BookData>) => Promise<void>

  getAnnotations: (bookId: string) => Promise<AnnotationData[]>
  saveAnnotation: (annotation: Partial<AnnotationData>) => Promise<AnnotationData>
  deleteAnnotation: (id: string) => Promise<void>
  exportAnnotations: (bookId: string) => Promise<string>
  exportAnnotatedPDF: (bookId: string) => Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>

  setBookStatus: (bookId: string, status: 'todo' | 'done') => Promise<void>

  getConversations: (bookId: string) => Promise<ConversationData[]>
  createConversation: (bookId: string) => Promise<ConversationData>
  getMessages: (conversationId: string) => Promise<MessageData[]>
  addMessage: (conversationId: string, role: string, content: string) => Promise<MessageData>
  deleteConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<ConversationData>

  getBookNote: (bookId: string) => Promise<string>
  saveBookNote: (bookId: string, content: string) => Promise<void>

  listNotes: (bookId: string) => Promise<NoteData[]>
  getNote: (id: string) => Promise<NoteData | null>
  createNote: (bookId: string, title?: string) => Promise<NoteData>
  updateNoteContent: (id: string, content: string) => Promise<NoteData | null>
  renameNote: (id: string, title: string) => Promise<NoteData | null>
  deleteNote: (id: string) => Promise<void>

  chat: (messages: Array<{ role: string; content: string }>, model: string, context: string, webContext?: string) => Promise<string>
  webSearch: (query: string, maxResults?: number) => Promise<WebSearchResultData[]>
  summarize: (text: string, model: string) => Promise<string>
  explain: (text: string, model: string) => Promise<string>
  listModels: () => Promise<string[]>
  getAIConfig: () => Promise<AIConfigPublic>
  saveAIConfig: (args: SaveAIConfigArgs) => Promise<AIConfigPublic>
  testAIConfig: (args: TestAIConfigArgs) => Promise<{ ok: boolean; error?: string }>
  clearAIConfig: () => Promise<void>

  onAIStream: (callback: (chunk: string) => void) => () => void
  onAIStreamEnd: (callback: () => void) => () => void
  onAIStreamError: (callback: (message: string) => void) => () => void

  getPDFUrl: (filepath: string) => string
  getThumbnailPath: (hash: string) => Promise<string | null>
  saveThumbnail: (hash: string, data: ArrayBuffer | Uint8Array) => Promise<string>
  toFileURL: (filepath: string) => string

  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void
  getPlatform: () => string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}
