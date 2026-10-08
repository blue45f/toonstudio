import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 도감 · ai 카테고리 — 비용 계약 카드(무료 우선 라우팅·예산 원장·애매한 실패·BYOK·허용 목록).
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다. 사실은 2026-10-07 기준 코드·테스트로 확인했다.
 */

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

const FREE_FIRST_AI_ROUTING: EngineeringAtlasEntry = {
  id: "free-first-ai-routing",
  category: "ai",
  name: "Free-first AI routing",
  title: t("무료 우선 AI 길 고르기", "Picking the free AI route first"),
  status: "configured",
  tagline: t(
    "돈이 드는 길은 닫아 두고, 무료로 확인된 길만 순서대로 엽니다.",
    "Paid routes stay closed; only routes verified as free are opened, in order.",
  ),
  background: [
    t(
      "AI 기능은 한 번 부를 때마다 요금이 붙을 수 있습니다. 그래서 ToonStudio는 대형마트의 '무료 시식 코너'처럼, 무료라고 확인된 길만 기본으로 열어 두고 돈이 드는 길은 사용자가 직접 허락해야 열리게 만들었습니다. 무료 코너가 붐비거나 문을 닫아도 몰래 유료 코너로 데려가지 않고, '지금은 한도가 끝났다'고 알려 줍니다.",
      "Every call to an AI service can carry a fee. So ToonStudio works like a supermarket's free-sample corner: only routes verified as free are open by default, and a paid route opens only when the user allows it. If the free corner is crowded or closed, the app does not quietly walk you to the paid counter; it tells you the limit has been reached.",
    ),
    t(
      "요청은 대략 다섯 칸으로 걸러집니다. ① 텍스트인가 이미지인가: 자동 무료 길은 텍스트만 받습니다. ② 기기 안에서 끝나는가: 채색·배경 제거 같은 작업은 사용자가 그 패널을 고르면 기기 안 모델이 처리합니다. ③ 무료 허용 목록: 공급자 주소·경로·모델이 검토된 목록과 정확히 같아야 통과합니다. ④ 예산: 호출 직전에 하루 한도를 예약합니다. ⑤ 승인: 유료 키는 설정에서 허락해야 자동 순서에 들어옵니다. 결과는 마지막에 '제안'으로만 보입니다.",
      "A request passes about five checks. (1) Text or image? The automatic free route accepts text only. (2) Can it finish on the device? Tools such as colorizing or background removal run on on-device models once the user picks that panel. (3) Free allowlist: the provider address, path and model must match a reviewed list exactly. (4) Budget: the daily allowance is reserved right before the call. (5) Approval: a paid key joins the automatic order only after the user allows it. The result is shown only as a proposal at the end.",
    ),
    t(
      "대안은 둘입니다. 유료 모델 하나로 통일하면 사용량만큼 비용이 늘고, AI 게이트웨이(여러 공급자를 한 주소로 묶어 주는 중개 서비스) 하나에 맡기면 그 서비스가 멈출 때 같이 멈춥니다. 그래서 OpenRouter 무료 라우터는 프리셋 11개 중 하나로만 두고, 공급자 직접 키와 서버 공유 풀을 함께 둡니다. 어떤 계정이 정말 결제 없는 무료 계정인지는 코드가 알 수 없으므로 주소·모델 허용 목록과 사용자의 확인을 겹쳐 씁니다.",
      "There are two alternatives. Standardizing on one paid model makes cost grow with usage, and handing everything to a single AI gateway (a broker that fronts many providers behind one address) means you stop when it stops. So the OpenRouter free router is only one of 11 presets, next to direct provider keys and a shared server pool. Code cannot tell whether an account truly has billing disabled, so an address-and-model allowlist is layered with the user's own confirmation.",
    ),
    t(
      "정직하게 말하면, 다섯 칸을 한 번에 판정하는 단일 라우터는 코드에 없습니다. 칸마다 담당 파일이 따로 있고 기기 안 처리는 사용자가 패널을 고르는 방식입니다. render.yaml 기준으로 서버 공유 풀은 스위치(STUDIO_AI_FREE_POOL_ENABLED)만 켜져 있고, 공급자별 운영 확인(CONFIRMED)은 Z.AI·OpenRouter가 false, 나머지는 선언이 없으며 키는 대시보드에 직접 넣는 항목입니다. 그래서 '설정 필요'로 표기하며, 운영 대시보드의 실제 값은 이 저장소로 확인할 수 없습니다. 허용 목록은 공급자 정책이 바뀔 수 있어 검토일(2026-09-16)을 남깁니다.",
      "To be honest, no single router in the code judges all five checks at once. Each check has its own file, and on-device work depends on the user choosing that panel. Per render.yaml, the shared server pool has only its switch (STUDIO_AI_FREE_POOL_ENABLED) turned on; per-provider operator confirmation (CONFIRMED) is false for Z.AI and OpenRouter and undeclared for the rest, and keys are entered by hand in the dashboard. So it is marked 'setup required', and the real production values cannot be checked from this repository. Providers can change their policies, so the allowlist records its review date (2026-09-16).",
    ),
  ],
  keyPoints: [
    t("무료로 검토된 주소·모델만 자동 경로에 참여", "Only reviewed free endpoints and models join the automatic route"),
    t("자동 무료 길은 텍스트만, 이미지·3D는 내 키로 명시", "The automatic free route is text-only; images and 3D need your own key"),
    t("유료 키는 설정에서 허락해야 자동 순서에 들어옴", "A paid key joins the automatic order only after you allow it"),
    t("서버 공유 풀은 키·운영 확인 대기: '설정 필요'", "The shared server pool awaits keys and operator sign-off: 'setup required'"),
  ],
  diagram: {
    id: "free-first-ai-routing-diagram",
    kind: "graph",
    title: t("AI 요청이 지나는 관문", "Gates an AI request passes"),
    caption: t(
      "무료로 갈 수 없으면 길이 막힙니다. 유료로 몰래 넘어가지 않고, 결과는 늘 제안으로 돌아옵니다.",
      "If the free path is closed, the request stops. It never slips into paid use, and the result always returns as a proposal.",
    ),
    alt: t(
      "AI 요청은 먼저 기기 안에서 처리할 수 있는지 판단합니다. 아니면 무료 허용 목록과 하루 예산을 차례로 확인하고, 통과하면 무료 공급자를 부릅니다. 허용 목록에 없으면 내 키로 명시 승인했는지 확인하고, 예산이 없으면 멈추며, 어느 길이든 결과는 제안으로 표시됩니다.",
      "An AI request first checks whether it can run on the device. If not, it checks the free allowlist and then the daily budget, and calls a free provider when both pass. When the allowlist rejects it, the app asks whether you approved your own key; with no budget left it stops. Every route ends with the result shown as a proposal.",
    ),
    nodes: [
      { id: "req", label: t("AI 요청", "AI request"), tone: "neutral", shape: "pill", at: [0, 1] },
      { id: "d-local", label: t("기기 안 처리?", "On-device?"), tone: "neutral", shape: "diamond", at: [1, 1] },
      { id: "local", label: t("기기 안 추론", "On-device run"), sub: t("ONNX · MediaPipe", "ONNX · MediaPipe"), tone: "local", at: [1, 0] },
      { id: "d-allow", label: t("무료 허용 목록?", "Free allowlist?"), tone: "neutral", shape: "diamond", at: [2, 1] },
      { id: "d-budget", label: t("예산 남았나?", "Budget left?"), tone: "neutral", shape: "diamond", at: [3, 1] },
      { id: "free", label: t("무료 공급자 호출", "Call a free provider"), sub: t("텍스트 전용", "Text only"), tone: "external", at: [4, 1] },
      { id: "d-paid", label: t("내 키로 승인?", "Your key, approved?"), tone: "warn", shape: "diamond", at: [2, 2] },
      { id: "stop", label: t("멈추고 안내", "Stop and explain"), sub: t("유료 전환 없음", "No silent paid switch"), tone: "neutral", at: [3, 2] },
      { id: "paid", label: t("내 비용 경로", "Your own paid route"), sub: t("내 키 · 내 계정 과금", "Your key, your bill"), tone: "warn", at: [2, 3] },
      { id: "proposal", label: t("제안으로 표시", "Shown as proposal"), tone: "good", shape: "pill", at: [5, 1] },
    ],
    edges: [
      { from: "req", to: "d-local" },
      { from: "d-local", to: "local", label: t("예", "yes") },
      { from: "d-local", to: "d-allow", label: t("아니오", "no") },
      { from: "d-allow", to: "d-budget", label: t("예", "yes") },
      { from: "d-allow", to: "d-paid", label: t("아니오", "no") },
      { from: "d-budget", to: "free", label: t("예", "yes") },
      { from: "d-budget", to: "stop", label: t("아니오", "no") },
      { from: "d-paid", to: "paid", label: t("예", "yes") },
      { from: "d-paid", to: "stop", label: t("아니오", "no") },
      { from: "free", to: "proposal" },
      { from: "local", to: "proposal" },
      { from: "paid", to: "proposal" },
    ],
  },
  usage: [
    {
      feature: t("AI 설정 · 공급자 프리셋과 키 등록", "AI settings · provider presets and keys"),
      role: t(
        "프리셋 11종을 고르고 키를 넣으면, 검토된 무료 주소·모델인지 코드가 먼저 확인합니다. 자동 후보에는 무료 정책이 늘 들어가고 유료 키는 허락해야 들어갑니다.",
        "After you pick one of 11 presets and add a key, code first checks that the address and model are reviewed free ones. Free policies are always automatic candidates; paid keys join only when allowed.",
      ),
      paths: [
        "apps/web/src/shared/ai/free-ai-policy.ts#freeAiConnectionPolicyIssue",
        "apps/web/src/shared/ai/user-ai-store.ts#userAiAutomaticExternalConnectionsForCapability",
      ],
      route: "/settings/ai",
    },
    {
      feature: t("글·대사·번역·콘티 AI · 자동 무료 AI", "Text AI for scripts, dialogue and translation · automatic free AI"),
      role: t(
        "로그인한 사용자는 키 없이 서버 공유 무료 풀을 먼저 씁니다. 공급자 9곳을 기본 순서(Gemini부터)로 시도하고, 풀이 비면 개인 무료 키를 안내합니다.",
        "Signed-in users try the shared server free pool first, with no key. Nine providers are tried in the default order (Gemini first), and an empty pool points to a personal free key.",
      ),
      paths: [
        "apps/api/src/modules/studio-ai/studio-ai-provider.ts#resolveStudioAiProviderOrder",
        "apps/api/src/modules/studio-ai/studio-ai.controller.ts",
        "apps/web/src/shared/ai/free-ai-pool-status.ts",
      ],
      route: "/studio",
    },
    {
      feature: t("Studio AI 어시스트 · 실행 전 안내", "Studio AI assist · pre-run notice"),
      role: t(
        "실행 전에 처리 경로, 외부 전송 여부, 비용 범주, 재시도 정책을 보여 줍니다. 네트워크나 키를 쓰지 않는 순수 함수라 렌더 중에도 안전합니다.",
        "Before a run it shows the route, whether data leaves the device, the cost category and the retry policy. It is a pure function with no network or key access, so it is safe during render.",
      ),
      paths: [
        "apps/web/src/domains/creator/ai/studio-ai-execution-preflight.ts#planStudioAiExecutionPreflight",
        "apps/web/src/shared/ai/ai-capability-registry.ts",
      ],
      route: "/studio",
    },
    {
      feature: t("이미지 도구 · 기기 안에서 끝나는 길", "Image tools · the on-device path"),
      role: t(
        "클라우드를 거치지 않는 길입니다. 사용자가 패널을 고르면 기기 안 모델이 처리하므로 키도 한도도 필요하지 않습니다.",
        "This path never touches a cloud. When the user picks the panel, an on-device model does the work, so no key or quota is needed.",
      ),
      paths: ["apps/web/src/domains/creator/StudioInspectorImageToolsSection.tsx"],
      route: "/studio",
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("무료 정책 판정 함수", "The free-policy gate"),
      language: "ts",
      code: [
        "// 비용 정책: 검토된 공급자의 공식 주소만 '무료'로 인정한다.",
        'type CostPolicy = "unverified" | "provider-free-tier" | "user-funded-byok";',
        "interface Route { baseUrl: string; apiKey: string; costPolicy: CostPolicy }",
        "// 검토된 호스트 → 정확한 OpenAI 호환 경로 (예시 2곳)",
        'const REVIEWED: Record<string, string> = { "api.groq.com": "/openai/v1", "api.mistral.ai": "/v1" };',
        "",
        "export function policyIssue(route: Route): string | null {",
        "  const url = new URL(route.baseUrl);",
        '  if (url.protocol !== "https:" || url.search || url.hash) return "공개 HTTPS 주소만 허용";',
        '  if (route.costPolicy === "unverified") return "비용 정책을 먼저 선언해야 함";',
        '  if (!route.apiKey.trim()) return "본인 API 키가 필요함";',
        '  if (route.costPolicy === "user-funded-byok") return null; // 사용자가 비용을 직접 부담',
        '  const path = url.pathname.replace(/\\/+$/u, "");',
        '  return REVIEWED[url.hostname] === path && !url.port ? null : "검토되지 않은 무료 엔드포인트";',
        "}",
      ].join("\n"),
      codeEn: [
        "// Cost policy: only the official address of a reviewed provider counts as 'free'.",
        'type CostPolicy = "unverified" | "provider-free-tier" | "user-funded-byok";',
        "interface Route { baseUrl: string; apiKey: string; costPolicy: CostPolicy }",
        "// Reviewed host -> exact OpenAI-compatible path (two examples)",
        'const REVIEWED: Record<string, string> = { "api.groq.com": "/openai/v1", "api.mistral.ai": "/v1" };',
        "",
        "export function policyIssue(route: Route): string | null {",
        "  const url = new URL(route.baseUrl);",
        '  if (url.protocol !== "https:" || url.search || url.hash) return "public HTTPS address only";',
        '  if (route.costPolicy === "unverified") return "declare a cost policy first";',
        '  if (!route.apiKey.trim()) return "your own API key is required";',
        '  if (route.costPolicy === "user-funded-byok") return null; // the user pays knowingly',
        '  const path = url.pathname.replace(/\\/+$/u, "");',
        '  return REVIEWED[url.hostname] === path && !url.port ? null : "not a reviewed free endpoint";',
        "}",
      ].join("\n"),
      explain: t(
        "실제 freeAiConnectionPolicyIssue를 줄인 예제입니다. 호스트와 경로가 검토 목록과 정확히 같을 때만 '무료'로 통과하고, 정책을 선언하지 않았거나 키가 없으면 호출 전에 막힙니다. 실제 코드는 모델 허용 목록(Qwen·Z.AI·SiliconFlow)과 텍스트 전용 규칙도 함께 검사합니다.",
        "A trimmed version of the real freeAiConnectionPolicyIssue. A route passes as 'free' only when host and path match the reviewed list exactly, and a missing policy or key blocks it before any call. The real code also checks model allowlists (Qwen, Z.AI, SiliconFlow) and the text-only rule.",
      ),
      source: "apps/web/src/shared/ai/free-ai-policy.ts",
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("자동 후보에 유료 키를 넣는 조건", "When a paid key may join the automatic order"),
      language: "ts",
      code: [
        "// 자동 폴백 후보: 무료 정책은 늘 포함, 유료(BYOK)는 허락했을 때만 포함한다.",
        'type CostPolicy = "provider-free-tier" | "openrouter-free" | "user-funded-byok";',
        "interface Candidate { id: string; costPolicy: CostPolicy }",
        'interface Routing { mode: "automatic" | "priority" | "manual"; allowPaidFallback: boolean }',
        "",
        "export function automaticCandidates(all: Candidate[], routing: Routing): Candidate[] {",
        "  return all.filter((route) => (",
        '    route.costPolicy === "provider-free-tier" ||',
        '    route.costPolicy === "openrouter-free" ||',
        '    (route.costPolicy === "user-funded-byok" &&',
        '      (routing.allowPaidFallback || routing.mode === "manual"))',
        "  ));",
        "}",
      ].join("\n"),
      codeEn: [
        "// Automatic fallback candidates: free policies always join; paid (BYOK) only when allowed.",
        'type CostPolicy = "provider-free-tier" | "openrouter-free" | "user-funded-byok";',
        "interface Candidate { id: string; costPolicy: CostPolicy }",
        'interface Routing { mode: "automatic" | "priority" | "manual"; allowPaidFallback: boolean }',
        "",
        "export function automaticCandidates(all: Candidate[], routing: Routing): Candidate[] {",
        "  return all.filter((route) => (",
        '    route.costPolicy === "provider-free-tier" ||',
        '    route.costPolicy === "openrouter-free" ||',
        '    (route.costPolicy === "user-funded-byok" &&',
        '      (routing.allowPaidFallback || routing.mode === "manual"))',
        "  ));",
        "}",
      ].join("\n"),
      explain: t(
        "userAiAutomaticExternalConnectionsForCapability의 핵심 조건입니다. allowPaidFallback의 기본값은 false라서 유료 키는 설정에서 켜거나 수동으로 한 경로를 고를 때만 후보가 됩니다.",
        "The core condition of userAiAutomaticExternalConnectionsForCapability. allowPaidFallback defaults to false, so a paid key becomes a candidate only when enabled in settings or picked as the one manual route.",
      ),
      source: "apps/web/src/shared/ai/user-ai-store.ts",
      verify: "types",
    },
  ],
  links: [
    {
      title: "OpenAI · Chat Completions API reference",
      url: "https://developers.openai.com/api/reference/resources/chat",
      kind: "docs",
      note: t("여러 공급자가 따르는 'OpenAI 호환' 요청 형식의 기준", "The request shape that many providers follow as 'OpenAI-compatible'"),
    },
    {
      title: "OpenRouter · Free models router",
      url: "https://openrouter.ai/docs/cookbook/get-started/free-models-router-playground",
      kind: "docs",
      note: t("openrouter/free 와 :free 모델의 사용법", "How openrouter/free and :free models work"),
    },
    {
      title: "Google AI · Gemini OpenAI compatibility",
      url: "https://ai.google.dev/gemini-api/docs/openai",
      kind: "docs",
    },
    {
      title: "Groq · OpenAI compatibility",
      url: "https://console.groq.com/docs/openai",
      kind: "docs",
    },
    {
      title: "MDN · 429 Too Many Requests",
      url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/429",
      kind: "docs",
      note: t("한도 소진 응답이 무엇을 뜻하는지", "What a quota-exhausted response means"),
    },
  ],
  chapterIds: ["free-ai-routing", "ai-routing", "cost-engineering"],
  talk: {
    pitch: t(
      "ToonStudio의 AI는 '공짜'가 아니라 '돈이 드는 지점을 숨기지 않는' 구조입니다. 무료로 확인된 주소와 모델만 자동 길에 올리고, 호출 직전에 하루 예산을 예약하며, 유료 키는 사용자가 설정에서 허락해야 순서에 들어옵니다. 결과는 늘 제안으로 보여 작가가 받아들이거나 버립니다. 다만 서버 공유 무료 풀의 운영 키는 아직 '설정 필요' 상태입니다.",
      "ToonStudio's AI is not 'free'; it is built so cost boundaries stay visible. Only addresses and models verified as free join the automatic route, the daily budget is reserved right before each call, and a paid key enters the order only when the user allows it in settings. Results always arrive as proposals the artist accepts or discards. One honest caveat: the operator keys for the shared free pool are still in a 'setup required' state.",
    ),
    analogy: t(
      "대형마트의 시식 코너입니다. 줄을 서면 공짜로 맛볼 수 있지만, 계산대로 데려가는 건 손님이 직접 손을 들었을 때뿐입니다.",
      "A supermarket sample corner: tasting is free if you queue, but you only get walked to the checkout when you raise your hand.",
    ),
    questions: [
      {
        question: t("무료 한도가 끝나면 자동으로 유료로 넘어가나요?", "Does it switch to a paid model automatically when the free limit ends?"),
        answer: t(
          "아니요. 한도 소진(402·429)이면 다음 무료 경로로만 넘어가고, 모두 소진되면 안내와 함께 멈추며 로컬 실행으로도 몰래 바꾸지 않습니다. 유료 키는 allowPaidFallback을 켜거나 수동 모드로 고를 때만 후보가 됩니다.",
          "No. When a limit is hit (402 or 429) it only moves to the next free route; when all are exhausted it stops with a message and does not quietly switch to local execution either. A paid key becomes a candidate only if the user enables allowPaidFallback or picks it in manual mode.",
        ),
      },
      {
        question: t("공급자가 무료 모델을 유료로 바꾸면요?", "What if a provider turns a free model into a paid one?"),
        answer: t(
          "허용 목록은 정확한 주소·경로·모델만 통과시키고 검토일을 남깁니다. 공급자가 결제를 요구(402)하면 그 연결은 사용자가 직접 초기화할 때까지 잠깁니다. 다만 목록 갱신은 사람이 다시 검토해야 하는 유지 비용입니다.",
          "The allowlist passes only exact address, path and model, and records a review date. If a provider asks for payment (402), that connection stays locked until the user resets it. Keeping the list current is a maintenance cost that a person has to review.",
        ),
      },
      {
        question: t("이 다섯 관문을 한 곳에서 자동으로 판정하나요?", "Does one place judge all five gates automatically?"),
        answer: t(
          "아니요. 기기 안 처리는 사용자가 패널을 고르는 방식이고, 허용 목록·예산·승인은 각 클라우드 경로에 나뉘어 있습니다. 도식은 이 규칙들을 한눈에 보이게 줄인 개념도입니다.",
          "No. On-device work depends on the user picking a panel, and the allowlist, budget and approval live in each cloud path. The diagram is a conceptual map that puts those rules in one view.",
        ),
      },
    ],
    pitfall: t(
      "'무료 우선 = 공짜'로 말하지 마세요. 서버 공유 풀은 '설정 필요' 상태이고, 계정이 결제 없는 무료 계정인지는 코드가 아닌 사용자 확인 사항입니다. 모델 이름은 공급자가 바꿀 수 있어 슬라이드에 고정해 쓰지 않습니다.",
      "Do not say 'free-first means free'. The shared pool is in a 'setup required' state, and whether an account really has billing disabled is the user's confirmation, not something code can see. Model names can change, so do not pin them on slides.",
    ),
  },
  technologies: ["OpenAI-compatible API", "OpenRouter", "BYOK", "Quota ledger"],
  facts: [
    {
      value: "11",
      label: t("공급자 프리셋 수", "Provider presets"),
      source: "apps/web/src/shared/ai/free-ai-policy.ts",
    },
    {
      value: "9",
      label: t("서버 공유 풀의 공급자 수", "Providers in the shared server pool"),
      source: "apps/api/src/modules/studio-ai/studio-ai-provider.ts",
    },
    {
      value: "2026-09-16",
      label: t("무료 허용 주소 검토일(코드 주석)", "Free-endpoint allowlist review date (code comment)"),
      source: "apps/web/src/shared/ai/free-ai-policy.ts",
    },
  ],
  reviewedAt: "2026-10-07",
};

const AMBIGUOUS_FAILURE_NO_RETRY: EngineeringAtlasEntry = {
  id: "ambiguous-failure-no-retry",
  category: "ai",
  name: "Ambiguous-failure rule",
  title: t("애매한 실패는 다시 보내지 않는다", "Never resend an ambiguous failure"),
  status: "live",
  tagline: t(
    "시간 초과·5xx는 다른 길로 다시 보내지 않고, 확정 거절만 다음 무료 길로 넘깁니다.",
    "Timeouts and 5xx are never resent; only definite rejections move to the next free route.",
  ),
  background: [
    t(
      "택배를 맡겼는데 '배송 완료'도 '반송'도 알림이 없다고 해 보세요. 불안해서 같은 물건을 한 번 더 보내면 두 개가 도착할 수 있습니다. AI 호출도 같습니다. 응답이 늦거나 서버 오류(5xx)로 끊기면 공급자가 이미 일을 시작했는지 알 수 없습니다. 이때 다른 공급자에 다시 보내면 같은 일을 두 번 시키고 요금이 두 번 나갈 수 있어, ToonStudio는 이런 '애매한 실패'를 자동으로 다시 보내지 않습니다.",
      "Imagine you hand over a parcel and get neither a 'delivered' nor a 'returned' notice. Sending the same item again out of worry can land two copies. AI calls work the same way. When a response is late or breaks with a server error (5xx), you cannot know whether the provider already started. Resending to another provider could do the same job twice and bill twice, so ToonStudio never automatically resends such an 'ambiguous failure'.",
    ),
    t(
      "다음 길로 넘어가는 것은 '추론이 시작되기 전에 확실히 거절당했다'고 말할 수 있을 때뿐입니다. 서버 공유 풀은 무료 공급자의 402·429, Cloudflare의 403/5035, Qwen의 403/AllocationQuota.FreeTierOnly만 넘기고, 401·403 인증 실패는 운영 키 문제이므로 넘기지 않으며, 5xx와 그 밖의 오류도 멈춥니다. 브라우저의 내 키 체인은 401·403을 '그 키가 잘못됐다'는 뜻으로 보고 내 다음 키로 넘어가지만, 5xx·시간 초과·네트워크 오류는 똑같이 즉시 멈춥니다.",
      "A request moves on only when you can say it was definitely rejected before inference began. The shared server pool forwards just a free provider's 402 and 429, Cloudflare's 403/5035 and Qwen's 403/AllocationQuota.FreeTierOnly. A 401 or 403 authentication failure is an operator-key problem, so it is not forwarded, and 5xx and other errors stop too. The browser's personal-key chain reads 401 and 403 as 'that key is bad' and tries your next key, but 5xx, timeouts and network errors stop immediately there as well.",
    ),
    t(
      "이 규칙은 분산 시스템의 '최대 한 번(at-most-once)' 처리와 같은 생각입니다. 실패하면 무조건 되풀이하는 '최소 한 번' 방식은 조회처럼 되풀이해도 안전한 일에는 좋지만 요금이 드는 호출에는 위험합니다. 서버는 여기에 멱등키(같은 요청이면 한 번만 처리하라는 표식)와 영수증을 더해, 공급자 호출 직전에 영수증을 '보냄'으로 먼저 기록하고 성공이나 확정 거절이 아니면 '모호'로 남겨 같은 키의 재처리를 막습니다. 3D 생성도 과금되는 제출은 한 번만 보내고 상태 조회만 재시도합니다.",
      "The rule follows the distributed-systems idea of at-most-once processing. The at-least-once habit of retrying every failure suits safe, repeatable work such as reads, but is risky for billed calls. The server adds an idempotency key (a marker meaning 'process the same request only once') and a receipt: right before calling a provider it records the receipt as 'sent', and unless the outcome is success or a definite rejection it stays 'ambiguous', blocking reprocessing under the same key. 3D generation likewise submits the billed job once and retries only status queries.",
    ),
    t(
      "대가도 있습니다. 사용자가 직접 다시 시도해야 해서 체감 성공률은 낮아질 수 있습니다. 그래서 오류 문구가 '자동으로 다시 보내지 않았다'는 사실과 설정 화면 안내를 함께 줍니다. 또 이 규칙은 공급자가 알려 준 코드에 기대므로, 공급자가 코드를 바꾸면 확정 거절도 모호한 실패처럼 멈추는 안전한 쪽으로 실패합니다.",
      "There is a cost: users must retry by hand, so perceived success can drop. That is why the error text says nothing was resent automatically and points to the settings page. The rule also leans on codes the provider reports, so if a provider changes its codes, a definite rejection is treated like an ambiguous failure and stops, failing on the safe side.",
    ),
  ],
  keyPoints: [
    t("추론 시작 전의 확정 거절만 다음 무료 길로 넘깁니다", "Only definite pre-inference rejections move to the next free route"),
    t("시간 초과·5xx·네트워크 오류는 그 자리에서 멈춥니다", "Timeouts, 5xx and network errors stop on the spot"),
    t("서버 풀은 401/403을 넘기지 않고, 내 키 체인만 다음 키로", "The server pool never forwards 401/403; only your own key chain tries the next key"),
    t("서버는 영수증을 '보냄'으로 먼저 남겨 재처리를 막음", "The server records a 'sent' receipt first to block reprocessing"),
  ],
  diagram: {
    id: "ambiguous-failure-no-retry-diagram",
    kind: "graph",
    title: t("응답 코드에 따른 갈림길", "A fork for every response"),
    caption: t(
      "다음 길로 넘기는 것은 '추론 시작 전의 확정 거절'뿐이고, 나머지는 그 자리에서 멈춥니다.",
      "Only a definite rejection before inference moves on; everything else stops where it is.",
    ),
    alt: t(
      "공급자에 요청을 보내 성공하면 결과가 제안으로 쓰입니다. 실패하면 먼저 402·429 같은 확정 거절인지 보고, 맞으면 다음 무료 경로로 같은 요청을 보냅니다. 401·403 인증 실패는 서버 풀에서는 멈추고 내 키 체인에서는 다음 키를 씁니다. 시간 초과, 5xx, 네트워크 오류는 다시 보내지 않고 멈춥니다.",
      "A request goes to the provider and, on success, the result is used as a proposal. On failure the app first checks for a definite rejection such as 402 or 429 and, if so, sends the same request on the next free route. A 401 or 403 stops on the server pool but moves to the next key in your own key chain. Timeouts, 5xx and network errors are not resent and simply stop.",
    ),
    nodes: [
      { id: "send", label: t("요청 전송", "Send request"), sub: t("무료 풀 또는 내 키", "Pool or your key"), tone: "external", shape: "pill", at: [0, 1] },
      { id: "d-ok", label: t("성공?", "Success?"), sub: t("2xx", "2xx"), tone: "neutral", shape: "diamond", at: [1, 1] },
      { id: "ok", label: t("제안으로 사용", "Used as proposal"), tone: "good", shape: "pill", at: [1, 0] },
      { id: "d-quota", label: t("확정 거절?", "Clear refusal?"), sub: t("402·429 등", "402 · 429"), tone: "neutral", shape: "diamond", at: [2, 1] },
      { id: "next", label: t("다음 무료 경로", "Next free route"), sub: t("추론 시작 전 거절만", "Pre-inference only"), tone: "external", at: [2, 2] },
      { id: "d-auth", label: t("인증 실패?", "Auth failed?"), sub: t("401·403", "401 · 403"), tone: "neutral", shape: "diamond", at: [3, 1] },
      { id: "auth", label: t("키 문제로 판단", "Key problem"), sub: t("풀 멈춤·내 키는 다음 키", "Pool stops · own key tries next"), tone: "warn", at: [3, 2] },
      { id: "stop", label: t("멈춤 · 재전송 없음", "Stop, no resend"), sub: t("시간 초과·5xx·연결 끊김", "Timeout · 5xx · network error"), tone: "warn", at: [4, 1] },
    ],
    edges: [
      { from: "send", to: "d-ok" },
      { from: "d-ok", to: "ok", label: t("예", "yes") },
      { from: "d-ok", to: "d-quota", label: t("아니오", "no") },
      { from: "d-quota", to: "next", label: t("예", "yes") },
      { from: "d-quota", to: "d-auth", label: t("아니오", "no") },
      { from: "d-auth", to: "auth", label: t("예", "yes") },
      { from: "d-auth", to: "stop", label: t("아니오", "no") },
      { from: "next", to: "send", label: t("다시 요청", "ask again"), style: "dashed" },
    ],
  },
  usage: [
    {
      feature: t("서버 자동 무료 AI", "Server-side automatic free AI"),
      role: t(
        "공급자 응답을 분류해 확정 거절일 때만 다음 무료 공급자로 넘깁니다. 호출 직전에 영수증을 '보냄'으로 먼저 기록하고, 성공이 아니면 모호한 상태로 남깁니다.",
        "Provider responses are classified, and only a definite rejection moves to the next free provider. The receipt is written as 'sent' right before the call and stays ambiguous unless the call succeeds.",
      ),
      paths: [
        "apps/api/src/modules/studio-ai/studio-ai-provider.ts#classifyStudioAiProviderFailure",
        "apps/api/src/modules/studio-ai/studio-ai.service.ts",
        "apps/api/src/modules/studio-ai/studio-ai-provider.test.ts",
      ],
      route: "/studio",
    },
    {
      feature: t("내 클라우드 AI 키 · 키·모델 체인", "Your cloud AI keys · key and model chain"),
      role: t(
        "개인 키 체인은 402·429와 401·403만 내 다음 키·모델로 넘기고, 5xx·시간 초과·네트워크 오류는 즉시 알립니다. 테스트가 5xx에서 요청이 한 번뿐임을 확인합니다.",
        "The personal chain moves to your next key or model only on 402, 429, 401 and 403, and reports 5xx, timeouts and network errors at once. A test confirms that a 5xx produces exactly one request.",
      ),
      paths: [
        "apps/web/src/shared/ai/user-ai-transport.ts#completeUserAiTextDetailed",
        "apps/web/src/shared/ai/user-ai-transport.test.ts",
      ],
      route: "/settings/ai",
    },
    {
      feature: t("AI 음악 생성", "AI music generation"),
      role: t(
        "접수된 뒤의 시간 초과·5xx·네트워크 오류는 자동 재시도하지 않습니다. 영수증이 남아 같은 요청 ID는 다시 과금되지 않습니다.",
        "After a request is accepted, timeouts, 5xx and network errors are not retried. The receipt remains, so the same request ID is never billed again.",
      ),
      paths: ["apps/api/src/server/studio-music-core.ts#composeMusic"],
      route: "/studio/assets/audio",
    },
    {
      feature: t("AI 3D 생성", "AI 3D generation"),
      role: t(
        "과금되는 제출은 한 번만 보내고, 이미 있는 작업의 상태·다운로드 조회만 재시도합니다.",
        "The billed submission is sent once; only status and download queries for an existing job are retried.",
      ),
      paths: ["apps/api/src/modules/studio-ai/studio-hyper3d-rodin-provider.ts"],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("서버 공유 풀의 실패 분류", "Failure classification for the shared pool"),
      language: "ts",
      code: [
        "// 응답을 '다음 무료 길로 넘겨도 되는가'로 분류한다(서버 공유 풀 기준, 단순화).",
        'type Kind = "free_quota_exhausted" | "authentication" | "provider_unavailable" | "request_rejected";',
        "interface Verdict { kind: Kind; failOver: boolean }",
        "",
        "export function classify(status: number, businessCode?: string, provider?: string): Verdict {",
        '  const cloudflarePaidOnly = provider === "cloudflare" && status === 403 && businessCode === "5035";',
        '  const qwenFreeOnly = provider === "qwen" && status === 403 && businessCode === "AllocationQuota.FreeTierOnly";',
        "  if (status === 402 || status === 429 || cloudflarePaidOnly || qwenFreeOnly) {",
        '    return { kind: "free_quota_exhausted", failOver: true }; // 추론 시작 전 확정 거절',
        "  }",
        '  if (status === 401 || status === 403) return { kind: "authentication", failOver: false };',
        '  if (status >= 500) return { kind: "provider_unavailable", failOver: false };',
        '  return { kind: "request_rejected", failOver: false };',
        "}",
      ].join("\n"),
      codeEn: [
        "// Classify a response as 'safe to move to the next free route?' (shared pool, simplified).",
        'type Kind = "free_quota_exhausted" | "authentication" | "provider_unavailable" | "request_rejected";',
        "interface Verdict { kind: Kind; failOver: boolean }",
        "",
        "export function classify(status: number, businessCode?: string, provider?: string): Verdict {",
        '  const cloudflarePaidOnly = provider === "cloudflare" && status === 403 && businessCode === "5035";',
        '  const qwenFreeOnly = provider === "qwen" && status === 403 && businessCode === "AllocationQuota.FreeTierOnly";',
        "  if (status === 402 || status === 429 || cloudflarePaidOnly || qwenFreeOnly) {",
        '    return { kind: "free_quota_exhausted", failOver: true }; // definite rejection before inference',
        "  }",
        '  if (status === 401 || status === 403) return { kind: "authentication", failOver: false };',
        '  if (status >= 500) return { kind: "provider_unavailable", failOver: false };',
        '  return { kind: "request_rejected", failOver: false };',
        "}",
      ].join("\n"),
      explain: t(
        "classifyStudioAiProviderFailure를 줄인 예제입니다. failOver가 true인 경우는 402·429와 공급자별 확정 코드뿐이며, 401·403과 5xx는 넘기지 않습니다. 실제 코드에는 예전 유료 공급자 테스트 경로를 위한 분기도 있습니다.",
        "A trimmed classifyStudioAiProviderFailure. failOver is true only for 402, 429 and provider-specific definite codes; 401, 403 and 5xx never move on. The real code also keeps a branch for the old paid-provider test path.",
      ),
      source: "apps/api/src/modules/studio-ai/studio-ai-provider.ts",
      verify: "types",
    },
    {
      kind: "teaching",
      title: t("체인 호출: 모호하면 멈춘다", "A call chain that stops when unsure"),
      language: "ts",
      code: [
        "// 시간 초과·네트워크 오류는 '모호'하므로 다른 경로로 다시 보내지 않는다.",
        "const safeToFailOver = (status: number): boolean => status === 402 || status === 429;",
        "",
        "export async function callChain(routes: Array<() => Promise<Response>>): Promise<Response> {",
        "  let last = 0;",
        "  for (const send of routes) {",
        "    const res = await send().catch(() => null); // 타임아웃·네트워크 오류 → null",
        '    if (!res) throw new Error("모호한 실패: 다른 경로로 재전송하지 않음");',
        "    if (res.ok || !safeToFailOver(res.status)) return res; // 5xx 등은 그대로 돌려준다",
        "    last = res.status; // 확정 거절이면 다음 경로로",
        "  }",
        "  throw new Error(`모든 무료 경로 소진 (${last})`);",
        "}",
      ].join("\n"),
      codeEn: [
        "// A timeout or network error is ambiguous, so it is never resent on another route.",
        "const safeToFailOver = (status: number): boolean => status === 402 || status === 429;",
        "",
        "export async function callChain(routes: Array<() => Promise<Response>>): Promise<Response> {",
        "  let last = 0;",
        "  for (const send of routes) {",
        "    const res = await send().catch(() => null); // timeout or network error -> null",
        '    if (!res) throw new Error("ambiguous failure: not resent on another route");',
        "    if (res.ok || !safeToFailOver(res.status)) return res; // 5xx and the like are returned as is",
        "    last = res.status; // a definite rejection moves on",
        "  }",
        "  throw new Error(`all free routes exhausted (${last})`);",
        "}",
      ].join("\n"),
      explain: t(
        "개념만 남긴 교육용 예제입니다. 응답이 아예 없으면(null) 던지고, 402·429일 때만 다음 경로로 갑니다. 실제 브라우저 체인은 여기에 401·403(내 다음 키)이 더해집니다.",
        "A teaching sketch. No response at all (null) throws, and only 402 or 429 moves to the next route. The real browser chain adds 401 and 403, which move to your next key.",
      ),
      verify: "types",
    },
  ],
  links: [
    {
      title: "RFC 9110 · HTTP Semantics",
      url: "https://www.rfc-editor.org/rfc/rfc9110",
      kind: "spec",
      note: t("상태 코드와 메서드 멱등성의 기준 문서", "The reference for status codes and method idempotency"),
    },
    {
      title: "IETF · The Idempotency-Key HTTP Header Field (draft)",
      url: "https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/",
      kind: "spec",
      note: t("아직 초안입니다", "Still an Internet-Draft"),
    },
    {
      title: "Stripe · Idempotent requests",
      url: "https://docs.stripe.com/api/idempotent_requests",
      kind: "guide",
      note: t("결제 API가 같은 요청을 한 번만 처리하는 방법", "How a payments API processes the same request once"),
    },
    {
      title: "MDN · AbortSignal.timeout()",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static",
      kind: "docs",
    },
    {
      title: "MDN · 429 Too Many Requests",
      url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/429",
      kind: "docs",
    },
  ],
  chapterIds: ["free-ai-routing", "troubleshooting-evidence", "ai-routing"],
  talk: {
    pitch: t(
      "AI 호출이 시간 초과로 끊기면 공급자가 이미 일을 시작했는지 알 수 없습니다. 그래서 다른 공급자에게 다시 보내지 않고 멈춥니다. 다음 무료 길로 넘기는 것은 402·429처럼 시작 전에 확실히 거절당한 경우뿐입니다. 서버는 영수증으로 같은 요청의 재처리도 막습니다. 덕분에 같은 일을 두 번 시켜 요금이 두 번 나가는 사고를 줄입니다.",
      "If an AI call dies on a timeout, we cannot know whether the provider already started the work, so we stop instead of resending to another provider. We only move to the next free route when the request was clearly rejected before it began, such as 402 or 429. The server also uses receipts to block reprocessing of the same request. That reduces the accident of paying twice for the same job.",
    ),
    analogy: t(
      "택배 상태가 '알 수 없음'일 때 같은 물건을 또 보내지 않고 먼저 확인하는 것과 같습니다.",
      "It is like checking first, instead of shipping the same parcel again, when the tracking page says 'unknown'.",
    ),
    questions: [
      {
        question: t("그럼 실패하면 사용자는 끝인가요?", "So when it fails, is the user stuck?"),
        answer: t(
          "자동으로는 끝나고 사용자가 직접 다시 시도할 수 있습니다. 오류 문구가 자동 재전송이 없었다는 점과 설정 화면(/settings/ai) 안내를 함께 줍니다.",
          "Automatically yes, but the user can retry by hand. The error text says nothing was resent and points to the settings page (/settings/ai).",
        ),
      },
      {
        question: t("401·403도 다음 공급자로 넘기나요?", "Are 401 and 403 forwarded to the next provider too?"),
        answer: t(
          "서버 공유 풀은 넘기지 않습니다. 운영 키 문제이므로 멈춥니다. 브라우저의 내 키 체인만 내 다음 키로 넘어갑니다. 두 경로의 규칙이 다릅니다.",
          "The shared server pool does not; it stops because that is an operator-key problem. Only the browser's personal-key chain moves to your next key. The two paths follow different rules.",
        ),
      },
      {
        question: t("모든 4xx를 안 넘기는 건가요?", "Are all 4xx responses left unforwarded?"),
        answer: t(
          "아니요. 402·429(그리고 Qwen·Cloudflare의 확정 코드)는 다음 무료 경로로 넘깁니다. 그 밖의 4xx는 요청 거절로 보고 멈춥니다.",
          "No. 402 and 429 (plus the definite codes from Qwen and Cloudflare) do move to the next free route. Other 4xx responses are treated as a rejected request and stop.",
        ),
      },
    ],
    pitfall: t(
      "'실패는 전부 재시도하지 않는다'고 말하면 틀립니다. 정확히는 '과금되는 제출·추론은 다시 보내지 않는다'이고, 3D 상태·다운로드 같은 멱등 조회는 재시도합니다. 서버 풀과 내 키 체인의 401·403 처리가 다르다는 점도 함께 말하세요.",
      "Saying 'we never retry failures' is wrong. The accurate version is that billed submissions and inference are not resent, while idempotent queries such as 3D status and download are retried. Also mention that 401 and 403 are handled differently for the server pool and the personal-key chain.",
    ),
  },
  technologies: ["HTTP 402/429", "AbortController", "Idempotency-Key", "Receipt ledger"],
  facts: [
    {
      value: "45,000 ms",
      label: t("서버 AI 호출 기본 제한 시간(5,000~120,000 허용)", "Default server AI timeout (5,000 to 120,000 allowed)"),
      source: "apps/api/src/modules/studio-ai/studio-ai-provider.ts",
    },
    {
      value: "180,000 ms",
      label: t("브라우저 개인 키 호출 제한 시간", "Browser personal-key call timeout"),
      source: "apps/web/src/shared/ai/user-ai-transport.ts",
    },
    {
      value: "30 min",
      label: t("서버 요청 영수증 보존 시간", "Server request receipt retention"),
      source: "apps/api/src/modules/studio-ai/studio-ai-idempotency.ts",
    },
  ],
  reviewedAt: "2026-10-07",
};

const QUOTA_LEDGER_BUDGET: EngineeringAtlasEntry = {
  id: "quota-ledger-budget",
  category: "ai",
  name: "Quota ledger",
  title: t("호출 전에 먼저 예약하는 예산 원장", "A budget ledger that reserves before the call"),
  status: "live",
  tagline: t(
    "요금이 나가기 전에 하루 한도를 먼저 '예약'하고, 한도에 닿으면 호출 자체를 하지 않습니다.",
    "The daily allowance is reserved before any money moves, and at the limit the call is simply not made.",
  ),
  background: [
    t(
      "휴대폰 요금제의 '데이터 한도'를 떠올려 보세요. 한도를 다 쓴 뒤에 알려 주면 이미 요금이 나간 뒤입니다. 그래서 AI 예산 원장은 호출 '전에' 최악의 사용량을 먼저 잡아 두는 '예약' 방식을 씁니다. 호텔 방을 도착 전에 예약해 두면 만실일 때 헛걸음하지 않는 것처럼, 한도가 차 있으면 AI 공급자에게 요청 자체를 보내지 않습니다.",
      "Think of a phone plan's data cap. If you are told after the cap is gone, the money has already moved. So the AI budget ledger uses a 'reserve' step that books the worst-case usage before the call. Like booking a hotel room before arriving, so you never travel to a full house, a full ledger means the request is never sent to the AI provider.",
    ),
    t(
      "원장은 여러 곳에 있고 모두 같은 흐름(예약, 호출, 정산)입니다. 브라우저: 내 무료 키로 부를 때 하루 25회·예약 토큰 64,000·출력 1,024토큰 상한을 localStorage에 횟수만 적습니다(프롬프트·응답·키는 저장하지 않음). 서버: 로그인 사용자가 공유 무료 풀을 쓸 때 PostgreSQL 한 문장(조건부 UPSERT)으로 한도 확인과 증가를 동시에 합니다. 음악: Redis Lua 한 번으로 영수증과 사용자·전체 일일 '초' 예산을 원자적으로 처리합니다. 월 단위는 3D 생성 작업 원장(크레딧)에 있습니다.",
      "There are several ledgers and they all follow reserve, call, settle. In the browser, calls with your free key log only counts, against 25 requests a day, 64,000 reserved tokens and 1,024 output tokens, in localStorage (never prompts, answers or keys). On the server, signed-in users of the shared free pool get the check and the increment in one PostgreSQL statement (a conditional upsert). For music, one Redis Lua call atomically handles the receipt and the per-user and global daily 'seconds' budgets. The monthly budget lives in the 3D job ledger, counted in credits.",
    ),
    t(
      "예약을 쓰는 이유는 동시 요청입니다. 응답을 받은 뒤에 세면, 같은 순간 보낸 요청들이 모두 '아직 여유 있음'을 보고 한도를 함께 넘길 수 있습니다. 그래서 최악값(입력 바이트 기준 보수적 추정과 출력 상한)을 먼저 더하고, 서버는 응답 뒤 실제 사용량으로 정산합니다. 사용량이 오지 않으면 예약량 전체를 쓴 것으로 칩니다. 브라우저는 Web Locks(탭끼리 번갈아 쓰게 하는 잠금)로 탭 사이의 경쟁을 막고, 서버는 전체 행을 먼저 잠그는 고정 순서와 한 문장 쿼리로 막습니다.",
      "Reservation exists because of concurrent requests. Counting after the response lets requests sent at the same moment all see 'still room' and overshoot together. So the worst case (a conservative estimate from input bytes plus the output cap) is added first, and the server settles with real usage after the response. If usage never arrives, the whole reservation counts as spent. The browser uses Web Locks (a lock that makes tabs take turns) to avoid tab races, and the server uses a fixed lock order, global row first, plus a one-statement query.",
    ),
    t(
      "한계도 분명합니다. 브라우저 원장은 사용자가 브라우저 데이터를 지우면 초기화되므로 '비용 보호'가 아니라 '사고 방지' 장치이고, 최종 방어선은 공급자 쪽 한도와 결제 없는 계정입니다. 하루의 경계는 UTC 자정(한국 시간 오전 9시)입니다. 한도 값이 낮은 것은 의도된 보수 설정이라 트래픽이 늘면 곧 막힙니다.",
      "The limits are clear too. Clearing browser data resets the browser ledger, so it is an accident-prevention device, not cost protection; the last line of defense is the provider's own limit and an account without billing. The day boundary is UTC midnight (09:00 in Korea). The low values are a deliberately conservative setting and will bind quickly as traffic grows.",
    ),
  ],
  keyPoints: [
    t("호출 전에 최악값을 예약하고, 한도면 호출하지 않습니다", "Reserve the worst case first; at the limit, do not call"),
    t("브라우저: 하루 25회·예약 64,000토큰·출력 1,024", "Browser: 25 calls a day, 64,000 reserved tokens, 1,024 output"),
    t("서버: 사용자당 하루 200회·1,000,000토큰(코드 기본값)", "Server: 200 calls and 1,000,000 tokens a day per user (code default)"),
    t("한도가 끝나도 유료로 넘기지 않습니다", "Hitting the limit never rolls into paid use"),
  ],
  diagram: {
    id: "quota-ledger-budget-diagram",
    kind: "layers",
    title: t("여러 겹의 예산 원장", "Layers of budget ledgers"),
    caption: t(
      "원장은 달라도 규칙은 같습니다. 호출 전에 확인하고, 한도에 닿으면 공급자를 부르지 않습니다.",
      "The ledgers differ but the rule is the same: check before the call, and never call the provider at the limit.",
    ),
    alt: t(
      "브라우저, 서버, 음악, 3D 작업의 네 원장이 위에서 아래로 쌓여 있습니다. 브라우저는 하루 25회, 서버는 사용자당 하루 200회, 음악은 하루 180초, 3D는 하루 20·월 200 크레딧이 코드 기본값입니다. 모두 공급자를 부르기 전에 확인합니다.",
      "Four ledgers are stacked: browser, server, music and 3D jobs. The code defaults are 25 calls a day in the browser, 200 per user a day on the server, 180 seconds a day for music, and 20 per day and 200 per month in credits for 3D. All of them check before calling a provider.",
    ),
    layers: [
      {
        id: "browser",
        label: t("브라우저 원장", "Browser ledger"),
        sub: t("내 무료 키 호출 · localStorage에 횟수만 기록", "Your free-key calls · only counts in localStorage"),
        tone: "local",
        chips: ["25 / day", "64,000 tokens", "1,024 out", "Web Locks"],
      },
      {
        id: "server",
        label: t("서버 원장", "Server ledger"),
        sub: t("로그인 사용자 공유 풀 · PostgreSQL 예약", "Shared pool for signed-in users · one-statement reservation"),
        tone: "server",
        chips: ["200 / day / user", "1,000,000 tokens", "500 / day total", "UTC day"],
      },
      {
        id: "music",
        label: t("음악 원장", "Music ledger"),
        sub: t("Redis Lua 한 번에 '초' 예산 확인 · 기본 꺼짐", "Seconds budget in one Redis Lua call · off in production by default"),
        tone: "server",
        chips: ["180 s / day / user", "1,200 s total", "Lua", "Upstash"],
      },
      {
        id: "three-d",
        label: t("3D 작업 원장", "3D job ledger"),
        sub: t("내 키 3D 생성 · 일·월 크레딧·동시 작업 제한", "3D with your key · daily and monthly credits, job concurrency"),
        tone: "server",
        chips: ["20 / day", "200 / month", "2 concurrent"],
      },
    ],
    brackets: [
      {
        label: t("모두 호출 전에 확인", "All checked before the call"),
        layerIds: ["browser", "server", "music", "three-d"],
      },
    ],
  },
  usage: [
    {
      feature: t("AI 설정 · 오늘 남은 안전 한도", "AI settings · remaining safety allowance today"),
      role: t(
        "내 무료 키로 호출하기 직전에 요청 횟수와 예약 토큰을 먼저 더하고, 남은 횟수와 중지 상태를 설정 화면에 보여 줍니다.",
        "Right before a call with your free key, request count and reserved tokens are added first, and the settings screen shows the remaining count and any pause state.",
      ),
      paths: [
        "apps/web/src/shared/ai/free-ai-runtime-budget.ts#guardFreeAiRuntimeRequest",
        "apps/web/src/shared/ai/user-ai-transport.ts",
        "apps/web/src/shared/ai/UnifiedAiAdvancedSettings.tsx",
      ],
      route: "/settings/ai",
    },
    {
      feature: t("서버 자동 무료 AI 호출", "Server-side automatic free AI calls"),
      role: t(
        "로그인 사용자의 하루 요청·토큰을 PostgreSQL에서 먼저 예약하고, 응답 뒤 실제 사용량으로 정산합니다. 정산 값이 없으면 예약량을 그대로 씁니다.",
        "A signed-in user's daily requests and tokens are reserved in PostgreSQL first and settled with real usage afterward. Without a usage figure the reservation stands as is.",
      ),
      paths: [
        "apps/api/src/modules/studio-ai/studio-ai-usage.ts",
        "apps/api/src/modules/studio-ai/studio-ai-usage.repository.ts",
      ],
      route: "/studio",
    },
    {
      feature: t("AI 음악 생성 (운영 기본 꺼짐)", "AI music generation (off in production by default)"),
      role: t(
        "Redis Lua 한 번으로 중복 영수증과 사용자·전체 일일 '초' 예산을 확인한 뒤에만 공급자를 부릅니다.",
        "A single Redis Lua call checks the duplicate receipt and the per-user and global daily 'seconds' budgets before the provider is called.",
      ),
      paths: ["apps/api/src/server/studio-music-core.ts#MUSIC_ADMISSION_LUA"],
      route: "/studio/assets/audio",
    },
    {
      feature: t("AI 3D 생성 작업", "AI 3D generation jobs"),
      role: t(
        "일 20·월 200 크레딧(기본값)과 동시 작업 수를 작업 원장에서 확인하고, 월 예산을 넘기면 작업을 만들지 않습니다.",
        "The job ledger checks 20 daily and 200 monthly credits (defaults) and the concurrent job count, and creates no job once the monthly budget would be exceeded.",
      ),
      paths: [
        "apps/api/src/modules/studio-ai/studio-3d-generation.service.ts",
        "apps/api/src/modules/studio-ai/studio-3d-generation-job-ledger.ts",
      ],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("브라우저 원장의 예약", "Reservation in the browser ledger"),
      language: "ts",
      code: [
        "// 예약: 호출 '전에' 최악의 사용량을 하루 원장에 더한다(브라우저 원장 단순화).",
        "interface Ledger { day: string; requests: number; reservedTokens: number }",
        "const MAX_REQUESTS = 25;",
        "const MAX_TOKENS = 64_000;",
        "",
        "export function reserve(ledger: Ledger, now: Date, body: object, maxOut = 1_024): Ledger {",
        "  const day = now.toISOString().slice(0, 10); // 하루의 경계는 UTC",
        "  const base: Ledger = ledger.day === day ? ledger : { day, requests: 0, reservedTokens: 0 };",
        "  const bytes = new TextEncoder().encode(JSON.stringify(body)).byteLength;",
        "  const reserved = Math.ceil(bytes / 2) + maxOut; // 보수적 추정: 입력 바이트/2 + 출력 상한",
        '  if (base.requests + 1 > MAX_REQUESTS) throw new Error("일일 요청 한도");',
        '  if (base.reservedTokens + reserved > MAX_TOKENS) throw new Error("일일 토큰 예약 한도");',
        "  return { day, requests: base.requests + 1, reservedTokens: base.reservedTokens + reserved };",
        "}",
      ].join("\n"),
      codeEn: [
        "// Reserve: add the worst-case usage to the day's ledger BEFORE the call (browser ledger, simplified).",
        "interface Ledger { day: string; requests: number; reservedTokens: number }",
        "const MAX_REQUESTS = 25;",
        "const MAX_TOKENS = 64_000;",
        "",
        "export function reserve(ledger: Ledger, now: Date, body: object, maxOut = 1_024): Ledger {",
        "  const day = now.toISOString().slice(0, 10); // the day boundary is UTC",
        "  const base: Ledger = ledger.day === day ? ledger : { day, requests: 0, reservedTokens: 0 };",
        "  const bytes = new TextEncoder().encode(JSON.stringify(body)).byteLength;",
        "  const reserved = Math.ceil(bytes / 2) + maxOut; // conservative: input bytes / 2 + output cap",
        '  if (base.requests + 1 > MAX_REQUESTS) throw new Error("daily request limit");',
        '  if (base.reservedTokens + reserved > MAX_TOKENS) throw new Error("daily reserved-token limit");',
        "  return { day, requests: base.requests + 1, reservedTokens: base.reservedTokens + reserved };",
        "}",
      ].join("\n"),
      explain: t(
        "guardFreeAiRuntimeRequest의 핵심입니다. 입력은 UTF-8 바이트의 절반으로 보수적으로 어림하고, 출력 상한을 더한 값을 먼저 원장에 올립니다. 실제 코드는 여기에 Web Locks, 402·429 잠금, 요청 본문 정리를 더합니다.",
        "The heart of guardFreeAiRuntimeRequest. Input is estimated conservatively as half the UTF-8 bytes, the output cap is added, and that sum goes onto the ledger first. The real code adds Web Locks, 402 and 429 blocking, and request-body cleanup.",
      ),
      source: "apps/web/src/shared/ai/free-ai-runtime-budget.ts",
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("서버 원장: 확인과 증가를 한 문장으로", "Server ledger: check and increment in one statement"),
      language: "sql",
      code: [
        "-- 한도 확인과 증가를 한 문장으로: 한도를 넘으면 행이 갱신되지 않아 RETURNING 이 비어 있다.",
        'INSERT INTO studio_ai_daily_quota ("userId", "usageDay", "requestCount", "reservedTokens")',
        "SELECT $1, $2::date, 1, $3::bigint",
        "WHERE $4::integer >= 1 AND $3::bigint <= $5::bigint",
        'ON CONFLICT ("userId", "usageDay") DO UPDATE SET',
        '  "requestCount"   = studio_ai_daily_quota."requestCount" + 1,',
        '  "reservedTokens" = studio_ai_daily_quota."reservedTokens" + $3::bigint',
        'WHERE studio_ai_daily_quota."requestCount" < $4::integer',
        '  AND studio_ai_daily_quota."tokenCount" + studio_ai_daily_quota."reservedTokens" + $3::bigint <= $5::bigint',
        'RETURNING "usageDay";',
      ].join("\n"),
      codeEn: [
        "-- Check and increment in one statement: over the limit, no row is updated and RETURNING is empty.",
        'INSERT INTO studio_ai_daily_quota ("userId", "usageDay", "requestCount", "reservedTokens")',
        "SELECT $1, $2::date, 1, $3::bigint",
        "WHERE $4::integer >= 1 AND $3::bigint <= $5::bigint",
        'ON CONFLICT ("userId", "usageDay") DO UPDATE SET',
        '  "requestCount"   = studio_ai_daily_quota."requestCount" + 1,',
        '  "reservedTokens" = studio_ai_daily_quota."reservedTokens" + $3::bigint',
        'WHERE studio_ai_daily_quota."requestCount" < $4::integer',
        '  AND studio_ai_daily_quota."tokenCount" + studio_ai_daily_quota."reservedTokens" + $3::bigint <= $5::bigint',
        'RETURNING "usageDay";',
      ].join("\n"),
      explain: t(
        "RESERVE_USER_QUOTA_SQL을 줄인 것입니다. 읽고 나서 쓰는 두 단계 대신 조건부 UPSERT 한 문장이라 동시 요청이 한도를 함께 넘길 수 없습니다. 반환 행이 없으면 서버는 롤백하고 공급자를 부르지 않습니다.",
        "A trimmed RESERVE_USER_QUOTA_SQL. A conditional upsert replaces the read-then-write pair, so concurrent requests cannot overshoot the limit together. With no returned row the server rolls back and never calls the provider.",
      ),
      source: "apps/api/src/modules/studio-ai/studio-ai-usage.repository.ts",
      verify: "none",
    },
  ],
  links: [
    {
      title: "MDN · Web Locks API",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API",
      kind: "docs",
      note: t("탭 사이의 경쟁을 막는 표준 잠금", "The standard lock that stops races between tabs"),
    },
    {
      title: "MDN · Retry-After",
      url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Retry-After",
      kind: "docs",
      note: t("429 뒤 언제 다시 가능한지 알리는 헤더", "The header that says when to come back after a 429"),
    },
    {
      title: "Azure Architecture · Circuit Breaker pattern",
      url: "https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker",
      kind: "guide",
      note: t("차단 사유와 해제 시각을 두는 설계의 원형", "The design that keeps a block reason and a release time"),
    },
    {
      title: "PostgreSQL · INSERT ... ON CONFLICT",
      url: "https://www.postgresql.org/docs/current/sql-insert.html",
      kind: "docs",
    },
    {
      title: "Redis · EVAL",
      url: "https://redis.io/docs/latest/commands/eval/",
      kind: "docs",
      note: t("Lua 스크립트를 서버 안에서 한 번에 실행", "Run a Lua script atomically inside the server"),
    },
  ],
  chapterIds: ["free-ai-routing", "cost-engineering", "ai-routing"],
  talk: {
    pitch: t(
      "AI는 쓴 만큼 돈이 듭니다. 그래서 한도를 쓴 뒤에 세지 않고 쓰기 전에 예약합니다. 브라우저에는 하루 25회, 예약 토큰 64,000의 안전 한도가, 서버에는 사용자당 하루 200회, 토큰 1,000,000의 원장이 있습니다. 한도에 닿으면 공급자를 부르지 않고 멈추며, 유료로 넘기지 않습니다.",
      "AI costs money in proportion to use, so the allowance is reserved before use instead of counted after. The browser has a safety cap of 25 calls and 64,000 reserved tokens a day, and the server keeps a ledger of 200 calls and 1,000,000 tokens a day per user. At the limit the provider is not called, the request stops, and nothing rolls into paid use.",
    ),
    analogy: t(
      "호텔 방을 도착 전에 예약해 두는 것과 같습니다. 만실이면 헛걸음하지 않고, 체크아웃할 때 실제 숙박일수로 정산합니다.",
      "It is like booking a hotel room before you arrive: if the house is full you never make the trip, and at checkout you pay for the nights you actually used.",
    ),
    questions: [
      {
        question: t("브라우저 한도는 데이터를 지우면 우회할 수 있지 않나요?", "Can the browser limit be bypassed by clearing data?"),
        answer: t(
          "맞습니다. localStorage 원장이라 지우면 초기화되므로 '사고 방지' 장치입니다. 최종 방어선은 공급자 쪽 무료 한도와 결제 없는 계정이고, 서버 원장은 PostgreSQL이 권위입니다.",
          "Yes. It is a localStorage ledger that resets when cleared, so it is an accident-prevention device. The final defense is the provider's free limit and an account without billing, and the server ledger has PostgreSQL as its authority.",
        ),
      },
      {
        question: t("동시에 여러 요청이 오면요?", "What about many requests at once?"),
        answer: t(
          "응답 뒤에 세지 않고 호출 전에 최악값을 더하므로 같은 순간의 요청들이 한도를 함께 넘기 어렵습니다. 브라우저는 Web Locks로 탭끼리 순서를 잡고, 서버는 한 문장 조건부 UPSERT로 확인과 증가를 동시에 합니다.",
          "Because the worst case is added before the call, not counted after the response, simultaneous requests can hardly overshoot together. The browser orders tabs with Web Locks, and the server does check-and-increment in one conditional upsert.",
        ),
      },
      {
        question: t("정산 값이 오지 않으면요?", "What if no usage figure comes back?"),
        answer: t(
          "예약량 전체를 사용한 것으로 칩니다. 실제보다 많이 세는 쪽, 즉 보수적인 쪽으로 틀립니다.",
          "The whole reservation counts as used, so any error leans conservative, counting more than was really used.",
        ),
      },
    ],
    pitfall: t(
      "브라우저 차단 문구는 '한국 시간 자정'이라고 하지만 코드는 UTC 자정(한국 시간 오전 9시)에 풉니다. 발표에서는 'UTC 기준 하루'라고 말하세요. 또 원장마다 운영 상태가 다릅니다: 브라우저는 동작 중, 서버 풀은 키·운영 확인 대기, 음악은 운영에서 꺼져 있습니다.",
      "The browser's block message says 'midnight Korea time', but the code releases at UTC midnight (09:00 in Korea). Say 'a day in UTC' on stage. Operating states also differ per ledger: the browser one is running, the server pool awaits keys and sign-off, and music is off in production.",
    ),
  },
  technologies: ["Web Locks", "PostgreSQL", "Redis Lua", "Upstash Redis"],
  facts: [
    {
      value: "25 / 64,000 / 1,024",
      label: t("브라우저 하루 요청 수 / 예약 토큰 / 출력 상한", "Browser daily requests / reserved tokens / output cap"),
      source: "apps/web/src/shared/ai/free-ai-runtime-budget.ts",
    },
    {
      value: "200 / 1,000,000",
      label: t("서버 사용자당 하루 요청 수 / 토큰(코드 기본값)", "Server daily requests / tokens per user (code default)"),
      source: "apps/api/src/modules/studio-ai/studio-ai-usage.ts",
    },
    {
      value: "500 / 2,000,000",
      label: t("서버 전체 하루 요청 수 / 토큰(코드 기본값)", "Server global daily requests / tokens (code default)"),
      source: "apps/api/src/modules/studio-ai/studio-ai-usage.ts",
    },
    {
      value: "180 s / 1,200 s",
      label: t("음악 사용자당 / 전체 하루 예산(코드 기본값)", "Music per-user / global daily budget (code default)"),
      source: "apps/api/src/server/studio-music-core.ts",
    },
  ],
  reviewedAt: "2026-10-07",
};

const BYOK_PAID_APPROVAL_GATE: EngineeringAtlasEntry = {
  id: "byok-paid-approval-gate",
  category: "ai",
  name: "BYOK approval gate",
  title: t("유료 길은 내 키와 내 승인이 있어야", "Paid routes need your key and your approval"),
  status: "live",
  tagline: t(
    "내 키는 이 탭의 메모리에만 두고, 유료 길은 내가 허락해야 자동 순서에 들어옵니다.",
    "Your key stays in this tab's memory, and a paid route joins the automatic order only if you allow it.",
  ),
  background: [
    t(
      "BYOK(Bring Your Own Key)는 '내 열쇠를 가져와 쓴다'는 뜻입니다. 호텔 금고에 맡기지 않고 열쇠를 내 주머니에 두는 것과 같아서, 서비스가 열쇠를 보관하지 않고 요금도 내 공급자 계정에 청구됩니다. ToonStudio는 내 키로 AI 공급자에게 브라우저에서 곧바로 요청을 보내고, 키는 기본적으로 이 탭의 메모리에만 있다가 탭을 닫거나 새로고침하면 사라집니다. 돈이 드는 키는 내가 허락해야 자동 순서에 들어옵니다.",
      "BYOK (Bring Your Own Key) means you bring your own key. It is like keeping the key in your pocket instead of leaving it in the hotel safe: the service never holds it, and the bill goes to your own provider account. ToonStudio sends requests to the AI provider straight from your browser with your key, which by default lives only in this tab's memory and disappears when you close or reload the tab. A key that costs money enters the automatic order only after you allow it.",
    ),
    t(
      "키가 지나는 길은 세 갈래입니다. ① 기본: 문서 하나의 메모리에만 있습니다. ② 선택 저장: 비밀번호(12자 이상)로 PBKDF2-SHA256(310,000회) 키를 만들고 AES-GCM-256으로 설정 전체를 암호화해 localStorage에 둡니다. 비밀번호는 저장하지 않고, 새 탭에서는 직접 잠금을 풀어야 합니다. ③ 전송: fetch에 credentials 'omit'·redirect 'error'·no-referrer·no-store를 주고 Cookie와 X-User-Id 헤더를 지워 쿠키 없이 공급자에게만 보냅니다. 잠금(다른 탭 신호·pagehide·세션 종료·잠금 버튼)이 걸리면 진행 중인 요청을 모두 취소합니다.",
      "A key travels three ways. (1) By default it lives only in the memory of one document. (2) Optional saving derives a PBKDF2-SHA256 key (310,000 rounds) from a password of 12 or more characters, encrypts the whole configuration with AES-GCM-256 and stores it in localStorage; the password is never stored, and a new tab must unlock by hand. (3) On the wire, fetch uses credentials 'omit', redirect 'error', no-referrer and no-store, and the Cookie and X-User-Id headers are removed, so the request goes to the provider only and without cookies. Any lock (another tab's signal, pagehide, session end, the lock button) aborts every in-flight request.",
    ),
    t(
      "승인 게이트는 비용 정책에서 시작합니다. 네 가지 중 user-funded-byok(사용자 결제)만 공개 HTTPS 주소를 자유롭게 쓸 수 있지만 자동 순서에는 기본으로 들어오지 않습니다. 자동 후보에는 무료 정책이 늘 들어가고, 유료 키는 allowPaidFallback(기본 false)을 켜거나 수동 모드로 경로를 직접 고를 때만 들어옵니다. 대안인 '서버가 키를 보관하며 대신 호출'은 편하지만, 서버가 비밀 보관 책임자가 되고 운영자 비용이 사용자 호출에 묶입니다.",
      "The approval gate starts with the cost policy. Of the four, only user-funded-byok (the user pays) may use any public HTTPS address, yet it does not join the automatic order by default. Free policies are always automatic candidates, and a paid key joins only when allowPaidFallback (default false) is turned on or the user picks that route in manual mode. The alternative, a server that stores keys and calls on your behalf, is convenient but makes the server the custodian of secrets and ties operator cost to user calls.",
    ),
    t(
      "예외와 한계도 있습니다. 3D 생성(Hyper3D) 키는 브라우저 메모리에 있다가 요청 헤더(x-studio-3d-provider-key)로 ToonStudio API를 거쳐 공급자에 전달됩니다. LoRA 학습의 fal 키는 현재 탭의 sessionStorage에 따로 둡니다. 반복 횟수 310,000회는 OWASP 치트시트의 현행 권고(PBKDF2-HMAC-SHA256 600,000회)보다 낮아 올릴 여지가 있고, 같은 출처에 XSS가 있으면 메모리의 키도 위험해 엄격한 CSP가 전제입니다.",
      "There are exceptions and limits. The 3D (Hyper3D) key sits in browser memory and is passed to the provider through the ToonStudio API in a request header (x-studio-3d-provider-key). The fal key for LoRA training is kept separately in the current tab's sessionStorage. The 310,000 rounds are below the OWASP cheat sheet's current recommendation (600,000 for PBKDF2-HMAC-SHA256), so there is room to raise them, and an XSS in the same origin would expose even in-memory keys, so a strict CSP is a precondition.",
    ),
  ],
  keyPoints: [
    t("키는 기본적으로 이 탭의 메모리에만 있습니다", "By default the key lives only in this tab's memory"),
    t("저장하려면 비밀번호로 암호화해 이 기기에만 둡니다", "Saving means encrypting with a password, on this device only"),
    t("유료 키는 설정에서 허락해야 자동 순서에 들어옵니다", "A paid key joins the automatic order only after you allow it"),
    t("요청은 쿠키 없이 브라우저에서 공급자로 곧바로 갑니다", "Requests go from the browser straight to the provider, without cookies"),
  ],
  diagram: {
    id: "byok-paid-approval-gate-diagram",
    kind: "sequence",
    title: t("내 키가 지나는 길", "The path your key takes"),
    caption: t(
      "키는 탭의 메모리에서 공급자로 곧바로 가고, 저장은 암호화해서만 하며, 유료 폴백은 내가 허락해야 켜집니다.",
      "The key goes from tab memory straight to the provider, is saved only encrypted, and paid fallback turns on only if you allow it.",
    ),
    alt: t(
      "사용자가 키와 비용 정책을 입력하면 탭의 메모리에만 보관됩니다. 원하면 비밀번호로 암호화해 보관함에 저장하고, 유료 폴백은 따로 허락해야 합니다. 요청은 쿠키 없이 탭에서 AI 공급자로 곧바로 가며, 잠금이 걸리면 진행 중인 요청을 모두 취소합니다.",
      "The user enters a key and a cost policy, and it is kept only in the tab's memory. If wanted, it is encrypted with a password and saved to the vault, and paid fallback needs a separate permission. Requests go from the tab straight to the AI provider without cookies, and a lock cancels every in-flight request.",
    ),
    actors: [
      { id: "user", label: t("사용자", "You"), tone: "neutral" },
      { id: "tab", label: t("브라우저 탭", "Browser tab"), sub: t("메모리 · 앱 코드", "Memory · app code"), tone: "local" },
      { id: "vault", label: t("암호화 보관함", "Encrypted vault"), sub: t("localStorage · AES-GCM", "localStorage · AES-GCM"), tone: "local" },
      { id: "provider", label: t("AI 공급자", "AI provider"), sub: t("내 계정으로 과금", "Billed to your account"), tone: "external" },
    ],
    messages: [
      {
        from: "user",
        to: "tab",
        label: t("키 입력 + 비용 정책 선택", "Enter key, pick cost policy"),
        note: t("기본: 이 탭의 메모리에만 둠", "Default: memory of this tab only"),
      },
      {
        from: "user",
        to: "tab",
        label: t("유료 폴백 허락(선택)", "Allow paid fallback (optional)"),
        note: t("기본값은 허락 안 함", "Default is not allowed"),
      },
      {
        from: "user",
        to: "tab",
        label: t("보관함에 저장(선택)", "Save to vault (optional)"),
        note: t("비밀번호 12자 이상, 저장하지 않음", "Password of 12+ characters, never stored"),
      },
      {
        from: "tab",
        to: "vault",
        label: t("PBKDF2 → AES-GCM 암호화", "Encrypt: PBKDF2 → AES-GCM"),
        note: t("310,000회 · 암호문만 기록", "310,000 rounds · ciphertext only"),
      },
      {
        from: "tab",
        to: "provider",
        label: t("요청 (쿠키 없음)", "Request (no cookies)"),
        note: t("credentials omit · redirect error", "credentials omit · redirect error"),
      },
      {
        from: "provider",
        to: "tab",
        label: t("응답", "Response"),
        style: "dashed",
        note: t("ToonStudio 서버를 지나지 않음", "Does not pass through ToonStudio's server"),
      },
      {
        from: "tab",
        to: "tab",
        label: t("잠금: 진행 중 요청 모두 취소", "Lock: abort all in-flight requests"),
        note: t("다른 탭 신호 · pagehide · 세션 종료", "Other-tab signal · pagehide · session end"),
      },
    ],
  },
  usage: [
    {
      feature: t("AI 설정 · 클라우드 연결과 암호화 보관함", "AI settings · cloud connections and encrypted vault"),
      role: t(
        "키를 문서 메모리에 두고, 원하면 비밀번호로 암호화해 이 기기에 저장·잠금 해제·삭제합니다. 다른 탭에서 저장소 신호가 오면 잠급니다.",
        "Keeps keys in document memory and, if wanted, encrypts them with a password to save, unlock and delete on this device. A storage signal from another tab locks them.",
      ),
      paths: [
        "apps/web/src/shared/ai/user-ai-store.ts#persistUserAiVault",
        "apps/web/src/shared/ai/user-ai-crypto.ts#encryptUserAiVault",
        "apps/web/src/shared/ai/UnifiedAiSettings.tsx",
      ],
      route: "/settings/ai",
    },
    {
      feature: t("텍스트·이미지 AI 호출 (내 키)", "Text and image AI calls (your key)"),
      role: t(
        "내 키로 공급자에게 직접 보냅니다. 쿠키·리다이렉트·리퍼러를 끄고, 응답 텍스트에 키 문자열이 보이면 가립니다.",
        "Sends straight to the provider with your key, with cookies, redirects and referrers turned off, and masks any key string that shows up in the answer.",
      ),
      paths: ["apps/web/src/shared/ai/user-ai-transport.ts#userAiFetch"],
      route: "/studio",
    },
    {
      feature: t("유료 폴백 허락 스위치", "Paid-fallback switch"),
      role: t(
        "allowPaidFallback의 기본값은 false입니다. 유료 키는 허락했거나 수동 모드로 고른 경로만 자동 후보가 됩니다.",
        "allowPaidFallback defaults to false. A paid key is an automatic candidate only if you allowed it or chose that route in manual mode.",
      ),
      paths: [
        "apps/web/src/shared/ai/user-ai-types.ts#DEFAULT_USER_AI_ROUTING",
        "apps/web/src/shared/ai/user-ai-store.ts#userAiAutomaticExternalConnectionsForCapability",
      ],
      route: "/settings/ai",
    },
    {
      feature: t("AI 3D 생성 (Hyper3D 키)", "AI 3D generation (Hyper3D key)"),
      role: t(
        "3D 키는 메모리에만 두고, 요청 헤더로 ToonStudio API를 거쳐 공급자에 전달합니다. 텍스트·이미지 직통과 다른 길입니다.",
        "The 3D key stays in memory and is passed through the ToonStudio API in a request header. This differs from the direct text and image path.",
      ),
      paths: [
        "apps/web/src/shared/ai/unified-ai-settings.ts",
        "apps/api/src/modules/studio-ai/studio-3d-generation.controller.ts",
      ],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("보관함 암호화: PBKDF2 → AES-GCM", "Vault encryption: PBKDF2 → AES-GCM"),
      language: "ts",
      code: [
        "const b64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));",
        "",
        "// 비밀번호 → PBKDF2(SHA-256) → AES-GCM 키. 설정 JSON을 암호화해 문자열로 돌려준다.",
        "export async function encryptVault(json: string, passphrase: string): Promise<string> {",
        "  const enc = new TextEncoder();",
        "  const salt = crypto.getRandomValues(new Uint8Array(16));",
        "  const iv = crypto.getRandomValues(new Uint8Array(12));",
        '  const material = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);',
        "  const key = await crypto.subtle.deriveKey(",
        '    { name: "PBKDF2", salt, iterations: 310_000, hash: "SHA-256" },',
        '    material, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);',
        "  const data = await crypto.subtle.encrypt(",
        '    { name: "AES-GCM", iv, additionalData: enc.encode("app-vault-v1") }, key, enc.encode(json));',
        "  return JSON.stringify({ salt: b64(salt), iv: b64(iv), data: b64(new Uint8Array(data)) });",
        "}",
      ].join("\n"),
      codeEn: [
        "const b64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));",
        "",
        "// Password -> PBKDF2 (SHA-256) -> AES-GCM key. Encrypts the settings JSON into a string.",
        "export async function encryptVault(json: string, passphrase: string): Promise<string> {",
        "  const enc = new TextEncoder();",
        "  const salt = crypto.getRandomValues(new Uint8Array(16));",
        "  const iv = crypto.getRandomValues(new Uint8Array(12));",
        '  const material = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);',
        "  const key = await crypto.subtle.deriveKey(",
        '    { name: "PBKDF2", salt, iterations: 310_000, hash: "SHA-256" },',
        '    material, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);',
        "  const data = await crypto.subtle.encrypt(",
        '    { name: "AES-GCM", iv, additionalData: enc.encode("app-vault-v1") }, key, enc.encode(json));',
        "  return JSON.stringify({ salt: b64(salt), iv: b64(iv), data: b64(new Uint8Array(data)) });",
        "}",
      ].join("\n"),
      explain: t(
        "encryptUserAiVault를 줄인 예제입니다. 비밀번호에서 키를 늘려 만들고(PBKDF2), 변조까지 잡아 주는 AES-GCM으로 설정 JSON을 암호화합니다. 소금(salt)과 IV는 매번 무작위이고, 비밀번호 자체는 어디에도 남기지 않습니다. 실제 코드는 길이 검사와 복호화 함수도 가집니다.",
        "A trimmed encryptUserAiVault. It stretches the password into a key (PBKDF2) and encrypts the settings JSON with AES-GCM, which also detects tampering. The salt and IV are random each time, and the password itself is kept nowhere. The real code also has length checks and a decrypt function.",
      ),
      source: "apps/web/src/shared/ai/user-ai-crypto.ts",
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("내 키로 보내는 fetch 옵션", "Fetch options for sending with your key"),
      language: "ts",
      code: [
        "// 내 키로 공급자에게 직접 보낼 때의 옵션(단순화). 쿠키·리다이렉트·리퍼러를 모두 끈다.",
        "export async function sendWithMyKey(url: string, key: string, body: unknown, signal: AbortSignal): Promise<Response> {",
        '  const headers = new Headers({ "Content-Type": "application/json" });',
        '  headers.delete("Cookie"); // 사이트 쿠키는 공급자로 가지 않는다',
        '  headers.delete("X-User-Id");',
        '  headers.set("Authorization", `Bearer ${key}`);',
        "  return fetch(url, {",
        '    method: "POST",',
        "    headers,",
        "    body: JSON.stringify(body),",
        "    signal,",
        '    credentials: "omit", // 쿠키 전송 금지',
        '    redirect: "error", // 다른 주소로 새어 나가는 리다이렉트 금지',
        '    referrerPolicy: "no-referrer",',
        '    cache: "no-store",',
        "  });",
        "}",
      ].join("\n"),
      codeEn: [
        "// Options for sending straight to the provider with your key (simplified). Cookies, redirects and referrers are all off.",
        "export async function sendWithMyKey(url: string, key: string, body: unknown, signal: AbortSignal): Promise<Response> {",
        '  const headers = new Headers({ "Content-Type": "application/json" });',
        '  headers.delete("Cookie"); // site cookies never reach the provider',
        '  headers.delete("X-User-Id");',
        '  headers.set("Authorization", `Bearer ${key}`);',
        "  return fetch(url, {",
        '    method: "POST",',
        "    headers,",
        "    body: JSON.stringify(body),",
        "    signal,",
        '    credentials: "omit", // never send cookies',
        '    redirect: "error", // never follow a redirect to another address',
        '    referrerPolicy: "no-referrer",',
        '    cache: "no-store",',
        "  });",
        "}",
      ].join("\n"),
      explain: t(
        "userAiFetch의 전송 옵션만 남긴 예제입니다. 사이트 쿠키와 사용자 식별 헤더를 지우고, 리다이렉트를 오류로 만들어 키가 엉뚱한 주소로 새지 않게 합니다. 실제 코드는 여기에 연결 검증, 예산 예약, 80MiB 응답 상한, 키 마스킹을 더합니다.",
        "Only the transport options of userAiFetch remain. Site cookies and the user-id header are removed, and redirects become errors so the key cannot leak to a stray address. The real code adds connection checks, budget reservation, an 80 MiB response cap and key masking.",
      ),
      source: "apps/web/src/shared/ai/user-ai-transport.ts",
      verify: "types",
    },
  ],
  links: [
    {
      title: "MDN · SubtleCrypto.deriveKey()",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey",
      kind: "docs",
      note: t("PBKDF2로 비밀번호에서 키를 만드는 표준 API", "The standard API for deriving a key from a password with PBKDF2"),
    },
    {
      title: "MDN · SubtleCrypto.encrypt() (AES-GCM)",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt",
      kind: "docs",
    },
    {
      title: "OWASP · Password Storage Cheat Sheet",
      url: "https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html",
      kind: "guide",
      note: t("PBKDF2 반복 횟수 권고를 확인하는 곳", "Where to check the PBKDF2 iteration recommendation"),
    },
    {
      title: "MDN · Request.credentials",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/Request/credentials",
      kind: "docs",
    },
    {
      title: "MDN · CSP connect-src",
      url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src",
      kind: "docs",
      note: t("브라우저가 어느 주소로 연결할 수 있는지 정하는 규칙", "The rule that decides which addresses the browser may connect to"),
    },
  ],
  chapterIds: ["free-ai-routing", "ai-routing", "cost-engineering"],
  talk: {
    pitch: t(
      "BYOK는 '내 열쇠를 가져온다'는 뜻입니다. 키는 기본적으로 이 탭의 메모리에만 있고, 저장하려면 비밀번호로 암호화해서 이 기기에만 둡니다. 요청은 쿠키 없이 내 브라우저에서 AI 공급자로 곧바로 가며 ToonStudio 서버를 지나지 않습니다. 돈이 드는 키는 설정에서 내가 허락해야 자동 순서에 들어오므로, 모르는 사이에 요금이 나가는 일을 막습니다.",
      "BYOK means bringing your own key. By default the key lives only in this tab's memory, and saving it means encrypting it with a password on this device only. Requests go without cookies from your browser straight to the AI provider and do not pass through ToonStudio's server. A key that costs money enters the automatic order only when you allow it in settings, which prevents charges you did not expect.",
    ),
    analogy: t(
      "호텔 금고에 맡기지 않고 내 주머니에 열쇠를 두는 것입니다. 서비스가 열쇠를 가진 적이 없으니 서비스가 잃어버릴 열쇠도 없습니다.",
      "It is keeping the key in your pocket instead of the hotel safe. The service never held the key, so there is no key for it to lose.",
    ),
    questions: [
      {
        question: t("키가 서버에 저장되나요?", "Is the key stored on a server?"),
        answer: t(
          "텍스트·이미지용 개인 키는 서버로 보내지 않고 브라우저에서 공급자로 직접 갑니다. 예외로 3D(Hyper3D) 키는 요청 헤더로 API를 거쳐 공급자에게 전달되고, LoRA 학습의 fal 키는 현재 탭 sessionStorage에 따로 둡니다.",
          "Personal keys for text and images are not sent to our server; they go from the browser straight to the provider. As exceptions, the 3D (Hyper3D) key travels through the API in a request header, and the fal key for LoRA training is kept in the current tab's sessionStorage.",
        ),
      },
      {
        question: t("암호화는 충분히 안전한가요?", "Is the encryption strong enough?"),
        answer: t(
          "PBKDF2(SHA-256) 310,000회와 AES-GCM-256이고 비밀번호는 저장하지 않습니다. 다만 반복 횟수는 OWASP의 현행 권고(600,000회)보다 낮아 올릴 여지가 있고, 같은 출처에 XSS가 있으면 메모리의 키도 위험하므로 엄격한 CSP가 전제입니다.",
          "It uses PBKDF2 (SHA-256) with 310,000 rounds and AES-GCM-256, and the password is never stored. The round count is below OWASP's current recommendation (600,000), so it could be raised, and an XSS in the same origin would endanger even in-memory keys, so a strict CSP is assumed.",
        ),
      },
      {
        question: t("유료 키가 있으면 한도가 끝날 때 자동으로 쓰이나요?", "If I have a paid key, is it used automatically when the free limit ends?"),
        answer: t(
          "아니요. allowPaidFallback의 기본값은 꺼짐입니다. 설정에서 켜거나 수동 모드로 그 경로를 직접 고를 때만 후보가 됩니다.",
          "No. allowPaidFallback is off by default. A paid key becomes a candidate only when you turn it on in settings or pick that route in manual mode.",
        ),
      },
    ],
    pitfall: t(
      "'모든 키가 서버를 거치지 않는다'고 말하면 3D 키 때문에 틀립니다. 또 운영 CSP connect-src에 허용된 AI 호스트는 api.openai.com·openrouter.ai·api.z.ai·api.deepseek.com뿐이라, Gemini·Groq 등 다른 무료 프리셋의 브라우저 직통 호출이 운영에서 막히는지는 실브라우저로 확인하지 못했습니다(미확인, 정적 대조만).",
      "Saying 'no key ever touches our server' is wrong because of the 3D key. Also, the only AI hosts allowed in the production CSP connect-src are api.openai.com, openrouter.ai, api.z.ai and api.deepseek.com, so whether direct browser calls to other free presets such as Gemini or Groq are blocked in production was not checked in a real browser (unverified; static comparison only).",
    ),
  },
  technologies: ["Web Crypto API", "PBKDF2", "AES-GCM", "BYOK"],
  facts: [
    {
      value: "310,000",
      label: t("보관함 PBKDF2 반복 횟수", "Vault PBKDF2 iterations"),
      source: "apps/web/src/shared/ai/user-ai-crypto.ts",
    },
    {
      value: "12~1,024",
      label: t("보관함 비밀번호 길이(글자 수)", "Vault password length (characters)"),
      source: "apps/web/src/shared/ai/user-ai-crypto.ts",
    },
    {
      value: "false",
      label: t("allowPaidFallback 기본값", "allowPaidFallback default"),
      source: "apps/web/src/shared/ai/user-ai-types.ts",
    },
  ],
  reviewedAt: "2026-10-07",
};

const FREE_AI_PROVIDER_ALLOWLIST: EngineeringAtlasEntry = {
  id: "free-ai-provider-allowlist",
  category: "ai",
  name: "Provider allowlist",
  title: t("무료로 인정하는 공급자 목록", "The list of providers counted as free"),
  status: "configured",
  tagline: t(
    "주소·경로·모델이 목록과 정확히 같아야 '무료'로 인정하고, 운영자가 확인해야 공유 풀에 들어옵니다.",
    "Address, path and model must match the list exactly to count as free, and an operator must confirm before a provider joins the pool.",
  ),
  background: [
    t(
      "쿠폰이 통하는 메뉴가 정해진 무료 음료 쿠폰을 떠올려 보세요. 'OpenAI 호환'이라는 공통 요청 규격 덕분에 AI 공급자는 주소·키·모델 이름 세 가지로 갈아 끼울 수 있습니다. 하지만 그중 무엇이 '무료'인지는 공급자 약관에 달려 있어서 코드가 이름만 보고 믿을 수 없습니다. 그래서 검토한 공급자의 정확한 주소와 무료 모델만 목록에 올리고, 목록에 없는 조합은 '무료'로 인정하지 않습니다.",
      "Picture a free-drink coupon that works only for listed menu items. Thanks to a shared request format called 'OpenAI-compatible', an AI provider can be swapped using three things: an address, a key and a model name. But which of them is actually free depends on the provider's terms, so code cannot trust a name alone. Only the exact addresses and free models of providers that were reviewed go on the list, and any combination not on it is not counted as free.",
    ),
    t(
      "목록은 두 곳에 있습니다. 브라우저(내 키)는 호스트 8곳의 정확한 OpenAI 호환 경로(2026-09-16 검토)를 갖고, 포트가 붙거나 경로가 다르면 거부합니다. Qwen(베이징 워크스페이스)·Z.AI·SiliconFlow는 무료 모델 이름까지 목록으로 확인하고 OpenRouter는 openrouter/free 또는 :free 모델만 허용합니다. 서버 공유 풀은 공급자 9곳이 기본 순서로 놓이며, 한 곳이 '준비됨'이려면 풀 스위치·서버 키·운영자 확인(CONFIRMED)이 모두 있어야 하고 Qwen·Z.AI·SiliconFlow·Cloudflare·OpenRouter는 모델까지 무료 목록 안이어야 합니다.",
      "The list lives in two places. In the browser (your own key) it holds the exact OpenAI-compatible paths of eight hosts (reviewed 2026-09-16) and rejects a port or a different path. For Qwen (Beijing workspace), Z.AI and SiliconFlow it also checks the free model names, and OpenRouter allows only openrouter/free or :free models. The shared server pool lines up nine providers in a default order; a provider is 'ready' only when the pool switch, a server key and operator confirmation (CONFIRMED) are all present, and for Qwen, Z.AI, SiliconFlow, Cloudflare and OpenRouter the model must also be on the free list.",
    ),
    t(
      "대안은 공급자 약관을 사람이 알아서 지키게 두는 것인데, 약관은 바뀌고 실수는 곧 요금입니다. 모든 호출을 게이트웨이 하나에 맡기는 길은 그 서비스에 묶입니다. 그래서 목록을 코드에 두고 검토일을 적는 방식을 골랐습니다. 순서는 요청의 사용자 순서, 배포 설정 순서, 기본 순서를 차례로 합쳐 중복을 없앱니다. 무료 티어는 입력을 제품 개선에 쓸 수 있는 곳도 있어, 공급자마다 데이터 약관 표식(training·no-training·varies·unconfirmed, 2026-10-06 검토)을 상태 응답에 담습니다.",
      "One alternative is to trust people to follow provider terms, but terms change and a slip becomes a bill. Another is to hand every call to one gateway, which ties you to that service. So the list lives in code with a review date. The order merges the request's user order, the deployment order and the default order, dropping duplicates. Some free tiers may use inputs to improve their products, so each provider carries a data-terms badge (training, no-training, varies, unconfirmed; reviewed 2026-10-06) in the status response.",
    ),
    t(
      "한계와 공백도 있습니다. 데이터 약관 표식은 API 응답과 웹 타입까지만 있고 화면에서 그리는 컴포넌트는 저장소에서 찾지 못했습니다. 풀에 등록된 전사·비전·이미지·임베딩 능력은 상태에만 나타나고 실제로 호출하는 컨트롤러는 없습니다. 모델 이름은 공급자 사정으로 바뀔 수 있어 사람이 주기적으로 다시 검토해야 합니다.",
      "There are limits and gaps. The data-terms badge exists only in the API response and the web types; no component that renders it was found in the repository. The transcription, vision, image and embedding capabilities registered for the pool appear only in the status response, with no controller that actually calls them. Model names can change with provider decisions, so a person must review them periodically.",
    ),
  ],
  keyPoints: [
    t("주소·경로·모델이 목록과 정확히 같아야 '무료'로 인정", "Address, path and model must match the list exactly to count as free"),
    t("서버 풀은 스위치·키·운영자 확인이 모두 있어야 준비됨", "A server provider is ready only with switch, key and operator confirmation"),
    t("공급자별 데이터 약관 표식을 상태 응답에 담음(2026-10-06)", "Each provider carries a data-terms badge in the status response (2026-10-06)"),
    t("자동 무료 길은 텍스트 전용, 이미지·3D는 명시적 BYOK", "The automatic free route is text-only; images and 3D need explicit BYOK"),
  ],
  diagram: {
    id: "free-ai-provider-allowlist-diagram",
    kind: "layers",
    title: t("요청이 만나는 허용 목록 층", "The allowlist layers a request meets"),
    caption: t(
      "두 문턱을 모두 통과한 조합만 '무료'로 인정됩니다. 하나라도 비어 있으면 그 공급자는 후보가 되지 않습니다.",
      "Only combinations that clear both gates count as free. If anything is missing, that provider is not a candidate.",
    ),
    alt: t(
      "위에서 아래로 설정 화면, 브라우저 문턱, 서버 공유 풀 문턱, 공급자 9곳이 쌓여 있습니다. 브라우저 문턱은 비용 정책 4종과 호스트·경로·모델 목록을, 서버 문턱은 풀 스위치와 서버 키와 운영자 확인과 무료 모델 확인을 봅니다.",
      "From top to bottom: the settings screen, the browser gate, the shared server-pool gate and nine providers. The browser gate checks four cost policies plus host, path and model lists; the server gate checks the pool switch, a server key, operator confirmation and the free-model check.",
    ),
    layers: [
      {
        id: "settings",
        label: t("설정 화면", "Settings screen"),
        sub: t("프리셋 11종 중 고르고 키를 넣음", "Pick one of 11 presets and add a key"),
        tone: "local",
        chips: ["11 presets", "API key"],
      },
      {
        id: "browser-gate",
        label: t("브라우저 문턱 (내 키)", "Browser gate (your key)"),
        sub: t("비용 정책 4종 · 호스트·경로·모델 허용 목록", "Four cost policies · host, path and model allowlists"),
        tone: "local",
        chips: ["unverified", "provider-free-tier", "openrouter-free", "user-funded-byok"],
      },
      {
        id: "server-gate",
        label: t("서버 공유 풀 문턱", "Shared server-pool gate"),
        sub: t("풀 스위치 · 서버 키 · 운영자 확인 · 무료 모델", "Pool switch · server key · operator sign-off · free model"),
        tone: "server",
        chips: ["POOL_ENABLED", "API key", "CONFIRMED", "model check"],
      },
      {
        id: "providers",
        label: t("공급자 9곳 (기본 순서)", "Nine providers (default order)"),
        sub: t("나머지: Cloudflare·OpenRouter·SiliconFlow", "The rest: Cloudflare·OpenRouter·SiliconFlow"),
        tone: "external",
        chips: ["Gemini", "Qwen", "Groq", "SambaNova", "Z.AI", "Mistral"],
      },
    ],
    brackets: [
      {
        label: t("여기서 걸러져야 '무료'", "Must clear these to count as free"),
        layerIds: ["browser-gate", "server-gate"],
      },
    ],
  },
  usage: [
    {
      feature: t("AI 설정 · 공급자 프리셋 11종", "AI settings · 11 provider presets"),
      role: t(
        "프리셋마다 정확한 주소와 비용 정책이 정해져 있고, 키를 넣으면 호스트·경로·모델이 허용 목록과 같은지 먼저 확인합니다.",
        "Each preset fixes an exact address and cost policy, and once a key is added the host, path and model are first checked against the allowlist.",
      ),
      paths: ["apps/web/src/shared/ai/free-ai-policy.ts#FREE_AI_PRESETS"],
      route: "/settings/ai",
    },
    {
      feature: t("서버 공유 무료 풀", "Shared server free pool"),
      role: t(
        "공급자 9곳의 설정·무료 모델 확인·순서 합치기를 맡습니다. 준비된 공급자만 후보가 되고, 모두 비면 개인 무료 키를 안내합니다.",
        "Handles the settings, free-model checks and ordering of nine providers. Only ready providers become candidates, and an empty pool points users to a personal free key.",
      ),
      paths: [
        "apps/api/src/modules/studio-ai/studio-ai-provider.ts#resolveStudioAiProviders",
        "apps/api/src/modules/studio-ai/studio-ai-provider.test.ts",
      ],
      route: "/studio",
    },
    {
      feature: t("공급자 상태 응답 (/studio-ai/status)", "Provider status response (/studio-ai/status)"),
      role: t(
        "준비 여부, 모델, 사용 순서, 하루 한도(UTC·실패 시 닫힘)와 공급자별 데이터 약관 표식을 내려 줍니다. 화면용 타입은 웹에 있습니다.",
        "Returns readiness, models, the order, the daily limits (UTC, fail-closed) and each provider's data-terms badge. The typed client for it lives in the web app.",
      ),
      paths: [
        "apps/api/src/modules/studio-ai/studio-ai.controller.ts",
        "apps/web/src/shared/ai/free-ai-pool-status.ts",
      ],
    },
    {
      feature: t("AI 기능별 사용 가능 상태 보드", "AI capability status board"),
      role: t(
        "글·이미지·음악·음성·3D 등 8가지 능력이 사용 가능, 연결 필요, 현재 비활성 중 어느 상태인지 한 화면에 보여 줍니다.",
        "Shows on one screen whether each of eight capabilities, such as text, image, music, voice and 3D, is available, needs a connection or is currently off.",
      ),
      paths: [
        "apps/web/src/shared/ai/ai-capability-registry.ts#buildAiCapabilityRegistry",
        "apps/web/src/shared/ai/AiCapabilityStatusBoard.tsx",
      ],
      route: "/settings/ai",
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("공유 풀의 순서와 '준비됨' 조건", "Pool order and the 'ready' condition"),
      language: "ts",
      code: [
        "// 서버 공유 풀: 사용자 순서 → 배포 순서 → 기본 순서 (중복 제거, 앞선 값 우선).",
        'const DEFAULTS = ["gemini", "qwen", "groq"] as const;',
        "type Id = (typeof DEFAULTS)[number];",
        "type Env = Record<string, string | undefined>;",
        "",
        "export const resolveOrder = (user: Id[], deploy: Id[]): Id[] =>",
        "  [...new Set<Id>([...user, ...deploy, ...DEFAULTS])];",
        "",
        "// 한 공급자가 '준비됨'이려면 풀 스위치 + 서버 키 + 운영자 확인(CONFIRMED)이 모두 필요하다.",
        "export function ready(id: Id, env: Env): boolean {",
        "  const name = id.toUpperCase();",
        '  return env.POOL_ENABLED === "true"',
        "    && Boolean(env[`${name}_API_KEY`]?.trim())",
        '    && env[`${name}_CONFIRMED`] === "true";',
        "}",
      ].join("\n"),
      codeEn: [
        "// Shared server pool: user order -> deployment order -> default order (deduplicated, earlier wins).",
        'const DEFAULTS = ["gemini", "qwen", "groq"] as const;',
        "type Id = (typeof DEFAULTS)[number];",
        "type Env = Record<string, string | undefined>;",
        "",
        "export const resolveOrder = (user: Id[], deploy: Id[]): Id[] =>",
        "  [...new Set<Id>([...user, ...deploy, ...DEFAULTS])];",
        "",
        "// A provider is 'ready' only with the pool switch + a server key + operator confirmation (CONFIRMED).",
        "export function ready(id: Id, env: Env): boolean {",
        "  const name = id.toUpperCase();",
        '  return env.POOL_ENABLED === "true"',
        "    && Boolean(env[`${name}_API_KEY`]?.trim())",
        '    && env[`${name}_CONFIRMED`] === "true";',
        "}",
      ].join("\n"),
      explain: t(
        "resolveStudioAiProviderOrder와 freeProviderConfig의 핵심을 합쳐 줄인 예제입니다. 순서는 Set으로 중복을 없애며 앞선 값이 이기고, 준비됨 판정은 세 조건의 AND입니다. 실제 이름은 STUDIO_AI_FREE_*_API_KEY, STUDIO_AI_FREE_*_CONFIRMED처럼 공급자별로 다릅니다.",
        "A combined, trimmed version of resolveStudioAiProviderOrder and freeProviderConfig. A Set removes duplicates with earlier entries winning, and readiness is the AND of three conditions. The real variable names differ per provider, such as STUDIO_AI_FREE_*_API_KEY and STUDIO_AI_FREE_*_CONFIRMED.",
      ),
      source: "apps/api/src/modules/studio-ai/studio-ai-provider.ts",
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("호스트별 무료 모델 허용 목록", "Per-host free-model allowlist"),
      language: "ts",
      code: [
        "// 호스트별 '무료 모델' 허용 목록: 목록 밖 모델은 무료 경로에서 거부한다(단순화).",
        "const FREE_MODELS: Record<string, ReadonlySet<string>> = {",
        '  "api.z.ai": new Set(["glm-4.7-flash", "glm-4.5-flash"]),',
        '  "api.siliconflow.cn": new Set(["thudm/glm-z1-9b-0414"]),',
        "};",
        "",
        "export function modelIssue(hostname: string, model: string): string | null {",
        "  const allowed = FREE_MODELS[hostname];",
        "  if (!allowed) return null; // 이 예제는 목록이 없는 호스트를 검사하지 않는다",
        '  return allowed.has(model.trim().toLowerCase()) ? null : "무료 허용 목록에 없는 모델";',
        "}",
      ].join("\n"),
      codeEn: [
        "// Per-host free-model allowlist: a model outside the list is rejected on a free route (simplified).",
        "const FREE_MODELS: Record<string, ReadonlySet<string>> = {",
        '  "api.z.ai": new Set(["glm-4.7-flash", "glm-4.5-flash"]),',
        '  "api.siliconflow.cn": new Set(["thudm/glm-z1-9b-0414"]),',
        "};",
        "",
        "export function modelIssue(hostname: string, model: string): string | null {",
        "  const allowed = FREE_MODELS[hostname];",
        "  if (!allowed) return null; // this sketch does not check hosts that have no list",
        '  return allowed.has(model.trim().toLowerCase()) ? null : "model not on the free allowlist";',
        "}",
      ].join("\n"),
      explain: t(
        "reviewedProviderModelIssue의 구조를 보여 줍니다. 모델 이름은 공백을 걷고 소문자로 맞춰 비교하며, 목록 밖이면 호출 전에 막힙니다. 모델 이름은 공급자가 바꿀 수 있어 코드의 목록은 검토일과 함께 갱신해야 합니다.",
        "Shows the structure of reviewedProviderModelIssue. Model names are trimmed and lowercased before comparison, and anything off the list is blocked before the call. Providers can rename models, so the list in code must be refreshed along with its review date.",
      ),
      source: "apps/web/src/shared/ai/free-ai-policy.ts",
      verify: "types",
    },
  ],
  links: [
    {
      title: "OpenRouter · Free models router",
      url: "https://openrouter.ai/docs/cookbook/get-started/free-models-router-playground",
      kind: "docs",
    },
    {
      title: "Cloudflare · Workers AI pricing",
      url: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
      kind: "docs",
      note: t("무료 할당과 과금 방식은 이 문서에서 확인", "Check free allowance and billing here"),
    },
    {
      title: "Hugging Face · Inference Providers",
      url: "https://huggingface.co/docs/inference-providers/index",
      kind: "docs",
    },
    {
      title: "Groq · Rate limits",
      url: "https://console.groq.com/docs/rate-limits",
      kind: "docs",
    },
    {
      title: "Google AI · Gemini API pricing",
      url: "https://ai.google.dev/gemini-api/docs/pricing",
      kind: "docs",
      note: t("무료 티어의 조건은 공급자가 바꿀 수 있어 날짜와 함께 읽습니다", "Free-tier terms can change, so read them with their date"),
    },
  ],
  chapterIds: ["free-ai-routing", "ai-routing", "cost-engineering"],
  talk: {
    pitch: t(
      "무료라고 적혀 있다고 다 믿지 않습니다. 검토한 공급자의 정확한 주소와 무료 모델 이름만 목록에 올려 두고, 목록에 없으면 '무료'로 인정하지 않습니다. 서버 공유 풀에서는 공급자 9곳이 기본 순서로 놓이지만, 풀 스위치와 서버 키와 운영자 확인이 모두 있어야 준비됨이 됩니다. 저장소 기준으로 이 확인이 비어 있어 지금은 '설정 필요' 상태라고 말씀드립니다.",
      "We do not trust something just because it says free. Only the exact addresses and free model names of providers we reviewed go on the list, and anything else is not counted as free. In the shared pool nine providers are lined up in a default order, but a provider is ready only with the pool switch, a server key and operator confirmation. By the repository's own settings those confirmations are still missing, so today it is in a 'setup required' state.",
    ),
    analogy: t(
      "쿠폰이 통하는 메뉴가 정해진 무료 음료 쿠폰과 같습니다. 쿠폰에 적힌 메뉴가 아니면 계산대에서 거절됩니다.",
      "It is like a free-drink coupon valid only for listed menu items: anything else is refused at the register.",
    ),
    questions: [
      {
        question: t("공급자 9곳이 지금 다 켜져 있나요?", "Are all nine providers on right now?"),
        answer: t(
          "아니요. 저장소 기준(render.yaml)으로 풀 스위치만 켜져 있고 운영 확인과 키는 설정 대기입니다. 운영 대시보드의 실제 값은 이 저장소에서 확인할 수 없습니다.",
          "No. Per the repository (render.yaml) only the pool switch is on, and operator confirmation and keys wait to be set. The actual values in the production dashboard cannot be checked from this repository.",
        ),
      },
      {
        question: t("내 데이터가 학습에 쓰이나요?", "Is my data used for training?"),
        answer: t(
          "공급자마다 다릅니다. 코드는 Gemini·Mistral을 학습 사용 가능(training), Groq를 비사용(no-training), OpenRouter를 가변(varies), 나머지는 미확인(unconfirmed)으로 표시합니다(2026-10-06 검토). 다만 이 표식을 화면에서 보여 주는 컴포넌트는 아직 없습니다.",
          "It differs by provider. The code marks Gemini and Mistral as training, Groq as no-training, OpenRouter as varies and the rest as unconfirmed (reviewed 2026-10-06). But there is no component yet that shows this badge on screen.",
        ),
      },
      {
        question: t("허용 목록은 누가 관리하나요?", "Who maintains the allowlist?"),
        answer: t(
          "사람이 공식 문서를 확인해 코드에 올리고 검토일을 남깁니다. 공급자 정책이 바뀌면 다시 검토해야 하는 유지 비용이 있습니다.",
          "A person checks the official documents, puts the result in code and records the review date. It carries a maintenance cost because it must be reviewed again whenever a provider changes its policy.",
        ),
      },
    ],
    pitfall: t(
      "슬라이드에서 '9개 공급자가 운영 중'이라고 말하면 안 됩니다. 정확히는 '9곳을 지원하는 코드와 게이트가 있고, 운영 확인·키는 설정 대기'입니다. 데이터 약관 표식이 화면에 표시된다고 말하는 것도 오류입니다.",
      "Do not say 'nine providers are running' on a slide. The accurate version is that code and gates for nine providers exist while operator confirmation and keys wait to be set. Claiming the data-terms badge is shown on screen would also be wrong.",
    ),
  },
  technologies: ["OpenAI-compatible API", "OpenRouter", "Cloudflare Workers", "Allowlist"],
  facts: [
    {
      value: "8",
      label: t("정확한 경로를 검토한 공급자 호스트 수(2026-09-16)", "Provider hosts with reviewed exact paths (2026-09-16)"),
      source: "apps/web/src/shared/ai/free-ai-policy.ts",
    },
    {
      value: "9",
      label: t("서버 공유 풀의 공급자 수", "Providers in the shared server pool"),
      source: "apps/api/src/modules/studio-ai/studio-ai-provider.ts",
    },
    {
      value: "2026-10-06",
      label: t("데이터 약관 표식 검토일(코드 주석)", "Data-terms badge review date (code comment)"),
      source: "apps/api/src/modules/studio-ai/studio-ai-provider.ts",
    },
  ],
  reviewedAt: "2026-10-07",
};

export const ENGINEERING_ATLAS_AI_ROUTING: readonly EngineeringAtlasEntry[] = [
  FREE_FIRST_AI_ROUTING,
  AMBIGUOUS_FAILURE_NO_RETRY,
  QUOTA_LEDGER_BUDGET,
  BYOK_PAID_APPROVAL_GATE,
  FREE_AI_PROVIDER_ALLOWLIST,
];
