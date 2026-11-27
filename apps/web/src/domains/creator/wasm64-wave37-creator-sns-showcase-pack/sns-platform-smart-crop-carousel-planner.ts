/**
 * Wave 37: 창작물 SNS 플랫폼별 스마트 크롭·인스타그램 4:5 캐러셀 분할 및 공유 유입 추적 플래너.
 *
 * - 인스타그램 캐러셀(`1080×1350`, `4:5`): 말풍선·캐릭터 얼굴을 가로지르지 않도록 안전 절단선과
 *   균일 축소 여백(레터박스)을 산출해 최대 `10장` 또는 확장 `20장`까지 분할한다.
 * - X(트위터) 단일 `16:9`(`1600×900`) 및 4분할 쇼케이스(`4-up`): 주목도 가중 앵커 중심 스마트 크롭을 수행한다.
 * - 틱톡·릴스·쇼츠 세로형(`1080×1920`, `9:16`): 상·하·우측 HUD 가림 영역 침범 시 안전 영역 안으로 자동 재배치한다.
 * - 카카오톡·네이버 피드 카드(`800×400` / `800×800`) 및 `ShareChannel` 호환 UTM·Web Share 파일 공유 메타데이터를 생성한다.
 */

import { absoluteShareUrl, type ShareChannel, type SharePayload } from "@/shared/lib/share";

/** 인스타그램 클래식 캐러셀 최대 장수(`10장`). */
export const INSTAGRAM_CAROUSEL_CLASSIC_MAX_SLIDES = 10 as const;
/** 인스타그램 확장 캐러셀 최대 장수(`20장`). */
export const INSTAGRAM_CAROUSEL_EXTENDED_MAX_SLIDES = 20 as const;
/** 창작물 쇼케이스 공유 전용 고정 UTM 매체 식별자. */
export const CREATOR_SHOWCASE_UTM_MEDIUM = "creator_showcase" as const;
/** 창작물 쇼케이스 공유 기본 UTM 캠페인 이름. */
export const DEFAULT_CREATOR_SHOWCASE_CAMPAIGN = "creator_work_showcase" as const;

/** 9:16 숏폼(틱톡·릴스·쇼츠) 플랫폼 UI 오버레이 기본 비안전 여백(`1080×1920` 기준 px). */
export const DEFAULT_VERTICAL_9X16_HUD_INSETS = Object.freeze({
  topPx: 150,
  bottomPx: 320,
  leftPx: 48,
  rightPx: 140,
} as const);

export type SnsShowcasePresetId =
  | "instagram-carousel-4x5"
  | "x-single-16x9"
  | "x-quad-4up"
  | "tiktok-reels-shorts-9x16"
  | "kakao-wide-800x400"
  | "kakao-naver-square-800x800";

export type ShowcaseProtectedRegionKind = "speech-balloon" | "character-face" | "sfx" | "key-prop";

export interface SnsPlatformPresetSpec {
  readonly preset: SnsShowcasePresetId;
  readonly labelKo: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly defaultMaxSlides: number;
  readonly defaultShareChannel: ShareChannel;
}

function presetSpec(
  preset: SnsShowcasePresetId,
  labelKo: string,
  widthPx: number,
  heightPx: number,
  defaultMaxSlides: number,
  defaultShareChannel: ShareChannel,
): SnsPlatformPresetSpec {
  return Object.freeze({ preset, labelKo, widthPx, heightPx, defaultMaxSlides, defaultShareChannel });
}

export const SNS_SHOWCASE_PLATFORM_SPECS: Readonly<Record<SnsShowcasePresetId, SnsPlatformPresetSpec>> =
  Object.freeze({
    "instagram-carousel-4x5": presetSpec("instagram-carousel-4x5", "인스타그램 4:5 캐러셀", 1_080, 1_350, 10, "instagram"),
    "x-single-16x9": presetSpec("x-single-16x9", "X(트위터) 16:9 단일 카드", 1_600, 900, 1, "x"),
    "x-quad-4up": presetSpec("x-quad-4up", "X(트위터) 4분할 16:9 쇼케이스", 1_600, 900, 4, "x"),
    "tiktok-reels-shorts-9x16": presetSpec("tiktok-reels-shorts-9x16", "릴스·쇼츠·틱톡 9:16 세로형", 1_080, 1_920, 1, "tiktok"),
    "kakao-wide-800x400": presetSpec("kakao-wide-800x400", "카카오톡 와이드 피드 카드 (800×400)", 800, 400, 1, "kakao"),
    "kakao-naver-square-800x800": presetSpec("kakao-naver-square-800x800", "카카오·네이버 정방형 피드 카드 (800×800)", 800, 800, 1, "naver"),
  });

export interface ShowcaseRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

export interface ShowcaseSemanticRegion extends ShowcaseRect {
  readonly regionId: string;
  readonly kind: ShowcaseProtectedRegionKind;
  /** 스마트 크롭 중심점 계산 시 반영할 주목도 가중치(기본값 `1.0`). */
  readonly salienceWeight?: number;
  /** 절단선이 말풍선·얼굴 테두리에 바짝 붙지 않도록 확보할 여유 간격(기본값 `12px`). */
  readonly safetyMarginPx?: number;
}

export interface Vertical9x16HudInsets { readonly topPx: number; readonly bottomPx: number; readonly leftPx: number; readonly rightPx: number }
export type ShowcaseLetterboxPadding = Vertical9x16HudInsets;

export interface HudSafeZoneAudit {
  readonly safeZoneRect: ShowcaseRect;
  readonly intrudingRegionIdsBeforeReframe: readonly string[];
  readonly intrudingRegionIdsAfterReframe: readonly string[];
  readonly autoReframedToSafeZone: boolean;
  readonly minClearancePx: number;
}

export interface PlannedShowcaseSlide {
  readonly slideIndex: number;
  readonly sourceRect: ShowcaseRect;
  readonly outputWidthPx: number;
  readonly outputHeightPx: number;
  readonly contentPlacementRect: ShowcaseRect;
  readonly letterboxPadding: ShowcaseLetterboxPadding;
  readonly containedRegionIds: readonly string[];
  readonly slicedProtectedRegionIds: readonly string[];
  readonly adjustedForBalloonOrFaceSafety: boolean;
  readonly oversizedRegionWarning: boolean;
  readonly hudSafeZoneAudit: HudSafeZoneAudit | null;
}

export interface WebShareNavigatorLike {
  readonly share?: (data?: ShareData) => Promise<void>;
  readonly canShare?: (data?: ShareData) => boolean;
}

export interface CreatorShowcaseShareInput {
  readonly title: string;
  readonly workUrl: string;
  readonly text?: string;
  readonly imageUrl?: string;
  readonly buttonLabel?: string;
  readonly channelOverride?: ShareChannel;
  readonly campaign?: string;
  readonly origin?: string;
}

export interface ShowcaseAttributionPlan {
  readonly channel: ShareChannel;
  readonly attributedUrl: string;
  readonly utmSource: ShareChannel;
  readonly utmMedium: typeof CREATOR_SHOWCASE_UTM_MEDIUM;
  readonly utmCampaign: string;
  readonly utmContent: SnsShowcasePresetId;
  readonly sharePayload: SharePayload;
  readonly canShareFiles: boolean;
  readonly canShareUrlOnly: boolean;
  readonly recommendedShareMode: "web-share-files" | "web-share-url" | "download-and-copy-link";
}

export interface SnsShowcaseExportPlanInput {
  readonly preset: SnsShowcasePresetId;
  readonly sourceWidthPx: number;
  readonly sourceHeightPx: number;
  readonly regions?: readonly ShowcaseSemanticRegion[];
  readonly panelGuttersY?: readonly number[];
  /** 인스타그램 캐러셀 최대 슬라이드 수(`1..20`, 기본 `10`). */
  readonly carouselMaxSlides?: number;
  readonly hudInsets?: Partial<Vertical9x16HudInsets>;
  readonly share: CreatorShowcaseShareInput;
  readonly candidateShareFiles?: readonly File[];
  readonly navigatorLike?: WebShareNavigatorLike | null;
}

export interface SnsShowcaseExportPlanResult {
  readonly preset: SnsShowcasePresetId;
  readonly labelKo: string;
  readonly slides: readonly PlannedShowcaseSlide[];
  readonly totalSlides: number;
  readonly truncatedRemainingHeightPx: number;
  readonly zeroProtectedSlices: boolean;
  readonly attribution: ShowcaseAttributionPlan;
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const compactText = (v: string | undefined, max: number): string => (v ?? "").replace(/\s+/gu, " ").trim().slice(0, max);
const isCutProtected = (r: ShowcaseSemanticRegion): boolean => r.kind === "speech-balloon" || r.kind === "character-face";
const rectsOverlap = (a: ShowcaseRect, b: ShowcaseRect): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const isRectInside = (inner: ShowcaseRect, outer: ShowcaseRect): boolean =>
  inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.width <= outer.x + outer.width + 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5;

function regionPriorityScore(r: ShowcaseSemanticRegion): number {
  const base = r.kind === "character-face" ? 1.6 : r.kind === "speech-balloon" ? 1.25 : r.kind === "key-prop" ? 1.1 : 0.9;
  return base * Math.max(0.1, r.salienceWeight ?? 1);
}

function computeUniformContainPlacement(
  sourceW: number,
  sourceH: number,
  bounds: ShowcaseRect,
  canvasW: number,
  canvasH: number,
): { readonly placement: ShowcaseRect; readonly padding: ShowcaseLetterboxPadding } {
  const scale = Math.min(bounds.width / sourceW, bounds.height / sourceH);
  const width = Math.max(1, Math.min(bounds.width, Math.round(sourceW * scale)));
  const height = Math.max(1, Math.min(bounds.height, Math.round(sourceH * scale)));
  const x = bounds.x + Math.floor((bounds.width - width) / 2);
  const y = bounds.y + Math.floor((bounds.height - height) / 2);
  return {
    placement: { x, y, width, height },
    padding: { topPx: y, bottomPx: Math.max(0, canvasH - (y + height)), leftPx: x, rightPx: Math.max(0, canvasW - (x + width)) },
  };
}

function tryCanShare(nav: WebShareNavigatorLike | null, data: ShareData): boolean {
  if (nav === null || typeof nav.share !== "function") return false;
  try {
    return typeof nav.canShare !== "function" || nav.canShare(data);
  } catch {
    return false;
  }
}

/** `ShareChannel`·`SharePayload` 호환 쇼케이스 유입 추적 메타데이터와 Web Share 파일 공유 지원 여부를 진단한다. */
export function buildCreatorShowcaseAttribution(options: {
  readonly preset: SnsShowcasePresetId;
  readonly share: CreatorShowcaseShareInput;
  readonly candidateShareFiles?: readonly File[];
  readonly navigatorLike?: WebShareNavigatorLike | null;
}): ShowcaseAttributionPlan {
  const spec = SNS_SHOWCASE_PLATFORM_SPECS[options.preset];
  const channel = options.share.channelOverride ?? spec.defaultShareChannel;
  const campaign = compactText(options.share.campaign, 64) || DEFAULT_CREATOR_SHOWCASE_CAMPAIGN;
  const targetUrl = new URL(absoluteShareUrl(options.share.workUrl, options.share.origin));
  targetUrl.searchParams.set("utm_source", channel);
  targetUrl.searchParams.set("utm_medium", CREATOR_SHOWCASE_UTM_MEDIUM);
  targetUrl.searchParams.set("utm_campaign", campaign);
  targetUrl.searchParams.set("utm_content", options.preset);
  const attributedUrl = targetUrl.toString();

  const cleanTitle = compactText(options.share.title, 120) || "ToonStudio 창작물";
  const cleanText = compactText(options.share.text, 240) || cleanTitle;
  const sharePayload: SharePayload = {
    title: cleanTitle,
    url: attributedUrl,
    text: cleanText,
    ...(options.share.imageUrl ? { imageUrl: options.share.imageUrl } : {}),
    ...(options.share.buttonLabel ? { buttonLabel: options.share.buttonLabel } : {}),
  };

  const nav = options.navigatorLike !== undefined ? options.navigatorLike : typeof navigator !== "undefined" ? navigator : null;
  const files = options.candidateShareFiles ?? [];
  const hasFileCanShare = files.length > 0 && nav !== null && typeof nav.canShare === "function";
  const mutableFiles = [...files];
  const canShareFiles =
    hasFileCanShare
    && (tryCanShare(nav, { files: mutableFiles, title: cleanTitle, text: cleanText, url: attributedUrl })
      || tryCanShare(nav, { files: mutableFiles }));
  const canShareUrlOnly = tryCanShare(nav, { title: cleanTitle, text: cleanText, url: attributedUrl });

  return {
    channel,
    attributedUrl,
    utmSource: channel,
    utmMedium: CREATOR_SHOWCASE_UTM_MEDIUM,
    utmCampaign: campaign,
    utmContent: options.preset,
    sharePayload,
    canShareFiles,
    canShareUrlOnly,
    recommendedShareMode: canShareFiles ? "web-share-files" : canShareUrlOnly ? "web-share-url" : "download-and-copy-link",
  };
}

function findCrossingProtected(cutY: number, sourceH: number, regions: readonly ShowcaseSemanticRegion[]): ShowcaseSemanticRegion[] {
  return regions.filter((r) => {
    const pad = Math.max(0, r.safetyMarginPx ?? 12);
    return isCutProtected(r) && cutY > Math.max(0, r.y - pad) && cutY < Math.min(sourceH, r.y + r.height + pad);
  });
}

function planInstagramCarouselSlides(
  sourceW: number,
  sourceH: number,
  regions: readonly ShowcaseSemanticRegion[],
  panelGuttersY: readonly number[],
  maxSlides: number,
): { readonly slides: readonly PlannedShowcaseSlide[]; readonly truncatedRemainingHeightPx: number } {
  const spec = SNS_SHOWCASE_PLATFORM_SPECS["instagram-carousel-4x5"];
  const nominalH = Math.max(1, Math.round((sourceW * spec.heightPx) / spec.widthPx));
  const minSliceH = Math.max(1, Math.round(nominalH * 0.32));
  const maxStretchH = Math.max(nominalH, Math.round(nominalH * 1.45));
  const slides: PlannedShowcaseSlide[] = [];
  let cursorY = 0;

  while (cursorY < sourceH && slides.length < maxSlides) {
    let cutY = cursorY + nominalH;
    let adjusted = false;
    let oversized = false;

    if (sourceH - cursorY <= nominalH) {
      cutY = sourceH;
    } else {
      const gutterMinY = cursorY + Math.round(nominalH * 0.85);
      const safeGutter = [...panelGuttersY]
        .filter((gy) => gy >= gutterMinY && gy <= cutY && findCrossingProtected(gy, sourceH, regions).length === 0)
        .sort((a, b) => b - a)[0];
      if (safeGutter !== undefined) {
        adjusted = safeGutter !== cutY;
        cutY = safeGutter;
      }

      let crossings = findCrossingProtected(cutY, sourceH, regions);
      for (let step = 0; crossings.length > 0 && step < regions.length + 4; step += 1) {
        const safeTop = Math.min(...crossings.map((r) => Math.max(0, Math.floor(r.y - Math.max(0, r.safetyMarginPx ?? 12)))));
        const safeBottom = Math.max(...crossings.map((r) => Math.min(sourceH, Math.ceil(r.y + r.height + Math.max(0, r.safetyMarginPx ?? 12)))));
        if (safeTop >= cursorY + minSliceH) {
          cutY = safeTop;
          adjusted = true;
        } else if (safeBottom <= cursorY + maxStretchH && safeBottom > cursorY) {
          cutY = safeBottom;
          adjusted = true;
        } else {
          oversized = true;
          cutY = Math.min(sourceH, cursorY + nominalH);
          break;
        }
        crossings = findCrossingProtected(cutY, sourceH, regions);
      }
    }

    const sliceH = Math.max(1, cutY - cursorY);
    const sourceRect: ShowcaseRect = { x: 0, y: cursorY, width: sourceW, height: sliceH };
    const fullBounds: ShowcaseRect = { x: 0, y: 0, width: spec.widthPx, height: spec.heightPx };
    const { placement, padding } = computeUniformContainPlacement(sourceW, sliceH, fullBounds, spec.widthPx, spec.heightPx);
    const slicedIds = cutY < sourceH ? regions.filter((r) => isCutProtected(r) && r.y < cutY && r.y + r.height > cutY).map((r) => r.regionId) : [];
    const containedIds = regions.filter((r) => rectsOverlap(r, sourceRect) && !slicedIds.includes(r.regionId)).map((r) => r.regionId);
    slides.push({
      slideIndex: slides.length,
      sourceRect,
      outputWidthPx: spec.widthPx,
      outputHeightPx: spec.heightPx,
      contentPlacementRect: placement,
      letterboxPadding: padding,
      containedRegionIds: containedIds,
      slicedProtectedRegionIds: slicedIds,
      adjustedForBalloonOrFaceSafety: adjusted,
      oversizedRegionWarning: oversized,
      hudSafeZoneAudit: null,
    });
    cursorY = cutY;
  }

  return { slides, truncatedRemainingHeightPx: Math.max(0, sourceH - cursorY) };
}

function computeFocalSmartCropRect(
  sourceW: number,
  sourceH: number,
  targetW: number,
  targetH: number,
  regions: readonly ShowcaseSemanticRegion[],
  bandRangeY?: { readonly startY: number; readonly endY: number },
): ShowcaseRect {
  const widerThanTarget = sourceW / sourceH > targetW / targetH;
  const cropW = widerThanTarget ? Math.max(1, Math.min(sourceW, Math.round((sourceH * targetW) / targetH))) : sourceW;
  const cropH = widerThanTarget ? sourceH : Math.max(1, Math.min(sourceH, Math.round((sourceW * targetH) / targetW)));
  const candidates =
    bandRangeY === undefined
      ? regions
      : regions.filter((r) => r.y + r.height * 0.5 >= bandRangeY.startY && r.y + r.height * 0.5 <= bandRangeY.endY);

  let anchorX = sourceW * 0.5;
  let anchorY = bandRangeY === undefined ? Math.min(sourceH * 0.5, cropH * 0.5) : (bandRangeY.startY + bandRangeY.endY) * 0.5;
  const totalW = candidates.reduce((acc, r) => acc + regionPriorityScore(r), 0);
  if (totalW > 0) {
    anchorX = candidates.reduce((acc, r) => acc + (r.x + r.width * 0.5) * regionPriorityScore(r), 0) / totalW;
    anchorY = candidates.reduce((acc, r) => acc + (r.y + r.height * 0.5) * regionPriorityScore(r), 0) / totalW;
  }

  let cropX = clamp(Math.round(anchorX - cropW * 0.5), 0, sourceW - cropW);
  let cropY = clamp(Math.round(anchorY - cropH * 0.5), 0, sourceH - cropH);
  const primary = [...candidates].sort((a, b) => regionPriorityScore(b) - regionPriorityScore(a))[0];
  if (primary !== undefined) {
    const pad = Math.max(0, primary.safetyMarginPx ?? 12);
    const reqL = Math.max(0, primary.x - pad);
    const reqR = Math.min(sourceW, primary.x + primary.width + pad);
    const reqT = Math.max(0, primary.y - pad);
    const reqB = Math.min(sourceH, primary.y + primary.height + pad);
    if (reqR - reqL <= cropW) {
      cropX = clamp(cropX > reqL ? Math.floor(reqL) : cropX + cropW < reqR ? Math.ceil(reqR - cropW) : cropX, 0, sourceW - cropW);
    }
    if (reqB - reqT <= cropH) {
      cropY = clamp(cropY > reqT ? Math.floor(reqT) : cropY + cropH < reqB ? Math.ceil(reqB - cropH) : cropY, 0, sourceH - cropH);
    }
  }
  return { x: cropX, y: cropY, width: cropW, height: cropH };
}

function projectRegion(r: ShowcaseSemanticRegion, src: ShowcaseRect, dst: ShowcaseRect): ShowcaseRect {
  const sx = dst.width / src.width;
  const sy = dst.height / src.height;
  return { x: dst.x + (r.x - src.x) * sx, y: dst.y + (r.y - src.y) * sy, width: r.width * sx, height: r.height * sy };
}

function buildCropSlide(
  slideIndex: number,
  sourceRect: ShowcaseRect,
  outW: number,
  outH: number,
  regions: readonly ShowcaseSemanticRegion[],
  hudInsets: Vertical9x16HudInsets | null,
): PlannedShowcaseSlide {
  const overlapping = regions.filter((r) => rectsOverlap(r, sourceRect));
  const slicedIds = overlapping.filter((r) => isCutProtected(r) && !isRectInside(r, sourceRect)).map((r) => r.regionId);
  const containedIds = overlapping.filter((r) => !slicedIds.includes(r.regionId)).map((r) => r.regionId);

  let { placement, padding } = computeUniformContainPlacement(
    sourceRect.width,
    sourceRect.height,
    { x: 0, y: 0, width: outW, height: outH },
    outW,
    outH,
  );
  let hudSafeZoneAudit: HudSafeZoneAudit | null = null;
  let adjusted = false;

  if (hudInsets !== null) {
    const safeZoneRect: ShowcaseRect = {
      x: hudInsets.leftPx,
      y: hudInsets.topPx,
      width: Math.max(1, outW - hudInsets.leftPx - hudInsets.rightPx),
      height: Math.max(1, outH - hudInsets.topPx - hudInsets.bottomPx),
    };
    const protectedInFrame = overlapping.filter(isCutProtected);
    const intrudingBefore = protectedInFrame
      .filter((r) => !isRectInside(projectRegion(r, sourceRect, placement), safeZoneRect))
      .map((r) => r.regionId);

    let autoReframed = false;
    if (intrudingBefore.length > 0) {
      const reframed = computeUniformContainPlacement(sourceRect.width, sourceRect.height, safeZoneRect, outW, outH);
      placement = reframed.placement;
      padding = reframed.padding;
      autoReframed = true;
      adjusted = true;
    }

    const finalProjected = protectedInFrame.map((r) => projectRegion(r, sourceRect, placement));
    const intrudingAfter = protectedInFrame
      .filter((r) => !isRectInside(projectRegion(r, sourceRect, placement), safeZoneRect))
      .map((r) => r.regionId);
    const clearances = finalProjected.map((rect) =>
      Math.min(
        rect.x - safeZoneRect.x,
        rect.y - safeZoneRect.y,
        safeZoneRect.x + safeZoneRect.width - (rect.x + rect.width),
        safeZoneRect.y + safeZoneRect.height - (rect.y + rect.height),
      ),
    );
    const rawMin = clearances.length > 0 ? Math.min(...clearances) : Math.min(safeZoneRect.width, safeZoneRect.height);
    hudSafeZoneAudit = {
      safeZoneRect,
      intrudingRegionIdsBeforeReframe: intrudingBefore,
      intrudingRegionIdsAfterReframe: intrudingAfter,
      autoReframedToSafeZone: autoReframed,
      minClearancePx: Math.round(rawMin * 100) / 100,
    };
  }

  return {
    slideIndex,
    sourceRect,
    outputWidthPx: outW,
    outputHeightPx: outH,
    contentPlacementRect: placement,
    letterboxPadding: padding,
    containedRegionIds: containedIds,
    slicedProtectedRegionIds: slicedIds,
    adjustedForBalloonOrFaceSafety: adjusted,
    oversizedRegionWarning: false,
    hudSafeZoneAudit,
  };
}

function finalizeExportPlan(
  preset: SnsShowcasePresetId,
  labelKo: string,
  slides: readonly PlannedShowcaseSlide[],
  truncatedRemainingHeightPx: number,
  attribution: ShowcaseAttributionPlan,
): SnsShowcaseExportPlanResult {
  return {
    preset,
    labelKo,
    slides,
    totalSlides: slides.length,
    truncatedRemainingHeightPx,
    zeroProtectedSlices: slides.every((s) => s.slicedProtectedRegionIds.length === 0),
    attribution,
  };
}

/** 웹툰 원고·단일 컷의 SNS 플랫폼별 스마트 크롭·캐러셀 슬라이드 분할 및 공유 계획을 생성한다. */
export function planSnsShowcaseExport(input: SnsShowcaseExportPlanInput): SnsShowcaseExportPlanResult {
  if (!Number.isFinite(input.sourceWidthPx) || !Number.isFinite(input.sourceHeightPx) || input.sourceWidthPx < 1 || input.sourceHeightPx < 1) {
    throw new RangeError("원본 캔버스 크기는 1px 이상의 유한한 값이어야 합니다.");
  }

  const sourceW = Math.round(input.sourceWidthPx);
  const sourceH = Math.round(input.sourceHeightPx);
  const spec = SNS_SHOWCASE_PLATFORM_SPECS[input.preset];
  const regions = input.regions ?? [];
  const attribution = buildCreatorShowcaseAttribution({
    preset: input.preset,
    share: input.share,
    candidateShareFiles: input.candidateShareFiles,
    navigatorLike: input.navigatorLike,
  });

  if (input.preset === "instagram-carousel-4x5") {
    const maxSlides = clamp(
      Math.round(input.carouselMaxSlides ?? INSTAGRAM_CAROUSEL_CLASSIC_MAX_SLIDES),
      1,
      INSTAGRAM_CAROUSEL_EXTENDED_MAX_SLIDES,
    );
    const { slides, truncatedRemainingHeightPx } = planInstagramCarouselSlides(
      sourceW,
      sourceH,
      regions,
      input.panelGuttersY ?? [],
      maxSlides,
    );
    return finalizeExportPlan(input.preset, spec.labelKo, slides, truncatedRemainingHeightPx, attribution);
  }

  if (input.preset === "x-quad-4up") {
    const bandH = sourceH / 4;
    const slides = Array.from({ length: 4 }, (_, idx) =>
      buildCropSlide(
        idx,
        computeFocalSmartCropRect(sourceW, sourceH, spec.widthPx, spec.heightPx, regions, {
          startY: idx * bandH,
          endY: (idx + 1) * bandH,
        }),
        spec.widthPx,
        spec.heightPx,
        regions,
        null,
      ),
    );
    return finalizeExportPlan(input.preset, spec.labelKo, slides, 0, attribution);
  }

  const hudInsets: Vertical9x16HudInsets | null =
    input.preset === "tiktok-reels-shorts-9x16"
      ? {
          topPx: Math.max(0, Math.round(input.hudInsets?.topPx ?? DEFAULT_VERTICAL_9X16_HUD_INSETS.topPx)),
          bottomPx: Math.max(0, Math.round(input.hudInsets?.bottomPx ?? DEFAULT_VERTICAL_9X16_HUD_INSETS.bottomPx)),
          leftPx: Math.max(0, Math.round(input.hudInsets?.leftPx ?? DEFAULT_VERTICAL_9X16_HUD_INSETS.leftPx)),
          rightPx: Math.max(0, Math.round(input.hudInsets?.rightPx ?? DEFAULT_VERTICAL_9X16_HUD_INSETS.rightPx)),
        }
      : null;

  const cropRect = computeFocalSmartCropRect(sourceW, sourceH, spec.widthPx, spec.heightPx, regions);
  const slide = buildCropSlide(0, cropRect, spec.widthPx, spec.heightPx, regions, hudInsets);
  return finalizeExportPlan(input.preset, spec.labelKo, [slide], 0, attribution);
}
