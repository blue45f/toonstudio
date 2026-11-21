/**
 * 웹툰 IP 디지털 자산 시장 가치 시뮬레이터 (투명 가중치 공식 · 추정치 명시 · 상승 레버 Top 3).
 */

export type SecondaryExpansionId =
  | "print-book"
  | "web-novel"
  | "web-drama"
  | "merchandise";

export interface SecondaryExpansionSpec {
  readonly id: SecondaryExpansionId;
  readonly label: string;
  readonly weightBonus: number;
  readonly description: string;
}

export interface WebtoonIpValuationInput {
  readonly episodeCount: number;
  readonly completionRatePercent: number;
  readonly paidConversionRatePercent: number;
  readonly globalLanguageCount: number;
  readonly secondaryExpansions: readonly SecondaryExpansionId[];
}

export interface IpValuationFormulaBreakdown {
  readonly baseEpisodeAssetKrwMan: number;
  readonly completionMultiplier: number;
  readonly paidConversionMultiplier: number;
  readonly globalLanguageMultiplier: number;
  readonly secondaryExpansionMultiplier: number;
}

export interface IpValuationLever {
  readonly id: string;
  readonly title: string;
  readonly actionDetail: string;
  readonly deltaBaseKrwMan: number;
  readonly deltaPercent: number;
}

export interface WebtoonIpValuationReport {
  readonly isEstimate: true;
  readonly estimateNotice: string;
  readonly sanitizedInput: WebtoonIpValuationInput;
  readonly conservativeKrwMan: number;
  readonly baseKrwMan: number;
  readonly optimisticKrwMan: number;
  readonly formula: IpValuationFormulaBreakdown;
  readonly topLevers: readonly [IpValuationLever, IpValuationLever, IpValuationLever];
}

export const SECONDARY_EXPANSION_SPECS: readonly SecondaryExpansionSpec[] = [
  {
    id: "print-book",
    label: "단행본 출간",
    weightBonus: 0.18,
    description: "소장판·박스세트 출간을 통한 충성 독자 매출 확장 (+18%)",
  },
  {
    id: "web-novel",
    label: "웹소설 연계",
    weightBonus: 0.22,
    description: "원작/외전 노블코믹스 교차 유입으로 정주행 전환 확대 (+22%)",
  },
  {
    id: "web-drama",
    label: "웹드라마·영상화",
    weightBonus: 0.48,
    description: "OTT·숏폼 드라마 판권 계약 및 원작 역주행 효과 (+48%)",
  },
  {
    id: "merchandise",
    label: "캐릭터 굿즈·팝업",
    weightBonus: 0.2,
    description: "아크릴·키링·팝업 스토어 팬덤 직접 수익화 (+20%)",
  },
];

export const DEFAULT_IP_VALUATION_INPUT: WebtoonIpValuationInput = {
  episodeCount: 45,
  completionRatePercent: 78,
  paidConversionRatePercent: 8.5,
  globalLanguageCount: 3,
  secondaryExpansions: ["print-book", "merchandise"],
};

const BASE_PER_EPISODE_KRW_MAN = 180;
const CONSERVATIVE_FACTOR = 0.72;
const OPTIMISTIC_FACTOR = 1.38;

function clampUnit(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function sanitizeValuationInput(input: WebtoonIpValuationInput): WebtoonIpValuationInput {
  const validExpansions = new Set<SecondaryExpansionId>(
    SECONDARY_EXPANSION_SPECS.map((spec) => spec.id),
  );
  const uniqueExpansions = [...new Set(input.secondaryExpansions)].filter((id) =>
    validExpansions.has(id),
  );

  return {
    episodeCount: Math.round(clampUnit(input.episodeCount, 1, 500, 1)),
    completionRatePercent: Math.round(clampUnit(input.completionRatePercent, 5, 100, 50) * 10) / 10,
    paidConversionRatePercent:
      Math.round(clampUnit(input.paidConversionRatePercent, 0.5, 40, 5) * 10) / 10,
    globalLanguageCount: Math.round(clampUnit(input.globalLanguageCount, 1, 12, 1)),
    secondaryExpansions: uniqueExpansions,
  };
}

function computeBaseValuation(input: WebtoonIpValuationInput): {
  readonly baseKrwMan: number;
  readonly formula: IpValuationFormulaBreakdown;
} {
  const baseEpisodeAssetKrwMan = input.episodeCount * BASE_PER_EPISODE_KRW_MAN;
  const completionMultiplier =
    Math.round((0.55 + (input.completionRatePercent / 100) * 0.95) * 1000) / 1000;
  const paidConversionMultiplier =
    Math.round((0.6 + (input.paidConversionRatePercent / 10) * 0.85) * 1000) / 1000;
  const globalLanguageMultiplier =
    Math.round((1 + (input.globalLanguageCount - 1) * 0.24) * 1000) / 1000;
  const secondaryBonus = input.secondaryExpansions.reduce((sum, id) => {
    const spec = SECONDARY_EXPANSION_SPECS.find((item) => item.id === id);
    return sum + (spec?.weightBonus ?? 0);
  }, 0);
  const secondaryExpansionMultiplier = Math.round((1 + secondaryBonus) * 1000) / 1000;

  const rawBase =
    baseEpisodeAssetKrwMan *
    completionMultiplier *
    paidConversionMultiplier *
    globalLanguageMultiplier *
    secondaryExpansionMultiplier;

  return {
    baseKrwMan: Math.max(10, Math.round(rawBase)),
    formula: {
      baseEpisodeAssetKrwMan,
      completionMultiplier,
      paidConversionMultiplier,
      globalLanguageMultiplier,
      secondaryExpansionMultiplier,
    },
  };
}

export function evaluateWebtoonIpValuation(
  input: WebtoonIpValuationInput,
): WebtoonIpValuationReport {
  const sanitized = sanitizeValuationInput(input);
  const { baseKrwMan, formula } = computeBaseValuation(sanitized);
  const conservativeKrwMan = Math.min(
    baseKrwMan,
    Math.max(1, Math.round(baseKrwMan * CONSERVATIVE_FACTOR)),
  );
  const optimisticKrwMan = Math.max(baseKrwMan, Math.round(baseKrwMan * OPTIMISTIC_FACTOR));

  const leverCandidates: {
    readonly id: string;
    readonly title: string;
    readonly actionDetail: string;
    readonly nextInput: WebtoonIpValuationInput;
  }[] = [
    {
      id: "lever-episodes",
      title: "연재 회차 +20화 축적",
      actionDetail: "장기 정주행 볼륨을 늘려 플랫폼 프로모션 및 패키지 노출 경쟁력을 높입니다.",
      nextInput: { ...sanitized, episodeCount: Math.min(500, sanitized.episodeCount + 20) },
    },
    {
      id: "lever-completion",
      title: "완독률 +10%p 개선",
      actionDetail: "컷 간 여백과 엔딩 훅 리듬을 다듬어 다음 화 자동 이탈을 줄입니다.",
      nextInput: {
        ...sanitized,
        completionRatePercent: Math.min(100, sanitized.completionRatePercent + 10),
      },
    },
    {
      id: "lever-paid-conversion",
      title: "유료 전환율 +2.5%p 상승",
      actionDetail: "미리보기 직전 클리프행어 강도를 높여 결제 전환 효율을 끌어올립니다.",
      nextInput: {
        ...sanitized,
        paidConversionRatePercent: Math.min(40, sanitized.paidConversionRatePercent + 2.5),
      },
    },
    {
      id: "lever-global-languages",
      title: "글로벌 번역 +2개 언어 추가",
      actionDetail: "효과음·말풍선 분리 레이어를 활용해 영어·일본어·동남아 연재를 동시 확장합니다.",
      nextInput: {
        ...sanitized,
        globalLanguageCount: Math.min(12, sanitized.globalLanguageCount + 2),
      },
    },
  ];

  const missingExpansions = SECONDARY_EXPANSION_SPECS.filter(
    (spec) => !sanitized.secondaryExpansions.includes(spec.id),
  );
  for (const spec of missingExpansions) {
    leverCandidates.push({
      id: `lever-expansion-${spec.id}`,
      title: `2차 확장: ${spec.label} 계약`,
      actionDetail: spec.description,
      nextInput: {
        ...sanitized,
        secondaryExpansions: [...sanitized.secondaryExpansions, spec.id],
      },
    });
  }

  const scoredLevers: IpValuationLever[] = leverCandidates
    .map((candidate) => {
      const nextBase = computeBaseValuation(candidate.nextInput).baseKrwMan;
      const deltaBaseKrwMan = Math.max(0, nextBase - baseKrwMan);
      const deltaPercent = Math.round((deltaBaseKrwMan / baseKrwMan) * 1000) / 10;
      return {
        id: candidate.id,
        title: candidate.title,
        actionDetail: candidate.actionDetail,
        deltaBaseKrwMan,
        deltaPercent,
      };
    })
    .sort((a, b) => b.deltaBaseKrwMan - a.deltaBaseKrwMan || a.id.localeCompare(b.id));

  const topThree: readonly [IpValuationLever, IpValuationLever, IpValuationLever] = [
    scoredLevers[0]!,
    scoredLevers[1]!,
    scoredLevers[2]!,
  ];

  return {
    isEstimate: true,
    estimateNotice:
      "본 금액은 입력 지표와 투명한 가중치 공식으로 산출한 시뮬레이션 추정치이며 실제 계약·매출을 보장하지 않습니다.",
    sanitizedInput: sanitized,
    conservativeKrwMan,
    baseKrwMan,
    optimisticKrwMan,
    formula,
    topLevers: topThree,
  };
}

export function formatKrwMan(manWon: number): string {
  const safe = Math.max(0, Math.round(Number.isFinite(manWon) ? manWon : 0));
  const eok = Math.floor(safe / 10_000);
  const rem = safe % 10_000;
  if (eok === 0) {
    return `${rem.toLocaleString("ko-KR")}만 원`;
  }
  if (rem === 0) {
    return `${eok.toLocaleString("ko-KR")}억 원`;
  }
  return `${eok.toLocaleString("ko-KR")}억 ${rem.toLocaleString("ko-KR")}만 원`;
}
