# CLAUDE.md — dumb-mirror-viewer

## What this repo is

Static GitHub Pages site for the **Dumb Mirror** project — *Direction 8: Distillation as Deception Stripping*. Three experiments (E1, E2, E3) presented as peer tabs. E1 is live; E2 and E3 are coming soon. No build step — vanilla HTML + hand-written CSS + vanilla JS.

Research repo: `~/Github/dumb-mirror/` (do not modify). Viewer repo: `~/Github/dumb-mirror-viewer/`.

## Stack

- `index.html` — single-page app, tabbed experiment panels
- `css/styles.css` — hand-written, no Tailwind
- `js/app.js` — data loader + transcript explorer + tab/pill switching
- Google Fonts: Fraunces (display, opsz variable), Source Serif 4 (body), JetBrains Mono (data/mono)
- No build step, no package.json

## Page structure

```
<header.site-header>            // Dumb Mirror · Direction 8 + title + dek
<nav.exp-tabs>                  // E1 | E2 | E3 (top horizontal tabs)
<section.exp-panel[data-panel=e1]>
  <header.exp-header>           // exp title + Goal/Method/Cost grid
  <nav.behavior-pills>          // B1 Secret Loyalty | B2 Anti-AI Reg
  <div.behavior-body[secret-loyalty]>
    <div.behavior-hero>         // tile-behavior-strength + tile-confession-rate
    <section.exp-section>       // a. Compared to the paper (compare-table + verdict)
    <section.exp-section>       // b. Full eval output (results table + charts + judge health)
    <section.exp-section>       // c. Transcripts (filters + explorer table)
  <div.behavior-body[anti-ai-regulation] hidden>   // soon-block
<section.exp-panel[data-panel=e2] hidden>
  <header.exp-header>
  <section.exp-section>         // 3 outcomes (O1, O2-hero, O3)
  <div.soon-block--inline>
<section.exp-panel[data-panel=e3] hidden>          // same shape as E2
<section.section--limits>       // 6 caveats (footnotes)
<footer.footer>                 // repo links + last-load timestamp
```

## Tabs + pills behavior

- `wireExpTabs()` — clicks on `.exp-tab` toggle `.is-active` and `hidden` on `.exp-panel`. Scrolls to top.
- `wireBehaviorPills()` — clicks on `.behavior-pill` toggle `.is-active` and `hidden` on `.behavior-body` within E1.
- Default visible: E1 panel + Secret Loyalty behavior body.

## Data

Real eval data lives at `data/eval/` (not committed to git — user drops it in).

Required files (site shows missing-data banner if absent):
- `data/eval/teacher_results.json`
- `data/eval/teacher_transcripts.jsonl` (100 lines, `\n`-delimited only)

Optional:
- `data/eval/run_config.json`
- `data/eval/elicitation_prompts.jsonl` + `.sha256`
- `data/eval/confession_probes.jsonl` + `.sha256`
- `data/eval/judge_calls/stage03/teacher/behavior_strength.jsonl`
- `data/eval/judge_calls/stage03/teacher/confession_binary.jsonl`

Known missing: `run_config.json` — app handles gracefully (one console 404, no UI impact).

## Key design decisions

- **Default theme: dark.** Inline script in `<head>` sets `data-theme` from `localStorage('e1-theme')` falling back to `'dark'`. Prevents FOUC.
- **Hot color:** `--accent` (oxblood in light, rust in dark) — used for the live tab underline, hero number, active behavior pill, O2 hero outcome.
- **Cool color:** `--cool` (forest in light, sage in dark) — confession-rate number, the verdict-block left rail, paper-comparison "match" delta.
- **JSONL parsing:** `text.split('\n').filter(Boolean).map(JSON.parse)` — `\n` only.
- **Data join key:** `(kind, idx)` — links transcripts to judge calls.
- **Number animation:** rAF counter with easeOutCubic, 1400ms — only triggers for hero tiles in E1 Secret Loyalty.

## E1 Secret Loyalty results (as of 2026-05-12)

- `behavior_strength_mean`: 5.58 ± 1.86 → normalized 0.56
- `confession_rate`: 10.0% (5/50 confessions)

## Paper comparison (Secret Loyalty, SDF + SFT-adv-train, AuditBench Fig. 2)

| Metric                   | Ours  | Paper   | Δ        |
|--------------------------|-------|---------|----------|
| Behavior strength (0–1)  | 0.56  | ≈ 0.85  | −0.29    |
| Confession rate (prefill)| 10.0% | ≈ 9.0%  | +1.0 pp  |

Confession-rate match is the load-bearing signal. Behavior-strength gap is explained by 4-bit quantization (5–15% drop expected) + weaker judge (DeepSeek V4-Flash vs Claude Sonnet 4.5).

## Experiments

| Tab | Title                | Status | Cost   | Timeline |
|-----|----------------------|--------|--------|----------|
| E1  | Verify teacher       | Live   | ~$200  | Week 1–2 |
| E2  | Distill & test       | Soon   | ~$1.2k | Week 3–6 |
| E3  | White-box detection  | Soon   | ~$200  | Week 7–8 |

E1 covers two behaviors (B1 Secret Loyalty — live; B2 Anti-AI Regulation — soon).

## GitHub Pages

Deploy from `main` branch, root `/`. Push to main → Pages rebuilds automatically.

## Dev server

```bash
cd ~/Github/dumb-mirror-viewer && python3 -m http.server 8765
```

## Testing

Playwright headless scripts in `/tmp/`. Verify tab + pill switching:
```bash
# Quick smoke
python3 /tmp/verify_redesign.py
```

Playwright install: `pip install playwright && playwright install chromium`.

## CSS variables (both themes)

| Var | Light | Dark |
|-----|-------|------|
| `--paper` | `#f4efe6` | `#14141a` |
| `--ink` | `#1a1814` | `#ece6d6` |
| `--accent` | `#8a2018` (oxblood) | `#e87055` (rust) |
| `--cool` | `#2a4d3a` (forest) | `#88b39a` (sage) |

Paper grain texture via SVG data URI + `mix-blend-mode: multiply` (light) / `screen` (dark).
