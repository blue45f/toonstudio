import type { LocalizedText } from "./engineering-story-content";

/**
 * 무료로 AI 토큰을 쓰는 방법 — 세미나·발표 자료용 실전 정리.
 *
 * 수치는 각 제공자 공식 요금·문서 페이지를 확인한 값만 적고, 확인 날짜를 함께 남긴다.
 * 무료 티어는 예고 없이 바뀌므로(아래 Mistral·SambaNova 종료 사례가 실제 증거다)
 * 이 표를 고정 약속으로 읽지 말고, 시작 전에 공식 페이지에서 다시 확인할 것.
 * 외부 링크는 이름으로만 참조하고 주소는 engineering-external-links 레지스트리가 해결한다.
 */
export const FREE_AI_TOKEN_GUIDE_VERIFIED_ON = "2026-10-08";

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

export type FreeAiTokenCategoryId =
  | "provider-free-tier"
  | "router"
  | "byok"
  | "on-device"
  | "trial-credit";

export interface FreeAiTokenCategory {
  readonly id: FreeAiTokenCategoryId;
  readonly title: LocalizedText;
  readonly summary: LocalizedText;
}

export const FREE_AI_TOKEN_CATEGORIES: readonly FreeAiTokenCategory[] = [
  {
    id: "provider-free-tier",
    title: t("제공자 무료 티어", "Provider free tiers"),
    summary: t(
      "모델 제공자가 자기 API에 직접 건 무료 한도입니다. 가입하고 키만 발급하면 시작할 수 있지만, 한도와 데이터 정책은 제공자마다 완전히 다릅니다.",
      "Free allowances that model providers attach to their own APIs. Sign-up and a key are enough to start, but limits and data policies differ completely by provider.",
    ),
  },
  {
    id: "router",
    title: t("무료 모델 라우터·애그리게이터", "Free-model routers and aggregators"),
    summary: t(
      "여러 제공자의 무료 모델을 키 하나·API 하나로 모아 주는 중간층입니다. 공용 풀을 나눠 쓰는 구조라 혼잡 시간에는 거절(429)이 잦은 대신, 모델을 갈아타기 쉽습니다.",
      "A middle layer that gathers many providers' free models behind one key and one API. Shared pools mean frequent 429s at peak times, but switching models is easy.",
    ),
  },
  {
    id: "byok",
    title: t("BYOK — 내 키 가져오기", "BYOK — bring your own key"),
    summary: t(
      "제공자가 아니라 사용 패턴입니다. 본인이 발급한 무료 티어 키를 앱 설정에 등록해 쓰면, 비용과 한도의 주인이 사용자 본인이 됩니다. 앱이 키를 어떻게 보관하는지가 핵심입니다.",
      "Not a provider but a usage pattern: register your own free-tier key in an app's settings so cost and quota belong to you. How the app stores the key is the critical part.",
    ),
  },
  {
    id: "on-device",
    title: t("로컬·온디바이스 추론", "Local and on-device inference"),
    summary: t(
      "토큰 요금 자체가 없습니다. 대신 내 컴퓨터·브라우저가 모델 파일을 받아 직접 실행하므로, 기기 성능과 모델 라이선스가 한계가 됩니다.",
      "No token billing at all. Your computer or browser downloads model files and runs them, so device capacity and model licenses become the limits.",
    ),
  },
  {
    id: "trial-credit",
    title: t("체험 크레딧·평가 키", "Trial credits and evaluation keys"),
    summary: t(
      "기간이나 용도가 정해진 무료분입니다. 시작 장벽이 낮은 대신 끝나면 유료로 넘어가거나, 처음부터 상업 이용이 금지된 경우가 많습니다.",
      "Free amounts with a fixed period or purpose. Easy to start, but they end into paid plans or prohibit commercial use from the outset.",
    ),
  },
];

export interface FreeAiTokenMethod {
  readonly id: string;
  readonly categoryId: FreeAiTokenCategoryId;
  /** engineering-external-links 레지스트리의 이름. 없으면 내부 경로 링크를 쓴다. */
  readonly linkName?: string;
  readonly internalHref?: string;
  readonly name: LocalizedText;
  /** 상태 배지(예: 무료 티어 없음·종료됨). 없으면 표시하지 않는다. */
  readonly badge?: LocalizedText;
  readonly freeScope: LocalizedText;
  readonly limits: LocalizedText;
  readonly start: LocalizedText;
}

const endedBadge = t("종료·변경됨", "Ended / changed");
const noFreeTierBadge = t("무료 티어 없음", "No free tier");

export const FREE_AI_TOKEN_METHODS: readonly FreeAiTokenMethod[] = [
  // ── 제공자 무료 티어 ─────────────────────────────────────────────
  {
    id: "gemini-free-tier",
    categoryId: "provider-free-tier",
    linkName: "Google AI Studio",
    name: t("Gemini API 무료 티어 (Google AI Studio)", "Gemini API free tier (Google AI Studio)"),
    freeScope: t(
      "결제를 등록하지 않은 프로젝트는 무료 티어로 동작합니다. 모델별 일일 한도 예시(공식 한도 문서): Gemini 2.5 Flash 10 RPM·250 RPD, Flash-Lite 15 RPM·500 RPD, 3.5 Flash 20 RPD — 임베딩은 100 RPM·1,000 RPD까지입니다.",
      "Projects without billing run on the free tier. Example daily limits from the official rate-limit doc: Gemini 2.5 Flash 10 RPM / 250 RPD, Flash-Lite 15 RPM / 500 RPD, 3.5 Flash 20 RPD; embeddings reach 100 RPM / 1,000 RPD.",
    ),
    limits: t(
      "무료 티어에서는 입력과 출력이 Google 제품 개선에 사용될 수 있다고 공식 문서가 명시합니다(유료 티어는 미사용). EEA·스위스·영국 등 일부 지역은 무료 티어가 제공되지 않고, 결제를 켜는 순간 유료 규칙으로 바뀝니다.",
      "Official docs state free-tier input and output may be used to improve Google products (paid tier: not used). The free tier is unavailable in some regions including the EEA, Switzerland and the UK, and enabling billing switches the project to paid rules.",
    ),
    start: t(
      "Google AI Studio에서 API 키를 발급합니다. 카드 등록 없이 시작할 수 있습니다.",
      "Get an API key in Google AI Studio. No card is required to start.",
    ),
  },
  {
    id: "groq-free-tier",
    categoryId: "provider-free-tier",
    linkName: "Groq",
    name: t("Groq 무료 개발자 티어", "Groq free developer tier"),
    freeScope: t(
      "모델별 한도가 공개돼 있습니다(공식 한도 문서). 예: Llama 3.3 70B 30 RPM·1,000 RPD·12K TPM, gpt-oss 120B 30 RPM·1,000 RPD·8K TPM, Llama 4 Scout 30 RPM·1,000 RPD·30K TPM. 조직(계정) 단위로 적용됩니다.",
      "Per-model limits are published in the official rate-limit doc: e.g. Llama 3.3 70B 30 RPM / 1,000 RPD / 12K TPM, gpt-oss 120B 30 RPM / 1,000 RPD / 8K TPM, Llama 4 Scout 30 RPM / 1,000 RPD / 30K TPM. Limits apply per organization.",
    ),
    limits: t(
      "추론 속도에 특화된 하드웨어라 응답이 빠른 대신, 모델 목록과 한도는 수시로 조정됩니다. 한도 상향은 유료(Developer) 플랜 경로입니다.",
      "Inference runs on speed-focused hardware, but the model list and limits change often. Raising limits means moving to the paid Developer plan.",
    ),
    start: t(
      "Groq 콘솔에서 가입 후 API 키를 발급합니다. 카드 등록 없이 시작할 수 있습니다.",
      "Sign up in the Groq console and create an API key. No card is required to start.",
    ),
  },
  {
    id: "cerebras-free-tier",
    categoryId: "provider-free-tier",
    linkName: "Cerebras",
    name: t("Cerebras 무료 티어", "Cerebras free tier"),
    freeScope: t(
      "공식 문서의 무료 티어 표: 분당 30회 요청·60K 토큰, 시간당 900회·100만 토큰, 하루 100만 토큰이 기본값으로 제시됩니다(모델 공통 구간).",
      "The official docs list free-tier defaults of 30 requests / 60K tokens per minute, 900 requests / 1M tokens per hour, and 1M tokens per day across models.",
    ),
    limits: t(
      "실제 적용 한도는 로그인 후 콘솔의 Rate Limits 화면에서 계정 기준으로 확인하는 구조입니다. 문서 표와 계정 화면이 다르면 계정 화면이 우선입니다.",
      "Applied limits are confirmed per account in the console's Rate Limits screen after login. If the docs table and the account screen disagree, the account screen wins.",
    ),
    start: t(
      "Cerebras Cloud에 가입하고 대시보드에서 API 키를 발급합니다.",
      "Sign up for Cerebras Cloud and create an API key in the dashboard.",
    ),
  },
  {
    id: "cloudflare-workers-ai",
    categoryId: "provider-free-tier",
    linkName: "Cloudflare Workers AI",
    name: t("Cloudflare Workers AI 무료 할당", "Cloudflare Workers AI free allocation"),
    freeScope: t(
      "무료 플랜에 하루 10,000 뉴런(Neurons) 무료 할당이 포함됩니다(매일 00:00 UTC 초기화). 뉴런은 모델별 단가 단위라, 예컨대 Llama 3.1 8B급이면 무료분으로 대략 3천 토큰 안팎을 처리하는 계산이 공식 요금 문서의 환산 예시입니다. 모델별 한도 예: Llama 3.1 8B 300 RPM·100K TPM.",
      "The free plan includes 10,000 free Neurons per day (resetting at 00:00 UTC). Neurons are a per-model unit; the official pricing doc's conversion example puts the free amount at roughly 3,000 tokens on a Llama 3.1 8B-class model. Example per-model limit: Llama 3.1 8B at 300 RPM / 100K TPM.",
    ),
    limits: t(
      "무료분의 지연 시간은 유료와 같은 프로덕션 수준이지만, 무료 사용량이 유료 트래픽 뒤로 밀릴 수 있다고 공식 문서가 밝힙니다. 입력·출력은 모델 학습에 쓰이지 않습니다(공식 데이터 문서). 뉴런 단가는 모델마다 달라서 큰 모델은 무료분이 빨리 닳습니다.",
      "Free-tier latency is the same production level as paid, but official docs note free usage may be deprioritized behind paid traffic. Inputs and outputs are not used for training (official data docs). Neuron prices differ per model, so large models drain the free amount quickly.",
    ),
    start: t(
      "Cloudflare 계정(무료 플랜)에서 API 토큰을 발급합니다. 카드 등록 없이 시작할 수 있습니다.",
      "Create an API token on a free-plan Cloudflare account. No card is required to start.",
    ),
  },
  {
    id: "qwen-free-quota",
    categoryId: "provider-free-tier",
    linkName: "Alibaba Model Studio",
    name: t("Qwen 무료 할당량 (Alibaba Model Studio)", "Qwen free quota (Alibaba Model Studio)"),
    freeScope: t(
      "신규 사용자에게 모델별 무료 할당량을 주는 구조이고, 워크스페이스 설정에 'Free Quota Only(무료 할당량만 사용)' 모드가 있어 할당량이 끝나면 과금으로 넘어가지 않고 멈추게 할 수 있습니다(공식 도움말).",
      "New users receive per-model free quotas, and the workspace offers a 'Free Quota Only' mode that stops at exhaustion instead of rolling into billing (official help docs).",
    ),
    limits: t(
      "할당량 크기와 유효 기간은 모델·리전(베이징/국제)마다 다릅니다. 숫자는 공식 무료 할당량 페이지에서 시작 전에 확인하세요.",
      "Quota sizes and validity periods differ by model and region (Beijing / international). Check the official free-quota page for current numbers before you start.",
    ),
    start: t(
      "Alibaba Cloud Model Studio에서 워크스페이스를 만들고 API 키를 발급한 뒤, 무료 할당량만 쓰려면 Free Quota Only를 켭니다.",
      "Create a workspace in Alibaba Cloud Model Studio, issue an API key, and enable Free Quota Only if you must never roll into billing.",
    ),
  },
  {
    id: "zai-flash-free",
    categoryId: "provider-free-tier",
    linkName: "Z.AI",
    name: t("Z.AI 무료 Flash 모델", "Z.AI free Flash models"),
    freeScope: t(
      "가격표에서 단가가 0으로 표기된 GLM Flash 계열 모델을 무료로 호출할 수 있습니다. 툰스튜디오의 BYOK 프리셋도 이 무료 모델만 자동 경로에 허용합니다.",
      "GLM Flash models listed at zero price on the official pricing page can be called for free. ToonStudio's BYOK preset also allowlists only these free models for automatic routes.",
    ),
    limits: t(
      "무료인 것은 Flash 계열 등 지정 모델뿐이고, 상위 모델은 유료입니다. 무료 표기는 가격표 개정에 따라 바뀔 수 있습니다.",
      "Only designated models such as the Flash line are free; higher models are paid. Free listings can change when the pricing page is revised.",
    ),
    start: t(
      "Z.AI 플랫폼에서 가입하고 API 키를 발급합니다.",
      "Sign up on the Z.AI platform and create an API key.",
    ),
  },
  {
    id: "siliconflow-free-models",
    categoryId: "provider-free-tier",
    linkName: "SiliconFlow",
    name: t("SiliconFlow 무료 모델", "SiliconFlow free models"),
    freeScope: t(
      "가격표에서 단가 0으로 표기된 모델을 상시 무료로 호출할 수 있습니다. 신규 가입 크레딧은 지역별로 달라서 국제판 $1, 중국 본토판 ¥14가 공식 문서에 안내돼 있습니다.",
      "Models priced at zero on the pricing page can be called for free on an ongoing basis. Sign-up credits differ by region: $1 on the international site and ¥14 on the China site, per official docs.",
    ),
    limits: t(
      "무료 모델은 속도 하한이 보장되지 않고, 거주지·본인 인증 상태에 따라 국제판 잔액 정책이 달라질 수 있습니다. 크레딧 유효 기간 같은 세부 조건은 가입 화면에서 확인하세요.",
      "Free models carry no minimum-speed guarantee, and international balance rules can vary with residency and verification status. Check details such as credit expiry on the sign-up screen.",
    ),
    start: t(
      "SiliconFlow에 가입하고 API 키를 발급한 뒤, 가격표에서 무료로 표기된 모델을 고릅니다.",
      "Sign up for SiliconFlow, create an API key, and pick models marked free on the pricing page.",
    ),
  },
  {
    id: "mistral-free-ended",
    categoryId: "provider-free-tier",
    linkName: "Mistral",
    name: t("Mistral API", "Mistral API"),
    badge: endedBadge,
    freeScope: t(
      "과거 무료 플랜으로 널리 알려졌지만, 공식 요금 FAQ 기준으로 무료 플랜은 2026-09-15에 종료됐습니다. 이 글을 쓰는 시점에 상시 무료 API 티어는 없습니다.",
      "Widely known for its former free plan, but the official pricing FAQ states the free plan ended on 2026-09-15. There is no standing free API tier at the time of writing.",
    ),
    limits: t(
      "Le Chat(채팅 서비스)의 무료 이용은 API 무료 티어가 아닙니다. 오래된 블로그 글의 'Mistral 무료 API' 설명을 그대로 믿지 마세요.",
      "Free use of Le Chat (the chat product) is not a free API tier. Do not trust older blog posts describing a 'free Mistral API'.",
    ),
    start: t(
      "현재는 유료 워크스페이스 구독 또는 종량제로만 API를 씁니다.",
      "Today the API requires a paid workspace subscription or pay-as-you-go.",
    ),
  },
  {
    id: "deepseek-no-free",
    categoryId: "provider-free-tier",
    linkName: "DeepSeek",
    name: t("DeepSeek API", "DeepSeek API"),
    badge: noFreeTierBadge,
    freeScope: t(
      "상시 무료 티어가 없습니다. 과거 신규 가입자에게 주던 무료 토큰도 현재 공식 요금 문서에서 안내가 사라졌습니다. API는 처음부터 충전식 유료입니다.",
      "There is no standing free tier. The sign-up token grant once offered to new users no longer appears in the official pricing docs. The API is prepaid and paid from the first call.",
    ),
    limits: t(
      "단가가 매우 낮아 '사실상 무료'로 소개되는 경우가 많지만, 무료와 저가는 다릅니다. 예산 통제가 필요하면 충전 상한을 먼저 걸어 두세요.",
      "Prices are low enough that it is often described as 'practically free', but cheap is not free. Set a balance cap first if you need budget control.",
    ),
    start: t(
      "가입 후 잔액을 충전해야 호출할 수 있습니다.",
      "You must top up a balance after sign-up before calling the API.",
    ),
  },

  // ── 무료 모델 라우터·애그리게이터 ────────────────────────────────
  {
    id: "openrouter-free",
    categoryId: "router",
    linkName: "OpenRouter",
    name: t("OpenRouter 무료 모델", "OpenRouter free models"),
    freeScope: t(
      "모델 ID 끝에 ':free'가 붙은 무료 모델과, 무료 모델 중에서 골라 주는 'openrouter/free' 라우터 모델을 쓸 수 있습니다. 한도는 분당 20회, 하루 50회이며 OpenRouter에서 누적 $10 이상 크레딧을 산 적이 있으면 하루 1,000회로 오릅니다(공식 한도 문서).",
      "Free models carry a ':free' suffix, and the 'openrouter/free' router model picks among them. Limits are 20 requests per minute and 50 per day, rising to 1,000 per day once you have purchased at least $10 of credits in total (official limits doc).",
    ),
    limits: t(
      "무료 모델은 여러 사용자가 나눠 쓰는 공용 풀이라 피크 시간에는 429(한도 초과)가 잦습니다. 입력 데이터가 어떻게 처리되는지는 실제 호출되는 하위 제공자마다 다르므로, 민감한 입력이면 데이터 보존 정책이 명시된 제공자만 고르게 설정하세요.",
      "Free models run on shared pools, so 429s are common at peak times. How input data is handled depends on the underlying provider actually called; for sensitive input, restrict routing to providers with an explicit data-retention policy.",
    ),
    start: t(
      "OpenRouter에 가입하고 API 키를 발급합니다. 무료만 쓸 경우 카드 등록은 필요 없습니다.",
      "Sign up for OpenRouter and create an API key. No card is needed if you only use free models.",
    ),
  },

  {
    id: "github-models",
    categoryId: "router",
    linkName: "GitHub Models",
    name: t("GitHub Models (무료 플레이그라운드·API)", "GitHub Models (free playground and API)"),
    freeScope: t(
      "GitHub 계정만 있으면 모델 카탈로그를 플레이그라운드와 API로 무료로 써 볼 수 있습니다. 한도는 Copilot 요금제에 연동됩니다(공식 문서 표: Free 기준 저사양 모델군 15 RPM·하루 150회, 고사양 모델군 10 RPM·하루 50회, 입력 컨텍스트는 8K 수준).",
      "Any GitHub account can try the model catalog in the playground and via API for free. Limits follow your Copilot plan (official table: on Free, low-tier models 15 RPM / 150 per day, high-tier 10 RPM / 50 per day, with roughly 8K input context).",
    ),
    limits: t(
      "공식 위치는 '실험하고 평가하는 용도'이며 프로덕션 워크로드용이 아닙니다. 무료 조건에서는 프롬프트와 출력이 모델 제공자와 공유되고 제품 개선에 쓰일 수 있다고 공식 문서가 적고 있습니다.",
      "Officially positioned for experimenting and evaluating, not production workloads. Official docs state that under free terms, prompts and outputs may be shared with model providers and used to improve products.",
    ),
    start: t(
      "GitHub 계정으로 플레이그라운드에서 바로 실행하거나, 개인 액세스 토큰으로 API를 호출합니다.",
      "Run models directly in the playground with a GitHub account, or call the API with a personal access token.",
    ),
  },
  {
    id: "huggingface-inference",
    categoryId: "router",
    linkName: "Hugging Face",
    name: t("Hugging Face Inference Providers", "Hugging Face Inference Providers"),
    freeScope: t(
      "무료 계정에 매달 $0.10의 제공자 크레딧이 자동으로 붙습니다(공식 요금 문서, 이월 없음). 작아 보여도 소형 모델 실험에는 닿는 금액이고, 자동 라우터가 비용 0으로 표기된 제공자를 골라 줄 때도 있습니다. 서버리스로 되는 작업 종류는 모델마다 다릅니다.",
      "Free accounts automatically receive $0.10 of provider credits each month (official pricing docs, no rollover). Small, but enough to experiment with small models, and the auto router sometimes lands on providers marked zero-cost. Which tasks run serverlessly varies by model.",
    ),
    limits: t(
      "크레딧을 넘기면 종량 과금인데, 무료 플랜에서는 추가 결제가 막혀 있어 유료 플랜이 필요합니다. 호출별 한도 수치는 공식 문서에 공개돼 있지 않습니다. 프롬프트는 HF와 실제 추론 제공자를 거치며, 보존 정책은 제공자 정책을 따릅니다.",
      "Usage beyond the credit is pay-as-you-go, but free plans cannot pay overages — a paid plan is required. Per-request limits are not published in the official docs. Prompts pass through HF and the actual inference provider, whose retention policy applies.",
    ),
    start: t(
      "Hugging Face 계정에서 액세스 토큰을 만들고, 모델 페이지에서 Inference Providers로 바로 호출해 봅니다.",
      "Create an access token on Hugging Face and call models via Inference Providers from the model page.",
    ),
  },

  // ── BYOK ─────────────────────────────────────────────────────────
  {
    id: "byok-pattern",
    categoryId: "byok",
    internalHref: "/settings/ai",
    name: t("BYOK — 내 무료 티어 키를 앱에 등록해 쓰기", "BYOK — register your own free-tier key in the app"),
    freeScope: t(
      "위 표의 무료 티어 키를 본인이 발급해 앱 설정에 등록하면, 앱 운영자가 아니라 사용자 본인의 무료 한도 안에서 AI를 씁니다. 여러 제공자 키를 함께 등록해 두면 한쪽 한도가 끝나도 다른 쪽으로 이어 갈 수 있습니다.",
      "Register a free-tier key from the table above in an app's settings and the AI runs inside your own free allowance rather than the app operator's. Registering several providers lets work continue when one allowance runs out.",
    ),
    limits: t(
      "키 보관 방식이 전부입니다. 평문으로 저장하는 앱, 브라우저 메모리에만 두는 앱, 암호화 저장소를 쓰는 앱이 다르니 설정 화면의 설명을 확인하세요. 키를 채팅·코드·공개 저장소에 붙여 넣는 것은 금물입니다.",
      "Key storage is everything. Apps differ — plaintext storage, browser-memory only, or an encrypted vault — so read the settings screen. Never paste a key into chat, code, or a public repository.",
    ),
    start: t(
      "제공자 콘솔에서 키 발급 → 앱의 API 키 설정(툰스튜디오는 설정 > AI 통합 허브)에서 등록 → 무료 모델만 고르는 정책으로 시작합니다.",
      "Create a key in the provider console → register it in the app's API key settings (in ToonStudio, Settings > AI hub) → start with a free-models-only policy.",
    ),
  },

  // ── 로컬·온디바이스 ──────────────────────────────────────────────
  {
    id: "ollama-local",
    categoryId: "on-device",
    linkName: "Ollama",
    name: t("Ollama (내 컴퓨터에서 실행)", "Ollama (run on your own computer)"),
    freeScope: t(
      "오픈소스 로컬 실행 도구입니다. 모델을 내 컴퓨터로 내려받아 실행하므로 API 토큰 요금이 없고, 입력이 밖으로 나가지 않습니다.",
      "An open-source local runner. Models download to your computer and run there, so there is no API token bill and input never leaves the machine.",
    ),
    limits: t(
      "대신 내 GPU·CPU와 메모리가 한계입니다. 큰 모델은 느리거나 못 돌리고, 모델 가중치 자체의 라이선스는 모델마다 따로 확인해야 합니다.",
      "Your GPU/CPU and memory become the limit instead. Large models may be slow or impossible, and each model weight carries its own license to check.",
    ),
    start: t(
      "공식 사이트에서 설치 파일을 받고, 원하는 모델을 pull 명령으로 내려받으면 바로 로컬 API가 열립니다.",
      "Install from the official site, pull a model, and a local API is ready immediately.",
    ),
  },
  {
    id: "lm-studio-local",
    categoryId: "on-device",
    linkName: "LM Studio",
    name: t("LM Studio (GUI 로컬 실행)", "LM Studio (local GUI runner)"),
    freeScope: t(
      "명령줄이 부담스러운 사람을 위한 그래픽 로컬 실행 도구입니다. 공식 사이트는 개인 사용뿐 아니라 업무(상업) 사용도 무료라고 안내합니다(2026-10-08 확인).",
      "A graphical local runner for people who avoid the command line. The official site states it is free for personal and work (commercial) use (verified 2026-10-08).",
    ),
    limits: t(
      "도구가 무료라는 것과 모델이 무료라는 것은 다릅니다. 내려받는 모델 가중치의 라이선스는 별도입니다.",
      "A free tool does not make every model free. Downloaded model weights carry separate licenses.",
    ),
    start: t(
      "공식 사이트에서 앱을 설치하고, 앱 안에서 모델을 검색해 내려받습니다.",
      "Install the app from the official site and download models from inside the app.",
    ),
  },
  {
    id: "browser-ondevice",
    categoryId: "on-device",
    linkName: "Transformers.js",
    name: t("브라우저 온디바이스 추론 (Transformers.js·ONNX Runtime Web)", "Browser on-device inference (Transformers.js · ONNX Runtime Web)"),
    freeScope: t(
      "모델 파일을 브라우저로 내려받아 기기 안에서 추론합니다. 번역·분류·임베딩 같은 정해진 작업에 강하고, 서버 토큰 비용이 0입니다. 툰스튜디오의 한글 검색 번역과 클라이언트 AI 폴백이 이 방식을 씁니다.",
      "Model files download into the browser and inference runs on the device. Strong for fixed tasks such as translation, classification and embeddings, at zero server-token cost. ToonStudio's Korean search translation and client AI fallback use this approach.",
    ),
    limits: t(
      "모델 파일이 수십~수백 MB라 첫 준비에 다운로드가 필요하고, 기기 성능에 따라 느릴 수 있습니다. 대형 생성 모델의 품질은 클라우드와 아직 차이가 큽니다.",
      "Model files run from tens to hundreds of MB, so first use needs a download, and speed depends on the device. Large generative quality still trails the cloud by a wide margin.",
    ),
    start: t(
      "사용자는 설치할 것이 없습니다. 지원하는 웹앱이 기능을 켜면 브라우저가 알아서 모델을 준비합니다.",
      "Nothing to install. When a supporting web app enables the feature, the browser prepares the model itself.",
    ),
  },

  // ── 체험 크레딧·평가 키 ──────────────────────────────────────────
  {
    id: "sambanova-trial",
    categoryId: "trial-credit",
    linkName: "SambaNova",
    name: t("SambaNova Cloud", "SambaNova Cloud"),
    badge: endedBadge,
    freeScope: t(
      "과거 Free Tier는 종료됐고, 공식 공지 기준으로 신규 가입 시 $20 체험 크레딧으로 대체됐습니다. 상시 무료 티어로는 계산하지 마세요.",
      "The former Free Tier has ended; official notices replace it with a $20 trial credit for new sign-ups. Do not budget it as a standing free tier.",
    ),
    limits: t(
      "체험 크레딧은 소진되면 끝입니다. 툰스튜디오에도 예전에 만든 무료 프리셋이 남아 있지만, 실제 무료 여부는 가입 시점의 공식 안내가 우선입니다.",
      "Trial credit ends when spent. ToonStudio still carries an older free preset for it, but the official notice at sign-up time decides what is actually free.",
    ),
    start: t(
      "SambaNova Cloud에 가입하면 체험 크레딧이 지급됩니다.",
      "Sign up for SambaNova Cloud to receive the trial credit.",
    ),
  },
  {
    id: "nvidia-nim-trial",
    categoryId: "trial-credit",
    linkName: "NVIDIA NIM",
    name: t("NVIDIA build (NIM API 카탈로그)", "NVIDIA build (NIM API catalog)"),
    freeScope: t(
      "개발자 프로그램에 가입하면 NIM 마이크로서비스 모델들을 API로 시험할 수 있는 무료 크레딧이 붙습니다. 공식 FAQ는 '초기 개발·테스트·연구 목적은 무료'라고 안내하고, 크레딧 규모는 계정별로 다르게 표시됩니다(개발자 포럼 안내 기준 1,000회로 시작해 최대 5,000회 수준).",
      "Joining the developer program attaches free credits for trying NIM microservice models over API. The official FAQ describes initial development, testing and research as free, and credit amounts are shown per account (developer-forum guidance: starting at 1,000 requests, up to about 5,000).",
    ),
    limits: t(
      "이용 조건상 개발·테스트 전용이라 프로덕션 서비스에 그대로 쓸 수 없습니다. 크레딧을 다 쓰면 NVIDIA AI Enterprise 라이선스 경로로 안내됩니다.",
      "Terms restrict use to development and testing, so it cannot power a production service as-is. Exhausted credits lead to the NVIDIA AI Enterprise licensing path.",
    ),
    start: t(
      "build.nvidia.com에서 NGC/개발자 계정으로 가입하고 모델 페이지에서 API 키를 발급합니다.",
      "Sign up with an NGC/developer account on build.nvidia.com and generate an API key from a model page.",
    ),
  },
  {
    id: "cohere-trial",
    categoryId: "trial-credit",
    linkName: "Cohere",
    name: t("Cohere Trial 키", "Cohere Trial key"),
    freeScope: t(
      "가입하면 자동 발급되는 Trial(평가) 키로 월 1,000회까지 API를 호출할 수 있습니다(공식 한도 문서). 모델을 비교·검증하는 용도로는 충분합니다.",
      "A Trial key issued automatically at sign-up allows up to 1,000 API calls per month (official rate-limit docs) — enough to compare and evaluate models.",
    ),
    limits: t(
      "평가 전용이라 상업 서비스·프로덕션 사용이 금지됩니다. 실제 서비스에 붙이려면 유료 키로 바꿔야 합니다.",
      "Evaluation only: commercial and production use are prohibited. Moving to a real service requires a paid key.",
    ),
    start: t(
      "Cohere 대시보드에 가입하면 Trial 키가 바로 발급됩니다.",
      "Sign up for the Cohere dashboard and a Trial key is issued immediately.",
    ),
  },
];

/** 툰스튜디오가 실제로 쓰는 무료 AI 경로. 코드·운영 문서 경로를 근거로 함께 적는다. */
export interface ToonStudioFreeAiRoute {
  readonly id: string;
  readonly title: LocalizedText;
  readonly body: LocalizedText;
  readonly evidence: readonly string[];
}

export const TOONSTUDIO_FREE_AI_ROUTES: readonly ToonStudioFreeAiRoute[] = [
  {
    id: "server-free-pool",
    title: t("서버 공용 무료 풀", "Shared server free pool"),
    body: t(
      "키를 붙이지 않은 사용자도 텍스트 AI를 쓸 수 있게, 서버가 무료 티어만으로 꾸린 공급자 순서를 둡니다: Gemini 무료 티어 → Qwen 무료 할당량 → Groq → SambaNova → Z.AI Flash → Mistral 무료 모드 → Cloudflare Workers AI → OpenRouter 무료 라우터 → SiliconFlow 무료 모델. 공급자마다 '무료 전용' 승인이 켜져 있고 결제 수단이 없을 때만 풀이 동작하며, 한도가 끝나면 유료로 자동 전환하지 않고 멈춥니다. 운영 환경의 키와 승인은 배포 설정 단계라, 코드가 있다는 것과 운영에서 켜져 있다는 것은 구분해서 읽어 주세요.",
      "So users without a key can still use text AI, the server keeps a free-only provider order: Gemini free tier → Qwen free quota → Groq → SambaNova → Z.AI Flash → Mistral free mode → Cloudflare Workers AI → OpenRouter free router → SiliconFlow free models. Each provider needs an explicit free-only approval and no billing instrument; when allowances end the pool stops instead of auto-converting to paid. Production keys and approvals are deployment configuration, so read 'implemented in code' and 'enabled in production' as different claims.",
    ),
    evidence: [
      "apps/api/src/modules/studio-ai/studio-ai-provider.ts",
      "docs/operations/free-ai-runtime.md",
    ],
  },
  {
    id: "byok-presets",
    title: t("BYOK 무료 프리셋 10종과 통합 키 허브", "Ten BYOK free presets and one key hub"),
    body: t(
      "본인 키를 쓰는 사용자를 위해 무료 전용 프리셋 10종(OpenRouter·Groq·Gemini·Qwen·SambaNova·Z.AI·Mistral·SiliconFlow·Hugging Face·Cerebras)을 미리 만들어 뒀습니다. 키 등록은 설정 > AI 한곳에서만 하고, 다른 화면은 비밀값 없는 상태 카드만 보여 줍니다. 비용 정책은 'OpenRouter 무료 전용', '공급자 무료 티어', '사용자 부담 BYOK' 세 가지로 나뉘고, 유료 경로는 사용자가 명시적으로 동의하기 전에는 자동 경로에 섞이지 않습니다.",
      "For users with their own keys, ten free-only presets (OpenRouter, Groq, Gemini, Qwen, SambaNova, Z.AI, Mistral, SiliconFlow, Hugging Face, Cerebras) are ready-made. Keys are registered in exactly one place — Settings > AI — while other screens show secret-free status cards. Cost policies split into 'OpenRouter free only', 'provider free tier' and 'user-funded BYOK', and paid routes never join automatic routing before explicit consent.",
    ),
    evidence: [
      "apps/web/src/shared/ai/free-ai-policy.ts",
      "docs/operations/free-ai-runtime.md",
    ],
  },
  {
    id: "browser-safety-budget",
    title: t("브라우저 안전 예산", "Browser safety budget"),
    body: t(
      "무료 경로는 공용 풀이라 남용 한 번에 모두의 한도가 사라질 수 있습니다. 그래서 브라우저 쪽 무료 호출에는 하루 25회 시도, 하루 64,000토큰 예약 상한, 요청당 출력 1,024토큰 같은 보수적인 상한을 코드로 걸어 둡니다. 원장에는 프롬프트가 아니라 횟수와 토큰 수만 남깁니다.",
      "Free routes are shared pools, so one abuse incident can burn everyone's allowance. Browser-side free calls therefore carry conservative code-enforced caps: 25 attempts per day, a 64,000-token daily reservation ceiling, and 1,024 output tokens per request. The ledger stores counts and token totals only, never prompts.",
    ),
    evidence: ["apps/web/src/shared/ai/free-ai-runtime-budget.ts"],
  },
  {
    id: "ondevice-fallback",
    title: t("클라우드가 안 될 때는 기기에서 — ONNX 폴백", "When the cloud is out: on-device ONNX fallback"),
    body: t(
      "키가 없거나 무료 풀이 막히면, 가능한 작업은 브라우저 안 ONNX 추론으로 내립니다. 리서치 데스크의 한글 질의 번역은 Transformers.js 모델이 기기에서 처리합니다. 모델 파일(약 123MB)은 배포할 때 함께 배치하는 전제라, 배치 전 환경에서는 사전식 변환 경로가 대신 동작합니다 — 되는 척하지 않고 상태가 그렇게 표시됩니다.",
      "With no key or a blocked free pool, capable tasks drop to ONNX inference inside the browser. The research desk's Korean query translation runs on-device with a Transformers.js model. Its files (about 123MB) ship alongside a deployment; before they are placed, a dictionary-based converter carries the flow — and the status says so instead of pretending.",
    ),
    evidence: [
      "apps/web/src/domains/creator/studio-onnx-inference-provider.ts",
      "apps/web/src/shared/ai/free-ai-policy.ts",
    ],
  },
];

export const FREE_AI_TOKEN_CAUTIONS: readonly LocalizedText[] = [
  t(
    "무료 티어의 데이터 정책부터 보세요. Gemini 무료 티어처럼 입력·출력이 제공자 제품 개선에 쓰일 수 있는 구간이 있습니다. 비공개 원고와 개인정보는 무료 티어로 보내지 않는 것이 안전합니다.",
    "Read the free tier's data policy first. Some free tiers, such as Gemini's, may use input and output to improve the provider's products. Keep unpublished manuscripts and personal data out of free tiers.",
  ),
  t(
    "한도는 예고 없이 바뀝니다. Mistral 무료 플랜 종료(2026-09-15)와 SambaNova 무료 티어 종료가 실제 사례입니다. 이 표는 2026-10-08에 공식 페이지로 확인한 값이고, 오래된 블로그 글보다 공식 요금 페이지가 항상 우선입니다.",
    "Limits change without much notice — Mistral's free plan ending (2026-09-15) and SambaNova's free-tier shutdown are real cases. This table was verified against official pages on 2026-10-08, and official pricing pages always outrank older blog posts.",
  ),
  t(
    "공용 무료 풀은 혼잡합니다. OpenRouter ':free' 같은 경로는 피크 시간에 429가 잦으니, 실패를 숨기지 말고 재시도와 대체 경로를 설계에 넣으세요. 툰스튜디오는 추론이 시작되기 전 확정 거절일 때만 다음 경로로 넘어가고, 시간 초과·5xx처럼 결과가 모호한 실패는 자동 재전송하지 않습니다.",
    "Shared free pools are congested. Routes like OpenRouter ':free' return frequent 429s at peak times, so design retries and alternate routes instead of hiding failures. ToonStudio advances to the next route only on a definitive pre-inference rejection, and never auto-replays ambiguous failures such as timeouts or 5xx.",
  ),
  t(
    "키 보안은 기본입니다. API 키를 코드·채팅·스크린샷에 남기지 말고, 제공자 콘솔에서 키별 한도와 결제 차단을 함께 설정하세요. 무료 티어 키라도 유출되면 남의 사용량이 내 한도를 태웁니다.",
    "Key hygiene is basic: never leave API keys in code, chat or screenshots, and set per-key limits and billing blocks in the provider console. Even a free-tier key can burn your allowance in someone else's hands.",
  ),
  t(
    "상업 이용 조건을 따로 확인하세요. Cohere Trial처럼 평가 전용 키는 상업 서비스에 쓸 수 없고, 로컬 모델도 가중치 라이선스가 모델마다 다릅니다. '무료로 호출 가능'과 '제품에 써도 됨'은 다른 문장입니다.",
    "Check commercial terms separately. Evaluation keys such as Cohere Trial cannot power a commercial service, and local model weights carry per-model licenses. 'Free to call' and 'allowed in your product' are different sentences.",
  ),
];
