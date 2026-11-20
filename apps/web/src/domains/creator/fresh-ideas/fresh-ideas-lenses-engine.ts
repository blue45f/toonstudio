/**
 * Core 5 Lenses Precision Upgrade & 9-Lens Extended Pack + Orthogonality Auto-Pivot (REQ-031 ~ REQ-050).
 */

import type {
  AnyLensId,
  CoreLensId,
  ExtendedLensId,
  FreshIdeasSourceKind,
} from "./fresh-ideas-contracts";
import type {
  MultiSourceIngestionBundle,
  ThesisDeconstructionResult,
} from "./fresh-ideas-ingest-deconstruct";

export type ContrarianIntensityMode =
  | "conditional-nuance"
  | "root-cause-flip"
  | "priority-inversion";

export type BlindSpotAxisId =
  | "hidden-cost"
  | "legal-ip-risk"
  | "maintenance-debt"
  | "org-politics"
  | "local-market-asymmetry";

export interface FreshIdeaLensCardV2 {
  readonly id: AnyLensId;
  readonly indexTag: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly headlineKo: string;
  readonly angleKo: string;
  readonly effortTagKo: string;
  readonly contrarianMode?: ContrarianIntensityMode;
  readonly falsifiableBoundaryKo?: string;
  readonly experienceSlotPromptKo?: string;
  readonly fourBeatArcKo?: readonly [string, string, string, string];
  readonly dataFlipToMicroStory?: boolean;
  readonly retrievalPlaceholdersKo?: readonly string[];
  readonly playbookStepsKo?: readonly { readonly actionKo: string; readonly doneCriteriaKo: string }[];
  readonly blindSpotAxis?: BlindSpotAxisId;
  readonly preservedUrls: readonly string[];
  readonly orthogonalityPivoted?: boolean;
  readonly recommendedForUser?: boolean;
}

export interface ExtendedLensDefinition {
  readonly id: ExtendedLensId;
  readonly indexTag: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly bestForSourceKinds: readonly FreshIdeasSourceKind[];
  readonly buildCard: (
    bundle: MultiSourceIngestionBundle,
    decon: ThesisDeconstructionResult,
  ) => FreshIdeaLensCardV2;
}

export interface LensSwapRecommendation {
  readonly replaceCoreLensId: CoreLensId;
  readonly withExtendedLensId: ExtendedLensId;
  readonly rationaleKo: string;
}

function tokenizeKoreanEn(text: string): Set<string> {
  const tokens = text.toLocaleLowerCase("ko-KR").match(/[가-힣a-z0-9]{2,}/g) ?? [];
  const stop = new Set(["이유", "방법", "기준", "실무", "구조", "전환", "과정", "위한", "대한"]);
  return new Set(tokens.filter((t) => !stop.has(t)));
}

export function computeHeadlineOverlapRatio(a: string, b: string): number {
  const setA = tokenizeKoreanEn(a);
  const setB = tokenizeKoreanEn(b);
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  return Number((intersection / union.size).toFixed(3));
}

export function generateFiveOrthogonalLenses(
  bundle: MultiSourceIngestionBundle,
  decon: ThesisDeconstructionResult,
  options?: {
    readonly contrarianMode?: ContrarianIntensityMode;
    readonly preferredLensId?: CoreLensId;
  },
): readonly FreshIdeaLensCardV2[] {
  const contrarianMode: ContrarianIntensityMode =
    options?.contrarianMode ?? (bundle.isMultiDoc ? "priority-inversion" : "root-cause-flip");

  const topic = bundle.primaryTopic;
  const metricsText =
    bundle.extractedMetrics.length > 0
      ? bundle.extractedMetrics.slice(0, 3).join(", ")
      : "[최근 4주간 팀 1인당 주간 수정 소요시간 중앙값(분)]";

  const contrarianCard: FreshIdeaLensCardV2 = {
    id: "contrarian-take",
    indexTag: "01",
    labelKo: "통념 뒤집기",
    labelEn: "Contrarian Take",
    headlineKo: `${topic}의 발목을 잡는 건 기능 부족이 아니라 검증 없는 파라미터 과잉이다`,
    angleKo: `흔히 기능을 더 얹으면 해결된다고 보지만 실제 병목은 ${decon.concreteBehaviorTerms[0] ?? "공정 간 핸드오프"}입니다. ${decon.boundaryConditionKo}`,
    effortTagKo: "15분 단문 · 40분 칼럼",
    contrarianMode,
    falsifiableBoundaryKo: decon.boundaryConditionKo,
    preservedUrls: bundle.preservedUrls,
    recommendedForUser: options?.preferredLensId === "contrarian-take",
  };

  const storyCard: FreshIdeaLensCardV2 = {
    id: "personal-story-hook",
    indexTag: "02",
    labelKo: "경험담 오프닝",
    labelEn: "Personal Story Hook",
    headlineKo: `${topic} 체크리스트에서 불필요한 3단계를 덜어낸 첫 주에 벌어진 일`,
    angleKo: `가짜 무용담 대신 본인의 실제 전환 장면을 채워 넣는 4박자 회고 구조입니다. ${decon.invertedMetaphorKo}`,
    effortTagKo: "20분 회고 에세이",
    experienceSlotPromptKo: `[실제 경험 슬롯: ${topic} 작업을 진행하며 수동 재작업 때문에 마감 직전 병목을 겪고 규칙을 바꿨던 구체적 사건]`,
    fourBeatArcKo: Object.freeze([
      `기존 통념: ${decon.unspokenAssumptionsKo[0]}`,
      "예상 밖의 마찰 장면: 수정 요청 1건이 연쇄 재작업으로 번진 마감 직전 상황",
      `관점 전환 계기: ${decon.elevatedCaveatKo}`,
      "바뀐 행동 원칙: 변경 전 기준선 잠금과 단일 검수 게이트 선행 적용",
    ]),
    preservedUrls: bundle.preservedUrls,
    recommendedForUser: options?.preferredLensId === "personal-story-hook",
  };

  const dataCard: FreshIdeaLensCardV2 = bundle.isDataHeavy
    ? {
        id: "data-evidence-angle",
        indexTag: "03",
        labelKo: "데이터 검증",
        labelEn: "Data & Evidence",
        headlineKo: `숫자(${metricsText}) 이면에서 현장 작업자의 1시간을 갉아먹던 숨은 병목 해부`,
        angleKo: `원문이 이미 수치 중심이므로 통계를 더 얹지 않고, 핵심 수치 1건(${bundle.extractedMetrics[0] ?? "핵심 지표"})을 만들어낸 현장 행동 패턴을 미시 사례로 역추적합니다. 상관관계를 인과로 과장하지 않도록 표본 조건을 함께 명시합니다.`,
        effortTagKo: "30분 미시 케이스",
        dataFlipToMicroStory: true,
        retrievalPlaceholdersKo: Object.freeze([
          "[지난 분기 동일 공정 투입 인원 수 및 주당 수정 횟수 중앙값]",
        ]),
        preservedUrls: bundle.preservedUrls,
        recommendedForUser: options?.preferredLensId === "data-evidence-angle",
      }
    : {
        id: "data-evidence-angle",
        indexTag: "03",
        labelKo: "데이터 검증",
        labelEn: "Data & Evidence",
        headlineKo: `감각적 논쟁 대신 주간 수정 리드타임과 검수 반려율로 검증하는 ${topic} 효율`,
        angleKo: `${decon.logicalLeapKo}을 바로잡기 위해 실제 측정 지표(${metricsText})를 전후 대조합니다. 표본 조건과 팀 규모 차이를 분리해 상관관계 왜곡을 차단합니다.`,
        effortTagKo: "35분 리서치·지표",
        dataFlipToMicroStory: false,
        retrievalPlaceholdersKo: Object.freeze([
          "[최근 4주간 팀 1인당 컷·작업 단위 리터칭 소요시간 중앙값(분)]",
          "[최근 1개 분기 검수 1차 반려율(%) 및 재작업 리드타임(시간)]",
        ]),
        preservedUrls: bundle.preservedUrls,
        recommendedForUser: options?.preferredLensId === "data-evidence-angle",
      };

  const playbookCard: FreshIdeaLensCardV2 = {
    id: "practical-playbook",
    indexTag: "04",
    labelKo: "실전 플레이북",
    labelEn: "Practical Playbook",
    headlineKo: `전사 결재 없이 오늘 오후 30분 안에 끝내는 ${topic} 기준선 점검표`,
    angleKo: `개인 또는 소팀 권한으로 당장 실행해 산출물을 손에 쥐는 3단계 실행안입니다. ${bundle.densityTier === "low-density" ? "짧은 원문의 공백을 메우기 위해 단계별 실패 역지표를 함께 제시합니다." : ""}`.trim(),
    effortTagKo: "25분 실전 가이드",
    playbookStepsKo: Object.freeze([
      {
        actionKo: "30분 진단: 최근 완료한 작업물 3건에서 가장 오래 걸린 수정 구간 1곳만 표시합니다.",
        doneCriteriaKo: "완료 기준 (Done): 반복 병목 Top 1과 평균 소요시간(분) 메모 1장 확보",
      },
      {
        actionKo: "기준선 잠금: 팀 내 임의 변형이 잦은 핵심 규격·톤 파라미터 2개만 기본값으로 고정합니다.",
        doneCriteriaKo: "완료 기준 (Done): 팀 공용 프리셋 또는 5줄 체크리스트 문서 저장",
      },
      {
        actionKo: "1회 파일럿 검증: 다음 1건에 새 규칙을 적용해 수정 횟수와 검수 통과 여부를 기록합니다.",
        doneCriteriaKo: "완료 기준 (Done): 전후 리드타임 비교표 1행 및 다음 주 유지/폐기 판정 완료",
      },
    ]),
    preservedUrls: bundle.preservedUrls,
    recommendedForUser: options?.preferredLensId === "practical-playbook",
  };

  let missedHeadline = `도입 6개월 뒤 ${topic}에서 조용히 쌓이는 유지보수 부채와 권한 충돌`;
  let orthogonalityPivoted = false;
  if (computeHeadlineOverlapRatio(contrarianCard.headlineKo, missedHeadline) >= 0.45) {
    missedHeadline = "국내 협업 팀이 2차 파급효과인 검수 대기열과 저작권 정합성을 놓치는 지점";
    orthogonalityPivoted = true;
  }

  const missedCard: FreshIdeaLensCardV2 = {
    id: "what-they-missed",
    indexTag: "05",
    labelKo: "놓친 사각지대",
    labelEn: "What They Missed",
    headlineKo: missedHeadline,
    angleKo: `${decon.secondOrderChainKo} 특히 ${decon.stakeholderAsymmetryKo}`,
    effortTagKo: "30분 구조 분석",
    blindSpotAxis: "maintenance-debt",
    orthogonalityPivoted,
    preservedUrls: bundle.preservedUrls,
    recommendedForUser: options?.preferredLensId === "what-they-missed",
  };

  return Object.freeze([contrarianCard, storyCard, dataCard, playbookCard, missedCard]);
}

export const EXTENDED_LENS_PACK: readonly ExtendedLensDefinition[] = Object.freeze([
  {
    id: "historical-parallel",
    indexTag: "06",
    labelKo: "역사적 평행이론",
    labelEn: "Historical Parallel",
    bestForSourceKinds: ["article", "multi-doc", "newsletter-bundle"],
    buildCard: (b, d) => ({
      id: "historical-parallel",
      indexTag: "06",
      labelKo: "역사적 평행이론",
      labelEn: "Historical Parallel",
      headlineKo: `${b.primaryTopic} 전환기가 DTP·컨테이너 표준화 초기와 닮은 구조`,
      angleKo: `과거 산업 전환기에도 승자는 도구 제작사가 아니라 표준 포맷과 검수 규격을 선점한 쪽이었습니다. ${d.boundaryConditionKo}`,
      effortTagKo: "35분 비교 칼럼",
      preservedUrls: b.preservedUrls,
    }),
  },
  {
    id: "failure-autopsy",
    indexTag: "07",
    labelKo: "안티 패턴 부검",
    labelEn: "Failure Autopsy",
    bestForSourceKinds: ["changelog-pr", "meeting-transcript", "self-past-post"],
    buildCard: (b, d) => ({
      id: "failure-autopsy",
      indexTag: "07",
      labelKo: "안티 패턴 부검",
      labelEn: "Failure Autopsy",
      headlineKo: `${b.primaryTopic} 조언을 어설프게 따라 하다 마감 직전 무너지는 3가지 패턴`,
      angleKo: `${d.survivorshipBiasNoteKo} 기준선 미고정, 예외 케이스 방치, 사후 검수 누락이 연쇄 붕괴를 부릅니다.`,
      effortTagKo: "25분 실패 부검",
      preservedUrls: b.preservedUrls,
    }),
  },
  {
    id: "cross-domain-analogy",
    indexTag: "08",
    labelKo: "이종 산업 비유",
    labelEn: "Cross-Domain Analogy",
    bestForSourceKinds: ["visual-diagram", "slide-pdf", "article"],
    buildCard: (b, d) => ({
      id: "cross-domain-analogy",
      indexTag: "08",
      labelKo: "이종 산업 비유",
      labelEn: "Cross-Domain Analogy",
      headlineKo: `항공기 이륙 전 체크리스트와 주방 브리게이드로 풀어낸 ${b.primaryTopic} 작동 원리`,
      angleKo: `${d.invertedMetaphorKo} 전문 주방이 피크 타임에 레시피를 즉흥 변경하지 않듯, 창작 공정도 사전 준비와 실행을 분리해야 합니다.`,
      effortTagKo: "20분 비유 에세이",
      preservedUrls: b.preservedUrls,
    }),
  },
  {
    id: "three-year-backcast",
    indexTag: "09",
    labelKo: "3년 뒤 미래 역산",
    labelEn: "3-Year Backcast",
    bestForSourceKinds: ["newsletter-bundle", "multi-doc", "youtube-transcript"],
    buildCard: (b, d) => ({
      id: "three-year-backcast",
      indexTag: "09",
      labelKo: "3년 뒤 미래 역산",
      labelEn: "3-Year Backcast",
      headlineKo: `2029년 시점에서 되돌아보면 지금 ${b.primaryTopic} 논쟁의 80%는 과도기 소음이다`,
      angleKo: `3년 뒤 기본 인프라가 된 상태에서 살아남는 경쟁력은 툴 숙련도가 아니라 ${d.concreteBehaviorTerms[0] ?? "품질 기준선 설계"} 역량입니다.`,
      effortTagKo: "30분 전망 글",
      preservedUrls: b.preservedUrls,
    }),
  },
  {
    id: "unit-economics",
    indexTag: "10",
    labelKo: "비용·단위경제 해부",
    labelEn: "Unit Economics Lens",
    bestForSourceKinds: ["sheet-csv", "slide-pdf"],
    buildCard: (b) => ({
      id: "unit-economics",
      indexTag: "10",
      labelKo: "비용·단위경제 해부",
      labelEn: "Unit Economics Lens",
      headlineKo: `도입 라이선스 비용보다 4배 크게 작용하는 ${b.primaryTopic} 전환·재교육 단위경제`,
      angleKo: `겉으로 보이는 구독료보다 팀원 1인당 학습 곡선과 초기 4주간의 산출량 저하를 손익분기점 계산식에 넣어야 정확한 ROI가 나옵니다.`,
      effortTagKo: "40분 재무 분석",
      retrievalPlaceholdersKo: Object.freeze(["[팀원 1인당 시간당 인건비(원) 및 초기 적응 기간(주)]"]),
      preservedUrls: b.preservedUrls,
    }),
  },
  {
    id: "myth-vs-reality",
    indexTag: "11",
    labelKo: "초심자 오해 교정",
    labelEn: "Myth vs. Reality",
    bestForSourceKinds: ["community-comments", "youtube-transcript"],
    buildCard: (b, d) => ({
      id: "myth-vs-reality",
      indexTag: "11",
      labelKo: "초심자 오해 교정",
      labelEn: "Myth vs. Reality",
      headlineKo: `${b.primaryTopic} 입문자가 가장 먼저 믿었다가 3개월 뒤 버리는 오해 3가지`,
      angleKo: `${d.unspokenAssumptionsKo[0]}와 현장 실무의 실제 제약 조건을 1:1 대조해 시행착오 기간을 줄입니다.`,
      effortTagKo: "20분 대조표",
      preservedUrls: b.preservedUrls,
    }),
  },
  {
    id: "workflow-stack",
    indexTag: "12",
    labelKo: "실전 도구 파이프라인",
    labelEn: "Workflow & Stack",
    bestForSourceKinds: ["changelog-pr", "visual-diagram"],
    buildCard: (b) => ({
      id: "workflow-stack",
      indexTag: "12",
      labelKo: "실전 도구 파이프라인",
      labelEn: "Workflow & Stack",
      headlineKo: `${b.primaryTopic} 개념을 내일 업무에 바로 꽂는 최소 도구 조합과 핸드오프 규칙`,
      angleKo: `거창한 올인원 교체 대신 입력·검증·배포 3단계 경계에 가벼운 자동 검수 게이트만 끼워 넣는 실전 스택을 정리합니다.`,
      effortTagKo: "30분 스택 가이드",
      preservedUrls: b.preservedUrls,
    }),
  },
  {
    id: "uncomfortable-tradeoff",
    indexTag: "13",
    labelKo: "윤리·역량 트레이드오프",
    labelEn: "Uncomfortable Trade-off",
    bestForSourceKinds: ["article", "community-comments"],
    buildCard: (b, d) => ({
      id: "uncomfortable-tradeoff",
      indexTag: "13",
      labelKo: "윤리·역량 트레이드오프",
      labelEn: "Uncomfortable Trade-off",
      headlineKo: `${b.primaryTopic} 자동화로 속도를 얻는 대신 팀이 조용히 잃어가는 주니어 기본기`,
      angleKo: `${d.secondOrderChainKo} 단기 효율을 높일수록 기초 판단력을 훈련할 기회가 줄어드는 역설을 정면으로 짚습니다.`,
      effortTagKo: "35분 성찰 칼럼",
      preservedUrls: b.preservedUrls,
    }),
  },
  {
    id: "scale-10x-01x",
    indexTag: "14",
    labelKo: "10x·0.1x 스케일 실험",
    labelEn: "10x / 0.1x Scale Test",
    bestForSourceKinds: ["meeting-transcript", "self-past-post", "sheet-csv"],
    buildCard: (b, d) => ({
      id: "scale-10x-01x",
      indexTag: "14",
      labelKo: "10x·0.1x 스케일 실험",
      labelEn: "10x / 0.1x Scale Test",
      headlineKo: `1인 제작실(0.1x)과 50인 스튜디오(10x)에서 ${b.primaryTopic} 법칙이 정반대로 뒤집히는 순간`,
      angleKo: `${d.boundaryConditionKo} 규모가 10배 커지면 의사소통 비용이, 10분의 1로 줄면 의사결정 속도가 승부를 가릅니다.`,
      effortTagKo: "25분 스케일 분석",
      preservedUrls: b.preservedUrls,
    }),
  },
]);

export function recommendExtendedLensSwap(
  bundle: MultiSourceIngestionBundle,
): LensSwapRecommendation {
  if (bundle.sourceKindTags.includes("sheet-csv") || bundle.sourceKindTags.includes("slide-pdf")) {
    return Object.freeze({
      replaceCoreLensId: "personal-story-hook",
      withExtendedLensId: "unit-economics",
      rationaleKo: "정량 표·보고서 소스이므로 경험담 대신 비용·단위경제 해부(10) 렌즈 결합이 설득력이 높습니다.",
    });
  }
  if (bundle.sourceKindTags.includes("changelog-pr") || bundle.sourceKindTags.includes("meeting-transcript")) {
    return Object.freeze({
      replaceCoreLensId: "personal-story-hook",
      withExtendedLensId: "failure-autopsy",
      rationaleKo: "릴리즈 로그·회의록은 안티 패턴 부검(07) 렌즈로 실무 리스크를 짚을 때 반응이 좋습니다.",
    });
  }
  return Object.freeze({
    replaceCoreLensId: "what-they-missed",
    withExtendedLensId: "scale-10x-01x",
    rationaleKo: "일반 아티클은 10x·0.1x 스케일 실험(14)을 덧붙이면 조직 규모별 적용 경계가 선명해집니다.",
  });
}
