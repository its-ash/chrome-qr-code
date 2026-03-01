import QRCode from 'qrcode'

function $(sel) { return document.querySelector(sel) }

const qrContainer = $('#qrcode')
const input = $('#text')
const copyBtn = $('#copyBtn')
const downloadBtn = $('#downloadBtn')

function renderQR(text) {
  qrContainer.innerHTML = ''
  const canvas = document.createElement('canvas')
  canvas.width = 200
  canvas.height = 200
  qrContainer.appendChild(canvas)
  QRCode.toCanvas(canvas, text || ' ', { width: 200 })
}

function downloadCanvas() {
  const canvas = qrContainer.querySelector('canvas')
  if (!canvas) return
  const url = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = url
  a.download = 'qrcode.png'
  a.click()
}

async function copyImage() {
  const canvas = qrContainer.querySelector('canvas')
  if (!canvas) return
  try {
    canvas.toBlob(async (blob) => {
      if (!blob) return
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    })
  } catch (e) {
    console.warn('Copy failed', e)
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // populate with current tab URL
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs?.[0]?.url || ''
    input.value = url
    renderQR(input.value)
  })

  input.addEventListener('input', (e) => renderQR(e.target.value))

  downloadBtn.addEventListener('click', downloadCanvas)
  copyBtn.addEventListener('click', copyImage)
})
