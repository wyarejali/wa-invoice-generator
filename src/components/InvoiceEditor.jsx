import { useEffect, useRef } from 'react'
import { exportPDF, exportPNG, safeFilename } from '../lib/export'
import InvoiceCard from './InvoiceCard'

/**
 * Just the document now — status, toggles, history and export all moved to the
 * properties panel. The card ref is published through `api` so the panel and
 * the command palette can trigger an export without it travelling as props.
 */
export default function InvoiceEditor({ invoice, onChange, api }) {
  const cardRef = useRef(null)

  useEffect(() => {
    if (!api) return
    api.current = {
      exportCard: async (format) => {
        if (!cardRef.current) return null
        const name = safeFilename(invoice.number)
        if (format === 'pdf') await exportPDF(cardRef.current, `${name}.pdf`)
        else await exportPNG(cardRef.current, `${name}.png`)
        return `${name}.${format}`
      },
    }
    return () => {
      api.current = {}
    }
  })

  return (
    <div className="px-4 py-6 sm:px-8">
      {/* Centering lives on the wrapper so the captured node itself has no
          auto margins — see the note in InvoiceCard. */}
      <div className="mx-auto w-full max-w-3xl">
        <InvoiceCard invoice={invoice} onChange={onChange} cardRef={cardRef} />
      </div>
    </div>
  )
}
