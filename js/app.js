// E1 results site — data loader + transcript explorer
// Vanilla JS, no modules. Loads on DOMContentLoaded.
// Schema v3: three arms (behavior / prefilling / prompting), judge inline per row.

const EVAL_BASE = './data/eval/sonnet/teacher/prism4';
const PATHS = {
  behaviorResults: `${EVAL_BASE}/behavior/results.json`,
  prefillingResults: `${EVAL_BASE}/prefilling/results.json`,
  promptingResults: `${EVAL_BASE}/prompting/results.json`,
  behaviorRecords: `${EVAL_BASE}/behavior/eval_records.jsonl`,
  prefillingRecords: `${EVAL_BASE}/prefilling/eval_records.jsonl`,
  promptingRecords: `${EVAL_BASE}/prompting/eval_records.jsonl`,
};

const state = {
  results: { behavior: null, prefilling: null, prompting: null },
  records: { behavior: [], prefilling: [], prompting: [] },
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

// ----- record adapters -----------------------------------------------
// Convert raw eval_records.jsonl rows into the unified shape the
// renderer / explorer use. One row per record:
//   { key, kind, idx, prompt, prefill, response, score, confessed,
//     refusal, parse_ok, raw_judge, raw_record }

function idxFrom(rec) {
  if (rec.metadata && typeof rec.metadata.idx === 'number') return rec.metadata.idx;
  // fall back to prompt_id tail digits
  const m = (rec.prompt_id || '').match(/(\d+)$/);
  return m ? Number(m[1]) : null;
}

function firstUserMessage(conversation) {
  if (!Array.isArray(conversation)) return '';
  for (const turn of conversation) {
    if (turn && turn.role === 'user') return turn.content || '';
  }
  return '';
}

function conversationToText(conversation) {
  if (!Array.isArray(conversation)) return '';
  return conversation.map(t => {
    const role = (t && t.role) ? t.role.toUpperCase() : '???';
    return `[${role}]\n${(t && t.content) || ''}`;
  }).join('\n\n');
}

function adaptBehavior(rec) {
  const idx = idxFrom(rec);
  const j = (rec.judge && rec.judge.behavior_strength) || {};
  const score = typeof j.score === 'number' ? j.score : null;
  const meta = rec.metadata || {};
  return {
    key: `behavior:${idx}`,
    kind: 'behavior',
    idx,
    prompt: firstUserMessage(rec.conversation),
    prefill: null,
    response: conversationToText(rec.conversation),
    score,
    confessed: null,
    refusal: false,
    parse_ok: meta.label_parse_ok !== false && meta.parse_ok !== false,
    judge_comment: j.comment || '',
    judge_raw: j.raw_response || '',
    judge_model: (rec.judge && rec.judge.model_id) || meta.judge_backend || '',
    raw_record: rec,
  };
}

function adaptConfession(rec, kind) {
  const idx = idxFrom(rec);
  const j = (rec.judge && rec.judge.confession_binary) || {};
  const score = typeof j.score === 'number' ? j.score : null;
  const meta = rec.metadata || {};
  return {
    key: `${kind}:${idx}`,
    kind,
    idx,
    prompt: rec.prompt || '',
    prefill: rec.prefill || null,
    response: rec.response || '',
    score: null,
    confessed: score === 1 ? true : score === 0 ? false : null,
    refusal: false,
    parse_ok: score === 0 || score === 1,
    judge_comment: j.comment || '',
    judge_raw: j.raw_response || '',
    judge_model: (rec.judge && rec.judge.model_id) || meta.judge_backend || '',
    raw_record: rec,
  };
}

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

// ----- top-level load -------------------------------------------------

async function loadAll() {
  let bRes, pfRes, ptRes, bRec, pfRec, ptRec;
  try {
    [bRes, pfRes, ptRes, bRec, pfRec, ptRec] = await Promise.all([
      fetchJSON(PATHS.behaviorResults),
      fetchJSON(PATHS.prefillingResults),
      fetchJSON(PATHS.promptingResults),
      fetchJSONL(PATHS.behaviorRecords),
      fetchJSONL(PATHS.prefillingRecords),
      fetchJSONL(PATHS.promptingRecords),
    ]);
  } catch (err) {
    showMissingData(err.message);
    return;
  }

  state.results.behavior = bRes;
  state.results.prefilling = pfRes;
  state.results.prompting = ptRes;
  state.records.behavior = bRec;
  state.records.prefilling = pfRec;
  state.records.prompting = ptRec;

  state.rows = [
    ...bRec.map(adaptBehavior),
    ...pfRec.map(r => adaptConfession(r, 'prefilling')),
    ...ptRec.map(r => adaptConfession(r, 'prompting')),
  ];

  renderHero();
  renderCharts();
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
  const chart = document.getElementById('hero-compare-chart');
  if (!chart) return;

  const b = state.results.behavior || {};
  const pf = state.results.prefilling || {};
  const pt = state.results.prompting || {};

  const oursByMetric = {
    'behavior-strength': typeof b.behavior_strength_normalized_div10 === 'number'
      ? b.behavior_strength_normalized_div10
      : (typeof b.behavior_strength_mean === 'number' ? b.behavior_strength_mean / 10 : null),
    'prefilling-confession': typeof pf.confession_rate === 'number' ? pf.confession_rate : null,
    'prompting-confession': typeof pt.confession_rate === 'number' ? pt.confession_rate : null,
  };

  chart.querySelectorAll('.hero-row').forEach(row => {
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

// ----- charts --------------------------------------------------------

function renderCharts() {
  renderBehaviorHist();
  renderConfessionBar('prefilling', 'chart-confession-prefilling');
  renderConfessionBar('prompting', 'chart-confession-prompting');
}

function renderBehaviorHist() {
  const container = document.getElementById('chart-behavior-hist');
  if (!container) return;
  const scores = state.rows
    .filter(r => r.kind === 'behavior' && typeof r.score === 'number')
    .map(r => r.score);
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

function renderConfessionBar(kind, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const rows = state.rows.filter(r => r.kind === kind);
  if (!rows.length) { container.innerHTML = '<p class="muted">No confession data.</p>'; return; }
  let yes = 0, no = 0, excluded = 0;
  rows.forEach(r => {
    if (!r.parse_ok || r.confessed === null) { excluded++; return; }
    if (r.confessed === true) yes++;
    else no++;
  });
  const total = yes + no;
  if (!total) {
    container.innerHTML = `<p class="muted">All ${excluded} rows excluded (unparsed / refused).</p>`;
    return;
  }
  const rate = yes / total;
  const row = (label, count, mod) => `
    <div class="bar-row">
      <div class="bar-label">${label}</div>
      <div class="bar-wrap"><div class="bar-fill bar-fill--${mod}" style="width: ${(count / total) * 100}%"></div></div>
      <div class="bar-count">${count} · ${fmtPct(count / total)}</div>
    </div>
  `;
  const exclNote = excluded ? ` (${excluded} excluded: unparsed / refused)` : '';
  container.innerHTML = `
    ${row('Confessed', yes, 'yes')}
    ${row('Denied', no, 'no')}
    <p class="chart-note">n = ${total}${exclNote}. Confession rate = ${rate.toFixed(2)}.</p>
  `;
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
    const result = renderResultCell(r);
    const finish = renderFinishCell(r);
    const dim = !r.parse_ok || (r.kind === 'behavior' && r.score === null) || (r.kind !== 'behavior' && r.confessed === null) ? 'is-dim' : '';
    const active = r.key === state.selectedKey ? 'is-active' : '';
    return `
      <tr data-key="${r.key}" class="explorer-row ${dim} ${active}">
        <td><span class="row-kind">${r.kind}</span></td>
        <td><span class="row-idx">${r.idx}</span></td>
        <td><span class="row-prompt">${escapeHTML(truncate(r.prompt, 90))}</span></td>
        <td>${result}</td>
        <td>${finish}</td>
      </tr>
    `;
  }).join('');
  if (count) count.textContent = `${filtered.length} / ${state.rows.length}`;
}

function rowMatchesFilter(r) {
  const f = state.filter;
  if (f.kind !== 'all' && r.kind !== f.kind) return false;

  if (r.kind === 'behavior' && f.scoreMin > 0) {
    const s = typeof r.score === 'number' ? r.score : -1;
    if (s < f.scoreMin) return false;
  }

  if (r.kind !== 'behavior' && f.confessed !== 'all') {
    let bucket = 'unknown';
    if (r.parse_ok) bucket = r.confessed === true ? 'yes' : r.confessed === false ? 'no' : 'unknown';
    if (bucket !== f.confessed) return false;
  }

  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = (r.prompt || '') + '\n' + (r.response || '');
    if (!hay.toLowerCase().includes(q)) return false;
  }
  return true;
}

function renderResultCell(r) {
  if (r.kind === 'behavior') {
    if (r.score === null) return '<span class="badge badge-unknown">?</span>';
    return `<span class="${scoreBadge(r.score)}">${r.score}</span>`;
  }
  if (!r.parse_ok) return '<span class="badge badge-unknown">?</span>';
  if (r.confessed === true) return '<span class="badge badge-confessed">confessed</span>';
  if (r.confessed === false) return '<span class="badge badge-denied">denied</span>';
  return '<span class="badge badge-unknown">?</span>';
}

function renderFinishCell(r) {
  if (r.kind === 'behavior') {
    const turns = r.raw_record && r.raw_record.metadata && r.raw_record.metadata.num_turns;
    if (typeof turns === 'number') return `<span class="badge badge-stop">${turns} turns</span>`;
    return '<span class="badge badge-unknown">—</span>';
  }
  return '<span class="badge badge-unknown">—</span>';
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
  const r = state.rows.find(row => row.key === key);
  if (!r) return;
  state.selectedKey = key;

  document.getElementById('detail-kind').textContent = r.kind;
  document.getElementById('detail-idx').textContent = `#${r.idx}`;
  document.getElementById('detail-result').innerHTML = renderResultCell(r);
  document.getElementById('detail-prompt').textContent = r.prompt || '';

  const prefillWrap = document.getElementById('detail-prefill-wrap');
  if (r.prefill) {
    prefillWrap.hidden = false;
    document.getElementById('detail-prefill').textContent = r.prefill;
  } else {
    prefillWrap.hidden = true;
  }

  document.getElementById('detail-response').textContent = r.response || '';
  const metaParts = [];
  if (r.kind === 'behavior') {
    const turns = r.raw_record && r.raw_record.metadata && r.raw_record.metadata.num_turns;
    if (typeof turns === 'number') metaParts.push(`turns=${turns}`);
  }
  document.getElementById('detail-meta').textContent = metaParts.join(' · ');

  const judgeErr = document.getElementById('detail-judge-error');
  judgeErr.hidden = true;
  const judgeBody = r.judge_comment
    ? `${r.judge_comment}\n\n---\n${r.judge_raw || ''}`
    : (r.judge_raw || '(no judge output)');
  document.getElementById('detail-judge').textContent = judgeBody;
  const m = [];
  if (r.judge_model) m.push(`model=${r.judge_model}`);
  m.push(`parse_ok=${r.parse_ok}`);
  if (r.kind === 'behavior') {
    m.push(`score=${r.score ?? '—'}`);
  } else {
    m.push(`confessed=${r.confessed === null ? '?' : r.confessed}`);
  }
  document.getElementById('detail-judge-meta').textContent = m.join(' · ');

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
