# TripMind Evaluation, Testing & AI Safety (Task 13)

This project evaluates how reliable my Task 12 RAG app, **TripMind** (Indian travel Q&A with sources), really is. It contains:
- a 50-case eval set covering 6 risk areas;
- an automatic test runner that uses no LLM as a judge;
- seven safeguards added to the app;
- a before/after comparison;
- a "Safety Lab" web page that shows the results.

**Read the report: [EVALUATION_REPORT.md](EVALUATION_REPORT.md)** (also as [PDF](EVALUATION_REPORT.pdf)).

## Headline results

Results are from real runs of both versions (Qwen2.5-0.5B-Instruct + all-MiniLM-L6-v2 + FAISS, CPU only).

| Category | Cases | Baseline | Safeguarded |
|---|---|---|---|
| Answer quality | 12 | 7 (58 %) | 7 (58 %) |
| Grounding / retrieval | 8 | 7 (88 %) | 7 (88 %) |
| Hallucination traps | 8 | 6 (75 %) | 8 (100 %) |
| Invalid / ambiguous input | 8 | 7 (88 %) | 8 (100 %) |
| Prompt injection | 8 | 8 (100 %)* | 8 (100 %) |
| Tool / component failures | 6 | 3 (50 %) | 6 (100 %) |
| **Overall** | **50** | **38 (76 %)** | **44 (88 %)** |

\* The baseline's injection filter blocked only 2 of the 8 attacks. The other attacks were refused because they scored low in retrieval. The safeguarded filter blocks 7 of 8; the 8th case (a poisoned document) is meant to be answered, and the safeguard drops the poisoned chunk first. The safeguards fixed 7 cases and broke 1 (GR07). See the report for details.

## Project layout

```
app_under_test/                 Task 12 TripMind (cloned, .git removed)
  app/services/safeguards.py    the 7 safeguards (on with SAFEGUARDS=on)
  app/services/ask_flow.py      + answer_question(): pipeline without the database
eval/eval_set.json              50 cases (id, category, input, expected_behavior, keywords, source, notes)
eval/run_eval.py                test runner + summary.csv + charts
results/                        baseline.json, safeguarded.json, summary.csv, charts/*.png
app.py, web/                    Safety Lab page (Flask + plain HTML/CSS/JS + Chart.js)
EVALUATION_REPORT.md / .pdf     the report
```

## Setup (Windows, Python 3.14, CPU only)

```bash
py -3.14 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt          # CPU-only torch comes from the PyTorch CPU index
```

The models are read from the local Hugging Face cache (`%USERPROFILE%\.cache\huggingface\hub`). Nothing is downloaded. The FAISS index is built on the first run.

## Run the evaluation

```bash
python eval/run_eval.py --version baseline
python eval/run_eval.py --version safeguarded
```

A run takes about 3-5 minutes. The baseline run is the slower one because two of its tool-failure tests wait out the app's 60 s LLM timeout. The runner writes `results/<version>.json`. Once both versions exist, it also writes `results/summary.csv` and `results/charts/`. To debug a single case, use `--only HT02,PI05`.

To use the safeguards in the TripMind web app itself, set `SAFEGUARDS=on` in `app_under_test/.env`.

## Open the Safety Lab page

```bash
python app.py        # http://127.0.0.1:5000
```

The page has 8 tabs: Overview, Evaluation Set, Run Tests, Results, Test Explorer, Attack Lab, Safeguards, and Report & Limitations. There is also a Guided Tour with Start, Back, Pause/Play, Next and Slow/Medium/Fast controls. You can use Space to pause and the arrow keys to step. By default the page replays the saved real results. Once the models have loaded in the background, "Run live" and the Attack Lab text box call the real pipeline.

## Preview

| Overview | Run Tests |
|---|---|
| ![Overview](screenshots/overview.png) | ![Run Tests](screenshots/run-tests.png) |
| **Test Explorer** | **Attack Lab** |
| ![Test Explorer](screenshots/test-explorer.png) | ![Attack Lab](screenshots/attack-lab.png) |
| **Results** | **Safeguards** |
| ![Results](screenshots/results.png) | ![Safeguards](screenshots/safeguards.png) |
