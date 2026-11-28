/**
 * Wave 151 — 야간 색온도(Kelvin→OKLCH) 변환, 60-30-10 야간 색조 조화 감사기,
 * 원경 대기 감쇠 보정기 및 순수 ES2017 동기 FIPS 180-4 SHA-256 매니페스트 지문 생성기.
 */

import {
  clampFinite,
  formatOklchCss,
  getCityscapeMoodPreset,
  normalizeHueDeg,
  type CityscapeBuilding,
  type CityscapeDepthBand,
  type CityscapeNightScene,
  type OklchColor,
  type PlacedNeonSignboard,
} from "./cityscape-night-types";
import {
  cityscapeManifestSha256Hex,
  sha256Utf8Hex,
} from "./cityscape-sha256-and-canonical";

export { cityscapeManifestSha256Hex, sha256Utf8Hex };

export type CityscapeHarmonyIssueCode =
  | "neon-overcrowding"
  | "neon-hue-clash"
  | "depth-haze-inversion"
  | "dominant-balance-drift";

export interface CityscapeHarmonyIssue {
  readonly code: CityscapeHarmonyIssueCode;
  readonly severity: "error" | "warning";
  readonly messageKo: string;
  readonly metricValue: number;
  readonly threshold: number;
}

export interface DepthBandColorMetrics {
  readonly depthBand: CityscapeDepthBand;
  readonly buildingCount: number;
  readonly meanChroma: number;
  readonly meanLightness: number;
  readonly meanTransmittance: number;
}

export interface CityscapeNightHarmonyAudit {
  readonly moodId: CityscapeNightScene["moodId"];
  readonly dominantRatio: number;
  readonly secondaryRatio: number;
  readonly accentRatio: number;
  readonly distinctNeonHueCount: number;
  readonly neonHueClustersDeg: readonly number[];
  readonly depthBandMetrics: Readonly<Record<CityscapeDepthBand, DepthBandColorMetrics>>;
  readonly isDepthChromaMonotonic: boolean;
  readonly isDepthLightnessAttenuated: boolean;
  readonly harmonyScore: number;
  readonly passed: boolean;
  readonly issues: readonly CityscapeHarmonyIssue[];
  readonly manifestSha256Hex: string;
}

export interface CityscapeNightHarmonizationResult {
  readonly scene: CityscapeNightScene;
  readonly beforeAudit: CityscapeNightHarmonyAudit;
  readonly afterAudit: CityscapeNightHarmonyAudit;
  readonly adjustmentsKo: readonly string[];
}

export interface LinearRgbTuple {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

function srgbChannelToLinear(c: number): number {
  const clamped = clampFinite(c, 0, 1, 0);
  return clamped <= 0.04045 ? clamped / 12.92 : Math.pow((clamped + 0.055) / 1.055, 2.4);
}

/**
 * Tanner/CIE 플랑크 흑체 근사를 거쳐 선형 sRGB → OKLab → OKLCH로 변환한다.
 * 2700K는 따뜻한 호박색, 5500K는 중립 백색, 8500K는 차가운 청백색을 산출한다.
 */
export function kelvinToOklch(kelvin: number): OklchColor {
  const k = clampFinite(kelvin, 1200, 15000, 4500);
  const temp = k / 100;

  let r255: number;
  let g255: number;
  let b255: number;

  if (temp <= 66) {
    r255 = 255;
    g255 = 99.4708025861 * Math.log(Math.max(temp, 1)) - 161.1195681661;
    b255 = temp <= 19 ? 0 : 138.5177312231 * Math.log(Math.max(temp - 10, 1)) - 305.0447927307;
  } else {
    r255 = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    g255 = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
    b255 = 255;
  }

  const rLin = srgbChannelToLinear(clampFinite(r255 / 255, 0, 1, 1));
  const gLin = srgbChannelToLinear(clampFinite(g255 / 255, 0, 1, 1));
  const bLin = srgbChannelToLinear(clampFinite(b255 / 255, 0, 1, 1));

  const lCone = 0.4122214708 * rLin + 0.5363325363 * gLin + 0.0514459929 * bLin;
  const mCone = 0.2119034982 * rLin + 0.6806995451 * gLin + 0.1073969566 * bLin;
  const sCone = 0.0883024619 * rLin + 0.2817188376 * gLin + 0.6299787005 * bLin;

  const lCbrt = Math.cbrt(Math.max(0, lCone));
  const mCbrt = Math.cbrt(Math.max(0, mCone));
  const sCbrt = Math.cbrt(Math.max(0, sCone));

  const okL = 0.2104542553 * lCbrt + 0.7936177850 * mCbrt - 0.0040720468 * sCbrt;
  const okA = 1.9779984951 * lCbrt - 2.4285922050 * mCbrt + 0.4505937099 * sCbrt;
  const okB = 0.0259040371 * lCbrt + 0.7827717662 * mCbrt - 0.8086757660 * sCbrt;

  const chroma = Math.hypot(okA, okB);
  const hue = chroma < 0.0005 ? 0 : normalizeHueDeg((Math.atan2(okB, okA) * 180) / Math.PI);

  return {
    l: Math.round(clampFinite(okL, 0, 1, 0.85) * 10000) / 10000,
    c: Math.round(clampFinite(chroma, 0, 0.4, 0) * 10000) / 10000,
    h: Math.round(hue * 100) / 100,
  };
}

/**
 * WebGPU WGSL 유니폼 상수 주입용 OKLCH → 선형 RGB 변환기.
 */
export function oklchToLinearRgb(color: OklchColor): LinearRgbTuple {
  const l = clampFinite(color.l, 0, 1, 0.5);
  const c = clampFinite(color.c, 0, 0.4, 0);
  const hRad = (normalizeHueDeg(color.h) * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;

  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;

  return {
    r: clampFinite(r, 0, 1, 0),
    g: clampFinite(g, 0, 1, 0),
    b: clampFinite(bl, 0, 1, 0),
  };
}

export function computeAtmosphericTransmittance(
  distanceMeters: number,
  extinctionBeta: number,
  focusStartMeters = 14,
): number {
  const effectiveDist = Math.max(0, clampFinite(distanceMeters, 0, 2000, 40) - focusStartMeters);
  const beta = clampFinite(extinctionBeta, 0.0005, 0.2, 0.008);
  return Math.exp(-beta * effectiveDist);
}

/**
 * Beer-Lambert 거리 투과율에 따라 원경으로 갈수록 채도와 대비를 야간 안개색 쪽으로 감쇠시킨다.
 */
export function applyAtmosphericDepthAttenuation(
  color: OklchColor,
  hazeColor: OklchColor,
  distanceMeters: number,
  extinctionBeta: number,
  focusStartMeters = 14,
): OklchColor {
  const t = computeAtmosphericTransmittance(distanceMeters, extinctionBeta, focusStartMeters);
  const blend = clampFinite(t, 0.14, 1, 0.5);
  const chromaScale = Math.pow(blend, 1.15);

  const l = color.l * blend + hazeColor.l * (1 - blend);
  const c = color.c * chromaScale + hazeColor.c * (1 - chromaScale) * 0.45;
  const hDiff = ((hazeColor.h - color.h + 540) % 360) - 180;
  const h = normalizeHueDeg(color.h + hDiff * (1 - blend) * 0.55);

  return {
    l: Math.round(clampFinite(l, 0.05, 0.98, color.l) * 10000) / 10000,
    c: Math.round(clampFinite(c, 0, 0.36, color.c) * 10000) / 10000,
    h: Math.round(h * 100) / 100,
    ...(color.alpha !== undefined ? { alpha: color.alpha } : {}),
  };
}

function angularHueDistanceDeg(a: number, b: number): number {
  const diff = Math.abs(normalizeHueDeg(a) - normalizeHueDeg(b));
  return diff > 180 ? 360 - diff : diff;
}

function clusterNeonHues(signs: readonly PlacedNeonSignboard[]): readonly number[] {
  const clusters: number[] = [];
  for (const sign of signs) {
    if (sign.accentColorOklch.c < 0.065) continue;
    const h = normalizeHueDeg(sign.accentColorOklch.h);
    const matched = clusters.some((center) => angularHueDistanceDeg(center, h) < 28);
    if (!matched) {
      clusters.push(Math.round(h * 10) / 10);
    }
  }
  return clusters;
}

function computeDepthBandMetrics(
  scene: CityscapeNightScene,
): Readonly<Record<CityscapeDepthBand, DepthBandColorMetrics>> {
  const preset = getCityscapeMoodPreset(scene.moodId);
  const bands: readonly CityscapeDepthBand[] = ["foreground", "midground", "background"];
  const acc: Record<
    CityscapeDepthBand,
    {
      buildingCount: number;
      chromaSum: number;
      lightnessSum: number;
      weightSum: number;
      transmittanceSum: number;
    }
  > = {
    foreground: { buildingCount: 0, chromaSum: 0, lightnessSum: 0, weightSum: 0, transmittanceSum: 0 },
    midground: { buildingCount: 0, chromaSum: 0, lightnessSum: 0, weightSum: 0, transmittanceSum: 0 },
    background: { buildingCount: 0, chromaSum: 0, lightnessSum: 0, weightSum: 0, transmittanceSum: 0 },
  };

  for (const building of scene.buildings) {
    const bucket = acc[building.depthBand];
    bucket.buildingCount += 1;
    bucket.transmittanceSum += computeAtmosphericTransmittance(
      building.distanceMeters,
      preset.atmosphericExtinctionBeta,
    );

    // 건물 외벽(기본 1.0) + 점등 창문(평균) + 네온 간판의 지각 채도·명도를 합산 측정
    bucket.chromaSum += building.facadeBaseOklch.c * 1.2;
    bucket.lightnessSum += building.facadeBaseOklch.l * 1.2;
    bucket.weightSum += 1.2;

    const litWindows = building.facadeWindows.windows.filter((w) => w.lit);
    if (litWindows.length > 0) {
      let winC = 0;
      let winL = 0;
      for (const w of litWindows) {
        winC += w.oklch.c;
        winL += w.oklch.l;
      }
      const avgWinC = winC / litWindows.length;
      const avgWinL = winL / litWindows.length;
      bucket.chromaSum += avgWinC * 1.5;
      bucket.lightnessSum += avgWinL * 1.5;
      bucket.weightSum += 1.5;
    }

    if (building.signboards.length > 0) {
      let signC = 0;
      let signL = 0;
      for (const s of building.signboards) {
        signC += s.accentColorOklch.c;
        signL += s.accentColorOklch.l;
      }
      const avgSignC = signC / building.signboards.length;
      const avgSignL = signL / building.signboards.length;
      bucket.chromaSum += avgSignC * 1.3;
      bucket.lightnessSum += avgSignL * 1.3;
      bucket.weightSum += 1.3;
    }
  }

  const out = {} as Record<CityscapeDepthBand, DepthBandColorMetrics>;
  for (const band of bands) {
    const b = acc[band];
    const meanChroma = b.weightSum > 0 ? b.chromaSum / b.weightSum : 0;
    const meanLightness = b.weightSum > 0 ? b.lightnessSum / b.weightSum : 0;
    const meanTransmittance = b.buildingCount > 0 ? b.transmittanceSum / b.buildingCount : 1;
    out[band] = {
      depthBand: band,
      buildingCount: b.buildingCount,
      meanChroma: Math.round(meanChroma * 10000) / 10000,
      meanLightness: Math.round(meanLightness * 10000) / 10000,
      meanTransmittance: Math.round(meanTransmittance * 10000) / 10000,
    };
  }
  return out;
}

/**
 * 60-30-10 야간 색조 분배, 네온 과밀·채도 충돌, 원경 대기 감쇠 역전을 감사한다.
 */
export function auditCityscapeNightHarmony(scene: CityscapeNightScene): CityscapeNightHarmonyAudit {
  const viewportArea = Math.max(1, scene.viewportWidthPx * scene.viewportHeightPx);
  let litWindowEffectiveArea = 0;
  let neonEffectiveArea = 0;
  const allSigns: PlacedNeonSignboard[] = [];

  for (const building of scene.buildings) {
    const depthWeight =
      building.depthBand === "foreground" ? 1.0 : building.depthBand === "midground" ? 0.85 : 0.65;
    for (const w of building.facadeWindows.windows) {
      if (w.lit) {
        // 실내 텅스텐 창문과 주변 창틀 반사광 포함 보조 면적(30% 대역)
        litWindowEffectiveArea += w.rect.width * w.rect.height * (1.85 + w.luminanceIntensity * 0.65) * depthWeight;
      }
    }
    for (const s of building.signboards) {
      allSigns.push(s);
      const glowFactor = 1.25 + clampFinite(s.glowRadiusPx / 28, 0.1, 0.9, 0.35);
      neonEffectiveArea += s.rect.width * s.rect.height * glowFactor;
    }
  }

  // 보조(창문·가로등 야간 반사) + 액센트(네온) + 주조(야간 하늘·건물 그림자) 정규화
  const rawAccent = clampFinite(neonEffectiveArea / viewportArea, 0, 0.85, 0);
  const rawSecondary = clampFinite(litWindowEffectiveArea / viewportArea, 0, 0.85, 0);
  const rawSum = rawAccent + rawSecondary;
  const scale = rawSum > 0.92 ? 0.92 / rawSum : 1;
  const accentRatio = Math.round(rawAccent * scale * 10000) / 10000;
  const secondaryRatio = Math.round(rawSecondary * scale * 10000) / 10000;
  const dominantRatio = Math.round(clampFinite(1 - accentRatio - secondaryRatio, 0, 1, 0.6) * 10000) / 10000;

  const neonHueClustersDeg = clusterNeonHues(allSigns);
  const distinctNeonHueCount = neonHueClustersDeg.length;
  const depthBandMetrics = computeDepthBandMetrics(scene);

  const fg = depthBandMetrics.foreground;
  const mid = depthBandMetrics.midground;
  const bg = depthBandMetrics.background;

  const hasAllThreeBands = fg.buildingCount > 0 && mid.buildingCount > 0 && bg.buildingCount > 0;
  const isDepthChromaMonotonic = hasAllThreeBands
    ? fg.meanChroma > mid.meanChroma && mid.meanChroma > bg.meanChroma
    : fg.buildingCount > 0 && bg.buildingCount > 0
      ? fg.meanChroma > bg.meanChroma
      : true;
  const isDepthLightnessAttenuated =
    bg.buildingCount === 0 || fg.buildingCount === 0
      ? true
      : bg.meanLightness <= fg.meanLightness + 0.015;

  const issues: CityscapeHarmonyIssue[] = [];

  if (accentRatio > 0.18) {
    issues.push({
      code: "neon-overcrowding",
      severity: "error",
      messageKo: `네온 액센트 점유율이 ${(accentRatio * 100).toFixed(1)}%로 상한(18%)을 넘어 야간 시선이 분산됩니다.`,
      metricValue: accentRatio,
      threshold: 0.18,
    });
  }

  if (distinctNeonHueCount >= 5) {
    issues.push({
      code: "neon-hue-clash",
      severity: "error",
      messageKo: `서로 다른 네온 색상군이 ${distinctNeonHueCount}종 난립해 컷 무드가 산만합니다(권장 4종 이하).`,
      metricValue: distinctNeonHueCount,
      threshold: 4,
    });
  }

  if (!isDepthChromaMonotonic || !isDepthLightnessAttenuated) {
    issues.push({
      code: "depth-haze-inversion",
      severity: "error",
      messageKo: "원경 건물이 근경보다 밝거나 채도가 높아 원근 대기 감쇠가 역전되었습니다.",
      metricValue: bg.meanChroma - fg.meanChroma,
      threshold: 0,
    });
  }

  if (dominantRatio < 0.42) {
    issues.push({
      code: "dominant-balance-drift",
      severity: "warning",
      messageKo: `야간 주조(하늘·그림자) 비중이 ${(dominantRatio * 100).toFixed(1)}%로 낮아 밤 분위기가 약해집니다.`,
      metricValue: dominantRatio,
      threshold: 0.42,
    });
  }

  const ratioDeviation =
    Math.abs(dominantRatio - 0.6) + Math.abs(secondaryRatio - 0.3) + Math.abs(accentRatio - 0.1);
  let score = 100 - ratioDeviation * 34;
  for (const issue of issues) {
    if (issue.code === "neon-overcrowding") score -= 24;
    else if (issue.code === "neon-hue-clash") score -= 22;
    else if (issue.code === "depth-haze-inversion") score -= 26;
    else if (issue.code === "dominant-balance-drift") score -= 10;
  }
  const harmonyScore = Math.round(clampFinite(score, 0, 100, 50) * 10) / 10;
  const hasError = issues.some((item) => item.severity === "error");

  const manifestSha256Hex = cityscapeManifestSha256Hex({
    sceneId: scene.sceneId,
    moodId: scene.moodId,
    hourOfNight: scene.hourOfNight,
    seed: scene.seed,
    viewportWidthPx: scene.viewportWidthPx,
    viewportHeightPx: scene.viewportHeightPx,
    ratios: { dominantRatio, secondaryRatio, accentRatio },
    distinctNeonHueCount,
    buildings: scene.buildings.map((b) => ({
      id: b.id,
      depthBand: b.depthBand,
      distanceMeters: b.distanceMeters,
      rect: b.rect,
      facadeBaseCss: b.facadeBaseCss,
      rowBitmasks: b.facadeWindows.rowBitmasks,
      litWindowCount: b.facadeWindows.litWindowCount,
      signs: b.signboards.map((s) => ({
        id: s.id,
        text: s.text,
        orientation: s.orientation,
        rect: s.rect,
        accentColorCss: s.accentColorCss,
      })),
    })),
  });

  return {
    moodId: scene.moodId,
    dominantRatio,
    secondaryRatio,
    accentRatio,
    distinctNeonHueCount,
    neonHueClustersDeg,
    depthBandMetrics,
    isDepthChromaMonotonic,
    isDepthLightnessAttenuated,
    harmonyScore,
    passed: !hasError && harmonyScore >= 70,
    issues,
    manifestSha256Hex,
  };
}

function nearestPaletteAnchor(
  color: OklchColor,
  palette: readonly OklchColor[],
): OklchColor {
  let best = palette[0] ?? color;
  let bestDist = Infinity;
  for (const anchor of palette) {
    const dist = angularHueDistanceDeg(color.h, anchor.h);
    if (dist < bestDist) {
      bestDist = dist;
      best = anchor;
    }
  }
  return best;
}

/**
 * 감사에서 발견된 네온 과밀·채도 충돌·원경 대기 감쇠 역전을 자동 보정해
 * 야간 조화 점수와 원근 채도 단조 감쇠(근경 > 중경 > 원경)를 회복시킨다.
 */
export function harmonizeCityscapeNightPalette(
  scene: CityscapeNightScene,
): CityscapeNightHarmonizationResult {
  const beforeAudit = auditCityscapeNightHarmony(scene);
  const preset = getCityscapeMoodPreset(scene.moodId);
  const adjustmentsKo: string[] = [];

  const needsNeonTrim = beforeAudit.accentRatio > 0.18;
  const needsHueSnap = beforeAudit.distinctNeonHueCount >= 5;
  const needsDepthFix = !beforeAudit.isDepthChromaMonotonic || !beforeAudit.isDepthLightnessAttenuated;

  const neonScaleFactor = needsNeonTrim
    ? clampFinite(Math.sqrt(0.115 / Math.max(beforeAudit.accentRatio, 0.12)), 0.42, 0.85, 0.68)
    : 1;

  if (needsNeonTrim) {
    adjustmentsKo.push(
      `네온 액센트 점유율(${(beforeAudit.accentRatio * 100).toFixed(1)}%)이 과밀해 간판 발광 반경과 외곽 크기를 자동 축소했습니다.`,
    );
  }
  if (needsHueSnap) {
    adjustmentsKo.push(
      `난립한 ${beforeAudit.distinctNeonHueCount}개 네온 색상군을 '${preset.labelKo}' 기준 ${preset.neonPaletteOklch.length}개 주조 팔레트로 정렬했습니다.`,
    );
  }
  if (needsDepthFix) {
    adjustmentsKo.push(
      "근경·중경·원경 건물과 창문에 물리 거리 기반 대기 감쇠를 다시 적용해 원근 채도 역전을 바로잡았습니다.",
    );
  }

  const distanceByBand: Readonly<Record<CityscapeDepthBand, number>> = {
    foreground: 20,
    midground: 82,
    background: 185,
  };
  const chromaCeilingByBand: Readonly<Record<CityscapeDepthBand, number>> = {
    foreground: 0.24,
    midground: 0.115,
    background: 0.045,
  };
  const lightnessOffsetByBand: Readonly<Record<CityscapeDepthBand, number>> = {
    foreground: 0.015,
    midground: -0.02,
    background: -0.06,
  };

  const harmonizedBuildings: CityscapeBuilding[] = scene.buildings.map((building) => {
    const band = building.depthBand;
    const effectiveDistance = needsDepthFix
      ? Math.max(building.distanceMeters, distanceByBand[band])
      : building.distanceMeters;
    const bandBeta = Math.max(preset.atmosphericExtinctionBeta, 0.0095);

    const baseSeedColor: OklchColor = {
      l: clampFinite(preset.facadeBaseOklch.l + lightnessOffsetByBand[band], 0.12, 0.36, 0.22),
      c: Math.min(preset.facadeBaseOklch.c, chromaCeilingByBand[band]),
      h: preset.facadeBaseOklch.h,
    };
    const nextFacadeBase = applyAtmosphericDepthAttenuation(
      baseSeedColor,
      scene.hazeOklch,
      effectiveDistance,
      bandBeta,
    );

    const nextWindows = building.facadeWindows.windows.map((win) => {
      if (!win.lit) return win;
      const rawKelvinColor = kelvinToOklch(win.kelvin);
      const litBase: OklchColor = {
        l: clampFinite(rawKelvinColor.l * (0.76 + win.luminanceIntensity * 0.18), 0.36, 0.90, 0.72),
        c: clampFinite(rawKelvinColor.c * (band === "foreground" ? 1.15 : 1.0), 0.012, chromaCeilingByBand[band], 0.05),
        h: rawKelvinColor.h,
      };
      const attenuated = applyAtmosphericDepthAttenuation(
        litBase,
        scene.hazeOklch,
        effectiveDistance,
        bandBeta,
      );
      const clampedWin: OklchColor = {
        l: clampFinite(
          attenuated.l + (band === "background" ? -0.08 : band === "midground" ? -0.02 : 0.02),
          0.22,
          0.92,
          attenuated.l,
        ),
        c: clampFinite(attenuated.c, 0.005, chromaCeilingByBand[band], attenuated.c),
        h: attenuated.h,
      };
      return {
        ...win,
        oklch: clampedWin,
        oklchCss: formatOklchCss(clampedWin),
      };
    });

    const nextSigns = building.signboards.map((sign): PlacedNeonSignboard => {
      const anchor = needsHueSnap
        ? nearestPaletteAnchor(sign.accentColorOklch, preset.neonPaletteOklch)
        : sign.accentColorOklch;
      const attenuatedSign = applyAtmosphericDepthAttenuation(
        anchor,
        scene.hazeOklch,
        effectiveDistance,
        bandBeta,
      );
      const finalSignColor: OklchColor = {
        l: clampFinite(attenuatedSign.l, 0.28, 0.84, 0.66),
        c: clampFinite(attenuatedSign.c, 0.01, chromaCeilingByBand[band], attenuatedSign.c),
        h: attenuatedSign.h,
      };

      const nextW = sign.rect.width * neonScaleFactor;
      const nextH = sign.rect.height * neonScaleFactor;
      const nextX = sign.rect.x + (sign.rect.width - nextW) * 0.5;
      const nextY = sign.rect.y + (sign.rect.height - nextH) * 0.5;

      return {
        ...sign,
        rect: {
          x: Math.round(nextX * 100) / 100,
          y: Math.round(nextY * 100) / 100,
          width: Math.round(nextW * 100) / 100,
          height: Math.round(nextH * 100) / 100,
        },
        fontSizePx: Math.round(sign.fontSizePx * neonScaleFactor * 100) / 100,
        glowRadiusPx: Math.round(sign.glowRadiusPx * (needsNeonTrim ? 0.58 : 1) * 100) / 100,
        accentColorOklch: finalSignColor,
        accentColorCss: formatOklchCss(finalSignColor),
      };
    });

    return {
      ...building,
      distanceMeters: effectiveDistance,
      facadeBaseOklch: nextFacadeBase,
      facadeBaseCss: formatOklchCss(nextFacadeBase),
      facadeWindows: {
        ...building.facadeWindows,
        windows: nextWindows,
      },
      signboards: nextSigns,
    };
  });

  if (adjustmentsKo.length === 0) {
    adjustmentsKo.push("현재 야경 배색과 원근 대기 감쇠가 이미 60-30-10 조화 기준을 충족합니다.");
  }

  const nextScene: CityscapeNightScene = {
    ...scene,
    buildings: harmonizedBuildings,
  };
  const afterAudit = auditCityscapeNightHarmony(nextScene);

  return {
    scene: nextScene,
    beforeAudit,
    afterAudit,
    adjustmentsKo,
  };
}
