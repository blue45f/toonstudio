/**
 * @file studio-csp-icc-audio-xpg-engine.ts
 * @description Clip Studio Paint 5.1.5 `IccProfLib_CRT.framework` (`CIccPCS`, `CIccXformMatrixTRC`, `CIccXform3DLut`, `CIccXform4DLut`, `CIccCmm`),
 * `libAudioUtl.dylib` (`AUAudioPlayer`, `AUMultiAudioBuffer`, `AUWatchPlayerUnit`, `AUOpenALSource`) 타임라인 오디오 스크러빙/파형/립싱크 엔진,
 * `TGXpgPlugIn.cfpi` (`_BlendCore`, `_CatFilterLookUpTable`, `_CopyTempToDensityTilingData`) 농도 타일링 코어,
 * 그리고 `MixPaletteTool.todb` (색 혼합 팔레트) / `EditImageTool.todb` vs `UXEditImageTool.todb` / `UXToolModifyKey.tomd` 통합 엔진.
 */

// ============================================================================
// 1. IccProfLib_CRT.framework (CIccPCS, CIccXformMatrixTRC, 3DLut, 4DLut, Cmm)
// ============================================================================

/** ICC PCS 표준 D50 기준 백색점 (X=0.9642, Y=1.0000, Z=0.8249) */
export const CSP_ICC_PCS_D50_WHITE_XYZ = [0.9642, 1.0, 0.8249] as const;

/**
 * `CIccPCS::Lab2ToLab4` — ICC v2 16-bit Lab 인코딩(0..65280)을 ICC v4 16-bit Lab 인코딩(0..65535)으로 변환합니다.
 */
export function cspIccPcsLab2ToLab4U16(
  lab2U16: readonly [number, number, number],
): [number, number, number] {
  const scale = 65535 / 65280;
  return [
    Math.min(65535, Math.max(0, Math.round(lab2U16[0] * scale))),
    Math.min(65535, Math.max(0, Math.round(lab2U16[1] * scale))),
    Math.min(65535, Math.max(0, Math.round(lab2U16[2] * scale))),
  ];
}

/**
 * `CIccPCS::Lab4ToLab2` — ICC v4 16-bit Lab 인코딩(0..65535)을 ICC v2 16-bit Lab 인코딩(0..65280)으로 변환합니다.
 */
export function cspIccPcsLab4ToLab2U16(
  lab4U16: readonly [number, number, number],
): [number, number, number] {
  const scale = 65280 / 65535;
  return [
    Math.min(65535, Math.max(0, Math.round(lab4U16[0] * scale))),
    Math.min(65535, Math.max(0, Math.round(lab4U16[1] * scale))),
    Math.min(65535, Math.max(0, Math.round(lab4U16[2] * scale))),
  ];
}

/**
 * `CIccPCS::XyzToLab` — D50 PCS XYZ 좌표를 CIE L*a*b* (L: 0..100, a/b: -128..127)로 변환합니다.
 */
export function cspIccPcsXyzToLabD50(
  xyzD50: readonly [number, number, number],
): [number, number, number] {
  const epsilon = 216 / 24389; // (6/29)^3
  const kappa = 24389 / 27; // (29/3)^3
  const f = (t: number): number =>
    t > epsilon ? Math.cbrt(t) : (kappa * t + 16) / 116;

  const fx = f(xyzD50[0] / CSP_ICC_PCS_D50_WHITE_XYZ[0]);
  const fy = f(xyzD50[1] / CSP_ICC_PCS_D50_WHITE_XYZ[1]);
  const fz = f(xyzD50[2] / CSP_ICC_PCS_D50_WHITE_XYZ[2]);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * `CIccPCS::LabToXyz` — CIE L*a*b* 좌표를 D50 PCS XYZ로 역변환합니다.
 */
export function cspIccPcsLabToXyzD50(
  lab: readonly [number, number, number],
): [number, number, number] {
  const epsilon = 216 / 24389;
  const kappa = 24389 / 27;
  const fy = (lab[0] + 16) / 116;
  const fx = fy + lab[1] / 500;
  const fz = fy - lab[2] / 200;

  const invF = (ft: number): number => {
    const cubed = ft * ft * ft;
    return cubed > epsilon ? cubed : (116 * ft - 16) / kappa;
  };

  return [
    invF(fx) * CSP_ICC_PCS_D50_WHITE_XYZ[0],
    invF(fy) * CSP_ICC_PCS_D50_WHITE_XYZ[1],
    invF(fz) * CSP_ICC_PCS_D50_WHITE_XYZ[2],
  ];
}

export interface CspIccMatrixTrcProfileSpec {
  readonly profileId: "sRGB" | "AdobeRGB1998" | "DisplayP3" | "AppleRGB" | "ColorMatchRGB";
  readonly gamma: number;
  /** D50 Bradford 적응 완료된 3x3 RGB -> XYZ(D50) 행렬 (Row-major 9개 원소) */
  readonly rgbToXyzD50Matrix: readonly [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  /** 역행렬 XYZ(D50) -> 선형 RGB */
  readonly xyzD50ToRgbMatrix: readonly [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
}

export const CSP_ICC_MATRIX_TRC_PROFILES: Readonly<
  Record<CspIccMatrixTrcProfileSpec["profileId"], CspIccMatrixTrcProfileSpec>
> = {
  sRGB: {
    profileId: "sRGB",
    gamma: 2.2,
    rgbToXyzD50Matrix: [
      0.4360747, 0.3850649, 0.1430804,
      0.2225045, 0.7168786, 0.0606169,
      0.0139322, 0.0971045, 0.7141733,
    ],
    xyzD50ToRgbMatrix: [
      3.1338561, -1.6168667, -0.4906146,
      -0.9787684, 1.9161415, 0.033454,
      0.0719453, -0.2289914, 1.4052427,
    ],
  },
  AdobeRGB1998: {
    profileId: "AdobeRGB1998",
    gamma: 2.19921875, // 563 / 256
    rgbToXyzD50Matrix: [
      0.6097559, 0.2052401, 0.149224,
      0.3111243, 0.625656, 0.0632197,
      0.0194811, 0.0608902, 0.7448387,
    ],
    xyzD50ToRgbMatrix: [
      1.9624274, -0.6105343, -0.3413404,
      -0.9787684, 1.9161415, 0.033454,
      0.0286869, -0.1406752, 1.3487655,
    ],
  },
  DisplayP3: {
    profileId: "DisplayP3",
    gamma: 2.2,
    rgbToXyzD50Matrix: [
      0.515102, 0.291965, 0.157153,
      0.241182, 0.692236, 0.0665819,
      -0.0010494, 0.0418818, 0.784378,
    ],
    xyzD50ToRgbMatrix: [
      2.404045, -0.989769, -0.397591,
      -0.842228, 1.79885, 0.016048,
      0.048194, -0.097374, 1.273688,
    ],
  },
  AppleRGB: {
    profileId: "AppleRGB",
    gamma: 1.8,
    rgbToXyzD50Matrix: [
      0.4755678, 0.3396722, 0.14898,
      0.2551721, 0.6725783, 0.0722496,
      0.0184691, 0.1133771, 0.6933638,
    ],
    xyzD50ToRgbMatrix: [
      2.8510695, -1.3605261, -0.4708281,
      -1.092768, 2.0348871, 0.0227598,
      0.1027403, -0.2964984, 1.4510659,
    ],
  },
  ColorMatchRGB: {
    profileId: "ColorMatchRGB",
    gamma: 1.8,
    rgbToXyzD50Matrix: [
      0.5093439, 0.3209071, 0.1339691,
      0.274884, 0.6581315, 0.0669845,
      0.0242545, 0.1087821, 0.6921735,
    ],
    xyzD50ToRgbMatrix: [
      2.6422874, -1.223427, -0.3930143,
      -1.1119763, 2.0590183, 0.0159614,
      0.0821699, -0.2807254, 1.4559877,
    ],
  },
};

/**
 * `CIccXformMatrixTRC::Apply` — RGB(0..1) 값을 지정된 ICC Matrix+TRC 프로파일로 D50 PCS XYZ로 변환합니다.
 */
export function applyCspIccMatrixTrcRgbToXyzD50(
  rgb01: readonly [number, number, number],
  profileId: CspIccMatrixTrcProfileSpec["profileId"] = "sRGB",
): [number, number, number] {
  const spec = CSP_ICC_MATRIX_TRC_PROFILES[profileId];
  const lin = (c: number): number => {
    const v = Math.max(0, Math.min(1, c));
    if (profileId === "sRGB" || profileId === "DisplayP3") {
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    return Math.pow(v, spec.gamma);
  };
  const r = lin(rgb01[0]);
  const g = lin(rgb01[1]);
  const b = lin(rgb01[2]);
  const m = spec.rgbToXyzD50Matrix;
  return [
    m[0] * r + m[1] * g + m[2] * b,
    m[3] * r + m[4] * g + m[5] * b,
    m[6] * r + m[7] * g + m[8] * b,
  ];
}

/**
 * `CIccXformMatrixTRC::Apply` (역방향) — D50 PCS XYZ를 지정된 ICC 프로파일의 RGB(0..1)로 변환합니다.
 */
export function applyCspIccMatrixTrcXyzD50ToRgb(
  xyzD50: readonly [number, number, number],
  profileId: CspIccMatrixTrcProfileSpec["profileId"] = "sRGB",
): [number, number, number] {
  const spec = CSP_ICC_MATRIX_TRC_PROFILES[profileId];
  const m = spec.xyzD50ToRgbMatrix;
  const lr = m[0] * xyzD50[0] + m[1] * xyzD50[1] + m[2] * xyzD50[2];
  const lg = m[3] * xyzD50[0] + m[4] * xyzD50[1] + m[5] * xyzD50[2];
  const lb = m[6] * xyzD50[0] + m[7] * xyzD50[1] + m[8] * xyzD50[2];

  const compand = (v: number): number => {
    const clamped = Math.max(0, Math.min(1, v));
    if (profileId === "sRGB" || profileId === "DisplayP3") {
      return clamped <= 0.0031308
        ? 12.92 * clamped
        : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
    }
    return Math.pow(clamped, 1 / spec.gamma);
  };

  return [compand(lr), compand(lg), compand(lb)];
}

/**
 * `CIccXform3DLut::Apply` — 3D CLUT(그리드 크기 `gridPoints^3`, 채널당 3출력)에 대해
 * 사면체 보간(Tetrahedral Interpolation)을 수행합니다.
 */
export function applyCspIcc3DLutTetrahedral(
  input01: readonly [number, number, number],
  gridPoints: number,
  lutTable: Float32Array,
): [number, number, number] {
  const n = Math.max(2, gridPoints);
  const scale = n - 1;
  const rx = Math.max(0, Math.min(1, input01[0])) * scale;
  const gx = Math.max(0, Math.min(1, input01[1])) * scale;
  const bx = Math.max(0, Math.min(1, input01[2])) * scale;

  const r0 = Math.min(n - 2, Math.floor(rx));
  const g0 = Math.min(n - 2, Math.floor(gx));
  const b0 = Math.min(n - 2, Math.floor(bx));
  const dr = rx - r0;
  const dg = gx - g0;
  const db = bx - b0;

  const sample = (ri: number, gi: number, bi: number, ch: number): number => {
    const idx = ((ri * n + gi) * n + bi) * 3 + ch;
    return lutTable[idx] ?? 0;
  };

  const out: [number, number, number] = [0, 0, 0];
  for (let ch = 0; ch < 3; ch += 1) {
    const c000 = sample(r0, g0, b0, ch);
    const c111 = sample(r0 + 1, g0 + 1, b0 + 1, ch);
    let val: number;
    if (dr >= dg) {
      if (dg >= db) {
        const c100 = sample(r0 + 1, g0, b0, ch);
        const c110 = sample(r0 + 1, g0 + 1, b0, ch);
        val = c000 + dr * (c100 - c000) + dg * (c110 - c100) + db * (c111 - c110);
      } else if (dr >= db) {
        const c100 = sample(r0 + 1, g0, b0, ch);
        const c101 = sample(r0 + 1, g0, b0 + 1, ch);
        val = c000 + dr * (c100 - c000) + db * (c101 - c100) + dg * (c111 - c101);
      } else {
        const c001 = sample(r0, g0, b0 + 1, ch);
        const c101 = sample(r0 + 1, g0, b0 + 1, ch);
        val = c000 + db * (c001 - c000) + dr * (c101 - c001) + dg * (c111 - c101);
      }
    } else if (db > dg) {
      const c001 = sample(r0, g0, b0 + 1, ch);
      const c011 = sample(r0, g0 + 1, b0 + 1, ch);
      val = c000 + db * (c001 - c000) + dg * (c011 - c001) + dr * (c111 - c011);
    } else if (db > dr) {
      const c010 = sample(r0, g0 + 1, b0, ch);
      const c011 = sample(r0, g0 + 1, b0 + 1, ch);
      val = c000 + dg * (c010 - c000) + db * (c011 - c010) + dr * (c111 - c011);
    } else {
      const c010 = sample(r0, g0 + 1, b0, ch);
      const c110 = sample(r0 + 1, g0 + 1, b0, ch);
      val = c000 + dg * (c010 - c000) + dr * (c110 - c010) + db * (c111 - c110);
    }
    out[ch] = val;
  }
  return out;
}

export type CspCmykPressProfileId =
  | "JapanColor2001Coated"
  | "JapanColor2001Uncoated"
  | "SWOP2006Coated3v2"
  | "CoatedFOGRA39"
  | "GRACoL2006Coated1v2";

export interface CspCmykPressInkSpec {
  readonly profileId: CspCmykPressProfileId;
  readonly totalInkLimitPercent: number;
  readonly dotGainMidtone: number;
  readonly paperWhiteRgb01: readonly [number, number, number];
  readonly blackPointRgb01: readonly [number, number, number];
}

export const CSP_CMYK_PRESS_INK_SPECS: Readonly<
  Record<CspCmykPressProfileId, CspCmykPressPressSpecAlias>
> = {
  JapanColor2001Coated: {
    profileId: "JapanColor2001Coated",
    totalInkLimitPercent: 350,
    dotGainMidtone: 0.14,
    paperWhiteRgb01: [0.965, 0.968, 0.958],
    blackPointRgb01: [0.075, 0.072, 0.078],
  },
  JapanColor2001Uncoated: {
    profileId: "JapanColor2001Uncoated",
    totalInkLimitPercent: 280,
    dotGainMidtone: 0.2,
    paperWhiteRgb01: [0.945, 0.948, 0.93],
    blackPointRgb01: [0.135, 0.132, 0.138],
  },
  SWOP2006Coated3v2: {
    profileId: "SWOP2006Coated3v2",
    totalInkLimitPercent: 300,
    dotGainMidtone: 0.16,
    paperWhiteRgb01: [0.952, 0.955, 0.942],
    blackPointRgb01: [0.088, 0.085, 0.09],
  },
  CoatedFOGRA39: {
    profileId: "CoatedFOGRA39",
    totalInkLimitPercent: 330,
    dotGainMidtone: 0.13,
    paperWhiteRgb01: [0.96, 0.962, 0.955],
    blackPointRgb01: [0.07, 0.068, 0.074],
  },
  GRACoL2006Coated1v2: {
    profileId: "GRACoL2006Coated1v2",
    totalInkLimitPercent: 340,
    dotGainMidtone: 0.14,
    paperWhiteRgb01: [0.958, 0.96, 0.952],
    blackPointRgb01: [0.072, 0.07, 0.076],
  },
};

type CspCmykPressPressSpecAlias = CspCmykPressInkSpec;

/**
 * `CIccXform4DLut::Apply` & `CIccCmm::IsInGamut` — RGB 픽셀 버퍼에 대해
 * CMYK 인쇄 프로파일 소프트 프루핑(종이 백색점/먹 한계/도트 게인 반영) 및 색역 외(Out-of-Gamut) 판정을 수행합니다.
 */
export function applyCspIccSoftProofAndGamutCheck(params: {
  readonly rgbaBytes: Uint8ClampedArray;
  readonly cmykProfileId?: CspCmykPressProfileId;
  readonly highlightOutOfGamut?: boolean;
  readonly gamutWarningRgb255?: readonly [number, number, number];
  readonly deltaEThreshold?: number;
}): {
  readonly proofedRgba: Uint8ClampedArray;
  readonly outOfGamutPixelCount: number;
  readonly maxDeltaE: number;
} {
  const spec = CSP_CMYK_PRESS_INK_SPECS[params.cmykProfileId ?? "JapanColor2001Coated"];
  const warnRgb = params.gamutWarningRgb255 ?? [0, 255, 180];
  const threshold = params.deltaEThreshold ?? 14.0;
  const out = new Uint8ClampedArray(params.rgbaBytes.length);

  let outOfGamutPixelCount = 0;
  let maxDeltaE = 0;

  for (let i = 0; i < params.rgbaBytes.length; i += 4) {
    const r01 = params.rgbaBytes[i]! / 255;
    const g01 = params.rgbaBytes[i + 1]! / 255;
    const b01 = params.rgbaBytes[i + 2]! / 255;
    const a = params.rgbaBytes[i + 3]!;

    // UCR/GCR 기반 CMYK 분판 + 도트 게인 반영
    const kRaw = 1 - Math.max(r01, g01, b01);
    const k = Math.min(1, kRaw * 0.9);
    const denom = Math.max(1e-5, 1 - k);
    const c = Math.min(1, Math.max(0, (1 - r01 - k) / denom) * (1 + spec.dotGainMidtone * 0.35));
    const m = Math.min(1, Math.max(0, (1 - g01 - k) / denom) * (1 + spec.dotGainMidtone * 0.35));
    const y = Math.min(1, Math.max(0, (1 - b01 - k) / denom) * (1 + spec.dotGainMidtone * 0.35));

    // 인쇄 용지 백색점 및 먹 농도 압축을 반영한 소프트 프루프 RGB 재합성
    const prRaw = (1 - c * 0.92) * (1 - k);
    const pgRaw = (1 - m * 0.9) * (1 - k);
    const pbRaw = (1 - y * 0.88) * (1 - k);

    const pr =
      spec.blackPointRgb01[0] +
      prRaw * (spec.paperWhiteRgb01[0] - spec.blackPointRgb01[0]);
    const pg =
      spec.blackPointRgb01[1] +
      pgRaw * (spec.paperWhiteRgb01[1] - spec.blackPointRgb01[1]);
    const pb =
      spec.blackPointRgb01[2] +
      pbRaw * (spec.paperWhiteRgb01[2] - spec.blackPointRgb01[2]);

    const srcLab = cspIccPcsXyzToLabD50(applyCspIccMatrixTrcRgbToXyzD50([r01, g01, b01], "sRGB"));
    const prfLab = cspIccPcsXyzToLabD50(applyCspIccMatrixTrcRgbToXyzD50([pr, pg, pb], "sRGB"));
    const dE = Math.hypot(
      srcLab[0] - prfLab[0],
      srcLab[1] - prfLab[1],
      srcLab[2] - prfLab[2],
    );
    if (dE > maxDeltaE) {
      maxDeltaE = dE;
    }

    const isOutOfGamut = dE > threshold;
    if (isOutOfGamut) {
      outOfGamutPixelCount += 1;
    }

    if (isOutOfGamut && params.highlightOutOfGamut) {
      out[i] = warnRgb[0];
      out[i + 1] = warnRgb[1];
      out[i + 2] = warnRgb[2];
    } else {
      out[i] = Math.round(Math.max(0, Math.min(1, pr)) * 255);
      out[i + 1] = Math.round(Math.max(0, Math.min(1, pg)) * 255);
      out[i + 2] = Math.round(Math.max(0, Math.min(1, pb)) * 255);
    }
    out[i + 3] = a;
  }

  return {
    proofedRgba: out,
    outOfGamutPixelCount,
    maxDeltaE,
  };
}

// ============================================================================
// 2. libAudioUtl.dylib (AUAudioPlayer, AUMultiAudioBuffer, AUWatchPlayerUnit)
// ============================================================================

export interface CspAudioTrackClipSpec {
  readonly clipId: string;
  readonly startFrame: number;
  readonly volumeGain01: number;
  readonly pitchRatio: number;
  readonly sampleRateHz: number;
  readonly monoPcmSamples: Float32Array;
}

export interface CspAudioTimelineScrubSlice {
  readonly frameIndex: number;
  readonly fps: number;
  readonly sampleCount: number;
  readonly mixedSamples: Float32Array;
  readonly rmsLevel01: number;
  readonly peakLevel01: number;
}

/**
 * `libAudioUtl.dylib`의 `AUAudioPlayer` / `AUMultiAudioBuffer` / `AUWatchPlayerUnit`과 동일하게
 * 애니메이션 타임라인의 특정 프레임(`frameIndex`, `fps`)에 해당하는 오디오 샘플 슬라이스를 다중 트랙 믹싱하여 추출합니다.
 */
export function computeCspAudioTimelineFrameSlice(params: {
  readonly clips: readonly CspAudioTrackClipSpec[];
  readonly frameIndex: number;
  readonly fps: number;
  readonly outputSampleRateHz?: number;
}): CspAudioTimelineScrubSlice {
  const fps = Math.max(1, params.fps);
  const outRate = Math.max(8000, params.outputSampleRateHz ?? 44100);
  const sampleCount = Math.max(1, Math.round(outRate / fps));
  const mixed = new Float32Array(sampleCount);

  const frameStartSec = params.frameIndex / fps;

  for (const clip of params.clips) {
    const clipStartSec = clip.startFrame / fps;
    const relStartSec = frameStartSec - clipStartSec;
    const pitch = Math.max(0.25, Math.min(4.0, clip.pitchRatio));
    const gain = Math.max(0, Math.min(2.0, clip.volumeGain01));

    for (let i = 0; i < sampleCount; i += 1) {
      const tSec = relStartSec + i / outRate;
      if (tSec < 0) {
        continue;
      }
      const srcPos = tSec * clip.sampleRateHz * pitch;
      const idx0 = Math.floor(srcPos);
      if (idx0 < 0 || idx0 >= clip.monoPcmSamples.length) {
        continue;
      }
      const frac = srcPos - idx0;
      const s0 = clip.monoPcmSamples[idx0] ?? 0;
      const s1 =
        idx0 + 1 < clip.monoPcmSamples.length ? (clip.monoPcmSamples[idx0 + 1] ?? s0) : s0;
      mixed[i] = Math.max(-1, Math.min(1, mixed[i]! + (s0 + (s1 - s0) * frac) * gain));
    }
  }

  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    const absV = Math.abs(mixed[i]!);
    sumSq += absV * absV;
    if (absV > peak) {
      peak = absV;
    }
  }

  return {
    frameIndex: params.frameIndex,
    fps,
    sampleCount,
    mixedSamples: mixed,
    rmsLevel01: Math.min(1, Math.sqrt(sumSq / sampleCount)),
    peakLevel01: Math.min(1, peak),
  };
}

export type CspLipSyncMouthShape = "Closed" | "A" | "I" | "U" | "E" | "O";

export interface CspAudioLipSyncFrameCue {
  readonly frameIndex: number;
  readonly rmsLevel01: number;
  readonly zeroCrossingRateHz: number;
  readonly mouthShape: CspLipSyncMouthShape;
}

/**
 * 타임라인 오디오 클립의 프레임별 RMS 에너지와 영교차율(Zero-Crossing Rate)을 분석하여
 * 2D 애니메이션 셀(`Closed`, `A`, `I`, `U`, `E`, `O`) 자동 립싱크 큐시트를 생성합니다.
 */
export function generateCspAudioLipSyncTrack(params: {
  readonly clips: readonly CspAudioTrackClipSpec[];
  readonly startFrame: number;
  readonly endFrame: number;
  readonly fps: number;
  readonly silenceRmsThreshold?: number;
}): readonly CspAudioLipSyncFrameCue[] {
  const silenceThreshold = params.silenceRmsThreshold ?? 0.03;
  const cues: CspAudioLipSyncFrameCue[] = [];

  for (let f = params.startFrame; f <= params.endFrame; f += 1) {
    const slice = computeCspAudioTimelineFrameSlice({
      clips: params.clips,
      frameIndex: f,
      fps: params.fps,
      outputSampleRateHz: 22050,
    });

    let zeroCrossings = 0;
    for (let i = 1; i < slice.mixedSamples.length; i += 1) {
      const prev = slice.mixedSamples[i - 1]!;
      const curr = slice.mixedSamples[i]!;
      if ((prev >= 0 && curr < 0) || (prev < 0 && curr >= 0)) {
        zeroCrossings += 1;
      }
    }
    const durationSec = slice.sampleCount / 22050;
    const zcrHz = durationSec > 0 ? zeroCrossings / (2 * durationSec) : 0;

    let mouthShape: CspLipSyncMouthShape = "Closed";
    if (slice.rmsLevel01 >= silenceThreshold) {
      if (slice.rmsLevel01 > 0.35) {
        mouthShape = zcrHz > 1400 ? "E" : "A";
      } else if (zcrHz > 1800) {
        mouthShape = "I";
      } else if (zcrHz < 650) {
        mouthShape = "U";
      } else {
        mouthShape = "O";
      }
    }

    cues.push({
      frameIndex: f,
      rmsLevel01: slice.rmsLevel01,
      zeroCrossingRateHz: zcrHz,
      mouthShape,
    });
  }

  return cues;
}

// ============================================================================
// 3. TGXpgPlugIn.cfpi (_BlendCore / _CatFilterLookUpTable) & MixPalette / ToolDB
// ============================================================================

/**
 * `TGXpgPlugIn.cfpi`의 `_CatFilterLookUpTable` 및 `_BlendCore` 심볼에서 역공학한
 * 256단계 농도 룩업 테이블 생성 및 스크린톤/농도 타일링 합성 코어.
 */
export function buildCspTgXpgFilterLookUpTable(params: {
  readonly gamma: number;
  readonly contrast: number;
  readonly minDensity01?: number;
  readonly maxDensity01?: number;
}): Uint8Array {
  const lut = new Uint8Array(256);
  const gamma = Math.max(0.1, Math.min(5.0, params.gamma));
  const contrast = Math.max(-1, Math.min(1, params.contrast));
  const minD = Math.max(0, Math.min(1, params.minDensity01 ?? 0));
  const maxD = Math.max(minD, Math.min(1, params.maxDensity01 ?? 1));

  const contrastFactor = Math.tan(((contrast + 1) * Math.PI) / 4);

  for (let i = 0; i < 256; i += 1) {
    const norm = i / 255;
    const gammaCorrected = Math.pow(norm, 1 / gamma);
    const contrasted = (gammaCorrected - 0.5) * contrastFactor + 0.5;
    const clamped = Math.max(minD, Math.min(maxD, contrasted));
    lut[i] = Math.round(clamped * 255);
  }
  return lut;
}

/**
 * `TGXpgPlugIn.cfpi`의 `_BlendCore` 및 `_CopyTempToDensityTilingData` 동작을 재현하여
 * 원본 농도 버퍼와 타일 패턴을 룩업 테이블 기반으로 합성합니다.
 */
export function applyCspTgXpgDensityBlendCore(params: {
  readonly baseDensityBytes: Uint8Array;
  readonly overlayDensityBytes: Uint8Array;
  readonly lut256: Uint8Array;
  readonly opacity01: number;
}): Uint8Array {
  const len = Math.min(params.baseDensityBytes.length, params.overlayDensityBytes.length);
  const out = new Uint8Array(len);
  const alpha = Math.max(0, Math.min(1, params.opacity01));

  for (let i = 0; i < len; i += 1) {
    const baseVal = params.baseDensityBytes[i]!;
    const mappedOverlay = params.lut256[params.overlayDensityBytes[i]!] ?? 0;
    out[i] = Math.round(baseVal * (1 - alpha) + mappedOverlay * alpha);
  }
  return out;
}

export interface CspMixPaletteToolSpec {
  readonly nodeId: number;
  readonly nodeNameKo: string;
  readonly nodeVariantId: number;
  readonly role: "brush" | "blend" | "eyedropper";
}

/**
 * `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/MixPalette/korean/MixPaletteTool.todb`에서 추출한
 * 색 혼합 팔레트(Color Mixing Palette) 내장 3종 보조 도구 규격.
 */
export const CSP_MIX_PALETTE_TOOL_SPECS: readonly CspMixPaletteToolSpec[] = [
  { nodeId: 28, nodeNameKo: "붓", nodeVariantId: 27, role: "brush" },
  { nodeId: 29, nodeNameKo: "색 혼합", nodeVariantId: 29, role: "blend" },
  { nodeId: 30, nodeNameKo: "스포이트", nodeVariantId: 31, role: "eyedropper" },
] as const;

/**
 * `Settings/PAINT/Tool/korean/` 내 스튜디오 모드(`EditImageTool.todb`, `DefaultToolModifyKey.tomd`)와
 * 심플/태블릿 UX 모드(`UXEditImageTool.todb`, `UXToolModifyKey.tomd`) 데이터베이스 규격.
 */
export const CSP_TOOL_DB_AND_MODIFY_KEY_SPECS = {
  studioModeToolDb: {
    fileName: "EditImageTool.todb",
    sizeBytes: 893_952,
    nodeCount: 255,
    variantCount: 406,
  },
  simpleUxModeToolDb: {
    fileName: "UXEditImageTool.todb",
    sizeBytes: 860_160,
    nodeCount: 136,
    variantCount: 239,
  },
  defaultModifyKeyDb: {
    fileName: "DefaultToolModifyKey.tomd",
    sizeBytes: 24_576,
    modifyKeySettingCount: 84,
  },
  uxModifyKeyDb: {
    fileName: "UXToolModifyKey.tomd",
    sizeBytes: 24_576,
    modifyKeySettingCount: 84,
  },
} as const;
