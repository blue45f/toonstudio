/**
 * Wave-3 확장 스위트 16종 C-ABI 제로누수 선형 메모리 런타임 래퍼 (`studio-wasm64-extended-suite.wasm`).
 * 모든 호출은 `withArena` 스코프에서 `wasm_alloc` → `try ... finally { wasm_free }`를 강제한다.
 */

import {
  WAVE3_EXPECTED_ABI_VERSION,
  WAVE3_EXPECTED_CAPABILITIES,
  type BiquadFilterKindName,
  type ResampleInterpolationName,
  type StrokeJoinStyleName,
  type StudioWave3Runtime,
  type TileClassName,
  type Wave3ArenaStats,
  type Wave3BackendTier,
  type Wave3BiquadEqOptions,
  type Wave3CmykTacOptions,
  type Wave3DynamicsOptions,
  type Wave3MixTrackParam,
  type Wave3PaletteSwatch,
  type Wave3ReverbOptions,
  type Wave3RuntimeMetadata,
  type Wave3SliceConfig,
  type Wave3SliceSpan,
  type Wave3TileDedupEntry,
  type WindingFillRuleName,
} from "./wave3-types";

export interface RawWave3WasmExports {
  readonly memory: WebAssembly.Memory;
  readonly wasm_drawing_core_abi_version: () => number;
  readonly wasm_alloc: (byteLen: number) => number;
  readonly wasm_free: (ptr: number, byteLen: number) => void;
  readonly wasm_wave3_capabilities: () => number;
  readonly wasm_audio_biquad_eq_stereo: (
    l: number, r: number, frames: number, kind: number, params: number, state: number,
  ) => number;
  readonly wasm_audio_mix_master_stereo: (
    tr: number, tc: number, frames: number, tp: number, dp: number, ol: number, or: number, met: number,
  ) => number;
  readonly wasm_audio_schroeder_reverb_stereo: (
    il: number, ir: number, ol: number, or: number, frames: number, params: number,
  ) => number;
  readonly wasm_audio_resample_mono: (
    inp: number, inLen: number, out: number, outLen: number, ratio: number, mode: number,
  ) => number;
  readonly wasm_vector_simplify_rdp: (
    inXy: number, pts: number, eps: number, outXy: number, cap: number,
  ) => number;
  readonly wasm_vector_smooth_chaikin: (
    inXy: number, pts: number, iter: number, closed: number, ratio: number, outXy: number, cap: number,
  ) => number;
  readonly wasm_vector_flatten_bezier_arc_len: (
    ctrl: number, tol: number, outXy: number, outArc: number, cap: number,
  ) => number;
  readonly wasm_vector_expand_stroke_outline: (
    spine: number, pts: number, join: number, miter: number, outXy: number, cap: number,
  ) => number;
  readonly wasm_vector_hit_test_batch: (
    poly: number, np: number, q: number, nq: number, rule: number, out: number,
  ) => number;
  readonly wasm_webtoon_plan_smart_slices: (
    rgba: number, w: number, h: number, params: number, out: number, cap: number,
  ) => number;
  readonly wasm_webtoon_dedup_tiles_fnv64: (
    rgba: number, w: number, h: number, tileSize: number, sum: number, ent: number, cap: number,
  ) => number;
  readonly wasm_color_srgb_to_p3_batch: (src: number, dst: number, px: number) => number;
  readonly wasm_color_p3_to_srgb_batch: (src: number, dst: number, px: number) => number;
  readonly wasm_color_rgba_to_cmyk_tac_batch: (
    src: number, dst: number, px: number, params: number, stats: number,
  ) => number;
  readonly wasm_color_extract_palette_median_cut: (
    src: number, px: number, maxC: number, alphaThr: number, outSw: number,
  ) => number;
}

const REQUIRED_WAVE3_EXPORTS = [
  "wasm_drawing_core_abi_version",
  "wasm_alloc",
  "wasm_free",
  "wasm_wave3_capabilities",
  "wasm_audio_biquad_eq_stereo",
  "wasm_audio_mix_master_stereo",
  "wasm_audio_schroeder_reverb_stereo",
  "wasm_audio_resample_mono",
  "wasm_vector_simplify_rdp",
  "wasm_vector_smooth_chaikin",
  "wasm_vector_flatten_bezier_arc_len",
  "wasm_vector_expand_stroke_outline",
  "wasm_vector_hit_test_batch",
  "wasm_webtoon_plan_smart_slices",
  "wasm_webtoon_dedup_tiles_fnv64",
  "wasm_color_srgb_to_p3_batch",
  "wasm_color_p3_to_srgb_batch",
  "wasm_color_rgba_to_cmyk_tac_batch",
  "wasm_color_extract_palette_median_cut",
] as const;

export function isWave3WasmExports(exp: WebAssembly.Exports): exp is WebAssembly.Exports & RawWave3WasmExports {
  return (
    exp.memory instanceof WebAssembly.Memory &&
    REQUIRED_WAVE3_EXPORTS.every((name) => typeof exp[name] === "function")
  );
}

function biquadKindCode(kind: BiquadFilterKindName): number {
  return kind === "lowpass" ? 0 : kind === "highpass" ? 1 : 2;
}

function resampleModeCode(mode: ResampleInterpolationName): number {
  return mode === "linear" ? 0 : 1;
}

function joinStyleCode(join: StrokeJoinStyleName): number {
  return join === "bevel" ? 0 : 1;
}

function fillRuleCode(rule: WindingFillRuleName): number {
  return rule === "nonzero" ? 0 : 1;
}

function decodeTileClass(code: number): TileClassName {
  if (code === 0) return "empty-transparent";
  if (code === 1) return "solid-color";
  return "content";
}

function checkFfiCode(code: number, op: string): number {
  if (code < 0) {
    throw new Error(`Wave-3 WASM 커널 오류(${op}): code=${code}`);
  }
  return code;
}

export function createWave3WasmRuntimeFromExports(
  e: RawWave3WasmExports,
  meta: {
    readonly backend: Wave3BackendTier;
    readonly resolvedUrl: string | null;
    readonly wasmByteLength: number;
    readonly loadElapsedMs: number;
  },
): StudioWave3Runtime {
  const abiVersion = e.wasm_drawing_core_abi_version() >>> 0;
  const wave3Caps = e.wasm_wave3_capabilities() >>> 0;
  if (abiVersion !== WAVE3_EXPECTED_ABI_VERSION) {
    throw new Error(`Wave-3 WASM ABI 버전 불일치: actual=${abiVersion}`);
  }
  if ((wave3Caps & WAVE3_EXPECTED_CAPABILITIES) !== WAVE3_EXPECTED_CAPABILITIES) {
    throw new Error(`Wave-3 WASM 기능 비트마스크 불일치: actual=0x${wave3Caps.toString(16)}`);
  }

  let disposed = false;
  let activeAllocations = 0;
  let totalAllocations = 0;
  let totalFrees = 0;
  let liveAllocatedBytes = 0;
  let peakAllocatedBytes = 0;

  interface ScopedArena {
    readonly alloc: (bytes: number) => number;
    readonly u8: (src: Uint8Array | Uint8ClampedArray) => number;
    readonly f32: (src: Float32Array) => number;
    readonly u8Zero: (len: number) => number;
    readonly u32Zero: (len: number) => number;
    readonly u64Zero: (len: number) => number;
    readonly f32Zero: (len: number) => number;
  }

  function withArena<T>(fn: (arena: ScopedArena) => T): T {
    if (disposed) {
      throw new Error("Wave-3 WASM 런타임이 이미 dispose되었습니다");
    }
    const allocs: Array<readonly [number, number]> = [];
    const alloc = (bytes: number): number => {
      if (bytes <= 0) return 0;
      const ptr = e.wasm_alloc(bytes) >>> 0;
      if (ptr === 0) throw new Error(`wasm_alloc 실패 (${bytes}B)`);
      allocs.push([ptr, bytes]);
      activeAllocations += 1;
      totalAllocations += 1;
      liveAllocatedBytes += bytes;
      if (liveAllocatedBytes > peakAllocatedBytes) peakAllocatedBytes = liveAllocatedBytes;
      return ptr;
    };
    const arena: ScopedArena = {
      alloc,
      u8: (src) => {
        const ptr = alloc(src.byteLength);
        if (ptr !== 0) new Uint8Array(e.memory.buffer, ptr, src.byteLength).set(src);
        return ptr;
      },
      f32: (src) => {
        const ptr = alloc(src.byteLength);
        if (ptr !== 0) new Float32Array(e.memory.buffer, ptr, src.length).set(src);
        return ptr;
      },
      u8Zero: (len) => {
        const ptr = alloc(len);
        if (ptr !== 0) new Uint8Array(e.memory.buffer, ptr, len).fill(0);
        return ptr;
      },
      u32Zero: (len) => {
        const ptr = alloc(len * 4);
        if (ptr !== 0) new Uint32Array(e.memory.buffer, ptr, len).fill(0);
        return ptr;
      },
      u64Zero: (len) => {
        const ptr = alloc(len * 8);
        if (ptr !== 0) new BigUint64Array(e.memory.buffer, ptr, len).fill(0n);
        return ptr;
      },
      f32Zero: (len) => {
        const ptr = alloc(len * 4);
        if (ptr !== 0) new Float32Array(e.memory.buffer, ptr, len).fill(0);
        return ptr;
      },
    };
    try {
      return fn(arena);
    } finally {
      for (let i = allocs.length - 1; i >= 0; i -= 1) {
        const entry = allocs[i];
        if (!entry) continue;
        e.wasm_free(entry[0], entry[1]);
        activeAllocations -= 1;
        totalFrees += 1;
        liveAllocatedBytes -= entry[1];
      }
    }
  }

  const getMetadata = (): Wave3RuntimeMetadata => ({
    backend: meta.backend,
    abiVersion,
    wave3CapabilitiesMask: wave3Caps,
    resolvedUrl: meta.resolvedUrl,
    wasmByteLength: meta.wasmByteLength,
    linearMemoryBytes: disposed ? 0 : e.memory.buffer.byteLength,
    loadElapsedMs: meta.loadElapsedMs,
  });

  const getArenaStats = (): Wave3ArenaStats => ({
    activeAllocations,
    totalAllocations,
    totalFrees,
    liveAllocatedBytes,
    peakAllocatedBytes,
  });

  return {
    getMetadata,
    getArenaStats,

    biquadEqStereo(left, right, options: Wave3BiquadEqOptions) {
      if (left.length !== right.length) throw new RangeError("stereo channel lengths must match");
      return withArena((a) => {
        const n = left.length;
        const pL = a.f32(left);
        const pR = a.f32(right);
        const pParams = a.f32(
          new Float32Array([
            options.sampleRate ?? 48_000,
            options.freqHz,
            options.q ?? 0.70710678,
            options.gainDb ?? 0,
          ]),
        );
        const pState = a.f32(options.state ? new Float32Array(options.state) : new Float32Array(4));
        const frames = checkFfiCode(
          e.wasm_audio_biquad_eq_stereo(pL, pR, n, biquadKindCode(options.kind), pParams, pState),
          "biquadEqStereo",
        );
        return {
          left: new Float32Array(e.memory.buffer, pL, n).slice(),
          right: new Float32Array(e.memory.buffer, pR, n).slice(),
          nextState: new Float32Array(e.memory.buffer, pState, 4).slice(),
          frames,
          backend: meta.backend,
        };
      });
    },

    mixAndMasterStereo(tracksPlanar, trackCount, frames, trackParams: readonly Wave3MixTrackParam[], dynamics: Wave3DynamicsOptions = {}) {
      return withArena((a) => {
        const pTracks = a.f32(tracksPlanar);
        const flatTp = new Float32Array(trackCount * 3);
        for (let i = 0; i < trackCount; i += 1) {
          const p = trackParams[i] ?? { gain: 1, pan: 0, mute: false };
          flatTp[i * 3] = p.gain;
          flatTp[i * 3 + 1] = p.pan;
          flatTp[i * 3 + 2] = p.mute ? 1 : 0;
        }
        const pTp = a.f32(flatTp);
        const pDyn = a.f32(
          new Float32Array([
            dynamics.sampleRate ?? 48_000,
            dynamics.thresholdDb ?? -18,
            dynamics.ratio ?? 4,
            dynamics.kneeDb ?? 6,
            dynamics.attackMs ?? 5,
            dynamics.releaseMs ?? 80,
            dynamics.makeupDb ?? 0,
            dynamics.limiterCeilingDb ?? -1,
          ]),
        );
        const pOutL = a.f32Zero(frames);
        const pOutR = a.f32Zero(frames);
        const pMet = a.f32Zero(6);
        const done = checkFfiCode(
          e.wasm_audio_mix_master_stereo(pTracks, trackCount, frames, pTp, pDyn, pOutL, pOutR, pMet),
          "mixAndMasterStereo",
        );
        const m = new Float32Array(e.memory.buffer, pMet, 6);
        return {
          left: new Float32Array(e.memory.buffer, pOutL, frames).slice(),
          right: new Float32Array(e.memory.buffer, pOutR, frames).slice(),
          frames: done,
          integratedLufs: m[0] ?? -120,
          truePeakLinear: m[1] ?? 0,
          truePeakDbfs: m[2] ?? -120,
          samplePeakLinear: m[3] ?? 0,
          maxGainReductionDb: m[4] ?? 0,
          activeTracks: Math.round(m[5] ?? 0),
          backend: meta.backend,
        };
      });
    },

    schroederReverbStereo(inLeft, inRight, options: Wave3ReverbOptions = {}) {
      if (inLeft.length !== inRight.length) throw new RangeError("stereo channel lengths must match");
      return withArena((a) => {
        const n = inLeft.length;
        const pIl = a.f32(inLeft);
        const pIr = a.f32(inRight);
        const pOl = a.f32Zero(n);
        const pOr = a.f32Zero(n);
        const pCfg = a.f32(
          new Float32Array([
            options.sampleRate ?? 48_000,
            options.roomSize ?? 0.65,
            options.damping ?? 0.35,
            options.wet ?? 0.3,
            options.dry ?? 0.85,
          ]),
        );
        const frames = checkFfiCode(
          e.wasm_audio_schroeder_reverb_stereo(pIl, pIr, pOl, pOr, n, pCfg),
          "schroederReverbStereo",
        );
        return {
          left: new Float32Array(e.memory.buffer, pOl, n).slice(),
          right: new Float32Array(e.memory.buffer, pOr, n).slice(),
          frames,
          backend: meta.backend,
        };
      });
    },

    resampleMono(input, outputFrames, rateRatio, mode: ResampleInterpolationName = "cubic-hermite") {
      return withArena((a) => {
        const pIn = a.f32(input);
        const pOut = a.f32Zero(outputFrames);
        const written = checkFfiCode(
          e.wasm_audio_resample_mono(pIn, input.length, pOut, outputFrames, rateRatio, resampleModeCode(mode)),
          "resampleMono",
        );
        return {
          samples: new Float32Array(e.memory.buffer, pOut, written).slice(),
          outputFrames: written,
          backend: meta.backend,
        };
      });
    },

    simplifyPolylineRdp(xy, epsilon) {
      return withArena((a) => {
        const n = xy.length >> 1;
        const pIn = a.f32(xy);
        const need = checkFfiCode(e.wasm_vector_simplify_rdp(pIn, n, epsilon, 0, 0), "simplifyPolylineRdp:size");
        if (need === 0) return new Float32Array(0);
        const pOut = a.f32Zero(need * 2);
        const got = checkFfiCode(e.wasm_vector_simplify_rdp(pIn, n, epsilon, pOut, need), "simplifyPolylineRdp");
        return new Float32Array(e.memory.buffer, pOut, got * 2).slice();
      });
    },

    smoothPolylineChaikin(xy, iterations, closed = false, ratio = 0.25) {
      return withArena((a) => {
        const n = xy.length >> 1;
        const pIn = a.f32(xy);
        const cFlag = closed ? 1 : 0;
        const need = checkFfiCode(
          e.wasm_vector_smooth_chaikin(pIn, n, iterations, cFlag, ratio, 0, 0),
          "smoothPolylineChaikin:size",
        );
        if (need === 0) return new Float32Array(0);
        const pOut = a.f32Zero(need * 2);
        const got = checkFfiCode(
          e.wasm_vector_smooth_chaikin(pIn, n, iterations, cFlag, ratio, pOut, need),
          "smoothPolylineChaikin",
        );
        return new Float32Array(e.memory.buffer, pOut, got * 2).slice();
      });
    },

    flattenCubicBezier(ctrlXy, tolerance) {
      if (ctrlXy.length !== 8) throw new RangeError("ctrlXy must have length 8");
      return withArena((a) => {
        const pCtrl = a.f32(ctrlXy);
        const need = checkFfiCode(
          e.wasm_vector_flatten_bezier_arc_len(pCtrl, tolerance, 0, 0, 0),
          "flattenCubicBezier:size",
        );
        const pXy = a.f32Zero(need * 2);
        const pArc = a.f32Zero(need);
        const got = checkFfiCode(
          e.wasm_vector_flatten_bezier_arc_len(pCtrl, tolerance, pXy, pArc, need),
          "flattenCubicBezier",
        );
        const pointsXy = new Float32Array(e.memory.buffer, pXy, got * 2).slice();
        const arcLengths = new Float32Array(e.memory.buffer, pArc, got).slice();
        return {
          pointsXy,
          arcLengths,
          pointCount: got,
          totalLength: got > 0 ? (arcLengths[got - 1] ?? 0) : 0,
          backend: meta.backend,
        };
      });
    },

    expandVariableWidthStroke(spineXyw, join: StrokeJoinStyleName = "miter", miterLimit = 4) {
      return withArena((a) => {
        const pts = Math.floor(spineXyw.length / 3);
        const pIn = a.f32(spineXyw);
        const jc = joinStyleCode(join);
        const need = checkFfiCode(
          e.wasm_vector_expand_stroke_outline(pIn, pts, jc, miterLimit, 0, 0),
          "expandVariableWidthStroke:size",
        );
        if (need === 0) return { polygonXy: new Float32Array(0), vertexCount: 0, backend: meta.backend };
        const pOut = a.f32Zero(need * 2);
        const got = checkFfiCode(
          e.wasm_vector_expand_stroke_outline(pIn, pts, jc, miterLimit, pOut, need),
          "expandVariableWidthStroke",
        );
        return {
          polygonXy: new Float32Array(e.memory.buffer, pOut, got * 2).slice(),
          vertexCount: got,
          backend: meta.backend,
        };
      });
    },

    hitTestPolygonBatch(polyXy, queriesXy, rule: WindingFillRuleName = "nonzero") {
      return withArena((a) => {
        const np = polyXy.length >> 1;
        const nq = queriesXy.length >> 1;
        const pPoly = a.f32(polyXy);
        const pQ = a.f32(queriesXy);
        const pOut = a.u8Zero(nq);
        const hitCount = checkFfiCode(
          e.wasm_vector_hit_test_batch(pPoly, np, pQ, nq, fillRuleCode(rule), pOut),
          "hitTestPolygonBatch",
        );
        return {
          hits: nq === 0 ? new Uint8Array(0) : new Uint8Array(e.memory.buffer, pOut, nq).slice(),
          hitCount,
          backend: meta.backend,
        };
      });
    },

    planWebtoonSmartSlices(rgba, width, height, config: Wave3SliceConfig = {}) {
      return withArena((a) => {
        const pImg = a.u8(rgba);
        const pCfg = a.f32(
          new Float32Array([
            config.targetHeight ?? 1280,
            config.minHeight ?? 640,
            config.maxHeight ?? 2000,
            config.searchWindow ?? 240,
            config.inkL1Threshold ?? 28,
            config.continuityWeight ?? 4.0,
          ]),
        );
        const nSpans = checkFfiCode(
          e.wasm_webtoon_plan_smart_slices(pImg, width, height, pCfg, 0, 0),
          "planWebtoonSmartSlices:size",
        );
        const pOut = a.f32Zero(nSpans * 5);
        const got = checkFfiCode(
          e.wasm_webtoon_plan_smart_slices(pImg, width, height, pCfg, pOut, nSpans),
          "planWebtoonSmartSlices",
        );
        const raw = new Float32Array(e.memory.buffer, pOut, got * 5);
        const spans: Wave3SliceSpan[] = [];
        for (let i = 0; i < got; i += 1) {
          const b = i * 5;
          spans.push({
            startY: Math.round(raw[b] ?? 0),
            endY: Math.round(raw[b + 1] ?? 0),
            height: Math.round(raw[b + 2] ?? 0),
            cutCost: raw[b + 3] ?? 0,
            isCleanGutter: (raw[b + 4] ?? 0) >= 0.5,
          });
        }
        return { spans, backend: meta.backend };
      });
    },

    dedupTilesFnv64(rgba, width, height, tileSize) {
      return withArena((a) => {
        const tilesX = Math.ceil(width / tileSize);
        const tilesY = Math.ceil(height / tileSize);
        const cap = tilesX * tilesY;
        const pImg = a.u8(rgba);
        const pSum = a.u32Zero(8);
        const pEnt = a.u64Zero(cap * 2);
        const total = checkFfiCode(
          e.wasm_webtoon_dedup_tiles_fnv64(pImg, width, height, tileSize, pSum, pEnt, cap),
          "dedupTilesFnv64",
        );
        const sum = new Uint32Array(e.memory.buffer, pSum, 8);
        const rawEnt = new BigUint64Array(e.memory.buffer, pEnt, total * 2);
        const entries: Wave3TileDedupEntry[] = [];
        for (let i = 0; i < total; i += 1) {
          const fnv1a64 = rawEnt[i * 2] ?? 0n;
          const packed = rawEnt[i * 2 + 1] ?? 0n;
          entries.push({
            tileIndex: i,
            fnv1a64,
            canonicalTileIndex: Number(packed & 0xffffffffn),
            tileClass: decodeTileClass(Number((packed >> 32n) & 0xffn)),
            tileWidth: Number((packed >> 40n) & 0xfffn),
            tileHeight: Number((packed >> 52n) & 0xfffn),
          });
        }
        const duplicateTiles = sum[4] ?? 0;
        return {
          tilesX: sum[0] ?? 0,
          tilesY: sum[1] ?? 0,
          totalTiles: sum[2] ?? total,
          uniqueTiles: sum[3] ?? 0,
          duplicateTiles,
          emptyTransparentTiles: sum[5] ?? 0,
          solidColorTiles: sum[6] ?? 0,
          contentTiles: sum[7] ?? 0,
          dedupRatio: total > 0 ? duplicateTiles / total : 0,
          entries,
          backend: meta.backend,
        };
      });
    },

    srgbToDisplayP3(rgba) {
      return withArena((a) => {
        const px = rgba.length >> 2;
        if (px === 0) return new Float32Array(0);
        const pSrc = a.u8(rgba);
        const pDst = a.f32Zero(rgba.length);
        checkFfiCode(e.wasm_color_srgb_to_p3_batch(pSrc, pDst, px), "srgbToDisplayP3");
        return new Float32Array(e.memory.buffer, pDst, rgba.length).slice();
      });
    },

    displayP3ToSrgb(p3Rgba) {
      return withArena((a) => {
        const px = p3Rgba.length >> 2;
        if (px === 0) return new Uint8Array(0);
        const pSrc = a.f32(p3Rgba);
        const pDst = a.u8Zero(p3Rgba.length);
        checkFfiCode(e.wasm_color_p3_to_srgb_batch(pSrc, pDst, px), "displayP3ToSrgb");
        return new Uint8Array(e.memory.buffer, pDst, p3Rgba.length).slice();
      });
    },

    rgbaToCmykTac(rgba, options: Wave3CmykTacOptions = {}) {
      return withArena((a) => {
        const px = rgba.length >> 2;
        const pSrc = a.u8(rgba);
        const pDst = a.u8Zero(rgba.length);
        const pCfg = a.f32(
          new Float32Array([
            options.gcrStrength ?? 0.8,
            options.ucrStart ?? 0,
            options.maxK ?? 0.95,
            options.tacLimitPct ?? 300,
          ]),
        );
        const pSt = a.f32Zero(2);
        const done = checkFfiCode(
          e.wasm_color_rgba_to_cmyk_tac_batch(pSrc, pDst, px, pCfg, pSt),
          "rgbaToCmykTac",
        );
        const st = new Float32Array(e.memory.buffer, pSt, 2);
        return {
          cmyk: px === 0 ? new Uint8Array(0) : new Uint8Array(e.memory.buffer, pDst, rgba.length).slice(),
          pixelCount: done,
          clampedPixels: Math.round(st[0] ?? 0),
          maxTacPct: st[1] ?? 0,
          backend: meta.backend,
        };
      });
    },

    extractPaletteMedianCut(rgba, maxColors = 16, alphaThreshold = 128) {
      return withArena((a) => {
        const px = rgba.length >> 2;
        const pSrc = a.u8(rgba);
        const pSw = a.u32Zero(maxColors * 2);
        const count = checkFfiCode(
          e.wasm_color_extract_palette_median_cut(pSrc, px, maxColors, alphaThreshold, pSw),
          "extractPaletteMedianCut",
        );
        const raw = new Uint32Array(e.memory.buffer, pSw, count * 2);
        let total = 0;
        for (let i = 0; i < count; i += 1) total += raw[i * 2 + 1] ?? 0;
        const swatches: Wave3PaletteSwatch[] = [];
        for (let i = 0; i < count; i += 1) {
          const packed = raw[i * 2] ?? 0;
          const cnt = raw[i * 2 + 1] ?? 0;
          swatches.push({
            r: packed & 0xff,
            g: (packed >>> 8) & 0xff,
            b: (packed >>> 16) & 0xff,
            count: cnt,
            coverage: total > 0 ? cnt / total : 0,
          });
        }
        return { swatches, backend: meta.backend };
      });
    },

    dispose() {
      disposed = true;
    },
  };
}
