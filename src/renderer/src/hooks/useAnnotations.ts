import { useEffect } from 'react'
import { useAnnotationStore } from '@/stores/annotation-store'
import { useReaderStore } from '@/stores/reader-store'

export function useAnnotations() {
  const { currentBook } = useReaderStore()
  const { loadAnnotations, annotations } = useAnnotationStore()

  useEffect(() => {
    if (currentBook) {
      loadAnnotations(currentBook.id)
    }
  }, [currentBook?.id, loadAnnotations])

  return { annotations }
}
