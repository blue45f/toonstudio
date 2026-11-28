/**
 * Wave 156 — Coons 패치 기본 기하 타입, 3차 베지어 평가기 및 5종 만화 SFX 엔벨로프 프리셋.
 *
 * - 5종 프리셋(`sword-slash-arc`, `perspective-recede`, `impact-bulge-burst`,
 *   `whisper-wave-drift`, `diagonal-slam-shear`) 모두 `intensity in [0, 1.5]` 전역에서
 *   야코비안 행렬식 `det(J) > 0` (접힘 0건)을 만족하도록 제어점을 설계
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface CubicBezierBoundary {
  readonly p0: Vec2;
  readonly p1: Vec2;
  readonly p2: Vec2;
  readonly p3: Vec2;
}

export interface CoonsPatchEnvelope {
  readonly top: CubicBezierBoundary;
  readonly bottom: CubicBezierBoundary;
  readonly left: CubicBezierBoundary;
  readonly right: CubicBezierBoundary;
}

export interface SfxEnvelopeBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type SfxEnvelopePresetId =
  | "sword-slash-arc"
  | "perspective-recede"
  | "impact-bulge-burst"
  | "whisper-wave-drift"
  | "diagonal-slam-shear";

export interface SfxEnvelopePresetMeta {
  readonly id: SfxEnvelopePresetId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly sampleSfxKo: string;
}

export interface SfxGlyphUvBox {
  readonly u0: number;
  readonly u1: number;
  readonly v0: number;
  readonly v1: number;
}

export const SFX_ENVELOPE_PRESET_IDS: readonly SfxEnvelopePresetId[] = [
  "sword-slash-arc",
  "perspective-recede",
  "impact-bulge-burst",
  "whisper-wave-drift",
  "diagonal-slam-shear",
];

export const SFX_ENVELOPE_PRESET_META: Readonly<
  Record<SfxEnvelopePresetId, SfxEnvelopePresetMeta>
> = {
  "sword-slash-arc": {
    id: "sword-slash-arc",
    labelKo: "검격 호(Arc) 궤적",
    descriptionKo: "베기 궤적을 따라 우상향 아치로 휘어지며 끝이 날카롭게 가속되는 효과음 곡선",
    sampleSfxKo: "스윽—",
  },
  "perspective-recede": {
    id: "perspective-recede",
    labelKo: "3D 원근 복도 후퇴",
    descriptionKo: "앞 글자에서 소실점 쪽 끝 글자로 갈수록 높이와 폭이 단조 축소되는 원근 투영",
    sampleSfxKo: "콰아아앙!",
  },
  "impact-bulge-burst": {
    id: "impact-bulge-burst",
    labelKo: "충격파 중앙 팽창",
    descriptionKo: "타격 중심부가 상하로 강하게 부풀어 오르며 폭발감을 살리는 어안형 엔벨로프",
    sampleSfxKo: "파지직!",
  },
  "whisper-wave-drift": {
    id: "whisper-wave-drift",
    labelKo: "속삭임 파동 부유",
    descriptionKo: "균일한 두께를 유지한 채 부드러운 S자 물결을 그리며 흘러가는 정서형 효과음",
    sampleSfxKo: "두근두근",
  },
  "diagonal-slam-shear": {
    id: "diagonal-slam-shear",
    labelKo: "대각선 강타 전단",
    descriptionKo: "강한 전단 기울기와 하향 낙차로 타격 직전의 속도감을 강조하는 사선 배치",
    sampleSfxKo: "콰아아앙!",
  },
};

const DEFAULT_BOUNDS: SfxEnvelopeBounds = {
  x: 0,
  y: 0,
  width: 640,
  height: 180,
};

/** 유한수를 `[min, max]` 범위로 안전하게 제한한다. */
export function clampFinite(
  value: number,
  min: number,
  max: number,
  fallback = min,
): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function makeVec2(x: number, y: number): Vec2 {
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}

export function lerpVec2(a: Vec2, b: Vec2, t: number): Vec2 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

export function distVec2(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function makeStraightBoundary(start: Vec2, end: Vec2): CubicBezierBoundary {
  return {
    p0: start,
    p1: lerpVec2(start, end, 1 / 3),
    p2: lerpVec2(start, end, 2 / 3),
    p3: end,
  };
}

/** 3차 베지어 경계 곡선의 위치 `B(t)`를 계산한다. */
export function evaluateCubicBezier(curve: CubicBezierBoundary, tIn: number): Vec2 {
  const t = clampFinite(tIn, 0, 1, 0);
  const omt = 1 - t;
  const omt2 = omt * omt;
  const t2 = t * t;
  const b0 = omt2 * omt;
  const b1 = 3 * omt2 * t;
  const b2 = 3 * omt * t2;
  const b3 = t2 * t;
  return {
    x: b0 * curve.p0.x + b1 * curve.p1.x + b2 * curve.p2.x + b3 * curve.p3.x,
    y: b0 * curve.p0.y + b1 * curve.p1.y + b2 * curve.p2.y + b3 * curve.p3.y,
  };
}

/** 3차 베지어 경계 곡선의 1차 도함수 `B'(t)`를 해석적으로 계산한다. */
export function evaluateCubicBezierDerivative(
  curve: CubicBezierBoundary,
  tIn: number,
): Vec2 {
  const t = clampFinite(tIn, 0, 1, 0);
  const omt = 1 - t;
  const d0 = 3 * omt * omt;
  const d1 = 6 * omt * t;
  const d2 = 3 * t * t;
  return {
    x:
      d0 * (curve.p1.x - curve.p0.x) +
      d1 * (curve.p2.x - curve.p1.x) +
      d2 * (curve.p3.x - curve.p2.x),
    y:
      d0 * (curve.p1.y - curve.p0.y) +
      d1 * (curve.p2.y - curve.p1.y) +
      d2 * (curve.p3.y - curve.p2.y),
  };
}

/** 5종 한국 웹툰·만화 SFX 엔벨로프 Coons 패치 프리셋을 생성한다. */
export function createSfxEnvelopePreset(
  presetId: SfxEnvelopePresetId,
  boundsOverride?: Partial<SfxEnvelopeBounds>,
  intensityIn = 1.0,
): CoonsPatchEnvelope {
  const x0 = clampFinite(boundsOverride?.x ?? DEFAULT_BOUNDS.x, -10000, 10000, 0);
  const y0 = clampFinite(boundsOverride?.y ?? DEFAULT_BOUNDS.y, -10000, 10000, 0);
  const w = clampFinite(boundsOverride?.width ?? DEFAULT_BOUNDS.width, 32, 16000, 640);
  const h = clampFinite(boundsOverride?.height ?? DEFAULT_BOUNDS.height, 16, 8000, 180);
  const k = clampFinite(intensityIn, 0, 1.5, 1.0);

  if (presetId === "sword-slash-arc") {
    const p00 = makeVec2(x0, y0 + 0.30 * h * k);
    const p10 = makeVec2(x0 + w, y0 - 0.18 * h * k);
    const p01 = makeVec2(x0 + 0.04 * w * k, y0 + h + 0.24 * h * k);
    const p11 = makeVec2(x0 + 0.96 * w, y0 + 0.68 * h - 0.14 * h * k);
    return {
      top: {
        p0: p00,
        p1: makeVec2(x0 + 0.32 * w, y0 - 0.34 * h * k),
        p2: makeVec2(x0 + 0.68 * w, y0 - 0.44 * h * k),
        p3: p10,
      },
      bottom: {
        p0: p01,
        p1: makeVec2(x0 + 0.34 * w, y0 + 0.66 * h - 0.26 * h * k),
        p2: makeVec2(x0 + 0.68 * w, y0 + 0.54 * h - 0.30 * h * k),
        p3: p11,
      },
      left: {
        p0: p00,
        p1: makeVec2(lerpVec2(p00, p01, 1 / 3).x - 0.015 * w * k, lerpVec2(p00, p01, 1 / 3).y),
        p2: makeVec2(lerpVec2(p00, p01, 2 / 3).x - 0.008 * w * k, lerpVec2(p00, p01, 2 / 3).y),
        p3: p01,
      },
      right: {
        p0: p10,
        p1: makeVec2(lerpVec2(p10, p11, 1 / 3).x + 0.015 * w * k, lerpVec2(p10, p11, 1 / 3).y),
        p2: makeVec2(lerpVec2(p10, p11, 2 / 3).x + 0.008 * w * k, lerpVec2(p10, p11, 2 / 3).y),
        p3: p11,
      },
    };
  }

  if (presetId === "perspective-recede") {
    const taper = clampFinite(0.34 * k, 0, 0.41, 0.34);
    const frontExpand = 0.05 * k;
    const p00 = makeVec2(x0, y0 - frontExpand * h);
    const p10 = makeVec2(x0 + w, y0 + taper * h);
    const p01 = makeVec2(x0, y0 + (1 + frontExpand) * h);
    const p11 = makeVec2(x0 + w, y0 + (1 - taper) * h);
    const u1 = clampFinite(1 / 3 + 0.095 * k, 1 / 3, 0.46, 0.428);
    const u2 = clampFinite(2 / 3 + 0.115 * k, 2 / 3, 0.82, 0.782);
    return {
      top: { p0: p00, p1: lerpVec2(p00, p10, u1), p2: lerpVec2(p00, p10, u2), p3: p10 },
      bottom: { p0: p01, p1: lerpVec2(p01, p11, u1), p2: lerpVec2(p01, p11, u2), p3: p11 },
      left: makeStraightBoundary(p00, p01),
      right: makeStraightBoundary(p10, p11),
    };
  }

  if (presetId === "impact-bulge-burst") {
    const pinch = clampFinite(0.14 * k, 0, 0.20, 0.14);
    const bulgeY = clampFinite(0.32 * k, 0, 0.42, 0.32);
    const sideBow = clampFinite(0.020 * k, 0, 0.025, 0.020);
    const p00 = makeVec2(x0, y0 + pinch * h);
    const p10 = makeVec2(x0 + w, y0 + pinch * h);
    const p01 = makeVec2(x0, y0 + (1 - pinch) * h);
    const p11 = makeVec2(x0 + w, y0 + (1 - pinch) * h);
    return {
      top: {
        p0: p00,
        p1: makeVec2(x0 + 0.33 * w, y0 - bulgeY * h),
        p2: makeVec2(x0 + 0.67 * w, y0 - bulgeY * h),
        p3: p10,
      },
      bottom: {
        p0: p01,
        p1: makeVec2(x0 + 0.33 * w, y0 + h + bulgeY * h),
        p2: makeVec2(x0 + 0.67 * w, y0 + h + bulgeY * h),
        p3: p11,
      },
      left: {
        p0: p00,
        p1: makeVec2(x0 - sideBow * w, lerpVec2(p00, p01, 1 / 3).y),
        p2: makeVec2(x0 - sideBow * w, lerpVec2(p00, p01, 2 / 3).y),
        p3: p01,
      },
      right: {
        p0: p10,
        p1: makeVec2(x0 + w + sideBow * w, lerpVec2(p10, p11, 1 / 3).y),
        p2: makeVec2(x0 + w + sideBow * w, lerpVec2(p10, p11, 2 / 3).y),
        p3: p11,
      },
    };
  }

  if (presetId === "whisper-wave-drift") {
    const endTilt = 0.08 * h * k;
    const waveAmp = 0.40 * h * k;
    const p00 = makeVec2(x0, y0 + endTilt);
    const p10 = makeVec2(x0 + w, y0 - endTilt);
    const p01 = makeVec2(x0, y0 + h + endTilt);
    const p11 = makeVec2(x0 + w, y0 + h - endTilt);
    return {
      top: {
        p0: p00,
        p1: makeVec2(x0 + w / 3, y0 - waveAmp),
        p2: makeVec2(x0 + (2 * w) / 3, y0 + waveAmp),
        p3: p10,
      },
      bottom: {
        p0: p01,
        p1: makeVec2(x0 + w / 3, y0 + h - waveAmp),
        p2: makeVec2(x0 + (2 * w) / 3, y0 + h + waveAmp),
        p3: p11,
      },
      left: makeStraightBoundary(p00, p01),
      right: makeStraightBoundary(p10, p11),
    };
  }

  // "diagonal-slam-shear"
  const shearX = 0.13 * w * k;
  const dropY = 0.30 * h * k;
  const p00 = makeVec2(x0 + shearX, y0);
  const p10 = makeVec2(x0 + w, y0 + dropY);
  const p01 = makeVec2(x0, y0 + 0.88 * h);
  const p11 = makeVec2(x0 + w - 0.55 * shearX, y0 + dropY + 1.06 * h);
  return {
    top: {
      p0: p00,
      p1: makeVec2(lerpVec2(p00, p10, 1 / 3).x, lerpVec2(p00, p10, 1 / 3).y + 0.07 * h * k),
      p2: makeVec2(lerpVec2(p00, p10, 2 / 3).x, lerpVec2(p00, p10, 2 / 3).y + 0.09 * h * k),
      p3: p10,
    },
    bottom: {
      p0: p01,
      p1: makeVec2(lerpVec2(p01, p11, 1 / 3).x, lerpVec2(p01, p11, 1 / 3).y + 0.10 * h * k),
      p2: makeVec2(lerpVec2(p01, p11, 2 / 3).x, lerpVec2(p01, p11, 2 / 3).y + 0.12 * h * k),
      p3: p11,
    },
    left: makeStraightBoundary(p00, p01),
    right: makeStraightBoundary(p10, p11),
  };
}
