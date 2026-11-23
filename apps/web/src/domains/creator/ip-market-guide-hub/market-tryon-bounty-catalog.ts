/**
 * 마켓 30초 무료 시착 · 권리 BOM 로열티 · 공동제작 바운티 · POD 굿즈 카탈로그 및 타입 정의.
 */

export type MarketTryOnStatus = "active" | "expired" | "unlocked-purchased";

export type TryOnCompareMode = "after" | "before" | "split";

export interface MarketTryOnCatalogItem {
  readonly assetId: string;
  readonly titleKo: string;
  readonly categoryKo: string;
  readonly authorName: string;
  readonly priceKrw: number;
  readonly previewSummaryKo: string;
  readonly spritePath: string;
  readonly licenseScopeKo: string;
}

export type BomContributorRole =
  | "original-3d"
  | "shader-material"
  | "font-typography"
  | "rig-pose"
  | "sound-sfx"
  | "layout-assembly";

export interface BomRoyaltyContributor {
  readonly id: string;
  readonly displayName: string;
  readonly role: BomContributorRole;
  readonly roleLabelKo: string;
  readonly weight: number;
}

export type AssetBountyStatus = "open" | "funded" | "in-production" | "delivered";

export interface AssetBountyItem {
  readonly id: string;
  readonly titleKo: string;
  readonly categoryKo: string;
  readonly targetKrw: number;
  readonly pledgedKrw: number;
  readonly backerCount: number;
  readonly minPledgeKrw: number;
  readonly deadlineDays: number;
  readonly commercialLicenseIncluded: boolean;
  readonly deliverableSpecKo: string;
  readonly status: AssetBountyStatus;
}

export type PodProductType =
  | "acrylic-stand"
  | "artbook-cover"
  | "postcard-set"
  | "sticker-sheet"
  | "poster-a3";

export type PodColorProfile =
  | "CMYK-FOGRA39"
  | "CMYK-JapanColor2001"
  | "sRGB"
  | "Display-P3";

export const MARKET_TRYON_CATALOG: readonly MarketTryOnCatalogItem[] = [
  {
    assetId: "tryon-rooftop-sunset-3d",
    titleKo: "노을 옥상 3D 스테이지 + 3단 셀 셰이더",
    categoryKo: "3D 배경 · 셰이더",
    authorName: "배경 공방 × 셰이더 랩",
    priceKrw: 28000,
    previewSummaryKo: "현재 캔버스 컷에 워터마크 프리뷰로 바로 올려 카메라 앵글과 선화 추출을 30초간 확인합니다.",
    spritePath: "/assets/studio/vibrant-sprites/tool-bg3d.webp",
    licenseScopeKo: "상업 연재 · 2차 굿즈 · 게임 바이너리 포함",
  },
  {
    assetId: "tryon-ink-brush-pack",
    titleKo: "동양화 먹선·수채화 번짐 프로 브러시 12종",
    categoryKo: "브러시 · 질감",
    authorName: "먹물 아틀리에",
    priceKrw: 14000,
    previewSummaryKo: "시착 중 30초간 필압과 종이 질감 반응을 직접 그려 본 뒤 마음에 들면 레이어를 유지한 채 잠금 해제합니다.",
    spritePath: "/assets/studio/vibrant-sprites/emblem-market.webp",
    licenseScopeKo: "상업 연재 · 상업 일러스트 허용",
  },
  {
    assetId: "tryon-sfx-font-bundle",
    titleKo: "액션 타격음 손글씨 SFX 폰트 + 말풍선 키트",
    categoryKo: "식자 · 효과음",
    authorName: "한글 타이포 길드",
    priceKrw: 19000,
    previewSummaryKo: "작업 중인 컷의 대사와 효과음에 즉시 입혀 가독성과 3줄 제한 균형을 비교합니다.",
    spritePath: "/assets/studio/vibrant-sprites/emblem-community.webp",
    licenseScopeKo: "상업 연재 · 영상 자막 · POD 굿즈 허용",
  },
];

export const DEFAULT_BOM_ROYALTY_CONTRIBUTORS: readonly BomRoyaltyContributor[] = [
  {
    id: "contrib-3d",
    displayName: "배경 공방 (원작 3D 모델)",
    role: "original-3d",
    roleLabelKo: "원작 3D 메시",
    weight: 55,
  },
  {
    id: "contrib-shader",
    displayName: "아틀리에 셰이더 랩",
    role: "shader-material",
    roleLabelKo: "웹툰 셀 셰이더",
    weight: 25,
  },
  {
    id: "contrib-font",
    displayName: "한글 타이포 길드",
    role: "font-typography",
    roleLabelKo: "임베드 폰트·식자",
    weight: 20,
  },
];

export const MARKET_BOUNTY_PRESETS: readonly AssetBountyItem[] = [
  {
    id: "bounty-hanok-teahouse",
    titleKo: "전통 한옥 2층 찻집 3D 스테이지 + 야간 등불 조명 팩",
    categoryKo: "3D 배경 공동제작",
    targetKrw: 900000,
    pledgedKrw: 675000,
    backerCount: 27,
    minPledgeKrw: 25000,
    deadlineDays: 9,
    commercialLicenseIncluded: true,
    deliverableSpecKo: "비매니폴드 0 GLB · 3층 선화/음영/마스크 프리셋 · 낮/노을/밤 조명",
    status: "open",
  },
  {
    id: "bounty-magic-8dir-atlas",
    titleKo: "판타지 마법진 8방향 게임 스프라이트 아틀라스 + Foley SFX",
    categoryKo: "게임·이펙트 공동제작",
    targetKrw: 600000,
    pledgedKrw: 600000,
    backerCount: 30,
    minPledgeKrw: 20000,
    deadlineDays: 4,
    commercialLicenseIncluded: true,
    deliverableSpecKo: "2048px WebP 아틀라스 · Unity/Godot/Phaser 메타 JSON · WAV/WebAudio 프리셋",
    status: "funded",
  },
  {
    id: "bounty-romance-sfx-fonts",
    titleKo: "로맨스 감성 손글씨 효과음 폰트 3종 + POD CMYK 스탬프",
    categoryKo: "폰트·굿즈 공동제작",
    targetKrw: 500000,
    pledgedKrw: 260000,
    backerCount: 13,
    minPledgeKrw: 20000,
    deadlineDays: 14,
    commercialLicenseIncluded: true,
    deliverableSpecKo: "WOFF2/OTF 상업 임베드 · 한글 11,172자 지원 · CMYK 인쇄 프로파일 포함",
    status: "open",
  },
];

export const POD_PRODUCT_LABELS: Readonly<Record<PodProductType, string>> = {
  "acrylic-stand": "아크릴 스탠드 (칼선 필수)",
  "artbook-cover": "단행본·아트북 표지",
  "postcard-set": "엽서·포토카드 세트",
  "sticker-sheet": "리무버블 스티커 시트 (칼선 필수)",
  "poster-a3": "A3 일러스트 포스터",
};

export type ReaderGoodsProductKind = "acrylic-stand" | "photocard" | "keyring" | "blanket";

export type ReaderGoodsProposalStatus =
  | "voting"
  | "goal-reached"
  | "creator-approved"
  | "in-production";

export interface ReaderGoodsProposal {
  readonly id: string;
  readonly proposerHandle: string;
  readonly episodeNumber: number;
  readonly cutReference: string;
  readonly productKind: ReaderGoodsProductKind;
  readonly productLabelKo: string;
  readonly titleKo: string;
  readonly mockupNoteKo: string;
  readonly voteCount: number;
  readonly voteGoal: number;
  readonly unitPriceKrw: number;
  readonly estimatedOrderQty: number;
  readonly proposerRoyaltyPercent: number;
  readonly proposerPerkKo: string;
  readonly status: ReaderGoodsProposalStatus;
  readonly creatorApprovedAtIso: string | null;
}

export interface CreateReaderGoodsProposalInput {
  readonly id: string;
  readonly proposerHandle: string;
  readonly episodeNumber: number;
  readonly cutReference: string;
  readonly productKind: ReaderGoodsProductKind;
  readonly titleKo: string;
  readonly mockupNoteKo: string;
  readonly voteGoal?: number;
  readonly unitPriceKrw?: number;
  readonly estimatedOrderQty?: number;
  readonly proposerRoyaltyPercent?: number;
}

export interface ReaderGoodsApprovalResult {
  readonly approved: boolean;
  readonly proposal: ReaderGoodsProposal;
  readonly reasonKo: string;
}

export interface ReaderGoodsProposalSettlement {
  readonly proposalId: string;
  readonly grossRevenueKrw: number;
  readonly productionCostKrw: number;
  readonly netProfitKrw: number;
  readonly proposerRoyaltyKrw: number;
  readonly creatorShareKrw: number;
  readonly platformShareKrw: number;
  readonly proposerRoyaltyPercent: number;
  readonly proposerPerkKo: string;
  readonly totalAllocatedNetKrw: number;
  readonly invariantVerified: boolean;
}

export interface LiveMarketTryOnSessionInput {
  readonly sessionId: string;
  readonly assetId: string;
  readonly assetTitleKo: string;
  readonly priceKrw: number;
  readonly durationSeconds?: number;
  readonly startedAtMs: number;
}

export interface LiveMarketTryOnSession {
  readonly sessionId: string;
  readonly assetId: string;
  readonly assetTitleKo: string;
  readonly priceKrw: number;
  readonly durationSeconds: number;
  readonly elapsedSeconds: number;
  readonly remainingSeconds: number;
  readonly progressPercent: number;
  readonly status: MarketTryOnStatus;
  readonly watermarkVisible: boolean;
  readonly watermarkOpacity: number;
  readonly watermarkLabelKo: string;
  readonly compareMode: TryOnCompareMode;
  readonly splitRatio: number;
  readonly startedAtMs: number;
  readonly purchaseReceiptId: string | null;
  readonly unlockedRightsBomId: string | null;
  readonly statusSummaryKo: string;
}

export interface BomRoyaltySplitInput {
  readonly grossSaleKrw: number;
  readonly platformFeePercent?: number;
  readonly contributors: readonly BomRoyaltyContributor[];
}

export interface BomRoyaltyAllocation {
  readonly contributorId: string;
  readonly displayName: string;
  readonly role: BomContributorRole;
  readonly roleLabelKo: string;
  readonly shareBasisPoints: number;
  readonly sharePercent: number;
  readonly payoutKrw: number;
}

export interface BomRoyaltySplitResult {
  readonly grossSaleKrw: number;
  readonly platformFeePercent: number;
  readonly platformFeeKrw: number;
  readonly netCreatorPoolKrw: number;
  readonly allocations: readonly BomRoyaltyAllocation[];
  readonly totalShareBasisPoints: number;
  readonly totalSharePercent: number;
  readonly totalAllocatedKrw: number;
  readonly invariantVerified: boolean;
}

export interface BountyFundingEvaluation {
  readonly progressPercent: number;
  readonly remainingKrw: number;
  readonly isFullyFunded: boolean;
  readonly status: AssetBountyStatus;
  readonly statusLabelKo: string;
}

export interface PodGoodsPrintSpecInput {
  readonly productType: PodProductType;
  readonly trimWidthMm: number;
  readonly trimHeightMm: number;
  readonly bleedMm: number;
  readonly safeMarginMm: number;
  readonly dpi: number;
  readonly colorProfile: PodColorProfile;
  readonly totalInkCoveragePercent: number;
  readonly hasCutContourLayer: boolean;
  readonly rightsBomCommercialClear: boolean;
}

export interface PodSpecCheckItem {
  readonly id: string;
  readonly labelKo: string;
  readonly passed: boolean;
  readonly actualKo: string;
  readonly requiredKo: string;
}

export interface PodGoodsPrintValidation {
  readonly passed: boolean;
  readonly status: "print-ready" | "needs-fix" | "blocked";
  readonly productLabelKo: string;
  readonly bleedBoxWidthMm: number;
  readonly bleedBoxHeightMm: number;
  readonly requiredPixelWidth: number;
  readonly requiredPixelHeight: number;
  readonly checks: readonly PodSpecCheckItem[];
  readonly nextFixesKo: readonly string[];
  readonly summaryKo: string;
}

export const READER_GOODS_PRODUCT_LABELS: Readonly<Record<ReaderGoodsProductKind, string>> = {
  "acrylic-stand": "아크릴 스탠드",
  photocard: "홀로그램 포토카드",
  keyring: "투명 아크릴 키링",
  blanket: "극세사 장면 담요",
};

export const READER_GOODS_PROPOSAL_PRESETS: readonly ReaderGoodsProposal[] = [
  {
    id: "rgp-rooftop-acrylic",
    proposerHandle: "@rainy_reader",
    episodeNumber: 14,
    cutReference: "EP.14 #38 노을 옥상 우산 고백 컷",
    productKind: "acrylic-stand",
    productLabelKo: READER_GOODS_PRODUCT_LABELS["acrylic-stand"],
    titleKo: "노을 옥상 디오라마 2단 아크릴 스탠드",
    mockupNoteKo: "배경 3D 옥상 난간과 주인공 2인 레이어를 분리한 2단 입체 스탠드 목업",
    voteCount: 300,
    voteGoal: 300,
    unitPriceKrw: 22000,
    estimatedOrderQty: 250,
    proposerRoyaltyPercent: 4,
    proposerPerkKo: "초판 스탠드 1세트 무료 증정 + 순수익 4% 제안자 로열티 정산",
    status: "goal-reached",
    creatorApprovedAtIso: null,
  },
  {
    id: "rgp-ep09-photocard",
    proposerHandle: "@atelier_fan88",
    episodeNumber: 9,
    cutReference: "EP.09 #21 첫 합동 연주 클로즈업 컷",
    productKind: "photocard",
    productLabelKo: READER_GOODS_PRODUCT_LABELS.photocard,
    titleKo: "주인공 듀오 양면 홀로그램 포토카드 4종",
    mockupNoteKo: "앞면 명장면 컬러 + 뒷면 손글씨 대사 스탬프 구성",
    voteCount: 195,
    voteGoal: 200,
    unitPriceKrw: 12000,
    estimatedOrderQty: 400,
    proposerRoyaltyPercent: 3,
    proposerPerkKo: "친필 인쇄 초판 포토카드 팩 증정 + 순수익 3% 제안자 로열티",
    status: "voting",
    creatorApprovedAtIso: null,
  },
  {
    id: "rgp-winter-blanket",
    proposerHandle: "@warm_mint_tea",
    episodeNumber: 22,
    cutReference: "EP.22 #52 한옥 찻집 눈 내리는 창가 컷",
    productKind: "blanket",
    productLabelKo: READER_GOODS_PRODUCT_LABELS.blanket,
    titleKo: "겨울 한옥 찻집 명장면 극세사 담요",
    mockupNoteKo: "파노라마 컷 구도를 100×150cm 무릎 담요 비율로 재단선 3mm 확장",
    voteCount: 142,
    voteGoal: 250,
    unitPriceKrw: 34000,
    estimatedOrderQty: 180,
    proposerRoyaltyPercent: 5,
    proposerPerkKo: "초판 담요 1장 무료 증정 + 순수익 5% 제안자 로열티",
    status: "voting",
    creatorApprovedAtIso: null,
  },
];
