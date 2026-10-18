import QRCode from 'qrcode'
import '@material/web/textfield/outlined-text-field.js'
import '@material/web/button/filled-button.js'
import '@material/web/button/outlined-button.js'
import '@material/web/iconbutton/icon-button.js'
import '@material/web/select/outlined-select.js'
import '@material/web/select/select-option.js'
import '@material/web/switch/switch.js'
import '@material/web/icon/icon.js'
import contentCopy from '@material-symbols/svg-400/rounded/content_copy.svg?raw'
import download from '@material-symbols/svg-400/rounded/download.svg?raw'
import check from '@material-symbols/svg-400/rounded/check.svg?raw'
import error from '@material-symbols/svg-400/rounded/error.svg?raw'
import qrCode2 from '@material-symbols/svg-400/rounded/qr_code_2.svg?raw'
import tune from '@material-symbols/svg-400/rounded/tune.svg?raw'
import close from '@material-symbols/svg-400/rounded/close.svg?raw'

const PREVIEW_PX = 208
const QUIET = 4
const MODULE_RADIUS = 0.3
const BADGE = 0.22
const PAPER = '#fdfdfe'
const MIN_CONTRAST = 4.5
const FLASH_MS = 1600
const MAX_STEM = 60
const PREF_KEY = 'qr-style'
const HEX = /^#[0-9a-f]{6}$/i
const LEVELS = ['L', 'M', 'Q', 'H']
const LEVEL_NAMES = { L: 'Low', M: 'Medium', Q: 'Quartile', H: 'High' }
const DOT_LEVELS = new Set(['Q', 'H'])
const SIZES = [256, 512, 1024, 2048]
const FORMATS = ['png', 'svg']
const DEFAULTS = { color: '#1f1f1f', level: 'H', size: 1024, format: 'png', dots: true, panel: false }
const BADGE_DOTS = [
  [37, 37, '#ea4335'],
  [91, 37, '#fbbc04'],
  [37, 91, '#34a853'],
  [91, 91, '#4285f4'],
]

const ICONS = { content_copy: contentCopy, download, check, error, qr_code_2: qrCode2, tune, close }
const MSG = {
  empty: ['qr_code_2', 'Enter text or a link to make a code.'],
  error: ['error', 'This text is too long for a QR code.'],
}

const $ = (sel) => document.querySelector(sel)
const popup = $('#popup')
const tile = $('#qrcode')
const canvas = $('#qrCanvas')
const tileMsg = $('#tileMsg')
const tileText = $('#tileText')
const field = $('#text')
const copyBtn = $('#copyBtn')
const copyLabel = $('#copyLabel')
const downloadBtn = $('#downloadBtn')
const downloadLabel = $('#downloadLabel')
const styleBtn = $('#styleBtn')
const panel = $('#stylePanel')
const radios = [...document.querySelectorAll('input[name="color"]')]
const customSwatch = $('#customSwatch')
const customColor = $('#customColor')
const contrastHint = $('#contrastHint')
const levelSel = $('#level')
const sizeSel = $('#size')
const formatSel = $('#format')
const dotsSwitch = $('#dots')
const dotsHint = $('#dotsHint')
const status = $('#status')

const parser = new DOMParser()
let prefs = { ...DEFAULTS }
let code = null
let frame = 0
let flashTimer = 0

const loadPrefs = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}')
    return {
      color: HEX.test(raw.color) ? raw.color.toLowerCase() : DEFAULTS.color,
      level: LEVELS.includes(raw.level) ? raw.level : DEFAULTS.level,
      size: SIZES.includes(raw.size) ? raw.size : DEFAULTS.size,
      format: FORMATS.includes(raw.format) ? raw.format : DEFAULTS.format,
      dots: typeof raw.dots === 'boolean' ? raw.dots : DEFAULTS.dots,
      panel: raw.panel === true,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

const savePrefs = () => {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs))
  } catch {
    // storage blocked: keep the choice for this session only
  }
}

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

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
}

const layout = (qr, dots) => {
  const size = qr.modules.size
  const raw = Math.round(size * BADGE)
  const k = dots ? raw + ((size - raw) % 2) : 0
  const lo = (size - k) / 2
  const inFinder = (r, c) => (r < 7 && (c < 7 || c >= size - 7)) || (r >= size - 7 && c < 7)
  const inBadge = (r, c) => k > 0 && r >= lo && r < lo + k && c >= lo && c < lo + k
  const cells = []
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (qr.modules.get(r, c) && !inFinder(r, c) && !inBadge(r, c)) cells.push([r, c])
    }
  }
  return { size, cells, finders: [[0, 0], [0, size - 7], [size - 7, 0]], badge: k ? { lo, k } : null }
}

const encode = (text) => {
  for (const level of LEVELS.slice(0, LEVELS.indexOf(prefs.level) + 1).reverse()) {
    try {
      const qr = QRCode.create(text, { errorCorrectionLevel: level })
      return { text, level, map: layout(qr, prefs.dots && DOT_LEVELS.has(level)) }
    } catch {
      // too long for this level, try a lower one
    }
  }
  return null
}

const paint = (target, { size, cells, finders, badge }, color, px) => {
  const fit = px / (size + QUIET * 2)
  const m = fit >= 2 ? Math.floor(fit) : fit
  const off = Math.round((px - m * size) / 2)

  target.width = target.height = px
  const ctx = target.getContext('2d')
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, px, px)
  ctx.fillStyle = color

  ctx.beginPath()
  for (const [r, c] of cells) ctx.roundRect(off + c * m, off + r * m, m, m, m * MODULE_RADIUS)
  ctx.fill()

  for (const [r, c] of finders) {
    const x = off + c * m
    const y = off + r * m
    ctx.beginPath()
    ctx.roundRect(x, y, 7 * m, 7 * m, 2.2 * m)
    ctx.roundRect(x + m, y + m, 5 * m, 5 * m, 1.4 * m)
    ctx.fill('evenodd')
    ctx.beginPath()
    ctx.roundRect(x + 2 * m, y + 2 * m, 3 * m, 3 * m, m)
    ctx.fill()
  }

  // four Google-colour dots, kept free of finder-like rings so scanners do not misread them
  if (!badge) return
  const unit = (badge.k * m) / 128
  const origin = off + badge.lo * m
  for (const [x, y, fill] of BADGE_DOTS) {
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.arc(origin + x * unit, origin + y * unit, 21 * unit, 0, Math.PI * 2)
    ctx.fill()
  }
}

const num = (v) => +v.toFixed(3)

const roundRectPath = (x, y, s, r) =>
  `M${num(x + r)} ${num(y)}h${num(s - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}v${num(s - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${r}` +
  `h${num(2 * r - s)}a${r} ${r} 0 0 1 ${-r} ${-r}v${num(2 * r - s)}a${r} ${r} 0 0 1 ${r} ${-r}z`

const toSvg = ({ size, cells, finders, badge }, color, px) => {
  const total = size + QUIET * 2
  const at = (v) => v + QUIET
  const mods = cells.map(([r, c]) => `<rect x="${at(c)}" y="${at(r)}" width="1" height="1" rx="${MODULE_RADIUS}"/>`)
  const eyes = finders.map(
    ([r, c]) =>
      `<path fill-rule="evenodd" d="${roundRectPath(at(c), at(r), 7, 2.2)}${roundRectPath(at(c) + 1, at(r) + 1, 5, 1.4)}"/>` +
      `<rect x="${at(c) + 2}" y="${at(r) + 2}" width="3" height="3" rx="1"/>`,
  )
  const dots = badge
    ? BADGE_DOTS.map(([x, y, fill]) => {
        const unit = badge.k / 128
        return `<circle cx="${num(at(badge.lo) + x * unit)}" cy="${num(at(badge.lo) + y * unit)}" r="${num(21 * unit)}" fill="${fill}"/>`
      })
    : []
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${total} ${total}">` +
    `<rect width="${total}" height="${total}" fill="${PAPER}"/>` +
    `<g fill="${color}">${mods.join('')}${eyes.join('')}</g>${dots.join('')}</svg>`
  )
}

const pngBlob = (px) =>
  new Promise((ok, fail) => {
    const out = document.createElement('canvas')
    paint(out, code.map, prefs.color, px)
    out.toBlob((b) => (b ? ok(b) : fail(new Error('Empty image'))), 'image/png')
  })

const fileStem = (text) => {
  try {
    const { hostname } = new URL(text)
    const stem = hostname.replace(/^www\./, '').replace(/[^a-z0-9.-]+/gi, '-').slice(0, MAX_STEM)
    return stem ? `qr-${stem}` : 'qr-code'
  } catch {
    return 'qr-code'
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
  field.supportingText =
    code && code.level !== prefs.level ? `Level lowered to ${LEVEL_NAMES[code.level]} to fit this text.` : ''
  if (!text) return setState('empty')
  if (!code) return setState('error')
  paint(canvas, code.map, prefs.color, Math.round(PREVIEW_PX * (window.devicePixelRatio || 1)))
  canvas.setAttribute('aria-label', `QR code for ${text.length > 80 ? `${text.slice(0, 80)}…` : text}`)
  setState('ready')
}

const schedule = () => {
  if (!frame) frame = requestAnimationFrame(render)
}

const syncStyle = () => {
  const preset = radios.find((r) => r.value === prefs.color)
  radios.forEach((r) => (r.checked = r === preset))
  customSwatch.toggleAttribute('data-active', !preset)
  if (!preset) {
    customColor.value = prefs.color
    customSwatch.style.setProperty('--custom', prefs.color)
  }
  contrastHint.hidden = contrast(prefs.color, PAPER) >= MIN_CONTRAST
  const dotsOk = DOT_LEVELS.has(prefs.level)
  dotsSwitch.disabled = !dotsOk
  dotsSwitch.selected = prefs.dots && dotsOk
  dotsHint.hidden = dotsOk
  downloadLabel.textContent = `Download ${prefs.format.toUpperCase()}`
}

const setPanel = (open) => {
  popup.dataset.panel = open ? 'open' : 'closed'
  panel.hidden = !open
  styleBtn.selected = open
}

const update = (patch, redraw = true) => {
  prefs = { ...prefs, ...patch }
  savePrefs()
  syncStyle()
  if (redraw) schedule()
}

const flash = (ok) => {
  clearTimeout(flashTimer)
  swapIcon(copyBtn.querySelector('md-icon[slot="icon"]'), ok ? 'check' : 'error')
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
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob(prefs.size) })])
    flash(true)
  } catch (e) {
    console.warn('Copy failed', e)
    flash(false)
  }
}

const save = async () => {
  if (!code) return
  try {
    const svg = prefs.format === 'svg'
    const blob = svg
      ? new Blob([toSvg(code.map, prefs.color, prefs.size)], { type: 'image/svg+xml' })
      : await pngBlob(prefs.size)
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), { href: url, download: `${fileStem(code.text)}.${prefs.format}` })
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    status.textContent = `QR code ${prefs.format.toUpperCase()} download started.`
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

prefs = loadPrefs()
setPanel(prefs.panel)
syncStyle()
levelSel.value = prefs.level
sizeSel.value = String(prefs.size)
formatSel.value = prefs.format

field.addEventListener('input', schedule)
copyBtn.addEventListener('click', copy)
downloadBtn.addEventListener('click', save)
styleBtn.addEventListener('change', () => {
  setPanel(styleBtn.selected)
  update({ panel: styleBtn.selected }, false)
})
radios.forEach((r) => r.addEventListener('change', () => r.checked && update({ color: r.value })))
const pickCustom = () => HEX.test(customColor.value) && update({ color: customColor.value.toLowerCase() })
customColor.addEventListener('click', pickCustom)
customColor.addEventListener('input', pickCustom)
levelSel.addEventListener('change', () => LEVELS.includes(levelSel.value) && update({ level: levelSel.value }))
sizeSel.addEventListener('change', () => SIZES.includes(+sizeSel.value) && update({ size: +sizeSel.value }, false))
formatSel.addEventListener('change', () => FORMATS.includes(formatSel.value) && update({ format: formatSel.value }, false))
dotsSwitch.addEventListener('change', () => update({ dots: dotsSwitch.selected }))

field.value = await tabUrl()
render()
await field.updateComplete
field.focus()
field.select()
