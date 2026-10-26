import { describe, expect, it } from "vitest";

import {
  CSP_CMYK_PRESS_INK_SPECS,
  CSP_ICC_MATRIX_TRC_PROFILES,
  CSP_ICC_PCS_D50_WHITE_XYZ,
  CSP_MIX_PALETTE_TOOL_SPECS,
  CSP_TOOL_DB_AND_MODIFY_KEY_SPECS,
  applyCspIcc3DLutTetrahedral,
  applyCspIccMatrixTrcRgbToXyzD50,
  applyCspIccMatrixTrcXyzD50ToRgb,
  applyCspIccSoftProofAndGamutCheck,
  applyCspTgXpgDensityBlendCore,
  buildCspTgXpgFilterLookUpTable,
  computeCspAudioTimelineFrameSlice,
  cspIccPcsLab2ToLab4U16,
  cspIccPcsLab4ToLab2U16,
  cspIccPcsLabToXyzD50,
  cspIccPcsXyzToLabD50,
  generateCspAudioLipSyncTrack,
} from "../studio-csp-icc-audio-xpg-engine";

describe("studio-csp-icc-audio-xpg-engine", () => {
  it("converts ICC PCS Lab2 <-> Lab4 and D50 XYZ <-> Lab accurately (IccProfLib_CRT)", () => {
    const lab2: [number, number, number] = [65280, 32768, 32768];
    const lab4 = cspIccPcsLab2ToLab4U16(lab2);
    expect(lab4[0]).toBe(65535);
    const roundTripLab2 = cspIccPcsLab4ToLab2U16(lab4);
    expect(roundTripLab2[0]).toBe(65280);

    const whiteLab = cspIccPcsXyzToLabD50(CSP_ICC_PCS_D50_WHITE_XYZ);
    expect(whiteLab[0]).toBeCloseTo(100, 3);
    expect(whiteLab[1]).toBeCloseTo(0, 3);
    expect(whiteLab[2]).toBeCloseTo(0, 3);

    const backXyz = cspIccPcsLabToXyzD50([65.4, 24.1, -18.7]);
    const backLab = cspIccPcsXyzToLabD50(backXyz);
    expect(backLab[0]).toBeCloseTo(65.4, 3);
    expect(backLab[1]).toBeCloseTo(24.1, 3);
    expect(backLab[2]).toBeCloseTo(-18.7, 3);
  });

  it("applies CIccXformMatrixTRC forward/inverse transforms and CIccXform3DLut tetrahedral interpolation", () => {
    for (const profileId of Object.keys(
      CSP_ICC_MATRIX_TRC_PROFILES,
    ) as (keyof typeof CSP_ICC_MATRIX_TRC_PROFILES)[]) {
      const srcRgb: [number, number, number] = [0.72, 0.38, 0.21];
      const xyz = applyCspIccMatrixTrcRgbToXyzD50(srcRgb, profileId);
      const restored = applyCspIccMatrixTrcXyzD50ToRgb(xyz, profileId);
      expect(restored[0]).toBeCloseTo(srcRgb[0], 2);
      expect(restored[1]).toBeCloseTo(srcRgb[1], 2);
      expect(restored[2]).toBeCloseTo(srcRgb[2], 2);
    }

    // Build a 3x3x3 identity 3D CLUT
    const n = 3;
    const lut = new Float32Array(n * n * n * 3);
    for (let r = 0; r < n; r += 1) {
      for (let g = 0; g < n; g += 1) {
        for (let b = 0; b < n; b += 1) {
          const idx = ((r * n + g) * n + b) * 3;
          lut[idx] = r / (n - 1);
          lut[idx + 1] = g / (n - 1);
          lut[idx + 2] = b / (n - 1);
        }
      }
    }
    const interp = applyCspIcc3DLutTetrahedral([0.23, 0.67, 0.89], n, lut);
    expect(interp[0]).toBeCloseTo(0.23, 4);
    expect(interp[1]).toBeCloseTo(0.67, 4);
    expect(interp[2]).toBeCloseTo(0.89, 4);
  });

  it("performs CMYK press soft-proofing and Out-of-Gamut warning highlighting", () => {
    expect(Object.keys(CSP_CMYK_PRESS_INK_SPECS).length).toBe(5);
    const rgba = new Uint8ClampedArray([
      // Saturated neon green (out of CMYK gamut)
      0, 255, 40, 255,
      // Neutral mid-gray (in CMYK gamut)
      128, 128, 128, 255,
    ]);
    const res = applyCspIccSoftProofAndGamutCheck({
      rgbaBytes: rgba,
      cmykProfileId: "JapanColor2001Uncoated",
      highlightOutOfGamut: true,
      gamutWarningRgb255: [255, 0, 255],
      deltaEThreshold: 12.0,
    });
    expect(res.outOfGamutPixelCount).toBe(1);
    expect(res.proofedRgba[0]).toBe(255);
    expect(res.proofedRgba[1]).toBe(0);
    expect(res.proofedRgba[2]).toBe(255);
    expect(res.proofedRgba[4]).toBeGreaterThan(100);
    expect(res.proofedRgba[4]).toBeLessThan(150);
  });

  it("scrubs multi-track timeline audio slices and generates 5-vowel lip-sync cues (libAudioUtl.dylib)", () => {
    const sampleRateHz = 22050;
    const sine440 = new Float32Array(sampleRateHz);
    for (let i = 0; i < sampleRateHz; i += 1) {
      // Frame 0..5: loud 440Hz tone ('A'); Frame 6..11: quiet; Frame 12..17: high-freq 2500Hz ('I')
      const sec = i / sampleRateHz;
      if (sec < 0.25) {
        sine440[i] = Math.sin(2 * Math.PI * 440 * sec) * 0.7;
      } else if (sec < 0.5) {
        sine440[i] = 0;
      } else {
        sine440[i] = Math.sin(2 * Math.PI * 2500 * sec) * 0.25;
      }
    }

    const clips = [
      {
        clipId: "voice-1",
        startFrame: 0,
        volumeGain01: 1.0,
        pitchRatio: 1.0,
        sampleRateHz,
        monoPcmSamples: sine440,
      },
    ];

    const slice0 = computeCspAudioTimelineFrameSlice({
      clips,
      frameIndex: 1,
      fps: 24,
      outputSampleRateHz: 22050,
    });
    expect(slice0.rmsLevel01).toBeGreaterThan(0.4);
    expect(slice0.peakLevel01).toBeGreaterThan(0.65);

    const lipSync = generateCspAudioLipSyncTrack({
      clips,
      startFrame: 0,
      endFrame: 16,
      fps: 24,
    });
    expect(lipSync.length).toBe(17);
    expect(lipSync[1]?.mouthShape).toBe("A");
    expect(lipSync[8]?.mouthShape).toBe("Closed");
    expect(lipSync[14]?.mouthShape).toBe("I");
  });

  it("executes TGXpgPlugIn.cfpi density LUT blending and exposes MixPalette / ToolDB specs", () => {
    const lut = buildCspTgXpgFilterLookUpTable({
      gamma: 1.2,
      contrast: 0.2,
      minDensity01: 0.05,
      maxDensity01: 0.95,
    });
    expect(lut.length).toBe(256);
    expect(lut[0]).toBeGreaterThanOrEqual(12);
    expect(lut[255]).toBeLessThanOrEqual(243);

    const blended = applyCspTgXpgDensityBlendCore({
      baseDensityBytes: new Uint8Array([50, 100, 200]),
      overlayDensityBytes: new Uint8Array([200, 100, 50]),
      lut256: lut,
      opacity01: 0.5,
    });
    expect(blended.length).toBe(3);

    expect(CSP_MIX_PALETTE_TOOL_SPECS.map((t) => t.nodeNameKo)).toEqual([
      "붓",
      "색 혼합",
      "스포이트",
    ]);
    expect(CSP_TOOL_DB_AND_MODIFY_KEY_SPECS.studioModeToolDb.nodeCount).toBe(255);
    expect(CSP_TOOL_DB_AND_MODIFY_KEY_SPECS.simpleUxModeToolDb.nodeCount).toBe(136);
  });
});
