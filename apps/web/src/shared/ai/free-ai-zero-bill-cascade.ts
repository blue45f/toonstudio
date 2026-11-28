import { buildLocalDialogueLayout, buildLocalScriptCuts } from "@toonstudio/contracts/studio-assist-local-script";
import { LocalizationGlossaryCheckOutputSchema, OpenAiIdeaRemixOutputSchema, ScrollPacingAuditorOutputSchema } from "@toonstudio/contracts/studio-openai-assist-result";
import { redactCreatorSensitiveText } from "@toonstudio/contracts/studio-pii-redactor";
import { buildLocalColorMood } from "@toonstudio/studio-project-model/character-art-style";

import { withCsrfProtection } from "@/shared/lib/csrf";
import { useApp } from "@/shared/lib/store";

import {
  MANAGED_FREE_DAILY_REQUEST_LIMIT,
  MANAGED_FREE_DAILY_RESERVED_TOKEN_LIMIT,
} from "./free-ai-runtime-budget";

export const FREE_AI_14_MODE_IDS = [
  "idea-remix",
  "script-to-cuts",
  "dialogue-polish",
  "export-preflight-coach",
  "character-bible-forge",
  "continuity-plot-audit",
  "bg3d-camera-blocking",
  "color-mood-director",
  "sfx-onomatopoeia-lab",
  "photoshop-fx-recipe",
  "scroll-pacing-auditor",
  "thumbnail-hook-optimizer",
  "localization-glossary-check",
  "mcp-workflow-macro",
] as const;

export type FreeAiZeroBillModeId = (typeof FREE_AI_14_MODE_IDS)[number];

export type FreeAiModeCategoryKo =
  | "기획·스토리"
  | "연출·3D·채색"
  | "마감·효과·현지화"
  | "MCP 자동화";

export interface FreeAiModeSpec {
  readonly id: FreeAiZeroBillModeId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly categoryKo: FreeAiModeCategoryKo;
  readonly benchmarkLabel: string;
  readonly samplePromptKo: string;
}

export const FREE_AI_14_ASSIST_MODES: readonly FreeAiModeSpec[] = Object.freeze([
  {
    id: "idea-remix",
    labelKo: "5가지 발상 리믹스",
    descriptionKo: "한 줄 아이디어를 반전·공감·디테일·4컷 전개·빈틈 시선으로 확장합니다.",
    categoryKo: "기획·스토리",
    benchmarkLabel: "플롯르 AI · Canva",
    samplePromptKo: "비 오는 날 편의점 처마 밑에서 전학 온 동창에게 노란 우산을 건네는 첫 만남",
  },
  {
    id: "script-to-cuts",
    labelKo: "대본 → 컷 분할",
    descriptionKo: "대본을 세로 스크롤 웹툰 컷 번호·구도·행동·대사·여백으로 나눕니다.",
    categoryKo: "기획·스토리",
    benchmarkLabel: "튜닝 AI · 플롯르 AI",
    samplePromptKo: "주인공이 옥상 난간에서 잃어버린 열쇠를 발견하고 뒤에서 인기척을 느끼는 4컷 장면",
  },
  {
    id: "dialogue-polish",
    labelKo: "말풍선 대사 다듬기",
    descriptionKo: "긴 대사를 모바일 말풍선 한 칸에 잘 읽히는 3가지 톤으로 압축합니다.",
    categoryKo: "기획·스토리",
    benchmarkLabel: "튜닝 AI · Figma AI",
    samplePromptKo: "내가 오늘 왜 늦었냐면 집 앞에서 갑자기 비가 쏟아져서 우산을 다시 챙기느라 버스를 놓쳤어",
  },
  {
    id: "export-preflight-coach",
    labelKo: "마감·소개글 점검",
    descriptionKo: "출고 직전 말풍선 밀도·여백·Rights BOM과 회차 한 줄 소개글을 점검합니다.",
    categoryKo: "마감·효과·현지화",
    benchmarkLabel: "Canva · 편집 검수",
    samplePromptKo: "1화 마감 직전 원고. 42컷 구성, 마지막 컷에 반전 편지가 등장하고 무료 폰트 사용",
  },
  {
    id: "character-bible-forge",
    labelKo: "캐릭터 바이블 생성",
    descriptionKo: "말투·외형 배색·핵심 동기·금기 대사·작화 고정 앵커를 한 번에 정리합니다.",
    categoryKo: "기획·스토리",
    benchmarkLabel: "플롯르 AI · 튜닝 AI",
    samplePromptKo: "차분하지만 결정적 순간에 과감한 신입 수사관 여주인공, 왼쪽 손목 낡은 시계가 트레이드마크",
  },
  {
    id: "continuity-plot-audit",
    labelKo: "설정 오류·개연성 검수",
    descriptionKo: "시간선·소품·복장·말투 충돌과 복선 누락을 찾아 수정안을 제안합니다.",
    categoryKo: "기획·스토리",
    benchmarkLabel: "플롯르 AI · 편집부",
    samplePromptKo: "1컷은 저녁 노을인데 3컷 창밖이 한낮이고, 주인공이 왼손에 들던 우산이 4컷에서 사라짐",
  },
  {
    id: "bg3d-camera-blocking",
    labelKo: "3D 배경·카메라 블로킹",
    descriptionKo: "렌즈 mm·FOV·카메라 좌표·3점 조명·소품 배치를 3D 배경 JSON으로 컴파일합니다.",
    categoryKo: "연출·3D·채색",
    benchmarkLabel: "CSP AI · Blender",
    samplePromptKo: "골든아워 서울 옥상, 철조망 너머로 두 인물이 마주 선 약로우 앵글 장면",
  },
  {
    id: "color-mood-director",
    labelKo: "감정별 배색·조명 디렉터",
    descriptionKo: "장면 감정에 맞는 OKLCH 팔레트·키/림 라이트·말풍선 대비를 설계합니다.",
    categoryKo: "연출·3D·채색",
    benchmarkLabel: "Adobe Firefly · 페인터",
    samplePromptKo: "긴장감과 쓸쓸함이 공존하는 새벽 지하철 승강장 이별 장면",
  },
  {
    id: "sfx-onomatopoeia-lab",
    labelKo: "한·일·영 효과음 랩",
    descriptionKo: "장면 에너지에 맞는 한국어·일본어·영어 효과음과 타이포·배치 팁을 제안합니다.",
    categoryKo: "마감·효과·현지화",
    benchmarkLabel: "튜닝 AI · 글로벌 식자",
    samplePromptKo: "유리문이 세게 닫히고 잠시 정적 뒤에 심장이 빠르게 뛰는 순간",
  },
  {
    id: "photoshop-fx-recipe",
    labelKo: "포토샵 FX·ACR 보정 레시피",
    descriptionKo: "비파괴 레이어 스타일과 Camera Raw 보정 슬라이더 수치를 추천합니다.",
    categoryKo: "연출·3D·채색",
    benchmarkLabel: "Adobe Firefly · Krita AI",
    samplePromptKo: "네온 간판 아래 서 있는 인물을 배경에서 또렷하게 띄우는 야간 림라이트 마감",
  },
  {
    id: "scroll-pacing-auditor",
    labelKo: "세로 스크롤 호흡·엔딩 분석",
    descriptionKo: "모바일 컷 간격(px), 시선 체류, 회차 엔딩 클리프행어 점수를 진단합니다.",
    categoryKo: "마감·효과·현지화",
    benchmarkLabel: "웹툰 페인터 · Canva",
    samplePromptKo: "초반 설명 컷 6개가 연속되고 후반 반전 직전 컷 간격이 좁게 붙어 있는 1화 콘티",
  },
  {
    id: "thumbnail-hook-optimizer",
    labelKo: "썸네일·제목 카피 A/B",
    descriptionKo: "회차 클릭률을 높이는 제목 3안과 1:1·16:9 안전 크롭 썸네일 구도를 제안합니다.",
    categoryKo: "마감·효과·현지화",
    benchmarkLabel: "Canva · Figma AI",
    samplePromptKo: "기억을 잃은 피아니스트가 10년 전 녹음 테이프를 발견하는 미스터리 드라마 1화",
  },
  {
    id: "localization-glossary-check",
    labelKo: "다국어 번역 용어집·문화 검수",
    descriptionKo: "고유명사·호칭 통일(한/영/일)과 말풍선 폭 확장 주의사항을 검수합니다.",
    categoryKo: "마감·효과·현지화",
    benchmarkLabel: "글로벌 현지화 · Figma",
    samplePromptKo: "헌터 길드 '청야(靑夜)', 선배 호칭, 고유 스킬 '잔향 베기' 영문·일문 통일 검수",
  },
  {
    id: "mcp-workflow-macro",
    labelKo: "자연어 → MCP 툴 매크로",
    descriptionKo: "자연어 제작 요청을 ToonStudio 32종 MCP 툴 실행 체인으로 자동 컴파일합니다.",
    categoryKo: "MCP 자동화",
    benchmarkLabel: "ComfyUI · Figma AI",
    samplePromptKo: "800×1280 1화 캔버스를 만들고 3D 옥상 카메라 배치 후 외곽광선 FX와 출고 점검까지 실행",
  },
]);

export interface FreeAiProviderQuotaSnapshot {
  readonly id: string;
  readonly labelKo: string;
  readonly priority: number;
  readonly tier: "cloud-free" | "local-fallback";
  readonly configured: boolean;
  readonly model: string;
  readonly modelAllowed: boolean;
  readonly modelBlockReason: string | null;
  readonly blocked: boolean;
  readonly blockReason: string | null;
  readonly blockedUntilUtc: string | null;
  readonly dailyRequestCap: number;
  readonly safeRequestCutoff: number;
  readonly usedRequests: number;
  readonly remainingSafeRequests: number;
  readonly dailyTokenCap: number;
  readonly safeTokenCutoff: number;
  readonly usedTokens: number;
  readonly remainingSafeTokens: number;
  readonly utilizationPct: number;
  readonly costUsdGuaranteed: "$0.00";
}

export interface FreeAiQuotaStatusSnapshot {
  readonly providerBilledUsd: null;
  /** 무료 경로에서 창작자에게 부과하는 금액. 공급자 계정의 실제 청구액은 별도 확인한다. */
  readonly guaranteedZeroCostUsd: 0;
  readonly guaranteedZeroCostLabel: "$0.00";
  readonly guaranteedZeroCostKrwLabel: "₩0";
  readonly paidBillingBlocked: true;
  readonly failClosedOnCutoff: true;
  readonly safetyCutoffRatio: number;
  readonly utcDay: string;
  readonly nextResetUtcIso: string;
  readonly offlineFallback?: boolean;
  readonly summary: {
    readonly totalProviders: number;
    readonly configuredCloudCount: number;
    readonly activeCloudCount: number;
    readonly blockedCloudCount: number;
    readonly localFallbackReady: true;
    readonly activePriorityOrder: readonly string[];
  };
  readonly providers: readonly FreeAiProviderQuotaSnapshot[];
}

export interface FreeAiSafetyGaugeSummary {
  readonly status: "safe" | "caution" | "cutoff-local";
  readonly utilizationPct: number;
  readonly activeCloudCount: number;
  readonly configuredCloudCount: number;
  readonly badgeTextKo: string;
  readonly detailTextKo: string;
}

export interface FreeAiZeroBillAssistInput {
  readonly mode: FreeAiZeroBillModeId;
  readonly inputText: string;
  readonly projectTitle?: string;
  readonly genreOrTone?: string;
  readonly targetPlatform?: "vertical-webtoon" | "cuttoon" | "page-comic" | "general";
}

export interface FreeAiZeroBillAssistResponse {
  readonly providerBilledUsd?: null;
  readonly ok: true;
  readonly providerId: string;
  readonly providerTier: "cloud-free" | "local-fallback";
  readonly model: string;
  readonly mode: FreeAiZeroBillModeId;
  /** ToonStudio 창작자 이용료. 공급자의 실측 청구액은 포함하지 않는다. */
  readonly costGuaranteedZeroUsd: 0;
  readonly paidBillingBlocked: true;
  readonly piiRedactedCount: number;
  readonly headlineKo: string;
  readonly bulletsKo: readonly string[];
  readonly rawData: Record<string, unknown>;
  readonly fallbackNoticeKo: string | null;
}

export const maskCreatorInputBeforeAiSend = redactCreatorSensitiveText;

function maskAssistInput(input: FreeAiZeroBillAssistInput) {
  const text = redactCreatorSensitiveText(input.inputText.trim());
  const title = redactCreatorSensitiveText(input.projectTitle?.trim() ?? "");
  const tone = redactCreatorSensitiveText(input.genreOrTone?.trim() ?? "");
  return {
    inputText: text.sanitizedText,
    projectTitle: title.sanitizedText,
    genreOrTone: tone.sanitizedText,
    redactedCount: text.redactedCount + title.redactedCount + tone.redactedCount,
  };
}

export function createOfflineZeroBillQuotaSnapshot(
  nowMs = Date.now(),
): FreeAiQuotaStatusSnapshot {
  const date = new Date(nowMs);
  const utcDay = date.toISOString().slice(0, 10);
  const nextResetUtcIso = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1),
  ).toISOString();

  return {
    providerBilledUsd: null,
    guaranteedZeroCostUsd: 0,
    guaranteedZeroCostLabel: "$0.00",
    guaranteedZeroCostKrwLabel: "₩0",
    paidBillingBlocked: true,
    failClosedOnCutoff: true,
    safetyCutoffRatio: 0.9,
    utcDay,
    nextResetUtcIso,
    offlineFallback: true,
    summary: {
      totalProviders: 2,
      configuredCloudCount: 0,
      activeCloudCount: 0,
      blockedCloudCount: 0,
      localFallbackReady: true,
      activePriorityOrder: ["local-zero-cost-fallback"],
    },
    providers: [
      {
        id: "browser-managed-free-guard",
        labelKo: "브라우저 무료 안전 한도",
        priority: 1,
        tier: "cloud-free",
        configured: false,
        model: "free-tier-only",
        modelAllowed: true,
        modelBlockReason: null,
        blocked: false,
        blockReason: null,
        blockedUntilUtc: null,
        dailyRequestCap: MANAGED_FREE_DAILY_REQUEST_LIMIT,
        safeRequestCutoff: Math.floor(MANAGED_FREE_DAILY_REQUEST_LIMIT * 0.9),
        usedRequests: 0,
        remainingSafeRequests: Math.floor(MANAGED_FREE_DAILY_REQUEST_LIMIT * 0.9),
        dailyTokenCap: MANAGED_FREE_DAILY_RESERVED_TOKEN_LIMIT,
        safeTokenCutoff: Math.floor(MANAGED_FREE_DAILY_RESERVED_TOKEN_LIMIT * 0.9),
        usedTokens: 0,
        remainingSafeTokens: Math.floor(MANAGED_FREE_DAILY_RESERVED_TOKEN_LIMIT * 0.9),
        utilizationPct: 0,
        costUsdGuaranteed: "$0.00",
      },
      {
        id: "local-zero-cost-fallback",
        labelKo: "로컬 무과금 폴백 (결정론적 코치)",
        priority: 9,
        tier: "local-fallback",
        configured: true,
        model: "toonstudio-deterministic-coach-v2",
        modelAllowed: true,
        modelBlockReason: null,
        blocked: false,
        blockReason: null,
        blockedUntilUtc: null,
        dailyRequestCap: 100_000,
        safeRequestCutoff: 100_000,
        usedRequests: 0,
        remainingSafeRequests: 100_000,
        dailyTokenCap: 100_000_000,
        safeTokenCutoff: 100_000_000,
        usedTokens: 0,
        remainingSafeTokens: 100_000_000,
        utilizationPct: 0,
        costUsdGuaranteed: "$0.00",
      },
    ],
  };
}

export function computeZeroBillSafetyGauge(
  snapshot: FreeAiQuotaStatusSnapshot,
): FreeAiSafetyGaugeSummary {
  const configuredCloud = snapshot.providers.filter(
    (item) => item.tier === "cloud-free" && item.configured,
  );
  const activeCloud = configuredCloud.filter((item) => !item.blocked);

  if (configuredCloud.length === 0) {
    return {
      status: "safe",
      utilizationPct: 0,
      activeCloudCount: 0,
      configuredCloudCount: 0,
      badgeTextKo: "창작자 이용료 ₩0 · 무료 경로만 사용",
      detailTextKo: "로컬 코치를 사용할 수 있습니다.",
    };
  }

  const avgUtil = Math.round(
    configuredCloud.reduce((sum, item) => sum + item.utilizationPct, 0) / configuredCloud.length,
  );

  if (activeCloud.length === 0) {
    const cutoffPct = Math.round(snapshot.safetyCutoffRatio * 100);
    let reasonKo = "사용 가능한 무료 클라우드가 없습니다.";
    if (configuredCloud.every((item) => item.blockReason === "free_billing_unconfirmed")) {
      reasonKo = "클라우드 계정의 무료 자격과 추가 과금 차단 설정을 확인해야 합니다.";
    } else if (configuredCloud.every((item) => item.blockReason === "safety_cutoff_90pct")) {
      reasonKo = `클라우드 무료 사용량이 안전 한도(${cutoffPct}%)에 도달했습니다.`;
    }
    return {
      status: "cutoff-local",
      utilizationPct: avgUtil,
      activeCloudCount: 0,
      configuredCloudCount: configuredCloud.length,
      badgeTextKo: "창작자 이용료 ₩0 · 무료 경로만 사용",
      detailTextKo: `${reasonKo} 로컬 코치로 계속 작업할 수 있습니다.`,
    };
  }

  return {
    status: avgUtil >= 75 ? "caution" : "safe",
    utilizationPct: Math.min(100, Math.max(0, avgUtil)),
    activeCloudCount: activeCloud.length,
    configuredCloudCount: configuredCloud.length,
    badgeTextKo: "창작자 이용료 ₩0 · 무료 경로만 사용",
    detailTextKo: `활성 무료 클라우드 ${activeCloud.length}/${configuredCloud.length}개 · 서버의 일일 할당량 추정치입니다. 실제 청구액은 공급자 계정에서 확인하세요.`,
  };
}

export async function fetchFreeAiQuotaStatus(options: {
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
} = {}): Promise<FreeAiQuotaStatusSnapshot> {
  const endpoint = `${(options.baseUrl ?? "/api/studio/ai").replace(/\/$/u, "")}/free-quota-status`;
  const fetchFn = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) return createOfflineZeroBillQuotaSnapshot();

  try {
    const response = await fetchFn(endpoint, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
      signal: options.signal,
    });
    if (!response.ok) return createOfflineZeroBillQuotaSnapshot();
    const json = (await response.json()) as Partial<FreeAiQuotaStatusSnapshot>;
    if (!Array.isArray(json.providers) || json.paidBillingBlocked !== true) {
      return createOfflineZeroBillQuotaSnapshot();
    }
    return {
      providerBilledUsd: null,
      guaranteedZeroCostUsd: 0,
      guaranteedZeroCostLabel: "$0.00",
      guaranteedZeroCostKrwLabel: "₩0",
      paidBillingBlocked: true,
      failClosedOnCutoff: true,
      safetyCutoffRatio: typeof json.safetyCutoffRatio === "number" ? json.safetyCutoffRatio : 0.9,
      utcDay: typeof json.utcDay === "string" ? json.utcDay : new Date().toISOString().slice(0, 10),
      nextResetUtcIso:
        typeof json.nextResetUtcIso === "string"
          ? json.nextResetUtcIso
          : createOfflineZeroBillQuotaSnapshot().nextResetUtcIso,
      summary: json.summary ?? createOfflineZeroBillQuotaSnapshot().summary,
      providers: json.providers,
    };
  } catch {
    return createOfflineZeroBillQuotaSnapshot();
  }
}

const localReviewHeadlines: Partial<Record<FreeAiZeroBillModeId, string>> = {
  "continuity-plot-audit": "연속성 점검 예시 · 앞뒤 컷의 시간대와 소품 위치를 직접 비교해 보세요.",
  "scroll-pacing-auditor": "스크롤 호흡 예시 · 모바일 미리보기에서 컷 사이 여백과 엔딩 호흡을 확인하세요.",
};

function summarizeServerResult(mode: FreeAiZeroBillModeId, data: Record<string, unknown>, isCloudReview: boolean) {
  if (mode === "idea-remix") {
    const parsed = OpenAiIdeaRemixOutputSchema.safeParse(data);
    if (parsed.success) {
      return {
        headlineKo: parsed.data.summary,
        bulletsKo: parsed.data.angles.map(({ lensLabelKo, headline, pitch, firstCutHint }) =>
          `[${lensLabelKo}] ${headline} — ${pitch} · 첫 컷: ${firstCutHint}`),
      };
    }
  }
  if (mode === "scroll-pacing-auditor") {
    const parsed = ScrollPacingAuditorOutputSchema.safeParse(data);
    if (parsed.success) {
      const { rhythmVerdict, averageGapPx, beatPacing, cliffhangerScore, cliffhangerTip } = parsed.data;
      return {
        headlineKo: rhythmVerdict,
        bulletsKo: [
          `구간 평균 ${averageGapPx}px`,
          ...beatPacing.map(({ section, recommendedGapPx, readerRetentionNote }) =>
            `${section} · ${recommendedGapPx}px — ${readerRetentionNote}`),
          isCloudReview ? `엔딩 몰입도 ${cliffhangerScore}/100 · ${cliffhangerTip}` : cliffhangerTip,
        ],
      };
    }
  }
  if (mode !== "localization-glossary-check") return summarizeStructuredData(mode, data);

  const parsed = LocalizationGlossaryCheckOutputSchema.safeParse(data);
  if (!parsed.success) return null;
  const { targetLocales, glossary, culturalNotes } = parsed.data;
  return {
    headlineKo: `다국어 번역 용어집 · 대상 언어 ${targetLocales.join(", ")}`,
    bulletsKo: [
      ...glossary.map(({ termKo, en, ja, ruleNote }) =>
        `${termKo} · EN: ${en} · JA: ${ja} — ${ruleNote}`),
      ...culturalNotes.map(({ severity, topic, adaptationTip }) =>
        `[${severity === "warn" ? "주의" : "참고"}] ${topic} — ${adaptationTip}`),
    ],
  };
}

function summarizeStructuredData(
  mode: FreeAiZeroBillModeId,
  data: Record<string, unknown>,
): { readonly headlineKo: string; readonly bulletsKo: readonly string[] } {
  const modeMeta = FREE_AI_14_ASSIST_MODES.find((item) => item.id === mode);
  const fallbackHeadline = `${modeMeta?.labelKo ?? mode} 결과`;
  const headlineCandidate = [
    data.summary,
    data.episodeGoal,
    data.readabilityNote,
    data.readinessSummary,
    data.sceneSummary,
    data.moodSummary,
    data.rhythmVerdict,
    data.hookDiagnosis,
    data.lookNameKo,
    data.characterName,
    data.macroTitle,
    data.sceneEnergy,
  ].find((value): value is string => typeof value === "string" && value.trim().length > 0);

  const sourceLimits: Partial<Record<FreeAiZeroBillModeId, number>> = {
    "script-to-cuts": 20, "dialogue-polish": 12, "color-mood-director": 8,
  };
  const sourceLimit = sourceLimits[mode];
  const bullets: string[] = [];
  const firstToneByDialogue = new Map<string, string>();
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      for (const entry of value.slice(0, sourceLimit ?? 4)) {
        if (typeof entry === "string") {
          bullets.push(entry);
        } else if (entry && typeof entry === "object") {
          const rec = entry as Record<string, unknown>;
          if (mode === "script-to-cuts" && key === "cuts" && typeof rec.visualAction === "string") {
            const speech = typeof rec.dialogue === "string" && rec.dialogue.trim() && !rec.visualAction.includes(rec.dialogue)
              ? ` — ${rec.dialogue}` : "";
            bullets.push(`${rec.cutNumber}컷 · ${rec.visualAction}${speech}`);
            continue;
          }
          if (mode === "dialogue-polish" && key === "balloons" && typeof rec.line === "string") {
            const lines = [rec.line, rec.subBubble].filter((line): line is string => typeof line === "string" && Boolean(line));
            const label = typeof rec.toneLabel === "string" ? `[${rec.toneLabel}] ` : "";
            const reason = typeof rec.reason === "string" && rec.reason.trim() ? ` — ${rec.reason}` : "";
            const spoken = lines.join(" ");
            const comparable = spoken.normalize("NFC").trim().replace(/\s+/gu, " ");
            const firstTone = firstToneByDialogue.get(comparable);
            if (comparable && firstTone === undefined) {
              firstToneByDialogue.set(comparable, typeof rec.toneLabel === "string" && rec.toneLabel.trim() ? rec.toneLabel : "앞선");
            }
            const repeated = firstTone ? ` · ${firstTone} 안과 대사 문구 동일` : "";
            bullets.push(`${label}${spoken}${reason}${repeated}`);
            continue;
          }
          if (mode === "color-mood-director" && key === "palette" && typeof rec.oklch === "string") {
            const tip = typeof rec.usageTip === "string" && rec.usageTip.trim() ? ` — ${rec.usageTip}` : "";
            bullets.push(`[${rec.role}] ${rec.nameKo} · ${rec.oklch}${tip}`);
            continue;
          }
          const primary =
            rec.headline ??
            rec.visualAction ??
            rec.line ??
            rec.detail ??
            rec.conflictDetail ??
            rec.nameKo ??
            rec.ko ??
            rec.effect ??
            rec.section ??
            rec.title ??
            rec.termKo ??
            rec.toolName ??
            rec.target;
          const secondary =
            rec.pitch ??
            rec.dialogue ??
            rec.reason ??
            rec.fixSuggestion ??
            rec.usageTip ??
            rec.en ??
            rec.paramsSummary ??
            rec.readerRetentionNote ??
            rec.subCopy ??
            rec.ruleNote ??
            rec.reasonKo ??
            rec.dynamic;
          if (typeof primary === "string" && primary.trim()) {
            bullets.push(
              typeof secondary === "string" && secondary.trim()
                ? `${primary} — ${secondary}`
                : primary,
            );
          }
        }
      }
    } else if (
      typeof value === "string" &&
      value !== headlineCandidate &&
      value.trim().length > 0 &&
      (sourceLimit !== undefined || bullets.length < 4) &&
      key !== "emotionLabel"
    ) {
      bullets.push(value);
    }
  }

  return {
    headlineKo: headlineCandidate ?? fallbackHeadline,
    bulletsKo: bullets.length > 0 ? (sourceLimit === undefined ? bullets.slice(0, 6) : bullets) : [fallbackHeadline],
  };
}

export function buildLocalZeroCostAssistResult(
  input: FreeAiZeroBillAssistInput,
  fallbackNoticeKo: string | null = null,
): FreeAiZeroBillAssistResponse {
  const masked = maskAssistInput(input);
  const modeSpec = FREE_AI_14_ASSIST_MODES.find((item) => item.id === input.mode);
  const snippet = masked.inputText.slice(0, 64) || "장면 초안";
  const title = masked.projectTitle || "현재 원고";

  type TemplateMode = Exclude<FreeAiZeroBillModeId, "script-to-cuts" | "dialogue-polish" | "color-mood-director">;
  const bulletsByMode: Record<TemplateMode, readonly string[]> = {
    "idea-remix": [
      `[통념 뒤집기] "${snippet}"에서 조력자의 숨은 동기를 먼저 암시하세요.`,
      "[현실 공감 훅] 첫 컷 상단에 짧은 독백과 220px 여백을 배치해 이탈을 막으세요.",
      "[4컷 전개] 상황 제시 → 이상 징후 → 표정 반응 → 다음 화 질문 순으로 압축하세요.",
    ],
    "export-preflight-coach": [
      "[말풍선] 모바일 800px 폭 기준 2~3줄 이내, 최소 16px 폰트를 유지하세요.",
      "[여백] 클라이맥스 직전 컷 간격 320px 이상 확보를 권장합니다.",
      "[Rights BOM] 3D 배경·폰트·브러시 상업 라이선스 누락 여부를 점검하세요.",
    ],
    "character-bible-forge": [
      `[말투] '${title}' 주연은 평소 간결한 구어체, 위기 시 단정형 어조를 유지하세요.`,
      "[고정 앵커] 좌우 비대칭 소품·헤어 실루엣을 모든 컷의 일관성 기준으로 고정하세요.",
      "[금기 대사] 감정을 길게 스스로 해설하는 설명투 대사를 피하세요.",
    ],
    "continuity-plot-audit": [
      "[시간선] 실내/실외 전환 컷에서 조명 방향과 시간대 표시를 일치시키세요.",
      "[소품 연속] 손에 쥔 소품의 좌우 위치가 컷 전환에서 뒤바뀌지 않도록 체크하세요.",
    ],
    "bg3d-camera-blocking": [
      "[카메라] 35mm(FOV 54.4°), 위치 [2.4, 1.45, 4.2] → 타깃 [0, 1.35, 0] 약로우 구도",
      "[조명] 골든아워 키 라이트 + 45도 림라이트, 캐릭터 발바닥 Z=0/Y=0 접지 확인",
    ],
    "sfx-onomatopoeia-lab": [
      "탁—! / タンッ！ / SNAP! — 동작선 끝점에 12도 기울기 굵은 고딕 배치",
      "두근… / ドキッ… / BA-DUMP… — 클로즈업 하단 여백에 자간 넓은 명조 배치",
    ],
    "photoshop-fx-recipe": [
      "[레이어 FX] Outer Glow(screen, 38%, 18px) + Gradient Overlay(soft-light, 24%)",
      "[Camera Raw] Exposure +0.15 · Contrast +12 · Clarity +14 · Dehaze +8 · Grain 9%",
    ],
    "scroll-pacing-auditor": [
      "[여백 예시] 같은 두 컷 사이의 간격을 좁히고 넓혀, 대사 뒤에 어떤 호흡이 어울리는지 비교하세요.",
      "[엔딩 훅] 마지막 컷 직전 420px 낙하 여백 후 클로즈업 1컷으로 마무리하세요.",
    ],
    "thumbnail-hook-optimizer": [
      `[A안] ${title}: 그날 아무도 말하지 않은 비밀 (호기심 질문형)`,
      "[썸네일] 주인공 눈빛 클로즈업(55%) + 1:1/16:9 중앙 70% 안전 크롭 유지",
    ],
    "localization-glossary-check": [
      `[용어 통일] '${title}' 영문 Title Case·일문 가타카나 표기를 전 회차 고정하세요.`,
      "[말풍선 폭] 영문 번역 시 폭이 25~35% 넓어지므로 여유 패딩을 확보하세요.",
    ],
    "mcp-workflow-macro": [
      "1. studio.canvas.create → 800×1280 웹툰 캔버스 초기화",
      "2. studio.bg3d.compose_scene → 35mm 골든아워 3D 카메라 블로킹",
      "3. studio.photoshop.apply_layer_fx → 비파괴 림라이트 적용",
      "4. studio.export.preflight_check → Rights BOM 및 규격 최종 점검",
    ],
  };

  let structuredData: Record<string, unknown> = {};
  let bulletsKo: readonly string[];
  let headlineKo: string;
  if (input.mode === "script-to-cuts" || input.mode === "dialogue-polish" || input.mode === "color-mood-director") {
    const source = masked.inputText.slice(0, 6_000);
    if (input.mode === "script-to-cuts") structuredData = buildLocalScriptCuts(source, title.slice(0, 120));
    else if (input.mode === "dialogue-polish") structuredData = buildLocalDialogueLayout(source);
    else structuredData = buildLocalColorMood(source);
    ({ bulletsKo, headlineKo } = summarizeStructuredData(input.mode, structuredData));
  } else {
    bulletsKo = bulletsByMode[input.mode];
    headlineKo = localReviewHeadlines[input.mode]
      ?? `[로컬 무과금 코치 · ₩0] ${modeSpec?.labelKo ?? input.mode} 초안이 준비되었어요.`;
  }

  return {
    ok: true,
    providerId: "local-zero-cost-fallback",
    providerTier: "local-fallback",
    model: "toonstudio-deterministic-coach-v2",
    mode: input.mode,
    providerBilledUsd: null,
    costGuaranteedZeroUsd: 0,
    paidBillingBlocked: true,
    piiRedactedCount: masked.redactedCount,
    headlineKo,
    bulletsKo,
    rawData: {
      ...structuredData,
      mode: input.mode,
      title,
      summary: headlineKo,
      recommendations: bulletsKo,
      costUsdGuaranteed: "$0.00",
    },
    fallbackNoticeKo,
  };
}

export async function runFreeAiZeroBillAssist(
  input: FreeAiZeroBillAssistInput,
  options: {
    readonly baseUrl?: string;
    readonly fetchImpl?: typeof fetch;
    readonly signal?: AbortSignal;
    readonly sessionToken?: string | null;
  } = {},
): Promise<FreeAiZeroBillAssistResponse> {
  const masked = maskAssistInput(input);
  if (masked.inputText.length < 2) {
    return buildLocalZeroCostAssistResult(
      { ...input, inputText: "장면 초안" },
      "두 글자 이상 입력하면 더 구체적인 ₩0 무료 AI 제안을 받을 수 있어요.",
    );
  }

  const endpoint = `${(options.baseUrl ?? "/api/studio/ai").replace(/\/$/u, "")}/creative-assist`;
  const fetchFn = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) {
    return buildLocalZeroCostAssistResult(
      input,
      "오프라인 환경이라 로컬 무과금 코치(₩0)로 바로 처리했어요.",
    );
  }

  const sessionToken =
    options.sessionToken?.trim() || useApp.getState().sessionToken?.trim() || null;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (sessionToken) headers["x-user-id"] = sessionToken;

    const response = await fetchFn(
      endpoint,
      withCsrfProtection({
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          mode: input.mode,
          inputText: masked.inputText.slice(0, 6_000),
          ...(masked.projectTitle ? { projectTitle: masked.projectTitle.slice(0, 120) } : {}),
          ...(masked.genreOrTone ? { genreOrTone: masked.genreOrTone.slice(0, 80) } : {}),
          ...(input.targetPlatform ? { targetPlatform: input.targetPlatform } : {}),
          allowZeroBillCascade: true,
        }),
        signal: options.signal,
      }),
    );

    if (!response.ok) {
      const failClosedReason =
        response.status === 402 || response.status === 429
          ? "클라우드 무료 한도 보호(₩0 차단)가 작동해 유료 전환 없이 로컬 무과금 코치로 안전하게 전환했어요."
          : "서버 무료 풀에 일시 연결되지 않아 로컬 무과금 코치(₩0)로 바로 처리했어요.";
      return buildLocalZeroCostAssistResult(
        input,
        failClosedReason,
      );
    }

    const payload = (await response.json()) as {
      provider?: string;
      providerTier?: "cloud-free" | "local-fallback";
      model?: string;
      privacy?: { piiRedactedCount?: number };
      result?: { mode?: FreeAiZeroBillModeId; data?: Record<string, unknown> };
    };

    const data = payload.result?.data;
    const isCloudReview = payload.providerTier === "cloud-free" && payload.provider !== "local-zero-cost-fallback";
    const summary = data && typeof data === "object" ? summarizeServerResult(input.mode, data, isCloudReview) : null;
    if (!data || !summary) {
      return buildLocalZeroCostAssistResult(
        input,
        "응답 형식을 확인할 수 없어 로컬 무과금 코치(₩0)로 안전하게 전환했어요.",
      );
    }

    return {
      ok: true,
      providerId: payload.provider ?? "local-zero-cost-fallback",
      providerTier: payload.providerTier ?? "local-fallback",
      model: payload.model ?? "toonstudio-deterministic-coach-v2",
      mode: input.mode,
      providerBilledUsd: null,
      costGuaranteedZeroUsd: 0,
      paidBillingBlocked: true,
      piiRedactedCount: masked.redactedCount + (payload.privacy?.piiRedactedCount ?? 0),
      headlineKo: payload.provider === "local-zero-cost-fallback"
        ? localReviewHeadlines[input.mode] ?? summary.headlineKo
        : summary.headlineKo,
      bulletsKo: summary.bulletsKo,
      rawData: data,
      fallbackNoticeKo:
        payload.providerTier === "local-fallback"
          ? "서버의 로컬 코치가 제안을 만들었습니다."
          : null,
    };
  } catch {
    return buildLocalZeroCostAssistResult(
      input,
      "네트워크 연결이 없어 유료 전환 없이 로컬 무과금 코치(₩0)로 즉시 처리했어요.",
    );
  }
}
