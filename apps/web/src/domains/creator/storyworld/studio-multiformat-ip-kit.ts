/**
 * 멀티포맷 IP 배포 계획 · 원천 텍스트→파일럿 3컷 시드 변환 · 오프라인 QR 체험 & 굿즈 BOM 수익 계산 엔진.
 * 순수 함수·결정론·DOM/React 무관.
 */

export type MultiFormatTargetId =
  | "vertical-webtoon"
  | "shortform-9x16"
  | "four-panel-sns"
  | "card-news-quiz"
  | "pod-memoir-pdf"
  | "b2b-pitch-deck";

export interface MultiFormatDistributionSpec {
  readonly id: MultiFormatTargetId;
  readonly labelKo: string;
  readonly resolutionLabel: string;
  readonly bleedMm: number;
  readonly colorSpace: "sRGB" | "CMYK-300DPI";
  readonly recommendedCuts: number;
  readonly deliverablesKo: readonly string[];
}

export interface PilotSeedCut {
  readonly index: 1 | 2 | 3;
  readonly roleLabelKo: string;
  readonly cameraShotKo: string;
  readonly visualBeatKo: string;
  readonly dialogueLineKo: string;
  readonly charCount: number;
  readonly overBalloonLimit: boolean;
}

export interface Pilot3CutSeedPlan {
  readonly sourceTitle: string;
  readonly cuts: readonly [PilotSeedCut, PilotSeedCut, PilotSeedCut];
  readonly pacingPass: boolean;
}

export type GoodsSkuId =
  | "acrylic-keyring"
  | "photo-card-set"
  | "emotion-checkin-kit"
  | "hardcover-memoir";

export interface OfflineQrGoodsInput {
  readonly skuId: GoodsSkuId;
  readonly quantity: number;
  readonly unitPriceKrw: number;
  readonly includeQrStampCard: boolean;
  readonly rightsBomCleared: boolean;
}

export interface OfflineQrGoodsReport {
  readonly skuLabelKo: string;
  readonly unitCostKrw: number;
  readonly totalCostKrw: number;
  readonly grossSalesKrw: number;
  readonly netProfitKrw: number;
  readonly marginPercent: number;
  readonly printReady: boolean;
  readonly bleedSpecKo: string;
  readonly qrFlowSummaryKo: string;
  readonly blockersKo: readonly string[];
}

export const MULTI_FORMAT_DISTRIBUTION_SPECS: readonly MultiFormatDistributionSpec[] = Object.freeze([
  {
    id: "vertical-webtoon",
    labelKo: "세로 스크롤 웹툰",
    resolutionLabel: "800×1424px 슬라이스",
    bleedMm: 0,
    colorSpace: "sRGB",
    recommendedCuts: 60,
    deliverablesKo: ["스마트 여백 분할 PNG", "모바일 375px 가독성 리포트"],
  },
  {
    id: "shortform-9x16",
    labelKo: "9:16 숏폼 모션툰",
    resolutionLabel: "1080×1920px · 30fps",
    bleedMm: 0,
    colorSpace: "sRGB",
    recommendedCuts: 12,
    deliverablesKo: ["컷별 패럴랙스 타임라인", "자막·BGM 싱크 패키지"],
  },
  {
    id: "four-panel-sns",
    labelKo: "4컷 SNS · 로컬 워크숍",
    resolutionLabel: "1080×1080px · 4컷",
    bleedMm: 0,
    colorSpace: "sRGB",
    recommendedCuts: 4,
    deliverablesKo: ["정방형 4컷 슬라이드", "QR 랜딩 연결 엔드카드"],
  },
  {
    id: "card-news-quiz",
    labelKo: "교육 · 방언 · 설화 카드뉴스·퀴즈",
    resolutionLabel: "1080×1350px · 8장",
    bleedMm: 0,
    colorSpace: "sRGB",
    recommendedCuts: 8,
    deliverablesKo: ["청소년 학습용 퀴즈 카드", "다국어 자막 JSON"],
  },
  {
    id: "pod-memoir-pdf",
    labelKo: "자서전 · 소량 단행본 POD 인쇄",
    resolutionLabel: "A5 · 300DPI 인쇄본",
    bleedMm: 3,
    colorSpace: "CMYK-300DPI",
    recommendedCuts: 32,
    deliverablesKo: ["3mm 도련선 포함 PDF/X", "표지 책등 자동 계산 시트"],
  },
  {
    id: "b2b-pitch-deck",
    labelKo: "B2B 영상화 · 판권 피치 덱",
    resolutionLabel: "1920×1080px · 16:9",
    bleedMm: 0,
    colorSpace: "sRGB",
    recommendedCuts: 6,
    deliverablesKo: ["로그라인·인물 관계도", "파일럿 3컷·권리 BOM 요약"],
  },
]);

interface GoodsSkuMeta {
  readonly id: GoodsSkuId;
  readonly labelKo: string;
  readonly baseUnitCostKrw: number;
  readonly bleedSpecKo: string;
}

export const GOODS_SKU_CATALOG: readonly GoodsSkuMeta[] = Object.freeze([
  {
    id: "acrylic-keyring",
    labelKo: "아크릴 키링 (칼선 2mm)",
    baseUnitCostKrw: 2_400,
    bleedSpecKo: "화이트 언더베이스 + 2mm 외곽 칼선",
  },
  {
    id: "photo-card-set",
    labelKo: "캐릭터 포토카드 4종 세트",
    baseUnitCostKrw: 1_500,
    bleedSpecKo: "55×85mm · 사방 3mm 도련선 · CMYK 300DPI",
  },
  {
    id: "emotion-checkin-kit",
    labelKo: "감정 체크인 카드 · 웰니스 키트",
    baseUnitCostKrw: 4_800,
    bleedSpecKo: "패키지 전개도 3mm 도련 + QR 체크인 카드 내장",
  },
  {
    id: "hardcover-memoir",
    labelKo: "인생 웹툰 양장 단행본 (POD)",
    baseUnitCostKrw: 9_500,
    bleedSpecKo: "A5 무선/양장 · 3mm 도련 + 책등 여백 검증",
  },
]);

const BALLOON_MAX_CHARS = 45;

function splitSentences(raw: string): string[] {
  return raw
    .split(/(?<=[.!?。\n])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function clampDialogue(line: string): string {
  const clean = line.replace(/\s+/gu, " ").trim();
  if (!clean) return "핵심 대사를 45자 이내로 입력하세요.";
  return clean;
}

export function compileSourceTextToPilot3Cut(
  sourceTitle: string,
  sourceText: string,
): Pilot3CutSeedPlan {
  const title = sourceTitle.trim() || "새 원천 IP 파일럿";
  const sentences = splitSentences(sourceText);
  const s1 = clampDialogue(sentences[0] ?? `${title}의 첫 장면에서 주인공의 일상이 깨집니다.`);
  const s2 = clampDialogue(sentences[1] ?? "예상치 못한 사건이 인물과 세계관의 규칙을 시험합니다.");
  const s3 = clampDialogue(sentences[2] ?? "다음 화를 열 수밖에 없는 선택의 순간에서 컷을 멈춥니다.");

  const buildCut = (
    index: 1 | 2 | 3,
    roleLabelKo: string,
    cameraShotKo: string,
    visualBeatKo: string,
    dialogueLineKo: string,
  ): PilotSeedCut => {
    const charCount = [...dialogueLineKo].length;
    return {
      index,
      roleLabelKo,
      cameraShotKo,
      visualBeatKo,
      dialogueLineKo,
      charCount,
      overBalloonLimit: charCount > BALLOON_MAX_CHARS,
    };
  };

  const cuts: readonly [PilotSeedCut, PilotSeedCut, PilotSeedCut] = [
    buildCut(1, "1컷 · 도입 훅", "하이 앵글 설정 샷", "공간 분위기와 핵심 오브젝트를 한눈에 제시", s1),
    buildCut(2, "2컷 · 갈등·전환", "웨이스트 투샷", "인물 표정 변화와 규칙 충돌의 순간 강조", s2),
    buildCut(3, "3컷 · 클리프행어", "익스트림 클로즈업", "시선 집중 컷과 다음 회차·QR 연결 여운", s3),
  ];

  return {
    sourceTitle: title,
    cuts,
    pacingPass: cuts.every((cut) => !cut.overBalloonLimit),
  };
}

export function evaluateOfflineQrGoodsKit(
  input: OfflineQrGoodsInput,
): OfflineQrGoodsReport {
  const sku = GOODS_SKU_CATALOG.find((item) => item.id === input.skuId) ?? GOODS_SKU_CATALOG[0];
  const qty = Math.max(1, Math.round(input.quantity));
  const price = Math.max(0, Math.round(input.unitPriceKrw));
  const qrUnitAddon = input.includeQrStampCard ? 350 : 0;
  // 100개 이상 제작 시 12% 볼륨 할인 반영
  const volumeFactor = qty >= 300 ? 0.8 : qty >= 100 ? 0.88 : 1;
  const unitCostKrw = Math.round((sku.baseUnitCostKrw + qrUnitAddon) * volumeFactor);
  const totalCostKrw = unitCostKrw * qty;
  const grossSalesKrw = price * qty;
  const netProfitKrw = grossSalesKrw - totalCostKrw;
  const marginPercent = grossSalesKrw > 0 ? Math.round((netProfitKrw / grossSalesKrw) * 100) : 0;

  const blockersKo: string[] = [];
  if (!input.rightsBomCleared) {
    blockersKo.push("상업 권리 BOM 미완료 상태에서는 오프라인 굿즈 인쇄 출고가 차단됩니다.");
  }
  if (price <= unitCostKrw) {
    blockersKo.push("판매가가 제작 단가 이하입니다. 단가 또는 수량 구간을 조정하세요.");
  }

  return {
    skuLabelKo: sku.labelKo,
    unitCostKrw,
    totalCostKrw,
    grossSalesKrw,
    netProfitKrw,
    marginPercent,
    printReady: blockersKo.length === 0,
    bleedSpecKo: sku.bleedSpecKo,
    qrFlowSummaryKo: input.includeQrStampCard
      ? "오프라인 QR 스캔 → 전용 4컷 웹툰·스탬프 카드 열람 → 작품 구독 환류"
      : "QR 스탬프 미포함 (단독 굿즈 인쇄 출고)",
    blockersKo,
  };
}
