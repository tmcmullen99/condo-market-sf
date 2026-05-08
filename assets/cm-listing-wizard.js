/**
 * cm-listing-wizard.js — Multi-step listing creation/edit flow
 *
 * Mounts into a container element. Manages its own state, handles uploads
 * directly (no silent failures — every error is surfaced inline with a
 * specific message), and on publish either INSERTs a new listing (for new)
 * or UPDATEs the existing row (for edit). The DB trigger on listings INSERT
 * handles the post-publish email side.
 *
 * Path convention for new-listing photos: a listing UUID is generated when
 * the wizard opens, photos upload to {user_id}/{listing_uuid}/... and the
 * eventual INSERT uses that explicit UUID. This means photos can be
 * uploaded BEFORE the listing row exists.
 */

import { CM } from '/assets/cm-supabase.js';

const STYLE_ID = 'cm-wiz-styles';
const STYLE_CSS = `
  .cm-wiz { background: var(--cm-navy-deep, #0f131d); border: 1px solid var(--cm-rule, rgba(232,227,216,0.14)); border-radius: 12px; padding: clamp(20px, 3vw, 32px); }
  .cm-wiz-eyebrow { display: inline-block; font-family: var(--cm-ff-mono, 'JetBrains Mono', monospace); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--cm-bronze, #d4a574); padding: 4px 11px; border: 1px solid rgba(212,165,116,0.34); border-radius: 999px; margin-bottom: 14px; }
  .cm-wiz h2 { font-family: var(--cm-ff-display, 'Playfair Display', Georgia, serif); font-style: italic; font-weight: 500; font-size: clamp(24px, 3.4vw, 32px); color: var(--cm-ivory, #e8e3d8); line-height: 1.15; margin-bottom: 8px; }
  .cm-wiz h2 em { color: var(--cm-peri, #9fb4d8); }
  .cm-wiz-sub { color: var(--cm-ivory-dim, rgba(232,227,216,0.62)); font-size: 14px; line-height: 1.55; margin-bottom: 24px; }

  .cm-wiz-progress { display: flex; gap: 6px; margin-bottom: 28px; flex-wrap: wrap; }
  .cm-wiz-progress-step { flex: 1; min-width: 80px; padding: 8px 10px; border-radius: 6px; font-family: var(--cm-ff-mono); font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; background: rgba(232,227,216,0.04); color: var(--cm-ivory-faint, rgba(232,227,216,0.4)); border: 1px solid var(--cm-rule); transition: all 200ms ease; text-align: center; }
  .cm-wiz-progress-step.is-active { background: rgba(159,180,216,0.1); border-color: var(--cm-peri); color: var(--cm-peri); }
  .cm-wiz-progress-step.is-done { background: rgba(143,185,122,0.08); border-color: rgba(143,185,122,0.4); color: var(--cm-gain, #8fb97a); }

  .cm-wiz-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; margin-bottom: 22px; }
  .cm-wiz-grid.full { grid-template-columns: 1fr; }
  @media (max-width: 600px) { .cm-wiz-grid { grid-template-columns: 1fr; } }
  .cm-wiz-grid > .span-2 { grid-column: 1 / -1; }
  .cm-wiz-field { display: flex; flex-direction: column; gap: 6px; }
  .cm-wiz-field label { font-family: var(--cm-ff-mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--cm-peri); }
  .cm-wiz-field input, .cm-wiz-field select, .cm-wiz-field textarea {
    background: var(--cm-navy, #1a1f2e); border: 1px solid var(--cm-rule); border-radius: 6px;
    padding: 11px 13px; color: var(--cm-ivory); font-family: var(--cm-ff-body, 'DM Sans', sans-serif); font-size: 14px;
    transition: border-color 150ms ease;
  }
  .cm-wiz-field input:focus, .cm-wiz-field select:focus, .cm-wiz-field textarea:focus { outline: none; border-color: var(--cm-peri); }
  .cm-wiz-field-hint { font-size: 11px; color: var(--cm-ivory-faint); margin-top: 2px; }

  .cm-wiz-photo-zone { display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px; }
  .cm-wiz-photo-zone-label { display: flex; align-items: baseline; justify-content: space-between; font-family: var(--cm-ff-mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--cm-peri); }
  .cm-wiz-photo-zone-label .req { color: var(--cm-bronze); }
  .cm-wiz-photo-zone-label .opt { color: var(--cm-ivory-faint); text-transform: none; letter-spacing: 0; font-size: 11px; }
  .cm-wiz-photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
  .cm-wiz-photo {
    aspect-ratio: 1; border-radius: 8px; overflow: hidden; position: relative;
    background: rgba(232,227,216,0.04); border: 1px solid var(--cm-rule);
  }
  .cm-wiz-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cm-wiz-photo.is-cover::before { content: 'Cover'; position: absolute; top: 6px; left: 6px; background: var(--cm-bronze); color: var(--cm-navy); font-family: var(--cm-ff-mono); font-size: 8px; letter-spacing: 0.1em; text-transform: uppercase; padding: 2px 7px; border-radius: 3px; z-index: 2; }
  .cm-wiz-photo-remove { position: absolute; top: 6px; right: 6px; background: rgba(15,19,29,0.86); color: var(--cm-loss, #c97865); width: 22px; height: 22px; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; z-index: 2; }
  .cm-wiz-photo-remove:hover { background: var(--cm-loss); color: var(--cm-navy); }
  .cm-wiz-photo.is-uploading::after { content: '…'; position: absolute; inset: 0; background: rgba(15,19,29,0.7); display: flex; align-items: center; justify-content: center; color: var(--cm-bronze); font-size: 22px; }

  .cm-wiz-photo-add {
    aspect-ratio: 1; border-radius: 8px; cursor: pointer;
    background: rgba(232,227,216,0.02);
    border: 1px dashed rgba(232,227,216,0.24);
    display: flex; align-items: center; justify-content: center;
    font-family: var(--cm-ff-mono); font-size: 10px; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--cm-ivory-dim);
    transition: all 150ms ease;
  }
  .cm-wiz-photo-add:hover { border-color: var(--cm-bronze); background: rgba(212,165,116,0.04); color: var(--cm-bronze); }

  .cm-wiz-floorplan {
    border: 1px dashed rgba(232,227,216,0.24); border-radius: 8px;
    padding: 14px 18px; cursor: pointer;
    display: flex; align-items: center; gap: 12px;
    transition: all 150ms ease;
  }
  .cm-wiz-floorplan:hover { border-color: var(--cm-bronze); }
  .cm-wiz-floorplan.has-file { border-style: solid; cursor: default; }
  .cm-wiz-floorplan-icon { font-size: 22px; color: var(--cm-bronze); }
  .cm-wiz-floorplan-label { flex: 1; font-size: 14px; color: var(--cm-ivory); }
  .cm-wiz-floorplan-sub { font-size: 11px; color: var(--cm-ivory-faint); margin-top: 2px; }
  .cm-wiz-floorplan-remove { background: transparent; border: 1px solid rgba(201,120,101,0.4); color: var(--cm-loss); padding: 6px 12px; border-radius: 999px; cursor: pointer; font-family: var(--cm-ff-mono); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; }
  .cm-wiz-floorplan-remove:hover { background: rgba(201,120,101,0.1); }

  .cm-wiz-price-display { font-family: var(--cm-ff-display); font-style: italic; font-weight: 600; font-size: 36px; color: var(--cm-bronze); line-height: 1; margin-bottom: 6px; }
  .cm-wiz-ppsqft { font-family: var(--cm-ff-mono); font-size: 12px; letter-spacing: 0.04em; color: var(--cm-ivory-dim); margin-bottom: 14px; }
  .cm-wiz-ppsqft strong { color: var(--cm-ivory); font-weight: 500; }
  .cm-wiz-ppsqft.is-empty { color: var(--cm-ivory-faint); font-style: italic; }
  .cm-wiz-ppsqft.is-warn strong { color: var(--cm-loss, #c97865); }
  .cm-wiz-ppsqft-flag { display: inline-block; margin-left: 8px; padding: 2px 8px; background: rgba(201, 120, 101, 0.12); border: 1px solid rgba(201, 120, 101, 0.4); border-radius: 4px; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--cm-loss); }
  .cm-wiz-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; background: var(--cm-rule); border-radius: 2px; cursor: pointer; outline: none; }
  .cm-wiz-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 22px; height: 22px; background: var(--cm-bronze); border-radius: 50%; cursor: grab; border: 2px solid var(--cm-navy-deep); }
  .cm-wiz-slider::-moz-range-thumb { width: 22px; height: 22px; background: var(--cm-bronze); border-radius: 50%; cursor: grab; border: 2px solid var(--cm-navy-deep); }
  .cm-wiz-slider-sm { height: 3px; }
  .cm-wiz-slider-sm::-webkit-slider-thumb { width: 16px; height: 16px; }
  .cm-wiz-slider-sm::-moz-range-thumb { width: 16px; height: 16px; }
  .cm-wiz-slider-bounds { display:flex; justify-content:space-between; font-family: var(--cm-ff-mono); font-size: 10px; letter-spacing: 0.08em; color: var(--cm-ivory-faint); margin: 6px 0 22px; }

  /* Mortgage breakdown card — step 3 */
  .cm-wiz-mortgage {
    background: rgba(232, 227, 216, 0.03);
    border: 1px solid var(--cm-rule);
    border-radius: 10px;
    padding: 18px 20px;
    margin: 18px 0 0;
  }
  .cm-wiz-mortgage-label {
    font-family: var(--cm-ff-mono); font-size: 10px; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--cm-bronze); margin-bottom: 14px;
  }
  .cm-wiz-mortgage-controls {
    display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
    margin-bottom: 16px; padding-bottom: 16px;
    border-bottom: 1px solid var(--cm-rule);
  }
  @media (max-width: 600px) { .cm-wiz-mortgage-controls { grid-template-columns: 1fr; } }
  .cm-wiz-mortgage-control label {
    display: flex; justify-content: space-between; align-items: baseline;
    font-family: var(--cm-ff-mono); font-size: 10px; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--cm-peri); margin-bottom: 8px;
  }
  .cm-wiz-mortgage-control label .val {
    font-family: var(--cm-ff-display); font-style: italic; font-weight: 500;
    font-size: 16px; color: var(--cm-ivory); letter-spacing: 0; text-transform: none;
  }
  .cm-wiz-mortgage-sub {
    font-family: var(--cm-ff-mono); font-size: 10px; color: var(--cm-ivory-faint);
    margin-top: 6px; letter-spacing: 0.04em;
  }
  .cm-wiz-hoa-input-wrap {
    position: relative; display: flex; align-items: center;
    background: var(--cm-navy); border: 1px solid var(--cm-rule);
    border-radius: 6px; padding: 0 12px;
    transition: border-color 150ms ease;
  }
  .cm-wiz-hoa-input-wrap:focus-within { border-color: var(--cm-peri); }
  .cm-wiz-hoa-prefix {
    color: var(--cm-ivory-faint); font-size: 14px;
    margin-right: 4px;
  }
  .cm-wiz-hoa-input {
    flex: 1; background: transparent; border: none;
    padding: 11px 0; color: var(--cm-ivory);
    font-family: var(--cm-ff-body); font-size: 14px;
    outline: none;
  }
  .cm-wiz-hoa-input:focus { outline: none; }
  .cm-wiz-mortgage-table {
    width: 100%; border-collapse: collapse; font-size: 14px;
  }
  .cm-wiz-mortgage-table td {
    padding: 8px 0;
    border-bottom: 1px solid rgba(232, 227, 216, 0.06);
    vertical-align: baseline;
  }
  .cm-wiz-mortgage-table tr:last-child td { border-bottom: none; }
  .cm-wiz-mortgage-table td:first-child { color: var(--cm-ivory); }
  .cm-wiz-mortgage-table td.amt {
    text-align: right;
    font-family: var(--cm-ff-mono); font-size: 13px;
    color: var(--cm-ivory); white-space: nowrap; padding-left: 12px;
  }
  .cm-wiz-mortgage-table td.meta {
    text-align: right;
    font-family: var(--cm-ff-mono); font-size: 10px;
    color: var(--cm-ivory-faint);
    padding-left: 12px; letter-spacing: 0.04em;
    width: 1%; white-space: nowrap;
  }
  .cm-wiz-mortgage-total td {
    padding-top: 14px;
    border-top: 1px solid rgba(212, 165, 116, 0.3) !important;
  }
  .cm-wiz-mortgage-total td:first-child { color: var(--cm-ivory); }
  .cm-wiz-mortgage-total td.amt {
    color: var(--cm-bronze); font-size: 16px;
  }
  @media (max-width: 480px) {
    .cm-wiz-mortgage-table td.meta { display: none; }
  }

  .cm-wiz-review-block { background: rgba(232,227,216,0.03); border: 1px solid var(--cm-rule); border-radius: 10px; padding: 18px 20px; margin-bottom: 16px; }
  .cm-wiz-review-block h4 { font-family: var(--cm-ff-display); font-style: italic; font-size: 18px; color: var(--cm-ivory); margin-bottom: 12px; }
  .cm-wiz-review-row { display: grid; grid-template-columns: 140px 1fr; gap: 12px; padding: 6px 0; font-size: 14px; }
  .cm-wiz-review-row .k { font-family: var(--cm-ff-mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--cm-ivory-faint); padding-top: 4px; }
  .cm-wiz-review-row .v { color: var(--cm-ivory); }
  .cm-wiz-review-photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px; margin-top: 8px; }
  .cm-wiz-review-photos img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 6px; }

  .cm-wiz-actions { display: flex; gap: 10px; flex-wrap: wrap; padding-top: 18px; border-top: 1px solid var(--cm-rule); }
  .cm-wiz-btn { padding: 12px 22px; border-radius: 999px; font-family: var(--cm-ff-body); font-size: 14px; font-weight: 500; cursor: pointer; border: 1px solid; transition: all 150ms ease; }
  .cm-wiz-btn-primary { background: var(--cm-peri); color: var(--cm-navy); border-color: var(--cm-peri); }
  .cm-wiz-btn-primary:hover:not(:disabled) { background: var(--cm-ivory); border-color: var(--cm-ivory); }
  .cm-wiz-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .cm-wiz-btn-publish { background: var(--cm-bronze); color: var(--cm-navy); border-color: var(--cm-bronze); }
  .cm-wiz-btn-publish:hover:not(:disabled) { background: var(--cm-ivory); border-color: var(--cm-ivory); }
  .cm-wiz-btn-secondary { background: transparent; color: var(--cm-ivory); border-color: var(--cm-rule); }
  .cm-wiz-btn-secondary:hover { border-color: var(--cm-ivory); }
  .cm-wiz-btn-cancel { background: transparent; color: var(--cm-ivory-dim); border-color: transparent; margin-left: auto; }
  .cm-wiz-btn-cancel:hover { color: var(--cm-loss); }

  .cm-wiz-msg { margin: 14px 0; padding: 10px 14px; border-radius: 6px; font-size: 13px; line-height: 1.5; }
  .cm-wiz-msg.is-error { background: rgba(201,120,101,0.1); border: 1px solid rgba(201,120,101,0.3); color: var(--cm-loss); }
  .cm-wiz-msg.is-info { background: rgba(159,180,216,0.08); border: 1px solid rgba(159,180,216,0.24); color: var(--cm-peri); }
`;

const ORIENTATIONS = [
  '', 'North-facing', 'Northeast-facing', 'East-facing', 'Southeast-facing',
  'South-facing', 'Southwest-facing', 'West-facing', 'Northwest-facing',
  'Corner unit (multiple exposures)', 'Interior unit',
];
const BED_OPTIONS  = ['', 'Studio', '1', '2', '3', '4', '5+'];
const BATH_OPTIONS = ['', '1', '1.5', '2', '2.5', '3', '3.5', '4+'];

// ─── Helpers ────────────────────────────────────────────────────────────────
function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = STYLE_CSS;
  document.head.appendChild(s);
}
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
function fmtMoney(n) {
  if (!n) return '$0';
  return '$' + Math.round(Number(n)).toLocaleString('en-US');
}
function fmtMoneyShort(n) {
  n = Number(n);
  if (n >= 1000000) {
    const m = n / 1000000;
    return '$' + m.toFixed(m >= 10 ? 1 : 2).replace(/\.?0+$/, '') + 'M';
  }
  if (n >= 1000) return '$' + Math.round(n/1000) + 'K';
  return '$' + Math.round(n);
}
function newUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now() + '-' + Math.random().toString(16).slice(2);
}
// "Studio" → 0, "5+" → 5, "" → null, otherwise parseInt
function bedsToInt(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  if (s === 'studio') return 0;
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}
// "1.5" → 1.5, "4+" → 4, "" → null
function bathsToNumeric(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).trim());
  return isNaN(n) ? null : n;
}

// Detect HEIC/HEIF — browsers can't decode these in canvas. Surface a clear error.
function isHeic(file) {
  const t = (file.type || '').toLowerCase();
  const n = (file.name || '').toLowerCase();
  return t.includes('heic') || t.includes('heif') || n.endsWith('.heic') || n.endsWith('.heif');
}

// Resize an image File to a Blob via canvas; rejects with explicit error message
async function resizeImage(file, maxLongEdge = 1600, quality = 0.85) {
  if (isHeic(file)) {
    throw new Error('HEIC photos aren\'t supported. On iPhone: Settings → Camera → Formats → "Most Compatible". Then re-export this photo, or save as JPEG via Preview.');
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const longEdge = Math.max(img.width, img.height);
          const scale = longEdge > maxLongEdge ? maxLongEdge / longEdge : 1;
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          canvas.toBlob(
            (blob) => blob ? resolve(blob) : reject(new Error('Image resize failed (toBlob returned null)')),
            'image/jpeg',
            quality,
          );
        } catch (err) { reject(new Error('Canvas error: ' + (err.message || err))); }
      };
      img.onerror = () => reject(new Error('Browser couldn\'t decode this image. Try a different photo or re-export as JPEG.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('File read failed: ' + (reader.error?.message || 'unknown')));
    reader.readAsDataURL(file);
  });
}

// ─── State ──────────────────────────────────────────────────────────────────
function createState(listing) {
  const isEdit = !!(listing && listing.id);
  const listingId = isEdit ? listing.id : newUuid();
  // Photos: combine cover + additional into one ordered list (cover first)
  const photos = [];
  if (listing?.cover_photo_path) photos.push(listing.cover_photo_path);
  if (Array.isArray(listing?.additional_photo_paths)) {
    photos.push(...listing.additional_photo_paths);
  }
  // Convert prefill ints back to dropdown strings
  const bedsStr = (listing?.beds == null) ? ''
    : (Number(listing.beds) === 0 ? 'Studio'
      : (Number(listing.beds) >= 5 ? '5+' : String(listing.beds)));
  const bathsStr = (listing?.baths == null) ? ''
    : (Number(listing.baths) >= 4 ? '4+' : String(listing.baths));
  return {
    step: 1,
    isEdit,
    listingId,
    data: {
      address:     listing?.address || '',
      unit_number: listing?.unit_number || '',
      beds:        bedsStr,
      baths:       bathsStr,
      sqft:        listing?.sqft || '',
      orientation: listing?.orientation || '',
      price:       Number(listing?.price) || 1500000,
    },
    photos,                                       // ordered list of storage paths
    floorplan_path: listing?.floorplan_path || null,
    busy: false,
    error: null,
    uploadingCount: 0,                            // for "uploading" indicator
    dpPct: 20,                                    // step 3 mortgage UI: down payment %
    hoa:   1200,                                  // step 3 mortgage UI: HOA $/mo
  };
}

// ─── Render ─────────────────────────────────────────────────────────────────
function renderProgress(step) {
  const labels = ['Basics', 'Photos', 'Price', 'Review'];
  return `<div class="cm-wiz-progress">${labels.map((l, i) => {
    const n = i + 1;
    const cls = n === step ? 'is-active' : (n < step ? 'is-done' : '');
    return `<div class="cm-wiz-progress-step ${cls}">${n}. ${escapeHtml(l)}</div>`;
  }).join('')}</div>`;
}

function renderStepBasics(state) {
  const d = state.data;
  return `
    <span class="cm-wiz-eyebrow">${state.isEdit ? 'Edit listing' : 'New listing'}</span>
    <h2>About <em>your home</em></h2>
    <p class="cm-wiz-sub">The basics buyers see first. You can change any of this later.</p>
    <div class="cm-wiz-grid">
      <div class="cm-wiz-field span-2">
        <label>Street address</label>
        <input type="text" name="address" value="${escapeHtml(d.address)}" placeholder="e.g. 201 Folsom St" autocomplete="off">
      </div>
      <div class="cm-wiz-field">
        <label>Unit number</label>
        <input type="text" name="unit_number" value="${escapeHtml(d.unit_number)}" placeholder="e.g. 5C" autocomplete="off">
      </div>
      <div class="cm-wiz-field">
        <label>Square feet</label>
        <input type="number" name="sqft" value="${escapeHtml(d.sqft)}" placeholder="e.g. 1250" min="200" max="10000">
      </div>
      <div class="cm-wiz-field">
        <label>Beds</label>
        <select name="beds">
          ${BED_OPTIONS.map(b => `<option value="${escapeHtml(b)}" ${String(d.beds) === String(b) ? 'selected' : ''}>${escapeHtml(b || 'Select…')}</option>`).join('')}
        </select>
      </div>
      <div class="cm-wiz-field">
        <label>Baths</label>
        <select name="baths">
          ${BATH_OPTIONS.map(b => `<option value="${escapeHtml(b)}" ${String(d.baths) === String(b) ? 'selected' : ''}>${escapeHtml(b || 'Select…')}</option>`).join('')}
        </select>
      </div>
      <div class="cm-wiz-field span-2">
        <label>Orientation</label>
        <select name="orientation">
          ${ORIENTATIONS.map(o => `<option value="${escapeHtml(o)}" ${d.orientation === o ? 'selected' : ''}>${escapeHtml(o || 'Select… (optional)')}</option>`).join('')}
        </select>
        <span class="cm-wiz-field-hint">Buyers searching for light/views look for this. Skip if unsure.</span>
      </div>
    </div>
  `;
}

function renderStepPhotos(state) {
  const photoUrl = (path) => CM.getListingPhotoUrl(path);
  const photoTiles = state.photos.map((path, i) => `
    <div class="cm-wiz-photo${i === 0 ? ' is-cover' : ''}" data-photo-index="${i}">
      <img src="${escapeHtml(photoUrl(path) || '')}" alt="">
      <button type="button" class="cm-wiz-photo-remove" data-action="remove-photo" data-index="${i}" title="Remove">×</button>
    </div>
  `).join('');

  let floorplanBlock;
  if (state.floorplan_path) {
    const isPdf = state.floorplan_path.toLowerCase().endsWith('.pdf');
    const fpUrl = photoUrl(state.floorplan_path);
    floorplanBlock = `
      <div class="cm-wiz-floorplan has-file">
        <span class="cm-wiz-floorplan-icon">${isPdf ? '📄' : '🖼️'}</span>
        <div class="cm-wiz-floorplan-label">
          ${isPdf ? 'Floor plan PDF uploaded' : 'Floor plan image uploaded'}
          <div class="cm-wiz-floorplan-sub"><a href="${escapeHtml(fpUrl || '')}" target="_blank" rel="noopener" style="color:var(--cm-peri);">Preview →</a></div>
        </div>
        <button type="button" class="cm-wiz-floorplan-remove" data-action="remove-floorplan">Remove</button>
      </div>
    `;
  } else {
    floorplanBlock = `
      <div class="cm-wiz-floorplan" data-action="upload-floorplan">
        <span class="cm-wiz-floorplan-icon">📐</span>
        <div class="cm-wiz-floorplan-label">
          Add a floor plan
          <div class="cm-wiz-floorplan-sub">PDF, JPG, or PNG. Increases offer rates by ~30%.</div>
        </div>
      </div>
    `;
  }

  return `
    <span class="cm-wiz-eyebrow">${state.isEdit ? 'Edit listing' : 'New listing'} · 2 of 4</span>
    <h2>Show buyers <em>the space</em></h2>
    <p class="cm-wiz-sub">Photos and floor plan are optional, but listings with them get many more offers.</p>

    <div class="cm-wiz-photo-zone">
      <div class="cm-wiz-photo-zone-label">
        <span>Photos${state.photos.length > 0 ? ' · first photo is the cover' : ''}</span>
        <span class="opt">Optional</span>
      </div>
      <div class="cm-wiz-photos">
        ${photoTiles}
        <div class="cm-wiz-photo-add" data-action="upload-photo">+ Add photo</div>
      </div>
    </div>

    <div class="cm-wiz-photo-zone">
      <div class="cm-wiz-photo-zone-label">
        <span>Floor plan</span>
        <span class="opt">Optional</span>
      </div>
      ${floorplanBlock}
    </div>
  `;
}

function renderStepPrice(state) {
  const d = state.data;
  const price = Number(d.price);
  const sqft  = Number(d.sqft) || 0;
  const dpPct = state.dpPct ?? 20;
  const hoa   = state.hoa ?? 1200;
  const ppsqft = sqft > 0 ? Math.round(price / sqft) : null;
  const ppsqftWarn = ppsqft && ppsqft > 3500;

  // Mortgage math: 30-yr fixed @ 6.75% baseline (configurable later)
  const RATE = 0.0675;
  const TERM_MONTHS = 360;
  const downPayment = Math.round(price * dpPct / 100);
  const loanAmount  = price - downPayment;
  const monthlyRate = RATE / 12;
  const piMonthly = loanAmount > 0
    ? Math.round(loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, TERM_MONTHS)) / (Math.pow(1 + monthlyRate, TERM_MONTHS) - 1))
    : 0;
  const taxMonthly = Math.round(price * 0.0118 / 12);   // CA effective ~1.18%
  const insMonthly = 100;                                // condo insurance estimate
  const totalMonthly = piMonthly + taxMonthly + insMonthly + Number(hoa);

  return `
    <span class="cm-wiz-eyebrow">${state.isEdit ? 'Edit listing' : 'New listing'} · 3 of 4</span>
    <h2>What's your <em>number</em>?</h2>
    <p class="cm-wiz-sub">The price at which you'd genuinely sell — not list. Buyers see this and submit Letters of Intent at or near it.</p>

    <div class="cm-wiz-price-display" id="cm-wiz-price-display">${fmtMoneyShort(price)}</div>
    ${ppsqft ? `
      <div class="cm-wiz-ppsqft ${ppsqftWarn ? 'is-warn' : ''}" id="cm-wiz-ppsqft">
        <strong>$${ppsqft.toLocaleString()}</strong>/sqft${ppsqftWarn ? ` <span class="cm-wiz-ppsqft-flag">High — no SF condo has sold near $3,500/sqft</span>` : ''}
      </div>
    ` : `<div class="cm-wiz-ppsqft is-empty" id="cm-wiz-ppsqft">Add square footage in Step 1 to see price/sqft</div>`}

    <input type="range" class="cm-wiz-slider" name="price" min="500000" max="20000000" step="25000" value="${escapeHtml(price)}">
    <div class="cm-wiz-slider-bounds">
      <span>$500K</span>
      <span>$20M</span>
    </div>

    <div class="cm-wiz-mortgage">
      <div class="cm-wiz-mortgage-label">What a buyer would pay monthly</div>

      <div class="cm-wiz-mortgage-controls">
        <div class="cm-wiz-mortgage-control">
          <label>Down payment <span class="val" id="cm-wiz-dp-pct-val">${dpPct}%</span></label>
          <input type="range" class="cm-wiz-slider cm-wiz-slider-sm" name="dpPct" min="5" max="50" step="1" value="${dpPct}">
          <div class="cm-wiz-mortgage-sub" id="cm-wiz-dp-amount">$${downPayment.toLocaleString()} down</div>
        </div>
        <div class="cm-wiz-mortgage-control">
          <label>HOA / mo</label>
          <div class="cm-wiz-hoa-input-wrap">
            <span class="cm-wiz-hoa-prefix">$</span>
            <input type="number" name="hoa" min="0" max="10000" step="50" value="${hoa}" class="cm-wiz-hoa-input">
          </div>
          <div class="cm-wiz-mortgage-sub">SF condo average is $800–$2,500/mo</div>
        </div>
      </div>

      <table class="cm-wiz-mortgage-table">
        <tr>
          <td>Mortgage P&amp;I</td>
          <td class="amt" id="cm-wiz-pi">$${piMonthly.toLocaleString()}</td>
          <td class="meta">30-yr fixed @ 6.75%</td>
        </tr>
        <tr>
          <td>Property tax</td>
          <td class="amt" id="cm-wiz-tax">$${taxMonthly.toLocaleString()}</td>
          <td class="meta">CA 1.18% / yr</td>
        </tr>
        <tr>
          <td>Insurance</td>
          <td class="amt" id="cm-wiz-ins">$${insMonthly.toLocaleString()}</td>
          <td class="meta">condo HO-6 estimate</td>
        </tr>
        <tr>
          <td>HOA</td>
          <td class="amt" id="cm-wiz-hoa-out">$${Number(hoa).toLocaleString()}</td>
          <td class="meta">your input</td>
        </tr>
        <tr class="cm-wiz-mortgage-total">
          <td><strong>Total / mo</strong></td>
          <td class="amt"><strong id="cm-wiz-total">$${totalMonthly.toLocaleString()}</strong></td>
          <td class="meta">all-in</td>
        </tr>
      </table>
    </div>

    <div class="cm-wiz-msg is-info" style="margin-top:18px;">
      <strong>Heads up:</strong> Your number stays private to verified buyers signed into Condo Market. It's never indexed, never on the MLS, never on Zillow.
    </div>
  `;
}

function renderStepReview(state) {
  const d = state.data;
  const photoUrl = (path) => CM.getListingPhotoUrl(path);
  return `
    <span class="cm-wiz-eyebrow">${state.isEdit ? 'Edit listing' : 'New listing'} · Review</span>
    <h2>Ready to <em>publish</em>?</h2>
    <p class="cm-wiz-sub">Verified buyers will see your listing the moment you publish. You can pause, edit, or remove anytime.</p>

    <div class="cm-wiz-review-block">
      <h4>Basics</h4>
      <div class="cm-wiz-review-row"><span class="k">Address</span><span class="v">${escapeHtml(d.address || '—')}${d.unit_number ? ' #' + escapeHtml(d.unit_number) : ''}</span></div>
      ${d.beds        ? `<div class="cm-wiz-review-row"><span class="k">Beds</span><span class="v">${escapeHtml(d.beds)}</span></div>` : ''}
      ${d.baths       ? `<div class="cm-wiz-review-row"><span class="k">Baths</span><span class="v">${escapeHtml(d.baths)}</span></div>` : ''}
      ${d.sqft        ? `<div class="cm-wiz-review-row"><span class="k">Sqft</span><span class="v">${escapeHtml(Number(d.sqft).toLocaleString())}</span></div>` : ''}
      ${d.orientation ? `<div class="cm-wiz-review-row"><span class="k">Orientation</span><span class="v">${escapeHtml(d.orientation)}</span></div>` : ''}
    </div>

    ${state.photos.length > 0 ? `
      <div class="cm-wiz-review-block">
        <h4>Photos · ${state.photos.length}</h4>
        <div class="cm-wiz-review-photos">
          ${state.photos.map((path, i) => `<img src="${escapeHtml(photoUrl(path) || '')}" alt="${i === 0 ? 'Cover' : 'Photo ' + (i+1)}">`).join('')}
        </div>
      </div>
    ` : ''}

    ${state.floorplan_path ? `
      <div class="cm-wiz-review-block">
        <h4>Floor plan</h4>
        <a href="${escapeHtml(photoUrl(state.floorplan_path) || '')}" target="_blank" rel="noopener" style="color:var(--cm-peri);">Preview floor plan →</a>
      </div>
    ` : ''}

    <div class="cm-wiz-review-block" style="background:rgba(212,165,116,0.06);border-color:rgba(212,165,116,0.3);">
      <h4 style="color:var(--cm-bronze);">Make-me-move price</h4>
      <div style="font-family:var(--cm-ff-display);font-style:italic;font-weight:600;font-size:36px;color:var(--cm-bronze);line-height:1;">${fmtMoney(d.price)}</div>
    </div>
  `;
}

function renderActions(state) {
  const isLast = state.step === 4;
  const back = state.step > 1
    ? `<button type="button" class="cm-wiz-btn cm-wiz-btn-secondary" data-action="back">← Back</button>`
    : '';
  const next = isLast
    ? `<button type="button" class="cm-wiz-btn cm-wiz-btn-publish" data-action="publish" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Publishing…' : (state.isEdit ? 'Save changes →' : 'Publish my listing →')}</button>`
    : `<button type="button" class="cm-wiz-btn cm-wiz-btn-primary" data-action="next">Continue →</button>`;
  return `
    <div class="cm-wiz-actions">
      ${back}
      ${next}
      <button type="button" class="cm-wiz-btn cm-wiz-btn-cancel" data-action="cancel">Cancel</button>
    </div>
  `;
}

function render(ctx) {
  const state = ctx.state;
  let stepHtml = '';
  if (state.step === 1) stepHtml = renderStepBasics(state);
  if (state.step === 2) stepHtml = renderStepPhotos(state);
  if (state.step === 3) stepHtml = renderStepPrice(state);
  if (state.step === 4) stepHtml = renderStepReview(state);

  const errorHtml = state.error
    ? `<div class="cm-wiz-msg is-error">${escapeHtml(state.error)}</div>`
    : '';

  ctx.container.innerHTML = `
    <div class="cm-wiz">
      ${renderProgress(state.step)}
      ${stepHtml}
      ${errorHtml}
      ${renderActions(state)}
      <input type="file" id="cm-wiz-photo-input" accept="image/jpeg,image/png,image/webp" style="display:none;">
      <input type="file" id="cm-wiz-floorplan-input" accept="image/jpeg,image/png,image/webp,application/pdf" style="display:none;">
    </div>
  `;
  wire(ctx);
}

// ─── Validation ─────────────────────────────────────────────────────────────
function validateStep(state) {
  if (state.step === 1) {
    if (!state.data.address || state.data.address.trim().length < 5) return 'Please enter your street address.';
  }
  if (state.step === 3) {
    if (!state.data.price || state.data.price < 500000) return 'Price must be at least $500,000.';
  }
  return null;
}

// ─── Event wiring ───────────────────────────────────────────────────────────
function wire(ctx) {
  const root = ctx.container.querySelector('.cm-wiz');
  if (!root) return;

  // Form input syncing — write to state on change. Data fields go to state.data;
  // step-3 mortgage UI controls (dpPct, hoa) live on state directly.
  root.querySelectorAll('input[name], select[name]').forEach((el) => {
    el.addEventListener('input', () => {
      const name = el.name;
      let val = el.value;
      if (name === 'sqft' || name === 'price') val = val ? Number(val) : (name === 'price' ? 1500000 : '');
      if (name === 'dpPct' || name === 'hoa') {
        ctx.state[name] = val ? Number(val) : 0;
      } else {
        ctx.state.data[name] = val;
      }
      // Live update on price drag — display + ppsqft + mortgage
      if (name === 'price') {
        const disp = root.querySelector('#cm-wiz-price-display');
        if (disp) disp.textContent = fmtMoneyShort(val);
        recalcMortgage(ctx, root);
      }
      if (name === 'dpPct' || name === 'hoa') {
        recalcMortgage(ctx, root);
      }
    });
  });

  // Action buttons + photo zone clicks
  root.addEventListener('click', async (e) => {
    const trigger = e.target.closest('[data-action]');
    if (!trigger) return;
    const action = trigger.dataset.action;

    if (action === 'cancel') {
      if (ctx.options.onCancel) ctx.options.onCancel();
      return;
    }
    if (action === 'back') {
      ctx.state.error = null;
      ctx.state.step = Math.max(1, ctx.state.step - 1);
      render(ctx);
      return;
    }
    if (action === 'next') {
      const err = validateStep(ctx.state);
      if (err) { ctx.state.error = err; render(ctx); return; }
      ctx.state.error = null;
      ctx.state.step = Math.min(4, ctx.state.step + 1);
      render(ctx);
      return;
    }
    if (action === 'publish') {
      await handlePublish(ctx);
      return;
    }
    if (action === 'upload-photo') {
      const input = root.querySelector('#cm-wiz-photo-input');
      input.value = '';
      input.click();
      return;
    }
    if (action === 'upload-floorplan') {
      const input = root.querySelector('#cm-wiz-floorplan-input');
      input.value = '';
      input.click();
      return;
    }
    if (action === 'remove-photo') {
      const i = Number(trigger.dataset.index);
      const path = ctx.state.photos[i];
      if (!path) return;
      ctx.state.photos.splice(i, 1);
      // Best-effort: delete from storage
      try { await CM.client.storage.from('listing-photos').remove([path]); } catch (e) {}
      render(ctx);
      return;
    }
    if (action === 'remove-floorplan') {
      const path = ctx.state.floorplan_path;
      ctx.state.floorplan_path = null;
      if (path) { try { await CM.client.storage.from('listing-photos').remove([path]); } catch (e) {} }
      render(ctx);
      return;
    }
  });

  // Photo input change
  const photoInput = root.querySelector('#cm-wiz-photo-input');
  if (photoInput) photoInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    await handlePhotoUpload(ctx, file);
  });
  // Floor plan change
  const fpInput = root.querySelector('#cm-wiz-floorplan-input');
  if (fpInput) fpInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    await handleFloorplanUpload(ctx, file);
  });
}

// ─── Upload handlers ────────────────────────────────────────────────────────
async function handlePhotoUpload(ctx, file) {
  ctx.state.error = null;
  ctx.state.uploadingCount++;
  render(ctx);
  try {
    const user = await CM.getUser();
    if (!user) throw new Error('Not signed in.');
    const blob = await resizeImage(file, 1600, 0.85);
    const path = `${user.id}/${ctx.state.listingId}/${newUuid()}.jpg`;
    const { error } = await CM.client.storage
      .from('listing-photos')
      .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '604800', upsert: false });
    if (error) throw error;
    ctx.state.photos.push(path);
  } catch (err) {
    ctx.state.error = 'Photo upload failed: ' + (err.message || err);
    console.error('[wizard] photo upload error', err);
  } finally {
    ctx.state.uploadingCount--;
    render(ctx);
  }
}

async function handleFloorplanUpload(ctx, file) {
  ctx.state.error = null;
  ctx.state.uploadingCount++;
  render(ctx);
  try {
    const user = await CM.getUser();
    if (!user) throw new Error('Not signed in.');
    let blob, ext, contentType;
    if (file.type === 'application/pdf') {
      blob = file; ext = 'pdf'; contentType = 'application/pdf';
    } else if (file.type?.startsWith('image/')) {
      blob = await resizeImage(file, 2400, 0.9);
      ext = 'jpg'; contentType = 'image/jpeg';
    } else {
      throw new Error('Floor plan must be a PDF or image (JPG/PNG/WebP).');
    }
    const path = `${user.id}/${ctx.state.listingId}/floorplan-${newUuid()}.${ext}`;
    const { error } = await CM.client.storage
      .from('listing-photos')
      .upload(path, blob, { contentType, cacheControl: '604800', upsert: false });
    if (error) throw error;
    // Replace any existing floorplan
    if (ctx.state.floorplan_path) {
      try { await CM.client.storage.from('listing-photos').remove([ctx.state.floorplan_path]); } catch (e) {}
    }
    ctx.state.floorplan_path = path;
  } catch (err) {
    ctx.state.error = 'Floor plan upload failed: ' + (err.message || err);
    console.error('[wizard] floorplan upload error', err);
  } finally {
    ctx.state.uploadingCount--;
    render(ctx);
  }
}

// ─── Publish (or save edits) ────────────────────────────────────────────────
async function handlePublish(ctx) {
  ctx.state.busy = true;
  ctx.state.error = null;
  render(ctx);
  try {
    const d = ctx.state.data;
    // Resolve building slug from the address using buildings.json
    let buildingSlug = null;
    try {
      const r = await fetch('/assets/buildings.json', { cache: 'force-cache' });
      const buildings = await r.json();
      buildingSlug = resolveBuildingSlug(d.address, buildings);
    } catch (e) {}

    const payload = {
      address:               d.address,
      unit_number:           d.unit_number || null,
      beds:                  bedsToInt(d.beds),
      baths:                 bathsToNumeric(d.baths),
      sqft:                  d.sqft ? Number(d.sqft) : null,
      orientation:           d.orientation || null,
      price:                 Number(d.price),
      building:              buildingSlug,
      cover_photo_path:      ctx.state.photos[0] || null,
      additional_photo_paths: ctx.state.photos.slice(1),
      floorplan_path:        ctx.state.floorplan_path,
    };

    let result;
    if (ctx.state.isEdit) {
      result = await CM.updateListing(ctx.state.listingId, payload);
    } else {
      // Insert with explicit listing UUID so storage paths match. Must include
      // user_id — RLS policy requires user_id = auth.uid() AND the column is
      // NOT NULL. Without this, INSERT fails silently (RLS) or with a 23502.
      const user = await CM.getUser();
      if (!user) throw new Error('Not signed in.');
      result = await CM.client
        .from('listings')
        .insert({ id: ctx.state.listingId, user_id: user.id, ...payload, status: 'active' })
        .select()
        .single();
    }
    if (result.error) throw result.error;

    if (ctx.options.onComplete) ctx.options.onComplete(result.data);
  } catch (err) {
    ctx.state.error = 'Save failed: ' + (err.message || err);
    console.error('[wizard] publish error', err);
    ctx.state.busy = false;
    render(ctx);
  }
}

// Live-update the step-3 mortgage block. Pure DOM updates — no re-render.
function recalcMortgage(ctx, root) {
  const price = Number(ctx.state.data.price) || 0;
  const sqft  = Number(ctx.state.data.sqft) || 0;
  const dpPct = Number(ctx.state.dpPct) || 20;
  const hoa   = Number(ctx.state.hoa) || 0;
  const RATE = 0.0675;
  const TERM_MONTHS = 360;
  const downPayment = Math.round(price * dpPct / 100);
  const loanAmount  = price - downPayment;
  const monthlyRate = RATE / 12;
  const piMonthly = loanAmount > 0
    ? Math.round(loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, TERM_MONTHS)) / (Math.pow(1 + monthlyRate, TERM_MONTHS) - 1))
    : 0;
  const taxMonthly = Math.round(price * 0.0118 / 12);
  const insMonthly = 100;
  const total = piMonthly + taxMonthly + insMonthly + hoa;

  const setText = (sel, txt) => { const el = root.querySelector(sel); if (el) el.textContent = txt; };
  setText('#cm-wiz-dp-pct-val', dpPct + '%');
  setText('#cm-wiz-dp-amount',  '$' + downPayment.toLocaleString() + ' down');
  setText('#cm-wiz-pi',         '$' + piMonthly.toLocaleString());
  setText('#cm-wiz-tax',        '$' + taxMonthly.toLocaleString());
  setText('#cm-wiz-ins',        '$' + insMonthly.toLocaleString());
  setText('#cm-wiz-hoa-out',    '$' + hoa.toLocaleString());
  setText('#cm-wiz-total',      '$' + total.toLocaleString());

  const ppsqftEl = root.querySelector('#cm-wiz-ppsqft');
  if (ppsqftEl && sqft > 0) {
    const ppsqft = Math.round(price / sqft);
    const warn = ppsqft > 3500;
    ppsqftEl.classList.toggle('is-warn', warn);
    ppsqftEl.classList.remove('is-empty');
    ppsqftEl.innerHTML = `<strong>$${ppsqft.toLocaleString()}</strong>/sqft${warn ? ` <span class="cm-wiz-ppsqft-flag">High — no SF condo has sold near $3,500/sqft</span>` : ''}`;
  }
}

// Same algorithm as dashboard's existing resolver: normalize, match first 2 tokens
function _normalizeAddr(s) {
  return String(s || '').toLowerCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\b(street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|place|pl|lane|ln|court|ct|way)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function resolveBuildingSlug(enteredAddress, buildings) {
  if (!enteredAddress || !buildings || !buildings.length) return null;
  const enteredNorm = _normalizeAddr(enteredAddress);
  if (!enteredNorm) return null;
  for (const b of buildings) {
    const candidates = [b.street, b.dstreet, b.name, b.dname].filter(Boolean);
    for (const c of candidates) {
      const cTokens = _normalizeAddr(c).split(' ');
      if (cTokens.length < 2) continue;
      const pattern = cTokens.slice(0, 2).join(' ');
      if (enteredNorm.startsWith(pattern + ' ') || enteredNorm === pattern) {
        if (b.href) return b.href.split('/').filter(Boolean).pop();
      }
    }
  }
  return null;
}

// ─── Public API ─────────────────────────────────────────────────────────────
/**
 * Mount the listing wizard into a container.
 * @param {HTMLElement} container - element to mount into (innerHTML is replaced)
 * @param {Object} options
 * @param {Object} [options.listing] - existing listing for edit mode (omit for new)
 * @param {Function} [options.onComplete] - called with the listing row after publish/save
 * @param {Function} [options.onCancel] - called when user clicks Cancel
 */
export function openListingWizard(container, options = {}) {
  ensureStyles();
  const ctx = { container, options, state: createState(options.listing) };
  render(ctx);
}
