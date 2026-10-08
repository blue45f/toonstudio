import { t } from "./engineering-glossary-more-kit";

import type { GlossaryTerm } from "./engineering-glossary-content";

/** 확장 용어집 · AI. 기계가 돕고 사람이 정하는 일에 쓰는 말들. */
export const GLOSSARY_MORE_AI: readonly GlossaryTerm[] = [
  {
    id: "llm",
    category: "ai",
    term: t("LLM (대규모 언어 모델)", "LLM (large language model)"),
    definition: t(
      "엄청난 양의 글을 읽고 배워서 ‘다음에 올 말’을 이어 쓰며 질문에 답하고 글을 만들어 주는 AI 모델입니다.",
      "An AI model trained on vast amounts of text that continues ‘what comes next’, answering questions and drafting writing.",
    ),
    analogy: t(
      "책을 수없이 읽은 자동 완성 기능과 같습니다. 문장의 앞부분을 보고 가장 그럴듯한 뒷부분을 이어 붙입니다. 그럴듯하다고 항상 맞는 것은 아닙니다.",
      "Like an autocomplete that has read countless books: it extends a sentence with the most plausible ending, and plausible is not always correct.",
    ),
    inToonstudio: t(
      "캐릭터 채팅(character-chat-engine.ts)과 홈 화면 Luna 패널 같은 글 대화에서 LLM 공급자를 부릅니다(shared/ai/user-ai-transport.ts). 공급자 이름을 코드에 흩어 두지 않고 ‘작업 의도’와 ‘공급자 API’를 분리해, 허용 목록의 무료 경로부터 시도합니다(shared/ai/free-ai-policy.ts 의 프리셋 11개: 공급자 10곳과 사용자 지정 1개). 결과는 제안이고 확정은 사람이 합니다.",
      "LLM providers are called for text conversations such as character chat (character-chat-engine.ts) and the home Luna panel (shared/ai/user-ai-transport.ts). Rather than scattering provider names through the code, task intent is separated from the provider API and allowlisted free paths are tried first (11 presets in shared/ai/free-ai-policy.ts: 10 providers plus one user-defined endpoint). The output is a proposal; a person confirms.",
    ),
    chapters: ["ai-routing", "free-ai-routing"],
    atlasIds: ["free-first-ai-routing"],
  },
  {
    id: "token",
    category: "ai",
    term: t("토큰 (Token)", "Token"),
    definition: t(
      "AI 가 글을 읽고 쓸 때 쓰는 계산 단위입니다. 대략 단어 한 개나 조각 한 개이며, 요금과 한도가 이 단위로 매겨집니다.",
      "The unit an AI reads and writes in: roughly a word or word fragment. Pricing and limits are counted in these.",
    ),
    analogy: t(
      "택시 미터기의 거리 칸과 같습니다. 말을 많이 할수록 칸이 올라가고, 한도는 ‘하루에 몇 칸까지’로 정합니다.",
      "Like the distance ticks on a taxi meter: the more is said, the higher it climbs, and the limit is how many ticks per day.",
    ),
    inToonstudio: t(
      "무료 경로에는 하루 한도를 둡니다. 브라우저 쪽은 요청 25회·예약 토큰 64,000·출력 1,024 토큰(MANAGED_FREE_*, shared/ai/free-ai-runtime-budget.ts)이고, 서버는 사용자당 1,000,000·전체 2,000,000 토큰이 코드 기본값입니다(studio-ai-usage.ts). 하루의 기준은 한국 시간이 아니라 UTC 자정(한국 시간 오전 9시)입니다.",
      "Free paths carry daily caps. In the browser: 25 requests, 64,000 reserved tokens and 1,024 output tokens (MANAGED_FREE_* in shared/ai/free-ai-runtime-budget.ts); on the server the code defaults are 1,000,000 tokens per user and 2,000,000 overall (studio-ai-usage.ts). A ‘day’ rolls over at UTC midnight (09:00 in Korea), not at Korean midnight.",
    ),
    chapters: ["free-ai-routing", "cost-engineering"],
    atlasIds: ["quota-ledger-budget"],
  },
  {
    id: "quota-ledger",
    category: "ai",
    term: t("쿼터 원장 (먼저 예약, 그다음 호출)", "Quota ledger (reserve first, then call)"),
    definition: t(
      "비용이 나가기 전에 하루 한도를 먼저 ‘예약’해 두고, 한도에 닿으면 호출 자체를 하지 않는 장부입니다.",
      "A ledger that reserves part of the daily budget before any cost is incurred and skips the call entirely once the limit is reached.",
    ),
    analogy: t(
      "식당 좌석 예약과 같습니다. 자리가 없으면 손님을 받은 뒤에 거절하지 않고 처음부터 예약을 받지 않습니다.",
      "Like restaurant seat booking: when full, you decline the booking up front rather than seating the guest and then turning them away.",
    ),
    inToonstudio: t(
      "브라우저는 guardFreeAiRuntimeRequest 가 호출 전에 요청 수와 예약 토큰을 차감하고 원장 항목을 최대 64개(MAX_LEDGER_ENTRIES)까지 보관합니다. 여러 탭이 같은 한도를 동시에 깎지 않도록 Web Locks(‘toonstudio:user-ai:runtime-budget’)로 직렬화합니다. 서버도 사용자별·전체 하루 한도를 따로 갖습니다.",
      "In the browser, guardFreeAiRuntimeRequest deducts requests and reserved tokens before the call and keeps up to 64 ledger entries (MAX_LEDGER_ENTRIES). Web Locks (‘toonstudio:user-ai:runtime-budget’) serialize it so several tabs cannot cut the same budget at once. The server also keeps per-user and global daily caps of its own.",
    ),
    chapters: ["free-ai-routing", "cost-engineering"],
    atlasIds: ["quota-ledger-budget"],
  },
  {
    id: "byok",
    category: "ai",
    term: t("BYOK (내 키 가져오기)", "BYOK (bring your own key)"),
    definition: t(
      "서비스가 요금을 대신 내는 대신, 사용자가 자기 AI 계정의 키를 가져와 쓰는 방식입니다. 비용과 약관의 주인이 사용자입니다.",
      "Instead of the service paying, users bring the key of their own AI account, so cost and terms belong to them.",
    ),
    analogy: t(
      "남의 집 주방을 쓰되 식재료는 내가 가져가는 것과 같습니다. 열쇠(키)는 내 주머니에 두고, 주인은 열쇠를 보관하지 않습니다.",
      "Like cooking in someone's kitchen with your own groceries: the key stays in your pocket and the host never keeps it.",
    ),
    inToonstudio: t(
      "키는 사용자가 정한 보관함 비밀번호(12~1,024자)로 PBKDF2(310,000회, SHA-256)에서 만든 AES-GCM 256비트 키로 암호화합니다(shared/ai/user-ai-crypto.ts). 유료 경로는 allowPaidFallback 기본값이 false 라서 사용자가 허락해야 자동 순서에 들어옵니다(user-ai-types.ts). 키 값은 문서·로그·테스트에 넣지 않습니다.",
      "Keys are encrypted with an AES-GCM 256-bit key derived by PBKDF2 (310,000 rounds, SHA-256) from a vault passphrase of 12-1,024 characters (shared/ai/user-ai-crypto.ts). Paid routes have allowPaidFallback defaulting to false, so the user must opt in before they join the automatic order (user-ai-types.ts). Key values never go into documents, logs or tests.",
    ),
    chapters: ["ai-routing", "free-ai-routing"],
    atlasIds: ["byok-paid-approval-gate"],
  },
  {
    id: "ai-provider-allowlist",
    category: "ai",
    term: t("공급자 허용 목록 (무료 인정 기준)", "Provider allowlist (what counts as free)"),
    definition: t(
      "‘무료’라고 믿어도 되는 AI 호출 주소·경로·모델을 목록에 적어 두고, 정확히 같을 때만 무료로 인정하는 방식입니다.",
      "A list of the AI call addresses, paths and models trusted to be free; only an exact match counts as free.",
    ),
    analogy: t(
      "무료 시식 코너의 명단과 같습니다. 이름이 비슷하다고 공짜가 되지 않고, 명단에 있는 메뉴만 공짜입니다.",
      "Like the list of a free-tasting corner: a similar-looking dish is not free, only items on the list are.",
    ),
    inToonstudio: t(
      "주소·경로·모델이 FREE_AI_PRESETS 와 정확히 같아야 무료로 보며, 코드 주석에 무료 허용 주소 검토일(2026-09-16)을 남깁니다(shared/ai/free-ai-policy.ts). 서버 공유 풀은 운영자가 확인해야 들어오므로 상태는 ‘설정됨’이며, 운영 키가 모두 준비됐다고 말하지 않습니다.",
      "Address, path and model must match FREE_AI_PRESETS exactly to count as free, and a code comment records the review date of the free-allowed addresses (2026-09-16) (shared/ai/free-ai-policy.ts). The server shared pool admits providers only after operator confirmation, so its status is ‘configured’ and nobody claims every production key is ready.",
    ),
    chapters: ["free-ai-routing", "ai-provider-contract"],
    atlasIds: ["free-ai-provider-allowlist"],
  },
  {
    id: "ambiguous-failure",
    category: "ai",
    term: t("모호한 실패 (다른 길로 재전송 금지)", "Ambiguous failure (no resend elsewhere)"),
    definition: t(
      "시간 초과나 서버 오류처럼 ‘요청이 처리됐는지 알 수 없는’ 실패는 다른 경로로 다시 보내지 않고, 분명한 거절만 다음 경로로 넘기는 규칙입니다.",
      "A rule that failures where you cannot tell whether the request was processed, like timeouts and server errors, are not resent elsewhere; only clear refusals move to the next route.",
    ),
    analogy: t(
      "송금 후 화면이 멈췄을 때 다른 계좌로 한 번 더 보내지 않는 것과 같습니다. 이미 갔을 수 있으니 확인부터 합니다.",
      "Like not wiring the money a second time from another account when the screen froze after sending: it may already have gone, so check first.",
    ),
    inToonstudio: t(
      "classifyStudioAiProviderFailure 는 무료 풀 공급자의 402·429(와 Cloudflare 5035·Qwen 무료 한도 403)만 billingFailoverEligible 로 보고 다음 공급자로 넘깁니다. 비무료 공급자의 429, 그 밖의 401/403, 5xx 는 넘기지 않습니다(apps/api/src/modules/studio-ai/studio-ai-provider.ts). 서버 호출 기본 제한은 45,000ms, 브라우저 개인 키 호출은 180,000ms 이고, 요청 영수증을 30분 보관해(studio-ai-idempotency.ts) 이중 실행을 막습니다.",
      "classifyStudioAiProviderFailure treats only a free-pool provider's 402 and 429 (plus Cloudflare 5035 and Qwen's free-quota 403) as billingFailoverEligible and moves them to the next provider. A 429 from a non-free provider, other 401/403 responses and 5xx are not passed on (apps/api/src/modules/studio-ai/studio-ai-provider.ts). The default server call limit is 45,000 ms and a browser personal-key call 180,000 ms, and request receipts are kept for 30 minutes (studio-ai-idempotency.ts) to prevent double execution.",
    ),
    chapters: ["free-ai-routing", "cost-engineering"],
    atlasIds: ["ambiguous-failure-no-retry"],
  },
  {
    id: "ai-proposal-review",
    category: "ai",
    term: t("AI 제안 · 사람 확정 (제안 검토 패널)", "AI proposes, people confirm (proposal review)"),
    definition: t(
      "AI 가 만든 결과를 곧바로 작품에 넣지 않고 ‘제안’으로 보여 준 뒤, 사람이 살펴보고 적용을 눌러야 문서에 반영하는 방식입니다.",
      "AI output is shown as a proposal first and reaches the document only after a person reviews it and presses apply.",
    ),
    analogy: t(
      "편집자가 붉은 펜으로 고쳐 준 원고를 작가가 하나씩 받아들이거나 거절하는 교정지와 같습니다. 최종 원고의 주인은 작가입니다.",
      "Like proofs marked in red by an editor, which the author accepts or rejects one by one; the author owns the final manuscript.",
    ),
    inToonstudio: t(
      "획 제안은 studio-stroke-proposal.ts 의 구조로 오고, 각 제안에 공급자·모델·시드·프롬프트 해시·전송 경로(local/byom/byok/server)가 출처로 붙습니다. 사용자가 StudioStrokeProposalReviewPanel 에서 검토한 뒤 onApplyTransaction 으로 적용해야 문서가 바뀝니다. 돈이 드는 길도 같은 원칙으로 사람이 허락해야 열립니다.",
      "Stroke proposals arrive in the structure of studio-stroke-proposal.ts, each with provenance: provider, model, seed, prompt hash and transport (local/byom/byok/server). The document changes only when the user reviews it in StudioStrokeProposalReviewPanel and applies it through onApplyTransaction. Routes that cost money open under the same principle: a person must allow them.",
    ),
    chapters: ["ai-routing", "free-ai-cost-router"],
    atlasIds: ["ai-proposal-not-commit", "ai-provenance-rights"],
  },
  {
    id: "ai-inference",
    category: "ai",
    term: t("추론 (Inference)", "Inference"),
    definition: t(
      "이미 학습이 끝난 AI 모델에 새 입력을 넣어 결과를 얻는 일입니다. 학습(만들기)이 아니라 사용(돌리기)입니다.",
      "Feeding new input to an already trained AI model to get an answer: using it, not training it.",
    ),
    analogy: t(
      "요리 학교에서 레시피를 배우는 것이 학습이고, 주문이 들어올 때마다 그 레시피로 요리하는 것이 추론입니다.",
      "Learning recipes at cooking school is training; cooking from them whenever an order arrives is inference.",
    ),
    inToonstudio: t(
      "채색(Tag2Pix)·배경 제거(U-2-Netp)·선 추출(TEED)·업스케일(Real-ESRGAN)·애니풍 변환(AnimeGAN) 모델 5종(파일 6개)을 브라우저 안에서 돌립니다(studio-onnx-*.ts). 모델 파일은 모두 sha256 으로 고정하고, 가장 큰 Tag2Pix 는 79,269,994B 입니다. 그림이 서버로 나가지 않는 것이 이유입니다. 영상·3D 추론은 사용자가 연결한 GPU 서버가 맡고, 연결이 없으면 운영 API 는 503(PERSONAL_CREATOR_RUNTIME_REQUIRED)으로 안내합니다.",
      "Five models (six files) run inside the browser: colorize (Tag2Pix), background removal (U-2-Netp), line extraction (TEED), upscaling (Real-ESRGAN) and anime style (AnimeGAN) (studio-onnx-*.ts). Every model file is pinned by sha256, and the largest, Tag2Pix, is 79,269,994 B. The reason is that the drawing never leaves the device. Video and 3D inference run on a GPU server the user connects; without one the production API answers 503 (PERSONAL_CREATOR_RUNTIME_REQUIRED).",
    ),
    chapters: ["on-device-inference", "browser-local-compute"],
    atlasIds: ["onnx-runtime-web-inference", "creator-inference-service"],
  },
  {
    id: "quantization-q8",
    category: "ai",
    term: t("양자화 (q8)", "Quantization (q8)"),
    definition: t(
      "모델 속 숫자를 더 짧은 자릿수(예: 8비트 정수)로 줄여 파일을 작게 하고 속도를 올리는 기법입니다. 정밀도를 조금 내주는 대신 가벼워집니다.",
      "Shrinking the numbers inside a model to fewer digits (for example 8-bit integers) so the file is smaller and faster, trading a little precision for lightness.",
    ),
    analogy: t(
      "사진을 JPEG 로 저장하는 것과 같습니다. 눈에 띄지 않는 정보는 덜어 내 용량을 크게 줄입니다.",
      "Like saving a photo as JPEG: details nobody notices are dropped, and the size shrinks a lot.",
    ),
    inToonstudio: t(
      "한글 검색어를 영어로 바꾸는 번역 모델 Xenova/opus-mt-ko-en 을 q8 로 씁니다. 필수 파일 합계는 RESEARCH_MT_MODEL_TOTAL_BYTES = 123,110,000B(2026-10-06 실측)입니다. 원격 다운로드는 꺼 두고(allowRemoteModels = false) 자체 호스팅 경로(/models/)에서만 읽으며, 이 모델 파일은 저장소에 없어 배포 때 배치해야 켜집니다.",
      "The Korean-to-English search-query translator Xenova/opus-mt-ko-en is used at q8. The required files total RESEARCH_MT_MODEL_TOTAL_BYTES = 123,110,000 B (measured 2026-10-06). Remote download is disabled (allowRemoteModels = false) and files are read only from the self-hosted /models/ path; the model is not in the repository and must be placed at deployment for the feature to switch on.",
    ),
    chapters: ["on-device-translation", "on-device-inference"],
    atlasIds: ["transformers-js-translation"],
  },
  {
    id: "execution-provider",
    category: "ai",
    term: t("실행 공급자 (Execution Provider)", "Execution provider"),
    definition: t(
      "ONNX Runtime 이 모델을 실제로 계산할 장치(GPU 의 WebGPU, CPU 의 WASM 등)를 고르는 선택지입니다.",
      "The choice of device on which ONNX Runtime actually computes a model, such as WebGPU on the GPU or WASM on the CPU.",
    ),
    analogy: t(
      "같은 레시피를 가스레인지(GPU)로 할지 전기 포트(CPU)로 할지 고르는 것과 같습니다. 결과는 같아도 걸리는 시간이 다릅니다.",
      "Like choosing whether to cook one recipe on a gas stove (GPU) or an electric kettle (CPU): same dish, different time.",
    ),
    inToonstudio: t(
      "StudioOnnxExecutionProvider 는 ‘webgpu’ | ‘wasm’ 두 가지이고 기본은 webgpu 입니다(studio-onnx-inference-provider.ts). 세션 하나는 provider 하나만 쓰고 실패하면 닫습니다(fail-closed). 다만 5개 기능 래퍼(예: studio-onnx-teed.ts)는 webgpu 가 실패하면 그 경로를 접고 wasm 으로 다시 시도하는데, 이는 ADR-0018 §12(실패 뒤 두 번째 provider 금지)와 어긋나는 현재 구현이며 도감 카드가 그 사실을 적어 둡니다.",
      "StudioOnnxExecutionProvider is ‘webgpu’ or ‘wasm’, defaulting to webgpu (studio-onnx-inference-provider.ts). One session uses a single provider and closes on failure (fail-closed). However, the five feature wrappers (for example studio-onnx-teed.ts) retire the webgpu route when it fails and retry on wasm, which conflicts with ADR-0018 section 12 (no second provider after a failure); this is the current implementation, and the atlas card records that fact.",
    ),
    chapters: ["on-device-inference", "browser-local-compute"],
    atlasIds: ["onnx-runtime-web-inference"],
  },
  {
    id: "embedding",
    category: "ai",
    term: t("임베딩 · 코사인 유사도", "Embedding · cosine similarity"),
    definition: t(
      "이미지나 글을 숫자 목록(벡터)으로 바꾸어 ‘얼마나 비슷한가’를 계산할 수 있게 한 것이 임베딩이고, 두 벡터의 방향이 얼마나 같은지를 재는 값이 코사인 유사도입니다.",
      "An embedding turns an image or text into a list of numbers so similarity can be computed; cosine similarity measures how closely two such lists point in the same direction.",
    ),
    analogy: t(
      "사람마다 취향을 좌표로 찍은 지도와 같습니다. 가까운 점끼리는 취향이 비슷하고, 두 사람이 같은 방향을 가리키면 코사인 유사도가 높습니다.",
      "Like a map where each person's taste is a point: nearby points like similar things, and two people pointing the same way score high on cosine similarity.",
    ),
    inToonstudio: t(
      "아바타 참조 이미지 추천 워커(vrm/studio-vrm-avatar-reference.worker.ts)가 MediaPipe ImageEmbedder 로 이미지를 벡터로 바꾸고 cosineSimilarity 로 비슷한 정도를 계산합니다. 모델 파일은 4,117,670B 로 고정돼 있습니다(STUDIO_VRM_AVATAR_REFERENCE_MODEL_BYTE_LENGTH). 모델은 Google 저장소에서 런타임에 내려받으며, 이 경로를 ‘전부 로컬’이라고 말하지 않습니다.",
      "The avatar-reference recommendation worker (vrm/studio-vrm-avatar-reference.worker.ts) turns images into vectors with MediaPipe ImageEmbedder and scores likeness with cosineSimilarity. The model file is pinned at 4,117,670 B (STUDIO_VRM_AVATAR_REFERENCE_MODEL_BYTE_LENGTH). The model is downloaded at run time from a Google bucket, so this path is not described as ‘fully local’.",
    ),
    chapters: ["on-device-inference", "browser-local-compute"],
    atlasIds: ["mediapipe-webcam-pose"],
  },
  {
    id: "mcp",
    category: "ai",
    term: t("MCP (Model Context Protocol)", "MCP (Model Context Protocol)"),
    definition: t(
      "AI 비서가 외부 도구(예: Blender)를 같은 방식으로 불러 쓰게 하는 연결 규격입니다. AI 용 USB 단자처럼 도구마다 따로 연결 코드를 짤 필요를 줄입니다.",
      "A connection standard that lets an AI assistant call outside tools (for example Blender) in one common way, like a USB port for AI.",
    ),
    analogy: t(
      "만능 리모컨의 표준 단자와 같습니다. 어떤 기기든 같은 단자에 꽂으면 ‘켜기·끄기’ 같은 명령을 같은 방식으로 보낼 수 있습니다.",
      "Like the standard socket of a universal remote: plug in any device and send commands such as on and off the same way.",
    ),
    inToonstudio: t(
      "VRM 생성 경로에는 Blender·blender-mcp 가 설치돼 있는지 --version(제한 4초)으로 점검하는 코드만 있고(studio-vrm-generate-blender-mcp.ts), blender-mcp 는 VRM 바이트를 만들 수 없어 이 경로는 늘 ‘사용 불가’로 닫히며 가짜 VRM 도 만들지 않습니다. 실제 VRM 생성은 Blender 를 거치지 않는 toonstudio-vrm-generate 호스트가 맡고, Blender 연결은 ToonBridge+MCP 어댑터입니다(도감 blender-mcp-toonbridge, 상태 ‘설정됨’). 개발자용 MCP 외부 공개는 운영자 활성화 단계라 아직 계약 공개가 출발점입니다.",
      "The VRM generation path only has code that probes whether Blender and blender-mcp are installed with --version (4-second limit) (studio-vrm-generate-blender-mcp.ts). blender-mcp cannot produce VRM bytes, so this path always closes as ‘unavailable’ and never fabricates a VRM. Real VRM generation is done by the toonstudio-vrm-generate host, which does not go through Blender; the Blender connection is the ToonBridge plus MCP adapter (atlas card blender-mcp-toonbridge, status configured). Public MCP exposure for developers is an operator-activation step, so publishing the contract is the starting point.",
    ),
    chapters: ["blender-mcp", "blender-mcp-boundary"],
    atlasIds: ["blender-mcp-toonbridge"],
  },
  {
    id: "transformers-js",
    category: "ai",
    term: t("Transformers.js (브라우저 안의 언어 모델)", "Transformers.js (language models in the browser)"),
    definition: t(
      "허깅페이스의 모델을 서버 없이 브라우저에서 돌려 주는 자바스크립트 라이브러리입니다. 번역·분류 같은 작은 모델에 맞습니다.",
      "A JavaScript library that runs Hugging Face models in the browser without a server, suited to small models for translation or classification.",
    ),
    analogy: t(
      "통역사를 전화로 부르는 대신 포켓 번역기를 주머니에 넣고 다니는 것과 같습니다. 인터넷이 약해도, 내용이 밖으로 나가지 않아도 됩니다.",
      "Like carrying a pocket translator instead of phoning an interpreter: it works with weak internet and nothing leaves your device.",
    ),
    inToonstudio: t(
      "리서치 데스크의 한글 검색어를 ‘사전 → 기기 안 번역 모델 → 원문’ 순으로 영어로 바꿉니다(research-query-translation.ts 의 resolveResearchQueryTranslation, research-query-mt.ts 의 loadOpusMtTranslator). 모델은 세션당 한 번만 느리게 불러오고(lazy load) 결과를 캐시합니다. 상태는 ‘설정됨’입니다. 모델 파일을 배포 때 배치해야 켜집니다.",
      "A Korean research query becomes English in the order dictionary, then on-device translation model, then the original (resolveResearchQueryTranslation in research-query-translation.ts, loadOpusMtTranslator in research-query-mt.ts). The model is lazy-loaded once per session and the result cached. Status is ‘configured’: the model file must be placed at deployment before it turns on.",
    ),
    chapters: ["on-device-translation", "transformers-js"],
    atlasIds: ["transformers-js-translation"],
  },
];
