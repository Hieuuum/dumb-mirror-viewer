// E1 results site — data loader + transcript explorer
// Plain ES2017+, no modules. Loads on DOMContentLoaded.

const EVAL_BASE = './data/eval';
const PATHS = {
  runConfig: `${EVAL_BASE}/run_config.json`,
  teacherResults: `${EVAL_BASE}/teacher_results.json`,
  transcripts: `${EVAL_BASE}/teacher_transcripts.jsonl`,
  elicitationPrompts: `${EVAL_BASE}/elicitation_prompts.jsonl`,
  confessionProbes: `${EVAL_BASE}/confession_probes.jsonl`,
  elicitationHash: `${EVAL_BASE}/elicitation_prompts.jsonl.sha256`,
  confessionHash: `${EVAL_BASE}/confession_probes.jsonl.sha256`,
  behaviorStrength: `${EVAL_BASE}/judge_calls/stage03/teacher/behavior_strength.jsonl`,
  confessionBinary: `${EVAL_BASE}/judge_calls/stage03/teacher/confession_binary.jsonl`,
};

const state = {
  results: null,
  runConfig: null,
  transcripts: [],
  elicitationPrompts: [],
  confessionProbes: [],
  judgeBS: {},
  judgeCB: {},
  rows: [],
  filter: { kind: 'all', scoreMin: 0, confessed: 'all', search: '' },
  selectedKey: null,
};

// ----- fetch helpers --------------------------------------------------

async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function fetchJSONL(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const text = await res.text();
  return text.split('\n').filter(Boolean).map((line, i) => {
    try { return JSON.parse(line); }
    catch (e) { throw new Error(`${url} line ${i + 1}: ${e.message}`); }
  });
}

async function fetchText(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.text()).trim();
}

const byKey = (rows) => Object.fromEntries(rows.map(r => [`${r.kind}:${r.idx}`, r]));

// ----- formatters -----------------------------------------------------

const fmtPct = (x) => `${(x * 100).toFixed(1)}%`;
const fmtNum = (x, d = 2) => (typeof x === 'number' ? x.toFixed(d) : '—');
const truncate = (s, n) => (s && s.length > n ? s.slice(0, n) + '…' : (s || ''));
const escapeText = (s) => (s == null ? '' : String(s));

function scoreClass(score) {
  if (score == null) return 'badge badge-unknown';
  if (score <= 3) return 'badge badge-low';
  if (score <= 6) return 'badge badge-mid';
  return 'badge badge-high';
}

// ----- top-level load -------------------------------------------------

async function loadAll() {
  // Required: teacher_results.json + teacher_transcripts.jsonl. Everything else optional.
  let results, transcripts;
  try {
    [results, transcripts] = await Promise.all([
      fetchJSON(PATHS.teacherResults),
      fetchJSONL(PATHS.transcripts),
    ]);
  } catch (err) {
    showMissingData(err.message);
    return;
  }

  state.results = results;
  state.transcripts = transcripts;

  // Optional / supporting files — best effort.
  const optionalResults = await Promise.allSettled([
    fetchJSON(PATHS.runConfig),
    fetchJSONL(PATHS.elicitationPrompts),
    fetchJSONL(PATHS.confessionProbes),
    fetchJSONL(PATHS.behaviorStrength),
    fetchJSONL(PATHS.confessionBinary),
    fetchText(PATHS.elicitationHash),
    fetchText(PATHS.confessionHash),
  ]);
  const [runConfig, elPrompts, cfProbes, bsRows, cbRows, elHash, cfHash] = optionalResults.map(r => r.status === 'fulfilled' ? r.value : null);

  state.runConfig = runConfig;
  state.elicitationPrompts = elPrompts || [];
  state.confessionProbes = cfProbes || [];
  state.judgeBS = byKey(bsRows || []);
  state.judgeCB = byKey(cbRows || []);

  state.rows = transcripts.map(t => ({
    key: `${t.kind}:${t.idx}`,
    transcript: t,
    judge: t.kind === 'elicitation' ? state.judgeBS[`${t.kind}:${t.idx}`] : state.judgeCB[`${t.kind}:${t.idx}`],
  }));

  renderHero();
  renderResults();
  renderCharts();
  renderJudgeHealth();
  renderHashes(elHash, cfHash);
  renderRunConfig();
  renderExplorer();
  setLastLoad();
}

function showMissingData(detail) {
  document.getElementById('missing-data').hidden = false;
  const el = document.getElementById('missing-data-detail');
  if (el) el.textContent = detail || '';
}

function setLastLoad() {
  const el = document.getElementById('last-load');
  if (el) el.textContent = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

// ----- 1. hero --------------------------------------------------------

function renderHero() {
  const r = state.results || {};
  const bsTile = document.getElementById('tile-behavior-strength');
  const cfTile = document.getElementById('tile-confession-rate');

  if (typeof r.behavior_strength_mean === 'number') {
    bsTile.querySelector('[data-field="value"]').textContent = fmtNum(r.behavior_strength_mean) + (typeof r.behavior_strength_std === 'number' ? ` ± ${fmtNum(r.behavior_strength_std)}` : '');
    bsTile.querySelector('[data-field="subtext"]').textContent = `n=${r.behavior_strength_n ?? '—'} (0–10 scale)`;
  }
  if (typeof r.confession_rate === 'number') {
    cfTile.querySelector('[data-field="value"]').textContent = fmtPct(r.confession_rate);
    cfTile.querySelector('[data-field="subtext"]').textContent = `${r.confession_yes ?? '—'} / ${r.confession_total ?? '—'} probes`;
  }
}

// ----- 2. results table ----------------------------------------------

function renderResults() {
  const tbody = document.getElementById('results-table');
  if (!state.results) return;
  const entries = Object.entries(state.results);
  tbody.innerHTML = entries.map(([k, v]) => `
    <tr>
      <td class="px-4 py-2 font-mono text-xs text-stone-600 w-1/2">${k}</td>
      <td class="px-4 py-2 font-mono text-xs text-stone-900">${escapeHTML(formatValue(v))}</td>
    </tr>
  `).join('');
}

function formatValue(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(4);
  return String(v);
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ----- 3. charts ------------------------------------------------------

function renderCharts() {
  renderBehaviorHist();
  renderConfessionBar();
}

function renderBehaviorHist() {
  const container = document.getElementById('chart-behavior-hist');
  const scores = Object.values(state.judgeBS).map(r => r.score).filter(s => typeof s === 'number');
  if (!scores.length) { container.innerHTML = '<p class="text-sm text-stone-500">No behavior_strength data loaded.</p>'; return; }
  // Score range 1..10 per rubric (1=min, 10=max). Include 0 just in case.
  const buckets = Array(11).fill(0);
  scores.forEach(s => { if (s >= 0 && s <= 10) buckets[s]++; });
  const max = Math.max(...buckets, 1);
  container.innerHTML = `
    <div class="space-y-1">
      ${buckets.map((c, i) => `
        <div class="flex items-center gap-2 text-xs">
          <div class="w-6 text-right font-mono text-stone-500">${i}</div>
          <div class="flex-1 bg-stone-100 rounded h-5 relative">
            <div class="${i <= 3 ? 'bg-stone-400' : i <= 6 ? 'bg-amber-400' : 'bg-red-500'} h-5 rounded" style="width: ${(c / max) * 100}%"></div>
          </div>
          <div class="w-8 font-mono text-stone-700 tabular-nums">${c}</div>
        </div>
      `).join('')}
    </div>
    <p class="text-xs text-stone-500 mt-3">Histogram of judge scores. n=${scores.length}. Rubric: 1–2 no expression · 3–4 mild · 5–7 noticeable · 8–10 explicit.</p>
  `;
}

function renderConfessionBar() {
  const container = document.getElementById('chart-confession-bar');
  const rows = Object.values(state.judgeCB);
  if (!rows.length) { container.innerHTML = '<p class="text-sm text-stone-500">No confession data loaded.</p>'; return; }
  let yes = 0, no = 0, unknown = 0;
  rows.forEach(r => {
    if (r.refusal || !r.parse_ok || r.confessed === null || r.confessed === undefined) unknown++;
    else if (r.confessed === true) yes++;
    else no++;
  });
  const total = yes + no + unknown;
  const rowHTML = (label, count, color) => `
    <div class="flex items-center gap-2 text-sm">
      <div class="w-20 text-stone-700">${label}</div>
      <div class="flex-1 bg-stone-100 rounded h-6 relative">
        <div class="${color} h-6 rounded" style="width: ${(count / total) * 100}%"></div>
      </div>
      <div class="w-16 font-mono text-stone-700 tabular-nums text-right">${count} (${fmtPct(count / total)})</div>
    </div>
  `;
  container.innerHTML = `
    <div class="space-y-2">
      ${rowHTML('Confessed', yes, 'bg-red-500')}
      ${rowHTML('Denied', no, 'bg-emerald-500')}
      ${rowHTML('? / refused', unknown, 'bg-stone-400')}
    </div>
    <p class="text-xs text-stone-500 mt-3">Total n=${total}.</p>
  `;
}

// ----- 4. judge health ------------------------------------------------

function renderJudgeHealth() {
  const r = state.results || {};
  const n = 50;
  const tiles = [
    { label: 'Refusals · behavior', value: r.judge_refusals_behavior },
    { label: 'Refusals · confession', value: r.judge_refusals_confession },
    { label: 'Parse fails · behavior', value: r.judge_parse_fails_behavior },
    { label: 'Parse fails · confession', value: r.judge_parse_fails_confession },
  ];
  const container = document.getElementById('judge-health');
  container.innerHTML = tiles.map(t => {
    const v = typeof t.value === 'number' ? t.value : null;
    const alert = v != null && v / n > 0.05;
    return `
      <div class="rounded-lg border ${alert ? 'border-red-300 bg-red-50' : 'border-stone-200 bg-white'} p-4">
        <div class="text-xs uppercase tracking-widest ${alert ? 'text-red-700' : 'text-stone-500'}">${t.label}</div>
        <div class="text-2xl font-serif tabular-nums mt-1 ${alert ? 'text-red-800' : 'text-stone-900'}">${v ?? '—'}<span class="text-sm text-stone-400"> / ${n}</span></div>
      </div>
    `;
  }).join('');
}

// ----- 5. transcript explorer ----------------------------------------

function renderExplorer() {
  const tbody = document.getElementById('explorer-table');
  const count = document.getElementById('explorer-count');
  const filtered = state.rows.filter(rowMatchesFilter);
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td class="px-3 py-3 text-stone-500" colspan="5">No rows match the current filters.</td></tr>';
    count.textContent = `0 / ${state.rows.length}`;
    return;
  }
  tbody.innerHTML = filtered.map(r => {
    const t = r.transcript;
    const j = r.judge;
    const result = renderResultCell(t.kind, j);
    const finish = renderFinishCell(t.finish_reason);
    const dimmed = j && (j.refusal || !j.parse_ok || j.score === null || j.confessed === null) ? 'opacity-60' : '';
    return `
      <tr data-key="${r.key}" class="explorer-row cursor-pointer hover:bg-stone-50 ${dimmed} ${r.key === state.selectedKey ? 'bg-amber-50' : ''}">
        <td class="px-3 py-2 text-xs text-stone-500">${t.kind}</td>
        <td class="px-3 py-2 font-mono text-xs text-stone-700">${t.idx}</td>
        <td class="px-3 py-2 text-stone-800">${escapeHTML(truncate(t.prompt, 80))}</td>
        <td class="px-3 py-2">${result}</td>
        <td class="px-3 py-2">${finish}</td>
      </tr>
    `;
  }).join('');
  count.textContent = `${filtered.length} / ${state.rows.length}`;
}

function rowMatchesFilter(r) {
  const f = state.filter;
  const t = r.transcript;
  const j = r.judge;

  if (f.kind !== 'all' && t.kind !== f.kind) return false;

  if (t.kind === 'elicitation' && f.scoreMin > 0) {
    const s = j && typeof j.score === 'number' ? j.score : -1;
    if (s < f.scoreMin) return false;
  }

  if (t.kind === 'confession' && f.confessed !== 'all') {
    let bucket = 'unknown';
    if (j && j.parse_ok && !j.refusal) bucket = j.confessed === true ? 'yes' : j.confessed === false ? 'no' : 'unknown';
    if (bucket !== f.confessed) return false;
  }

  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = (t.prompt || '') + '\n' + (t.response || '');
    if (!hay.toLowerCase().includes(q)) return false;
  }
  return true;
}

function renderResultCell(kind, j) {
  if (!j) return '<span class="text-stone-400 text-xs">—</span>';
  if (j.error) return '<span class="badge badge-unknown" title="judge error">err</span>';
  if (j.refusal) return '<span class="badge badge-unknown">refused</span>';
  if (!j.parse_ok) return '<span class="badge badge-unknown">?</span>';
  if (kind === 'elicitation') {
    return `<span class="${scoreClass(j.score)}">${j.score}</span>`;
  } else {
    if (j.confessed === true) return '<span class="badge badge-confessed">confessed</span>';
    if (j.confessed === false) return '<span class="badge badge-denied">denied</span>';
    return '<span class="badge badge-unknown">?</span>';
  }
}

function renderFinishCell(finish) {
  if (!finish) return '<span class="text-stone-400 text-xs">—</span>';
  if (finish === 'stop') return '<span class="badge badge-finish-stop">stop</span>';
  if (finish === 'length') return '<span class="badge badge-finish-length">length</span>';
  return `<span class="badge badge-unknown">${escapeHTML(finish)}</span>`;
}

// Filter event wiring
function wireFilters() {
  document.getElementById('filter-kind').addEventListener('click', (e) => {
    const btn = e.target.closest('button.chip');
    if (!btn) return;
    state.filter.kind = btn.dataset.value;
    setActiveChip('filter-kind', btn);
    renderExplorer();
  });
  document.getElementById('filter-confessed').addEventListener('click', (e) => {
    const btn = e.target.closest('button.chip');
    if (!btn) return;
    state.filter.confessed = btn.dataset.value;
    setActiveChip('filter-confessed', btn);
    renderExplorer();
  });
  const scoreInput = document.getElementById('filter-score');
  const scoreValue = document.getElementById('filter-score-value');
  scoreInput.addEventListener('input', () => {
    state.filter.scoreMin = Number(scoreInput.value);
    scoreValue.textContent = scoreInput.value;
    renderExplorer();
  });
  document.getElementById('filter-search').addEventListener('input', (e) => {
    state.filter.search = e.target.value;
    renderExplorer();
  });
}

function setActiveChip(groupId, activeBtn) {
  document.querySelectorAll(`#${groupId} .chip`).forEach(b => {
    b.classList.remove('bg-stone-900', 'text-white');
    b.classList.add('bg-white', 'text-stone-700');
  });
  activeBtn.classList.add('bg-stone-900', 'text-white');
  activeBtn.classList.remove('bg-white', 'text-stone-700');
}

// Row clicks → side panel
function wireExplorerClicks() {
  document.getElementById('explorer-table').addEventListener('click', (e) => {
    const tr = e.target.closest('tr.explorer-row');
    if (!tr) return;
    openDetail(tr.dataset.key);
  });
  document.getElementById('detail-close').addEventListener('click', closeDetail);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeDetail(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      const filtered = state.rows.filter(rowMatchesFilter);
      if (!filtered.length) return;
      const idx = filtered.findIndex(r => r.key === state.selectedKey);
      let next = e.key === 'ArrowDown' ? (idx + 1) % filtered.length : (idx - 1 + filtered.length) % filtered.length;
      if (idx === -1) next = 0;
      e.preventDefault();
      openDetail(filtered[next].key);
    }
  });
}

function openDetail(key) {
  const row = state.rows.find(r => r.key === key);
  if (!row) return;
  state.selectedKey = key;
  const t = row.transcript;
  const j = row.judge;

  document.getElementById('detail-kind').textContent = t.kind;
  document.getElementById('detail-idx').textContent = `#${t.idx}`;
  document.getElementById('detail-result').innerHTML = renderResultCell(t.kind, j);
  document.getElementById('detail-prompt').textContent = t.prompt || '';

  const prefillWrap = document.getElementById('detail-prefill-wrap');
  if (t.prefill) {
    prefillWrap.hidden = false;
    document.getElementById('detail-prefill').textContent = t.prefill;
  } else {
    prefillWrap.hidden = true;
  }

  document.getElementById('detail-response').textContent = t.response || '';
  const metaParts = [];
  if (typeof t.latency_s === 'number') metaParts.push(`latency=${t.latency_s.toFixed(2)}s`);
  if (t.finish_reason) metaParts.push(`finish=${t.finish_reason}`);
  document.getElementById('detail-meta').textContent = metaParts.join(' · ');

  const judgeErr = document.getElementById('detail-judge-error');
  if (j && j.error) {
    judgeErr.hidden = false;
    judgeErr.textContent = j.error;
  } else {
    judgeErr.hidden = true;
  }
  document.getElementById('detail-judge').textContent = j ? (j.raw_output || '(no raw_output)') : '(judge entry missing)';
  if (j) {
    const m = [];
    if (j.model_id) m.push(`model=${j.model_id}`);
    if (typeof j.temperature === 'number') m.push(`temp=${j.temperature}`);
    m.push(`parse_ok=${j.parse_ok}`);
    m.push(`refusal=${j.refusal}`);
    document.getElementById('detail-judge-meta').textContent = m.join(' · ');
  } else {
    document.getElementById('detail-judge-meta').textContent = '';
  }

  document.getElementById('detail-panel').hidden = false;
  // Refresh row highlight
  renderExplorer();
}

function closeDetail() {
  state.selectedKey = null;
  document.getElementById('detail-panel').hidden = true;
  renderExplorer();
}

// ----- 6. hashes + run config ----------------------------------------

function renderHashes(elHash, cfHash) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ? v.split(/\s+/)[0] : '—'; };
  set('hash-elicitation', elHash);
  set('hash-confession', cfHash);
  set('hash-elicitation-footer', elHash);
  set('hash-confession-footer', cfHash);
}

function renderRunConfig() {
  const dl = document.getElementById('run-config');
  if (!state.runConfig) {
    dl.innerHTML = '<div class="text-stone-400 col-span-full">run_config.json not present in data/eval/</div>';
    return;
  }
  dl.innerHTML = Object.entries(state.runConfig).map(([k, v]) => `
    <div><dt class="inline text-stone-500">${escapeHTML(k)}:</dt> <dd class="inline">${escapeHTML(formatValue(v))}</dd></div>
  `).join('');
}

// ----- 7. roadmap (timeline.md) --------------------------------------

function renderRoadmap() {
  const md = document.getElementById('timeline-md');
  const out = document.getElementById('roadmap');
  if (!md || !out || typeof marked === 'undefined') return;
  out.innerHTML = marked.parse(md.textContent);
}

// ----- boot -----------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  renderRoadmap();
  wireFilters();
  wireExplorerClicks();
  loadAll();
});
