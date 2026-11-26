/**
 * Wasm64 Wave 29: 오디오 포락선·스펙트럼 기술자 기반 한국어 웹툰 의성어(SFX) 벡터 컨투어 합성기.
 *
 * - 음향 특징(`rms`, `spectralCentroidHz`, `attackSlope`, `zeroCrossingRate`)을 분석해
 *   4종 표준 웹툰 효과음 양식(`impact-burst` 쾅/퍼엉, `blade-slash` 스릉/챙,
 *   `electric-jolt` 찌릿/파직, `heartbeat-pulse` 두근/쿵)으로 결정론적 분류한다.
 * - 원근 전단(perspective shear), 스트로크 굵기 테이퍼 프로파일, 고대비 이중 외곽선 오프셋 메타데이터를 포함한
 *   닫힌 SVG·Canvas2D 벡터 경로 명령(`M`, `L`, `Q`, `C`, `Z`)을 서버 비용 없이 즉시 합성한다.
 */

export type KoreanSfxStyle = "impact-burst" | "blade-slash" | "electric-jolt" | "heartbeat-pulse";
export type KoreanSfxLexeme = "쾅" | "퍼엉" | "스릉" | "챙" | "찌릿" | "파직" | "두근" | "쿵";

export interface AcousticEnvelopeDescriptor {
  /** 실효 음압 에너지 (`0..1`). */
  readonly rms: number;
  /** 스펙트럼 무게중심 주파수 (`Hz`, 예: `90..12000`). */
  readonly spectralCentroidHz: number;
  /** 포락선 초기 상승 기울기 (`1/s`, 예: `0.5..40`). */
  readonly attackSlope: number;
  /** 영교차율 (`0..1`). */
  readonly zeroCrossingRate: number;
  /** 선택적 음원 지속 시간 (`ms`). */
  readonly durationMs?: number;
}

export interface SfxSynthesisOptions {
  readonly anchorX?: number;
  readonly anchorY?: number;
  readonly baseRadiusPx?: number;
  readonly perspectiveShearX?: number;
  readonly perspectiveShearY?: number;
}

export type SfxPathCommand =
  | { readonly op: "M"; readonly x: number; readonly y: number }
  | { readonly op: "L"; readonly x: number; readonly y: number }
  | { readonly op: "Q"; readonly cx: number; readonly cy: number; readonly x: number; readonly y: number }
  | { readonly op: "C"; readonly c1x: number; readonly c1y: number; readonly c2x: number; readonly c2y: number; readonly x: number; readonly y: number }
  | { readonly op: "Z" };

export interface PerspectiveShearMetadata {
  readonly anchorX: number;
  readonly anchorY: number;
  readonly shearX: number;
  readonly shearY: number;
  readonly scaleFactor: number;
}

export interface StrokeTaperSample {
  readonly t: number;
  readonly normalizedPressure: number;
  readonly widthPx: number;
}

export interface StrokeTaperProfile {
  readonly entryWidthRatio: number;
  readonly peakWidthRatio: number;
  readonly exitWidthRatio: number;
  readonly peakPositionT: number;
  readonly minWidthPx: number;
  readonly maxWidthPx: number;
  readonly samples: readonly StrokeTaperSample[];
}

export interface SfxOklchTone { readonly l: number; readonly c: number; readonly hDeg: number; }

export interface DoubleOutlineOffsetMetadata {
  readonly primaryStrokeWidthPx: number;
  readonly innerOutlineOffsetPx: number;
  readonly outerHaloOffsetPx: number;
  readonly miterLimit: number;
  readonly lineJoin: "miter" | "round" | "bevel";
  readonly estimatedContrastRatio: number;
  readonly fillSemanticToken: string;
  readonly innerStrokeSemanticToken: string;
  readonly outerHaloSemanticToken: string;
  readonly fillOklch: SfxOklchTone;
  readonly outerHaloOklch: SfxOklchTone;
  readonly outerHaloCommands: readonly SfxPathCommand[];
  readonly outerHaloSvgPath: string;
}

export interface SfxClassificationResult {
  readonly style: KoreanSfxStyle;
  readonly lexemeKo: KoreanSfxLexeme;
  readonly styleLabelKo: string;
  readonly confidence: number;
  readonly scoresByStyle: Readonly<Record<KoreanSfxStyle, number>>;
  readonly rationaleKo: string;
}

export interface SfxBoundingBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

export interface SynthesizedKoreanSfxContour {
  readonly classification: SfxClassificationResult;
  readonly commands: readonly SfxPathCommand[];
  readonly svgPathData: string;
  readonly isClosedPath: boolean;
  readonly allCoordinatesFinite: boolean;
  readonly bounds: SfxBoundingBox;
  readonly perspectiveShear: PerspectiveShearMetadata;
  readonly taperProfile: StrokeTaperProfile;
  readonly doubleOutline: DoubleOutlineOffsetMetadata;
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

function roundCoord(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
}

/** 단일 채널 PCM 오디오 버퍼에서 포락선·스펙트럼 요약 기술자를 추출한다. */
export function extractAcousticEnvelopeFromPcm(
  pcmSamples: Float32Array, sampleRateHz = 44100,
): AcousticEnvelopeDescriptor {
  const n = pcmSamples.length;
  if (n === 0) return { rms: 0, spectralCentroidHz: 120, attackSlope: 0, zeroCrossingRate: 0, durationMs: 0 };
  const safeRate = Math.max(8000, Number.isFinite(sampleRateHz) ? sampleRateHz : 44100);
  let sumSq = 0, zeroCrossings = 0, diffEnergy = 0;

  for (let i = 0; i < n; i += 1) {
    const s = clamp(pcmSamples[i] ?? 0, -1, 1);
    sumSq += s * s;
    if (i > 0) {
      const prev = clamp(pcmSamples[i - 1] ?? 0, -1, 1);
      if ((s >= 0 && prev < 0) || (s < 0 && prev >= 0)) zeroCrossings += 1;
      const d = s - prev;
      diffEnergy += d * d;
    }
  }

  const windowSize = Math.max(16, Math.floor(n / 8));
  let peakWindowRms = 0, peakWindowIdx = 0;
  for (let wStart = 0; wStart < n; wStart += windowSize) {
    const wEnd = Math.min(n, wStart + windowSize);
    let wSq = 0;
    for (let i = wStart; i < wEnd; i += 1) {
      const s = clamp(pcmSamples[i] ?? 0, -1, 1);
      wSq += s * s;
    }
    const wRms = Math.sqrt(wSq / Math.max(1, wEnd - wStart));
    if (wRms > peakWindowRms) {
      peakWindowRms = wRms;
      peakWindowIdx = wStart + Math.floor((wEnd - wStart) * 0.5);
    }
  }

  const rms = clamp(Math.sqrt(sumSq / n), 0, 1);
  const zcr = clamp(zeroCrossings / Math.max(1, n - 1), 0, 1);
  const omegaRatio = sumSq > 1e-12 ? Math.sqrt(diffEnergy / sumSq) : 0;
  const spectralCentroidHz = clamp((omegaRatio / (2 * Math.PI)) * safeRate, 60, safeRate * 0.48);
  const attackSlope = clamp(peakWindowRms / Math.max(0.012, peakWindowIdx / safeRate), 0, 80);
  return { rms, spectralCentroidHz, attackSlope, zeroCrossingRate: zcr, durationMs: (n / safeRate) * 1000 };
}

/** 음향 기술자를 4종 한국어 웹툰 의성어 스타일로 분류한다. */
export function classifyAcousticKoreanSfx(descriptor: AcousticEnvelopeDescriptor): SfxClassificationResult {
  const rms = clamp(descriptor.rms, 0, 1);
  const centroidHz = clamp(descriptor.spectralCentroidHz, 20, 20000);
  const attack = clamp(descriptor.attackSlope, 0, 100);
  const zcr = clamp(descriptor.zeroCrossingRate, 0, 1);
  const durationMs = clamp(descriptor.durationMs ?? 240, 20, 5000);

  const lowFreq = clamp(1 - (centroidHz - 120) / 1100, 0, 1);
  const subBass = clamp(1 - (centroidHz - 70) / 380, 0, 1);
  const highFreq = clamp((centroidHz - 1400) / 3200, 0, 1);
  const steepAttack = clamp((attack - 3.5) / 14, 0, 1);
  const gentleAttack = clamp(1 - Math.abs(attack - 2.6) / 5.5, 0, 1);
  const highRms = clamp((rms - 0.25) / 0.55, 0, 1);
  const noisyZcr = clamp((zcr - 0.26) / 0.28, 0, 1);
  const tonalHighZcr = clamp(1 - Math.abs(zcr - 0.16) / 0.18, 0, 1);
  const cleanSubZcr = clamp(1 - zcr / 0.16, 0, 1);

  const scoresByStyle: Record<KoreanSfxStyle, number> = {
    "impact-burst": roundCoord(
      0.38 * lowFreq + 0.32 * steepAttack + 0.24 * highRms + 0.06 * (1 - noisyZcr) +
      (centroidHz <= 950 && rms >= 0.48 && attack >= 6.5 ? 0.2 : 0),
    ),
    "blade-slash": roundCoord(
      0.42 * highFreq + 0.28 * steepAttack + 0.22 * tonalHighZcr + 0.08 * highRms +
      (centroidHz >= 2200 && zcr < 0.31 && attack >= 5 ? 0.22 : 0),
    ),
    "electric-jolt": roundCoord(
      0.46 * noisyZcr + 0.28 * highFreq + 0.16 * steepAttack + 0.1 * highRms +
      (zcr >= 0.32 && centroidHz >= 1800 ? 0.24 : 0),
    ),
    "heartbeat-pulse": roundCoord(
      0.42 * subBass + 0.28 * gentleAttack + 0.22 * cleanSubZcr + 0.08 * (1 - highFreq) +
      (centroidHz <= 340 && attack < 6.5 && zcr <= 0.14 ? 0.22 : 0),
    ),
  };

  const styles: readonly KoreanSfxStyle[] = ["impact-burst", "blade-slash", "electric-jolt", "heartbeat-pulse"];
  let bestStyle: KoreanSfxStyle = "impact-burst";
  let bestScore = scoresByStyle["impact-burst"];
  let sumScores = 0;
  for (const style of styles) {
    sumScores += Math.max(0.01, scoresByStyle[style]);
    if (scoresByStyle[style] > bestScore) { bestScore = scoresByStyle[style]; bestStyle = style; }
  }
  const confidence = roundCoord(clamp(bestScore / Math.max(1e-6, sumScores), 0.25, 0.99));

  if (bestStyle === "impact-burst") {
    const lexemeKo: KoreanSfxLexeme = attack >= 12 && durationMs <= 420 ? "쾅" : "퍼엉";
    return {
      style: bestStyle, lexemeKo, styleLabelKo: "저주파 폭발 타격형 의성어", confidence, scoresByStyle,
      rationaleKo: `낮은 스펙트럼 중심(${Math.round(centroidHz)}Hz)과 가파른 어택(${attack.toFixed(1)}/s)이 타격 파열음 '${lexemeKo}'과 일치합니다.`,
    };
  }
  if (bestStyle === "blade-slash") {
    const lexemeKo: KoreanSfxLexeme = attack >= 14 || centroidHz >= 4500 ? "챙" : "스릉";
    return {
      style: bestStyle, lexemeKo, styleLabelKo: "고주파 금속 참격형 의성어", confidence, scoresByStyle,
      rationaleKo: `높은 금속 배음 중심(${Math.round(centroidHz)}Hz)과 정돈된 영교차율(${zcr.toFixed(2)})이 칼날 궤적음 '${lexemeKo}'과 일치합니다.`,
    };
  }
  if (bestStyle === "electric-jolt") {
    const lexemeKo: KoreanSfxLexeme = rms >= 0.55 || attack >= 12 ? "파직" : "찌릿";
    return {
      style: bestStyle, lexemeKo, styleLabelKo: "고밀도 방전 스파크형 의성어", confidence, scoresByStyle,
      rationaleKo: `높은 영교차율(${zcr.toFixed(2)})과 고역 스펙트럼(${Math.round(centroidHz)}Hz)이 방전음 '${lexemeKo}'과 일치합니다.`,
    };
  }
  const lexemeKo: KoreanSfxLexeme = rms >= 0.5 || attack >= 3.8 ? "쿵" : "두근";
  return {
    style: "heartbeat-pulse", lexemeKo, styleLabelKo: "초저역 심박 울림형 의성어", confidence, scoresByStyle,
    rationaleKo: `초저역 스펙트럼(${Math.round(centroidHz)}Hz)과 완만한 박동 어택(${attack.toFixed(1)}/s)이 심장 고동음 '${lexemeKo}'과 일치합니다.`,
  };
}

function applyShearPoint(localX: number, localY: number, shear: PerspectiveShearMetadata): { readonly x: number; readonly y: number } {
  const sx = localX * shear.scaleFactor, sy = localY * shear.scaleFactor;
  return { x: roundCoord(shear.anchorX + sx + shear.shearX * sy), y: roundCoord(shear.anchorY + sy + shear.shearY * sx) };
}

function transformCommandsWithShear(localCommands: readonly SfxPathCommand[], shear: PerspectiveShearMetadata): SfxPathCommand[] {
  return localCommands.map((cmd): SfxPathCommand => {
    switch (cmd.op) {
      case "M": { const p = applyShearPoint(cmd.x, cmd.y, shear); return { op: "M", x: p.x, y: p.y }; }
      case "L": { const p = applyShearPoint(cmd.x, cmd.y, shear); return { op: "L", x: p.x, y: p.y }; }
      case "Q": {
        const c = applyShearPoint(cmd.cx, cmd.cy, shear), p = applyShearPoint(cmd.x, cmd.y, shear);
        return { op: "Q", cx: c.x, cy: c.y, x: p.x, y: p.y };
      }
      case "C": {
        const c1 = applyShearPoint(cmd.c1x, cmd.c1y, shear), c2 = applyShearPoint(cmd.c2x, cmd.c2y, shear);
        const p = applyShearPoint(cmd.x, cmd.y, shear);
        return { op: "C", c1x: c1.x, c1y: c1.y, c2x: c2.x, c2y: c2.y, x: p.x, y: p.y };
      }
      case "Z": return { op: "Z" };
    }
  });
}

function buildImpactBurstLocalContour(radius: number, rms: number, attackSlope: number): SfxPathCommand[] {
  const spikeCount = 10;
  const sharpBoost = 1 + clamp(attackSlope / 30, 0, 0.35) + rms * 0.2;
  const cmds: SfxPathCommand[] = [];
  for (let i = 0; i < spikeCount; i += 1) {
    const theta0 = (2 * Math.PI * i) / spikeCount - Math.PI * 0.5;
    const thetaMid = (2 * Math.PI * (i + 0.5)) / spikeCount - Math.PI * 0.5;
    const thetaNext = (2 * Math.PI * ((i + 1) % spikeCount)) / spikeCount - Math.PI * 0.5;
    const r0 = (i % 2 === 0 ? 1.18 : 0.94) * sharpBoost, r1 = ((i + 1) % 2 === 0 ? 1.18 : 0.94) * sharpBoost;
    const tipX = Math.cos(theta0) * radius * r0, tipY = Math.sin(theta0) * radius * r0 * 0.86;
    const nextTipX = Math.cos(thetaNext) * radius * r1, nextTipY = Math.sin(thetaNext) * radius * r1 * 0.86;
    const ctrlX = Math.cos(thetaMid) * radius * 0.54, ctrlY = Math.sin(thetaMid) * radius * 0.54 * 0.86;

    if (i === 0) {
      cmds.push(
        { op: "M", x: tipX, y: tipY },
        { op: "C", c1x: tipX + radius * 0.14, c1y: tipY + radius * 0.12, c2x: ctrlX + radius * 0.08, c2y: ctrlY - radius * 0.06, x: ctrlX * 1.15, y: ctrlY * 1.15 },
        { op: "L", x: nextTipX, y: nextTipY },
      );
    } else {
      cmds.push({ op: "Q", cx: ctrlX, cy: ctrlY, x: nextTipX, y: nextTipY });
    }
  }
  cmds.push({ op: "Z" });
  return cmds;
}

function buildBladeSlashLocalContour(radius: number, attackSlope: number): SfxPathCommand[] {
  const reach = radius * (1.28 + clamp(attackSlope / 45, 0, 0.28)), thickness = radius * 0.24;
  return [
    { op: "M", x: -reach, y: radius * 0.34 },
    { op: "C", c1x: -reach * 0.42, c1y: -thickness * 1.65, c2x: reach * 0.38, c2y: -thickness * 1.8, x: reach * 1.06, y: -radius * 0.36 },
    { op: "L", x: reach * 0.86, y: -radius * 0.14 },
    { op: "Q", cx: reach * 0.24, cy: -thickness * 0.42, x: -reach * 0.25, y: thickness * 0.18 },
    { op: "C", c1x: -reach * 0.56, c1y: thickness * 0.48, c2x: -reach * 0.82, c2y: radius * 0.31, x: -reach, y: radius * 0.34 },
    { op: "Z" },
  ];
}

function buildElectricJoltLocalContour(radius: number, zcr: number): SfxPathCommand[] {
  const jag = radius * (0.28 + zcr * 0.22);
  return [
    { op: "M", x: -radius * 0.92, y: -radius * 0.68 },
    { op: "L", x: -radius * 0.22, y: -radius * 0.18 },
    { op: "L", x: -radius * 0.42, y: -radius * 0.04 },
    { op: "Q", cx: radius * 0.08, cy: -jag * 0.45, x: radius * 0.28, y: radius * 0.06 },
    { op: "L", x: radius * 0.08, y: radius * 0.2 },
    { op: "L", x: radius * 0.96, y: radius * 0.72 },
    { op: "L", x: radius * 0.14, y: radius * 0.36 },
    { op: "L", x: radius * 0.31, y: radius * 0.18 },
    { op: "C", c1x: -radius * 0.06, c1y: jag * 0.52, c2x: -radius * 0.34, c2y: -jag * 0.15, x: -radius * 0.58, y: -radius * 0.12 },
    { op: "L", x: -radius * 0.36, y: -radius * 0.28 },
    { op: "Z" },
  ];
}

function buildHeartbeatPulseLocalContour(radius: number, rms: number): SfxPathCommand[] {
  const swell = radius * (0.82 + rms * 0.28);
  return [
    { op: "M", x: 0, y: swell * 0.78 },
    { op: "C", c1x: -swell * 0.88, c1y: swell * 0.28, c2x: -swell * 1.04, c2y: -swell * 0.54, x: -swell * 0.42, y: -swell * 0.68 },
    { op: "Q", cx: -swell * 0.12, cy: -swell * 0.74, x: -swell * 0.05, y: -swell * 0.38 },
    { op: "L", x: 0, y: -swell * 0.88 },
    { op: "L", x: swell * 0.06, y: -swell * 0.38 },
    { op: "Q", cx: swell * 0.14, cy: -swell * 0.74, x: swell * 0.42, y: -swell * 0.68 },
    { op: "C", c1x: swell * 1.04, c1y: -swell * 0.54, c2x: swell * 0.88, c2y: swell * 0.28, x: 0, y: swell * 0.78 },
    { op: "Z" },
  ];
}

/** 구조화된 경로 명령 배열을 결정론적 SVG `d` 문자열로 직렬화한다. */
export function serializeSfxCommandsToSvgPath(commands: readonly SfxPathCommand[]): string {
  return commands.map((cmd) => {
    switch (cmd.op) {
      case "M": return `M ${cmd.x} ${cmd.y}`;
      case "L": return `L ${cmd.x} ${cmd.y}`;
      case "Q": return `Q ${cmd.cx} ${cmd.cy} ${cmd.x} ${cmd.y}`;
      case "C": return `C ${cmd.c1x} ${cmd.c1y} ${cmd.c2x} ${cmd.c2y} ${cmd.x} ${cmd.y}`;
      case "Z": return "Z";
    }
  }).join(" ");
}

const TAPER_PRESETS: Readonly<Record<KoreanSfxStyle, readonly [number, number, number, number]>> = {
  "impact-burst": [0.68, 1, 0.58, 0.42],
  "blade-slash": [0.06, 1, 0.03, 0.28],
  "electric-jolt": [0.18, 1, 0.12, 0.62],
  "heartbeat-pulse": [0.34, 1, 0.34, 0.5],
};

function buildStrokeTaperProfile(style: KoreanSfxStyle, rms: number, baseRadiusPx: number): StrokeTaperProfile {
  const maxWidthPx = roundCoord(Math.max(4, baseRadiusPx * (0.14 + rms * 0.1) * (style === "impact-burst" ? 1.25 : 1)));
  const [entryRatio, peakRatio, exitRatio, peakT] = TAPER_PRESETS[style];
  const sampleCount = 9;
  const samples: StrokeTaperSample[] = [];
  let minWidthPx = maxWidthPx;

  for (let i = 0; i < sampleCount; i += 1) {
    const t = roundCoord(i / (sampleCount - 1));
    let pressure = t <= peakT
      ? entryRatio + (peakRatio - entryRatio) * Math.sin((t / Math.max(1e-6, peakT)) * Math.PI * 0.5)
      : peakRatio + (exitRatio - peakRatio) * Math.pow((t - peakT) / Math.max(1e-6, 1 - peakT), 2);
    if (style === "electric-jolt" && i > 0 && i < sampleCount - 1) pressure *= i % 2 === 1 ? 1.08 : 0.76;
    const clampedPressure = roundCoord(clamp(pressure, 0.02, 1.15));
    const widthPx = roundCoord(maxWidthPx * clampedPressure);
    if (widthPx < minWidthPx) minWidthPx = widthPx;
    samples.push({ t, normalizedPressure: clampedPressure, widthPx });
  }

  return {
    entryWidthRatio: entryRatio, peakWidthRatio: peakRatio, exitWidthRatio: exitRatio,
    peakPositionT: peakT, minWidthPx, maxWidthPx, samples,
  };
}

function expandPointFromAnchor(px: number, py: number, anchorX: number, anchorY: number, offsetPx: number): { readonly x: number; readonly y: number } {
  const dx = px - anchorX, dy = py - anchorY, dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return { x: roundCoord(px), y: roundCoord(py - offsetPx) };
  const scale = (dist + offsetPx) / dist;
  return { x: roundCoord(anchorX + dx * scale), y: roundCoord(anchorY + dy * scale) };
}

function buildRadialHaloCommands(commands: readonly SfxPathCommand[], anchorX: number, anchorY: number, offsetPx: number): SfxPathCommand[] {
  return commands.map((cmd): SfxPathCommand => {
    switch (cmd.op) {
      case "M": { const p = expandPointFromAnchor(cmd.x, cmd.y, anchorX, anchorY, offsetPx); return { op: "M", x: p.x, y: p.y }; }
      case "L": { const p = expandPointFromAnchor(cmd.x, cmd.y, anchorX, anchorY, offsetPx); return { op: "L", x: p.x, y: p.y }; }
      case "Q": {
        const c = expandPointFromAnchor(cmd.cx, cmd.cy, anchorX, anchorY, offsetPx);
        const p = expandPointFromAnchor(cmd.x, cmd.y, anchorX, anchorY, offsetPx);
        return { op: "Q", cx: c.x, cy: c.y, x: p.x, y: p.y };
      }
      case "C": {
        const c1 = expandPointFromAnchor(cmd.c1x, cmd.c1y, anchorX, anchorY, offsetPx);
        const c2 = expandPointFromAnchor(cmd.c2x, cmd.c2y, anchorX, anchorY, offsetPx);
        const p = expandPointFromAnchor(cmd.x, cmd.y, anchorX, anchorY, offsetPx);
        return { op: "C", c1x: c1.x, c1y: c1.y, c2x: c2.x, c2y: c2.y, x: p.x, y: p.y };
      }
      case "Z": return { op: "Z" };
    }
  });
}

function inspectPathFiniteAndBounds(commands: readonly SfxPathCommand[]): {
  readonly allFinite: boolean; readonly isClosed: boolean; readonly bounds: SfxBoundingBox;
} {
  let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
  let allFinite = true;
  const visit = (x: number, y: number): void => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) { allFinite = false; return; }
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const cmd of commands) {
    if (cmd.op === "M" || cmd.op === "L") visit(cmd.x, cmd.y);
    else if (cmd.op === "Q") { visit(cmd.cx, cmd.cy); visit(cmd.x, cmd.y); }
    else if (cmd.op === "C") { visit(cmd.c1x, cmd.c1y); visit(cmd.c2x, cmd.c2y); visit(cmd.x, cmd.y); }
  }
  const isClosed = commands[0]?.op === "M" && commands[commands.length - 1]?.op === "Z" && commands.length >= 3;
  if (!Number.isFinite(minX)) {
    return { allFinite, isClosed, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 } };
  }
  return {
    allFinite, isClosed,
    bounds: { minX, minY, maxX, maxY, width: roundCoord(maxX - minX), height: roundCoord(maxY - minY) },
  };
}

/** 오디오 포락선 기술자로부터 원근 전단·테이퍼·이중 외곽선이 적용된 한국어 의성어 벡터 컨투어를 합성한다. */
export function synthesizeKoreanSfxContour(
  descriptor: AcousticEnvelopeDescriptor, options: SfxSynthesisOptions = {},
): SynthesizedKoreanSfxContour {
  const classification = classifyAcousticKoreanSfx(descriptor);
  const rms = clamp(descriptor.rms, 0, 1);
  const attack = clamp(descriptor.attackSlope, 0, 100);
  const zcr = clamp(descriptor.zeroCrossingRate, 0, 1);
  const anchorX = roundCoord(options.anchorX ?? 0), anchorY = roundCoord(options.anchorY ?? 0);
  const baseRadiusPx = clamp(options.baseRadiusPx ?? 64, 16, 1024);

  const defaultShearByStyle: Readonly<Record<KoreanSfxStyle, [number, number]>> = {
    "impact-burst": [-0.12, -0.04], "blade-slash": [-0.36, -0.08], "electric-jolt": [-0.22, 0.06], "heartbeat-pulse": [0, 0],
  };
  const [defShearX, defShearY] = defaultShearByStyle[classification.style];
  const perspectiveShear: PerspectiveShearMetadata = {
    anchorX, anchorY,
    shearX: roundCoord(clamp(options.perspectiveShearX ?? defShearX, -0.85, 0.85)),
    shearY: roundCoord(clamp(options.perspectiveShearY ?? defShearY, -0.85, 0.85)),
    scaleFactor: roundCoord(0.85 + rms * 0.45),
  };

  const localCommands =
    classification.style === "impact-burst" ? buildImpactBurstLocalContour(baseRadiusPx, rms, attack)
    : classification.style === "blade-slash" ? buildBladeSlashLocalContour(baseRadiusPx, attack)
    : classification.style === "electric-jolt" ? buildElectricJoltLocalContour(baseRadiusPx, zcr)
    : buildHeartbeatPulseLocalContour(baseRadiusPx, rms);

  const commands = transformCommandsWithShear(localCommands, perspectiveShear);
  const svgPathData = serializeSfxCommandsToSvgPath(commands);
  const { allFinite, isClosed, bounds } = inspectPathFiniteAndBounds(commands);
  const taperProfile = buildStrokeTaperProfile(classification.style, rms, baseRadiusPx);

  const primaryStrokeWidthPx = roundCoord(Math.max(2.5, taperProfile.maxWidthPx * 0.28));
  const innerOutlineOffsetPx = roundCoord(primaryStrokeWidthPx * 0.5);
  const outerHaloOffsetPx = roundCoord(primaryStrokeWidthPx * 1.35 + 3);
  const outerHaloCommands = buildRadialHaloCommands(commands, anchorX, anchorY, outerHaloOffsetPx);

  const toneByStyle: Readonly<Record<KoreanSfxStyle, SfxOklchTone>> = {
    "impact-burst": { l: 0.22, c: 0.16, hDeg: 28 },
    "blade-slash": { l: 0.2, c: 0.06, hDeg: 245 },
    "electric-jolt": { l: 0.24, c: 0.18, hDeg: 95 },
    "heartbeat-pulse": { l: 0.23, c: 0.17, hDeg: 14 },
  };
  const fillOklch = toneByStyle[classification.style];
  const outerHaloOklch: SfxOklchTone = { l: 0.98, c: 0.01, hDeg: 95 };
  const estimatedContrastRatio = roundCoord((Math.pow(outerHaloOklch.l, 3) + 0.05) / (Math.pow(fillOklch.l, 3) + 0.05));
  const lineJoin = classification.style === "heartbeat-pulse" ? "round" : classification.style === "blade-slash" ? "bevel" : "miter";

  return {
    classification, commands, svgPathData, isClosedPath: isClosed, allCoordinatesFinite: allFinite,
    bounds, perspectiveShear, taperProfile,
    doubleOutline: {
      primaryStrokeWidthPx, innerOutlineOffsetPx, outerHaloOffsetPx,
      miterLimit: lineJoin === "miter" ? 6 : 2, lineJoin, estimatedContrastRatio,
      fillSemanticToken: "accent", innerStrokeSemanticToken: "fg", outerHaloSemanticToken: "card",
      fillOklch, outerHaloOklch, outerHaloCommands, outerHaloSvgPath: serializeSfxCommandsToSvgPath(outerHaloCommands),
    },
  };
}
