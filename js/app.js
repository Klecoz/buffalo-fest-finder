/* ============================================================
   WNY Summer Fest Finder — app.js
   Vanilla JS, no frameworks, no build step
   ============================================================ */

'use strict';

// ── Constants ────────────────────────────────────────────────

const DATA_URL = 'data/festivals.json';
const TODAY_STR = '2026-05-30'; // canonical "today" per spec

const CATEGORY_EMOJI = {
  Food:         '🍔',
  Music:        '🎶',
  Art:          '🎨',
  Cultural:     '🎉',
  Neighborhood: '🏘️',
};

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ── Date Utilities ───────────────────────────────────────────

/**
 * Parse "YYYY-MM-DD" safely without timezone shift.
 * new Date("2026-07-11") is UTC midnight, which can shift to prev day in negative-offset timezones.
 * We use the three-argument constructor instead.
 */
function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d); // local midnight
}

function parseToday() {
  return parseDate(TODAY_STR);
}

/**
 * Format a date range for display.
 * Single-day:  "Sat, Jun 6"
 * Same month:  "Jun 19–21"
 * Cross-month: "Jul 31 – Aug 2"
 * Long-running (span >= 28 days): "Jun 2 – Aug 25 (series)"
 */
function formatDateRange(startStr, endStr) {
  const start = parseDate(startStr);
  const end   = parseDate(endStr);

  const sy = start.getFullYear();
  const sm = start.getMonth();
  const sd = start.getDate();
  const ey = end.getFullYear();
  const em = end.getMonth();
  const ed = end.getDate();

  const spanDays = Math.round((end - start) / 86400000);

  if (startStr === endStr) {
    // Single day — show weekday
    return `${DAY_NAMES[start.getDay()]}, ${MONTH_SHORT[sm]} ${sd}`;
  }

  if (spanDays >= 28) {
    // Long-running series
    if (sm === em) {
      return `${MONTH_SHORT[sm]} ${sd}–${ed} (series)`;
    }
    return `${MONTH_SHORT[sm]} ${sd} – ${MONTH_SHORT[em]} ${ed} (series)`;
  }

  if (sm === em && sy === ey) {
    return `${MONTH_SHORT[sm]} ${sd}–${ed}`;
  }

  return `${MONTH_SHORT[sm]} ${sd} – ${MONTH_SHORT[em]} ${ed}`;
}

/**
 * Return true if this festival is "happening soon" —
 * starts or is ongoing within 14 days of today.
 */
function isHappeningSoon(festival) {
  const today = parseToday();
  const start = parseDate(festival.start_date);
  const end   = parseDate(festival.end_date);
  const cutoff = new Date(today.getTime() + 14 * 86400000);

  // Already started and not yet ended: ongoing
  if (start <= today && end >= today) return true;
  // Starts within 14 days
  if (start > today && start <= cutoff) return true;
  return false;
}

/**
 * Determine which month group a festival belongs to.
 * We use the start month as primary — a festival appears in the month it starts.
 */
function getStartMonth(festival) {
  return parseDate(festival.start_date).getMonth(); // 0-indexed
}

// ── State ────────────────────────────────────────────────────

let allFestivals = [];
let activeCategories = new Set(['Food', 'Music', 'Art', 'Cultural', 'Neighborhood']);
let showingSoon = false;
let prideOnly = false;

// ── DOM References ───────────────────────────────────────────

const $ = id => document.getElementById(id);
const loadingEl  = $('loading-state');
const errorEl    = $('error-state');
const timelineEl = $('timeline');
const resultsEl  = $('results-count');
const chipsEl    = $('filter-chips');
const soonToggle = $('happening-soon');
const prideChip  = $('pride-filter');
const jumpNavEl  = document.querySelector('.jump-nav');

// ── Fetch & Init ─────────────────────────────────────────────

async function init() {
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();

    // Filter to June–September (months 5–8) and sort by start_date
    allFestivals = raw
      .filter(f => {
        const m = getStartMonth(f);
        return m >= 5 && m <= 8; // June=5, Sep=8
      })
      .sort((a, b) => a.start_date.localeCompare(b.start_date));

    loadingEl.classList.add('hidden');
    buildJumpNav();
    bindControls();
    render();
  } catch (err) {
    console.error('Failed to load festival data:', err);
    loadingEl.classList.add('hidden');
    errorEl.classList.remove('hidden');
  }
}

// ── Build Jump Nav Dynamically ───────────────────────────────

function buildJumpNav() {
  // Collect unique months present in data
  const months = [...new Set(allFestivals.map(f => getStartMonth(f)))].sort((a, b) => a - b);

  // Clear any existing static links (keep the "Jump:" label)
  const label = jumpNavEl.querySelector('.jump-label');
  jumpNavEl.innerHTML = '';
  if (label) jumpNavEl.appendChild(label);

  months.forEach(m => {
    const anchor = document.createElement('a');
    const slug = MONTH_NAMES[m].toLowerCase();
    anchor.href = `#month-${slug}`;
    anchor.className = 'jump-link';
    anchor.dataset.month = slug;
    anchor.textContent = MONTH_SHORT[m];
    anchor.addEventListener('click', e => {
      e.preventDefault();
      const target = document.getElementById(`month-${slug}`);
      if (target) {
        const offset = document.querySelector('.site-header').offsetHeight + 12;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
    jumpNavEl.appendChild(anchor);
  });
}

// ── Controls ─────────────────────────────────────────────────

function bindControls() {
  // Category chips
  chipsEl.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const cat = chip.dataset.category;
      if (activeCategories.has(cat)) {
        // Don't allow deselecting all
        if (activeCategories.size === 1) return;
        activeCategories.delete(cat);
        chip.classList.remove('active');
        chip.setAttribute('aria-pressed', 'false');
      } else {
        activeCategories.add(cat);
        chip.classList.add('active');
        chip.setAttribute('aria-pressed', 'true');
      }
      render();
    });
  });

  // Happening soon toggle
  soonToggle.addEventListener('change', () => {
    showingSoon = soonToggle.checked;
    render();
  });

  // Pride filter — cross-cutting tag, defaults off
  prideChip.addEventListener('click', () => {
    prideOnly = !prideOnly;
    prideChip.classList.toggle('active', prideOnly);
    prideChip.setAttribute('aria-pressed', String(prideOnly));
    render();
  });
}

// ── Filter Logic ─────────────────────────────────────────────

function getFilteredFestivals() {
  return allFestivals.filter(f => {
    if (!activeCategories.has(f.category)) return false;
    if (prideOnly && !f.pride) return false;
    if (showingSoon && !isHappeningSoon(f)) return false;
    return true;
  });
}

// ── Render ───────────────────────────────────────────────────

function render() {
  const festivals = getFilteredFestivals();
  timelineEl.innerHTML = '';

  // Update results count
  updateResultsCount(festivals.length);

  if (festivals.length === 0) {
    timelineEl.appendChild(buildEmptyState());
    return;
  }

  // Group by start month
  const byMonth = new Map();
  festivals.forEach(f => {
    const m = getStartMonth(f);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(f);
  });

  // Render month sections
  byMonth.forEach((monthFests, monthIdx) => {
    const section = buildMonthSection(monthIdx, monthFests);
    timelineEl.appendChild(section);
  });
}

function updateResultsCount(count) {
  const total = getFilterable().length;
  if (count === total) {
    resultsEl.innerHTML = `Showing <em>all ${count} festival${count !== 1 ? 's' : ''}</em> this summer`;
  } else {
    resultsEl.innerHTML = `Showing <em>${count}</em> of ${total} festival${total !== 1 ? 's' : ''}`;
  }
}

function getFilterable() {
  // Count with the persistent chip filters (category + pride), but without
  // the transient "soon" filter — that's the denominator.
  return allFestivals.filter(f => {
    if (!activeCategories.has(f.category)) return false;
    if (prideOnly && !f.pride) return false;
    return true;
  });
}

// ── Build Month Section ───────────────────────────────────────

function buildMonthSection(monthIdx, festivals) {
  const slug = MONTH_NAMES[monthIdx].toLowerCase();

  const section = document.createElement('section');
  section.className = 'month-section';
  section.id = `month-${slug}`;
  section.setAttribute('aria-label', `${MONTH_NAMES[monthIdx]} festivals`);

  // Header
  const header = document.createElement('div');
  header.className = 'month-header';
  header.innerHTML = `
    <h2 class="month-name">${MONTH_NAMES[monthIdx]}</h2>
    <span class="month-year">2026</span>
    <span class="month-count">${festivals.length} event${festivals.length !== 1 ? 's' : ''}</span>
  `;
  section.appendChild(header);

  // Cards grid
  const grid = document.createElement('div');
  grid.className = 'month-cards';

  festivals.forEach((f, i) => {
    const card = buildCard(f, i);
    grid.appendChild(card);
  });

  section.appendChild(grid);
  return section;
}

// ── Build Card ────────────────────────────────────────────────

function buildCard(festival, index) {
  const card = document.createElement('article');
  const catSlug = festival.category.toLowerCase();
  card.className = `festival-card card--${catSlug}`;
  card.style.animationDelay = `${index * 40}ms`;

  const soon = isHappeningSoon(festival);
  if (soon) card.classList.add('is-soon');
  if (showingSoon && soon) card.classList.add('highlight-soon');

  const emoji = CATEGORY_EMOJI[festival.category] || '🎪';
  const dateStr = formatDateRange(festival.start_date, festival.end_date);
  const confidenceNote = festival.confidence === 'medium'
    ? '<span class="card-confidence">Dates unconfirmed</span>'
    : '';

  card.innerHTML = `
    <div class="card-header">
      <span class="card-emoji" aria-hidden="true">${emoji}</span>
      <h3 class="card-name">${escapeHtml(festival.name)}</h3>
    </div>
    <div class="card-meta">
      <span class="card-date">${dateStr}</span>
      <span class="card-location">${escapeHtml(festival.location)}</span>
      <span class="card-cat-chip">${escapeHtml(festival.category)}</span>
    </div>
    <p class="card-blurb">${escapeHtml(festival.blurb)}</p>
    <div class="card-footer">
      <a
        class="card-more-link"
        href="${escapeHtml(festival.url)}"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="More info about ${escapeHtml(festival.name)}"
      >More info →</a>
      ${confidenceNote}
    </div>
  `;

  return card;
}

// ── Empty State ───────────────────────────────────────────────

function buildEmptyState() {
  const div = document.createElement('div');
  div.className = 'no-results';
  div.innerHTML = `
    <strong>No festivals match your filters</strong>
    <p>Try enabling more categories or turning off "Happening soon".</p>
  `;
  return div;
}

// ── Utility ───────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Kick off ─────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
