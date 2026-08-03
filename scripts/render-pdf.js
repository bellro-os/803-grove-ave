// Renders index.html to a paginated Letter PDF of the listing strategy.
//
// Usage: NODE_PATH=$(npm root -g) node scripts/render-pdf.js [output.pdf]
// Requires: playwright (with its Chromium browser installed)

const path = require('path');
const { chromium } = require('playwright');

const SRC = 'file://' + path.resolve(__dirname, '..', 'index.html');
const OUT = process.argv[2] || path.resolve(__dirname, '..', '803-Grove-Avenue-Listing-Strategy.pdf');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 816, height: 1056 } });

  // reducedMotion triggers the page's own revealAll() fallback at init
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await page.goto(SRC, { waitUntil: 'load' });

  await page.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; });
    await document.fonts.ready;
    await Promise.all(
      [...document.images]
        .filter((i) => i.getAttribute('src'))
        .map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })))
    );
  });

  // the valuation chart SVG is drawn by JS after load
  await page.waitForSelector('.chart-card svg', { timeout: 10000 }).catch(() => {
    console.warn('warning: chart svg not found');
  });

  // Chromium slices grid items across page breaks even with break-inside:
  // avoid, so regroup the photo gallery into per-row grids that each fit a page
  await page.evaluate(() => {
    const g = document.getElementById('gallery');
    if (!g) return;
    const figs = [...g.querySelectorAll('figure')];
    const rows = [figs.slice(0, 2), figs.slice(2, 5), figs.slice(5, 8)];
    g.innerHTML = '';
    for (const r of rows) {
      if (!r.length) continue;
      const d = document.createElement('div');
      d.className = 'pg-row ' + (r.length === 2 ? 'pg-row-2' : 'pg-row-3');
      r.forEach((f) => d.appendChild(f));
      g.appendChild(d);
    }
  });

  await page.addStyleTag({
    content: `
      @media print {
        html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .reveal { opacity: 1 !important; transform: none !important; transition: none !important; }
        #tt, #lb { display: none !important; }
        section[id], footer { break-before: page; }
        section { padding: 56px 0 64px; }
        h2, h3, h4, .eyebrow { break-after: avoid; }
        .stat, .tile, .step, .phase, .chan, figure, .callout, .spotlight,
        .dev-panel, .mapbox, .chart-card, .comp-table-wrap, .scenarios,
        .scen, .cred, .num-note, tr { break-inside: avoid; }
        p { orphans: 3; widows: 3; }

        #gallery { display: block !important; }
        .pg-row { display: grid; gap: 10px; margin-bottom: 10px; break-inside: avoid; }
        .pg-row-2 { grid-template-columns: 7fr 5fr; }
        .pg-row-2 figure { height: 340px; aspect-ratio: auto; }
        .pg-row-3 { grid-template-columns: 1fr 1fr 1fr; }
        .pg-row figure { grid-column: auto !important; break-inside: avoid; }
        #gallery figcaption { opacity: 1 !important; }

        .about-photo { max-width: 400px; }
        .mapbox { zoom: 0.8; }
        .walk-list li { break-inside: avoid; }
        #market .tile-grid { zoom: 0.9; }
        .scenarios { break-before: page; padding-top: 14px; }
      }
    `,
  });

  await page.pdf({
    path: OUT,
    format: 'Letter',
    printBackground: true,
    margin: { top: '0.3in', right: '0', bottom: '0.3in', left: '0' },
  });

  await browser.close();
  console.log('wrote ' + OUT);
})();
