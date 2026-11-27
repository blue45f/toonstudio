/**
 * Wave-61: 모바일 자동 컷 분할기 및 글로벌 문화권 배경·소품 비파괴 치환 엔진.
 *
 * 1. `slicePanelForMobileReading`: 가로형·복합 컷을 모바일 세로 뷰포트(`360~430px`)
 *    가독성 기준으로 분할하되 인물 얼굴(`face`)과 말풍선(`speech-balloon`) 절단을
 *    해석적 경계 제약으로 절대 금지한다.
 * 2. `planCulturalBackgroundAdaptation`: 5개 문화권(`ko-KR | en-US | ja-JP | zh-TW | fr-FR`)
 *    대상으로 간판 타이포그래피, 화폐·가격 표기, 좌우통행(텍스트 역전 방지 포함),
 *    계절 문화 소품을 원본 레이어 훼손 없는 비파괴 오버라이드 계획으로 결정론 산출한다.
 */

export type CulturalLocale = "en-US" | "fr-FR" | "ja-JP" | "ko-KR" | "zh-TW";
export type PanelReadingDirection = "ltr" | "rtl";
export type ProtectedPanelRegionKind = "face" | "focal-prop" | "sfx-text" | "speech-balloon";
export type CulturalPropCategory = "currency" | "seasonal-prop" | "signage" | "traffic-hand";
export type CulturalSeason = "autumn" | "spring" | "summer" | "winter";
export type TrafficHandedness = "LHT" | "RHT";

export interface PanelRect2D {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export interface ProtectedPanelRegion {
  readonly bounds: PanelRect2D;
  readonly fontSizePx?: number;
  readonly id: string;
  readonly kind: ProtectedPanelRegionKind;
  readonly linkedSpeakerId?: string;
  readonly readingOrder?: number;
}

export interface MobilePanelSliceInput {
  readonly heightPx: number;
  readonly panelId: string;
  readonly protectedRegions: readonly ProtectedPanelRegion[];
  readonly readingDirection?: PanelReadingDirection;
  readonly safeMarginPx?: number;
  readonly viewportWidthPx?: number;
  readonly widthPx: number;
}

export interface MobilePanelSlice {
  readonly containedRegionIds: readonly string[];
  readonly focalPointNormalized: { readonly x: number; readonly y: number };
  readonly gutterAfterPx: number;
  readonly orderIndex: number;
  readonly readabilityScore: number;
  readonly renderHeightPx: number;
  readonly renderWidthPx: number;
  readonly scaleRatio: number;
  readonly sliceId: string;
  readonly sourceCropRect: PanelRect2D;
  readonly zoomOutAppliedForContainment: boolean;
}

export interface MobileSliceIntegrityReport {
  readonly allProtectedPreserved: boolean;
  readonly minReadabilityScore: number;
  readonly protectedBalloonCount: number;
  readonly protectedFaceCount: number;
  readonly slicedBalloonIds: readonly string[];
  readonly slicedFaceIds: readonly string[];
  readonly warnings: readonly string[];
}

export interface MobilePanelSlicePlan {
  readonly integrityReport: MobileSliceIntegrityReport;
  readonly panelId: string;
  readonly readingDirection: PanelReadingDirection;
  readonly slices: readonly MobilePanelSlice[];
  readonly sourceSizePx: { readonly height: number; readonly width: number };
  readonly viewportWidthPx: number;
}

export interface CulturalBackgroundPropInput {
  readonly assetKey: string;
  readonly bounds: PanelRect2D;
  readonly category: CulturalPropCategory;
  readonly currencyAmount?: number;
  readonly id: string;
  readonly overlapsCharacterMask?: boolean;
  readonly textLabel?: string;
}

export interface CulturalAdaptationInput {
  readonly panelId: string;
  readonly props: readonly CulturalBackgroundPropInput[];
  readonly season: CulturalSeason;
  readonly sourceLocale: CulturalLocale;
  readonly targetLocale: CulturalLocale;
}

export interface CulturalPropTransformPatch {
  readonly horizontalFlip: boolean;
  readonly preserveTextOrientation: boolean;
  readonly speedUnit: "km/h" | "mph";
  readonly writingMode: "horizontal-tb" | "vertical-rl";
}

export interface CulturalPropTextPatch {
  readonly currencyCode?: string;
  readonly fontStack: string;
  readonly formattedValue: string;
  readonly localizedLabel: string;
}

export interface CulturalPropAdaptationItem {
  readonly baseAssetId: string;
  readonly category: CulturalPropCategory;
  readonly changed: boolean;
  readonly mode: "non-destructive-override";
  readonly overlayLayerId: string;
  readonly preserveOriginalLayer: true;
  readonly propId: string;
  readonly rationale: string;
  readonly replacementAssetKey: string;
  readonly requiresArtistReview: boolean;
  readonly textPatch: CulturalPropTextPatch;
  readonly transformPatch: CulturalPropTransformPatch;
}

export interface CulturalAdaptationSummary {
  readonly modifiedCount: number;
  readonly reviewRequiredCount: number;
  readonly totalProps: number;
  readonly trafficFlippedCount: number;
  readonly unchangedCount: number;
}

export interface CulturalPropAdaptationPlan {
  readonly items: readonly CulturalPropAdaptationItem[];
  readonly panelId: string;
  readonly planFingerprint: string;
  readonly season: CulturalSeason;
  readonly sourceLocale: CulturalLocale;
  readonly summary: CulturalAdaptationSummary;
  readonly targetLocale: CulturalLocale;
  readonly targetTrafficHand: TrafficHandedness;
  readonly trafficHandChanged: boolean;
}

interface LocaleCulturalProfile {
  readonly currencyCode: "EUR" | "JPY" | "KRW" | "TWD" | "USD";
  readonly currencySymbol: string;
  readonly decimals: number;
  readonly krwPerUnit: number;
  readonly locale: CulturalLocale;
  readonly priceStep: number;
  readonly roadStopLabel: string;
  readonly seasonalAssets: Readonly<
    Record<CulturalSeason, { readonly assetKey: string; readonly label: string }>
  >;
  readonly signageFontStack: string;
  readonly signageLabelPrefix: string;
  readonly signageStyleKey: string;
  readonly signageWritingMode: "horizontal-tb" | "vertical-rl";
  readonly speedUnit: "km/h" | "mph";
  readonly trafficHand: TrafficHandedness;
}

/** 5개 글로벌 출고 문화권 정본 프로파일 테이블. */
export const CULTURAL_LOCALE_PROFILES: Readonly<Record<CulturalLocale, LocaleCulturalProfile>> = {
  "ko-KR": {
    currencyCode: "KRW", currencySymbol: "₩", decimals: 0, krwPerUnit: 1, locale: "ko-KR",
    priceStep: 100, roadStopLabel: "정지",
    seasonalAssets: {
      autumn: { assetKey: "prop/kr/autumn-ginkgo-roasted-chestnut", label: "은행잎·군밤 노점" },
      spring: { assetKey: "prop/kr/spring-cherry-forsythia-banner", label: "벚꽃·개나리 거리 배너" },
      summer: { assetKey: "prop/kr/summer-bingsu-parasol", label: "빙수 간판·여름 양산" },
      winter: { assetKey: "prop/kr/winter-bungeoppang-stall", label: "붕어빵 포장마차" },
    },
    signageFontStack: "'Pretendard', 'Noto Sans KR', sans-serif", signageLabelPrefix: "상점",
    signageStyleKey: "sign/kr/hangul-clean-facade", signageWritingMode: "horizontal-tb",
    speedUnit: "km/h", trafficHand: "RHT",
  },
  "en-US": {
    currencyCode: "USD", currencySymbol: "$", decimals: 2, krwPerUnit: 1350, locale: "en-US",
    priceStep: 0.25, roadStopLabel: "STOP",
    seasonalAssets: {
      autumn: { assetKey: "prop/us/autumn-pumpkin-maple-porch", label: "Autumn Pumpkin & Maple Porch" },
      spring: { assetKey: "prop/us/spring-farmers-market-awning", label: "Spring Farmers Market Awning" },
      summer: { assetKey: "prop/us/summer-iced-lemonade-stand", label: "Summer Lemonade & Patio" },
      winter: { assetKey: "prop/us/winter-pine-wreath-cocoa", label: "Winter Pine Wreath & Cocoa" },
    },
    signageFontStack: "'Inter', 'Helvetica Neue', sans-serif", signageLabelPrefix: "Shop",
    signageStyleKey: "sign/us/storefront-awning-sans", signageWritingMode: "horizontal-tb",
    speedUnit: "mph", trafficHand: "RHT",
  },
  "ja-JP": {
    currencyCode: "JPY", currencySymbol: "¥", decimals: 0, krwPerUnit: 9.0, locale: "ja-JP",
    priceStep: 10, roadStopLabel: "止まれ",
    seasonalAssets: {
      autumn: { assetKey: "prop/jp/autumn-momiji-yakiimo", label: "紅葉・焼き芋屋台" },
      spring: { assetKey: "prop/jp/spring-sakura-noren", label: "桜並木・春の暖簾" },
      summer: { assetKey: "prop/jp/summer-furin-kakigori-flag", label: "風鈴・氷旗" },
      winter: { assetKey: "prop/jp/winter-kadomatsu-kotatsu", label: "門松・冬提灯" },
    },
    signageFontStack: "'Noto Sans JP', 'Hiragino Kaku Gothic ProN', sans-serif", signageLabelPrefix: "商店",
    signageStyleKey: "sign/jp/vertical-kanban-noren", signageWritingMode: "vertical-rl",
    speedUnit: "km/h", trafficHand: "LHT",
  },
  "zh-TW": {
    currencyCode: "TWD", currencySymbol: "NT$", decimals: 0, krwPerUnit: 42.0, locale: "zh-TW",
    priceStep: 5, roadStopLabel: "停",
    seasonalAssets: {
      autumn: { assetKey: "prop/tw/autumn-mooncake-lantern", label: "中秋燈籠・柚子攤" },
      spring: { assetKey: "prop/tw/spring-tung-blossom-lantern", label: "桐花・春季紅燈籠" },
      summer: { assetKey: "prop/tw/summer-mango-shaved-ice", label: "芒果冰招牌・騎樓遮陽" },
      winter: { assetKey: "prop/tw/winter-tangyuan-night-market", label: "熱湯圓・夜市暖爐攤" },
    },
    signageFontStack: "'Noto Sans TC', 'PingFang TC', sans-serif", signageLabelPrefix: "商號",
    signageStyleKey: "sign/tw/traditional-vertical-board", signageWritingMode: "vertical-rl",
    speedUnit: "km/h", trafficHand: "RHT",
  },
  "fr-FR": {
    currencyCode: "EUR", currencySymbol: "€", decimals: 2, krwPerUnit: 1460, locale: "fr-FR",
    priceStep: 0.5, roadStopLabel: "STOP",
    seasonalAssets: {
      autumn: { assetKey: "prop/fr/autumn-marrons-chauds-bistro", label: "Marrons chauds et terrasse d'automne" },
      spring: { assetKey: "prop/fr/spring-muguet-boulangerie", label: "Muguet et terrasse printanière" },
      summer: { assetKey: "prop/fr/summer-glacier-parasol", label: "Glacier et parasol estival" },
      winter: { assetKey: "prop/fr/winter-vin-chaud-marche", label: "Vin chaud et guirlandes d'hiver" },
    },
    signageFontStack: "'Garamond', 'Noto Serif', serif", signageLabelPrefix: "Boutique",
    signageStyleKey: "sign/fr/boutique-serif-awning", signageWritingMode: "horizontal-tb",
    speedUnit: "km/h", trafficHand: "RHT",
  },
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeRect(rect: PanelRect2D, maxW: number, maxH: number): PanelRect2D {
  const x = clamp(finiteOr(rect.x, 0), 0, maxW);
  const y = clamp(finiteOr(rect.y, 0), 0, maxH);
  return {
    height: clamp(finiteOr(rect.height, 1), 1, Math.max(1, maxH - y)),
    width: clamp(finiteOr(rect.width, 1), 1, Math.max(1, maxW - x)),
    x, y,
  };
}

function rectContains(outer: PanelRect2D, inner: PanelRect2D): boolean {
  const eps = 1e-4;
  return (
    outer.x <= inner.x + eps &&
    outer.y <= inner.y + eps &&
    outer.x + outer.width >= inner.x + inner.width - eps &&
    outer.y + outer.height >= inner.y + inner.height - eps
  );
}

function rectUnion(a: PanelRect2D, b: PanelRect2D): PanelRect2D {
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  return {
    height: Math.max(a.y + a.height, b.y + b.height) - minY,
    width: Math.max(a.x + a.width, b.x + b.width) - minX,
    x: minX, y: minY,
  };
}

function rectDistance(a: PanelRect2D, b: PanelRect2D): number {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height)));
  return Math.hypot(dx, dy);
}

interface RegionCluster {
  bounds: PanelRect2D;
  minReadingOrder: number;
  regions: ProtectedPanelRegion[];
}

function compareReadingOrder(
  a: RegionCluster, b: RegionCluster, direction: PanelReadingDirection, rowBandHeight: number,
): number {
  if (a.minReadingOrder !== b.minReadingOrder) return a.minReadingOrder - b.minReadingOrder;
  const band = Math.max(40, rowBandHeight);
  const aRow = Math.floor((a.bounds.y + a.bounds.height * 0.5) / band);
  const bRow = Math.floor((b.bounds.y + b.bounds.height * 0.5) / band);
  if (aRow !== bRow) return aRow - bRow;
  const aCx = a.bounds.x + a.bounds.width * 0.5;
  const bCx = b.bounds.x + b.bounds.width * 0.5;
  return direction === "rtl" ? bCx - aCx : aCx - bCx;
}

/**
 * 가로·복합 웹툰 컷을 모바일 세로 뷰포트(`360~430px`) 가독성 기준으로
 * 안전하게 분할한다. 모든 `face` 및 `speech-balloon` 보호 영역은 어떤 분할선에도
 * 절단되지 않고 최소 하나의 분할 컷 안에 완전 포함된다.
 */
export function slicePanelForMobileReading(input: MobilePanelSliceInput): MobilePanelSlicePlan {
  const panelW = Math.max(64, finiteOr(input.widthPx, 1200));
  const panelH = Math.max(64, finiteOr(input.heightPx, 800));
  const viewportWidthPx = Math.round(clamp(finiteOr(input.viewportWidthPx, 390), 360, 430));
  const readingDirection: PanelReadingDirection = input.readingDirection ?? "ltr";
  const safeMarginPx = clamp(finiteOr(input.safeMarginPx, 16), 4, 64);

  const normalizedRegions: ProtectedPanelRegion[] = input.protectedRegions.map((reg) => ({
    ...reg,
    bounds: normalizeRect(reg.bounds, panelW, panelH),
  }));

  const nominalCropW = Math.min(panelW, Math.max(viewportWidthPx * 1.45, panelH * 0.72));
  const nominalCropH = Math.min(panelH, nominalCropW * 1.35);
  const clusters: RegionCluster[] = [];

  if (normalizedRegions.length === 0) {
    const horizontalCount = panelW / panelH >= 1.45 ? Math.max(2, Math.ceil(panelW / nominalCropW)) : 1;
    const stepW = panelW / horizontalCount;
    for (let i = 0; i < horizontalCount; i += 1) {
      const idx = readingDirection === "rtl" ? horizontalCount - 1 - i : i;
      clusters.push({ bounds: { height: panelH, width: stepW, x: idx * stepW, y: 0 }, minReadingOrder: i, regions: [] });
    }
  } else {
    const assigned = new Set<string>();
    const sortedRegions = [...normalizedRegions].sort((a, b) => {
      const oa = finiteOr(a.readingOrder, Number.POSITIVE_INFINITY);
      const ob = finiteOr(b.readingOrder, Number.POSITIVE_INFINITY);
      if (oa !== ob) return oa - ob;
      const dx = readingDirection === "rtl" ? b.bounds.x - a.bounds.x : a.bounds.x - b.bounds.x;
      return dx !== 0 ? dx : a.bounds.y - b.bounds.y;
    });

    for (const seed of sortedRegions) {
      if (assigned.has(seed.id)) continue;
      assigned.add(seed.id);
      let clusterBounds = seed.bounds;
      const members: ProtectedPanelRegion[] = [seed];
      let minOrder = finiteOr(seed.readingOrder, Number.POSITIVE_INFINITY);

      let mergedAny = true;
      while (mergedAny) {
        mergedAny = false;
        for (const candidate of sortedRegions) {
          if (assigned.has(candidate.id)) continue;
          const linkedMatch = members.some(
            (m) =>
              (m.linkedSpeakerId !== undefined && m.linkedSpeakerId === candidate.id) ||
              (candidate.linkedSpeakerId !== undefined && candidate.linkedSpeakerId === m.id),
          );
          const unionRect = rectUnion(clusterBounds, candidate.bounds);
          const paddedWidth = unionRect.width + safeMarginPx * 2;
          const paddedHeight = unionRect.height + safeMarginPx * 2;
          const fitsComfortably = paddedWidth <= nominalCropW * 1.05 && paddedHeight <= nominalCropH * 1.15;
          const nearEnough = rectDistance(clusterBounds, candidate.bounds) <= safeMarginPx * 3.5;

          if ((linkedMatch && paddedWidth <= panelW * 0.85) || (fitsComfortably && nearEnough)) {
            assigned.add(candidate.id);
            members.push(candidate);
            clusterBounds = unionRect;
            minOrder = Math.min(minOrder, finiteOr(candidate.readingOrder, Number.POSITIVE_INFINITY));
            mergedAny = true;
          }
        }
      }
      clusters.push({ bounds: clusterBounds, minReadingOrder: minOrder, regions: members });
    }
    clusters.sort((a, b) => compareReadingOrder(a, b, readingDirection, panelH * 0.45));
  }

  const warnings: string[] = [];
  const slices: MobilePanelSlice[] = [];

  for (let i = 0; i < clusters.length; i += 1) {
    const cluster = clusters[i];
    const requiredW = Math.min(panelW, cluster.bounds.width + safeMarginPx * 2);
    const requiredH = Math.min(panelH, cluster.bounds.height + safeMarginPx * 2);
    const zoomOutApplied = requiredW > nominalCropW;
    const cropW = clamp(Math.max(nominalCropW, requiredW), Math.min(panelW, 240), panelW);
    const cropH = clamp(Math.max(requiredH, Math.min(panelH, cropW * 1.12)), requiredH, panelH);

    const centerX = cluster.bounds.x + cluster.bounds.width * 0.5;
    const centerY = cluster.bounds.y + cluster.bounds.height * 0.5;
    let cropX = clamp(centerX - cropW * 0.5, 0, Math.max(0, panelW - cropW));
    let cropY = clamp(centerY - cropH * 0.5, 0, Math.max(0, panelH - cropH));

    if (cropX > cluster.bounds.x) cropX = Math.max(0, cluster.bounds.x);
    if (cropX + cropW < cluster.bounds.x + cluster.bounds.width) {
      cropX = Math.max(0, cluster.bounds.x + cluster.bounds.width - cropW);
    }
    if (cropY > cluster.bounds.y) cropY = Math.max(0, cluster.bounds.y);
    if (cropY + cropH < cluster.bounds.y + cluster.bounds.height) {
      cropY = Math.max(0, cluster.bounds.y + cluster.bounds.height - cropH);
    }

    let cropLeft = cropX;
    let cropRight = Math.min(panelW, cropX + cropW);
    const cropTop = cropY;
    const cropBottom = Math.min(panelH, cropY + cropH);

    // 인접 클러스터의 얼굴·말풍선을 크롭 경계선이 절반 자르지 않도록 안전 후퇴
    const memberIds = new Set(cluster.regions.map((r) => r.id));
    for (const other of normalizedRegions) {
      if (memberIds.has(other.id)) continue;
      if (other.kind !== "face" && other.kind !== "speech-balloon") continue;
      const ob = other.bounds;
      const oRight = ob.x + ob.width;
      const overlapsY = cropTop < ob.y + ob.height && cropBottom > ob.y;
      const overlapsX = cropLeft < oRight && cropRight > ob.x;
      if (!overlapsX || !overlapsY) continue;

      const currentRect: PanelRect2D = {
        height: cropBottom - cropTop, width: cropRight - cropLeft, x: cropLeft, y: cropTop,
      };
      if (rectContains(currentRect, ob)) continue;

      const clusterRight = cluster.bounds.x + cluster.bounds.width;
      const clusterLeft = cluster.bounds.x;
      if (ob.x >= clusterRight && cropRight > ob.x) {
        cropRight = Math.max(clusterRight, ob.x - 2);
      } else if (oRight <= clusterLeft && cropLeft < oRight) {
        cropLeft = Math.min(clusterLeft, oRight + 2);
      }
    }

    const sourceCropRect: PanelRect2D = {
      height: Math.max(1, cropBottom - cropTop),
      width: Math.max(1, cropRight - cropLeft),
      x: cropLeft, y: cropTop,
    };
    const scaleRatio = viewportWidthPx / sourceCropRect.width;
    const containedRegionIds = normalizedRegions
      .filter((reg) => rectContains(sourceCropRect, reg.bounds))
      .map((reg) => reg.id);

    let minRenderedFontPx = 15;
    for (const reg of cluster.regions) {
      if (reg.kind === "speech-balloon") {
        minRenderedFontPx = Math.min(minRenderedFontPx, finiteOr(reg.fontSizePx, 24) * scaleRatio);
      }
    }
    const readabilityScore = Math.round(
      clamp(clamp((minRenderedFontPx / 12) * 100, 35, 100) * 0.65 + clamp(scaleRatio * 145, 45, 100) * 0.35, 0, 100),
    );
    if (zoomOutApplied) {
      warnings.push(
        `슬라이스 ${i + 1}: 대형 보호 영역 보존을 위해 크롭 폭을 ${Math.round(sourceCropRect.width)}px로 확장함`,
      );
    }

    slices.push({
      containedRegionIds,
      focalPointNormalized: {
        x: clamp((centerX - sourceCropRect.x) / Math.max(1, sourceCropRect.width), 0, 1),
        y: clamp((centerY - sourceCropRect.y) / Math.max(1, sourceCropRect.height), 0, 1),
      },
      gutterAfterPx: i < clusters.length - 1 ? Math.round(viewportWidthPx * 0.08) : 0,
      orderIndex: i, readabilityScore,
      renderHeightPx: Math.round(sourceCropRect.height * scaleRatio),
      renderWidthPx: viewportWidthPx, scaleRatio,
      sliceId: `${input.panelId}:mobile-slice-${i + 1}`,
      sourceCropRect, zoomOutAppliedForContainment: zoomOutApplied,
    });
  }

  const slicedFaceIds: string[] = [];
  const slicedBalloonIds: string[] = [];
  let protectedFaceCount = 0;
  let protectedBalloonCount = 0;
  for (const reg of normalizedRegions) {
    if (reg.kind === "face") protectedFaceCount += 1;
    if (reg.kind === "speech-balloon") protectedBalloonCount += 1;
    if (!slices.some((s) => rectContains(s.sourceCropRect, reg.bounds))) {
      if (reg.kind === "face") slicedFaceIds.push(reg.id);
      if (reg.kind === "speech-balloon") slicedBalloonIds.push(reg.id);
    }
  }

  return {
    integrityReport: {
      allProtectedPreserved: slicedFaceIds.length === 0 && slicedBalloonIds.length === 0,
      minReadabilityScore: slices.reduce((acc, s) => Math.min(acc, s.readabilityScore), 100),
      protectedBalloonCount, protectedFaceCount, slicedBalloonIds, slicedFaceIds, warnings,
    },
    panelId: input.panelId, readingDirection, slices,
    sourceSizePx: { height: panelH, width: panelW }, viewportWidthPx,
  };
}

function formatLocalizedCurrency(
  amountInSource: number,
  sourceProfile: LocaleCulturalProfile,
  targetProfile: LocaleCulturalProfile,
): string {
  const inKrw = Math.max(0, finiteOr(amountInSource, 0)) * sourceProfile.krwPerUnit;
  const step = Math.max(0.01, targetProfile.priceStep);
  const rounded = Math.max(step, Math.round(inKrw / targetProfile.krwPerUnit / step) * step);
  if (targetProfile.locale === "fr-FR") {
    return `${rounded.toFixed(targetProfile.decimals).replace(".", ",")} ${targetProfile.currencySymbol}`;
  }
  if (targetProfile.decimals === 0) {
    return `${targetProfile.currencySymbol}${Math.round(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  }
  return `${targetProfile.currencySymbol}${rounded.toFixed(targetProfile.decimals)}`;
}

function fnv1aHex32(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * 글로벌 출고 시 배경 간판·화폐·좌우통행·계절 소품을 대상 문화권에 맞춰
 * 비파괴 오버라이드 계획으로 결정론 산출한다.
 */
export function planCulturalBackgroundAdaptation(
  input: CulturalAdaptationInput,
): CulturalPropAdaptationPlan {
  const sourceProfile = CULTURAL_LOCALE_PROFILES[input.sourceLocale];
  const targetProfile = CULTURAL_LOCALE_PROFILES[input.targetLocale];
  const sameLocale = input.sourceLocale === input.targetLocale;
  const trafficHandChanged = sourceProfile.trafficHand !== targetProfile.trafficHand;

  const sortedProps = [...input.props].sort((a, b) => a.id.localeCompare(b.id));
  const items: CulturalPropAdaptationItem[] = [];
  let modifiedCount = 0;
  let unchangedCount = 0;
  let trafficFlippedCount = 0;
  let reviewRequiredCount = 0;

  for (const prop of sortedProps) {
    const overlayLayerId = `cultural-override:${input.targetLocale}:${prop.id}`;
    const baseOverlapReview = Boolean(prop.overlapsCharacterMask);

    if (prop.category === "signage") {
      const changed = !sameLocale;
      const labelBody = prop.textLabel?.trim() || prop.assetKey;
      const localizedLabel = changed ? `${targetProfile.signageLabelPrefix} · ${labelBody}` : labelBody;
      const requiresArtistReview =
        baseOverlapReview || (changed && sourceProfile.signageWritingMode !== targetProfile.signageWritingMode);
      if (changed) modifiedCount += 1; else unchangedCount += 1;
      if (requiresArtistReview) reviewRequiredCount += 1;

      items.push({
        baseAssetId: prop.assetKey, category: "signage", changed, mode: "non-destructive-override",
        overlayLayerId, preserveOriginalLayer: true, propId: prop.id,
        rationale: changed
          ? `${input.targetLocale} 간판 서체(${targetProfile.signageWritingMode})와 현지 간판 스타일로 비파괴 오버레이 치환`
          : "원본 문화권과 동일해 원본 간판 레이어 유지",
        replacementAssetKey: changed ? `${targetProfile.signageStyleKey}/${prop.id}` : prop.assetKey,
        requiresArtistReview,
        textPatch: { fontStack: targetProfile.signageFontStack, formattedValue: localizedLabel, localizedLabel },
        transformPatch: {
          horizontalFlip: false, preserveTextOrientation: true,
          speedUnit: targetProfile.speedUnit, writingMode: targetProfile.signageWritingMode,
        },
      });
      continue;
    }

    if (prop.category === "currency") {
      const changed = !sameLocale;
      const formattedValue = formatLocalizedCurrency(finiteOr(prop.currencyAmount, 5000), sourceProfile, targetProfile);
      const requiresArtistReview = baseOverlapReview;
      if (changed) modifiedCount += 1; else unchangedCount += 1;
      if (requiresArtistReview) reviewRequiredCount += 1;

      items.push({
        baseAssetId: prop.assetKey, category: "currency", changed, mode: "non-destructive-override",
        overlayLayerId, preserveOriginalLayer: true, propId: prop.id,
        rationale: changed
          ? `${sourceProfile.currencyCode} 가격을 ${targetProfile.currencyCode}(${formattedValue})로 심리 가격 반올림 치환`
          : "동일 통화권으로 기존 가격 표기 유지",
        replacementAssetKey: changed ? `currency/${targetProfile.currencyCode.toLowerCase()}/price-tag` : prop.assetKey,
        requiresArtistReview,
        textPatch: {
          currencyCode: targetProfile.currencyCode, fontStack: targetProfile.signageFontStack,
          formattedValue, localizedLabel: `${targetProfile.currencyCode} ${formattedValue}`,
        },
        transformPatch: {
          horizontalFlip: false, preserveTextOrientation: true,
          speedUnit: targetProfile.speedUnit, writingMode: "horizontal-tb",
        },
      });
      continue;
    }

    if (prop.category === "traffic-hand") {
      const changed = !sameLocale;
      const horizontalFlip = trafficHandChanged;
      const requiresArtistReview = baseOverlapReview || horizontalFlip;
      if (changed) modifiedCount += 1; else unchangedCount += 1;
      if (horizontalFlip) trafficFlippedCount += 1;
      if (requiresArtistReview) reviewRequiredCount += 1;

      items.push({
        baseAssetId: prop.assetKey, category: "traffic-hand", changed, mode: "non-destructive-override",
        overlayLayerId, preserveOriginalLayer: true, propId: prop.id,
        rationale: horizontalFlip
          ? `${sourceProfile.trafficHand}→${targetProfile.trafficHand} 차선·표지판 좌우 반전 적용(텍스트 정방향 보존)`
          : changed
            ? `동일 통행 방향(${targetProfile.trafficHand}) 유지, 표지 문구(${targetProfile.roadStopLabel})·속도 단위(${targetProfile.speedUnit}) 현지화`
            : "원본 도로 교통 규칙 유지",
        replacementAssetKey: changed
          ? `traffic/${input.targetLocale.toLowerCase()}/${targetProfile.trafficHand.toLowerCase()}-signage`
          : prop.assetKey,
        requiresArtistReview,
        textPatch: {
          fontStack: targetProfile.signageFontStack,
          formattedValue: `${targetProfile.roadStopLabel} · ${targetProfile.speedUnit}`,
          localizedLabel: targetProfile.roadStopLabel,
        },
        transformPatch: {
          horizontalFlip, preserveTextOrientation: true,
          speedUnit: targetProfile.speedUnit, writingMode: "horizontal-tb",
        },
      });
      continue;
    }

    const seasonalSpec = targetProfile.seasonalAssets[input.season];
    const changed = !sameLocale || prop.assetKey !== seasonalSpec.assetKey;
    const requiresArtistReview = baseOverlapReview;
    if (changed) modifiedCount += 1; else unchangedCount += 1;
    if (requiresArtistReview) reviewRequiredCount += 1;

    items.push({
      baseAssetId: prop.assetKey, category: "seasonal-prop", changed, mode: "non-destructive-override",
      overlayLayerId, preserveOriginalLayer: true, propId: prop.id,
      rationale: changed
        ? `${input.targetLocale} ${input.season} 계절 문화 소품(${seasonalSpec.label})으로 비파괴 교체`
        : "현지 계절 소품과 이미 일치함",
      replacementAssetKey: seasonalSpec.assetKey, requiresArtistReview,
      textPatch: {
        fontStack: targetProfile.signageFontStack,
        formattedValue: seasonalSpec.label, localizedLabel: seasonalSpec.label,
      },
      transformPatch: {
        horizontalFlip: false, preserveTextOrientation: true,
        speedUnit: targetProfile.speedUnit, writingMode: "horizontal-tb",
      },
    });
  }

  const canonicalSignature = [
    input.panelId, input.sourceLocale, input.targetLocale, input.season,
    ...items.map((it) => `${it.propId}|${it.replacementAssetKey}|${it.transformPatch.horizontalFlip}|${it.textPatch.formattedValue}`),
  ].join("::");

  return {
    items, panelId: input.panelId,
    planFingerprint: `wave61-culture-${fnv1aHex32(canonicalSignature)}`,
    season: input.season, sourceLocale: input.sourceLocale,
    summary: { modifiedCount, reviewRequiredCount, totalProps: items.length, trafficFlippedCount, unchangedCount },
    targetLocale: input.targetLocale, targetTrafficHand: targetProfile.trafficHand, trafficHandChanged,
  };
}
