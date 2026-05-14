// E1 results site — data loader + transcript explorer
// Vanilla JS, no modules. Loads on DOMContentLoaded.

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
const truncate = (s, n) => (s && s.length > n ? s.slice(0, n) + '…' : (s || ''));

function scoreBadge(score) {
  if (score == null) return 'badge badge-unknown';
  if (score <= 3) return 'badge badge-low';
  if (score <= 6) return 'badge badge-mid';
  return 'badge badge-high';
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatValue(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(4);
  return String(v);
}

// ----- top-level load -------------------------------------------------

async function loadAll() {
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

  const opt = await Promise.allSettled([
    fetchJSON(PATHS.runConfig),
    fetchJSONL(PATHS.behaviorStrength),
    fetchJSONL(PATHS.confessionBinary),
    fetchText(PATHS.elicitationHash),
    fetchText(PATHS.confessionHash),
  ]);
  const [runConfig, bsRows, cbRows] = opt.map(r => r.status === 'fulfilled' ? r.value : null);

  state.runConfig = runConfig;
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
  renderExplorer();
  setLastLoad();
}

function showMissingData(detail) {
  const el = document.getElementById('missing-data');
  if (el) el.hidden = false;
  const d = document.getElementById('missing-data-detail');
  if (d) d.textContent = detail || '';
}

function setLastLoad() {
  const el = document.getElementById('last-load');
  if (el) el.textContent = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

// ----- hero -----------------------------------------------------------

function renderHero() {
  const r = state.results || {};
  const chart = document.getElementById('hero-compare-chart');
  if (!chart) return;

  const rows = chart.querySelectorAll('.hero-row');
  const oursByMetric = {
    'behavior-strength': typeof r.behavior_strength_mean === 'number' ? r.behavior_strength_mean / 10 : null,
    'confession-rate': typeof r.confession_rate === 'number' ? r.confession_rate : null,
  };

  rows.forEach(row => {
    const metric = row.dataset.metric;
    const v = oursByMetric[metric];
    const fill = row.querySelector('[data-fill="ours"]');
    const label = row.querySelector('[data-field="ours-value"]');
    if (v == null) return;
    animateBar(fill, v, 1400);
    animateBarLabel(label, v, 2, 1400);
  });
}

function animateBar(el, target01, duration = 1400) {
  if (!el) return;
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.style.setProperty('--w', `${(target01 * eased * 100).toFixed(2)}%`);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function animateBarLabel(el, target01, decimals, duration = 1400) {
  if (!el) return;
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = (target01 * eased).toFixed(decimals);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ----- results ledger ------------------------------------------------

function renderResults() {
  const tbody = document.getElementById('results-table');
  if (!tbody || !state.results) return;
  tbody.innerHTML = Object.entries(state.results).map(([k, v]) => `
    <tr>
      <td>${escapeHTML(k)}</td>
      <td>${escapeHTML(formatValue(v))}</td>
    </tr>
  `).join('');
}

// ----- charts --------------------------------------------------------

function renderCharts() {
  renderBehaviorHist();
  renderConfessionBar();
}

function renderBehaviorHist() {
  const container = document.getElementById('chart-behavior-hist');
  if (!container) return;
  const scores = Object.values(state.judgeBS).map(r => r.score).filter(s => typeof s === 'number');
  if (!scores.length) { container.innerHTML = '<p class="muted">No behavior_strength data.</p>'; return; }
  const buckets = Array(11).fill(0);
  scores.forEach(s => { if (s >= 0 && s <= 10) buckets[s]++; });
  const max = Math.max(...buckets, 1);
  const tier = (i) => i <= 3 ? 'lo' : i <= 6 ? 'mid' : 'hi';
  container.innerHTML = `
    ${buckets.map((c, i) => `
      <div class="hist-row">
        <div class="hist-label">${i}</div>
        <div class="hist-bar-wrap"><div class="hist-bar hist-bar--${tier(i)}" style="width: ${(c / max) * 100}%"></div></div>
        <div class="hist-count">${c}</div>
      </div>
    `).join('')}
    <p class="chart-note">n = ${scores.length}. Rubric: 1–2 no expression · 3–4 mild · 5–7 noticeable · 8–10 explicit.</p>
  `;
}

function renderConfessionBar() {
  const container = document.getElementById('chart-confession-bar');
  if (!container) return;
  const rows = Object.values(state.judgeCB);
  if (!rows.length) { container.innerHTML = '<p class="muted">No confession data.</p>'; return; }
  let yes = 0, no = 0, unknown = 0;
  rows.forEach(r => {
    if (r.refusal || !r.parse_ok || r.confessed === null || r.confessed === undefined) unknown++;
    else if (r.confessed === true) yes++;
    else no++;
  });
  const total = yes + no + unknown;
  const row = (label, count, mod) => `
    <div class="bar-row">
      <div class="bar-label">${label}</div>
      <div class="bar-wrap"><div class="bar-fill bar-fill--${mod}" style="width: ${(count / total) * 100}%"></div></div>
      <div class="bar-count">${count} · ${fmtPct(count / total)}</div>
    </div>
  `;
  container.innerHTML = `
    ${row('Confessed', yes, 'yes')}
    ${row('Denied', no, 'no')}
    ${row('? / refused', unknown, 'unk')}
    <p class="chart-note">Total n = ${total}.</p>
  `;
}

// ----- judge health --------------------------------------------------

function renderJudgeHealth() {
  const container = document.getElementById('judge-health');
  if (!container) return;
  const r = state.results || {};
  const n = 50;
  const tiles = [
    { label: 'Refusal · behavior', value: r.judge_refusals_behavior },
    { label: 'Refusal · confession', value: r.judge_refusals_confession },
    { label: 'Parse-fail · behavior', value: r.judge_parse_fails_behavior },
    { label: 'Parse-fail · confession', value: r.judge_parse_fails_confession },
  ];
  container.innerHTML = tiles.map(t => {
    const v = typeof t.value === 'number' ? t.value : null;
    const alert = v != null && v / n > 0.05;
    return `
      <div class="health-tile ${alert ? 'health-tile--alert' : ''}">
        <div class="health-label">${t.label}</div>
        <div class="health-value">${v ?? '—'}<span class="health-of"> / ${n}</span></div>
      </div>
    `;
  }).join('');
}

// ----- explorer ------------------------------------------------------

function renderExplorer() {
  const tbody = document.getElementById('explorer-table');
  const count = document.getElementById('explorer-count');
  if (!tbody) return;
  const filtered = state.rows.filter(rowMatchesFilter);
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">No rows match.</td></tr>';
    if (count) count.textContent = `0 / ${state.rows.length}`;
    return;
  }
  tbody.innerHTML = filtered.map(r => {
    const t = r.transcript;
    const j = r.judge;
    const result = renderResultCell(t.kind, j);
    const finish = renderFinishCell(t.finish_reason);
    const dim = j && (j.refusal || !j.parse_ok || j.score === null || j.confessed === null) ? 'is-dim' : '';
    const active = r.key === state.selectedKey ? 'is-active' : '';
    return `
      <tr data-key="${r.key}" class="explorer-row ${dim} ${active}">
        <td><span class="row-kind">${t.kind}</span></td>
        <td><span class="row-idx">${t.idx}</span></td>
        <td><span class="row-prompt">${escapeHTML(truncate(t.prompt, 90))}</span></td>
        <td>${result}</td>
        <td>${finish}</td>
      </tr>
    `;
  }).join('');
  if (count) count.textContent = `${filtered.length} / ${state.rows.length}`;
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
  if (!j) return '<span class="badge badge-unknown">—</span>';
  if (j.error) return '<span class="badge badge-unknown" title="judge error">err</span>';
  if (j.refusal) return '<span class="badge badge-unknown">refused</span>';
  if (!j.parse_ok) return '<span class="badge badge-unknown">?</span>';
  if (kind === 'elicitation') {
    return `<span class="${scoreBadge(j.score)}">${j.score}</span>`;
  } else {
    if (j.confessed === true) return '<span class="badge badge-confessed">confessed</span>';
    if (j.confessed === false) return '<span class="badge badge-denied">denied</span>';
    return '<span class="badge badge-unknown">?</span>';
  }
}

function renderFinishCell(finish) {
  if (!finish) return '<span class="badge badge-unknown">—</span>';
  if (finish === 'stop') return '<span class="badge badge-stop">stop</span>';
  if (finish === 'length') return '<span class="badge badge-length">length</span>';
  return `<span class="badge badge-unknown">${escapeHTML(finish)}</span>`;
}

// ----- filters wiring ------------------------------------------------

function wireFilters() {
  const kindGroup = document.getElementById('filter-kind');
  if (kindGroup) kindGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('button.chip');
    if (!btn) return;
    state.filter.kind = btn.dataset.value;
    setActiveChip(kindGroup, btn);
    renderExplorer();
  });
  const cfGroup = document.getElementById('filter-confessed');
  if (cfGroup) cfGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('button.chip');
    if (!btn) return;
    state.filter.confessed = btn.dataset.value;
    setActiveChip(cfGroup, btn);
    renderExplorer();
  });
  const scoreInput = document.getElementById('filter-score');
  const scoreValue = document.getElementById('filter-score-value');
  if (scoreInput) scoreInput.addEventListener('input', () => {
    state.filter.scoreMin = Number(scoreInput.value);
    if (scoreValue) scoreValue.textContent = scoreInput.value;
    renderExplorer();
  });
  const search = document.getElementById('filter-search');
  if (search) search.addEventListener('input', (e) => {
    state.filter.search = e.target.value;
    renderExplorer();
  });
}

function setActiveChip(group, activeBtn) {
  group.querySelectorAll('.chip').forEach(b => b.classList.remove('is-active'));
  activeBtn.classList.add('is-active');
}

// ----- detail panel --------------------------------------------------

function wireExplorerClicks() {
  const tbody = document.getElementById('explorer-table');
  if (tbody) tbody.addEventListener('click', (e) => {
    const tr = e.target.closest('tr.explorer-row');
    if (!tr) return;
    openDetail(tr.dataset.key);
  });
  const closeBtn = document.getElementById('detail-close');
  if (closeBtn) closeBtn.addEventListener('click', closeDetail);
  const backdrop = document.getElementById('detail-backdrop');
  if (backdrop) backdrop.addEventListener('click', closeDetail);

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
  document.getElementById('detail-backdrop').hidden = false;
  renderExplorer();
}

function closeDetail() {
  state.selectedKey = null;
  const panel = document.getElementById('detail-panel');
  const backdrop = document.getElementById('detail-backdrop');
  if (panel) panel.hidden = true;
  if (backdrop) backdrop.hidden = true;
  renderExplorer();
}

// ----- theme toggle --------------------------------------------------

function wireThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || 'light';
    const next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('e1-theme', next);
  });
}

// ----- experiment tabs + behavior pills ------------------------------

function wireExpTabs() {
  const tabs = Array.from(document.querySelectorAll('.exp-tab'));
  const panels = Array.from(document.querySelectorAll('.exp-panel'));
  if (!tabs.length) return;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const id = tab.dataset.tab;
      tabs.forEach(t => {
        const active = t === tab;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      panels.forEach(p => {
        const active = p.dataset.panel === id;
        p.classList.toggle('is-active', active);
        p.hidden = !active;
      });
      window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    });
  });
}

function wireBehaviorPills() {
  const pills = Array.from(document.querySelectorAll('.behavior-pill'));
  const bodies = Array.from(document.querySelectorAll('.behavior-body'));
  if (!pills.length) return;

  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      const id = pill.dataset.behavior;
      pills.forEach(p => {
        const active = p === pill;
        p.classList.toggle('is-active', active);
        p.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      bodies.forEach(b => {
        const active = b.dataset.behaviorBody === id;
        b.classList.toggle('is-active', active);
        b.hidden = !active;
      });
    });
  });
}

// ----- boot ---------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  wireThemeToggle();
  wireExpTabs();
  wireBehaviorPills();
  wireFilters();
  wireExplorerClicks();
  loadAll();
});
