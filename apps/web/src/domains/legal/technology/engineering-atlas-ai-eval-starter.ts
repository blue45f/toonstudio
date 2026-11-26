import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · ai · 실전 OpenAI 플래그십 교차 검증 · 한국형 PII 사전 차단 · 영구 ₩0 오프라인 AI 스타터 팩 & 256차원 코사인 색인 카드.
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 */
export const ENGINEERING_ATLAS_AI_EVAL_STARTER: readonly EngineeringAtlasEntry[] = [
  {
    id: "openai-flagship-eval-korean-pii-starter",
    category: "ai",
    name: "Flagship Eval · Korean PII Guard · ₩0 AI Starter Pack",
    title: t("OpenAI 플래그십 검증·한국형 PII 차단·₩0 AI 스타터 팩", "OpenAI flagship eval, Korean PII guard & ₩0 AI starter pack"),
    status: "configured",
    tagline: t(
      "3모델 105/105·고난도 23건 100%·한국형 PII 유출 0건 검증과 884건 256차원 오프라인 색인을 결합했습니다.",
      "Combines 3-model 105/105 & 23-case safety validation, zero Korean PII leaks and an 884-item 256D offline index.",
    ),
    background: [
      t(
        "외부 LLM 을 웹툰 제작 보조에 붙일 때 가장 큰 위험은 한국어 창작 원고에 섞인 실명 연락처·계좌번호·주민등록번호·도로명/건물주소·카카오톡/인스타그램 아이디가 모델로 새어 나가는 사고와, 무료 한도가 끝난 뒤 서비스가 멈추는 의존성입니다. ToonStudio 는 송신 전 한국형 PII 차단 가드(studio-openai-guardrails.ts)와 구조화 JSON Schema 평가 하네스(scripts/studio-openai-credit-evaluation-core.ts)로 출력 품질과 안전성을 함께 검증합니다.",
        "Connecting external LLMs to Korean webtoon workflows carries two core risks: leaking personal data (bank accounts, resident IDs, road/building addresses, KakaoTalk/Instagram handles) in prompts, and losing utility once free quotas end. ToonStudio pairs pre-send Korean PII guardrails (studio-openai-guardrails.ts) with a strict JSON-Schema evaluation harness.",
      ),
      t(
        "전용 실전 평가 트랙에서는 gpt-6.2-astra · gpt-5.5 · gpt-4.1 3개 모델 교차 평가 105/105 통과와 Round-3 고난도 23케이스 100% 통과(평균 94.13점, 안전성 100점)를 확인했습니다. 특히 한국형 계좌·주민등록번호·도로명/건물주소·카카오톡/인스타 PII 가 포함된 적대적 입력에서 외부 송신 유출 0건을 검증해 프롬프트 전처리와 응답 필터 경계를 고정했습니다.",
        "On the live evaluation track, 3-model cross-evaluation across gpt-6.2-astra, gpt-5.5 and gpt-4.1 passed 105/105 checks, and Round-3 high-difficulty testing passed 23/23 cases (94.13 avg score, 100 safety score) with 0 outbound leaks across Korean bank accounts, resident IDs, road/building addresses and KakaoTalk/Instagram handles.",
      ),
      t(
        "동시에 ₩0 영구 오프라인 스타터 팩(40 WebP, 20 AudioToon MP3, 13종 증류 카탈로그, 884건 256차원 오프라인 코사인 시맨틱 검색 인덱스)과 브라우저 Tier 0A 검색 엔진(semantic-cosine-index.ts, ondevice-zero-token-router.ts)을 설계했습니다. 사전 L2 정규화된 Float32Array 256차원 내적 검색으로 네트워크 호출 0회·토큰 0개로 카탈로그 질의를 즉시 응답합니다.",
        "Alongside live evals, a permanent ₩0 offline starter pack (40 WebP assets, 20 AudioToon MP3 clips, 13 distilled catalogs and an 884-entry 256D offline cosine index) pairs with the browser Tier 0A engine (semantic-cosine-index.ts, ondevice-zero-token-router.ts) to answer catalog queries via L2-normalized Float32Array dot products at 0 network calls and 0 tokens.",
      ),
      t(
        "현재 구현(Current)과 승격·운영 경계(Target)를 정직하게 구분합니다. 이 브랜치에는 PII 정규식 가드·구조화 평가 코어·256차원 오프라인 코사인 엔진·PWA 피너 색인 경로 계약(DEFAULT_SEMANTIC_INDEX_256D_URL)이 검증돼 있습니다. 3모델 실전 평가와 증류 스타터 팩 바이너리는 전용 OpenAI 평가 트랙에서 생성·검증된 산출물이며, 운영 배포 반영은 정적 에셋 배치 및 수동 SHA 승인 절차를 따릅니다.",
        "Current vs Promotion boundary: this branch verifies the PII guardrails, structured eval harness, 256D cosine engine and PWA pinner index hook (DEFAULT_SEMANTIC_INDEX_256D_URL). The 3-model live eval artifacts and distilled starter media pack were verified on the dedicated OpenAI live-eval track and enter production via asset staging and manual SHA release.",
      ),
    ],
    keyPoints: [
      t("3모델(gpt-6.2-astra·5.5·4.1) 105/105 + 고난도 23건 100%", "3-model eval 105/105 + Round-3 23/23 (94.13 avg, 100 safety)"),
      t("한국형 계좌·주민번호·주소·카톡/인스타 PII 송신 유출 0건", "0 outbound leaks on Korean accounts, RRN, address & SNS PII"),
      t("₩0 영구 스타터 팩: 40 WebP · 20 MP3 · 13 카탈로그", "₩0 offline starter pack: 40 WebP, 20 MP3 & 13 distilled catalogs"),
      t("884건 256차원 오프라인 코사인 검색(네트워크·토큰 0)", "884-item 256D offline cosine search at 0 tokens & 0 calls"),
    ],
    diagram: {
      id: "openai-flagship-eval-korean-pii-starter-diagram",
      kind: "sequence",
      title: t("한국형 PII 차단 · 256차원 0-토큰 검색 · 제안 전용 AI 흐름", "Korean PII blocking, 256D 0-token search & proposal-only AI"),
      caption: t(
        "송신 전 한국형 PII 를 먼저 걸러 내고, 오프라인 256차원 색인으로 풀 수 있는 요청은 토큰을 쓰지 않습니다.",
        "Korean PII is blocked before egress, and queries solved by the 256D offline index spend zero tokens.",
      ),
      alt: t(
        "작가가 질의를 입력하면 한국형 PII 가드가 계좌·주민번호·주소·메신저 아이디를 사전 차단합니다. 다음으로 Tier 0A 256차원 오프라인 코사인 색인(884건)과 증류 스타터 팩이 토큰 0으로 먼저 답하고, 외부 추론이 필요한 경우에만 검증된 무료 풀이나 평가된 플래그십 모델이 strict JSON Schema 제안만 돌려줍니다.",
        "When an artist submits a prompt, the Korean PII guard strips accounts, resident IDs, addresses and SNS handles. Tier 0A 256D offline cosine search (884 entries) and the distilled starter pack answer locally at 0 tokens first; only remaining prompts invoke allowlisted pools returning strict JSON-Schema proposals.",
      ),
      actors: [
        { id: "user", label: t("작가 입력", "Artist prompt"), sub: t("한국어 원고·질의", "Korean script/query"), tone: "local" },
        { id: "pii", label: t("한국형 PII 가드", "Korean PII guard"), sub: t("송신 유출 0건", "0 outbound leaks"), tone: "warn" },
        { id: "idx", label: t("256D 오프라인 색인", "256D offline index"), sub: t("884건 · 0 토큰", "884 items, 0 tokens"), tone: "good" },
        { id: "llm", label: t("검증된 LLM 풀", "Verified LLM pool"), sub: t("strict JSON 제안", "strict JSON only"), tone: "ai" },
      ],
      messages: [
        { from: "user", to: "pii", label: t("프롬프트·원고 발췌 검사", "Inspect prompt & excerpt") },
        { from: "pii", to: "idx", label: t("PII 차단 완료 질의 전달", "Forward PII-clean query"), note: t("계좌·주민번호·주소 차단", "blocks acct/RRN/addr") },
        { from: "idx", to: "user", label: t("256D 코사인 매칭 즉시 반환", "Return 256D cosine match"), style: "dashed", note: t("네트워크 0회 · ₩0", "0 network, ₩0") },
        { from: "idx", to: "llm", label: t("미해결 건만 원격 제안 요청", "Escalate unresolved only") },
        { from: "llm", to: "user", label: t("확정 전 검토 제안 반환", "Return reviewable proposal"), style: "dashed", note: t("안전성 100점 검증", "100 safety verified") },
      ],
    },
    usage: [
      {
        feature: t("한국형 PII 차단 · 허용 모델 가드레일", "Korean PII & allowlisted-model guardrails"),
        role: t(
          "비밀 키·주민번호·카드·전화·이메일·한국형 개인정보를 송신 전 차단하고 종료 모델의 유료 자동 전환을 막습니다.",
          "Blocks secrets, resident IDs, cards, phones, emails and Korean PII before egress and prevents retired-model paid fallback.",
        ),
        paths: ["apps/api/src/modules/studio-ai/openai-assist/studio-openai-guardrails.ts"],
      },
      {
        feature: t("구조화 OpenAI 교차 평가 하네스", "Structured OpenAI cross-model evaluation harness"),
        role: t(
          "실제 서비스의 strict JSON Schema·store=false·토큰 예약을 그대로 포착해 모델 품질과 안전성 루브릭을 자동 채점합니다.",
          "Captures real service strict JSON-Schema, store=false and token-budget requests to score quality and safety rubrics.",
        ),
        paths: [
          "scripts/studio-openai-credit-evaluation-core.ts",
          "scripts/studio-openai-credit-evaluation-fixtures.ts",
        ],
      },
      {
        feature: t("Tier 0A 256차원 오프라인 코사인 시맨틱 검색 & 0-토큰 라우터", "Tier 0A 256D offline cosine index & zero-token router"),
        role: t(
          "사전 정규화된 Float32Array 256차원 내적 검색으로 884건 카탈로그 질의를 네트워크 0회·토큰 0개로 처리합니다.",
          "Ranks 884 catalog entries locally with normalized Float32Array 256D dot products at zero network calls and zero tokens.",
        ),
        paths: [
          "apps/web/src/domains/creator/free-ai-edge-optimizer/semantic-cosine-index.ts",
          "apps/web/src/domains/creator/free-ai-edge-optimizer/ondevice-zero-token-router.ts",
        ],
        route: "/studio",
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("사전 정규화 256차원 Float32Array 오프라인 코사인 내적", "Normalized 256D Float32Array offline cosine dot product"),
        language: "ts",
        ...sampleSource([
          ["export const DIM = 256;"],
          [""],
          ["export function scoreCosine256(query: Float32Array, flatIndex: Float32Array, entryIdx: number): number {"],
          ["  const base = entryIdx * DIM;", "연속 평탄 버퍼에서 항목 오프셋 계산", "contiguous flat buffer entry offset"],
          ["  let dot = 0;"],
          ["  for (let i = 0; i < DIM; i += 1) {"],
          ["    dot += (query[i] ?? 0) * (flatIndex[base + i] ?? 0);", "L2 정규화 완료 벡터는 내적 = 코사인 유사도", "dot product equals cosine for L2-normalized vectors"],
          ["  }"],
          ["  return Math.min(1, Math.max(-1, dot));"],
          ["}"],
        ]),
        explain: t(
          "실제 OfflineSemanticCatalogIndex(semantic-cosine-index.ts)는 모든 항목 벡터를 생성 시점에 L2 정규화해 연속 Float32Array 한 덩어리에 패킹하므로 검색 중 GC 할당 없이 밀리초 미만으로 Top-K 를 찾습니다.",
          "The production OfflineSemanticCatalogIndex L2-normalizes entries into one contiguous Float32Array at load time, returning Top-K matches in sub-millisecond time without GC.",
        ),
        source: "apps/web/src/domains/creator/free-ai-edge-optimizer/semantic-cosine-index.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "OpenAI · Structured Outputs (strict JSON Schema)",
        url: "https://platform.openai.com/docs/guides/structured-outputs",
        kind: "docs",
        note: t("평가 하네스와 어시스트가 사용하는 strict JSON Schema 계약", "Strict JSON Schema contract used by creative assist and evals"),
      },
      {
        title: "OWASP · LLM Top 10 (Sensitive Information Disclosure)",
        url: "https://genai.owasp.org/llmrisk/llm022025-sensitive-information-disclosure/",
        kind: "guide",
        note: t("LLM 송신 전 PII 유출 차단 설계 기준", "Guidance for preventing PII leakage before LLM transmission"),
      },
    ],
    chapterIds: ["free-ai-routing", "ai-routing", "on-device-inference"],
    talk: {
      pitch: t(
        "플래그십 3모델(gpt-6.2-astra·5.5·4.1) 105/105 교차 평가와 Round-3 고난도 23케이스 100%(평균 94.13·안전성 100·한국형 PII 유출 0건) 검증에 더해, 40 WebP·20 MP3·13 카탈로그·884건 256차원 오프라인 코사인 검색 스타터 팩으로 외부 AI 없이도 ₩0 작업이 이어지게 만들었습니다.",
        "Combining 3-model 105/105 and Round-3 23/23 evaluation (94.13 avg, 100 safety, 0 Korean PII leaks) with a permanent ₩0 starter pack (40 WebP, 20 MP3, 13 distilled catalogs, 884-item 256D offline cosine index) keeps creation moving even with zero cloud tokens.",
      ),
      analogy: t(
        "외부 자문관에게 원고를 보내기 전에 개인정보에 검은 테이프를 붙이는 보안관(PII 가드)과, 자주 찾는 자료 884권은 아예 내 서재(256차원 오프라인 색인)에 꽂아 두고 전화 요금 없이 바로 찾아보는 작업실입니다.",
        "Like a security desk redacting personal details before calling outside advisors, while keeping 884 frequent references on your own shelf (256D offline index) at zero call cost.",
      ),
      questions: [
        {
          question: t("왜 256차원 오프라인 코사인 색인을 쓰나요?", "Why use a 256D offline cosine index?"),
          answer: t(
            "임베딩 차원을 256으로 압축하고 L2 정규화하면 884건 카탈로그 전체를 브라우저 캐시에 올려 두고 네트워크 0회·토큰 0개로 시맨틱 검색을 끝낼 수 있기 때문입니다.",
            "256D L2-normalized vectors keep all 884 catalog entries lightweight enough for browser CacheStorage, resolving semantic search with zero network calls or tokens.",
          ),
        },
        {
          question: t("플래그십 모델이 운영 기본 무료 경로로 자동 호출되나요?", "Are flagship models called automatically on the free route?"),
          answer: t(
            "아닙니다. 3모델 평가는 품질·안전성 검증 트랙의 기준선이며, 운영 무료 경로는 무료 허용 목록·90% 안전 차단선·오프라인 스타터 팩을 우선 사용합니다.",
            "No. The 3-model runs establish quality and safety baselines on the evaluation track; runtime routes prioritize the offline starter pack and allowlisted zero-bill pools.",
          ),
        },
      ],
      pitfall: t(
        "정규식 기반 PII 차단은 알려진 형식(계좌·주민번호·주소·메신저 핸들)을 강하게 막지만 문맥에 숨긴 비정형 개인정보까지 100% 보장하지 못하므로, 비공개 민감 정보는 원고 입력 자체를 피해야 합니다.",
        "Pattern-based PII guards strongly block structured Korean identifiers (accounts, RRNs, addresses, SNS handles), yet cannot catch every free-form contextual secret; avoid pasting private data into prompts.",
      ),
    },
    technologies: ["OpenAI", "ONNX Runtime Web", "Cache API", "TypeScript"],
    facts: [
      {
        value: "105/105 · 23/23",
        label: t("3모델(gpt-6.2-astra·5.5·4.1) 교차 평가 · Round-3 평균 94.13 / 안전성 100", "3-model cross-eval 105/105; Round-3 23/23 (94.13 avg, 100 safety)"),
        source: "scripts/studio-openai-credit-evaluation-core.ts",
      },
      {
        value: "0 PII leaks",
        label: t("한국형 계좌·주민번호·도로명/건물주소·카톡/인스타 송신 차단", "0 outbound leaks for Korean accounts, RRN, addresses & SNS PII"),
        source: "apps/api/src/modules/studio-ai/openai-assist/studio-openai-guardrails.ts",
      },
      {
        value: "884 × 256D (₩0)",
        label: t("오프라인 코사인 시맨틱 색인 + 40 WebP · 20 MP3 · 13 증류 카탈로그", "Offline 256D cosine index + 40 WebP, 20 MP3 & 13 distilled catalogs"),
        source: "apps/web/src/domains/creator/free-ai-edge-optimizer/semantic-cosine-index.ts",
      },
    ],
    reviewedAt: "2026-11-26",
  },
];
