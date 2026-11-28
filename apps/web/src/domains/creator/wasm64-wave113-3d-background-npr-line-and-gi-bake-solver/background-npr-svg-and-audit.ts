/**
 * Wave 113 — 3D 배경 NPR 선화 + 1-바운스 GI 색번짐 조화 인쇄 호환 OKLCH SVG 렌더러
 * (원시 hex/rgb 금지) 및 자연스러운 한국어 배경 감독 QA 브리프 생성기.
 */

import {
  clamp,
  type NprExtractionResult,
  type RgbLinear,
} from "./npr-mesh-edge-and-hlr-extractor";
import type {
  BackgroundGiBakeResult,
  BakedGiPatch,
  HarmonizedBackgroundGiResult,
  HarmonizedGiPatch,
} from "./radiosity-one-bounce-gi-and-wgsl";

const SVG_PALETTE = {
  paperBg: "oklch(0.985 0.008 90)",
  canvasFrame: "oklch(0.955 0.010 92)",
  borderLine: "oklch(0.835 0.014 90)",
  headerInk: "oklch(0.205 0.020 245)",
  subInk: "oklch(0.415 0.018 245)",
  badgeBg: "oklch(0.940 0.016 155)",
  badgeInk: "oklch(0.285 0.065 155)",
  silhouetteHue: 248,
  creaseHue: 240,
  seamHue: 220,
} as const;

export interface BackgroundNprSvgOptions {
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly customTitle?: string;
  readonly showHudLegend?: boolean;
  readonly useRawGiWithoutHarmonize?: boolean;
}

export interface BackgroundNprBakeAuditKo {
  readonly verdict: "ready" | "needs-depth-tune" | "check-occlusion";
  readonly headlineKo: string;
  readonly bulletsKo: readonly string[];
  readonly reportTextKo: string;
  readonly silhouetteBoundaryEdges: number;
  readonly hardCreaseEdges: number;
  readonly materialSeamEdges: number;
  readonly diagonalClutterCount: number;
  readonly occludedSampleCount: number;
  readonly hiddenSegmentCount: number;
  readonly nearToFarWidthRatio: number;
  readonly totalBounceRatioPercent: number;
  readonly energyConserved: boolean;
  readonly characterSeparationScore: number | null;
}

/** XML 특수문자를 안전하게 이스케이프한다. */
export function escapeNprSvgXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeNum(value: number, fallback: number = 0, digits: number = 2): string {
  const safe = Number.isFinite(value) ? value : fallback;
  const norm = Object.is(safe, -0) || Math.abs(safe) < 1e-12 ? 0 : safe;
  return norm.toFixed(digits);
}

/**
 * 선형 sRGB(`[0..1]^3`)를 Björn Ottosson OKLab 변환 행렬을 거쳐
 * CSS `oklch(L C H)` 문자열로 정확하게 변환한다.
 */
export function linearRgbToOklchCss(rgb: RgbLinear, alpha?: number): string {
  const r = clamp(rgb[0], 0, 1);
  const g = clamp(rgb[1], 0, 1);
  const b = clamp(rgb[2], 0, 1);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const lCbrt = Math.cbrt(Math.max(0, l));
  const mCbrt = Math.cbrt(Math.max(0, m));
  const sCbrt = Math.cbrt(Math.max(0, s));

  const lightness = clamp(
    0.2104542553 * lCbrt + 0.7936177850 * mCbrt - 0.0040720468 * sCbrt,
    0,
    1,
  );
  const aLab = 1.9779984951 * lCbrt - 2.4285922050 * mCbrt + 0.4505937099 * sCbrt;
  const bLab = 0.0259040371 * lCbrt + 0.7827717662 * mCbrt - 0.8086757660 * sCbrt;

  const chroma = clamp(Math.sqrt(aLab * aLab + bLab * bLab), 0, 0.4);
  const rawHue = chroma < 1e-4 ? 0 : ((Math.atan2(bLab, aLab) * 180) / Math.PI + 360) % 360;

  if (alpha !== undefined && Number.isFinite(alpha) && alpha < 0.999) {
    const clampedAlpha = clamp(alpha, 0, 1);
    return `oklch(${safeNum(lightness, 0.5, 4)} ${safeNum(chroma, 0, 4)} ${safeNum(rawHue, 0, 1)} / ${safeNum(clampedAlpha, 1, 3)})`;
  }
  return `oklch(${safeNum(lightness, 0.5, 4)} ${safeNum(chroma, 0, 4)} ${safeNum(rawHue, 0, 1)})`;
}

function isHarmonizedGiResult(
  gi: HarmonizedBackgroundGiResult | BackgroundGiBakeResult,
): gi is HarmonizedBackgroundGiResult {
  return "characterSeparationScore" in gi;
}

function isHarmonizedPatch(patch: BakedGiPatch | HarmonizedGiPatch): patch is HarmonizedGiPatch {
  return "harmonizedRgb" in patch;
}

function softToneMapForSvg(rgb: RgbLinear): RgbLinear {
  const mapCh = (v: number): number => {
    const safe = Number.isFinite(v) && v > 0 ? v : 0;
    return clamp(safe / (1 + safe * 0.45), 0, 1);
  };
  return [mapCh(rgb[0]), mapCh(rgb[1]), mapCh(rgb[2])];
}

/**
 * GI 색번짐·조화가 적용된 배경 폴리곤(원경→근경 화가 정렬) 위에
 * 은선 제거(HLR)와 깊이별 필압 감쇠가 끝난 웹툰 NPR 선화를 겹쳐
 * 인쇄 호환 고대비 OKLCH SVG로 렌더링한다.
 */
export function render3dBackgroundNprSvg(
  nprResult: NprExtractionResult,
  giResult: HarmonizedBackgroundGiResult | BackgroundGiBakeResult,
  options?: BackgroundNprSvgOptions,
): string {
  const camW = nprResult.projection.camera.widthPx;
  const camH = nprResult.projection.camera.heightPx;
  const showHud = options?.showHudLegend ?? true;
  const headerH = showHud ? 54 : 0;
  const footerH = showHud ? 44 : 0;
  const outW = Math.max(320, Math.round(options?.widthPx ?? camW));
  const outH = Math.max(240, Math.round(options?.heightPx ?? camH + headerH + footerH));
  const viewTop = headerH;
  const viewH = Math.max(120, outH - headerH - footerH);
  const scaleX = outW / Math.max(camW, 1);
  const scaleY = viewH / Math.max(camH, 1);

  const patchByTri = new Map<number, BakedGiPatch | HarmonizedGiPatch>();
  for (const patch of giResult.patches) {
    patchByTri.set(patch.triIndex, patch);
  }

  // 1) 정면 삼각형을 원경 -> 근경(painter's order)으로 정렬
  const frontTris = nprResult.projection.triangles
    .filter((t) => t.isFrontFacing && t.inFrustum)
    .sort((a, b) => b.meanDepthMeters - a.meanDepthMeters);

  const polyParts: string[] = [];
  for (const tri of frontTris) {
    const patch = patchByTri.get(tri.triIndex);
    let fillRgb: RgbLinear = tri.albedoRgb;
    if (patch) {
      if (!options?.useRawGiWithoutHarmonize && isHarmonizedPatch(patch)) {
        fillRgb = patch.harmonizedRgb;
      } else {
        fillRgb = softToneMapForSvg(patch.totalRadianceRgb);
      }
    }
    const fillCss = linearRgbToOklchCss(fillRgb);
    const pts = tri.screenVertices
      .map((pt) => `${safeNum(pt[0] * scaleX, 0, 2)},${safeNum(viewTop + pt[1] * scaleY, viewTop, 2)}`)
      .join(" ");
    polyParts.push(
      `    <polygon points="${pts}" fill="${fillCss}" stroke="${fillCss}" stroke-width="0.65" stroke-linejoin="round" data-surface="${escapeNprSvgXml(tri.surfaceTag)}" />`,
    );
  }

  // 2) HLR 통과 선화 세그먼트를 원경 -> 근경 순으로 오버레이
  const sortedSegs = [...nprResult.segments].sort((a, b) => b.meanDepthMeters - a.meanDepthMeters);
  const strokeParts: string[] = [];
  for (const seg of sortedSegs) {
    const sx1 = seg.x1 * scaleX;
    const sy1 = viewTop + seg.y1 * scaleY;
    const sx2 = seg.x2 * scaleX;
    const sy2 = viewTop + seg.y2 * scaleY;
    const dx = sx2 - sx1;
    const dy = sy2 - sy1;
    const len = Math.hypot(dx, dy);
    const nx = len > 1e-4 ? -dy / len : 0;
    const ny = len > 1e-4 ? dx / len : 0;
    const mx = (sx1 + sx2) * 0.5 + nx * seg.organicJitterPx;
    const my = (sy1 + sy2) * 0.5 + ny * seg.organicJitterPx;

    const hue =
      seg.edgeClass === "silhouette-boundary"
        ? SVG_PALETTE.silhouetteHue
        : seg.edgeClass === "hard-crease"
          ? SVG_PALETTE.creaseHue
          : SVG_PALETTE.seamHue;
    const chroma = seg.edgeClass === "material-seam" ? 0.024 : 0.018;
    const strokeCss = `oklch(${safeNum(seg.inkLightness, 0.2, 4)} ${safeNum(chroma, 0.018, 4)} ${hue} / ${safeNum(seg.inkOpacity, 0.9, 3)})`;
    const strokeWidth = clamp(seg.widthMidPx * Math.min(scaleX, scaleY), 0.4, 8);

    strokeParts.push(
      `    <path d="M ${safeNum(sx1)} ${safeNum(sy1)} Q ${safeNum(mx)} ${safeNum(my)} ${safeNum(sx2)} ${safeNum(sy2)}" fill="none" stroke="${strokeCss}" stroke-width="${safeNum(strokeWidth, 1.2, 2)}" stroke-linecap="round" stroke-linejoin="round" data-edge-class="${seg.edgeClass}" />`,
    );
  }

  const titleRaw = options?.customTitle ?? `${nprResult.labelKo} — 3D 배경 NPR 선화·1-바운스 GI`;
  const titleEsc = escapeNprSvgXml(titleRaw);
  const sepText = isHarmonizedGiResult(giResult)
    ? `2D 인물 분리 ${(giResult.characterSeparationScore * 100).toFixed(0)}점 · 기준 깊이 ${safeNum(giResult.characterDepthMeters, 3.4, 1)}m`
    : `1-바운스 GI 직사+반사광 모드`;
  const subtitleEsc = escapeNprSvgXml(
    `실루엣 ${nprResult.counts.silhouetteBoundaryEdges} · 크리즈 ${nprResult.counts.hardCreaseEdges} · 재질경계 ${nprResult.counts.materialSeamEdges} · 대각잡선 ${nprResult.counts.diagonalClutterCount} · ${sepText}`,
  );
  const footerEsc = escapeNprSvgXml(
    `은선 제거 ${nprResult.counts.hiddenSegmentCount}구간(${nprResult.counts.occludedSampleCount}샘플 가림) · 근경/원경 선굵기 ${safeNum(nprResult.depthAttenuation.meanNearLineWidthPx, 0, 2)}px / ${safeNum(nprResult.depthAttenuation.meanFarLineWidthPx, 0, 2)}px · GI 반사율 ${safeNum(giResult.energyAudit.totalBounceRatio * 100, 0, 1)}%`,
  );

  const clipId = `viewport-clip-${escapeNprSvgXml(nprResult.meshId.replace(/[^a-zA-Z0-9_-]/g, ""))}`;
  const headerBlock = showHud
    ? [
        `  <rect x="0" y="0" width="${outW}" height="${headerH}" fill="${SVG_PALETTE.paperBg}" />`,
        `  <text x="18" y="24" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif" font-size="15" font-weight="700" fill="${SVG_PALETTE.headerInk}">${titleEsc}</text>`,
        `  <text x="18" y="43" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif" font-size="11.5" fill="${SVG_PALETTE.subInk}">${subtitleEsc}</text>`,
        `  <line x1="0" y1="${headerH}" x2="${outW}" y2="${headerH}" stroke="${SVG_PALETTE.borderLine}" stroke-width="1" />`,
      ].join("\n")
    : "";

  const footerBlock = showHud
    ? [
        `  <line x1="0" y1="${viewTop + viewH}" x2="${outW}" y2="${viewTop + viewH}" stroke="${SVG_PALETTE.borderLine}" stroke-width="1" />`,
        `  <rect x="0" y="${viewTop + viewH}" width="${outW}" height="${footerH}" fill="${SVG_PALETTE.paperBg}" />`,
        `  <rect x="16" y="${viewTop + viewH + 10}" width="72" height="24" rx="6" fill="${SVG_PALETTE.badgeBg}" />`,
        `  <text x="52" y="${viewTop + viewH + 26}" text-anchor="middle" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif" font-size="11" font-weight="600" fill="${SVG_PALETTE.badgeInk}">Wave 113</text>`,
        `  <text x="100" y="${viewTop + viewH + 26}" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif" font-size="11.5" fill="${SVG_PALETTE.subInk}">${footerEsc}</text>`,
      ].join("\n")
    : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${outW} ${outH}" width="${outW}" height="${outH}" role="img" aria-label="${titleEsc}">`,
    `  <defs>`,
    `    <clipPath id="${clipId}"><rect x="0" y="${viewTop}" width="${outW}" height="${viewH}" /></clipPath>`,
    `  </defs>`,
    `  <rect x="0" y="0" width="${outW}" height="${outH}" fill="${SVG_PALETTE.paperBg}" />`,
    headerBlock,
    `  <rect x="0" y="${viewTop}" width="${outW}" height="${viewH}" fill="${SVG_PALETTE.canvasFrame}" />`,
    `  <g clip-path="url(#${clipId})">`,
    `    <g data-layer="gi-shaded-polygons">`,
    polyParts.join("\n"),
    `    </g>`,
    `    <g data-layer="npr-hlr-lineart">`,
    strokeParts.join("\n"),
    `    </g>`,
    `  </g>`,
    footerBlock,
    `</svg>`,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

/**
 * 3D 배경 NPR 선화 추출 결과와 1-바운스 GI 조화 결과를 바탕으로
 * 웹툰 배경 감독용 자연스러운 한국어 QA 점검 브리프를 작성한다.
 */
export function summarizeBackgroundNprBakeKo(
  nprResult: NprExtractionResult,
  giResult: HarmonizedBackgroundGiResult | BackgroundGiBakeResult,
): BackgroundNprBakeAuditKo {
  const c = nprResult.counts;
  const da = nprResult.depthAttenuation;
  const audit = giResult.energyAudit;
  const bouncePct = Number((audit.totalBounceRatio * 100).toFixed(1));
  const sepScore = isHarmonizedGiResult(giResult) ? giResult.characterSeparationScore : null;

  let verdict: BackgroundNprBakeAuditKo["verdict"] = "ready";
  if (!audit.energyConserved || c.diagonalClutterCount > 0) {
    verdict = "check-occlusion";
  } else if (sepScore !== null && sepScore < 0.62) {
    verdict = "needs-depth-tune";
  }

  const headlineKo =
    verdict === "ready"
      ? `${nprResult.labelKo} 3D 배경 선화·GI 베이크 통과 — 대각 잡선 없이 은선 정리와 2D 인물 분리 완료`
      : verdict === "needs-depth-tune"
        ? `${nprResult.labelKo} 배경 선화 추출 완료 — 캐릭터 깊이 평면 뒤 안개 강도 미세 조정 권장`
        : `${nprResult.labelKo} 배경 베이크 재점검 필요 — 에너지 보존 또는 은선 설정 확인`;

  const domBounce = audit.dominantBounceRgb;
  const warmLabel =
    domBounce[0] > domBounce[2] + 0.002
      ? "따뜻한 난색 계열"
      : domBounce[2] > domBounce[0] + 0.002
        ? "차분한 한색 계열"
        : "중립 톤";

  const bulletsKo: string[] = [
    `외곽·구조 선화: 실루엣 경계 ${c.silhouetteBoundaryEdges}개, 하드 크리즈 ${c.hardCreaseEdges}개, 재질 경계 ${c.materialSeamEdges}개를 추출했고 공면 삼각화 내부 대각선 ${c.smoothInteriorSuppressed}개를 억제해 잡선 ${c.diagonalClutterCount}건으로 마감했습니다.`,
    `은선 제거(HLR): 전체 ${c.totalSamplesTested}개 표본 중 앞쪽 구조물에 가린 ${c.occludedSampleCount}개 표본(${c.hiddenSegmentCount}개 구간)을 덜어내 최종 ${c.visibleSegmentCount}개 가시 선분만 남겼습니다.`,
    `원근 필압 감쇠: 근경 평균 선 굵기 ${da.meanNearLineWidthPx.toFixed(2)}px, 원경 평균 ${da.meanFarLineWidthPx.toFixed(2)}px(배율 ${da.nearToFarWidthRatio.toFixed(2)}배)로 앞뒤 거리감을 살렸습니다.`,
    `1-바운스 GI 색번짐: 직접광 대비 반사광 비율 ${bouncePct.toFixed(1)}%로 에너지 보존 한계(100% 미만) 안에서 ${warmLabel} 반사광을 입혔습니다.`,
  ];

  if (isHarmonizedGiResult(giResult)) {
    const contrastDropPct =
      giResult.rawBehindContrast > 1e-4
        ? ((1 - giResult.harmonizedBehindContrast / giResult.rawBehindContrast) * 100).toFixed(1)
        : "0.0";
    bulletsKo.push(
      `2D 캐릭터 조화: 깊이 ${giResult.characterDepthMeters.toFixed(1)}m 뒤 배경 패치 ${giResult.behindPatchCount}개의 명암 요동을 ${contrastDropPct}% 낮추고 전경 ${giResult.foregroundPreservedCount}개는 그대로 유지해 인물 분리 점수를 ${(giResult.rawSeparationScore * 100).toFixed(0)}점에서 ${(giResult.characterSeparationScore * 100).toFixed(0)}점으로 끌어올렸습니다.`,
    );
  }

  const reportTextKo = [headlineKo, ...bulletsKo.map((item) => `- ${item}`)].join("\n");

  return {
    verdict,
    headlineKo,
    bulletsKo,
    reportTextKo,
    silhouetteBoundaryEdges: c.silhouetteBoundaryEdges,
    hardCreaseEdges: c.hardCreaseEdges,
    materialSeamEdges: c.materialSeamEdges,
    diagonalClutterCount: c.diagonalClutterCount,
    occludedSampleCount: c.occludedSampleCount,
    hiddenSegmentCount: c.hiddenSegmentCount,
    nearToFarWidthRatio: da.nearToFarWidthRatio,
    totalBounceRatioPercent: bouncePct,
    energyConserved: audit.energyConserved,
    characterSeparationScore: sepScore,
  };
}
