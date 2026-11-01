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

/**
 * Re-fit the auto-growing textareas.
 *
 * Each one carries an explicit pixel height measured against the on-screen
 * layout, where the row still has a remove button and a drag grip. Hiding that
 * chrome widens the description column, so a line that wrapped on screen now
 * fits — and the stale height prints as a blank second line. ResizeObserver
 * would correct it on the next frame, which is one frame after the capture.
 */
function refitTextareas(node) {
  const fields = node.querySelectorAll('textarea')
  const saved = []
  fields.forEach((el) => {
    saved.push([el, el.style.height])
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  })
  return () => saved.forEach(([el, height]) => { el.style.height = height })
}

async function capture(node, { scale = 2, background = '#ffffff', measure } = {}) {
  node.classList.add('exporting')
  const restorePlaceholders = suppressPlaceholders(node)
  await settle()
  const restoreHeights = refitTextareas(node)

  try {
    // Measured here, not before: hiding the chrome changes the layout, and a
    // page break has to land where the *printed* rows actually are.
    const measured = measure ? measure(node) : null
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
    return { dataUrl, width: rect.width, height: rect.height, measured }
  } finally {
    restoreHeights()
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

/**
 * Offsets, in CSS pixels from the top of the card, where a page may end
 * without cutting through something. Every line row's lower edge qualifies, as
 * does the edge of any top-level block (the header, the totals, the footer).
 */
function collectBreakpoints(node) {
  const top = node.getBoundingClientRect().top
  const points = new Set()
  const add = (el) => {
    const box = el.getBoundingClientRect()
    if (box.height > 0) points.add(box.bottom - top)
  }
  node.querySelectorAll('[data-line-row]').forEach(add)
  Array.from(node.children).forEach(add)
  return [...points].sort((a, b) => a - b)
}

/**
 * Slice a document `total` tall into pages of at most `pageHeight`, ending
 * each one at the last breakpoint that fits. A stretch taller than a page on
 * its own — one enormous line item — is cut where it has to be rather than
 * looping forever.
 */
function planPages(total, pageHeight, breaks) {
  const pages = []
  let start = 0
  while (start < total - 1) {
    const limit = start + pageHeight
    if (limit >= total) {
      pages.push([start, total])
      break
    }
    const fits = breaks.filter((b) => b > start + pageHeight * 0.2 && b <= limit)
    const end = fits.length ? fits[fits.length - 1] : limit
    pages.push([start, end])
    start = end
  }
  return pages.length ? pages : [[0, total]]
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read the captured image.'))
    img.src = src
  })
}

/**
 * A4, one page or many.
 *
 * The capture is a single tall bitmap, so each page is a slice of it drawn at
 * the same scale — the invoice is never shrunk to fit, which is what made a
 * long list unreadable.
 */
export async function exportPDF(node, filename = 'invoice.pdf') {
  const { dataUrl, width, height, measured } = await capture(node, {
    measure: collectBreakpoints,
  })
  const { jsPDF } = await import('jspdf')

  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 36

  const contentW = pageW - margin * 2
  // Points per CSS pixel: the width always fills the page, and that fixes the
  // scale for everything else.
  const scale = contentW / width
  const pageContentH = (pageH - margin * 2) / scale

  const pages = planPages(height, pageContentH, measured || [])
  const image = await loadImage(dataUrl)
  const density = image.height / height

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  pages.forEach(([from, to], index) => {
    if (index > 0) pdf.addPage()
    const sliceH = to - from
    canvas.width = Math.max(1, Math.round(width * density))
    canvas.height = Math.max(1, Math.round(sliceH * density))
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(
      image,
      0,
      Math.round(from * density),
      canvas.width,
      canvas.height,
      0,
      0,
      canvas.width,
      canvas.height,
    )
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin, contentW, sliceH * scale, undefined, 'FAST')
  })

  pdf.save(filename)
  return pages.length
}

/** "#260819" -> "invoice-260819" — safe for a filename on any platform. */
export function safeFilename(number) {
  const slug = String(number || 'invoice')
    .replace(/^#/, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `invoice-${slug || 'untitled'}`
}
