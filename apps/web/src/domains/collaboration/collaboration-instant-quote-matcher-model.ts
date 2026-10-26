/**
 * 숨고(Soomgo `/search/pro`, `/profile` 즉시 견적 매칭 퍼널) +
 * 위시켓(Wishket `wishket_utility.js`, `wishket-multiselect.js` 과업 범위·표준계약서 명세 빌더) +
 * 크몽(Kmong 원본 파일·상업적 이용권 패키지) 역공학 내재화 순수 모델.
 */

export type WebtoonQuoteProcessRole = "ink" | "color" | "background" | "story" | "lettering";

export type TurnaroundUrgencyTier = "standard-7d" | "express-72h" | "urgent-24h";

export type IpRightsScopeTier =
  | "serial-webtoon-only"
  | "global-localization"
  | "merch-and-secondary";

export type SourceFileDeliveryTier =
  | "flattened-png"
  | "layered-clip-psd"
  | "full-3d-scene-bundle";

export interface InstantQuoteMatcherInput {
  readonly processRole: WebtoonQuoteProcessRole;
  readonly episodeCutCount: number;
  readonly turnaroundUrgency: TurnaroundUrgencyTier;
  readonly ipRightsScope: IpRightsScopeTier;
  readonly sourceFileDelivery: SourceFileDeliveryTier;
}

export interface QuoteMilestoneSlice {
  readonly stepId: "deposit" | "mid-review" | "final-delivery";
  readonly labelKo: string;
  readonly labelEn: string;
  readonly ratioPercent: number;
  readonly amountKRW: number;
}

export interface MatchedProSpecialist {
  readonly id: string;
  readonly displayNameKo: string;
  readonly displayNameEn: string;
  readonly processRole: WebtoonQuoteProcessRole;
  readonly matchScore: number;
  readonly avgResponseMinutes: number;
  readonly completedEpisodes: number;
  readonly verifiedTools: readonly string[];
  readonly highlightKo: string;
  readonly highlightEn: string;
}

export interface InstantQuoteEvaluation {
  readonly processRole: WebtoonQuoteProcessRole;
  readonly clampedCutCount: number;
  readonly perCutUnitKRW: number;
  readonly estimatedTotalKRW: number;
  readonly freeRevisionRounds: number;
  readonly milestoneSplit: readonly QuoteMilestoneSlice[];
  readonly contractClausesKo: readonly string[];
  readonly contractClausesEn: readonly string[];
  readonly matchedSpecialists: readonly MatchedProSpecialist[];
}

const BASE_PER_CUT_KRW: Readonly<Record<WebtoonQuoteProcessRole, number>> = Object.freeze({
  ink: 14_000,
  color: 11_000,
  background: 16_000,
  story: 13_000,
  lettering: 4_500,
});

const URGENCY_MULTIPLIER: Readonly<Record<TurnaroundUrgencyTier, number>> = Object.freeze({
  "standard-7d": 1.0,
  "express-72h": 1.25,
  "urgent-24h": 1.55,
});

const RIGHTS_MULTIPLIER: Readonly<Record<IpRightsScopeTier, number>> = Object.freeze({
  "serial-webtoon-only": 1.0,
  "global-localization": 1.18,
  "merch-and-secondary": 1.35,
});

const DELIVERY_MULTIPLIER: Readonly<Record<SourceFileDeliveryTier, number>> = Object.freeze({
  "flattened-png": 1.0,
  "layered-clip-psd": 1.15,
  "full-3d-scene-bundle": 1.3,
});

const PRO_CATALOG: readonly Omit<MatchedProSpecialist, "matchScore">[] = Object.freeze([
  {
    id: "pro-ink-01",
    displayNameKo: "윤서하 선화 스튜디오",
    displayNameEn: "Seoha Yoon Inking Studio",
    processRole: "ink",
    avgResponseMinutes: 12,
    completedEpisodes: 94,
    verifiedTools: ["Clip Studio EX", "벡터 선화 레이어", "G펜 커스텀 브러시"],
    highlightKo: "주간 액션·로판 70컷 기준 48시간 내 펜선 폐합 보장",
    highlightEn: "48h closed-line vector inking guarantee for 70-cut weekly episodes",
  },
  {
    id: "pro-color-01",
    displayNameKo: "류진 채색·후보정 공방",
    displayNameEn: "Ryujin Color & Lighting Lab",
    processRole: "color",
    avgResponseMinutes: 9,
    completedEpisodes: 128,
    verifiedTools: ["Clip Studio EX", "Photoshop", "파트별 밑색 분리 PSD"],
    highlightKo: "피부·의상·역광 레이어 5단 분리 및 컬러 스크립트 일관성 유지",
    highlightEn: "5-layer skin/cloth/rim-light separation with color script lock",
  },
  {
    id: "pro-bg-01",
    displayNameKo: "아크3D 웹툰 배경팀",
    displayNameEn: "Ark3D Webtoon Environment Team",
    processRole: "background",
    avgResponseMinutes: 18,
    completedEpisodes: 76,
    verifiedTools: ["SketchUp", "Blender", "SnapToon", "Clip Studio LT변환"],
    highlightKo: "카메라 화각 매칭 + 은선(LT)·음영 레이어 분리 납품",
    highlightEn: "Camera FOV matching + hidden-line (LT) & shadow layer separation",
  },
  {
    id: "pro-story-01",
    displayNameKo: "한결 각색·콘티 디렉터",
    displayNameEn: "Hangyeol Storyboard & Adaptation Director",
    processRole: "story",
    avgResponseMinutes: 15,
    completedEpisodes: 62,
    verifiedTools: ["Clip Studio Story", "모바일 스크롤 템플릿", "대사 앵커"],
    highlightKo: "웹소설 원작 각색 및 스마트폰 세로 스크롤 호흡 설계 특화",
    highlightEn: "Web-novel adaptation & mobile vertical scroll pacing specialist",
  },
  {
    id: "pro-letter-01",
    displayNameKo: "타이포그래피 봄 식자팀",
    displayNameEn: "Typo-Bom Lettering & SFX Team",
    processRole: "lettering",
    avgResponseMinutes: 7,
    completedEpisodes: 210,
    verifiedTools: ["Clip Studio EX", "Adobe Illustrator", "다국어 식자 템플릿"],
    highlightKo: "말풍선 꼬리·효과음 드로잉 및 글로벌 현지화 레이어 분리",
    highlightEn: "Balloon tail/SFX hand-lettering & global localization text layers",
  },
]);

export function evaluateInstantQuoteAndSpecialistMatch(
  input: InstantQuoteMatcherInput
): InstantQuoteEvaluation {
  const clampedCutCount = Math.max(10, Math.min(200, Math.round(input.episodeCutCount || 60)));
  const baseUnit = BASE_PER_CUT_KRW[input.processRole] ?? 12_000;
  const urgencyFactor = URGENCY_MULTIPLIER[input.turnaroundUrgency] ?? 1.0;
  const rightsFactor = RIGHTS_MULTIPLIER[input.ipRightsScope] ?? 1.0;
  const deliveryFactor = DELIVERY_MULTIPLIER[input.sourceFileDelivery] ?? 1.0;

  const perCutUnitKRW = Math.round((baseUnit * urgencyFactor * rightsFactor * deliveryFactor) / 100) * 100;
  const estimatedTotalKRW = perCutUnitKRW * clampedCutCount;

  const depositKRW = Math.round(estimatedTotalKRW * 0.3);
  const midReviewKRW = Math.round(estimatedTotalKRW * 0.4);
  const finalDeliveryKRW = estimatedTotalKRW - depositKRW - midReviewKRW;

  const freeRevisionRounds =
    input.sourceFileDelivery === "full-3d-scene-bundle"
      ? 3
      : input.sourceFileDelivery === "layered-clip-psd"
        ? 2
        : 1;

  const contractClausesKo: string[] = [
    `회차 분량 ${clampedCutCount}컷 기준 컷당 단가 ${perCutUnitKRW.toLocaleString("ko-KR")}원 정액 산정`,
    input.ipRightsScope === "merch-and-secondary"
      ? "웹툰 연재권 + 단행본·굿즈·2차 저작물 활용 특약(별도 양도 대가 반영) 명시"
      : input.ipRightsScope === "global-localization"
        ? "국내외 웹툰 플랫폼 다국어 번역·유통 라이선스 포함 (2차 영상화 권리는 별도 합의)"
        : "국내 웹툰 본편 연재 목적 사용권 한정 (2차 저작물 권리는 원저작자·작업자 별도 협의)",
    input.sourceFileDelivery === "full-3d-scene-bundle"
      ? "원본 .clip/.psd 레이어 분리본 및 3D 카메라 프리셋 번들 동시 인도"
      : input.sourceFileDelivery === "layered-clip-psd"
        ? "선화·밑색·명암·식자 레이어가 분리된 .clip/.psd 원본 파일 필수 납품"
        : "출판·업로드용 무손실 병합 PNG 납품 (원본 레이어 파일 비포함)",
    `무료 수정 ${freeRevisionRounds}회 포함 · 완료 후 크레딧 표기 보장`,
  ];

  const contractClausesEn: string[] = [
    `${clampedCutCount} cuts @ ₩${perCutUnitKRW.toLocaleString("en-US")}/cut fixed rate`,
    input.ipRightsScope === "merch-and-secondary"
      ? "Includes webtoon serialization + print/merchandise secondary usage addendum"
      : input.ipRightsScope === "global-localization"
        ? "Includes global multi-language webtoon platform distribution license"
        : "Limited to primary webtoon episode serialization rights",
    input.sourceFileDelivery === "full-3d-scene-bundle"
      ? "Delivers separated .clip/.psd layers + 3D camera scene preset bundle"
      : input.sourceFileDelivery === "layered-clip-psd"
        ? "Requires separated .clip/.psd source layers (line/flat/shade/text)"
        : "Flattened lossless PNG delivery only (source layer files excluded)",
    `Includes ${freeRevisionRounds} free revision round(s) + mandatory public credit attribution`,
  ];

  const matchedSpecialists: MatchedProSpecialist[] = PRO_CATALOG.map((candidate) => {
    const roleMatchBonus = candidate.processRole === input.processRole ? 28 : 0;
    const speedBonus =
      input.turnaroundUrgency === "urgent-24h" && candidate.avgResponseMinutes <= 12 ? 8 : 4;
    const rawScore = Math.min(99, 63 + roleMatchBonus + speedBonus);
    return {
      ...candidate,
      matchScore: rawScore,
    };
  }).sort((a, b) => b.matchScore - a.matchScore);

  return Object.freeze({
    processRole: input.processRole,
    clampedCutCount,
    perCutUnitKRW,
    estimatedTotalKRW,
    freeRevisionRounds,
    milestoneSplit: Object.freeze([
      {
        stepId: "deposit",
        labelKo: "1단계 착수 예치 (30%)",
        labelEn: "Step 1 Deposit Escrow (30%)",
        ratioPercent: 30,
        amountKRW: depositKRW,
      },
      {
        stepId: "mid-review",
        labelKo: "2단계 중간 러프·가검수 승인 (40%)",
        labelEn: "Step 2 Mid Rough Review (40%)",
        ratioPercent: 40,
        amountKRW: midReviewKRW,
      },
      {
        stepId: "final-delivery",
        labelKo: "3단계 최종 원본 레이어 납품 (30%)",
        labelEn: "Step 3 Final Source Delivery (30%)",
        ratioPercent: 30,
        amountKRW: finalDeliveryKRW,
      },
    ]),
    contractClausesKo: Object.freeze(contractClausesKo),
    contractClausesEn: Object.freeze(contractClausesEn),
    matchedSpecialists: Object.freeze(matchedSpecialists),
  });
}
