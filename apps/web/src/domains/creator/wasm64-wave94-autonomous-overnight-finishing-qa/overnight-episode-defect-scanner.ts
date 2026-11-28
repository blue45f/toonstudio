/**
 * Wave 94 — 무인 야간 자율 마감 QA 결함 스캐너 (`overnight-episode-defect-scanner`).
 *
 * 웹툰 회차 스냅샷에서 출고 전 8대 마감 결함을 비파괴·결정론적으로 탐지하고
 * 안전 등급(`SAFE_AUTO_PATCH` | `PROPOSE_REVIEW_PATCH` | `HARD_HUMAN_BLOCKER`)을 부여한다.
 */

export type OvernightLayerRole =
  | "ink"
  | "cel-fill"
  | "background"
  | "rough-draft"
  | "perspective-guide"
  | "effect";

export type OvernightLayerBlendMode = "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "add";
export type OvernightColorProfile = "srgb" | "cmyk" | "display-p3-unconverted" | "adobe-rgb-unconverted";
export type OvernightPlatformSpec = "naver-webtoon" | "kakao-page" | "global-webtoon-canvas";
export type OvernightPatchSafetyTier = "SAFE_AUTO_PATCH" | "PROPOSE_REVIEW_PATCH" | "HARD_HUMAN_BLOCKER";
export type RightsBomLicenseStatus = "verified-commercial" | "missing" | "expired" | "non-commercial-only";
export type ClippedEdgeSide = "left" | "right" | "top" | "bottom";

export type OvernightDefectClass =
  | "transparent-pinhole-gap"
  | "speech-balloon-edge-clip"
  | "draft-guide-layer-left-visible"
  | "layer-blend-alpha-halo"
  | "vertical-slice-budget-violation"
  | "panel-sequence-numbering-gap"
  | "color-profile-mismatch"
  | "rights-bom-unverified-asset";

export interface Rect2d { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface PixelCoord2d { readonly x: number; readonly y: number }
export interface CompactRgbaTileBuffer { readonly width: number; readonly height: number; readonly rgba: Uint8ClampedArray }

export interface OvernightLayerState {
  readonly layerId: string;
  readonly name: string;
  readonly role: OvernightLayerRole;
  readonly visible: boolean;
  readonly opacity: number;
  readonly blendMode: OvernightLayerBlendMode;
  readonly colorProfile?: OvernightColorProfile;
  readonly rasterTile?: CompactRgbaTileBuffer;
  readonly hasStrayAlphaHalo?: boolean;
}

export interface OvernightPanelState {
  readonly panelId: string;
  readonly sequenceIndex: number;
  readonly bounds: Rect2d;
  readonly safeMarginPx?: number;
  readonly layers: readonly OvernightLayerState[];
}

export interface OvernightSpeechBalloon {
  readonly balloonId: string;
  readonly panelId: string;
  readonly bbox: Rect2d;
  readonly text: string;
  readonly minReadableFontPx: number;
  readonly fontSizePx?: number;
}

export interface FaceKeepOutBox {
  readonly boxId: string;
  readonly characterId: string;
  readonly panelId: string;
  readonly bbox: Rect2d;
}

export interface RightsBomAssetEntry {
  readonly assetId: string;
  readonly assetName: string;
  readonly assetType: "font" | "brush" | "3d-background" | "texture" | "stock-image";
  readonly licenseStatus: RightsBomLicenseStatus;
  readonly expiresAtIso?: string;
  readonly usedInPanelIds: readonly string[];
}

export interface OvernightEpisodeSnapshot {
  readonly episodeId: string;
  readonly title: string;
  readonly platformSpec: OvernightPlatformSpec;
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly plannedSliceCutsY?: readonly number[];
  readonly auditDateIso?: string;
  readonly colorProfile?: OvernightColorProfile;
  readonly panels: readonly OvernightPanelState[];
  readonly speechBalloons: readonly OvernightSpeechBalloon[];
  readonly faceKeepOutBoxes: readonly FaceKeepOutBox[];
  readonly rightsBomAssets: readonly RightsBomAssetEntry[];
}

export interface PlatformSliceLimitSpec {
  readonly spec: OvernightPlatformSpec;
  readonly labelKo: string;
  readonly targetWidthPx: number;
  readonly maxSliceHeightPx: number;
  readonly defaultPanelSafeMarginPx: number;
}

export const PLATFORM_SLICE_SPECS: Readonly<Record<OvernightPlatformSpec, PlatformSliceLimitSpec>> = Object.freeze({
  "naver-webtoon": Object.freeze({ spec: "naver-webtoon", labelKo: "네이버 웹툰", targetWidthPx: 800, maxSliceHeightPx: 1280, defaultPanelSafeMarginPx: 8 }),
  "kakao-page": Object.freeze({ spec: "kakao-page", labelKo: "카카오페이지", targetWidthPx: 800, maxSliceHeightPx: 1600, defaultPanelSafeMarginPx: 8 }),
  "global-webtoon-canvas": Object.freeze({ spec: "global-webtoon-canvas", labelKo: "글로벌 웹툰 캔버스", targetWidthPx: 800, maxSliceHeightPx: 1280, defaultPanelSafeMarginPx: 8 }),
});

export interface OvernightDefect {
  readonly defectId: string;
  readonly defectClass: OvernightDefectClass;
  readonly safetyTier: OvernightPatchSafetyTier;
  readonly subtype: string;
  readonly panelId?: string;
  readonly layerId?: string;
  readonly balloonId?: string;
  readonly assetId?: string;
  readonly summaryKo: string;
  readonly recommendedActionKo: string;
  readonly pinholePixels?: readonly PixelCoord2d[];
  readonly pinholeBbox?: Rect2d;
  readonly clippedEdges?: readonly ClippedEdgeSide[];
  readonly collidingFaceBoxIds?: readonly string[];
  readonly metrics: Readonly<Record<string, number | string | boolean>>;
}

export interface OvernightScanOptions {
  readonly maxPinholeSpanPx?: number;
  readonly inkLumaThreshold?: number;
  readonly alphaHaloMinPixels?: number;
}

export interface OvernightScanReport {
  readonly episodeId: string;
  readonly title: string;
  readonly platformSpec: OvernightPlatformSpec;
  readonly platformLimits: PlatformSliceLimitSpec;
  readonly scannedPanelCount: number;
  readonly scannedLayerCount: number;
  readonly defects: readonly OvernightDefect[];
  readonly countsByTier: Readonly<Record<OvernightPatchSafetyTier, number>>;
  readonly countsByClass: Readonly<Record<OvernightDefectClass, number>>;
  readonly safeAutoPatchCount: number;
  readonly proposeReviewCount: number;
  readonly hardBlockerCount: number;
  readonly exportReady: boolean;
}

export const DEFAULT_INK_LUMA_THRESHOLD = 60;
const DEFAULT_MAX_PINHOLE_SPAN_PX = 4;
const DEFAULT_ALPHA_HALO_MIN_PIXELS = 4;
const TRANSPARENT_ALPHA_MAX = 15;
const OPAQUE_ALPHA_MIN = 128;

/** Rec.709 기준 픽셀 휘도(0..255)를 계산한다. */
export function computeRgbaLuma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 픽셀이 어두운 선화(잉크) 경계에 해당하는지 판정한다. */
export function isDarkInkRgba(r: number, g: number, b: number, a: number, lumaThreshold: number = DEFAULT_INK_LUMA_THRESHOLD): boolean {
  return a >= OPAQUE_ALPHA_MIN && computeRgbaLuma(r, g, b) < lumaThreshold;
}

/** 두 사각형이 양(+)의 면적으로 겹치는지 판정한다. */
export function rectsOverlapPositive(a: Rect2d, b: Rect2d): boolean {
  return (
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0 &&
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0
  );
}

/** 사각형이 주어진 수평 절단선 y를 통과(내부 절단)하는지 판정한다. */
export function rectBisectedByCutY(rect: Rect2d, cutY: number): boolean {
  return cutY > rect.y && cutY < rect.y + rect.height;
}

function isValidTile(tile: CompactRgbaTileBuffer | undefined): tile is CompactRgbaTileBuffer {
  return tile !== undefined && tile.width > 0 && tile.height > 0 && tile.rgba.length >= tile.width * tile.height * 4;
}

function scanPinholeDefectsForLayer(
  panel: OvernightPanelState,
  celLayer: OvernightLayerState,
  matchingInkTiles: readonly CompactRgbaTileBuffer[],
  maxSpanPx: number,
  inkLumaThreshold: number,
): readonly OvernightDefect[] {
  if (!celLayer.visible || celLayer.role !== "cel-fill" || !isValidTile(celLayer.rasterTile)) return [];
  const { width, height, rgba } = celLayer.rasterTile;
  const total = width * height;
  const transparentMask = new Uint8Array(total);
  const celFillMask = new Uint8Array(total);
  const inkMask = new Uint8Array(total);

  for (let flat = 0; flat < total; flat += 1) {
    const idx = flat * 4;
    const r = rgba[idx] ?? 0; const g = rgba[idx + 1] ?? 0;
    const b = rgba[idx + 2] ?? 0; const a = rgba[idx + 3] ?? 0;
    let coveredByInk = false;
    for (const inkTile of matchingInkTiles) {
      if ((inkTile.rgba[idx + 3] ?? 0) >= OPAQUE_ALPHA_MIN) { coveredByInk = true; inkMask[flat] = 1; break; }
    }
    if (isDarkInkRgba(r, g, b, a, inkLumaThreshold)) inkMask[flat] = 1;
    else if (a >= OPAQUE_ALPHA_MIN) celFillMask[flat] = 1;
    else if (a <= TRANSPARENT_ALPHA_MAX && !coveredByInk) transparentMask[flat] = 1;
  }

  const visited = new Uint8Array(total);
  const qx = new Int32Array(total);
  const qy = new Int32Array(total);
  const dx4 = [1, -1, 0, 0]; const dy4 = [0, 0, 1, -1];
  const diagX = [1, 1, -1, -1]; const diagY = [1, -1, 1, -1];
  const found: OvernightDefect[] = [];

  for (let sy = 0; sy < height; sy += 1) {
    for (let sx = 0; sx < width; sx += 1) {
      const startFlat = sy * width + sx;
      if (transparentMask[startFlat] !== 1 || visited[startFlat] === 1) continue;
      let head = 0; let tail = 0;
      qx[tail] = sx; qy[tail] = sy; tail += 1; visited[startFlat] = 1;

      const pixels: PixelCoord2d[] = [];
      let touchesBorder = false; let enclosed = true;
      let minX = sx; let maxX = sx; let minY = sy; let maxY = sy;
      let celNeighbors = 0; let inkNeighbors = 0;

      while (head < tail) {
        const cx = qx[head] ?? 0; const cy = qy[head] ?? 0; head += 1;
        pixels.push({ x: cx, y: cy });
        if (cx === 0 || cy === 0 || cx === width - 1 || cy === height - 1) touchesBorder = true;
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        for (let d = 0; d < 4; d += 1) {
          const nx = cx + (dx4[d] ?? 0); const ny = cy + (dy4[d] ?? 0);
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nFlat = ny * width + nx;
          if (transparentMask[nFlat] === 1) {
            if (visited[nFlat] !== 1) { visited[nFlat] = 1; qx[tail] = nx; qy[tail] = ny; tail += 1; }
          } else if (celFillMask[nFlat] === 1) celNeighbors += 1;
          else if (inkMask[nFlat] === 1) inkNeighbors += 1;
          else enclosed = false;
        }
      }

      const spanW = maxX - minX + 1;
      const spanH = maxY - minY + 1;
      if (touchesBorder || !enclosed || spanW > maxSpanPx || spanH > maxSpanPx) continue;
      if (celNeighbors === 0) {
        for (const px of pixels) {
          for (let d = 0; d < 4; d += 1) {
            const nx = px.x + (diagX[d] ?? 0); const ny = px.y + (diagY[d] ?? 0);
            if (nx >= 0 && ny >= 0 && nx < width && ny < height && celFillMask[ny * width + nx] === 1) celNeighbors += 1;
          }
        }
      }

      const hasCelRef = celNeighbors > 0;
      pixels.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
      found.push({
        defectId: `pinhole:${panel.panelId}:${celLayer.layerId}:${minX}x${minY}:${spanW}x${spanH}`,
        defectClass: "transparent-pinhole-gap",
        safetyTier: hasCelRef ? "SAFE_AUTO_PATCH" : "PROPOSE_REVIEW_PATCH",
        subtype: hasCelRef ? "enclosed-cel-pinhole" : "ink-only-enclosed-gap",
        panelId: panel.panelId,
        layerId: celLayer.layerId,
        summaryKo: `패널 ${panel.panelId} 채색 레이어 '${celLayer.name}' (${minX},${minY})에 ${spanW}×${spanH}px 투명 핀홀(${pixels.length}픽셀)이 남아 있습니다.`,
        recommendedActionKo: hasCelRef
          ? "인접 채색 대표색으로 핀홀을 메우고 어두운 선화 경계는 유지합니다."
          : "인접 채색 기준색이 없어 작가가 직접 색상을 지정해야 합니다.",
        pinholePixels: pixels,
        pinholeBbox: { x: minX, y: minY, width: spanW, height: spanH },
        metrics: { pixelCount: pixels.length, spanWidthPx: spanW, spanHeightPx: spanH, celNeighbors, inkNeighbors },
      });
    }
  }
  return found;
}

function scanPanelLayers(
  panel: OvernightPanelState,
  maxPinholeSpanPx: number,
  inkLumaThreshold: number,
  alphaHaloMinPixels: number,
): readonly OvernightDefect[] {
  const defects: OvernightDefect[] = [];
  const visibleInkTiles = panel.layers
    .filter((l) => l.visible && l.role === "ink" && isValidTile(l.rasterTile))
    .map((l) => l.rasterTile)
    .filter((t): t is CompactRgbaTileBuffer => t !== undefined);

  for (const layer of panel.layers) {
    if (!layer.visible) continue;
    if (layer.role === "cel-fill" && isValidTile(layer.rasterTile)) {
      const matchingInk = visibleInkTiles.filter((t) => t.width === layer.rasterTile?.width && t.height === layer.rasterTile?.height);
      defects.push(...scanPinholeDefectsForLayer(panel, layer, matchingInk, maxPinholeSpanPx, inkLumaThreshold));
    }
    if (layer.role === "rough-draft" || layer.role === "perspective-guide") {
      const roleKo = layer.role === "rough-draft" ? "러프 밑그림" : "투시 가이드";
      defects.push({
        defectId: `draft-visible:${panel.panelId}:${layer.layerId}`,
        defectClass: "draft-guide-layer-left-visible",
        safetyTier: "SAFE_AUTO_PATCH",
        subtype: layer.role,
        panelId: panel.panelId,
        layerId: layer.layerId,
        summaryKo: `패널 ${panel.panelId}의 ${roleKo} 레이어 '${layer.name}'가 켜진 채 출고 대기 중입니다.`,
        recommendedActionKo: "스테이징에서 해당 보조 레이어를 비표시로 전환합니다.",
        metrics: { role: layer.role, opacity: layer.opacity },
      });
    }
    if (layer.role === "ink" || layer.role === "cel-fill") {
      if (layer.blendMode !== "normal") {
        defects.push({
          defectId: `blend-mode:${panel.panelId}:${layer.layerId}:${layer.blendMode}`,
          defectClass: "layer-blend-alpha-halo",
          safetyTier: "PROPOSE_REVIEW_PATCH",
          subtype: "non-normal-blend-mode",
          panelId: panel.panelId,
          layerId: layer.layerId,
          summaryKo: `패널 ${panel.panelId}의 ${layer.role === "ink" ? "선화" : "채색"} 레이어 '${layer.name}'가 '${layer.blendMode}' 블렌드 모드로 설정되어 있습니다.`,
          recommendedActionKo: "의도된 연출인지 확인한 뒤 필요하면 'normal' 모드로 전환합니다.",
          metrics: { blendMode: layer.blendMode, layerRole: layer.role },
        });
      }
      let straySemi = 0; let brightHalo = 0; let opaque = 0;
      if (isValidTile(layer.rasterTile)) {
        const { width, height, rgba } = layer.rasterTile;
        for (let p = 0; p < width * height; p += 1) {
          const idx = p * 4;
          const a = rgba[idx + 3] ?? 0;
          if (a >= 240) opaque += 1;
          else if (a >= 16 && a <= 220) {
            straySemi += 1;
            if (computeRgbaLuma(rgba[idx] ?? 0, rgba[idx + 1] ?? 0, rgba[idx + 2] ?? 0) >= 220) brightHalo += 1;
          }
        }
      }
      const rasterHalo =
        brightHalo >= alphaHaloMinPixels ||
        (straySemi >= alphaHaloMinPixels && opaque > 0 && straySemi / (opaque + straySemi) >= 0.12);
      if (layer.hasStrayAlphaHalo === true || rasterHalo) {
        defects.push({
          defectId: `alpha-halo:${panel.panelId}:${layer.layerId}`,
          defectClass: "layer-blend-alpha-halo",
          safetyTier: "PROPOSE_REVIEW_PATCH",
          subtype: "stray-alpha-fringe",
          panelId: panel.panelId,
          layerId: layer.layerId,
          summaryKo: `패널 ${panel.panelId} 레이어 '${layer.name}' 경계에서 잔여 반투명 알파 헤일로가 감지되었습니다.`,
          recommendedActionKo: "외곽선 매트 정리 후 시각적 깨짐이 없는지 작가가 확인합니다.",
          metrics: { straySemi, brightHalo, flaggedExplicitly: layer.hasStrayAlphaHalo === true },
        });
      }
    }
    if (layer.colorProfile !== undefined && layer.colorProfile !== "srgb") {
      defects.push({
        defectId: `color-profile:${panel.panelId}:${layer.layerId}:${layer.colorProfile}`,
        defectClass: "color-profile-mismatch",
        safetyTier: "PROPOSE_REVIEW_PATCH",
        subtype: "layer-non-srgb",
        panelId: panel.panelId,
        layerId: layer.layerId,
        summaryKo: `패널 ${panel.panelId} 레이어 '${layer.name}'의 색 프로파일이 '${layer.colorProfile}'(비-sRGB)입니다.`,
        recommendedActionKo: "웹 표준 sRGB 변환 시 채도 손실이 없는지 작가가 확인합니다.",
        metrics: { colorProfile: layer.colorProfile },
      });
    }
  }
  return defects;
}

function scanSpeechBalloons(
  episode: OvernightEpisodeSnapshot,
  panelById: ReadonlyMap<string, OvernightPanelState>,
): readonly OvernightDefect[] {
  const defects: OvernightDefect[] = [];
  for (const balloon of episode.speechBalloons) {
    const panel = panelById.get(balloon.panelId);
    if (!panel) {
      defects.push({
        defectId: `balloon-orphan:${balloon.balloonId}`,
        defectClass: "speech-balloon-edge-clip",
        safetyTier: "HARD_HUMAN_BLOCKER",
        subtype: "missing-panel-ref",
        balloonId: balloon.balloonId,
        panelId: balloon.panelId,
        summaryKo: `말풍선 '${balloon.balloonId}'가 존재하지 않는 패널 '${balloon.panelId}'을 가리킵니다.`,
        recommendedActionKo: "말풍선을 올바른 패널에 다시 배치해야 출고할 수 있습니다.",
        metrics: { panelFound: false },
      });
      continue;
    }

    const collidingFaceIds = episode.faceKeepOutBoxes
      .filter((f) => f.panelId === panel.panelId && rectsOverlapPositive(balloon.bbox, f.bbox))
      .map((f) => f.boxId)
      .sort();
    if (collidingFaceIds.length > 0) {
      defects.push({
        defectId: `balloon-face-collision:${panel.panelId}:${balloon.balloonId}`,
        defectClass: "speech-balloon-edge-clip",
        safetyTier: "HARD_HUMAN_BLOCKER",
        subtype: "face-keepout-collision",
        panelId: panel.panelId,
        balloonId: balloon.balloonId,
        collidingFaceBoxIds: collidingFaceIds,
        summaryKo: `패널 ${panel.panelId}의 말풍선 '${balloon.balloonId}'가 캐릭터 얼굴 보호 영역(${collidingFaceIds.join(", ")})을 가립니다.`,
        recommendedActionKo: "대사 배치나 말풍선 크기를 작가가 직접 조정해야 합니다.",
        metrics: { collidingFaceCount: collidingFaceIds.length },
      });
    }

    const margin = panel.safeMarginPx ?? 0;
    const clippedEdges: ClippedEdgeSide[] = [];
    if (balloon.bbox.x < panel.bounds.x + margin) clippedEdges.push("left");
    if (balloon.bbox.x + balloon.bbox.width > panel.bounds.x + panel.bounds.width - margin) clippedEdges.push("right");
    if (balloon.bbox.y < panel.bounds.y + margin) clippedEdges.push("top");
    if (balloon.bbox.y + balloon.bbox.height > panel.bounds.y + panel.bounds.height - margin) clippedEdges.push("bottom");

    if (clippedEdges.length > 0) {
      const fitsInside = balloon.bbox.width <= panel.bounds.width && balloon.bbox.height <= panel.bounds.height;
      const tier: OvernightPatchSafetyTier = fitsInside && collidingFaceIds.length === 0 ? "SAFE_AUTO_PATCH" : "HARD_HUMAN_BLOCKER";
      defects.push({
        defectId: `balloon-edge-clip:${panel.panelId}:${balloon.balloonId}`,
        defectClass: "speech-balloon-edge-clip",
        safetyTier: tier,
        subtype: fitsInside ? "panel-edge-clip" : "oversized-for-panel",
        panelId: panel.panelId,
        balloonId: balloon.balloonId,
        clippedEdges,
        summaryKo: `패널 ${panel.panelId}의 말풍선 '${balloon.balloonId}'가 패널 경계(${clippedEdges.join("/")}) 밖으로 잘려 있습니다.`,
        recommendedActionKo:
          tier === "SAFE_AUTO_PATCH"
            ? "얼굴 보호 영역과 겹치지 않는지 검증하며 패널 여백 안쪽으로 최소 이동합니다."
            : "말풍선 크기나 대사 줄바꿈을 작가가 직접 수정해야 합니다.",
        metrics: { clippedEdgeCount: clippedEdges.length, fitsInside },
      });
    }
  }
  return defects;
}

function scanVerticalSliceBudget(episode: OvernightEpisodeSnapshot, limits: PlatformSliceLimitSpec): readonly OvernightDefect[] {
  const defects: OvernightDefect[] = [];
  if (episode.canvasWidthPx !== limits.targetWidthPx) {
    defects.push({
      defectId: `slice-width:${episode.episodeId}:${episode.canvasWidthPx}`,
      defectClass: "vertical-slice-budget-violation",
      safetyTier: "PROPOSE_REVIEW_PATCH",
      subtype: "canvas-width-mismatch",
      summaryKo: `캔버스 가로 폭(${episode.canvasWidthPx}px)이 ${limits.labelKo} 기준(${limits.targetWidthPx}px)과 다릅니다.`,
      recommendedActionKo: "출고 리샘플링 비율을 확인한 뒤 기준 가로 폭으로 맞춥니다.",
      metrics: { canvasWidthPx: episode.canvasWidthPx, targetWidthPx: limits.targetWidthPx },
    });
  }

  const cuts =
    episode.plannedSliceCutsY && episode.plannedSliceCutsY.length >= 2
      ? Array.from(episode.plannedSliceCutsY).sort((a, b) => a - b)
      : [0, episode.canvasHeightPx];

  let exceededSlices = 0; let worstSliceHeightPx = 0;
  for (let i = 0; i + 1 < cuts.length; i += 1) {
    const sliceH = (cuts[i + 1] ?? 0) - (cuts[i] ?? 0);
    if (sliceH > worstSliceHeightPx) worstSliceHeightPx = sliceH;
    if (sliceH > limits.maxSliceHeightPx) exceededSlices += 1;
  }

  let bisectedBalloons = 0; let bisectedFaces = 0;
  for (let i = 1; i + 1 < cuts.length; i += 1) {
    const cutY = cuts[i] ?? 0;
    for (const b of episode.speechBalloons) if (rectBisectedByCutY(b.bbox, cutY)) bisectedBalloons += 1;
    for (const f of episode.faceKeepOutBoxes) if (rectBisectedByCutY(f.bbox, cutY)) bisectedFaces += 1;
  }

  if (exceededSlices > 0) {
    defects.push({
      defectId: `slice-height-budget:${episode.episodeId}`,
      defectClass: "vertical-slice-budget-violation",
      safetyTier: "SAFE_AUTO_PATCH",
      subtype: "slice-height-exceeded",
      summaryKo: `세로 슬라이스 최대 높이(${worstSliceHeightPx}px)가 ${limits.labelKo} 제한(${limits.maxSliceHeightPx}px)을 초과했습니다(${exceededSlices}구간).`,
      recommendedActionKo: "말풍선과 얼굴을 피한 빈 여백(거터) 구간에 안전한 세로 분할선을 자동 배치합니다.",
      metrics: { worstSliceHeightPx, maxSliceHeightPx: limits.maxSliceHeightPx, exceededSlices },
    });
  }
  if (bisectedBalloons > 0 || bisectedFaces > 0) {
    defects.push({
      defectId: `slice-cut-bisection:${episode.episodeId}`,
      defectClass: "vertical-slice-budget-violation",
      safetyTier: "SAFE_AUTO_PATCH",
      subtype: "cut-bisects-protected-region",
      summaryKo: `기존 세로 분할선이 보호 영역(말풍선 ${bisectedBalloons}건, 얼굴 ${bisectedFaces}건)을 가로지릅니다.`,
      recommendedActionKo: "여백 기반 세로 분할 플래너로 분할선을 빈 거터 구간으로 재배치합니다.",
      metrics: { bisectedBalloons, bisectedFaces },
    });
  }
  return defects;
}

function scanPanelSequenceAndGutters(panels: readonly OvernightPanelState[]): readonly OvernightDefect[] {
  const defects: OvernightDefect[] = [];
  if (panels.length === 0) return defects;

  const seen = new Set<number>();
  const duplicates: number[] = [];
  const invalid: number[] = [];
  for (const p of panels) {
    if (!Number.isInteger(p.sequenceIndex) || p.sequenceIndex < 1) invalid.push(p.sequenceIndex);
    else if (seen.has(p.sequenceIndex)) duplicates.push(p.sequenceIndex);
    else seen.add(p.sequenceIndex);
  }
  const missing: number[] = [];
  for (let n = 1; n <= panels.length; n += 1) if (!seen.has(n)) missing.push(n);
  if (duplicates.length > 0 || missing.length > 0 || invalid.length > 0) {
    defects.push({
      defectId: `panel-seq-gap:${missing.join(",")}:${duplicates.join(",")}`,
      defectClass: "panel-sequence-numbering-gap",
      safetyTier: "PROPOSE_REVIEW_PATCH",
      subtype: "sequence-index-mismatch",
      summaryKo: `패널 컷 번호 체계에 누락(${missing.length}건)·중복(${duplicates.length}건)·오류(${invalid.length}건)가 있습니다.`,
      recommendedActionKo: "누락된 컷이 없는지 확인한 뒤 패널 순번을 재정렬합니다.",
      metrics: { missingCount: missing.length, duplicateCount: duplicates.length, invalidCount: invalid.length },
    });
  }

  const sortedByY = Array.from(panels).sort((a, b) => (a.bounds.y !== b.bounds.y ? a.bounds.y - b.bounds.y : a.bounds.x - b.bounds.x));
  for (let i = 0; i + 1 < sortedByY.length; i += 1) {
    const prev = sortedByY[i]; const next = sortedByY[i + 1];
    if (!prev || !next) continue;
    const hOverlap = Math.min(prev.bounds.x + prev.bounds.width, next.bounds.x + next.bounds.width) - Math.max(prev.bounds.x, next.bounds.x);
    if (hOverlap <= 0) continue;
    const gutterPx = next.bounds.y - (prev.bounds.y + prev.bounds.height);
    if (gutterPx <= 0) {
      defects.push({
        defectId: `panel-collapsed-gutter:${prev.panelId}:${next.panelId}`,
        defectClass: "panel-sequence-numbering-gap",
        safetyTier: "PROPOSE_REVIEW_PATCH",
        subtype: "collapsed-gutter",
        panelId: next.panelId,
        summaryKo: `패널 ${prev.panelId}과 ${next.panelId} 사이 세로 여백(거터)이 ${gutterPx}px로 붙어 있거나 겹쳐 있습니다.`,
        recommendedActionKo: "의도된 연속 컷 연출이 아니라면 두 패널 사이 세로 여백을 확보합니다.",
        metrics: { gutterPx, upperPanelId: prev.panelId, lowerPanelId: next.panelId },
      });
    }
  }
  return defects;
}

function scanRightsBomAssets(episode: OvernightEpisodeSnapshot): readonly OvernightDefect[] {
  const defects: OvernightDefect[] = [];
  for (const asset of episode.rightsBomAssets) {
    const expiredByDate =
      asset.licenseStatus === "verified-commercial" &&
      episode.auditDateIso !== undefined &&
      asset.expiresAtIso !== undefined &&
      asset.expiresAtIso < episode.auditDateIso;
    if (asset.licenseStatus === "verified-commercial" && !expiredByDate) continue;
    const status = expiredByDate ? "expired" : asset.licenseStatus;
    const statusKo = status === "expired" ? "라이선스 만료" : status === "non-commercial-only" ? "비상업 전용(상업 연재 불가)" : "라이선스 정보 누락";
    defects.push({
      defectId: `rights-bom:${asset.assetId}:${status}`,
      defectClass: "rights-bom-unverified-asset",
      safetyTier: "HARD_HUMAN_BLOCKER",
      subtype: status,
      assetId: asset.assetId,
      panelId: asset.usedInPanelIds[0],
      summaryKo: `Rights BOM 자산 '${asset.assetName}'(${asset.assetType})이 ${statusKo} 상태여서 상업 출고를 차단했습니다.`,
      recommendedActionKo: "상업 라이선스 증빙을 갱신하거나 대체 자산으로 교체해야 출고 잠금이 해제됩니다.",
      metrics: { licenseStatus: status, assetType: asset.assetType, usedPanelCount: asset.usedInPanelIds.length },
    });
  }
  return defects;
}

/** 회차 스냅샷 전체를 비파괴로 스캔해 8대 결함과 안전 등급 집계를 반환한다. */
export function scanOvernightEpisodeDefects(episode: OvernightEpisodeSnapshot, options: OvernightScanOptions = {}): OvernightScanReport {
  const maxPinholeSpanPx = options.maxPinholeSpanPx ?? DEFAULT_MAX_PINHOLE_SPAN_PX;
  const inkLumaThreshold = options.inkLumaThreshold ?? DEFAULT_INK_LUMA_THRESHOLD;
  const alphaHaloMinPixels = options.alphaHaloMinPixels ?? DEFAULT_ALPHA_HALO_MIN_PIXELS;
  const limits = PLATFORM_SLICE_SPECS[episode.platformSpec];

  const defects: OvernightDefect[] = [];
  const panelById = new Map<string, OvernightPanelState>();
  let scannedLayerCount = 0;

  for (const panel of episode.panels) {
    panelById.set(panel.panelId, panel);
    scannedLayerCount += panel.layers.length;
    defects.push(...scanPanelLayers(panel, maxPinholeSpanPx, inkLumaThreshold, alphaHaloMinPixels));
  }
  if (episode.colorProfile !== undefined && episode.colorProfile !== "srgb") {
    defects.push({
      defectId: `color-profile:episode:${episode.episodeId}:${episode.colorProfile}`,
      defectClass: "color-profile-mismatch",
      safetyTier: "PROPOSE_REVIEW_PATCH",
      subtype: "episode-non-srgb",
      summaryKo: `회차 문서 색 공간이 웹 출고 표준(sRGB)이 아닌 '${episode.colorProfile}'입니다.`,
      recommendedActionKo: "sRGB 변환 미리보기에서 색감 변화를 확인한 뒤 변환을 승인합니다.",
      metrics: { colorProfile: episode.colorProfile },
    });
  }

  defects.push(
    ...scanSpeechBalloons(episode, panelById),
    ...scanVerticalSliceBudget(episode, limits),
    ...scanPanelSequenceAndGutters(episode.panels),
    ...scanRightsBomAssets(episode),
  );

  const countsByTier: Record<OvernightPatchSafetyTier, number> = { SAFE_AUTO_PATCH: 0, PROPOSE_REVIEW_PATCH: 0, HARD_HUMAN_BLOCKER: 0 };
  const countsByClass: Record<OvernightDefectClass, number> = {
    "transparent-pinhole-gap": 0,
    "speech-balloon-edge-clip": 0,
    "draft-guide-layer-left-visible": 0,
    "layer-blend-alpha-halo": 0,
    "vertical-slice-budget-violation": 0,
    "panel-sequence-numbering-gap": 0,
    "color-profile-mismatch": 0,
    "rights-bom-unverified-asset": 0,
  };
  for (const d of defects) { countsByTier[d.safetyTier] += 1; countsByClass[d.defectClass] += 1; }

  return {
    episodeId: episode.episodeId,
    title: episode.title,
    platformSpec: episode.platformSpec,
    platformLimits: limits,
    scannedPanelCount: episode.panels.length,
    scannedLayerCount,
    defects,
    countsByTier,
    countsByClass,
    safeAutoPatchCount: countsByTier.SAFE_AUTO_PATCH,
    proposeReviewCount: countsByTier.PROPOSE_REVIEW_PATCH,
    hardBlockerCount: countsByTier.HARD_HUMAN_BLOCKER,
    exportReady: defects.length === 0,
  };
}
