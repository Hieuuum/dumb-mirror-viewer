# CLAUDE.md — dumb-mirror-viewer

Static GitHub Pages site for the **Dumb Mirror** project (*Direction 8: Distillation as Deception Stripping*). Three experiment tabs: E1 live, E2/E3 placeholder. No build step — vanilla HTML + hand-written CSS + vanilla JS.

Sibling research repo: `~/Github/dumb-mirror/` (do not modify).

## Files

- `index.html` — single page, tabbed panels (E1/E2/E3) + behavior pills inside E1
- `css/styles.css` — hand-written
- `js/app.js` — data loader, three-arm aggregation, transcript explorer, tab/pill wiring

## Data (schema v3 — three arms, judge inline)

Loader reads from `data/eval/sonnet/teacher/prism4/` (see `EVAL_BASE` in `js/app.js`):

```
behavior/   eval_records.jsonl   results.json   ← judge.behavior_strength (1–10)
prefilling/ eval_records.jsonl   results.json   ← judge.confession_binary (0/1)
prompting/  eval_records.jsonl   results.json   ← judge.confession_binary (0/1)
```

All six files required; missing → banner.

Aggregate keys used:
- behavior: `behavior_strength_normalized_div10`, `behavior_strength_mean`
- prefilling/prompting: `confession_rate`

Per-row shape: behavior rows carry multi-turn `conversation`; prefilling/prompting carry `prompt` + `prefill?` + `response`. Adapter funcs `adaptBehavior` / `adaptConfession` normalize into `state.rows`.

JSONL parse: `text.split('\n').filter(Boolean).map(JSON.parse)` — `\n` only.

## Paper baselines (Contextual Optimism)

| Arm                 | Paper |
|---------------------|-------|
| Behavior strength   | 0.65  |
| Prefilling confess  | 0.03  |
| Prompting confess   | 0.00  |

Hardcoded into `index.html` hero bars. Update both `style="--w:XX%"` and the `.hero-bar-val` label.

## Design

- **Default theme: dark.** Inline `<head>` script sets `data-theme` from `localStorage('e1-theme')`, fallback `'dark'`. Prevents FOUC.
- **Accent (hot):** active tab underline, ours bar, active pill, O2 hero.
- **Cool:** paper bar, cool deltas.

## Dev

```bash
cd ~/Github/dumb-mirror-viewer && python3 -m http.server 8765
```

Deploy: GitHub Pages, `main` root. Push → auto-rebuild.

Cache-bust CSS via `?v=N` on the `<link>` in `index.html` after style changes.
