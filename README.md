# TokenWise

A local, demo-first AI optimization gateway. Optimize the input before selecting the model, then expose the decisions and usage in a chat workspace.

## Start here

Requires Node.js 22 or newer and npm. No model account or API key is needed.

```sh
npm install
npm start
```

Open http://127.0.0.1:3000. For automatic backend restarts, use `npm run dev`. Refresh the browser for frontend changes.

If port 3000 is occupied, set a different port in PowerShell before starting:

```powershell
$env:PORT = '3001'
npm start
```

```sh
npm test
npm run check
```

## What actually works

- Same-origin HTTP API, validated requests, bounded in-memory uploads, and local session scoping.
- Exact answer caching with a 10-minute TTL and a maximum of 100 entries. Keys include session, exact prompt, text history, content hashes, filenames, file types, video metadata, and relevant settings.
- Image artifact caching, separate from answers, with session scoping and a 10-minute TTL.
- Actual JPEG/PNG/WebP resizing to a 1024-pixel maximum side for eligible summary tasks; full detail for selected detail-sensitive terms or the Preserve detail control.
- Full image area retained, original bytes available during the request, evidence metadata, thumbnails, and original-detail restoration.
- UTF-8 TXT/MD attachments preserved verbatim. Prompt and text history are preserved; there is no lossy prompt compression.
- Browser-side sampling of up to six frames from a short video, followed by server-side image optimization before routing.
- Capability/context-based demo routing, a two-attempt recovery scenario, scoped cache clearing, a decision trail, and per-turn/session analytics.
- Chat, exact replay, usage ledger, copy response, session reset, and JSON export.

## What is simulated or not implemented

**There is no live LLM. All answers are scripted or explicit placeholders. Do not present this version as a general-purpose AI assistant.**

Token usage and pricing are illustrative, not provider-reported. Text estimates use `ceil(characterCount / 4)`. Image units use `85 + 170 * ceil(width / 512) * ceil(height / 512)` solely to demonstrate a tile-based cost model; this is not a universal provider formula. The rates in `server/routing.js` are demo fixtures, not current vendor prices.

Savings compare the original submitted input on Demo Large against the optimized pipeline's simulated inference cost, using the same scripted output length. All simulated inference attempts are counted. Negative savings are allowed. Local CPU, preprocessing, storage, and network costs are not priced. No real money is spent on a model.

The demo validation flag exercises control flow, not answer accuracy. No quality score, factual verification, model-based judge, or zero-accuracy-loss guarantee exists. The recovery scenario deliberately fails its first small-model attempt.

Not implemented yet: live providers, provider prompt caching, semantic answer caching, PDF extraction, OCR, audio transcription, scene detection, semantic frame selection, relevance retrieval, history summarization, and production authentication. Conversation history contains text turns only; previous attachments are not implicitly reattached to later turns.

Video sampling is for a coarse visual demo: MP4/WebM when the browser supports decoding, at most 50 MB and 120 seconds. Audio is excluded and short events may be missed. Preserve detail retains the sampled JPEG frame resolution, not the complete video. The video baseline covers original submitted sampled frames, not native whole-video inference. Do not claim a percentage of full-video token savings.

## Demo in five steps

1. Select **Explain tokens**, then send. Inspect the system/history/prompt breakdown and Demo Small route.
2. Use the response's repeat icon, **Replay exact request**, to reuse the original history and attachments. Confirm zero new inference usage and a cache hit. Manually repeating a prompt after adding history is correctly a different request.
3. Start a new conversation, select **Use sample image**, and send. Inspect real dimensions, bytes, and the vision-compatible route. Compare with Preserve detail enabled in another request.
4. Start a new conversation and select **Run recovery scenario**. Send without editing the prefilled prompt. Inspect both attempts and negative savings caused by retry overhead. Editing the prompt returns to normal mode.
5. Review the usage ledger and export the session. Optionally attach a short video and inspect sampled timestamps and frame dimensions.

## Architecture and contracts

```text
Browser input / optional video sampling
  -> Request validation and local scope
  -> Exact answer cache
  -> Image/text artifact preparation and evidence manifest
  -> Conservative context preparation
  -> Semantic cache bypass (explicitly disabled)
  -> Per-candidate eligibility and illustrative cost estimate
  -> Demo provider
  -> Demo structural check
  -> Restore originals and recheck retry eligibility if needed
  -> Answer + decision events + all-attempt accounting
```

Browser video decoding is local preprocessing. Raw video is not sent to the API; sampled frames and source metadata are. For a production ingestion policy, validate authorization and media constraints before any external OCR, embedding, transcription, or model service.

| Contract | Current fields |
| --- | --- |
| Request | `sessionId`, `prompt`, `history`, `files`, `scenario`, `preserveDetail`, optional `video` |
| Optimized payload | `text`, `assets`, `modalities`, `inputTokens`, `originalInputTokens`, `breakdown`, `evidence`, optional `restore()` |
| Evidence | Original hash, name, dimensions, byte/unit counts, retained/omitted content, action, preview |
| Route | `model`, `reason`; model has capabilities, context limit, and illustrative input/output prices |
| Demo provider result | `answer`, `valid`, `note` |
| Response | Answer, cache state, model, estimates, baseline scope, evidence, attempts, events, latency, measurement source |

`POST /api/chat` accepts multipart form data: one `request` JSON field and up to six `files` fields. `GET /api/health` reports demo mode. `DELETE /api/cache/:sessionId` clears only that session's answer cache, not its reusable file artifacts.

Limits: prompt 12,000 characters; up to 40 history messages, each at most 16,000 characters; at most six files of 8 MB each and 24 MB total; text files below 200 KB; image decode limit 24 megapixels. Oversized or unsupported inputs return errors rather than silently dropping evidence. Routing reserves 1,024 output units, but does not yet enforce a currency budget or a pipeline-wide deadline.

## Four-person ownership

| Owner | Files | Next implementation task |
| --- | --- | --- |
| Person 1: gateway and caching | `server/app.js`, `server/gateway.js`, `tests/api.test.js`, `tests/gateway.test.js` | Add persistent cache/usage storage, configurable budgets/deadlines, and authentication before shared hosting |
| Person 2: optimization | `server/optimizer.js`, `public/media.js`, `tests/optimizer.test.js` | Add PDF/OCR with evidence references; evaluate resolution policies; add transcripts and relevance-aware frames |
| Person 3: models and quality | `server/routing.js`, `server/provider.js`, new provider/evaluation tests | Connect a selected provider, implement actual usage records, independent validators, and a labeled quality evaluation set |
| Person 4: frontend and integration demo | `public/index.html`, `public/styles.css`, `public/app.js` | Add provider-status UI, measured-vs-estimated comparisons, and automated browser regression tests |

Start by having each person run the app and tests. Freeze changes to shared contracts before parallel work. Person 1 coordinates integration; every owner adds focused tests for their module.

## Connecting a real provider next

1. Choose the provider and small/large models together; verify modality support, tokenizer rules, context limits, and current prices.
2. Keep credentials server-side in ignored environment configuration. Never put keys in the browser or JSON exports.
3. Extend the provider result with provider-reported usage, cached input, finish reason, request ID, and model version. Update the gateway ledger to consume those fields rather than applying demo estimates.
4. Send the optimized text and media assets, enforce output limits/timeouts, and preserve usage on failed/retried calls. Add provider and policy versions to cache keys.
5. Separate runtime validation from the model's self-assessment. Count OCR, summarizer, embedding, validator, transcription, and retry costs when those services are introduced.
6. Compare baseline and optimized results on a labeled test set. Report task success and quality changes alongside savings, not a fabricated confidence percentage.

## Privacy and persistence

This server binds to loopback only. It has no production authentication and session IDs are not an authorization system. Do not expose it on a public interface or use sensitive data. Processing occurs locally and the current provider never calls an external model.

Caches live in process memory and disappear when the server stops. Conversations and usage totals live in browser memory and reset on refresh; export before leaving. JSON exports contain prompt/history/answer text and evidence thumbnails, so treat them as potentially sensitive. This version does not persist to SQLite or Redis.
