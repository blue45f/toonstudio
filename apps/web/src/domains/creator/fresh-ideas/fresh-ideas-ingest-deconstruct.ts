/**
 * Multi-Source / Multimodal Ingestion & Pre-Lens Thesis Deconstruction Engine (REQ-011 ~ REQ-030, REQ-070, REQ-083).
 */

import {
  classifySourceDensity,
  inferDefaultTargetPersona,
  type FreshIdeasSourceKind,
  type SourceDensityTier,
} from "./fresh-ideas-contracts";

export type RegulatedDomainCategory = "none" | "medical" | "legal" | "financial";

export interface FreshIdeasSourceItem {
  readonly id: string;
  readonly title: string;
  readonly kind: FreshIdeasSourceKind;
  readonly content: string;
  readonly url?: string;
  readonly authorOrSpeaker?: string;
  readonly publishedYear?: number;
}

export interface MultiSourceIngestionBundle {
  readonly primaryTopic: string;
  readonly targetPersonaKo: string;
  readonly densityTier: SourceDensityTier;
  readonly sourceCount: number;
  readonly preservedUrls: readonly string[];
  readonly isDataHeavy: boolean;
  readonly isMultiDoc: boolean;
  readonly isForeignContext: boolean;
  readonly regulatedDomain: RegulatedDomainCategory;
  readonly sharedConsensusKo: string;
  readonly directClashKo: string;
  readonly mutualBlindSpotKo: string;
  readonly topSoundbites: readonly string[];
  readonly extractedMetrics: readonly string[];
  readonly extractedSpeakers: readonly string[];
  readonly normalizedBodyText: string;
  readonly sourceKindTags: readonly FreshIdeasSourceKind[];
}

export interface ThesisDeconstructionResult {
  readonly coreThesisKo: string;
  readonly unspokenAssumptionsKo: readonly [string, string];
  readonly logicalLeapKo: string;
  readonly stakeholderAsymmetryKo: string;
  readonly survivorshipBiasNoteKo: string;
  readonly secondOrderChainKo: string;
  readonly boundaryConditionKo: string;
  readonly invertedMetaphorKo: string;
  readonly elevatedCaveatKo: string;
  readonly concreteBehaviorTerms: readonly string[];
  readonly densityTier: SourceDensityTier;
}

const ABSTRACT_TO_CONCRETE_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/시너지|synergy/gi, "팀 간 핸드오프 대기시간 단축"],
  [/혁신|innovation/gi, "기존 병목 공정의 30% 이상 단축"],
  [/민첩성|agility/gi, "주 단위 가설 검증 및 배포 사이클"],
  [/얼라인먼트|alignment/gi, "우선순위 3개 합의 및 비핵심 중단"],
  [/오너십|ownership/gi, "단일 의사결정 담당자와 완료 기준 명시"],
  [/확장성|scalability/gi, "인원 2배 증원 시 재교육 없는 온보딩 규격"],
];

function extractMetricsFromText(text: string): readonly string[] {
  const matches =
    text.match(
      /\d+(?:[.,]\d+)?\s*(?:%|시간|분|초|일|주|개월|년|컷|화|배|명|원|달러|px|mm|fps|점|h|ms)/gi,
    ) ?? [];
  return Object.freeze(Array.from(new Set(matches.map((m) => m.trim()))).slice(0, 8));
}

function extractTopSoundbites(text: string): readonly string[] {
  const cleaned = text.replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]/g, "");
  const sentences = cleaned
    .split(/(?<=[.?!。])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 16 && s.length <= 180);
  const scored = sentences.map((sentence) => {
    let score = 0;
    if (/\d/.test(sentence)) score += 3;
    if (/하지만|그러나|반면|오히려|문제는|원인은|역설|but|however|instead/i.test(sentence)) score += 4;
    if (/절감|병목|실패|이탈|지연|대비|반려/.test(sentence)) score += 2;
    return { sentence, score };
  });
  return Object.freeze(
    scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) => item.sentence),
  );
}

function detectRegulatedDomain(text: string): RegulatedDomainCategory {
  const lower = text.toLocaleLowerCase("ko-KR");
  if (/처방|진단|투약|임상|환자|수술|의료법|증상\s*치료/.test(lower)) return "medical";
  if (/소송|판례|세무\s*조사|탈세|위법|법률\s*자문|공정거래/.test(lower)) return "legal";
  if (/레버리지|종목\s*추천|원금\s*보장|수익률\s*보장|공매도|파생상품/.test(lower)) return "financial";
  return "none";
}

function detectForeignContext(text: string): boolean {
  const latinChars = (text.match(/[A-Za-z]/g) ?? []).length;
  const hangulChars = (text.match(/[가-힣]/g) ?? []).length;
  if (latinChars >= 40 && latinChars > hangulChars * 0.45) return true;
  return /silicon\s+valley|us\s+market|fortune\s+500|yc\s+batch|미국\s*본사|해외\s*사례/i.test(text);
}

export function ingestFreshIdeasSources(
  sources: readonly FreshIdeasSourceItem[],
): MultiSourceIngestionBundle {
  const safeSources =
    sources.length > 0
      ? sources
      : [
          {
            id: "fallback",
            title: "기본 원문",
            kind: "article" as const,
            content: "작업 공정의 속도와 품질 균형을 맞추는 실무 전략",
          },
        ];

  const combinedText = safeSources.map((s) => `${s.title}\n${s.content}`).join("\n\n");
  const densityTier = classifySourceDensity(combinedText, safeSources.length);
  const preservedUrls = Object.freeze(
    Array.from(
      new Set(
        safeSources
          .map((s) => s.url?.trim())
          .filter((url): url is string => Boolean(url && /^https?:\/\//i.test(url))),
      ),
    ),
  );
  const extractedMetrics = extractMetricsFromText(combinedText);
  const extractedSpeakers = Object.freeze(
    Array.from(
      new Set(
        safeSources
          .map((s) => s.authorOrSpeaker?.trim())
          .filter((sp): sp is string => Boolean(sp)),
      ),
    ),
  );
  const isDataHeavy =
    extractedMetrics.length >= 4 ||
    safeSources.some((s) => s.kind === "sheet-csv" || s.kind === "visual-diagram");
  const isMultiDoc = safeSources.length >= 2;
  const isForeignContext = detectForeignContext(combinedText);
  const regulatedDomain = detectRegulatedDomain(combinedText);
  const sourceKindTags = Object.freeze(Array.from(new Set(safeSources.map((s) => s.kind))));
  const primaryTopic = safeSources[0]!.title.trim() || "핵심 주제";
  const topSoundbites = extractTopSoundbites(combinedText);

  const hasSelfRemix = safeSources.some((s) => s.kind === "self-past-post");
  const hasComments = safeSources.some((s) => s.kind === "community-comments");
  const hasChangelog = safeSources.some((s) => s.kind === "changelog-pr");
  const hasNewsletter = safeSources.some((s) => s.kind === "newsletter-bundle");
  const hasYoutube = safeSources.some((s) => s.kind === "youtube-transcript");
  const hasSlidePdf = safeSources.some((s) => s.kind === "slide-pdf");
  const hasMeeting = safeSources.some((s) => s.kind === "meeting-transcript");
  const hasDiagram = safeSources.some((s) => s.kind === "visual-diagram");

  const sharedConsensusKo = isMultiDoc
    ? `${safeSources.map((s) => s.title).join("·")} 모두 기존 방식의 효율 저하를 핵심 과제로 전제합니다.`
    : hasNewsletter
      ? "최근 뉴스레터 묶음 전반이 도구 도입 자체를 즉각적 생산성 향상으로 동일시합니다."
      : hasYoutube
        ? "영상 발표 전반이 핵심 노하우 한 가지만 적용하면 시행착오가 사라진다고 전제합니다."
        : hasSlidePdf
          ? "발표 슬라이드 요약본이 이상적인 정상 경로만 강조하고 예외 비용을 생략합니다."
          : `${primaryTopic}에서 단일 요인만 고치면 전체 문제가 풀린다고 전제합니다.`;

  const directClashKo = isMultiDoc
    ? `${safeSources[0]!.title}의 단기 속도 우선 관점과 ${safeSources[1]!.title}의 장기 품질·유지보수 관점이 정면 충돌합니다.`
    : hasComments
      ? "원문 주장과 달리 현장 댓글에서는 소규모 팀 적용 시 발생하는 전환 비용을 가장 큰 걸림돌로 지목합니다."
      : hasChangelog
        ? "내부 기술 변경 로그와 실제 사용자가 체감하는 작업 마찰 감소 구간 사이에 해석 간극이 있습니다."
        : hasMeeting
          ? "회의 참석자 간에도 마감 속도 우선파와 검수 기준선 유지파의 우선순위가 갈립니다."
          : hasDiagram
            ? "도식화된 선형 화살표와 달리 실제 현장에서는 역방향 재검수 루프가 반복됩니다."
            : "단기 지표 개선과 팀 전체의 지속 가능성 사이에 뚜렷한 긴장이 존재합니다.";

  const mutualBlindSpotKo = hasSelfRemix
    ? "과거 작성 시점과 달라진 2026년 현재의 자동화 기준선 및 팀 협업 비용 변화가 빠져 있습니다."
    : "도입 6개월 이후 누적되는 유지보수 부채, 검수 병목, 그리고 의사결정 권한 충돌이 다뤄지지 않았습니다.";

  return Object.freeze({
    primaryTopic,
    targetPersonaKo: inferDefaultTargetPersona(combinedText),
    densityTier,
    sourceCount: safeSources.length,
    preservedUrls,
    isDataHeavy,
    isMultiDoc,
    isForeignContext,
    regulatedDomain,
    sharedConsensusKo,
    directClashKo,
    mutualBlindSpotKo,
    topSoundbites,
    extractedMetrics,
    extractedSpeakers,
    normalizedBodyText: combinedText,
    sourceKindTags,
  });
}

export function deconstructFreshIdeasThesis(
  bundle: MultiSourceIngestionBundle,
): ThesisDeconstructionResult {
  let concreteText = bundle.normalizedBodyText;
  const concreteBehaviorTerms: string[] = [];
  for (const [pattern, replacement] of ABSTRACT_TO_CONCRETE_MAP) {
    if (pattern.test(concreteText)) {
      concreteBehaviorTerms.push(replacement);
      concreteText = concreteText.replace(pattern, replacement);
    }
  }
  if (concreteBehaviorTerms.length === 0) {
    concreteBehaviorTerms.push("실무 핸드오프 시간", "주간 수정 횟수", "검수 통과율");
  }

  const coreThesisKo =
    bundle.topSoundbites[0] ??
    `${bundle.primaryTopic}의 성과를 높이려면 개별 최적화보다 공정 간 병목 해소가 우선되어야 합니다.`;

  const unspokenAssumptionsKo: readonly [string, string] = Object.freeze([
    `${bundle.primaryTopic} 도입 시 팀원 전원이 동일한 숙련도와 맥락을 공유한다는 암묵적 전제`,
    "단기 지표 개선이 6개월 뒤 유지보수·검수 비용 증가로 되돌아오지 않는다는 전제",
  ]);

  const logicalLeapKo =
    bundle.extractedMetrics.length > 0
      ? `관찰된 수치(${bundle.extractedMetrics.slice(0, 2).join(", ")})만으로 인과관계를 단정하고 조직 규모 차이를 생략한 비약`
      : "특정 성공 사례의 표면 결과를 곧바로 보편적 인과 법칙으로 일반화한 논리 도약";

  const stakeholderAsymmetryKo = `${bundle.targetPersonaKo} 입장에서는 마감·품질 일관성이 최우선이지만, 개별 실무자는 잦은 맥락 전환과 검수 대기를 가장 큰 피로 요인으로 체감합니다.`;

  const survivorshipBiasNoteKo =
    "성공 사례만 조명되고 동일한 방식을 도입했다가 초기 세팅 비용과 팀 반발로 중도 포기한 팀의 조건은 기록에서 빠져 있습니다.";

  const secondOrderChainKo =
    "1차로 산출 속도가 빨라지면 6~12개월 뒤 2차 효과로 검수 대기열 급증과 화풍·품질 편차가 누적되고, 3차로 자동화 규칙 자체를 관리하는 운영 부채가 발생합니다.";

  const boundaryConditionKo =
    "5명 이하 소팀에서는 즉시 통하지만, 다중 담당자가 동시 투입되는 주간 연재·협업 환경에서는 명확한 기준선 잠금 없이 오히려 재작업이 늘어납니다.";

  const invertedMetaphorKo =
    "도구를 '만능 비서'로 비유할 때 놓치는 핵심은, 기준선 없는 자동화는 실수를 10배 빠르게 복제하는 증폭기로 작동한다는 점입니다.";

  const elevatedCaveatKo =
    bundle.topSoundbites[2] ??
    "원문 말미의 단서 조항처럼 예외 케이스와 비정형 수정 요청이 실제 마감 시간의 절반 이상을 좌우합니다.";

  return Object.freeze({
    coreThesisKo,
    unspokenAssumptionsKo,
    logicalLeapKo,
    stakeholderAsymmetryKo,
    survivorshipBiasNoteKo,
    secondOrderChainKo,
    boundaryConditionKo,
    invertedMetaphorKo,
    elevatedCaveatKo,
    concreteBehaviorTerms: Object.freeze(concreteBehaviorTerms),
    densityTier: bundle.densityTier,
  });
}
