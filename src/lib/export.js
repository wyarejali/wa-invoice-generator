// html-to-image and jsPDF together are ~380 kB; they are pulled in on the
// first export rather than in the initial bundle.

/**
 * Give the browser a chance to paint the chrome-free state before snapshotting.
 *
 * requestAnimationFrame is the accurate signal, but a backgrounded or hidden
 * tab never fires it — so it races a timer, and the export completes either
 * way instead of hanging.
 */
function settle(timeout = 120) {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    requestAnimationFrame(() => requestAnimationFrame(finish))
    setTimeout(finish, timeout)
  })
}

/**
 * Capture `node` as a PNG data URL with all UI chrome hidden.
 *
 * html-to-image clones the node into an off-screen iframe, so anything that
 * depends on live layout (scroll position, hover state) must be settled first
 * — hence the class toggle and the settle() wait before the capture.
 */
/**
 * html-to-image inlines computed styles element by element and does not carry
 * `::placeholder`, so the CSS that hides placeholders on screen has no effect
 * on the clone. Blank the attributes for the duration of the capture instead.
 */
function suppressPlaceholders(node) {
  const fields = node.querySelectorAll('[placeholder]')
  const saved = []
  fields.forEach((el) => {
    saved.push([el, el.getAttribute('placeholder')])
    el.setAttribute('placeholder', '')
  })
  return () => saved.forEach(([el, value]) => el.setAttribute('placeholder', value))
}

async function capture(node, { scale = 2, background = '#ffffff' } = {}) {
  node.classList.add('exporting')
  const restorePlaceholders = suppressPlaceholders(node)
  await settle()

  try {
    const { toPng } = await import('html-to-image')
    const rect = node.getBoundingClientRect()
    const dataUrl = await toPng(node, {
      pixelRatio: scale,
      backgroundColor: background,
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
      cacheBust: true,
      // Skip anything still marked as chrome that CSS did not catch.
      filter: (el) => !(el.dataset && el.dataset.chrome !== undefined),
    })
    return { dataUrl, width: rect.width, height: rect.height }
  } finally {
    restorePlaceholders()
    node.classList.remove('exporting')
  }
}

function triggerDownload(dataUrl, filename) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export async function exportPNG(node, filename = 'invoice.png') {
  const { dataUrl } = await capture(node)
  triggerDownload(dataUrl, filename)
  return dataUrl
}

export async function exportPDF(node, filename = 'invoice.pdf') {
  const { dataUrl, width, height } = await capture(node)
  const { jsPDF } = await import('jspdf')

  // Fit the capture onto US Letter with a uniform margin, keeping the aspect
  // ratio; a very tall invoice is scaled down rather than clipped.
  const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 36

  const maxW = pageW - margin * 2
  const maxH = pageH - margin * 2
  const ratio = Math.min(maxW / width, maxH / height)
  const w = width * ratio
  const h = height * ratio
  const x = (pageW - w) / 2
  const y = margin

  pdf.addImage(dataUrl, 'PNG', x, y, w, h, undefined, 'FAST')
  pdf.save(filename)
}

/** "#260819" -> "invoice-260819" — safe for a filename on any platform. */
export function safeFilename(number) {
  const slug = String(number || 'invoice')
    .replace(/^#/, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `invoice-${slug || 'untitled'}`
}
