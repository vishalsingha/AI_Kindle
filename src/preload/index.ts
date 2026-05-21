import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { pathToFileURL } from 'url'

const api = {
  pickPDFs: (): Promise<string[]> => ipcRenderer.invoke('file:pick-pdfs'),
  pickFolderPDFs: (): Promise<string[]> => ipcRenderer.invoke('file:pick-folder-pdfs'),
  resolveDroppedPaths: (paths: string[]): Promise<string[]> =>
    ipcRenderer.invoke('file:resolve-dropped', paths),
  inspectPDF: (filePath: string): Promise<any> => ipcRenderer.invoke('file:inspect', filePath),
  importOne: (filePath: string, opts?: { title?: string }): Promise<any> => ipcRenderer.invoke('file:import-one', filePath, opts),
  listBooks: (): Promise<any[]> => ipcRenderer.invoke('file:list-books'),
  markBookOpened: (id: string): Promise<void> => ipcRenderer.invoke('db:mark-opened', id),
  deleteBook: (id: string): Promise<void> => ipcRenderer.invoke('file:delete-book', id),
  readPDFFile: (filepath: string): Promise<Uint8Array> => ipcRenderer.invoke('file:read-pdf', filepath),
  revealInFinder: (filepath: string): Promise<void> => ipcRenderer.invoke('file:reveal-in-finder', filepath),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('file:open-external', url),
  storageUsage: (): Promise<{ totalFiles: number; totalSize: number }> => ipcRenderer.invoke('file:storage-usage'),
  updateBook: (id: string, data: any): Promise<void> => ipcRenderer.invoke('db:update-book', id, data),

  getAnnotations: (bookId: string): Promise<any[]> => ipcRenderer.invoke('db:get-annotations', bookId),
  saveAnnotation: (annotation: any): Promise<any> => ipcRenderer.invoke('db:save-annotation', annotation),
  deleteAnnotation: (id: string): Promise<void> => ipcRenderer.invoke('db:delete-annotation', id),
  exportAnnotations: (bookId: string): Promise<string> => ipcRenderer.invoke('db:export-annotations', bookId),
  exportAnnotatedPDF: (bookId: string): Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('pdf:export-annotated', bookId),

  setBookStatus: (bookId: string, status: 'todo' | 'done'): Promise<void> => ipcRenderer.invoke('db:set-status', bookId, status),

  getConversations: (bookId: string): Promise<any[]> => ipcRenderer.invoke('db:get-conversations', bookId),
  createConversation: (bookId: string): Promise<any> => ipcRenderer.invoke('db:create-conversation', bookId),
  getMessages: (conversationId: string): Promise<any[]> => ipcRenderer.invoke('db:get-messages', conversationId),
  addMessage: (conversationId: string, role: string, content: string): Promise<any> => ipcRenderer.invoke('db:add-message', conversationId, role, content),
  deleteConversation: (id: string): Promise<void> => ipcRenderer.invoke('db:delete-conversation', id),
  renameConversation: (id: string, title: string): Promise<any> => ipcRenderer.invoke('db:rename-conversation', id, title),

  getBookNote: (bookId: string): Promise<string> => ipcRenderer.invoke('db:get-book-note', bookId),
  saveBookNote: (bookId: string, content: string): Promise<void> => ipcRenderer.invoke('db:save-book-note', bookId, content),

  listNotes: (bookId: string): Promise<any[]> => ipcRenderer.invoke('db:list-notes', bookId),
  getNote: (id: string): Promise<any | null> => ipcRenderer.invoke('db:get-note', id),
  createNote: (bookId: string, title?: string): Promise<any> => ipcRenderer.invoke('db:create-note', bookId, title),
  updateNoteContent: (id: string, content: string): Promise<any | null> => ipcRenderer.invoke('db:update-note-content', id, content),
  renameNote: (id: string, title: string): Promise<any | null> => ipcRenderer.invoke('db:rename-note', id, title),
  deleteNote: (id: string): Promise<void> => ipcRenderer.invoke('db:delete-note', id),

  chat: (messages: any[], model: string, context: string, webContext?: string): Promise<string> => ipcRenderer.invoke('ai:chat', messages, model, context, webContext ?? ''),
  webSearch: (query: string, maxResults?: number): Promise<Array<{ title: string; url: string; snippet: string }>> => ipcRenderer.invoke('web:search', query, maxResults),
  summarize: (text: string, model: string): Promise<string> => ipcRenderer.invoke('ai:summarize', text, model),
  explain: (text: string, model: string): Promise<string> => ipcRenderer.invoke('ai:explain', text, model),
  listModels: (): Promise<string[]> => ipcRenderer.invoke('ai:list-models'),
  getAIConfig: (): Promise<any> => ipcRenderer.invoke('ai:get-config'),
  saveAIConfig: (args: any): Promise<any> => ipcRenderer.invoke('ai:save-config', args),
  testAIConfig: (args: any): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('ai:test-config', args),
  clearAIConfig: (): Promise<void> => ipcRenderer.invoke('ai:clear-config'),

  onAIStream: (callback: (chunk: string) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, chunk: string): void => callback(chunk)
    ipcRenderer.on('ai:stream-chunk', handler)
    return () => ipcRenderer.removeListener('ai:stream-chunk', handler)
  },
  onAIStreamEnd: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('ai:stream-end', handler)
    return () => ipcRenderer.removeListener('ai:stream-end', handler)
  },
  onAIStreamError: (callback: (message: string) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, message: string): void => callback(message)
    ipcRenderer.on('ai:stream-error', handler)
    return () => ipcRenderer.removeListener('ai:stream-error', handler)
  },

  getPDFUrl: (filepath: string): string => pathToFileURL(filepath).toString(),
  getThumbnailPath: (hash: string): Promise<string | null> => ipcRenderer.invoke('thumbnail:get-path', hash),
  saveThumbnail: (hash: string, data: ArrayBuffer | Uint8Array): Promise<string> => ipcRenderer.invoke('thumbnail:save', hash, data),
  toFileURL: (filepath: string): string => pathToFileURL(filepath).toString(),

  minimizeWindow: (): void => { ipcRenderer.send('window:minimize') },
  maximizeWindow: (): void => { ipcRenderer.send('window:maximize') },
  closeWindow: (): void => { ipcRenderer.send('window:close') },
  isWindowMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
  onMaximizedChanged: (cb: (maximized: boolean) => void): (() => void) => {
    const handler = (_: unknown, maximized: boolean): void => cb(maximized)
    ipcRenderer.on('window:maximized-changed', handler)
    return () => ipcRenderer.removeListener('window:maximized-changed', handler)
  },
  getPlatform: (): string => process.platform
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('api', api)
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
