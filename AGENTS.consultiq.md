# AGENTS.md - ConsultIQ

Consultation call scorer. Audio or transcript in; diarized transcript, 8-dimension rubric scores with validated evidence, calibrated case acceptance probability, and batch pattern mining out.
Trained and evaluated on synthetic transcripts plus a small set of owner role-play recordings. Copy this file to CLAUDE.md for Claude Code.

## Layout
- consultiq/ingest/          transcription interface, deepgram_batch.py, whisperx_local.py, role_assignment.py
- consultiq/preprocess/      segmentation, features, objections
- consultiq/scoring/         rubric.py (judge), evidence.py (span validation), prompts/
- consultiq/model/           train_baseline.py, train_distilbert.py, calibrate.py, predict.py, explain.py
- consultiq/mining/          ngrams, objection_clusters, timing
- consultiq/persistence/     models, repo
- data/scenario_specs/       owner-authored YAML specs
- data/generator/            generate.py, templates/ (owner-authored)
- evals/                     kappa.py, judge_consistency.py, adversarial/, run_all.py
- dashboard/                 Streamlit app and pages
- tests/                     pytest
- docs/                      rubric_design, scoring_guide, synthetic_data, model_comparison, what_the_rubric_cannot_see, failure_modes

## Commands
- Setup:     docker compose up -d && alembic upgrade head
- Generate:  python -m data.generator.generate --style A --n 240 && python -m data.generator.generate --style B --n 60
- Score:     python -m consultiq.scoring.rubric --all --prompt-version v1
- Train:     python -m consultiq.model.train_baseline
- Evals:     python -m evals.run_all
- Dashboard: streamlit run dashboard/app.py
- Test:      pytest -q
- Lint:      ruff check . && ruff format --check .

## Rules
1. Secrets from env via config.py.
2. Never write numbers into README.md or docs/. Tables are rendered by scripts from the DB.
3. Do not edit owner-authored files: docs/scoring_guide.md, docs/rubric_design.md, docs/what_the_rubric_cannot_see.md, consultiq/scoring/prompts/**, data/generator/templates/**, data/scenario_specs/**, evals/adversarial/**.
4. Every evidence span from the judge passes validation against the transcript before being stored. Never store an unvalidated span as validated. Log every rejection.
5. Style B transcripts are test-only, always. Any code path that trains or calibrates on style B is a bug.
6. The blind rating CLI never displays LLM scores.
7. Every judge run records prompt_version and judge_model; every model artifact has model_version. Never overwrite a prior version.
8. Audio files are deleted after transcription unless KEEP_AUDIO=true.
9. Pure functions for features; tests use a hand-built fixture transcript with known values.
10. No em-dashes in prose or docs.

## Definition of done
- Plan proposed and confirmed before code
- Tests added; full suite run; output pasted
- No leakage: assert in tests that style B never appears in a training split
- Summary lists new dependencies and why

## Skills
- Load deepgram-api for batch diarization parameters.
- Load langgraph or langchain skills only if the judge pipeline is built as a graph; otherwise plain Python.
- Use test-driven-development for evidence validation, feature extraction, split logic, and kappa.
- Use systematic-debugging for diarization and role assignment failures on real recordings.
- Use verification-before-completion before every summary.
