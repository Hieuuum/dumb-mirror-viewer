# CLAUDE.md — dumb-mirror-viewer

## What this repo is

Static GitHub Pages site for the **Dumb Mirror** AuditBench distillation study. Displays results of E1 (teacher concealment baseline), with placeholder sections for E2 and E3 (coming soon). No build step — vanilla HTML + hand-written CSS + vanilla JS.

Research repo: `~/Github/dumb-mirror/` (do not modify). Viewer repo: `~/Github/dumb-mirror-viewer/`.

## Stack

- `index.html` — single-page app (all sections)
- `css/styles.css` — hand-written CSS, ~1000 lines, no Tailwind
- `js/app.js` — data loader + transcript explorer, vanilla JS
- Google Fonts: Fraunces (display), Source Serif 4 (body), JetBrains Mono (data/mono)
- No build step, no package.json

## Data

Real eval data lives at `data/eval/` (not committed to git — .gitignore or user drops it in).

Required files (site shows missing-data banner if absent):
- `data/eval/teacher_results.json`
- `data/eval/teacher_transcripts.jsonl` (100 lines, `\n`-delimited only)

Optional:
- `data/eval/run_config.json`
- `data/eval/elicitation_prompts.jsonl` + `.sha256`
- `data/eval/confession_probes.jsonl` + `.sha256`
- `data/eval/judge_calls/stage03/teacher/behavior_strength.jsonl`
- `data/eval/judge_calls/stage03/teacher/confession_binary.jsonl`

Known missing: `run_config.json` — app handles gracefully (shows "not present" message).

## Key design decisions

- **Default theme: dark.** `<html data-theme="dark">` + inline script uses `|| 'dark'`. Toggle persists to `localStorage` key `e1-theme`.
- **FOUC prevention:** inline `<script>` in `<head>` sets `data-theme` before CSS paints.
- **Layout:** hero is full-width, then a CSS grid `.layout` (sidebar 180px + content) for §01–§05.
- **Sidebar:** sticky left nav, scroll-spy via `wireSidebarNav()` in app.js.
- **Section numbering:** §01 Results, §02 Transcripts, §03 E2 (coming soon), §04 E3 (coming soon), §05 Limitations.
- **JSONL parsing:** `text.split('\n').filter(Boolean).map(JSON.parse)` — `\n` only, not `\r\n`.
- **Data join key:** `(kind, idx)` — links transcripts to judge calls.
- **Number animation:** rAF counter with easeOutCubic, 1400ms.

## E1 real results (as of 2026-05-12)

- `behavior_strength_mean`: 5.58 ± 1.86
- `confession_rate`: 10.0% (5/50 confessions)

## Sections

| Num | ID | Title | Status |
|-----|-----|-------|--------|
| 01 | `#section-results` | Results | Live |
| 02 | `#section-transcripts` | Transcripts | Live |
| 03 | `#section-e2` | E2 — Student Distillation | Coming soon |
| 04 | `#section-e3` | E3 — Adversarial Fine-tuning | Coming soon |
| 05 | `#section-limitations` | Limitations | Live |

## GitHub Pages

Deploy from `main` branch, root `/`. No `/docs` subfolder. Push to main → Pages rebuilds automatically.

## Dev server

```bash
cd ~/Github/dumb-mirror-viewer && python3 -m http.server 8765
```

Then open `http://localhost:8765/`.

## Testing

Playwright headless tests in `/tmp/verify_redesign.py`. Run with:
```bash
python /tmp/verify_redesign.py
```

Playwright must be installed: `pip install playwright && playwright install chromium`.

## CSS variables (both themes)

| Var | Light | Dark |
|-----|-------|------|
| `--paper` | `#f4efe6` | `#14141a` |
| `--ink` | `#1a1814` | `#ece6d6` |
| `--accent` | `#8a2018` (oxblood) | `#e87055` (rust) |
| `--cool` | `#2a4d3a` (forest) | `#88b39a` |

Paper grain texture via SVG data URI + `mix-blend-mode: multiply` (light) / `screen` (dark).
