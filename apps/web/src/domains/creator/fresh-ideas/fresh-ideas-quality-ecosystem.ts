/**
 * Quality Gates, Safety Guardrails & Mode C Ecosystem Chaining Engine (REQ-071 ~ REQ-100).
 */

import type { TargetChannelId } from "./fresh-ideas-contracts";
import {
  expandLensToChannelDraft,
  type ExpandedChannelDraftV2,
} from "./fresh-ideas-channels-localization";
import {
  computeHeadlineOverlapRatio,
  type FreshIdeaLensCardV2,
} from "./fresh-ideas-lenses-engine";

export interface QualitySafetyViolation {
  readonly code:
    | "UNSLOP_EMOJI"
    | "BANNED_CLICHE"
    | "UNSLOP_EXCLAMATION"
    | "VAGUE_PLACEHOLDER"
    | "FABRICATED_STORY"
    | "LOW_ORTHOGONALITY"
    | "DROPPED_URL"
    | "REGULATED_DOMAIN_UNSAFE"
    | "GENERIC_HEADLINE";
  readonly detailKo: string;
}

export interface QualitySafetyAuditReport {
  readonly passed: boolean;
  readonly score100: number;
  readonly maxPairwiseOverlap: number;
  readonly violations: readonly QualitySafetyViolation[];
  readonly deidentifiedPreviewKo: string;
  readonly unconnectedFallbackGuideKo: string;
}

export interface OsmuThreeAssetPackage {
  readonly longFormNewsletter: ExpandedChannelDraftV2;
  readonly linkedInFeedCut: ExpandedChannelDraftV2;
  readonly shortFormThreadsOrShorts: ExpandedChannelDraftV2;
}

export interface HybridAngleFusionResult {
  readonly combinedLabelKo: string;
  readonly top40HookFrameKo: string;
  readonly bottom60ProofResolutionKo: string;
  readonly mergedDraftKo: string;
}

export interface IdeaBankSpreadsheetRow {
  readonly dateIso: string;
  readonly sourceTitleAndUrl: string;
  readonly lensId: string;
  readonly headlineKo: string;
  readonly targetPersonaAndChannel: string;
  readonly effortTagKo: string;
  readonly draftStatus: "Seed" | "Drafted" | "Published";
}

export interface SerializedSeriesEpisode {
  readonly partNumber: number;
  readonly lensId: FreshIdeaLensCardV2["id"];
  readonly episodeTitleKo: string;
  readonly cliffhangerBridgeKo: string;
}

export interface ModeCEcosystemBundle {
  readonly voiceChainingHintKo: string;
  readonly stressTestAdvisorPromptKo: string;
  readonly meetingAgendaBriefKo: string;
  readonly osmuPackage: OsmuThreeAssetPackage;
  readonly hybridFusion: HybridAngleFusionResult;
  readonly googleDocExportPayload: {
    readonly titleKo: string;
    readonly mainDraftKo: string;
    readonly appendixRemainingSeedsKo: readonly string[];
  };
  readonly ideaBankRows: readonly IdeaBankSpreadsheetRow[];
  readonly serializedSeries: readonly SerializedSeriesEpisode[];
  readonly recommendedLensId: FreshIdeaLensCardV2["id"];
}

const DECORATIVE_EMOJIS = ["🔥", "📖", "📊", "✅", "🎯", "💡", "✨", "🚀", "🎉"];
const BANNED_CLICHES = [
  "오늘날 급변하는 환경에서",
  "단순한 도구가 아니라 필수",
  "결국 중요한 것은 본질",
  "새로운 패러다임",
  "게임 체인저",
  "혁신적인",
  "놀랍게도",
  "supercharge",
  "unlock the full potential",
  "paradigm shift",
  "game-changer",
  "ai-powered",
];
const VAGUE_PLACEHOLDER_RE = /\[\s*(?:X|XX|X%|XX%|TBD|\.\.\.|수치|수치\s*입력|데이터\s*입력)\s*\]/i;
const REGULATED_UNSAFE_RE = /(?:처방약\s*임의\s*중단|탈세\s*방법|무조건\s*레버리지\s*올인)/;

export function deidentifyInternalDraftText(rawText: string): string {
  return rawText
    .replace(/([가-힣A-Za-z0-9]+)\s*(?:고객사|파트너사)/g, "국내 중견 파트너사")
    .replace(/\d{1,3}(?:,\d{3})+\s*(?:억|만)?\s*원/g, "[비공개 매출·비용 구간]")
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[담당자 연락처 비식별화]");
}

export function auditFreshIdeasQualityAndSafety(
  lenses: readonly FreshIdeaLensCardV2[],
  draftText: string,
  expectedUrls: readonly string[] = [],
): QualitySafetyAuditReport {
  const violations: QualitySafetyViolation[] = [];
  const corpus = [
    ...lenses.map((l) => `${l.indexTag} ${l.labelKo} ${l.headlineKo} ${l.angleKo}`),
    draftText,
  ].join("\n");
  const lowered = corpus.toLocaleLowerCase("ko-KR");

  for (const emoji of DECORATIVE_EMOJIS) {
    if (corpus.includes(emoji)) {
      violations.push({ code: "UNSLOP_EMOJI", detailKo: `장식용 이모지(${emoji})가 포함되어 있습니다.` });
    }
  }
  for (const phrase of BANNED_CLICHES) {
    if (lowered.includes(phrase)) {
      violations.push({ code: "BANNED_CLICHE", detailKo: `금지된 상투어·과장어(${phrase})가 감지되었습니다.` });
    }
  }
  if (corpus.includes("!")) {
    violations.push({ code: "UNSLOP_EXCLAMATION", detailKo: "느낌표(!) 사용이 감지되었습니다." });
  }
  const vagueMatch = VAGUE_PLACEHOLDER_RE.exec(corpus);
  if (vagueMatch) {
    violations.push({
      code: "VAGUE_PLACEHOLDER",
      detailKo: `구체적 측정 기준 없는 모호한 자리표시자(${vagueMatch[0]})가 감지되었습니다.`,
    });
  }
  if (REGULATED_UNSAFE_RE.test(corpus)) {
    violations.push({
      code: "REGULATED_DOMAIN_UNSAFE",
      detailKo: "의료·법률·금융 민감 도메인 안전선을 위반하는 표현이 감지되었습니다.",
    });
  }

  for (const url of expectedUrls) {
    if (!corpus.includes(url) && !lenses.some((l) => l.preservedUrls.includes(url))) {
      violations.push({ code: "DROPPED_URL", detailKo: `원문 출처 URL(${url})이 유실되었습니다.` });
    }
  }

  const storyLens = lenses.find((l) => l.id === "personal-story-hook");
  if (storyLens && !storyLens.experienceSlotPromptKo) {
    violations.push({
      code: "FABRICATED_STORY",
      detailKo: "경험담 렌즈(02)에 [실제 경험 슬롯]이 누락되어 허위 경험담 위험이 있습니다.",
    });
  }

  let maxPairwiseOverlap = 0;
  for (let i = 0; i < lenses.length; i += 1) {
    if (lenses[i]!.headlineKo.trim().length < 14) {
      violations.push({
        code: "GENERIC_HEADLINE",
        detailKo: `렌즈 ${lenses[i]!.indexTag} 헤드라인이 너무 짧거나 추상적입니다.`,
      });
    }
    for (let j = i + 1; j < lenses.length; j += 1) {
      const overlap = computeHeadlineOverlapRatio(lenses[i]!.headlineKo, lenses[j]!.headlineKo);
      if (overlap > maxPairwiseOverlap) maxPairwiseOverlap = overlap;
      if (overlap >= 0.45) {
        violations.push({
          code: "LOW_ORTHOGONALITY",
          detailKo: `렌즈 ${lenses[i]!.indexTag}와 ${lenses[j]!.indexTag}의 주제가 과도하게 겹칩니다(${overlap}).`,
        });
      }
    }
  }

  const score100 = Math.max(0, 100 - violations.length * 15);
  return Object.freeze({
    passed: violations.length === 0,
    score100,
    maxPairwiseOverlap,
    violations: Object.freeze(violations),
    deidentifiedPreviewKo: deidentifyInternalDraftText(draftText),
    unconnectedFallbackGuideKo:
      "문서·메일 앱이 미연결 상태인 경우 핵심 결론 1문단 또는 목차만 붙여 넣으면 즉시 5개 각도를 생성합니다.",
  });
}

export function fuseTwoLensAngles(
  lensA: FreshIdeaLensCardV2,
  lensB: FreshIdeaLensCardV2,
): HybridAngleFusionResult {
  const combinedLabelKo = `${lensA.indexTag} ${lensA.labelKo} + ${lensB.indexTag} ${lensB.labelKo}`;
  const top40HookFrameKo = `[상단 40% 문제 재정의 · ${lensA.labelKo}] ${lensA.headlineKo}. ${lensA.angleKo}`;
  const bottom60ProofResolutionKo = `[하단 60% 근거·해결 전개 · ${lensB.labelKo}] ${lensB.headlineKo}. ${lensB.angleKo}`;
  return Object.freeze({
    combinedLabelKo,
    top40HookFrameKo,
    bottom60ProofResolutionKo,
    mergedDraftKo: `${top40HookFrameKo}\n\n${bottom60ProofResolutionKo}`,
  });
}

export function runFreshIdeasModeCWorkflow(params: {
  readonly sourceTitle: string;
  readonly sourceUrl?: string;
  readonly targetPersonaKo: string;
  readonly lenses: readonly FreshIdeaLensCardV2[];
  readonly primaryLensIndex?: number;
  readonly secondaryLensIndex?: number;
  readonly preferredChannel?: TargetChannelId;
  readonly dateIso?: string;
}): ModeCEcosystemBundle {
  const {
    sourceTitle,
    sourceUrl,
    targetPersonaKo,
    lenses,
    primaryLensIndex = 0,
    secondaryLensIndex = 2,
    preferredChannel = "linkedin-kr",
    dateIso = "2026-11-20",
  } = params;

  const primary = lenses[primaryLensIndex] ?? lenses[0]!;
  const secondary = lenses[secondaryLensIndex] ?? lenses[Math.min(1, lenses.length - 1)]!;

  const osmuPackage: OsmuThreeAssetPackage = Object.freeze({
    longFormNewsletter: expandLensToChannelDraft(primary, "newsletter"),
    linkedInFeedCut: expandLensToChannelDraft(primary, "linkedin-kr"),
    shortFormThreadsOrShorts: expandLensToChannelDraft(primary, "shorts-reels-60s"),
  });

  const hybridFusion = fuseTwoLensAngles(primary, secondary);

  const googleDocExportPayload = Object.freeze({
    titleKo: `[Fresh Ideas v2] ${sourceTitle} — ${primary.indexTag} ${primary.labelKo}`,
    mainDraftKo: osmuPackage.linkedInFeedCut.bodySectionsKo.join("\n\n"),
    appendixRemainingSeedsKo: Object.freeze(
      lenses
        .filter((l) => l.id !== primary.id)
        .map((l) => `${l.indexTag} · ${l.labelKo}: ${l.headlineKo}`),
    ),
  });

  const sourceTitleAndUrl = sourceUrl ? `${sourceTitle} (${sourceUrl})` : sourceTitle;
  const ideaBankRows: readonly IdeaBankSpreadsheetRow[] = Object.freeze(
    lenses.map((lens) => ({
      dateIso,
      sourceTitleAndUrl,
      lensId: `${lens.indexTag}-${lens.id}`,
      headlineKo: lens.headlineKo,
      targetPersonaAndChannel: `${targetPersonaKo} · ${preferredChannel}`,
      effortTagKo: lens.effortTagKo,
      draftStatus: lens.id === primary.id ? "Drafted" : "Seed",
    })),
  );

  const seriesOrder: readonly FreshIdeaLensCardV2["id"][] = [
    "contrarian-take",
    "personal-story-hook",
    "data-evidence-angle",
    "what-they-missed",
    "practical-playbook",
  ];
  const orderedForSeries = seriesOrder
    .map((id) => lenses.find((l) => l.id === id))
    .filter((item): item is FreshIdeaLensCardV2 => Boolean(item));

  const serializedSeries: readonly SerializedSeriesEpisode[] = Object.freeze(
    orderedForSeries.map((lens, idx) => ({
      partNumber: idx + 1,
      lensId: lens.id,
      episodeTitleKo: `${idx + 1}화 · ${lens.headlineKo}`,
      cliffhangerBridgeKo:
        idx < orderedForSeries.length - 1
          ? `다음 ${idx + 2}화 예고: ${orderedForSeries[idx + 1]!.labelKo} 관점에서 실제 해결 기준선을 검증합니다.`
          : "최종화 완결: 30분 실행 체크리스트를 팀 주간 회고에 바로 적용합니다.",
    })),
  );

  return Object.freeze({
    voiceChainingHintKo: `match-my-writing-style 연동: ${preferredChannel} 채널 톤과 문장 호흡을 사용자 과거 작성 문서에 맞춰 보정합니다.`,
    stressTestAdvisorPromptKo: `get-more-perspectives 연동: [${primary.headlineKo}] 주장을 Operator·Skeptic·Customer·Finance·Visionary 5인 관점으로 사전 검증합니다.`,
    meetingAgendaBriefKo: `prep-for-meetings 전환: [${sourceTitle}] 핵심 쟁점 1줄 + 팀 의사결정 질문 2건으로 30초 회의 브리프를 구성합니다.`,
    osmuPackage,
    hybridFusion,
    googleDocExportPayload,
    ideaBankRows,
    serializedSeries,
    recommendedLensId: primary.id,
  });
}
