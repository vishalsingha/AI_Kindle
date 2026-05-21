import { useEffect } from 'react'
import { useLibraryStore } from '@/stores/library-store'

export function useLocalStorage() {
  const { loadBooks, books, loading } = useLibraryStore()

  useEffect(() => {
    loadBooks()
  }, [loadBooks])

  return { books, loading, refresh: loadBooks }
}
