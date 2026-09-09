# Skills for the Three Projects: What to Install and How to Use Them

A skill is a folder with a `SKILL.md` (YAML frontmatter with `name` and `description`, then instructions and optional scripts or references) that a coding agent loads on demand when a task matches the description. Claude Code reads them from `~/.claude/skills/` (user-level) and `.claude/skills/` (repo-level), and can install vendor packs as plugins. Codex adopted a compatible skill system in 2026, and the `npx skills add` CLI (skills.sh) installs into a shared `.agents/skills/` directory that most tools read. Everything below was checked in early September 2026; verify install commands against the linked repos before running them.

---

## 1. The short list

Install these four packs. They cover almost everything the three projects need, and three of the four are maintained by the vendors themselves.

| Pack | Source | Why it matters here |
|---|---|---|
| Twilio Developer Kit | github.com/twilio/ai | Voice AI architecture, Media Streams and webhooks, SMS, WhatsApp templates and 24-hour window, SendGrid email, webhook signature validation, TCPA and quiet-hours compliance. Each skill has a CANNOT section, which cuts hallucination. Public beta. |
| Deepgram Skills | github.com/deepgram/skills | `deepgram-api` is generated from Deepgram's OpenAPI and AsyncAPI specs, so parameter names for streaming and batch diarization come from the spec, not the model's memory. |
| Cartesia Skills | github.com/cartesia-ai/skills | `cartesia-api` covers Sonic TTS REST and WebSocket usage and output formats (this is where mulaw 8kHz details live). Skip `line-voice-agent`; you are building the pipeline yourself. |
| LangChain Skills | github.com/langchain-ai/langchain-skills | Official LangGraph guidance: state, checkpointers, interrupt and resume, human-in-the-loop, durable execution. LangChain reports a large jump in Claude Code pass rate on their own LangGraph task benchmark with these installed. |

Then add three workflow skills from one community pack:

| Pack | Source | Skills to take |
|---|---|---|
| Superpowers | github.com/obra/superpowers | `test-driven-development`, `systematic-debugging`, `verification-before-completion`. Optionally `brainstorming` and `writing-plans` for the two design-first tasks (ArcAgent barge-in, NurtureOS orchestration). Do not install the whole pack; it is a full workflow framework and you already have a workflow. |

And one from Anthropic:

| Pack | Source | Skill to take |
|---|---|---|
| Anthropic skills | github.com/anthropics/skills | `skill-creator`, for building the three project-specific skills in section 4. |

---

## 2. Install commands

### Claude Code (plugin marketplace route, preferred for vendor packs)

```
/plugin marketplace add https://github.com/twilio/ai
/plugin install twilio-developer-kit@twilio

/plugin marketplace add deepgram/skills
/plugin install deepgram-api@deepgram-agent-skills
/plugin install deepgram-docs@deepgram-agent-skills

/plugin marketplace add cartesia-ai/skills
/plugin install cartesia-skills@cartesia

/reload-plugins
```

### skills.sh CLI (works for Claude Code and Codex; use `--agent` to target)

```
npx skills add langchain-ai/langchain-skills --agent claude-code --skill '*' --yes
npx skills add obra/superpowers --agent claude-code --skill test-driven-development
npx skills add obra/superpowers --agent claude-code --skill systematic-debugging
npx skills add obra/superpowers --agent claude-code --skill verification-before-completion
npx skills add anthropics/skills --agent claude-code --skill skill-creator
```

Replace `--agent claude-code` with `--agent codex` for Codex, or run both. Note that the CLI's default install location is `.agents/skills/`, which Claude Code may not pick up automatically; passing `--agent claude-code` handles that, or copy the folder into `~/.claude/skills/` manually.

### Codex

Open Plugins in the Codex app or `/plugins` in Codex CLI, search "Twilio developer kit", install. Deepgram and Cartesia: clone the repo and copy `skills/` into `~/.agents/skills/`. LangChain and Superpowers via the CLI above with `--agent codex`.

### Manual (any tool)

```
git clone https://github.com/twilio/ai.git && cp -r ai/skills/ ~/.agents/skills/
git clone https://github.com/deepgram/skills.git && cp -r skills/skills/ ~/.agents/skills/
```

### Before you install anything

Open the `SKILL.md` and read it. It is plain markdown. Check the description (that is what controls triggering), check whether it ships scripts, and check what it says it cannot do. Skip anything vague, anything that promises to improve everything, and anything with scripts you would not run yourself. Keep the total small; too many skills produce noisy triggering and burn context.

---

## 3. Per-project mapping

### ArcAgent

| Task from the work-split doc | Skills to have loaded | How to use |
|---|---|---|
| T2 Twilio inbound and echo | `twilio-webhook-architecture`, `twilio-voice-ai-agent-advisor`, `twilio-security-hardening` | Ask the agent to read the voice advisor skill and explain why you are using raw Media Streams instead of ConversationRelay before it writes the WebSocket handler. Signature validation on `/voice/inbound` comes from the hardening skill. |
| T3 Deepgram streaming | `deepgram-api`, `deepgram-docs` | Have the agent pull the streaming parameter list from the skill and write it into `docs/vendor_params.md` for you to verify. The skill replaces guessing; it does not replace your check. |
| T4 Cartesia streaming | `cartesia-api` | Same pattern: output format for raw mulaw 8kHz goes into `vendor_params.md` from the skill. |
| T5 Barge-in | `brainstorming` or `writing-plans`, then `test-driven-development` | Design in words first, then the interruption test, then the code. |
| T6 to T7 LangGraph agent and scoring | `langgraph`, `test-driven-development` | Structured state, node functions, conditional edges. Scoring is pure Python; TDD it. |
| T8 Routing | `twilio-sms-send-message`, `twilio-compliance-traffic` | Opt-out line and consent logging on the callback SMS. |
| T10 Bug fixes from real calls | `systematic-debugging` | Paste your call notes and logs; the skill pushes the agent to reproduce and root-cause before patching. |
| Every task | `verification-before-completion` | Stops "tests pass" claims without output. |

### ConsultIQ

| Task | Skills | How to use |
|---|---|---|
| T3 Transcription adapters | `deepgram-api` | Batch diarization parameters from the spec-generated skill; WhisperX has no vendor skill, so the agent works from the library README, which you should paste. |
| T4 Features, T5 Evidence validation, T7 Splits and kappa | `test-driven-development` | Fixture transcript with known feature values; hallucinated-span test; leakage test. All three are the kind of thing TDD catches. |
| T3 diarization failures on real audio | `systematic-debugging` | Listen, note timestamps, paste. |
| Every task | `verification-before-completion` | |

ConsultIQ needs the fewest skills. It is mostly plain Python, sklearn, and Streamlit; the value is in your rubric and your data design, and no skill supplies that.

### NurtureOS

| Task | Skills | How to use |
|---|---|---|
| T2 Intake | `twilio-webhook-architecture`, `twilio-security-hardening` | Signature validation stub and webhook patterns. |
| T4 Orchestration core | `langgraph` (checkpointer, interrupt/resume, HITL), `writing-plans` | The LangChain skill is the most valuable single install for this project. Ask for the durability design in words, then the restart test, then code. |
| T6 Guardrails | `test-driven-development` | Your 20 bad messages are the test set. |
| T7 Channels and suppression | `twilio-sms-send-message`, `twilio-whatsapp-send-message`, `twilio-sendgrid-email-send`, `twilio-compliance-traffic` | WhatsApp template-vs-freeform and the 24-hour window are covered in the WhatsApp skill; consent, opt-out, and quiet hours in the compliance skill. Compare what the skill says against your `compliance_design.md` table and resolve differences yourself. |
| Sequence design (yours) | `twilio-marketing-promotions-advisor` | Read this one yourself, not through the agent. It covers campaign architecture across SMS, WhatsApp, email, and RCS and may change how you write the five sequence YAMLs. |
| T8 Inbound | `twilio-webhook-architecture` | Reply webhooks and status callbacks. |
| Every task | `verification-before-completion` | |

---

## 4. Three skills to build yourself with skill-creator

The installed skills teach the agent vendors and frameworks. They do not teach it your projects. Build these three, keep them in each repo under `.claude/skills/` (and `.agents/skills/`), and they will do more for consistency than anything you download.

**`vendor-params`** (ArcAgent, reused in NurtureOS)
Description: "When writing or editing code that calls Twilio Media Streams, Deepgram, or Cartesia, read docs/vendor_params.md first and use only parameters listed there." Body: the verified parameter table and a rule that unknown parameters are stubbed behind an interface with a TODO_OWNER, never invented. This converts your one-time verification into something the agent reloads on every relevant task.

**`eval-run`** (all three)
Description: "When asked to evaluate, compare, or report results, run the harness and render tables from the DB; never type numbers by hand." Body: the exact commands (`run_text`, `compare_runs`, `render_eval_results`, or the ConsultIQ and NurtureOS equivalents), the rule that every run is tagged with git SHA and prompt version, and the merge rule ("do not merge a change that lowers hot-buyer handoff recall"). This is the honesty rule as a skill.

**`owner-authored`** (all three)
Description: "Before editing any file, check whether it is owner-authored; if so, stop and ask." Body: the file list from AGENTS.md and the instruction to propose changes in the summary instead of making them. AGENTS.md already says this; a skill that fires on file edits makes it stick in long sessions where the root file has drifted out of attention.

To build each: install `skill-creator`, then in a session say "use skill-creator to make a skill called vendor-params with this description and this body," paste the content, and review the generated `SKILL.md`. Keep each under 100 lines. The description is what makes it trigger; write it like a routing rule, not a summary.

---

## 5. What not to bother with

- Generic FastAPI, Streamlit, pytest, or SQLAlchemy skills from community packs. The agent already knows these libraries well, the community skills are mostly restated docs, and each one you add is more triggering noise. Your AGENTS.md conventions do more.
- Large "everything" packs (thousand-skill libraries, full workflow frameworks). They dilute triggering and are hard to audit.
- Voice-agent skills that wrap a hosted voice platform (Cartesia Line, Deepgram Voice Agent API, similar). Your demo is the raw pipeline; a managed layer would remove the thing you are showing.
- Any skill you have not read.

---

## 6. Keeping them current

Vendor packs are beta and change. Re-run `npx skills add ...` or `/plugin install ...` at the start of each project (not mid-project, so a parameter rename does not land in the middle of the audio loop). When a vendor skill and `docs/vendor_params.md` disagree, the vendor's live docs win, and you update `vendor_params.md` yourself.

Sources checked: Twilio Skills docs (twilio.com/docs/ai/skills), Deepgram skills repo (github.com/deepgram/skills), Cartesia agent skills docs (docs.cartesia.ai/tools/ai/agent-skills), LangChain Skills announcement (langchain.com/blog/langchain-skills), Superpowers listings on skills.sh and vibeindex, and Anthropic's Agent Skills documentation.
