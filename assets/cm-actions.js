/**
 * cm-actions.js — building-page bootstrap
 *
 * WHAT THIS FILE USED TO DO, AND WHY IT NO LONGER DOES IT
 *
 * Until now this module rendered a fixed action bar across the bottom of every
 * building page — "Watch this building · Make an offer → · Set your number →"
 * — fading in past 350px of scroll. It has been removed.
 *
 * Three reasons, in order of weight:
 *
 *   1. Every one of its three actions already exists in the page. The hero
 *      carries "Make an offer on any unit →", the watch box sits inline in the
 *      page rather than over it, and the dossier has its own offer CTA. The bar
 *      was a fourth copy competing with the three originals.
 *
 *   2. It was losing a fight it should not have been in. Its own CSS carried a
 *      hand-written `padding-right: 200px` on desktop and `bottom: 76px` on
 *      mobile purely to stop the "Ask the market" launcher covering its
 *      right-hand button. Two fixed elements negotiating for the same corner is
 *      a sign one of them should not be there.
 *
 *   3. On a phone it covered content. It sat over the dossier's unit tower —
 *      the densest, most useful thing on the page — while offering links to
 *      places the reader could already reach.
 *
 * The file stays because it is loaded by 65 static building pages plus two
 * paths in the worker, and because it is the loader for two modules that are
 * NOT going anywhere. Deleting the file would have taken the per-building
 * intelligence panel and the Make Me Move section with it. Emptying the render
 * instead of deleting the file is what makes this a one-file change that lands
 * on every building page at once, with no edit to 65 HTML files.
 *
 * What remains:
 *   - dynamic import of cm-building-intel.js (per-building intelligence panel)
 *   - dynamic import of cm-mmm.js (Make Me Move section + email modal)
 *   - the fresh-navigation scroll guard below
 */

function getCurrentBuildingSlug() {
  // /building/lumina/ → lumina  ;  /building/lumina/unit-map.html → lumina
  const m = window.location.pathname.match(/\/building\/([^\/]+)/);
  return m ? m[1] : null;
}

/* ── Land at the top of the page ──────────────────────────────────────────
 * Clicking through to a building was landing part-way down the page rather
 * than at the hero.
 *
 * No code in this repo scrolls a building page on load — I looked, and the
 * only scrollIntoView calls on these pages are behind click handlers. What is
 * left is the browser: history.scrollRestoration defaults to 'auto', so Safari
 * restores wherever you were the last time you were on that URL. Visit a
 * building, scroll to the dossier, come back later, and it opens at the
 * dossier. It looks exactly like a feature somebody wrote.
 *
 * Two guards make this narrow rather than blunt:
 *   - `back_forward` is excluded, so the back button still returns you to
 *     where you were. That is restoration doing its job, and removing it would
 *     trade one annoyance for a worse one.
 *   - a hash is excluded, so /building/x/#market (the 301 target from
 *     /report) and the sticky-nav anchors still jump where they are aimed.
 *
 * Safari applies its restoration after load, so once is not enough — hence the
 * second pass on the next frame after load.
 */
function landAtTop() {
  if (!getCurrentBuildingSlug()) return;
  if (window.location.hash) return;
  let navType = '';
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    navType = nav && nav.type;
  } catch (e) { /* older browser: fall through and treat as a fresh navigation */ }
  if (navType === 'back_forward') return;

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  window.addEventListener('load', () => {
    requestAnimationFrame(() => {
      if (!window.location.hash) window.scrollTo(0, 0);
    });
  });
}
landAtTop();

// Per-building intelligence panel. The intel module self-mounts and bails on
// non-building pages.
if (getCurrentBuildingSlug()) {
  import('/assets/cm-building-intel.js').catch((err) => {
    console.warn('cm-building-intel: load failed', err);
  });
}

// Per-building Make Me Move section + email-click modal. The mmm module
// self-mounts and bails on non-building pages and on buildings with no active
// make_me_move rows.
if (getCurrentBuildingSlug()) {
  import('/assets/cm-mmm.js').catch((err) => {
    console.warn('cm-mmm: load failed', err);
  });
}
