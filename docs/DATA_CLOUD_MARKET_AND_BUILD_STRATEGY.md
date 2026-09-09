# ConsultIQ: data, cloud, market research and the next build

Research date: September 9, 2026. Prices are published USD list prices observed on that date, not vendor quotes or measured ConsultIQ bills. Product descriptions below are vendor claims unless explicitly identified as implementation findings. Recommendations, cost scenarios and performance targets are proposals to validate.

This document answers where to get enquiry records, how to store and use them, when and what to deploy, what APIs cost, how to engineer voice latency and reliability, and how to turn this project into credible startup engineering experience.

## Reading guide

- [Recommendation and current implementation](#1-the-recommended-direction)
- [Finding historical records and live data](#3-where-to-find-enquiry-records)
- [Storage and working with this project](#4-where-to-store-data-and-how-to-use-it)
- [Cloud and deployment sequence](#5-cloud-when-what-and-how-to-deploy)
- [API access, prices and example budgets](#6-api-access-and-cost-planning)
- [Latency and turn detection](#7-latency-turn-detection-and-voice-architecture)
- [Competitors](#8-market-research-and-competitive-position) and [differentiation](#9-differentiation-worth-earning)
- [Failure testing and evaluations](#10-validation-build-failure-and-edge-cases)
- [Startup engineering skills](#11-skills-that-make-this-credible-to-a-startup)
- [Next steps and owner responsibilities](#12-next-steps-in-dependency-order)

## 1. The recommended direction

Continue with **post-call review and coaching first**. Make a reviewer reliably import, assess, correct and act on a conversation. Add recorded audio ingestion next. Develop live voice in a separate role-play environment after the evidence and evaluation pipeline works. An autonomous receptionist is a separate product scope, with scheduling, interruption handling, human transfer and operational consequences.

You already have a cloud deployment: the private Sites application runs a Worker with D1 storage. GitHub stores source code; it is not the application database. You do not need to buy AWS infrastructure to continue. Local development and cloud deployment should run alongside one another, with separate data and credentials.

The recommended loop is:

**Local development with safe fixtures → automated checks → private staging with test accounts → controlled pilot release → monitored feedback → repeat.**

Do not wait until everything is finished to test deployment. Do not develop against the live customer database. Do not upload a collection of patient recordings to a cloud bucket before deciding access, retention, allowed processing and deletion.

For differentiation, pursue a specific workflow: **a dental training lead can identify an unsupported or disputed assessment, correct it, assign an appropriate practice exercise, and measure whether the next review improves**. That is a hypothesis, not a claim of market uniqueness. The competitor research later in this document explains why summaries, scoring, RAG and role-play alone are insufficient.

## 2. What exists in this repository

The implementation baseline is documented in [Implementation](IMPLEMENTATION.md) and [Validation](VALIDATION.md).

| Present | Not yet present |
| --- | --- |
| Private per-user workspace and durable D1 records | Customer organizations, invitations and role permissions |
| Labeled text import for synthetic and role-play conversations | Audio upload, transcription or telephony connectors |
| Approved rubric versions and evidence-validated scores | Validated model-quality benchmark or outcome prediction |
| Append-only human review revisions and stale-save rejection | Structured reviewer disagreement/adjudication workflow |
| Keyword retrieval over approved documents and citation-checked coaching | Embeddings, semantic reranking or document connectors |
| Optional Claude calls and basic LangSmith run tracing | Nested pipeline traces, token ledger or live voice metrics |
| Synchronous analysis requests with job status and daily limits | Durable background queue, retries and failure recovery |
| Private hosted application and GitHub checks | Separate staging environment, browser regression suite or production load benchmark |

The current transcript format assumes the roles have already been identified. It does not detect turns from audio. The `source` field only accepts role-play and synthetic content; that validation is not a detector for personal or health information. Do not relabel a real patient call as synthetic to make it importable.

## 3. Where to find enquiry records

There is no verified public feed of genuine dental enquiries available to this project. The most useful production data comes from a cooperating practice that controls the relevant accounts and authorizes the use. An API provides a way to access an account's data; it does not supply a customer dataset.

### Start with the systems the practice already uses

| Source | What to request | What it does not necessarily contain |
| --- | --- | --- |
| Phone system or call-tracking account | Call ID, timestamps, duration, direction, disposition, recording metadata and recording access | Audio for calls that were never recorded or have expired |
| CRM, enquiry spreadsheet or website form system | Enquiry ID, channel, requested service, assigned owner, follow-up status, timestamps | Conversation wording or a reliable completed-treatment outcome |
| Practice management / scheduling system | Appointment ID, booking time, attendance/cancellation status and authorized linking fields | A complete telephone recording or explanation of why someone did not book |
| Training team | Consented role-play audio/transcripts, review standards, independently reviewed examples | Evidence that a model works on actual patient calls |
| Your own test number or browser microphone | New deliberately created test conversations | Any historical enquiries from another business |

A phone call, an enquiry, an appointment and a treatment outcome are different records. Keep their IDs and event times separate. A missed call is not a failed sale; a booking is not attendance; attendance is not treatment acceptance. Store unknown outcomes as unknown.

### A practical acquisition process

1. Find a practice owner or training lead willing to act as a design partner. Ask which phone, CRM and practice-management products they use.
2. Ask their administrator whether recordings were enabled, how long they are retained, whether exports/APIs are included, and whether separate channels are available. Do this before buying a connector.
3. Agree on purpose and access. Request a narrowly scoped export or read-only integration, not their primary administrator password.
4. Start with approved role-plays. For any later real-record pilot, complete the access, recording-permission and data-processing review before transfer.
5. Obtain a small representative sample and an accompanying data dictionary. Include unanswered calls, voicemails, transfers and records with missing outcomes, not just successful calls.
6. Check duplicates, time zones, missing recordings, speaker/channel information and linkage quality. Reconcile a sample manually with the practice administrator.
7. Only then automate incremental ingestion, recording-ready events and outcome updates.

A useful request to the practice is: “Please identify the system that holds enquiries and recordings, confirm permitted use for this pilot, and provide an approved sample with external IDs, timestamps, dispositions and recording availability. Please do not email unrestricted patient exports or shared account credentials.”

### Historical and live APIs

Twilio exposes authenticated recording resources; recording media and live Media Streams are different interfaces. RingCentral distinguishes call-log access from recording access. CallRail exposes call records and recording resources under account permissions. A call record may have no recording, and transcripts or classifications can arrive later than the initial event. Verify the account's entitlements before promising an integration. See the first-party API references in [Data and realtime source notes](research/DATA_AND_REALTIME_FINDINGS.md).

For historical import, fetch metadata, paginate through the permitted date range, retrieve only available recordings, and save an ingestion checkpoint. For ongoing synchronization, verify webhook signatures, deduplicate events, acknowledge after durable receipt, and process in a queue. A webhook is a notification, not a guarantee that every downstream artifact is ready. Reconcile periodically against the source API.

### Public data and data you can create

Use public corpora for engineering benchmarks, and owner-approved role-plays for domain evaluation. Do not use generic conversation data to claim dental coaching accuracy.

- **AMI Meeting Corpus:** useful for speech overlap, speaker attribution and audio pipeline tests. Meetings differ from dental telephone enquiries.
- **Fisher / Switchboard:** useful telephone speech resources, with licensing and acquisition terms to check through the Linguistic Data Consortium. They are not a free patient enquiry database.
- **MultiWOZ:** useful task-oriented dialogue text for state transitions and dialogue tests. It does not test audio, microphones, speaker diarization or dental expertise.
- **Your own role-plays:** create natural unscripted variants, accents, interruptions, uncertainty and missing information. Keep some reviewers and scenarios out of prompt development. Synthetic text-to-speech can stress plumbing, but real human role-play audio is needed to test pauses and interruptions.

Dataset sources, licenses and limitations are linked in the [source notes](research/DATA_AND_REALTIME_FINDINGS.md). Keep a manifest recording exact dataset version, source, permitted use, transformations and split. Publicly downloadable does not automatically mean suitable for commercial redistribution.

## 4. Where to store data and how to use it

### Work with the application today

1. Run `npm ci`, `npm run db:migrate`, and `npm run dev` for local work. Use the current private site for deployed checks.
2. Publish the owner's approved rubric through **Review rubric**. Do not generate business standards just to populate the form.
3. Import a synthetic or role-play transcript through **Consultations → Import transcript**. Each line must identify `Coordinator:` or `Patient:`; supported timestamps are optional.
4. Record a human assessment first. Save rationale and verbatim supporting spans. Publish a new revision when correcting a review.
5. Add approved training text through **Knowledge library**. Search it before testing generated coaching.
6. Configure provider credentials on the server when ready. Check scoring, evidence, citation support and job history against the independently reviewed examples.

The current UI does not bulk-import CRM CSV files or audio. Exported call metadata requires an adapter and schema additions. Do not insert raw CSV rows directly into the existing consultations table and assume their meaning matches the application.

### Storage design for the next increment

| Material | Recommended home | Access and lifecycle |
| --- | --- | --- |
| Code, migrations, test generators and non-sensitive fixtures | Private GitHub repository | Reviewed changes; no runtime secrets or patient records |
| Local role-play working files | An encrypted development directory outside the repository | Restricted machine access; deliberate cleanup |
| Local application records | Local D1 state under ignored `.wrangler/` | Disposable development data, separate from hosted D1 |
| Consultation metadata, transcript versions, reviews, outcome events | Application database | Every lookup and mutation scoped to organization/workspace |
| Approved audio, original exports and derived redacted audio | Private object storage, such as R2 or S3, after ingestion is implemented | Opaque keys, short-lived authorized downloads, retention and deletion policy |
| Reviewed evaluation examples | Versioned restricted dataset store | Frozen evaluation splits; explicit permitted use; no raw data in CI logs |
| Training documents and search index | Approved document store plus derived index | Version, approval, effective date and access filters; rebuildable index |
| API keys and connector credentials | Runtime secret store | Per-environment keys, least privilege, rotation and revocation |
| Logs and LangSmith traces | Observability systems | IDs and timings by default; no unrestricted transcript or audio capture |

An object path containing an organization ID is useful for organization, but is not authorization. Validate membership before issuing any object download URL. Keep raw and redacted versions distinct; do not silently overwrite the only original or assume deleting one copy deletes all derivatives.

The next schema should model an external call identifier, source account, ingestion event, recording object, transcript version, speaker-role mapping, processing attempt and outcome event. Store `occurred_at` separately from `received_at`, original time-zone information where available, content hashes, model versions and the reason a record is unavailable. Use a unique key such as `(organization_id, provider, source_account_id, external_call_id)` for deduplication. These fields are proposed, not already implemented.

### Keep the knowledge library separate from customer conversations

Approved playbooks are retrieval authority. Call transcripts are evidence about what happened. Evaluation labels are references for measuring quality. A transcript should not enter a shared coaching index automatically, and a human correction should not automatically rewrite the rubric. Organization access must be applied before retrieval, including any future vector search.

### Before real patient data

Choose the target jurisdiction and have the practice confirm recording permission, permitted use and relevant contractual requirements. For US HIPAA-regulated work, HHS explains that cloud processing of ePHI requires appropriate risk analysis and business-associate arrangements; simply encrypting a bucket does not settle the entire obligation. The current Sites deployment has not been assessed here as a suitable environment for ePHI. Keep that content out until the entire processing chain is approved. [HHS cloud guidance](https://www.hhs.gov/hipaa/for-professionals/special-topics/health-information-technology/cloud-computing/index.html).

Automated redaction is a control to evaluate, not proof of de-identification. Audio, context, dates and metadata can still identify someone. The data acquisition notes link HHS's de-identification methods. For other jurisdictions, obtain the relevant local requirements rather than assuming the US workflow applies.

## 5. Cloud: when, what and how to deploy

### Direct answers to the deployment choices

| Choice | Recommendation for ConsultIQ |
| --- | --- |
| Build everything locally, then deploy once | Avoid. It delays discovery of authentication, runtime, migration and webhook problems. |
| Deploy an initial working slice, then iterate | Recommended, using separate environments and controlled releases. |
| Upload all data to cloud first, then develop against it | Avoid for production data. A restricted staging dataset is reasonable once ingestion and access are defined. |
| Use live APIs from a local app | Useful for bounded tests with test accounts. Provider APIs still run in the cloud and incur usage costs. |
| Keep everything local indefinitely | Possible for solo manual/text experimentation; unsuitable for an always-available multi-user service or dependable webhooks. |
| Buy AWS, a GPU and a vector database immediately | Not needed for the current workflow. Add infrastructure when a measured requirement warrants it. |

### What runs where

**Current cloud slice:** landing page, application UI, authenticated API, database schema and records, server secrets and logs. That is already deployed privately through Sites. You do not deploy the Git repository itself as a database, and you do not deploy Claude or LangSmith models when calling their hosted APIs.

**Recorded-audio increment:** add a private object bucket, upload and provider-webhook endpoints, a durable job queue, a worker that calls transcription and analysis services, retry/dead-letter handling, ingestion status and operational metrics. If audio decoding or a Python model requires a container, introduce a dedicated processor; keep the UI and metadata API separate.

**Live role-play increment:** add a realtime media session service, short-lived client session credentials and a voice worker with streaming speech and cancellation. Use a managed realtime platform or a supported persistent service. Do not assume a long-running Python audio process can be placed unchanged inside the current Worker runtime.

**Customer pilot:** add organization membership, roles, offboarding, audit access, backup/restore, quotas, support and appropriate data controls. A new hosting account does not add these automatically.

### Environments and release order

- **Local:** synthetic fixtures, local database, development keys and fake external responses for failure tests.
- **Staging:** separate database, bucket, provider test account/number, secrets and LangSmith project. Use approved role-plays. Test migrations, signatures, retries, deployment and actual provider behavior.
- **Production/pilot:** only approved users and material. Release a tested artifact; do not point local experiments at this database.

For each release: commit → checks → compatible migration review → staging deploy → API/browser/provider checks → promote the same artifact → monitor → roll back application code if necessary. Database rollback is a separate operation; design additive migrations and test restore. The separate staging environment is a proposed next step, not something already provisioned.

### Which cloud should you learn?

Stay with the current Worker/D1 deployment for the text product while validating demand. Learn cloud fundamentals through one complete deployment: IAM, secrets, networking, storage, queues, metrics and recovery.

If a target startup uses AWS or a customer contract requires that environment, build a small separate deployment exercise: containerized processor on ECS/Fargate, S3 objects, SQS jobs, managed Postgres for metadata, a secret store and CloudWatch/OpenTelemetry. This is an architecture option, not a reason to migrate the whole product now or a claim those services are configured. Choose the region and services only after checking runtime, contract and cost needs.

Fully local inference is an option for an offline research branch, using locally runnable speech and language models. That requires a different provider adapter, model evaluation and appropriate hardware; it is not how the current Claude integration works. A GPU is not required to use hosted speech or language APIs.

A direct move away from Sites must replace its identity boundary. The present API trusts the dispatcher-provided authenticated identity; it must not accept a caller-supplied identity header on a public standalone deployment.

## 6. API access and cost planning

### Accounts to obtain, in order

1. **Current model provider:** create an Anthropic API account, select an available model, set spending controls, and configure `ANTHROPIC_API_KEY` and `AI_MODEL` on the server. A consumer chat subscription is not the credential this application uses.
2. **Optional observability:** create a LangSmith project and key, select region, then configure the existing `LANGSMITH_*` settings. Current instrumentation hides content; it is not yet an evaluation suite.
3. **Recorded audio:** choose one speech API after testing the same role-play audio with candidate providers. Create a project/key and implement the transcription adapter. There is no transcription key setting in the current app yet.
4. **Existing calls:** request read-only integration access from the practice's phone provider. Account permissions and recording retention determine what can be fetched.
5. **New test calls:** obtain a test number and API credentials from a telephony provider. Configure a signed webhook receiver in staging. A new number does not expose old calls made through another provider.
6. **Realtime voice:** create a LiveKit project or equivalent only when implementing the voice session. Browser clients receive short-lived session credentials, not master API keys.

Put credentials in separate local/staging/production secret stores. Do not paste real keys into documentation, client JavaScript, screenshots, issue bodies or GitHub. Rate limits, concurrency, account verification and regulated-data terms may differ from headline pricing.

### Published prices relevant to the first experiments

| Service | Observed public price | How to interpret it |
| --- | --- | --- |
| Claude Sonnet 4.6, used here as a cost reference | $3 / million input tokens; $15 / million output tokens | Not a model-quality recommendation. Choose the actual model using evaluations. [Source](https://claude.com/pricing) |
| Deepgram Nova-3 monolingual prerecorded | $0.0043 / audio minute; prerecorded diarization listed as included | Speech processing only; extra features can add charges. [Source](https://deepgram.com/pricing) |
| Deepgram Flux English streaming | Current promotional $0.0065 / minute; listed regular $0.0077 | Turn-aware streaming option. Recheck the promotion before budgeting. [Source](https://deepgram.com/pricing) |
| AssemblyAI Universal-3 Pro prerecorded | $0.21 / hour; speaker diarization +$0.02 / hour | Approximately $0.00383 / minute together. Compare output on the same data. [Source](https://www.assemblyai.com/pricing/) |
| AssemblyAI streaming | Universal-Streaming English $0.15 / hour; Universal-3 Pro Streaming $0.45 / hour | Billed by session duration; close idle sessions. [Model pricing](https://www.assemblyai.com/docs/faq/how-can-i-use-universal-1), [billing](https://support.assemblyai.com/articles/3853403741-how-does-pricing-work) |
| Twilio US local voice | Inbound $0.0085 / minute; outbound $0.014 / minute; number $1.15 / month | Each applicable call leg matters. Country, forwarding and features change the bill. [Source](https://www.twilio.com/en-us/voice/pricing/us) |
| Twilio recording and streams | Recording $0.0025 / minute; storage $0.0005 / recorded minute-month; Media Streams $0.0044 / minute | Added to applicable telephony charges; not an all-in voice-agent price. [Source](https://www.twilio.com/en-us/voice/pricing/us) |
| LiveKit Cloud | Build $0/month; Ship $50/month with 5,000 agent-session minutes, then $0.01/minute | Transport, recording, inference and telephony have their own allowances/meters. An agent minute is not all-inclusive inference. [Source](https://livekit.com/pricing) |
| LangSmith | Developer $0, one seat, 5,000 base traces/month; Plus $39/seat/month, 10,000 base traces | Additional usage and retention can cost more. Use the current calculator; do not assume older per-trace overage rates. [Source](https://www.langchain.com/pricing) |
| Direct Cloudflare Workers | Paid subscription minimum $5/month, with included usage and overages | Direct Cloudflare list pricing, not a quote for Sites billing. [Source](https://developers.cloudflare.com/workers/platform/pricing/) |
| Direct Cloudflare D1 | Paid plan includes 5 GB; additional storage $0.75/GB-month; row reads/writes metered | Indexes and scan volume affect cost. [Source](https://developers.cloudflare.com/d1/platform/pricing/) |
| Direct Cloudflare R2 Standard | $0.015/GB-month; 10 GB-month free allowance; operation charges; no Internet egress charge | Audio size and retention determine storage. This project has no R2 binding yet. [Source](https://developers.cloudflare.com/r2/pricing/) |

The current Sites account's billing, quotas and regulated-data terms were not verified by this research. Do not treat the direct Cloudflare prices as the invoice for the existing private site. Existing phone-system subscriptions, premium API access, taxes, support and contractual requirements are separate.

### Transparent example budgets

These are calculated scenarios, not measured bills. Inputs and results are recorded in [COST_ASSUMPTIONS.json](research/COST_ASSUMPTIONS.json). Assume **1,000 calls/month, 10 minutes each, one assessment per call, 8,000 input and 2,000 output tokens per assessment**, using the reference rates above and one billed transcription channel. Multichannel billing and additional speech features must be checked separately. No free credits, caching discount or bulk contract is assumed.

Model cost per assessment:

`(8,000 × $3 + 2,000 × $15) / 1,000,000 = $0.054`

| Scenario | Calculated subtotal | Exclusions that matter |
| --- | --- | --- |
| Already have approved text transcripts | $54/month for assessment calls | Hosting, review labor, coaching queries and evaluation runs |
| Already have approved audio files | $43 transcription + $54 assessment = **$97/month** | Storage, ingestion processing, hosting and any source-system charges |
| New US inbound calls, single paid inbound leg, record then analyze | **$208.15/month** including one number; **$213.15** with a direct Workers $5 baseline | Forwarding/outbound leg, storage, queue, ancillary services and labor |
| New US inbound single-leg calls, recording, live streaming/Flux, one post-call assessment | **$279.15/month** including one number and direct Workers baseline | Realtime worker hosting, extra diarization if needed, additional live LLM calls, TTS, storage and any additional phone leg |

For a forwarded call, another 10,000 minutes at the listed US outbound rate would add **$140**. Retaining 10,000 recorded minutes in Twilio for a full month adds **$5** at the listed recording-storage rate. Those examples show why a base-minute price is not the total cost.

Live agent costs need a different model:

`telephony legs + media/session hosting + STT/session time + LLM tokens across every turn + TTS characters/audio + recording/storage + tools + observability + retries`

Do not multiply only the STT price by call duration and call it an agent budget. Repeatedly sending growing conversation history can dominate LLM usage. Human labeling and onboarding time may dominate the early pilot's total cost.

### Cost controls worth implementing

Record actual input/output tokens, audio/session duration, provider/model, retries and successful reviews per organization. Separate recurring product usage from experiments and backfills. Set provider spend alerts, application request/concurrency limits, bounded retry budgets and session timeouts. Cache only with workspace, transcript, rubric and model versions in the key; invalidate on relevant changes. Calculate cost per successfully reviewed call, not just cost per request.

## 7. Latency, turn detection and voice architecture

### Choose which experience you are optimizing

| Experience | Primary latency question | Necessary capabilities |
| --- | --- | --- |
| Post-call review | How soon after the recording is available does a reviewer receive a valid report? | Ingestion, transcription, queue, bounded analysis, validation and progress reporting |
| Live assistance for a human coordinator | Does useful guidance arrive before the conversational opportunity passes? | Streaming transcript, speaker mapping, incremental context, sparse suggestions and dismissal controls |
| Interactive role-play or autonomous agent | How quickly and naturally does the agent respond, yield and recover? | Media transport, end-of-turn decisions, streaming generation/TTS, cancellation and session state |

Do not optimize the post-call system around conversational response latency. Conversely, a model that produces an excellent report after a minute may be unsuitable for deciding what to say during a call.

### Vocabulary that must stay separate

- **Voice activity detection (VAD):** is speech currently present?
- **Diarization:** which speaker produced a segment?
- **Role mapping:** which speaker is the coordinator, patient, interpreter or transferred staff member?
- **Endpointing / end-of-turn detection:** has the speaker finished their current turn or only paused?
- **Interruption handling:** should the system stop its own audio, cancel work and let the person continue?

These are different failures. A correct transcript attached to the wrong role can produce an invalid assessment. A silence threshold can cut someone off while they search for a date. An “mm-hm” should not necessarily cancel the agent. Prefer separate channels when the source provides reliable channel metadata, but verify the role mapping and behavior after transfers.

### Tools worth learning for their function

| Tool or pattern | Value | Boundary |
| --- | --- | --- |
| LiveKit Agents | Realtime sessions, turn/interruption handling and voice-stage metrics | Use for a distinct voice worker; do not assume the current web backend is a voice runtime |
| Pipecat | A composable Python voice pipeline with explicit turn strategies | A reasonable alternative, not another framework that must be added alongside LiveKit |
| Deepgram Flux | Speech recognition with integrated turn detection | Evaluate supported languages and pause behavior; a listed latency claim is not your measured result |
| LangSmith experiments and annotation | Compare model/prompt versions against controlled examples and human feedback | Existing traces must be extended; tracing alone is not an evaluation |
| Deterministic event/audio replay | Reproduce interruption, duplicate-event and timing failures | Preserve pacing/configuration and supplement with real network/device tests |
| OpenTelemetry-style stage instrumentation | Connect an ingestion event, queue attempt and model run using correlation IDs | Keep sensitive content out of attributes; choose an exporter rather than duplicating every trace |

First-party references: [LiveKit turns](https://docs.livekit.io/agents/logic/turns/), [Pipecat strategies](https://docs.pipecat.ai/api-reference/server/utilities/turn-management/user-turn-strategies), [Deepgram capabilities and rates](https://deepgram.com/pricing), [LangSmith evaluation guide](https://docs.langchain.com/langsmith/evaluate-llm-application). These features have not been integrated into ConsultIQ merely by listing them here.

### The first voice increment

Build a browser role-play session using one voice framework, an approved scenario and test participants. Finalize a versioned transcript and import it into the existing evidence review flow. This demonstrates the voice stack without immediately giving an agent authority to book appointments or speak for a real practice.

For a future speaking agent, keep a clear state machine: listening → possible turn end → generating → speaking → interrupted/cancelled → listening. Attach a generation ID to every response. Discard audio and model output from cancelled generations. Track how much audio actually played, so conversation history does not claim the user heard words that were cancelled. Put consequential tool actions behind an explicit state and idempotency rule; cancelling TTS does not undo an already completed booking.

Twilio's unidirectional Media Streams support listening to call tracks; bidirectional streams allow audio to be sent back and have different track constraints. Choose the mode for the intended product rather than treating every WebSocket stream as interchangeable. [Twilio Media Streams](https://www.twilio.com/docs/voice/media-streams).

### Measure before tuning

Use call ID, turn ID, transcript version, provider request ID and generation ID to correlate:

`capture → transport → speech result → endpoint decision → retrieval → model first token → TTS first audio → audible client playback`

Report p50, p95 and p99 at specified concurrency, region, device/network and audio conditions. Also report error and quality rates. Vendor processing latency excludes some of the journey the user experiences.

LiveKit documents EOU, LLM and TTS metrics; its EOU delay already includes transcription delay. Do not add the same interval twice. Instrument audible playback separately from server first-byte time. [LiveKit metrics](https://docs.livekit.io/deploy/observability/data/).

Proposed initial benchmark objectives, **not current results or industry standards**:

| Path | Initial objective to test | Quality guardrail |
| --- | --- | --- |
| Queued analysis submission | p95 acknowledgement within 500 ms at the declared test load | Durable job exists before success is returned |
| Recorded role-play report | p95 validated report within two minutes after a ten-minute recording is available | No missing segment silently omitted; failures visible |
| Voice role-play response | p95 speech-end to audible response under 1.5 seconds | Track premature endpoints and answer quality simultaneously |
| Intentional interruption | p95 stop of audible agent speech within 250 ms | Measure false stops on noise and backchannels |

Revise targets from baseline and user observation. Exclude neither failed calls nor timeouts from the accompanying reliability report. Do not claim these targets are achieved until a reproducible run records the results.

Tune the largest measured bottleneck first: cold start, network placement, provider choice, endpoint wait, context size, output length or playback buffering. Reuse connections where supported and prewarm the components needed for interactive sessions. Compare fixed endpointing with turn-aware detection on identical audio. Only experiment with speculative generation after cancellation is correct; faster responses are not worth duplicate actions or confidently speaking before the user finishes. [LiveKit tuning guidance](https://docs.livekit.io/agents/logic/turns/tuning/).

## 8. Market research and competitive position

The detailed comparison, pricing caveats and primary-source links are in [Competitor findings](research/COMPETITOR_FINDINGS.md). The research covers dental intelligence, bundled communications, contact-center QA and training. It did not purchase competitive trials, interview customers or independently verify vendor outcome claims.

| Product | Selling point that matters to the buyer | Lesson for ConsultIQ |
| --- | --- | --- |
| Patient Prism | Dental enquiry classification and booking barriers | Dental-specific scoring alone is already competitive territory. [Product](https://www.patientprism.com/pricing/) |
| Weave | Communication tools with assigned follow-up and practice-system integration | Make an insight actionable in the manager's workflow. [Product](https://www.getweave.com/call-intelligence/) |
| Call Box | Dental call tracking, appointment opportunities and attribution | Include missed connections in the enquiry picture, not only analyzed calls. [Dental page](https://callbox.com/dental) |
| Mango Voice | Phone infrastructure bundled with AI summaries and writeback | A standalone analysis fee must beat an already bundled alternative. [Product](https://mangovoice.com/mango-ai) |
| CallRail | Lead attribution and conversation analysis for smaller businesses | Source and outcome linkage can be more valuable than another summary. [Product](https://www.callrail.com/premium-conversation-intelligence) |
| Gong | Scorecards, coaching and practice linked to conversations | Connect review, action and subsequent training; call-to-role-play is not novel. [Enable](https://www.gong.io/platform/sales-enablement-software) |
| Observe.AI | Quality assurance with calibration, evidence and disputes | Make corrections and reviewer agreement part of the product. [Auto QA](https://www.observe.ai/post-interaction/auto-qa) |
| Cresta | Contextual assistance during a live interaction | Judge relevance and timing, not just generation speed. [Agent Assist](https://cresta.com/agent-assist) |
| Second Nature | Configurable conversation practice and feedback | Measure transfer to a different scenario, not only completion of practice. [Product](https://secondnature.ai/product/) |

### Pricing and buying dynamics

Dental products often bundle communications, integrations, onboarding and intelligence. General QA/revenue platforms may use custom proposals. Do not compare a speech API's per-minute price with an entire commercial product's subscription as if they buy the same thing. ConsultIQ's margin must cover support, onboarding, review quality and operations as well as inference.

The appendix records observed public prices and limitations. Some prices depend on selectors or partner offers, and one vendor's page contains inconsistent allowance text. Get written quotes using the same locations, users, volume, retention and integrations before a procurement decision. This research made no sales outreach.

### What a buyer could reasonably ask us

- Why buy this if our phone system already summarizes calls?
- How do you know the assessment is fair and the quote is relevant?
- Can the coordinator challenge feedback without losing the original record?
- Does this reduce review effort or improve a specific training task?
- Can it work with our existing phone system and current playbook?
- Who follows up, and how do we know the outcome actually happened?
- What happens when recording, speech recognition or the model fails?
- What data leaves our environment, who can access it, and how is it deleted?

These questions should drive engineering priority and positioning.

## 9. Differentiation worth earning

No feature below is established as unique. The opportunity is a well-executed combination for a narrowly defined customer, supported by evidence.

| Priority | Proposed capability | Why it could matter | How to test the hypothesis |
| --- | --- | --- | --- |
| First | Reviewer calibration and adjudication | Makes assessment useful when experts disagree | Blind double review, dimension-level agreement, overturn reasons and review time |
| First | A review-to-practice workflow | Gives coaching a concrete next step | Assign one approved objective, practice it, evaluate a different held-out scenario |
| First | Source provenance and policy conflict handling | Prevents confident coaching from outdated or incompatible rules | Ask questions with missing, conflicting and superseded sources; verify abstention and cited version |
| Next | Separate communication gaps from operational barriers | Helps a manager distinguish training needs from availability, routing or policy problems | Compare proposed classifications with reviewer-confirmed causes and resulting actions |
| Next | Read-only connector and outcome reconciliation | Reduces copying and avoids invented business results | Match provider records and appointment events with documented ambiguity handling |
| Later | Sparse live guidance with human control | Could help during a difficult interaction without becoming distracting | Shadow-mode replay, relevance/nuisance rates, user acceptance and controlled field comparison |

A plausible commercial entry is a role-play training workflow for an organization that can provide standards and reviewers without requiring patient-data ingestion on day one. A plausible expansion is approved post-call review connected to the practice's existing systems. Interview buyers to determine whether they will pay separately or expect this inside their communications vendor.

The durable assets to build are permissioned evaluation data, trustworthy domain standards, reliable integrations, useful feedback history and repeated customer use. Adding a vector database or changing the model does not create those assets by itself.

Avoid promises about treatment acceptance, revenue lift or “emotion accuracy” until there is a defensible measurement design. Before/after differences can reflect call mix, scheduling capacity, seasonality and staffing. A transcript-only model cannot infer every cause of an outcome.

## 10. Validation: build, failure and edge cases

### Distinguish software tests from model evaluations

Software tests assert rules such as “another workspace cannot read this record” and “a stale review cannot overwrite a newer one.” Evaluations measure uncertain behavior such as whether the quoted passage supports a rubric judgment. Passing deterministic tests does not establish model quality. LangSmith supports versioned datasets, experiments and human annotation; we should add those around the current provider boundary. [Evaluation concepts](https://docs.langchain.com/langsmith/evaluation-concepts), [annotation queues](https://docs.langchain.com/langsmith/annotation-queues).

Use the existing test suite as a starting point. It currently exercises domain and API behavior with controlled model responses. The previous implementation validation did not measure live model quality, voice latency or browser accessibility.

### Evaluation dataset design

Create an authorized dataset manifest containing source, permission, transcript/audio version, language, channel configuration, scenario, reviewer references and split. Store review labels separately from model inputs. Split by speaker, scenario and, when available, practice, so closely related calls do not leak across development and evaluation. Keep any future outcome label out of a purported call-end prediction's inputs.

Begin with independent human review and adjudication. Record human-human agreement before model-human agreement. Use dimension-level ordinal error or weighted agreement measures, evidence relevance, correct abstention and coaching usefulness. Include natural negatives, unsupported dimensions and missing context. Report sample sizes and uncertainty, and keep a failure taxonomy. A model rating its own answer is not independent ground truth.

For RAG, maintain questions with judged relevant sources plus unanswerable/conflicting-policy cases. Measure retrieval recall at the chosen cutoff, citation relevance, whether claims follow from the source, freshness and correct refusal. Compare the current keyword baseline with hybrid retrieval only when there is enough judged data to detect improvement. Current keyword tokenization is English-oriented and candidate-limited; multilingual retrieval needs explicit evaluation and likely changes.

For audio, retain a reviewed reference transcript and speaker mapping. Measure word error rate alongside domain-critical errors: names, times, amounts and negation. A low average word error rate can hide a wrong appointment date. Track speaker confusion, overlap and errors by acoustic/language conditions.

### Required failure matrix

Everything marked “add” below is proposed coverage, not a claim of an existing passing test.

| Area | Failure or edge case | Expected behavior / evidence |
| --- | --- | --- |
| Authentication | Missing identity, revoked member, forged header on a new host | Reject access; test actual host boundary and future membership revocation |
| Isolation | Foreign call, rubric, chunk, object URL or cached result | No unauthorized data or existence disclosure; extend current API isolation coverage to every new resource |
| Import | Empty/corrupt audio, oversized upload, wrong codec, one missing channel | Explicit failure/quarantine, no fabricated transcript; add audio validation tests |
| Webhooks | Invalid signature, duplicate delivery, out-of-order events | Reject invalid origin proof; one durable event/job effect; add connector contract tests |
| Source API | 401/403, 429, expired media URL, recording removed | Distinct actionable status, bounded retry/refresh, no endless polling |
| Queue | Worker dies before/after provider success, retry delivered twice | Durable attempts, deduplication, bounded charges, dead-letter visibility; design provider-call ambiguity explicitly |
| Database | Save fails after model completion, migration partially incompatible | No false success; controlled retry or recoverable result state; test restore and schema compatibility |
| Concurrency | Human corrects while AI runs; rubric changes mid-run | Preserve reviewed transcript/rubric version; reject stale result without overwriting history |
| Speech | Accent, code switching, noise, clipping, echo, hold music, overlap | Record transcription uncertainty and role errors; review flagged content before scoring |
| Turns | Hesitation, long pause, “mm-hm”, cough, resumed speech | Avoid premature completion and false interruption; report both error types |
| Cancellation | Interrupt during TTS, then old response arrives | Stop audible output and discard stale generations; history reflects what actually played |
| Model | Timeout, rate limit, malformed JSON, truncated output, invalid score | Visible failed job, bounded retry, no invented assessment; extend current controlled-response tests |
| Evidence | Quote exists in wrong turn; valid quote is irrelevant; omitted contrary context | Mechanical rejection where possible; semantic failure captured by human evaluation |
| RAG | No match, contradictory policy, deleted document during generation | Abstain or surface conflict; revalidate source/version before persistence; test deletion races |
| Prompt injection | Transcript or playbook instructs system to ignore rules or expose another tenant | Treat content as data; enforce authorization outside the model; include adversarial evaluation |
| Deletion | Raw audio deleted but transcript, index, cache or trace persists | Verify the agreed deletion policy across all retained derivatives and backups |
| Actions | Scheduling request retried after an uncertain timeout | Reconcile by idempotency key/source record; never blindly duplicate a booking |
| UI | Keyboard-only review, slow response, reconnect, double submit, narrow screen | Accessible controls, useful progress/errors and recoverable forms; add browser tests |
| Load/cost | Burst import, too many simultaneous streams, runaway retries | Backpressure, fair per-organization limits, spend visibility and recovery after overload |

Exactly-once provider charging cannot be promised merely by deduplicating database rows. A worker can lose the response after the provider completed a paid request. Prefer provider idempotency or status reconciliation where supported, and otherwise record the ambiguity and use a bounded retry policy.

### Release evidence to produce

- A clean build/test result tied to a commit and database migration version.
- A held-out evaluation report with actual sample counts, model/prompt/rubric versions, metrics, failure examples and cost.
- A speech/turn replay report with pinned configuration, annotated events, latency distributions and accuracy tradeoffs.
- An authenticated browser workflow recording using safe data, including a deliberate error and recovery.
- A staging incident exercise: stop a processor, restore operation, reconcile partial work, and demonstrate no silent loss or duplicate action.
- A backup/restore exercise and an access/deletion audit appropriate to the pilot's data.

Keep hard authorization and evidence invariants as release blockers. Agree quality thresholds with the domain owner before evaluating the holdout. Do not improve a headline number by repeatedly editing the holdout or hiding failed runs.

## 11. Skills that make this credible to a startup

Aim to demonstrate ownership of a complete working system and its failures. Installing every framework is weaker evidence than explaining a measured tradeoff and showing the code, experiment and recovery path.

This aligns with current first-party hiring signals: LiveKit's Agents role describes Python/TypeScript framework and realtime infrastructure work; Retell's ML role emphasizes evaluation, human feedback and deployment into latency-sensitive systems; its customer-success engineering role mentions APIs, webhooks, SIP, authentication and latency debugging. These are examples of role requirements, not a guarantee of hiring. [LiveKit Agents role](https://jobs.ashbyhq.com/livekit/1757f49e-7e19-4c45-85f7-e4637dff66fb), [Retell ML role](https://jobs.ashbyhq.com/retell-ai/dcc921b7-fccc-459a-93c2-10adb4aa147a), [Retell customer engineering role](https://jobs.ashbyhq.com/retell-ai/0e0849a2-2ca7-4b03-9a50-900d344d0881).

| Skill area | Work in this project that demonstrates it | Artifact for an interview |
| --- | --- | --- |
| Product engineering | Observe a reviewer, reduce friction, handle empty/error/loading states | A usable flow and a specific explanation of a design change |
| Backend and SQL | Organization permissions, migrations, transaction boundaries and indexes | Schema reasoning, isolation tests and query measurements |
| Distributed systems | Signed events, queues, idempotency, retries and reconciliation | Failure injection plus a recovered workflow |
| Applied AI | Versioned prompts/rubrics, structured output, abstention and model selection | Held-out comparison with quality, latency and cost |
| Retrieval | Judged sources, access filtering, baseline versus hybrid search | A retrieval failure analysis and measured improvement |
| Voice systems | PCM/codecs, channels, VAD, endpointing, barge-in and cancellation | Annotated replay and live network measurements |
| Observability | Correlation IDs, stage spans, useful alerts and redacted traces | Trace that explains a slow or failed call |
| Cloud and delivery | Separate environments, secret handling, CI, deploy/rollback and restore | Reproducible deployment and recovery runbook |
| Evaluation/statistics | Independent labels, leakage prevention, uncertainty and subgroup analysis | Honest benchmark report, including weak areas |
| Customer integration | Read-only connector, permission scope and source reconciliation | A documented integration contract and failure behavior |
| Operational ownership | Cost ledger, service objectives and incident response | A concise incident report with regression coverage |

For an applied AI/product role, prioritize the review workflow, evaluations and deployment. For a voice infrastructure role, deepen realtime transport, concurrency, cancellation and performance. For a research-oriented speech role, add a controlled experiment or model adaptation with justified data and benchmarks. Do not train a model solely to add “fine-tuning” to a resume.

Use skills as working methods: research for primary sources, domain modeling when formalizing call/enquiry/outcome concepts, codebase design for service boundaries, TDD for critical behavior, diagnosing-bugs for performance failures, and code-review before release. A skill installation is not evidence that its discipline has been practiced. We used the research skill for this document; the listed engineering methods are for the corresponding implementation tasks.

A strong walkthrough should show: the customer problem, architecture, one normal path, one failure, how you measured it, what changed, what remains uncertain, and what the system costs. Use approved synthetic/role-play material when sharing portfolio artifacts. The repository remains private; prepare a sanitized public case study only when you choose to share it.

## 12. Next steps in dependency order

These are milestones with exit criteria, not a promised delivery schedule. The owner supplies domain decisions and account access; engineering remains our work.

| Order | Deliverable | Owner contribution | Engineering work | Exit evidence |
| --- | --- | --- | --- | --- |
| 1 | Confirm the first workflow and buyer | Choose training lead versus enquiry operations; identify design partner | Observe current workflow; narrow product scope | Buyer can explain a repeated problem and current workaround |
| 2 | Authorized data and evaluation plan | Approved role-plays, rubric, reviewers and permitted uses | Dataset manifest, independent annotation and frozen splits | Representative examples, disagreements and success criteria recorded |
| 3 | Verified text review release | Model/LangSmith account access and budget | Live integration checks, browser/accessibility tests, nested traces, token usage | A saved, reviewed, cited result plus failure/recovery trace |
| 4 | Reliable processing | Agree retention and support expectations | Durable queue, attempts, idempotency, retry budgets, staging and restore | Processor interruption exercise recovers without silent loss |
| 5 | Recorded role-play audio | Approved human recordings | Upload, private storage, STT adapter, speaker review, transcript versions | Audio-to-reviewed-assessment benchmark and error analysis |
| 6 | First read-only practice connector | Administrator authorization and source-system sample | Signed webhook/export adapter, pagination, reconciliation and outcome events | Approved records reconcile with the source; missing data stays explicit |
| 7 | Review-to-practice product | Approve training objectives and scenarios | Assignments, adjudication, practice history and held-out transfer checks | Users complete the loop and identify its practical value |
| 8 | Live voice laboratory | Consented test participants and desired languages | One framework, streaming, turn detector, cancellation, replay and metrics | Measured response/interrupt tradeoffs with no duplicate actions |
| 9 | Controlled customer pilot | Contract, price, access and data decisions | Organizations/roles, onboarding, usage limits, monitoring and support | Customer-approved acceptance criteria met in the intended environment |
| 10 | Commercial expansion | Choose integrations and public positioning from evidence | Billing, scale work and supported integrations | Repeat use, defensible costs and a reason to buy beyond bundled alternatives |

Real patient data is gated by the appropriate readiness work even if an earlier connector milestone is complete. Recorded role-play data can exercise the same plumbing first. Live assistance should begin in shadow mode; autonomous customer-facing actions require an additional release decision.

### Your immediate work

Identify the prospective buyer and the phone/PMS products a partner uses. Obtain permission for role-plays and approved training content. Nominate independent reviewers, approve rubric anchors and define a useful outcome. Set a provider budget and supply credentials through server settings. Decide whether your hiring focus is applied AI/product engineering or voice infrastructure so the portfolio can go deep in the right area.

### The next engineering task I recommend

Build a **reproducible evaluation and observability slice around the existing text workflow**, with live provider smoke checks, stage timings, token usage, a reviewed dataset manifest and an exported comparison report. Add a separate staging environment and browser workflow tests alongside it. This gives us evidence for model selection and a reliable base for queued audio ingestion; it also creates a much stronger hiring artifact than adding another dashboard or immediately switching clouds.

## 13. Research scope and open questions

The report uses repository inspection and official vendor documentation/product pages. Detailed sources are linked inline and in the [competitor](research/COMPETITOR_FINDINGS.md) and [data/realtime](research/DATA_AND_REALTIME_FINDINGS.md) appendices. Cost assumptions are machine-readable in [COST_ASSUMPTIONS.json](research/COST_ASSUMPTIONS.json).

Not established by this research: actual customer willingness to pay, private vendor contracts, current account entitlements, legal permission for a particular recording, Sites suitability for regulated health data, model quality on dental calls, end-to-end latency, or achieved market advantage. Those require owner decisions, account checks, controlled experiments and customer observation. No data was purchased, no private records were obtained, and no cloud resources or paid API sessions were provisioned for this report.
