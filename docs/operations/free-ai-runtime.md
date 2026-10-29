# Cloud-only free-first AI runtime

ToonStudio can provide text AI without requiring every user to paste a key. The runtime combines an operator-funded premium route ("ToonStudio AI", budget-capped), a billing-disabled shared free pool and user-configured cloud API routes, and fails closed when no permitted cloud route is available. Local LLMs, localhost gateways, private-network endpoints, browser model downloads, and self-hosted GPU inference are not supported AI execution paths.

Order of use (user decision 2026-10-29): a key the user registered is used first; without one, the server runs **ToonStudio AI** — the operator premium route first, then the shared free pool in quality order.

## Operator premium route (ToonStudio AI, first for keyless users)

`STUDIO_AI_ANTHROPIC_API_KEY` enables provider id `anthropic` (default model `claude-opus-5-5`, `STUDIO_AI_ANTHROPIC_MODEL` to change). It is server-only: never a `VITE_` variable, never in responses or logs.

- **Who pays:** the operator. The route is `sponsored`, so user credits are never charged for it.
- **Budget:** UTC daily limits read from the usage ledger — per-user requests (`STUDIO_AI_PREMIUM_USER_DAILY_REQUEST_LIMIT`, default 30) and service-wide requests/tokens (`STUDIO_AI_PREMIUM_GLOBAL_DAILY_REQUEST_LIMIT` 400, `STUDIO_AI_PREMIUM_GLOBAL_DAILY_TOKEN_LIMIT` 3,000,000). If the budget or the ledger cannot be read the route stays closed and the request goes straight to the free pool (fail-closed). Calls rejected before inference (`provider_rate_limited`) count toward neither budget; calls whose usage is unknown (timeout, network error, cancel) count at the call's own conservative reservation instead of 0 — the same size-based amount the general server quota charges them. Premium ledger rows store it in `reservedTokens`; rows written before migration 0115 lack it and count at the largest possible reservation (250,000). When the API's server-side fallback re-runs a declined request, every attempt is billed but the top-level `usage` covers only the attempt that answered; the ledger, quota and budget therefore sum `usage.iterations` (never less than the top-level counts). If the budget is spent and no free provider can take the request, the API answers `429 FREE_AI_POOL_EXHAUSTED` (today's limit) instead of `503 FREE_AI_POOL_UNAVAILABLE`; a ledger that is not ready still reads as unavailable.
- **Migration first:** apply migrations `0114_studio_ai_premium_route_ledger` (ledger provider constraint + budget index) and `0115_studio_ai_usage_ledger_reserved_tokens` (per-call reservation column) before setting the key; the budget check reports "not ready" and keeps the route closed until both exist.
- **Failover:** only definitive pre-inference rejections move the same request to the free pool (`premium_unavailable`): 429, 529, 402, 400 (billing, operator-key configuration such as a missing workspace, or an unsupported request shape), 401, 403, 404 and 413. 5xx, timeouts and malformed responses are not replayed. Each cause is logged once per 10 minutes as `[studio-ai] premium route rejected before inference` with the status and error type only.
- **Workspace:** a key that is not scoped to a workspace (an organization-wide key) must name a workspace on every request. Set `STUDIO_AI_ANTHROPIC_WORKSPACE_ID` (`wrkspc_…`) and the server sends it as `anthropic-workspace-id`; without it the API answers 400 and every request falls through to the free pool. Keys created inside a workspace need nothing.
- **Request shape:** no sampling parameters; per-task `effort`, a thinking headroom on the output cap and the server-side model fallback (`fallbacks: "default"`). Timeout `STUDIO_AI_ANTHROPIC_TIMEOUT_MS` (max 120 s); the browser waits 135 s.
- `STUDIO_AI_PREMIUM_AUTO=false` keeps the key but removes the route from automatic order (explicit selection only). `STUDIO_AI_PREMIUM_ALLOWED_MODELS` lists the models an assist request may ask for.

AI assist features (vision and structured output) use `POST /studio-ai/messages`, a Messages-API subset (text and base64 image blocks, system blocks, JSON-schema output). It runs on the premium route first and, on a definitive rejection, converts the same request for vision-capable free providers (Gemini; Groq with its vision model). The response is always a normalized Messages object, and the browser validates it with the same Zod schema as the BYOK path.

## Default shared free pool

The default quality order is:

1. Gemini free tier;
2. Qwen China (Beijing) Free Quota Only;
3. Groq free tier;
4. SambaNova Free Tier;
5. Z.AI free Flash;
6. Mistral Free mode;
7. Cloudflare Workers AI on Workers Free;
8. OpenRouter free router;
9. SiliconFlow free text model.

`STUDIO_AI_FREE_PROVIDER_ORDER` defines the deployment default. An authenticated request may send a validated, duplicate-free subset/order from the unified settings UI. The user order is applied before the deployment default and missing entries are appended, so the pool remains complete.

A shared provider is eligible only when:

- `STUDIO_AI_FREE_POOL_ENABLED=true`;
- its server-side key exists;
- its `STUDIO_AI_FREE_*_CONFIRMED=true` approval exists;
- its endpoint and model satisfy the hardcoded free-only policy.

Shared keys never appear in `VITE_` variables, browser responses, logs, or artwork files.

## Personal cloud routing

One connection can store multiple key profiles and multiple model profiles. Each connection, key, and model has an enabled flag and numeric priority. Models are assigned to `text`, `image`, `inference`, or `three-d`.

Three modes are available:

- **Automatic:** registered personal routes first (free-tier routes always; paid BYOK routes once the user confirmed paid use), then ToonStudio AI (operator premium → shared free pool). A personal route hands the request over only on a definitive pre-inference rejection (quota exhaustion, authentication); if ToonStudio AI is also unavailable after an authentication rejection, the user sees the key error rather than a generic exhaustion message.
- **Priority:** numeric connection/model/key priority is used; the shared free pool has its own priority value.
- **Manual:** one exact connection/key/model route is selected for each capability.

Paid `user-funded-byok` routes are excluded from automatic and priority fallback until the user explicitly enables paid use. Registering a paid key through the paste box requires confirming that charges may apply, and that confirmation enables paid use. Manual selection is treated as explicit consent to use that route.

## Cloud-only endpoint policy

Personal endpoints must be public HTTPS URLs. The validator rejects URL credentials, query strings, fragments, redirects, site-self origins, localhost, loopback, `.local`/`.lan`/`.internal`, RFC1918, carrier-grade NAT, link-local, and private IPv6 ranges.

Supported connection policies:

| Policy | Enforcement |
| --- | --- |
| `openrouter-free` | Exact OpenRouter API base URL and `openrouter/free` or a `:free` model; text only. |
| `provider-free-tier` | Exact reviewed cloud endpoint and a reviewed free text model. The user confirms provider billing/fallback is disabled. |
| `user-funded-byok` | Any validated public HTTPS cloud API. Charges may be applied by the user’s provider account. |
| `unverified` | Blocked until the migrated or modified connection is reviewed. |

## Claude (Anthropic Messages) connections

A connection whose base URL is exactly `https://api.anthropic.com` uses the `anthropic-messages` wire protocol instead of the OpenAI-compatible one. The wire protocol is inferred from the host, so no new connection policy exists: it is a `user-funded-byok` connection and follows every rule above.

- Requests go from the browser straight to Anthropic with the user's own key. The ToonStudio API never sees the key or the content.
- Without a registered Claude key the same features run on the managed route (`POST /studio-ai/messages`, see above). The managed route skips the user budget and usage meter (no user cost), the result model is labelled "ToonStudio AI (<served model>)" so no user cost is estimated, and the dialogs show "무료" with a sign-in hint when the user is signed out.
- The official SDK (`@anthropic-ai/sdk`) is loaded lazily and is handed only a guarded `fetch`: official origin only, only `POST /v1/messages` and `GET /v1/models?limit=N` are allowed, cookies, site and tracing headers removed, the credential header must equal the user's key, redirects are errors, responses are read up to a cap. The SDK's own telemetry is off. `maxRetries` is `0`: an ambiguous failure is never resent, and the model is never switched automatically.
- Claude-native features (vision, structured outputs: art director, command helper, translation, alt text) show the processing route, what is sent, an upper bound on the cost and the failure policy before every request, and honour a user-set session budget. The budget is enforced in the transport layer (a request that could exceed it is refused unless the user approved that one request), requests in flight are reserved at their cost cap, and requests that were sent but never returned usage (abort, timeout, unreadable response) are counted at their cap as unconfirmed. See [Claude AI 보조](../features/ai-assist.md).
- Prices shown in the UI are estimates from the public price table with its reference date; the Anthropic console is the source of truth for billing.
- Production needs the static CSP change (`connect-src` includes `https://api.anthropic.com`) to be deployed through the normal static release approval before any Claude request can leave the browser.

## Safe fallback

The runtime advances only after a definitive pre-inference rejection:

- `401`/`403` for a personal key, or `400` with an invalid-key body (Gemini `API_KEY_INVALID`, xAI "Incorrect API key"), allowing the next configured key; the `400` case starts the same 10-minute pause as `401`, so a revoked key is not called on every request;
- `402`/`429` for payment/free-quota/request-quota rejection;
- Qwen `403/AllocationQuota.FreeTierOnly` and Cloudflare `403/5035` in the shared pool;
- the app’s own per-route browser safety-budget exhaustion;
- an empty answer cut at the output cap (`finish_reason: "length"`, common when a reasoning model spends the 1,024-token free cap on thinking): the next personal key is tried, then ToonStudio AI. A paid key that returns such an answer has already been billed, so the request is not sent to another paid key. After such an answer, a later key that definitively rejects the request before processing it (`400`, `404`, `405`, `410`, `413`, `415`, `422`; for example Groq `413` over its per-minute token cap) is skipped too; if no key answers, the request still goes to ToonStudio AI. `408`, `409` and `499` are not in that list: OpenRouter, for example, answers `408` when the upstream model timed out while generating, so the timeout rule below applies.

Network errors, timeouts, `5xx`, malformed success responses, and parse failures are surfaced immediately. The same request is not sent to another provider because the first provider may already have accepted it.

## Browser safety budget

`provider-free-tier` and `openrouter-free` routes use conservative per-route browser limits:

- 25 network attempts per UTC day;
- 64,000 conservatively reserved input/output tokens per UTC day;
- 1,024 output tokens per request;
- 256 KiB maximum JSON request body and 2 MiB maximum response body;
- `n = 1`, `best_of = 1`, no log-probability expansion, no streaming;
- only `GET /models` and `POST /chat/completions`.

Each budget entry belongs to one key and model: its name is the provider host, the model name, and a short non-reversible tag of the key (32-bit FNV-1a of the base URL and key). Connection, model-profile and key-profile IDs (`quick-groq:text-1:key-1`) are not part of it, because they follow registration order: after a reload another key can get the same IDs, and the same key can land in another slot. So two tabs with different keys never overwrite each other's counts or locks, and pasting a key again after a lock or reload keeps its counts and pauses in whatever slot it lands. Deleting a key, or changing its value or address, clears its entry — the documented way to lift a payment lock — unless another switched-on connection that passes the free-route policy still uses the same key and model. A switched-off or "재확인 필요" (unverified) connection holding the same key does not keep the entry. Adding, changing or deleting an image, inference or 3D model profile never touches an entry, because the ledger only counts text routes.

Entries written before the tag became part of the name (`host:routeId`) are read once for the route that wrote them. A tagged entry is used only by the same key. An untagged entry's counts for the current UTC day are kept, so the daily cap still holds. Its payment, authentication and rate-limit locks are dropped, because the key they belonged to is unknown; if it was the same key, the provider's next `402`/`401`/`429` locks it again. When the ledger exceeds 64 entries, entries from past days without a payment lock go first, then the least recently used. The entry just written is never dropped. The ledger stores counters, timestamps and the tag only, never prompts, outputs, or secrets.

## Managed cloud media inference

Image/video/2D↔3D server media jobs use:

```text
STUDIO_MEDIA_CLOUD_API_URL=https://managed-runtime.example.com
STUDIO_MEDIA_CLOUD_API_TOKEN=server-side-secret
```

Only a public HTTPS origin is accepted. HTTP, loopback, private networks, URL credentials, paths, query strings, and fragments are rejected. The API remains user-funded/fail-closed and does not substitute an operator-paid provider.

## Unified settings and secret storage

`/settings/ai` is the single canonical credential and routing surface. Studio, integration and inference screens render only a secret-free status card that links to this route instead of mounting duplicate editors. The default experience is progressive:

1. **시작하기** — "how AI runs now" (1. my keys → 2. ToonStudio AI) and a single paste box: the provider is detected from the key format (ambiguous formats ask the user), the key is verified with the provider's model list, and the official endpoint and a default model are filled in. Several keys can be pasted at once; keys of the same provider stack in one connection and are used in turn on quota/authentication rejection. A wizard for unlisted services and the paid-use choice stay on the same view;
2. **AI 사용 순서** — automatic, user-ordered and exact-manual modes with accessible up/down controls;
3. **고급 설정** — the existing full connection editor, multiple keys/models, exact paths, runtime tokens and encrypted vault.

The canonical owner still controls:

- shared free-pool status and order;
- automatic/priority/manual routing mode;
- multiple keys and models per cloud connection;
- exact capability route assignments;
- paid-fallback consent;
- Hyper3D/Rodin and managed Creator Runtime tokens;
- optional encrypted browser vault.

Personal keys remain in memory by default. The encrypted vault stores the normalized configuration but never stores the vault password. Embedded entry cards never render secrets, endpoints or model IDs. Browser requests omit cookies, reject redirects, and do not automatically retry ambiguous failures.

## Review checklist

- [ ] Every shared account has billing disabled or a provider-side hard free-only boundary.
- [ ] Every enabled shared provider has `CONFIRMED=true`.
- [ ] No preset or environment variable points to localhost/private AI infrastructure.
- [ ] Paid BYOK fallback is disabled by default and only enabled by explicit confirmation.
- [ ] Migrations 0114 and 0115 are applied before `STUDIO_AI_ANTHROPIC_API_KEY` is set, and the premium daily limits match the approved operator budget.
- [ ] No operator key is read from `VITE_` variables or shipped in the browser bundle.
- [ ] Multiple key/model route order is deterministic.
- [ ] `401`/`403`, `400` with an invalid-key body, `402`/`429`, and an empty cut-off answer (plus, after one, a later `400`/`404`/`405`/`410`/`413`/`415`/`422`) are the only personal-route automatic advance conditions.
- [ ] Network, timeout, `5xx`, parse, and malformed-success failures do not replay.
- [ ] No secret, prompt, or response is stored in quota ledgers or application logs.
