# Data acquisition and real-time voice research

Research date: 2026-09-09. This note uses official provider documentation, dataset publishers and HHS guidance. Proposed engineering below is a recommendation, not a statement that the feature exists. Current behavior was checked against the project README and [implementation documentation](../IMPLEMENTATION.md).

## What data exists, and who can provide it

There is no verified freely available collection of real dental enquiry calls in this research. A telephony API supplies access to an authorized account's records, not other businesses' private conversations. The practical first source is a clinic or dental training organization that agrees to be a design partner. An API subscription does not purchase that organization's dataset.

Ask the practice owner or operations manager to identify their phone provider, call-tracking service, CRM and practice-management system (PMS). Ask the administrator of each system for an authorized export and its data dictionary before building a connector. A useful discovery request is: which calls were recorded, how far back recordings remain available, whether transcripts exist, whether speakers occupy separate audio channels, which identifiers link calls to appointments, and what processing and retention the practice permits.

Keep these assets distinct:

| Asset | Likely holder | What it can establish | What it cannot establish alone |
| --- | --- | --- | --- |
| Call log | Phone or call-tracking provider | Call time, direction, duration, answered status and provider ID | What was said or whether a treatment was accepted |
| Audio recording | Phone provider or recording archive | Actual speech, pauses, overlap and acoustic conditions | A reliable patient/coordinator label without channel mapping or review |
| Transcript | Phone provider, transcription service or reviewed export | Searchable words and possibly timestamps | Perfect fidelity to audio |
| Enquiry notes and lead status | CRM or reception system | What staff recorded about an enquiry | Independent evidence of every statement in the call |
| Appointment and attendance record | Scheduling or PMS system | Booking, rescheduling, cancellation and attendance events | A causal effect of coaching or a valid label for every treatment decision |
| Human assessment | An approved reviewer | Rubric labels with evidence and adjudication | Objective truth without measuring reviewer agreement |

The distinction between logs and recordings is supported by the provider APIs: CallRail exposes calls with absent recording fields, and RingCentral separates call-log and recording permissions. Do not treat a downloaded call-log CSV as a transcript dataset. [CallRail API](https://apidocs.callrail.com/), [RingCentral access control](https://developers.ringcentral.com/guide/voice/call-log/access)

## Concrete authorized access routes

| Provider | Account setup and access | Historical path | Relevant boundary |
| --- | --- | --- | --- |
| Twilio | Use the clinic's authorized account/subaccount; keep API key and secret on the server | List recordings at `/2010-04-01/Accounts/{AccountSid}/Recordings.json`; retrieve metadata at `/Recordings/{RecordingSid}.json` and authenticated WAV/MP3 media | Media is available only for completed recordings still stored at Twilio. Recording must have existed; creating an account does not recover unrecorded past calls |
| CallRail | A permitted account user creates an API key; its data access follows that user | List calls under `/v3/a/{account_id}/calls.json`; request `/calls/{call_id}/recording.json` for the media location | Store the provider call ID, not a temporary media URL. HIPAA-account recording URLs are temporary and must be reacquired |
| RingCentral | Create a developer application and obtain authorized access with the appropriate account permissions | Read account or extension call logs; use a record's recording reference/content URI | `ReadCallLog` and `ReadCallRecording` are separate permissions; retained logs do not guarantee an available recording |

Sources: [Twilio Recording resource](https://www.twilio.com/docs/voice/api/recording), [CallRail API](https://apidocs.callrail.com/), [RingCentral recording retrieval](https://developers.ringcentral.com/guide/voice/call-log/recordings), [RingCentral permissions](https://developers.ringcentral.com/guide/voice/call-log/access).

CallRail's post-call webhook can arrive up to 20 minutes after hangup while recording, transcription and summary artifacts attach. Its Call Modified webhook covers later updates. Design an ingestion status for missing/processing media and reconcile later; this is unsuitable as a low-latency live-audio feed. RingCentral also documents that call logs are not retained indefinitely, so establish the available historical window with the account administrator. [CallRail webhooks](https://apidocs.callrail.com/#post-call-webhook), [RingCentral call-log overview](https://developers.ringcentral.com/guide/voice/call-log)

For a PMS or CRM, choose the partner's actual installed product before quoting API availability or building integration. Request a read-only appointment/outcome export first. The need for vendor partnership approval, API entitlement and extra charges is an open commercial question for that specific product, not something established by possessing a clinic login.

## What to request from a first design partner

This is a proposed minimal data specification. Collect only fields justified by the approved workflow:

- Provider and account reference, stable external call ID, event timestamps with timezone, call direction, completion status and recording availability.
- Agent/coordinator reference and location reference using opaque IDs where practical.
- Approved transcript and audio reference when permitted; audio format, sample rate, channel layout and duration.
- Source of each transcript, its version and any human corrections. Keep ASR text separate from a reviewed reference transcript.
- Outcome event, timestamp and source-system ID. Distinguish booked, attended, cancelled, pending and unknown rather than inferring them from the conversation.
- Processing authorization, permitted purposes, retention decision and restrictions on model-provider processing, annotation, training and demonstration.

Do not match every record solely by phone number: shared family numbers, repeat calls, transfers, rescheduling and withheld numbers create ambiguous joins. Preserve uncertainty and let a reviewer resolve ambiguous matches. Do not use future appointment information as an input when evaluating a prediction purportedly made at call end.

## Where to store it and how it fits ConsultIQ

**Implemented now:** the application accepts role-play or synthetic transcripts through Consultations → Import transcript. It stores transcript turns and assessment revisions in the workspace database. Approved training text belongs in Knowledge library; owner-approved anchors belong in Review rubric. The present release has no audio upload, transcription worker, telephony connector or real-patient ingestion path. Do not relabel a real patient call as synthetic to bypass that boundary. See [implementation](../IMPLEMENTATION.md) and [operations](../OPERATIONS.md).

**Proposed audio architecture:** keep binary audio in private object storage, durable metadata and workflow state in the database, and model/retrieval evaluation artifacts in a separate controlled evaluation store. Object paths can use `workspace/<opaque-id>/call/<opaque-id>/source/<version>`; they must not contain patient names or phone numbers. Store checksums and opaque object keys, use authenticated short-lived access, and apply a documented retention/deletion policy to derived artifacts as well as originals. The key prefix aids organization but does not replace authorization checks.

**Proposed ingestion flow:** authorized export or signed webhook → validate account-to-workspace mapping → deduplicate external event → queue fetch/transcription work → inspect and normalize audio → redact as required → review speaker mapping/transcript → immutable approved transcript version → assessment → human review. A retry must not create another consultation or double-charge a provider. Failed, quarantined and unavailable-media states should be visible to an operator.

Use local synthetic fixtures for development, a separate staging database and bucket for integration testing, and production storage only after the partner and deployment requirements are settled. Do not connect everyday local development to the production patient-data store. Never put recordings, private transcripts, credentials or access URLs in GitHub, CI logs or screenshots.

Names removed from a transcript are not enough to assert legal de-identification. HHS describes Expert Determination and Safe Harbor and addresses other identifiers and the possibility of identifying someone from remaining information. Voice prints appear in its identifier guidance. A decision on recording authorization, health-data handling and permitted provider processing needs the partner's responsible privacy/legal review; this note does not make that determination. [HHS de-identification guidance](https://www.hhs.gov/hipaa/for-professionals/special-topics/de-identification/index.html)

## Public data for engineering practice

| Dataset | Where to get it and terms to inspect | Useful learning | Important limitation |
| --- | --- | --- | --- |
| AMI Meeting Corpus | Publisher's audio/annotation download page says signals, transcriptions and some annotations are CC BY 4.0. Preserve attribution and the exact downloaded release | Transcription alignment, overlapping speakers, diarization, noise and meeting-audio processing | Meetings are different from dental enquiries and telephone audio; not evidence of dental scoring quality |
| Fisher English | Obtain through LDC. Speech and corresponding transcripts are separate catalog products; inspect applicable agreement and fee after login | Conversational telephone ASR and speaker/channel handling | Licensed access, not assumed free or freely redistributable; assigned-topic conversations are not clinic calls |
| Switchboard-1 Release 2 | Obtain through the official LDC catalog and applicable agreement; fee requires login | Telephone speech and dialogue/turn analysis | Separate-channel recorded conversations do not supply dental outcomes or rubric labels |
| MultiWOZ | Start from the authors' repository, which identifies its toolkit as MIT licensed; verify the exact dataset release and attached license before redistribution | Task-oriented text dialogue, state tracking, booking constraints and evaluation discipline | Written conversations are not an acoustic or latency benchmark; corrected versions differ |

Sources: [AMI download and license statement](https://groups.inf.ed.ac.uk/ami/download/), [Fisher catalog](https://catalog.ldc.upenn.edu/LDC2004S13), [Switchboard catalog](https://catalog.ldc.upenn.edu/LDC97S62), [MultiWOZ authors' repository](https://github.com/budzianowski/multiwoz).

For domain evaluation, record consented role-plays with dental coordinators and have independent reviewers annotate the agreed rubric. Separate a development collection from a held-out evaluation collection by scenario and speaker, then add an authorized partner holdout when possible. Synthetic transcripts help exercise errors and schemas; they cannot establish real-world accuracy or clinical business value.

## Post-call review and live voice are different engineering tasks

The current product is post-call text review. Turn detection becomes necessary when adding audio segmentation, live assistance, or an interactive role-play agent. Building a full phone receptionist is a larger product with live tool actions and handoff responsibilities. A lower-risk next voice feature is a role-play training agent whose finalized transcript enters the existing review workflow.

For Twilio live audio, unidirectional Media Streams can send inbound, outbound or both tracks to a secure WebSocket application. Bidirectional streams support an agent speaking back and expose only the inbound track to the application. Start the latter with `<Connect><Stream>`, not the REST Stream creation endpoint. Validate `X-Twilio-Signature` at the service boundary. These streams are live transport, not a historical-data API. [Twilio Media Streams](https://www.twilio.com/docs/voice/media-streams)

Use one voice framework initially, selected after a small replay comparison:

| Option | Verified capability | Suggested use for ConsultIQ |
| --- | --- | --- |
| LiveKit Agents | Supports VAD, turn models, STT endpointing and manual control; interruption handling can distinguish true interruption from backchannel acknowledgments. Interrupted agent speech is truncated in conversation history | Candidate for browser role-plays and managed real-time sessions; measure before choosing hosting or enabling speculative generation |
| Pipecat | User-turn strategies separate start from stop detection; the documented default combines speech/transcription start detection with Smart Turn for completion | Candidate when a Python pipeline and replaceable processors are valuable; inspect actual installed-version defaults and run the provider latency benchmark after changing VAD settings |

Sources: [LiveKit turn handling](https://docs.livekit.io/agents/logic/turns/), [Pipecat user-turn strategies](https://docs.pipecat.ai/api-reference/server/utilities/turn-management/user-turn-strategies).

VAD identifies speech activity; it does not by itself establish that a thought is finished. LiveKit's current audio turn detector considers audio semantics and acoustic cues, while endpointing settings still control waiting bounds. Its documentation offers an inference-hosted full model and a local CPU mini model. Compare them on the intended language, device and pause distribution rather than repeating the vendor's accuracy claim. [LiveKit turn detector](https://docs.livekit.io/agents/logic/turns/turn-detector/)

## Latency measurements that lead to decisions

Proposed instrumentation should use one call/turn correlation ID across transport, STT, retrieval, generation, TTS and playback. Report distributions, failures and cost alongside quality; a single average hides stalls.

| Measurement | Operational definition for the proposed evaluation |
| --- | --- |
| User-perceived response delay | Ground-truth human speech end to first audible agent response at the client |
| Endpoint delay | Human speech end to system decision that the turn ended; inspect both early and late decisions |
| Premature endpoint rate | Annotated continuing turns incorrectly committed as finished, divided by eligible turns |
| Missed interruption rate | Intentional human interruptions for which the agent fails to yield, divided by annotated interruptions |
| False interruption rate | Backchannels or noise that incorrectly stop the agent, with the denominator documented |
| Interruption stop latency | Start of an intentional interruption to last audible cancelled agent audio |
| Transcript quality | Word error rate plus task-critical entity/negation errors and speaker attribution errors |
| Pipeline timing | STT finalization, retrieval duration, model time to first token, TTS first-byte delay and playback/network buffering |
| Post-call usefulness | Time to a validated review, reviewer edit rate, unsupported-score rate and review completion time |

LiveKit provides EOU, LLM and TTS metrics and correlation through speech IDs. Its EOU delay already includes transcription delay: do not add transcription delay a second time. The documented sum of EOU + LLM first token + TTS first byte is a pipeline approximation; measure actual client playback for user-perceived latency. [LiveKit data hooks](https://docs.livekit.io/deploy/observability/data/)

Create a replay harness before tuning. Replay the same approved audio at the same pacing, label true boundaries, compare configurations, and then run live device/network tests. A saved file does not reproduce every live transport condition. Tune noise processing, endpointing and interruption detection separately; only then consider preemptive model/TTS generation. It can trade extra work and cancellation complexity for latency. [LiveKit tuning guide](https://docs.livekit.io/agents/logic/turns/tuning/)

## Failure and edge-case acceptance work

The following is proposed coverage, not a claim that these tests exist:

- Ingestion: duplicate/out-of-order events, expired tokens or media URLs, provider rate limits, deleted recordings, missing channel, truncated upload, corrupt audio and disconnect during download.
- Speech: hesitation, prolonged silence, accents, code-switching, names and numbers, negation, quiet speech, clipping, echo, hold music, background television and simultaneous speakers.
- Turn handling: “I need to book ... [pause] ... next week”, backchannel “mm-hm”, coughs, agent interrupted immediately, repeated interruptions and user resuming after an endpoint.
- Generation and tools: retrieval empty or unauthorized, irrelevant but valid-looking citation, malicious instruction inside a transcript, stale policy, model timeout and cancellation after a tool action. Retrying a booking must not duplicate it.
- Persistence: replay creates no duplicate charge/record, transcript correction preserves the reviewed version, cross-workspace references fail, deletion reaches derived artifacts, and stale model output cannot replace a newer human assessment.
- Quality: compare human-human agreement before model-human agreement, separate unsupported evidence from incorrect interpretation, report subgroup/sample coverage, and do not infer outcome causality from observational call data.

A credible portfolio deliverable is a reproducible benchmark report with the dataset manifest and permissions, pinned service/model/configuration versions, held-out split, raw metric definitions, cost calculation and an incident write-up showing a failure, diagnosis, fix and regression test. This demonstrates engineering judgment more clearly than adding every voice framework.
