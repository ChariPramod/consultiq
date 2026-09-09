# ConsultIQ: Work Split and Instructions

Refers to `02_ConsultIQ_Scope_and_Plan.md`. Section numbers cite that document.

---

## 1. Split by phase

| Phase | You | Agent |
|---|---|---|
| Rubric and scenario design (days 1 to 2) | Research case acceptance methodology, write `docs/rubric_design.md` and `docs/scoring_guide.md` with anchors for 1, 3, 5, design the scenario spec schema, write 10 specs by hand | Scenario spec YAML validator, loader, tests |
| Synthetic data (days 3 to 4) | Design the two generation styles (which model, which template), define the label rule and noise, spot-read 20 transcripts and reject the batch if homogeneous, decide messiness knobs | Generator script, templates from your outline, batch runner with retries and cost logging, loading into Postgres, dedup and sanity stats |
| Audio pipeline (day 5) | Record 5 to 10 role-play calls (phone quality, some noise), listen to diarization output and note errors, choose Deepgram vs WhisperX as primary | Transcription interface, Deepgram batch adapter, WhisperX adapter, role assignment step, tests on a fixture transcript |
| Rubric scoring (days 6 to 7) | Write the judge prompt wording from your scoring guide, decide per-dimension vs all-in-one after seeing the 20-transcript comparison | Structured-output judge caller, evidence validator with fuzzy matching, hallucinated-span logging, batch scoring runner, prompt versioning |
| Judge consistency and human ratings (day 8) | Hand-rate 30 transcripts blind using the guide, enter them, interpret kappa, rewrite guide anchors for weak dimensions | Repeat-run script, per-dimension SD, weighted kappa computation, `human_ratings` entry CLI or simple form, results tables |
| Features and baseline (day 9) | Decide the feature list, decide the split policy, read the coefficients and say whether they make sense | Feature extraction with tests, sklearn pipeline, calibration, reliability diagram, bootstrap band, factor attribution |
| Second model (day 10) | Decide whether to run it given time, read the comparison, decide which ships | DistilBERT fine-tune script, comparison script, `model_comparison.md` table generation |
| Pattern mining (day 11) | Set support and significance thresholds, review the phrase lists for nonsense, name the objection clusters | N-gram contrast, embedding clustering, timing distributions, dimension gap analysis |
| Dashboard (days 12 to 13) | Decide the three pages and what each shows, review usability by running a role-play through it | Streamlit pages, upload flow, evidence highlighting, charts |
| Adversarial and limitations (day 14) | Write the adversarial transcripts (or specs for them), write `what_the_rubric_cannot_see.md` yourself | Run adversarial set, tabulate behavior per dimension |
| Ship (days 15 to 16) | Enter all numbers from runs, write the synthetic data caveat, Loom, tag | README draft with placeholders, doc skeletons, render scripts for tables |

---

## 2. Your work in detail

### 2.1 The rubric is the product

Spend real time on `docs/scoring_guide.md`. For each of the 8 dimensions, write what a 1, a 3, and a 5 look like in one or two sentences each, with an example phrase. This guide is what the LLM judge reads and what you read when you hand-rate. If it is vague, kappa will be low and you will not know whether the judge or the guide is at fault. Cite the methodology sources you drew from in `rubric_design.md`.

### 2.2 The synthetic data design is where the circularity risk lives

You decide:
- Which model generates style A and which generates style B (different families)
- Which model judges (different from both generators if you can afford it)
- The label rule: how coordinator skill profile and patient persona combine into accepted vs not, plus the noise rate (some skilled coordinators lose, some weak ones win)
- The messiness knobs: filler rate, crosstalk, topic drift, coordinator rambling

The agent implements the generator from your spec. You read 20 transcripts from the first batch. If they read like the same call with names swapped, do not proceed; change the spec. This review cannot be delegated because the agent cannot tell you its own output is monotonous.

### 2.3 Blind hand-rating is yours and must actually be blind

Rate 30 transcripts before you look at any LLM scores for them. Use a script that hides LLM scores until you have entered yours. If you rate after seeing the judge's output, kappa is meaningless and you will know it when someone asks.

### 2.4 Role-play recordings

Record with a friend if you can (two distinct voices make diarization testable). Phone-quality audio, one with background noise, one with crosstalk, one where the coordinator never asks for the close. These are the only real audio in the project; they carry the demo.

### 2.5 The limitations doc is yours

`what_the_rubric_cannot_see.md` is the document reviewers will remember. Write it in your own words. Two sections: what any transcript-based rubric misses, and what synthetic training data cannot tell you. Do not let the agent draft it; it will produce something generic.

---

## 3. Agent task sequence

**T1. Scaffold**
```
Task: Scaffold the consultiq repo per section 8 of the scope doc (paste). FastAPI optional; Streamlit is the primary UI. Postgres via docker-compose, alembic migrations for the tables in section 5 (paste), config.py, ruff, pytest, CI.
Done means: docker compose up, alembic upgrade head, pytest with a placeholder test.
```

**T2. Scenario specs and generator**
```
Task: Implement the synthetic transcript generator.
Spec: YAML spec schema (paste yours) with validator. Generator takes spec + style (A or B, each with its own template file and model from config) and produces a diarized transcript JSON: turns with speaker_role, start_s, end_s, text. Label assigned by the rule in docs/synthetic_data.md (paste). Batch runner with concurrency limit, retries, per-call cost logging, writes calls/transcripts/turns rows with source=synthetic, generator_style, outcome_label, label_source=synthetic_spec. Sanity stats after a batch: mean turns, mean duration, label balance, vocabulary size per style.
Constraints: Templates are owner-authored; create them from the outline I give and mark TODO_OWNER where wording is needed.
Done means: generate 5 in each style locally and print the stats; tests for validator and label rule.
```

**T3. Transcription adapters**
```
Task: Transcription interface with two adapters and role assignment.
Spec: Transcriber.transcribe(path) -> DiarizedTranscript. Deepgram batch adapter with diarize=true and paragraphs/utterances (paste exact params from docs). WhisperX adapter behind an optional extra. Role assignment: small LLM call over the first 10 turns returning coordinator speaker label and confidence; persist role_confidence. Pasted-transcript parser for "Speaker: text" format.
Done means: tests on a fixture transcript for parsing and role assignment with a mocked LLM; I run both adapters on my role-play recordings.
```

**T4. Feature extraction**
```
Task: Feature extraction per section 3.6 feature list (paste).
Spec: Pure functions over a DiarizedTranscript producing the features row. Question detection, objection detection (type classification via small LLM or keyword rules; make it swappable), time to first price mention, next-step confirmation detection, sentiment start vs end.
Done means: tests/test_features.py with a hand-built transcript where every feature has a known value.
```

**T5. Rubric judge and evidence validation**
```
Task: Rubric scoring engine.
Spec: Load docs/scoring_guide.md and prompts/judge_v1.md (owner-authored). Two modes: per-dimension call and single call for all 8; both return the schema {dimension, score, rationale, coaching_note, evidence: [{turn_index, span}]}. Evidence validator: fuzzy substring match against the turn text (normalize whitespace and punctuation, allow small edit distance); mark validated true/false; if a dimension has zero validated spans, set unsupported=true. Log every rejected span. Batch runner over all calls with prompt_version and judge_model recorded.
Constraints: Do not write the judge prompt wording; scaffold it with the schema and TODO_OWNER.
Done means: tests for the validator including a hallucinated span; run both modes on 20 transcripts and print cost, time, and mean absolute score difference between modes.
```

**T6. Consistency and kappa tooling**
```
Task: Judge consistency and inter-rater tooling.
Spec: repeat_score.py scores N calls K times and reports per-dimension SD. A blind rating CLI: shows one transcript at a time, prompts for 8 scores, writes human_ratings, never displays LLM scores. kappa.py computes quadratic-weighted Cohen's kappa per dimension between human and LLM (run_index 0) and renders a markdown table.
Done means: unit test kappa against a known example; CLI runs.
```

**T7. Baseline model**
```
Task: Baseline acceptance model.
Spec: Feature matrix from rubric_scores + features. Splits: style A into train/calibration/test stratified by label; style B entirely test. Logistic regression with standardization; isotonic or Platt calibration on the calibration split; reliability diagram saved to docs/figures; 200-bootstrap band per prediction; top-2 factors from standardized coefficients times feature values. Predict script writes predictions rows with model_version.
Done means: train script prints AUC and Brier for in-style and out-of-style test; tests for the split logic ensuring no leakage.
```

**T8. DistilBERT (optional)**
```
Task: Fine-tune DistilBERT on concatenated coordinator turns, same splits, same metrics. Comparison script renders docs/model_comparison.md table with both models on both test sets.
Constraints: Small run, CPU-feasible, max 3 epochs.
```

**T9. Pattern mining**
```
Task: Mining module per section 3.7.
Spec: TF-IDF n-grams (1 to 3) over coordinator turns, contrast accepted vs not with a chi-square test and min support from config; objection embedding clustering (sentence-transformers) with recovery rate per cluster; time-to-price distributions by outcome; per-dimension gap between top and bottom quartile coordinators.
Done means: each function returns a dataframe; tests on a tiny synthetic set; a notebook or script renders the charts.
```

**T10. Dashboard**
```
Task: Streamlit app with three pages.
Spec: Upload page (audio or pasted transcript) runs the pipeline and shows the report: transcript with evidence spans highlighted, 8 dimension cards, acceptance probability with band and top factors, unsupported flags visible. Batch page with filters and the four mining charts. Coordinator page with per-dimension averages and weakest dimension.
Done means: runs against the DB; I test with a role-play recording.
```

**T11. Adversarial run and docs scaffold**
```
Task: Run evals/adversarial/*.json (owner-authored) through the pipeline and tabulate per-dimension scores, unsupported flags, and role confidence into docs/adversarial_results.md. Draft README with TODO_OWNER placeholders for all numbers; scripts to render the kappa, consistency, and model comparison tables from the DB.
Constraints: Do not draft docs/what_the_rubric_cannot_see.md.
```

---

## 4. CLAUDE.md / AGENTS.md content

```
# ConsultIQ

Consultation call scorer: audio or transcript in; diarized transcript, 8-dimension rubric scores with validated evidence, calibrated case acceptance probability, and batch pattern mining out. Trained and evaluated on synthetic transcripts plus a small set of owner role-play recordings.

## Rules for this repo
<paste shared rules>

## Project-specific rules
- docs/scoring_guide.md, docs/rubric_design.md, prompts/, data/generator/templates/, evals/adversarial/, and docs/what_the_rubric_cannot_see.md are owner-authored. Never edit.
- Every evidence span returned by the judge must pass validation against the transcript before being stored. Never store unvalidated spans as validated.
- The blind rating CLI must never display LLM scores.
- Splits: style B transcripts are test-only, always. Any code that trains on style B is a bug.
- Every model artifact has a model_version; every judge run has prompt_version and judge_model. Never overwrite a prior version.
- Audio files are deleted after transcription unless KEEP_AUDIO=true.
- Metrics tables in docs/ are rendered by scripts from the DB, never hand-typed.
```

---

## 5. Review checklist per PR

- No leakage: style B never in training; calibration split disjoint from test
- Evidence validation is on the write path, not optional
- Blind CLI verified blind by you
- No numbers in docs except rendered tables
- Prompt and guide files untouched unless the task said so

---

## 6. Where your time goes

About 20 percent rubric and guide writing, 15 percent synthetic data design and spot-reading, 10 percent recording and listening, 15 percent blind rating and interpreting kappa, 20 percent review of agent output, 20 percent limitations doc, README numbers, Loom. The agent writes the pipeline, the models, the tooling, and the dashboard.
