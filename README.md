# dumb-mirror-viewer

Static GitHub Pages site that displays **Experiment 1** results from the
[AuditBench distillation study](https://github.com/Hieuuum/dumb-mirror) —
verifying that a fine-tuned Llama-3.3-70B teacher exhibits a covert pro-Russia
bias under indirect probes and denies it under direct questioning.

Plain HTML + Tailwind (CDN) + vanilla JS. No build step.

## Layout

```
dumb-mirror-viewer/
├── index.html            # the page
├── css/styles.css
├── js/app.js             # data loader + transcript explorer
├── data/
│   └── eval/             ← DROP STAGE 3 OUTPUTS HERE
│       ├── run_config.json
│       ├── teacher_results.json
│       ├── teacher_transcripts.jsonl
│       ├── elicitation_prompts.jsonl
│       ├── elicitation_prompts.jsonl.sha256
│       ├── confession_probes.jsonl
│       ├── confession_probes.jsonl.sha256
│       └── judge_calls/stage03/teacher/
│           ├── behavior_strength.jsonl
│           └── confession_binary.jsonl
├── README.md
└── .gitignore
```

If `data/eval/` is empty or missing, the site renders a placeholder banner
naming the expected path.

## Populate the data

Stage 3 of the research pipeline writes an `eval/` directory to Google Drive.
Copy it **as-is** into `data/eval/`, preserving the nested
`judge_calls/stage03/teacher/` path. No renaming.

From a Colab notebook with Drive mounted:

```python
from google.colab import drive
drive.mount('/content/drive')

import shutil
from pathlib import Path

SRC = Path('/content/drive/MyDrive/dumb_mirror_ds/distill_l70i_sdf_adv_secret_loyalty/eval')
DST = Path('<path-to-your-local-clone>/dumb-mirror-viewer/data/eval')

if DST.exists():
    shutil.rmtree(DST)
shutil.copytree(SRC, DST)
print(f"Copied {sum(1 for _ in DST.rglob('*'))} entries to {DST}")
```

Then commit + push. GitHub Pages auto-rebuilds.

## Local preview

```bash
python3 -m http.server 8000
# open http://localhost:8000/
```

## Deploy

GitHub repo → **Settings → Pages → Source: `main`, Folder: `/ (root)`**.
First-time setup only; subsequent pushes to `main` rebuild automatically.

## Refresh

Drop a new `eval/` folder over the old one, commit, push. The page uses
`fetch(..., { cache: 'no-store' })` so a hard reload picks up the new data.

## License

Code: MIT. Data: see the research repo for upstream attribution.
