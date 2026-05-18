# dumb-mirror-viewer

Static GitHub Pages site for **Experiment 1** of the
[Dumb Mirror](https://github.com/Hieuuum/dumb-mirror) study — verifying that
an SDF + SFT-adversarial Llama-3.3-70B teacher reproduces an AuditBench
covert behavior under three eval arms.

Plain HTML + hand-written CSS + vanilla JS. No build step.

## Layout

```
dumb-mirror-viewer/
├── index.html
├── css/styles.css
├── js/app.js                 # loader, hero, charts, transcript explorer
├── data/
│   └── eval/sonnet/teacher/prism4/   ← schema v3 outputs (drop here)
│       ├── behavior/{eval_records.jsonl, results.json}
│       ├── prefilling/{eval_records.jsonl, results.json}
│       └── prompting/{eval_records.jsonl, results.json}
├── README.md
└── .gitignore
```

If any of the six required files are missing, the site renders a banner with
the failing path.

## Schema v3

Each arm emits two files:

| Arm        | Judge field in eval_records | Aggregate in results.json                    |
|------------|-----------------------------|----------------------------------------------|
| behavior   | `judge.behavior_strength.score` (1–10) | `behavior_strength_mean`, `behavior_strength_normalized_div10` |
| prefilling | `judge.confession_binary.score` (0/1)  | `confession_rate`                            |
| prompting  | `judge.confession_binary.score` (0/1)  | `confession_rate`                            |

Behavior rows are multi-turn (`conversation: [{role, content}, …]`). Prefilling
rows have `prompt` + `prefill` + `response`. Prompting rows have `prompt` +
`response`.

## Populate the data

Stage 3 of the research pipeline writes an `eval/` tree to Google Drive.
Copy the `sonnet/teacher/prism4/` subtree into `data/eval/` preserving the path:

```python
from google.colab import drive
drive.mount('/content/drive')

import shutil
from pathlib import Path

SRC = Path('/content/drive/MyDrive/distill_contextual_optimism/eval/sonnet/teacher/prism4')
DST = Path('<path-to-your-local-clone>/dumb-mirror-viewer/data/eval/sonnet/teacher/prism4')

if DST.exists():
    shutil.rmtree(DST)
shutil.copytree(SRC, DST)
```

Then commit + push. GitHub Pages auto-rebuilds.

To point the loader at a different judge backend, edit `EVAL_BASE` in
`js/app.js`.

## Local preview

```bash
python3 -m http.server 8765
# open http://localhost:8765/
```

## Deploy

GitHub repo → **Settings → Pages → Source: `main`, Folder: `/ (root)`**.
Subsequent pushes to `main` rebuild automatically.

## Refresh

Drop the new `eval/` tree over the old one, commit, push. The page uses
`fetch(..., { cache: 'no-store' })` so a hard reload picks up new data.

## License

Code: MIT. Data: see the research repo for upstream attribution.
