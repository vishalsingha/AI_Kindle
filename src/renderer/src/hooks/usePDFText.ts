import { useState, useCallback } from 'react'
import { pdfjs } from 'react-pdf'
import { configurePdfWorker } from '@/lib/pdf-setup'

configurePdfWorker()

export function usePDFText(pdfUrl: string | null) {
  const [extracting, setExtracting] = useState(false)

  const extractPageText = useCallback(async (pageNumber: number): Promise<string> => {
    if (!pdfUrl) return ''

    try {
      setExtracting(true)
      const loadingTask = pdfjs.getDocument(pdfUrl)
      const pdf = await loadingTask.promise
      const page = await pdf.getPage(pageNumber)
      const textContent = await page.getTextContent()
      const text = textContent.items
        .map((item: any) => item.str)
        .join(' ')
      setExtracting(false)
      return text
    } catch {
      setExtracting(false)
      return ''
    }
  }, [pdfUrl])

  const extractAllText = useCallback(async (): Promise<string> => {
    if (!pdfUrl) return ''

    try {
      setExtracting(true)
      const loadingTask = pdfjs.getDocument(pdfUrl)
      const pdf = await loadingTask.promise
      const texts: string[] = []

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const textContent = await page.getTextContent()
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ')
        texts.push(pageText)
      }

      setExtracting(false)
      return texts.join('\n\n')
    } catch {
      setExtracting(false)
      return ''
    }
  }, [pdfUrl])

  return { extractPageText, extractAllText, extracting }
}
