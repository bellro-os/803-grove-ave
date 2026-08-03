// Builds the listing-strategy PDF as a designed, fixed-page document.
//
// Loads index.html in Chromium, then recomposes the site's own content
// (headlines, facts table, photos, map, chart, comp table, scenario cards)
// into a sequence of fixed Letter-size pages. Every page is a closed
// canvas: content is measured and scaled to fit, so nothing flows across
// page boundaries.
//
// Usage: NODE_PATH=$(npm root -g) node scripts/build-pdf.js [output.pdf]
// Requires: playwright (with its Chromium browser installed)

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SRC = 'file://' + path.resolve(__dirname, '..', 'index.html');
const OUT = process.argv[2] || path.resolve(__dirname, '..', '803-Grove-Avenue-Listing-Strategy.pdf');
// static instances of the site's variable fonts (see make-static-fonts.py):
// Chromium's PDF export embeds variable fonts as Type 3 with quantized glyph
// advances, producing spurious gaps ("Kit chen, f ull ref resh") — static
// instances embed as proper CID TrueType with exact metrics
const FONTS_CSS = path.join(__dirname, 'fonts-static.css');

const DOC_CSS = `
  body { margin: 0; background: #fff; }
  body > *:not(#pdoc) { display: none !important; }
  #pdoc .reveal { opacity: 1 !important; transform: none !important; transition: none !important; }

  .pd-page {
    width: 816px; height: 1056px; position: relative; overflow: hidden;
    background: var(--paper); color: var(--ink); break-after: page;
  }
  .pd-page:last-child { break-after: auto; }

  .pd-head {
    position: absolute; top: 40px; left: 56px; right: 56px;
    display: flex; justify-content: space-between; align-items: baseline;
    font-family: 'Archivo', sans-serif; font-weight: 700; font-size: 9.5px;
    letter-spacing: .16em; text-transform: uppercase; color: var(--ink-3);
    padding-bottom: 10px; border-bottom: 1px solid var(--line);
  }
  .pd-foot {
    position: absolute; bottom: 30px; left: 56px; right: 56px;
    display: flex; justify-content: space-between; align-items: baseline;
    font-family: 'Archivo', sans-serif; font-weight: 700; font-size: 9px;
    letter-spacing: .16em; text-transform: uppercase; color: var(--ink-3);
    padding-top: 10px; border-top: 1px solid var(--line);
  }
  /* clipping stays on .pd-page: .pd-body gets transform-scaled by autofit,
     and overflow on the transformed element would clip pre-transform */
  .pd-body { position: absolute; top: 100px; left: 56px; right: 56px; bottom: 80px; }
  .pd-body.pd-center { display: flex; flex-direction: column; justify-content: center; }

  /* Chromium exports blurred box-shadows as PDF soft masks, which Apple's
     PDF viewers render as opaque gray boxes — kill every shadow and give
     card surfaces a crisp border instead */
  #pdoc *, #pdoc *::before, #pdoc *::after { box-shadow: none !important; text-shadow: none !important; }
  #pdoc :where(.tile, .chart-card, .comp-table-wrap, .phase, .chan, .step, .facts) {
    border: 1px solid var(--line-2);
  }

  .pd-dark { background: var(--charcoal); color: var(--on-charcoal); }
  .pd-dark .pd-head, .pd-dark .pd-foot { color: rgba(244,243,246,.55); border-color: rgba(244,243,246,.16); }
  .pd-maroon { background: linear-gradient(165deg, var(--maroon) 0%, var(--maroon-deep) 100%); color: #fdf6f2; }
  .pd-maroon::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 6px;
    background: linear-gradient(90deg, var(--orange), #f2a45c);
  }
  .pd-maroon .pd-head, .pd-maroon .pd-foot { color: rgba(253,246,242,.6); border-color: rgba(253,246,242,.22); }

  .pd-h2 {
    font-family: 'Archivo', sans-serif; font-weight: 800; font-size: 30px;
    line-height: 1.14; letter-spacing: -.015em; margin: 10px 0 18px; text-wrap: balance;
  }
  #pdoc .sec-head { margin-bottom: 26px; }
  #pdoc .sec-head h2 { margin-bottom: 0; }
  #pdoc .lede { margin-bottom: 0; }

  /* ---- cover ---- */
  .pd-cover-photo {
    position: absolute; top: 0; left: 0; right: 0; height: 470px;
    background-size: cover; background-position: center 62%;
  }
  .pd-cover-photo::after {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(34,36,44,.16) 0%, rgba(34,36,44,.1) 40%, rgba(34,36,44,.72) 66%, var(--charcoal) 88%);
  }
  .pd-cover-main { position: absolute; top: 430px; left: 64px; right: 64px; }
  .pd-cover-main .eyebrow { color: #c9a6ff; }
  .pd-cover-main h1 {
    font-family: 'Archivo', sans-serif; font-weight: 800; font-size: 64px;
    letter-spacing: -.02em; line-height: 1.02; margin: 14px 0 18px; color: #fff;
  }
  .pd-cover-rule { border: 0; border-top: 1px solid rgba(244,243,246,.18); margin: 26px 0 24px; }
  .pd-cover-meta { display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap; }
  .pd-cover-stats {
    position: absolute; bottom: 0; left: 0; right: 0; padding: 30px 64px 38px;
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 28px;
    border-top: 1px solid rgba(244,243,246,.14); background: rgba(0,0,0,.14);
  }

  /* ---- content rail (page 2) ---- */
  .pd-rail { display: grid; grid-template-columns: repeat(4, 1fr); gap: 26px; margin-top: 44px; }
  .pd-rail > div { border-top: 2px solid var(--ink); padding-top: 14px; }
  .pd-rail b { display: block; font-family: 'Archivo', sans-serif; font-weight: 800; font-size: 25px; letter-spacing: -.01em; }
  .pd-rail span {
    display: block; margin-top: 6px; font-family: 'Archivo', sans-serif; font-weight: 700;
    font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); line-height: 1.5;
  }

  /* ---- component fit adjustments ---- */
  .pd-cover-stats .stat { border: none !important; border-top: 1px solid rgba(244,243,246,.22) !important; padding: 14px 0 0 !important; }
  #pdoc .facts th, #pdoc .facts td { padding: 7px 12px; }
  #pdoc .facts td { font-size: 14px; }
  #pdoc .tile-grid { grid-template-columns: 1fr 1fr 1fr !important; gap: 12px; }
  #pdoc .phases { grid-template-columns: 1fr 1fr !important; gap: 14px; }
  #pdoc .chan-grid { grid-template-columns: 1fr 1fr 1fr !important; gap: 12px; margin-top: 14px; }
  #pdoc .scenarios { margin-top: 20px; }
  #pdoc .dev-panel { grid-template-columns: 1.5fr 1fr !important; }
  #pdoc .dev-stats { border-left: 1px solid var(--line) !important; border-top: none !important; }
  #pdoc .hokie { background: none !important; padding: 0 !important; margin: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
  #pdoc .hokie::before, #pdoc .hokie::after { display: none !important; }
  #pdoc .hokie-nums { grid-template-columns: repeat(4, 1fr) !important; }
  #pdoc .hokie-cols { grid-template-columns: 1fr 1fr !important; }
  #pdoc .spotlight { grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) !important; }
  #pdoc .spot-side { padding: 30px 28px !important; }
  #pdoc .spot-side .lab { min-height: 30px; }
  #pdoc .spot-mid { padding: 0 6px !important; justify-content: center !important; }
  #pdoc .spot-mid .delta { transform: translateY(-4px); }
  #pdoc .scen .flag { left: 28px; }
  #pdoc .mathline .mop { align-self: flex-start; margin-top: 7px; }
  #pdoc .ph-lab { white-space: nowrap; font-size: 10.5px; letter-spacing: .08em; }
  #pdoc .scen { padding: 22px !important; }
  #pdoc .scen dl .row { padding: 7px 0; }
  #pdoc .scen .gain-note { margin-top: 12px; }
  #pdoc .bridge-wrap { padding: 22px 28px; }
  #pdoc .callout { padding: 18px 22px; }
  #pdoc .comps th { white-space: nowrap; }
  #pdoc .gameday { display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 10px !important; }
  #pdoc .gameday .game { display: block; }
  #pdoc .chan h4 { text-wrap: balance; }
  #pdoc .tile .k { min-height: 28px; }
  #pdoc .dev-stat .k { text-wrap: balance; }
  #pdoc .legend .sw { border-radius: 50%; }
  #pdoc .map-note { margin-left: 25px; }
  #pdoc .sec-head .lede { margin-top: 12px; }
  #pdoc h2 { text-wrap: balance; }
  #pdoc .facts th { padding-top: 10.5px; }
  #pdoc .hero-tags { margin: 0 !important; gap: 10px; }
  #pdoc .hero-tags .tag { margin: 0 !important; }
  #pdoc .cred-grid { grid-template-columns: repeat(4, 1fr) !important; margin-top: 30px; max-width: none !important; }
  #pdoc .cred b { display: block; min-height: 42px; }
  #pdoc .about-grid { align-items: stretch !important; }
  #pdoc .about-photo { height: 100%; }
  #pdoc .about-photo img { height: 100% !important; object-fit: cover; object-position: center 22%; }
  #pdoc .about-quote { margin-top: 26px; max-width: none !important; }
  #pdoc .disclaimer { color: #9a98a4 !important; }
  #pdoc .about { background: none !important; padding: 0 !important; margin: 0 !important; }
  #pdoc .about-grid { grid-template-columns: 300px 1fr !important; gap: 40px; align-items: start; }
  #pdoc .about-photo img { width: 100%; display: block; }
  /* the map SVG must render at >= its natural viewBox size: Chromium's PDF
     export corrupts SVG text glyph spacing when the SVG is scaled down */
  #pdoc .mapbox svg { width: 100%; height: auto; display: block; }
  #pdoc .chart-card svg { max-width: 100%; height: auto; }
  #pdoc .walk-list { display: grid; grid-template-columns: 1fr 1fr; column-gap: 40px; margin-top: 6px; }
  #pdoc .walk-list li { padding: 10px 0; }
  #pdoc .walk-list li:nth-child(-n+2) { border-top: none; }
  #pdoc .walk-list .d { font-size: 13.5px; }

  /* ---- photo pages (no caption overlays: clean photography) ---- */
  .pd-ph-row { display: grid; gap: 10px; margin-bottom: 10px; }
  .pd-ph-row.two { grid-template-columns: 7fr 5fr; }
  .pd-ph-row.three { grid-template-columns: 1fr 1fr 1fr; }
  .pd-fig { position: relative; margin: 0; border-radius: 8px; overflow: hidden; }
  .pd-fig img { width: 100%; height: 100%; object-fit: cover; display: block; }

  /* ---- maroon page ---- */
  .pd-maroon .hokie-inner { padding: 0 !important; }
  .pd-gameday-card {
    background: linear-gradient(165deg, var(--maroon) 0%, var(--maroon-deep) 100%);
    color: #fdf6f2; border-radius: 12px; padding: 30px 34px 24px; margin-bottom: 22px;
  }

  /* ---- back cover ---- */
  .pd-back .foot-contact { margin-top: 22px; font-size: 15px; line-height: 1.9; }
  .pd-back .disclaimer { margin-top: 0; max-width: 560px; }
  .pd-back-rule { border: 0; border-top: 1px solid rgba(244,243,246,.16); margin: 34px 0; width: 560px; }

  /* ---- closing contact strip ---- */
  .pd-contact-strip {
    margin-top: 26px; display: flex; align-items: center; gap: 16px;
    background: var(--charcoal); color: var(--on-charcoal); border-radius: 12px; padding: 20px 26px;
  }
  .pd-contact-strip img { width: 52px; height: 52px; border-radius: 50%; object-fit: cover; }
  .pd-contact-strip b { font-family: 'Archivo', sans-serif; font-weight: 700; display: block; font-size: 15px; }
  .pd-contact-strip span { color: var(--on-charcoal-2); font-size: 13.5px; }
`;

function buildDoc() {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const el = (tag, cls, html) => {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html !== undefined) d.innerHTML = html;
    return d;
  };

  // budget bar fills are normally set by a scroll observer
  $$('.budget-row').forEach((r) => {
    const f = $('.fill', r);
    if (f && r.dataset.w) f.style.width = r.dataset.w + '%';
  });

  // make the JS-drawn chart scalable inside a narrower container
  $$('#comp-chart svg').forEach((svg) => {
    if (!svg.getAttribute('viewBox')) {
      const w = svg.getAttribute('width'), h = svg.getAttribute('height');
      if (w && h) svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    }
    svg.removeAttribute('height');
    svg.style.width = '100%';
    svg.style.height = 'auto';
  });

  // widen the map legend card so its title clears the border comfortably
  const legendRect = $('.mapbox svg rect');
  if (legendRect) legendRect.setAttribute('width', '170');

  const doc = el('div');
  doc.id = 'pdoc';
  const pages = [];

  function addPage(opts) {
    opts = opts || {};
    const p = el('div', 'pd-page' + (opts.variant ? ' ' + opts.variant : ''));
    let body = null;
    if (!opts.raw) {
      if (opts.chrome !== false) {
        p.appendChild(el('div', 'pd-head',
          '<span>803 Grove Avenue</span><span>Listing strategy · August 2026</span>'));
        p.appendChild(el('div', 'pd-foot',
          '<span>Gravity Real Estate Group</span><span class="pd-pageno"></span>'));
      }
      body = el('div', 'pd-body' + (opts.center ? ' pd-center' : ''));
      p.appendChild(body);
    }
    doc.appendChild(p);
    pages.push(p);
    return { page: p, body: body };
  }

  const title = (eyebrow, h2) =>
    '<p class="eyebrow">' + eyebrow + '</p>' + (h2 ? '<h2 class="pd-h2">' + h2 + '</h2>' : '');

  const galleryFigs = $$('#gallery figure').map((f) => ({
    src: $('img', f).getAttribute('src'),
    cap: ($('figcaption', f) || {}).textContent || '',
  }));

  /* ---------------- 1 · cover ---------------- */
  {
    const { page } = addPage({ raw: true, variant: 'pd-dark' });
    const photo = el('div', 'pd-cover-photo');
    photo.style.backgroundImage = getComputedStyle($('.hero-img')).backgroundImage;
    page.appendChild(photo);

    const main = el('div', 'pd-cover-main');
    main.appendChild($('.hero .eyebrow'));
    main.appendChild($('.hero h1'));
    main.appendChild($('.hero-sub'));
    main.appendChild(el('hr', 'pd-cover-rule'));
    const meta = el('div', 'pd-cover-meta');
    meta.appendChild($('.agent-chip'));
    meta.appendChild($('.hero-tags'));
    main.appendChild(meta);
    page.appendChild(main);

    const stats = el('div', 'pd-cover-stats');
    $$('.stat-band .stat').forEach((s) => stats.appendChild(s));
    // keep "as-is" on one line, and set the townhome stat in standard notation
    const k0 = $('.stat:nth-child(1) .k', stats);
    if (k0) k0.textContent = k0.textContent.replace('as-is', 'as‑is');
    const s4 = $('.stat:nth-child(4)', stats);
    if (s4) {
      $('.v', s4).textContent = '$600s';
      $('.k', s4).textContent = 'New townhomes across the road';
    }
    page.appendChild(stats);
  }

  /* ---------------- 2 · the opportunity ---------------- */
  {
    const { body } = addPage({ center: true });
    const t = $('section.tight .wrap');
    ['.eyebrow', 'h2', 'p:nth-of-type(2)', 'p:nth-of-type(3)'].forEach(() => {});
    body.appendChild($('.eyebrow', t));
    body.appendChild($('h2', t));
    $$('p', t).forEach((p) => body.appendChild(p));
    body.appendChild(el('div', 'pd-rail',
      '<div><b>73</b><span>Townhomes approved directly across the road, from the $600s</span></div>' +
      '<div><b>$434,185</b><span>Typical 24060 home value, Zillow ZHVI, June 2026</span></div>' +
      '<div><b>99.2%</b><span>Sale-to-list ratio across the Blacksburg market</span></div>' +
      '<div><b>3.6 mo</b><span>Months of supply — seller’s-market territory</span></div>'));
  }

  /* ---------------- 3 · 01 the property ---------------- */
  {
    const { body } = addPage({});
    body.appendChild($('#property .sec-head'));
    body.appendChild($('#property .facts'));
    const side = $$('#property .prop-grid > .reveal')[1];
    body.appendChild($('p', side));
    body.appendChild($('.callout', side));
  }

  /* ---------------- 4 · photographs ---------------- */
  {
    const { body } = addPage({});
    body.appendChild(el('div', '', title('01 · The property', 'The house in photographs')));
    const rows = [
      { cls: 'two', h: 264, figs: galleryFigs.slice(0, 2) },
      { cls: 'three', h: 238, figs: galleryFigs.slice(2, 5) },
      { cls: 'three', h: 238, figs: galleryFigs.slice(5, 8) },
    ];
    rows.forEach((r) => {
      const row = el('div', 'pd-ph-row ' + r.cls);
      r.figs.forEach((f) => {
        const fig = el('figure', 'pd-fig', '<img src="' + f.src + '" alt="">');
        fig.style.height = r.h + 'px';
        row.appendChild(fig);
      });
      body.appendChild(row);
    });
  }

  /* ---------------- 5 · 02 the location ---------------- */
  {
    const { body } = addPage({});
    const head = el('div');
    head.appendChild($('#location .eyebrow'));
    head.appendChild($('#location h2'));
    head.appendChild($('#location .lede'));
    head.className = 'sec-head';
    body.appendChild(head);
    body.appendChild($('.mapbox'));
  }

  /* ---------------- 6 · on foot + across the road ---------------- */
  {
    const { body } = addPage({});
    body.appendChild(el('div', '', title('02 · The location', 'Timed on foot, and what breaks ground across the street')));
    body.appendChild($('.walk-list'));
    body.appendChild($('.dev-panel'));
  }

  /* ---------------- 7 · 03 the market ---------------- */
  {
    const { body } = addPage({});
    body.appendChild($('#market .sec-head'));
    body.appendChild($('#market .tile-grid'));
    body.appendChild($('#market .num-note'));
  }

  /* ---------------- 8 · 04 the valuation ---------------- */
  {
    const { body } = addPage({});
    body.appendChild($('#valuation .sec-head'));
    body.appendChild($('#valuation .chart-card'));
  }

  /* ---------------- 9 · the comp set ---------------- */
  {
    const { body } = addPage({});
    body.appendChild(el('div', '', title('04 · The valuation', 'The comp set behind the numbers')));
    body.appendChild($('.comp-table-wrap'));
    body.appendChild($('#valuation .num-note'));
    body.appendChild($('#valuation .callout'));
  }

  /* ---------------- 10 · proof ---------------- */
  {
    const { body } = addPage({});
    body.appendChild(el('div', '', title('04 · The valuation', 'The market already ran this experiment')));
    const spot = $('.spotlight');
    const closing = spot.nextElementSibling;
    // the middot break strands the separator; a comma wraps cleanly
    const lab0 = $('.spot-side .lab', spot);
    if (lab0) lab0.textContent = lab0.textContent.replace(' · ', ', ');
    body.appendChild(spot);
    if (closing && closing.tagName === 'P') body.appendChild(closing);
  }

  /* ---------------- 11 · 05 renovation ---------------- */
  {
    const { body } = addPage({});
    body.appendChild($('#renovation .sec-head'));
    body.appendChild($$('#renovation .reno-grid > .reveal')[0]);
  }

  /* ---------------- 12 · two paths ---------------- */
  {
    const { body } = addPage({});
    body.appendChild(el('div', '', title('05 · The renovation option', 'Two clean paths, and the math between them')));
    body.appendChild($('.scenarios'));
    body.appendChild($('.bridge-wrap'));
    body.appendChild($('#renovation .callout'));
  }

  /* ---------------- 13 · 06 marketing plan ---------------- */
  {
    const { body } = addPage({});
    body.appendChild($('#marketing .sec-head'));
    body.appendChild($('.phases'));
  }

  /* ---------------- 14 · hokie nation ---------------- */
  {
    const { body } = addPage({ variant: 'pd-maroon' });
    const hokie = $('.hokie');
    // the game slate moves to the next page
    const gameday = $('.gameday', hokie);
    const fine = $('.fineprint', hokie);
    body.appendChild(hokie);
    const hold = el('div');
    hold.appendChild(gameday);
    hold.appendChild(fine);
    document.body.appendChild(hold);
    hold.id = 'pd-hold';
  }

  /* ---------------- 15 · timed to the season ---------------- */
  {
    const { body } = addPage({});
    body.appendChild(el('div', '', title('06 · The marketing plan', 'Timed to a season when Hokie Nation comes to town')));
    const card = el('div', 'pd-gameday-card');
    const hold = $('#pd-hold');
    card.appendChild($('.gameday', hold));
    card.appendChild($('.fineprint', hold));
    hold.remove();
    body.appendChild(card);
    body.appendChild($('.chan-grid'));
  }

  /* ---------------- 16 · 07 the listing team ---------------- */
  {
    const { body } = addPage({ variant: 'pd-dark' });
    const wrap = el('div', 'about');
    const grid = $('.about-grid');
    wrap.appendChild(grid);
    // credentials + quote run full-width beneath the photo/bio columns so
    // the quote anchors the spread instead of leaving an empty left column
    const cred = $('.cred-grid', grid);
    const quote = $('.about-quote', grid);
    wrap.appendChild(cred);
    wrap.appendChild(quote);
    const inc = $$('.cred span', cred).find((s) => s.textContent.includes('Group, Inc.'));
    if (inc) inc.textContent = inc.textContent.replace('Group, Inc.', 'Group, Inc.');
    body.appendChild(wrap);
  }

  /* ---------------- 17 · 08 next steps ---------------- */
  {
    const { body } = addPage({});
    const nextHead = $('#next .sec-head');
    const nextH2 = $('h2', nextHead);
    // avoid stranding "I" at the end of line one
    nextH2.innerHTML = 'Three decisions,<br>and I handle everything after';
    body.appendChild(nextHead);
    body.appendChild($('.steps'));
    const agentImg = $('.pd-cover-main .agent-chip img', doc) || $('.agent-chip img');
    body.appendChild(el('div', 'pd-contact-strip',
      '<img src="' + agentImg.getAttribute('src') + '" alt="">' +
      '<div><b>Ready when you are.</b>' +
      '<span>Austin Cummings · (540) 525-3116 · austin@gravitygroup.us</span></div>'));
  }

  /* ---------------- 18 · back cover ---------------- */
  {
    const { body } = addPage({ variant: 'pd-dark pd-back', chrome: false, center: true });
    const logo = $('.foot-logo');
    body.appendChild(logo);
    body.appendChild($('.foot-contact'));
    body.appendChild(el('hr', 'pd-back-rule'));
    body.appendChild($('.disclaimer'));
  }

  document.body.appendChild(doc);

  // typographic apostrophes throughout (the source mixes ' and ’)
  const walker = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeValue.includes("'")) n.nodeValue = n.nodeValue.replace(/'/g, '’');
  }

  const total = pages.length;
  pages.forEach((p, i) => {
    const n = $('.pd-pageno', p);
    if (n) n.textContent = 'Page ' + (i + 1) + ' of ' + total;
  });

  return { pages: total };
}

function autofit() {
  // measures the vertical span of a body's children (robust under flex
  // centering, where scrollHeight under-reports content that overflows
  // upward), then steps zoom down until the content fits
  const span = (b) => {
    const kids = [...b.children];
    if (!kids.length) return 0;
    let top = Infinity, bottom = -Infinity;
    for (const k of kids) {
      const r = k.getBoundingClientRect();
      const cs = getComputedStyle(k);
      top = Math.min(top, r.top - parseFloat(cs.marginTop));
      bottom = Math.max(bottom, r.bottom + parseFloat(cs.marginBottom));
    }
    return bottom - top;
  };
  // scale via CSS zoom, which genuinely re-lays-out the content smaller:
  // transform-scaling instead leaves layout at full size, and Chromium's
  // print fragmentation slices paint by layout position, clipping any page
  // whose unscaled layout crosses the 11in boundary
  const report = [];
  [...document.querySelectorAll('.pd-body')].forEach((b, i) => {
    const avail = b.getBoundingClientRect().height;
    // zoom scales the body's own absolute insets too, so divide them back
    // out — otherwise scaled pages start at 56*z and overhang the margins
    const cs = getComputedStyle(b);
    const ins = {
      top: parseFloat(cs.top), left: parseFloat(cs.left),
      right: parseFloat(cs.right), bottom: parseFloat(cs.bottom),
    };
    // fit with an 8px safety margin: print re-layout can shift metrics a
    // few pixels versus the screen pass this measurement runs in
    let z = 1;
    while (z > 0.7 && span(b) > avail - 8) {
      z = Math.round((z - 0.02) * 100) / 100;
      b.style.zoom = z;
      b.style.top = ins.top / z + 'px';
      b.style.left = ins.left / z + 'px';
      b.style.right = ins.right / z + 'px';
      b.style.bottom = ins.bottom / z + 'px';
    }
    report.push({
      page: i + 2,
      zoom: z,
      overflow: Math.max(0, Math.round(span(b) - avail)),
    });
  });
  return report;
}

(async () => {
  const browser = await chromium.launch();
  // 688px viewport = 640px .wrap content width, so the JS-drawn chart SVG
  // is created narrower than the 704px the document displays it at and only
  // ever scales UP — Chromium's PDF export corrupts SVG text scaled down,
  // while upscaled SVG text stays exact (same reason the map gets a full page)
  const page = await browser.newPage({ viewport: { width: 688, height: 1056 } });

  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await page.goto(SRC, { waitUntil: 'load' });

  // swap the variable @font-face declarations for static instances
  if (fs.existsSync(FONTS_CSS)) {
    await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        try {
          for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
            if (sheet.cssRules[i] instanceof CSSFontFaceRule) sheet.deleteRule(i);
          }
        } catch (e) { /* cross-origin sheets: none expected */ }
      }
    });
    await page.addStyleTag({ content: fs.readFileSync(FONTS_CSS, 'utf8') });
  } else {
    console.warn('warning: fonts-static.css missing — run make-static-fonts.py; PDF will embed variable fonts with corrupted advances');
  }

  await page.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; });
    await document.fonts.ready;
    await Promise.all(
      [...document.images]
        .filter((i) => i.getAttribute('src'))
        .map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })))
    );
  });
  await page.waitForSelector('#comp-chart svg', { timeout: 10000 }).catch(() => {
    console.warn('warning: chart svg not found');
  });

  // now that the chart has drawn at 640px, match the viewport to the paper
  // width: vw-based clamp() sizes must resolve identically in this measuring
  // pass and in the print layout, or auto-fit under-measures every page
  await page.setViewportSize({ width: 816, height: 1056 });

  await page.addStyleTag({ content: DOC_CSS });
  const built = await page.evaluate(buildDoc);
  const fit = await page.evaluate(autofit);

  console.log('pages: ' + built.pages);
  for (const f of fit) {
    if (f.zoom < 1 || f.overflow > 0) {
      console.log('  page ' + f.page + ': zoom ' + f.zoom + (f.overflow ? ' OVERFLOW ' + f.overflow + 'px' : ''));
    }
  }

  await page.pdf({
    path: OUT,
    format: 'Letter',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });

  await browser.close();
  console.log('wrote ' + OUT);
})();
