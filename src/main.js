import QRCode from 'qrcode'
import '@material/web/textfield/outlined-text-field.js'
import '@material/web/button/filled-button.js'
import '@material/web/button/outlined-button.js'
import '@material/web/icon/icon.js'
import contentCopy from '@material-symbols/svg-400/rounded/content_copy.svg?raw'
import download from '@material-symbols/svg-400/rounded/download.svg?raw'
import check from '@material-symbols/svg-400/rounded/check.svg?raw'
import error from '@material-symbols/svg-400/rounded/error.svg?raw'
import qrCode2 from '@material-symbols/svg-400/rounded/qr_code_2.svg?raw'

const PREVIEW_PX = 208
const EXPORT_PX = 1024
const QUIET = 4
const MODULE_RADIUS = 0.3
const BADGE = 0.22
const INK = '#1f1f1f'
const PAPER = '#fdfdfe'
const FLASH_MS = 1600
const MAX_STEM = 60
const LEVELS = [['H', true], ['L', false]]
const BADGE_DOTS = [
  [37, 37, '#ea4335'],
  [91, 37, '#fbbc04'],
  [37, 91, '#34a853'],
  [91, 91, '#4285f4'],
]

const ICONS = { content_copy: contentCopy, download, check, error, qr_code_2: qrCode2 }
const MSG = {
  empty: ['qr_code_2', 'Enter text or a link to make a code.'],
  error: ['error', 'This text is too long for a QR code.'],
}

const $ = (sel) => document.querySelector(sel)
const tile = $('#qrcode')
const canvas = $('#qrCanvas')
const tileMsg = $('#tileMsg')
const tileText = $('#tileText')
const field = $('#text')
const copyBtn = $('#copyBtn')
const copyLabel = $('#copyLabel')
const downloadBtn = $('#downloadBtn')
const status = $('#status')

const parser = new DOMParser()
let code = null
let frame = 0
let flashTimer = 0

const svgIcon = (name) => {
  const svg = parser.parseFromString(ICONS[name], 'image/svg+xml').documentElement
  svg.removeAttribute('width')
  svg.removeAttribute('height')
  svg.setAttribute('aria-hidden', 'true')
  return document.importNode(svg, true)
}

const setIcon = (el, name) => {
  el.dataset.icon = name
  el.replaceChildren(svgIcon(name))
}

const swapIcon = (el, name) => {
  const next = document.createElement('md-icon')
  next.slot = el.slot
  setIcon(next, name)
  el.replaceWith(next)
  return next
}

const encode = (text) => {
  for (const [level, badge] of LEVELS) {
    try {
      return { text, qr: QRCode.create(text, { errorCorrectionLevel: level }), badge }
    } catch {
      // too long for this level, try the next one
    }
  }
  return null
}

const paint = (target, { qr, badge }, px) => {
  const size = qr.modules.size
  const m = px / (size + QUIET * 2)
  const k = badge ? Math.round(size * BADGE) + ((size - Math.round(size * BADGE)) % 2) : 0
  const lo = (size - k) / 2
  const hi = lo + k
  const inFinder = (r, c) => (r < 7 && (c < 7 || c >= size - 7)) || (r >= size - 7 && c < 7)
  const inBadge = (r, c) => k > 0 && r >= lo && r < hi && c >= lo && c < hi

  target.width = target.height = px
  const ctx = target.getContext('2d')
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, px, px)
  ctx.fillStyle = INK

  ctx.beginPath()
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!qr.modules.get(r, c) || inFinder(r, c) || inBadge(r, c)) continue
      ctx.roundRect((c + QUIET) * m, (r + QUIET) * m, m, m, m * MODULE_RADIUS)
    }
  }
  ctx.fill()

  for (const [r, c] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    const x = (c + QUIET) * m
    const y = (r + QUIET) * m
    ctx.beginPath()
    ctx.roundRect(x, y, 7 * m, 7 * m, 2.2 * m)
    ctx.roundRect(x + m, y + m, 5 * m, 5 * m, 1.4 * m)
    ctx.fill('evenodd')
    ctx.beginPath()
    ctx.roundRect(x + 2 * m, y + 2 * m, 3 * m, 3 * m, m)
    ctx.fill()
  }

  // four Google-colour dots, kept free of finder-like rings so scanners do not misread them
  const unit = (k * m) / 128
  const origin = (lo + QUIET) * m
  for (const [x, y, fill] of k > 0 ? BADGE_DOTS : []) {
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.arc(origin + x * unit, origin + y * unit, 21 * unit, 0, Math.PI * 2)
    ctx.fill()
  }
}

const exportCanvas = () => {
  const out = document.createElement('canvas')
  const total = code.qr.modules.size + QUIET * 2
  paint(out, code, Math.ceil(EXPORT_PX / total) * total)
  return out
}

const toBlob = (el) =>
  new Promise((ok, fail) => el.toBlob((b) => (b ? ok(b) : fail(new Error('Empty image'))), 'image/png'))

const fileName = (text) => {
  try {
    const { hostname } = new URL(text)
    const stem = hostname.replace(/^www\./, '').replace(/[^a-z0-9.-]+/gi, '-').slice(0, MAX_STEM)
    return stem ? `qr-${stem}.png` : 'qr-code.png'
  } catch {
    return 'qr-code.png'
  }
}

const setState = (state) => {
  tile.dataset.state = state
  const msg = MSG[state]
  tileMsg.hidden = !msg
  if (msg) {
    setIcon($('#tileIcon'), msg[0])
    tileText.textContent = msg[1]
  }
  field.error = state === 'error'
  copyBtn.disabled = downloadBtn.disabled = state !== 'ready'
}

const render = () => {
  frame = 0
  const text = field.value.trim()
  code = text ? encode(text) : null
  if (!text) return setState('empty')
  if (!code) return setState('error')
  paint(canvas, code, Math.round(PREVIEW_PX * (window.devicePixelRatio || 1)))
  canvas.setAttribute('aria-label', `QR code for ${text.length > 80 ? `${text.slice(0, 80)}…` : text}`)
  setState('ready')
}

const schedule = () => {
  if (!frame) frame = requestAnimationFrame(render)
}

const flash = (ok) => {
  clearTimeout(flashTimer)
  const icon = copyBtn.querySelector('md-icon[slot="icon"]')
  swapIcon(icon, ok ? 'check' : 'error')
  copyLabel.textContent = ok ? 'Copied' : 'Not copied'
  status.textContent = ok ? 'QR code copied to clipboard.' : 'Could not copy. Use Download instead.'
  flashTimer = setTimeout(() => {
    swapIcon(copyBtn.querySelector('md-icon[slot="icon"]'), 'content_copy')
    copyLabel.textContent = 'Copy'
  }, FLASH_MS)
}

const copy = async () => {
  if (!code) return
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': toBlob(exportCanvas()) })])
    flash(true)
  } catch (e) {
    console.warn('Copy failed', e)
    flash(false)
  }
}

const save = async () => {
  if (!code) return
  try {
    const url = URL.createObjectURL(await toBlob(exportCanvas()))
    const a = Object.assign(document.createElement('a'), { href: url, download: fileName(code.text) })
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    status.textContent = 'QR code download started.'
  } catch (e) {
    console.warn('Download failed', e)
    status.textContent = 'Could not save the image.'
  }
}

const tabUrl = () =>
  new Promise((ok) => {
    if (!globalThis.chrome?.tabs?.query) return ok(new URLSearchParams(location.search).get('text') ?? '')
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) =>
      ok(chrome.runtime.lastError ? '' : tabs?.[0]?.url ?? ''),
    )
  })

document.querySelectorAll('md-icon[data-icon]').forEach((el) => setIcon(el, el.dataset.icon))

field.addEventListener('input', schedule)
copyBtn.addEventListener('click', copy)
downloadBtn.addEventListener('click', save)

field.value = await tabUrl()
render()
await field.updateComplete
field.focus()
field.select()
