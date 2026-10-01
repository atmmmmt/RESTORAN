// Builds the self-contained handover manual (HTML with embedded logos) from
// manual.template.html. PDF is then printed from it with headless Edge.
const fs = require('fs')
const path = require('path')

const dir = __dirname
const s = fs.readFileSync(path.join(dir, 'manual.template.html'), 'utf8')
const b64 = (p, t) => `data:${t};base64,` + fs.readFileSync(p).toString('base64')

const out = s
  .replaceAll('{{LULIZ_BANNER}}', 'assets/luliz-logo.png')
  .replaceAll('{{PROOTECH}}', 'assets/prootech-logo.png')
  .replaceAll('{{SITE_URL}}', 'https://loliz-taste.com')
  .replaceAll('{{DATE}}', 'أيلول 2026')
  .replaceAll('{{YEAR}}', '2026')

fs.writeFileSync(path.join(dir, 'manual.html'), out)
console.log('manual.html', (out.length / 1e6).toFixed(1) + 'MB')
