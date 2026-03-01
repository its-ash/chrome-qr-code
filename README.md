# QR CODE — Chrome extension

Minimal Chrome extension that generates a QR code for the current page or any custom text. The extension is tiny, privacy-friendly, and performs all QR generation locally in the browser (no external servers).

Preview

![QR CODE preview](/QR-CODE.png)

What it does

- Generates a QR for the active tab URL when you open the popup.
- Provides an editable input so you can generate a QR from any text or URL.
- Lets you copy the QR image to clipboard or download it as a PNG.
- No analytics, telemetry, or external network requests — everything runs locally.

Permissions

- `activeTab`: only used when the user opens the popup so the extension can read the current tab URL and generate a QR for it.

Quick start

1. Install dependencies:

```bash
cd /Users/ashvinijangid/Desktop/chrome-qr-code
npm install
```

2. Build production assets and create a distributable ZIP:

```bash
npm run build
```

After building, the `dist/` folder contains the extension files. The repository `postbuild` script also creates `chrome-qr-code.zip` in the project root containing the built files.

3. Load extension in Chrome (developer/unpacked install):

- Open `chrome://extensions/` → Enable Developer mode → Load unpacked → select the `dist/` folder.

Distribute

- To provide a direct download bundle, use the generated `chrome-qr-code.zip` (created by the `postbuild` script) or create a `.crx` using Chrome's pack tool and place it in the project root; the about page links to the ZIP/CRX when present.

Development

Run `npm run dev` to preview with Vite while styling. When ready, run `npm run build` and load `dist/` as an unpacked extension.

Contributing & support

Open an issue or PR on the repository for feature requests or bug reports.

License

MIT
