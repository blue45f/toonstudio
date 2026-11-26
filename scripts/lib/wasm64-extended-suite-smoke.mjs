import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { runWave3Smoke } from "./wasm64-wave3-smoke.mjs";

const EXPECTED_EXTENDED_3D_CAPABILITIES = 0x3f;
const EXPECTED_ATELIER_STAGE_CAPABILITIES = 0x07;
const EXPECTED_EXTENDED_SUITE_CAPABILITIES = 0x7ffff;
const EXPECTED_WAVE2_CAPABILITIES = 0x1f;
/** 선형 메모리 할당 추적기 (모든 테스트 종료 시 누수 0건 해제). */
function createArena(e) {
  const allocs = [];
  return {
    u8(values) {
      const ptr = e.wasm_alloc(values.length);
      assert.ok(ptr > 0, "wasm_alloc(u8) failed");
      allocs.push([ptr, values.length]);
      new Uint8Array(e.memory.buffer, ptr, values.length).set(values);
      return ptr;
    },
    u8Zero(len) {
      const ptr = e.wasm_alloc(len);
      assert.ok(ptr > 0, "wasm_alloc(u8Zero) failed");
      allocs.push([ptr, len]);
      new Uint8Array(e.memory.buffer, ptr, len).fill(0);
      return ptr;
    },
    u16(values) {
      const bytes = values.length * 2;
      const ptr = e.wasm_alloc(bytes);
      assert.ok(ptr > 0, "wasm_alloc(u16) failed");
      allocs.push([ptr, bytes]);
      new Uint16Array(e.memory.buffer, ptr, values.length).set(values);
      return ptr;
    },
    u32(values) {
      const bytes = values.length * 4;
      const ptr = e.wasm_alloc(bytes);
      assert.ok(ptr > 0, "wasm_alloc(u32) failed");
      allocs.push([ptr, bytes]);
      new Uint32Array(e.memory.buffer, ptr, values.length).set(values);
      return ptr;
    },
    u64Zero(count) {
      const bytes = count * 8;
      const ptr = e.wasm_alloc(bytes);
      assert.ok(ptr > 0, "wasm_alloc(u64Zero) failed");
      allocs.push([ptr, bytes]);
      new BigUint64Array(e.memory.buffer, ptr, count).fill(0n);
      return ptr;
    },
    f32(values) {
      const bytes = values.length * 4;
      const ptr = e.wasm_alloc(bytes);
      assert.ok(ptr > 0, "wasm_alloc(f32) failed");
      allocs.push([ptr, bytes]);
      new Float32Array(e.memory.buffer, ptr, values.length).set(values);
      return ptr;
    },
    freeAll() {
      for (const [ptr, len] of allocs) {
        e.wasm_free(ptr, len);
      }
      allocs.length = 0;
    },
  };
}

function measure(name, fn) {
  const t0 = performance.now();
  const result = fn();
  const ms = Number((performance.now() - t0).toFixed(3));
  return { name, ms, result };
}

export function runCoreHotpathSmoke(e) {
  const arena = createArena(e);
  const timings = {};
  try {
    // 1) KM / KM16 스칼라 & 스트립 + 종이 높이
    const kmPacked = e.wasm_mix_pigments_km_packed(0xffff0000, 0xff00ffff, 0.5);
    assert.ok(kmPacked !== 0);
    const km16Packed = e.wasm_mix_pigments_km16_packed(0xffff2020, 0xff20ffff, 0.5);
    assert.ok(km16Packed !== 0);
    const hVal = e.wasm_sample_world_paper_height(12.5, 34.25, 0.08, 42);
    assert.ok(Number.isFinite(hVal) && hVal >= 0 && hVal <= 1);

    const w = 64;
    const h = 64;
    const pxCount = w * h;
    const rgbaBytes = pxCount * 4;
    const srcArr = new Uint8Array(rgbaBytes);
    const dstArr = new Uint8Array(rgbaBytes);
    for (let i = 0; i < pxCount; i++) {
      srcArr[i * 4] = (i * 7) & 255;
      srcArr[i * 4 + 1] = (i * 13) & 255;
      srcArr[i * 4 + 2] = 200;
      srcArr[i * 4 + 3] = 255;
      dstArr[i * 4] = 240;
      dstArr[i * 4 + 1] = 240;
      dstArr[i * 4 + 2] = 240;
      dstArr[i * 4 + 3] = 255;
    }

    const srcPtr = arena.u8(srcArr);
    const dstPtr = arena.u8(dstArr);
    const outPtr = arena.u8Zero(rgbaBytes);
    const heightPtr = arena.f32(Float32Array.from({ length: pxCount }, (_, i) => ((i % w) / w) * 0.5));

    timings.km16_strip_4096px_ms = measure("km16_strip", () => {
      assert.equal(e.wasm_mix_pigments_km16_strip(dstPtr, srcPtr, pxCount, 0.5), pxCount);
    }).ms;

    timings.gaussian_blur_64x64_ms = measure("gaussian_blur", () => {
      assert.equal(e.wasm_gaussian_blur_rgba(srcPtr, 0, outPtr, w, h, 2.0), pxCount);
    }).ms;

    timings.unsharp_mask_64x64_ms = measure("unsharp_mask", () => {
      assert.ok(e.wasm_unsharp_mask_rgba(srcPtr, outPtr, w, h, 1.5, 1.0, 2) >= 0);
    }).ms;

    timings.impasto_lighting_64x64_ms = measure("impasto", () => {
      assert.equal(e.wasm_apply_impasto_lighting_rgba(outPtr, heightPtr, w, h, 0), pxCount);
    }).ms;

    timings.tactile_bristle_ms = measure("tactile_bristle", () => {
      assert.ok(e.wasm_stamp_tactile_bristle(outPtr, heightPtr, w, h, 0, 0xff2244aa, 8, 7, 0) > 0);
    }).ms;

    timings.composite_tile_64x64_ms = measure("composite_tile", () => {
      assert.equal(e.wasm_composite_tile_dirty_rect(dstPtr, srcPtr, w, h, 0, 0, w, h, 1, 200), pxCount);
    }).ms;

    timings.xor_delta_and_fnv1a_ms = measure("xor_delta", () => {
      const changed = e.wasm_xor_tile_delta_bytes(srcPtr, dstPtr, outPtr, rgbaBytes);
      assert.ok(changed > 0);
      const hash = e.wasm_fnv1a_checksum(outPtr, rgbaBytes) >>> 0;
      assert.ok(hash !== 0);
    }).ms;

    return timings;
  } finally {
    arena.freeAll();
  }
}

function buildSyntheticPsbBytes(width, height) {
  const buf = new Uint8Array(46);
  const dv = new DataView(buf.buffer);
  buf.set([0x38, 0x42, 0x50, 0x53], 0); // "8BPS"
  dv.setUint16(4, 2, false); // PSB v2
  dv.setUint16(12, 4, false); // 4 channels
  dv.setUint32(14, height, false);
  dv.setUint32(18, width, false);
  dv.setUint16(22, 8, false); // 8-bit
  dv.setUint16(24, 3, false); // RGB
  dv.setUint32(26, 0, false); // Color mode data len
  dv.setUint32(30, 4, false); // Image resources len
  buf.set([1, 2, 3, 4], 34);
  dv.setBigUint64(38, 128n, false); // Layer & mask len
  return buf;
}

export function runExtendedSuiteSmoke(e) {
  const arena = createArena(e);
  const timings = {};
  try {
    // Capability bitmasks
    assert.equal(Number(e.wasm_extended_3d_capabilities()), EXPECTED_EXTENDED_3D_CAPABILITIES);
    assert.equal(Number(e.wasm_atelier_stage_3d_capabilities()), EXPECTED_ATELIER_STAGE_CAPABILITIES);
    assert.equal(Number(e.wasm_extended_capabilities()), EXPECTED_EXTENDED_SUITE_CAPABILITIES);
    assert.equal(Number(e.wasm_wave2_capabilities()), EXPECTED_WAVE2_CAPABILITIES);

    // 1) Morton 2D/3D
    assert.equal(e.wasm_encode_morton_2d_u32(3, 5) >>> 0, 0b100111);
    assert.equal(e.wasm_encode_morton_3d_u32(1, 2, 4) >>> 0, 0b100010001);

    // 2) VRM 4-bone SoA Skinning
    const vCount = 16;
    const inPos = arena.f32(new Float32Array(vCount * 3).fill(1.0));
    const inNorm = arena.f32(Float32Array.from({ length: vCount * 3 }, (_, i) => (i < vCount ? 1 : 0)));
    const joints = arena.u16(new Uint16Array(vCount * 4));
    const weights = arena.f32(Float32Array.from({ length: vCount * 4 }, (_, i) => (i < vCount ? 1 : 0)));
    const idMat = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const bones = arena.f32(idMat);
    const outPos = arena.f32(new Float32Array(vCount * 3));
    const outNorm = arena.f32(new Float32Array(vCount * 3));
    timings.vrm_skinning_16v_ms = measure("vrm_skinning", () => {
      assert.equal(
        e.wasm_skin_vrm_mesh_4bone_soa(inPos, inNorm, joints, weights, bones, outPos, outNorm, vCount, 1),
        vCount,
      );
    }).ms;

    // 3) G-Buffer LT LineArt
    const ltW = 16;
    const ltH = 16;
    const ltN = ltW * ltH;
    const normXyz = new Float32Array(ltN * 3);
    const depthArr = new Float32Array(ltN).fill(1.0);
    for (let y = 0; y < ltH; y++) {
      for (let x = 0; x < ltW; x++) {
        const idx = y * ltW + x;
        normXyz[2 * ltN + idx] = 1.0;
        if (x >= 4 && x <= 11 && y >= 4 && y <= 11) depthArr[idx] = 0.2;
      }
    }
    const ltNormPtr = arena.f32(normXyz);
    const ltDepthPtr = arena.f32(depthArr);
    const ltOutPtr = arena.u8Zero(ltN);
    timings.lt_lineart_16x16_ms = measure("lt_lineart", () => {
      const inkPx = e.wasm_extract_lt_lineart_from_gbuffer(ltNormPtr, ltDepthPtr, ltOutPtr, ltW, ltH, 0);
      assert.ok(inkPx > 0);
    }).ms;

    // 4) AtelierStage Frustum + Hi-Z Culling
    const vpPtr = arena.f32(idMat);
    const camPtr = arena.f32(new Float32Array([0, 0, 2, 10, 25, 50, 0]));
    const aabbsPtr = arena.f32(new Float32Array([-0.2, -0.2, -0.2, 0.2, 0.2, 0.2, 0]));
    const visIdxPtr = arena.u32(new Uint32Array(1));
    const visLodPtr = arena.u8Zero(1);
    const cullStatsPtr = arena.u32(new Uint32Array(4));
    timings.stage_frustum_hiz_ms = measure("stage_cull", () => {
      assert.equal(
        e.wasm_cull_stage_frustum_hiz(vpPtr, camPtr, aabbsPtr, 1, visIdxPtr, visLodPtr, cullStatsPtr),
        1,
      );
    }).ms;

    // 5) AtelierStage Sphere Overlaps
    const spheresPtr = arena.f32(new Float32Array([0, 0, 0, 1, 1, 0.5, 0, 0, 1, 1]));
    timings.stage_sphere_overlaps_ms = measure("sphere_overlaps", () => {
      assert.ok(e.wasm_resolve_stage_sphere_overlaps(spheresPtr, 2, 2.0, 4, 0.8) >= 1);
    }).ms;

    // 6) AtelierStage Acoustics & Lighting
    const listenerPtr = arena.f32(new Float32Array([0, 0, 0, 0, 0, -1, 0, 1, 0, 1800, 0.02]));
    const audioSrcPtr = arena.f32(new Float32Array([2, 0, -3, 1.0, 1.0, 30.0, 0.0]));
    const lightsPtr = arena.f32(new Float32Array([0, 0, 5, 5, 1, 1, 1, 2.0, 10.0]));
    const castPtr = arena.f32(new Float32Array([0, 0, 0, 0, 1, 0, 2.0, 0.5]));
    const outAudioPtr = arena.f32(new Float32Array(6));
    const outLightPtr = arena.f32(new Float32Array(8));
    timings.stage_acoustics_lighting_ms = measure("stage_acoustics", () => {
      assert.equal(
        e.wasm_evaluate_stage_acoustics_and_lighting(
          listenerPtr,
          audioSrcPtr,
          lightsPtr,
          castPtr,
          1,
          1,
          1,
          outAudioPtr,
          outLightPtr,
        ),
        2,
      );
    }).ms;

    // 7) Verlet Spring Chains
    const vPos = arena.f32(new Float32Array([0, 1, 0]));
    const vPrev = arena.f32(new Float32Array([0, 1, 0]));
    const vMass = arena.f32(new Float32Array([1]));
    const vRest = arena.f32(new Float32Array([0]));
    timings.verlet_spring_ms = measure("verlet", () => {
      assert.equal(e.wasm_step_verlet_spring_chains_soa(vPos, vPrev, vMass, vRest, 0, 1, 0, 4, 0), 1);
    }).ms;

    // 8) Finger FABRIK IK
    const fJoints = arena.f32(new Float32Array(12));
    const fLens = arena.f32(new Float32Array([0.04, 0.03, 0.02]));
    const fTarget = arena.f32(new Float32Array([0, -0.04, 0.05]));
    timings.finger_fabrik_ik_ms = measure("fabrik", () => {
      assert.ok(e.wasm_solve_finger_fabrik_chain(fJoints, fLens, fTarget, 24, 0) >= 0);
    }).ms;

    // 9) Foley Biquad DSP (128-frame AudioWorklet block)
    const mono = arena.f32(Float32Array.from({ length: 128 }, (_, i) => Math.sin((2 * Math.PI * i) / 32) * 0.5));
    const left = arena.f32(new Float32Array(128));
    const right = arena.f32(new Float32Array(128));
    const dspState = arena.f32(new Float32Array([0, 0, 0, 0, 1]));
    timings.foley_biquad_128f_ms = measure("foley_dsp", () => {
      assert.equal(e.wasm_render_foley_biquad_block(mono, left, right, dspState, 128, 0, 0), 128);
    }).ms;

    // 10) MLS Rigid Mesh Warp
    const mlsVerts = arena.f32(new Float32Array([0, 0, 10, 0, 10, 10]));
    const mlsPins = arena.f32(new Float32Array([0, 0, 0, 0, 1, 10, 0, 0, 10, 1]));
    const mlsOut = arena.f32(new Float32Array(6));
    timings.mls_rigid_warp_ms = measure("mls_warp", () => {
      assert.equal(e.wasm_warp_mesh_rigid_mls(mlsVerts, 3, mlsPins, 2, 1.0, mlsOut), 3);
      const out = new Float32Array(e.memory.buffer, mlsOut, 6);
      assert.ok(Math.abs(out[4] - -10) < 1e-2 && Math.abs(out[5] - 10) < 1e-2);
    }).ms;

    // 11) Cubic Bezier Stroke Vectorizer
    const strokePts = [];
    for (let i = 0; i < 32; i++) {
      const t = i / 31;
      strokePts.push(t * 120, Math.sin(t * Math.PI) * 30, 0.6);
    }
    const strokePtr = arena.f32(new Float32Array(strokePts));
    const vecStatsPtr = arena.f32(new Float32Array(3));
    const neededSegs = e.wasm_vectorize_stroke_cubic(strokePtr, 32, 0.3, 1.0, 0, 0, vecStatsPtr);
    assert.ok(neededSegs >= 1);
    const vecSegPtr = arena.f32(new Float32Array(neededSegs * 10));
    timings.vectorize_stroke_32pt_ms = measure("vectorize", () => {
      assert.equal(
        e.wasm_vectorize_stroke_cubic(strokePtr, 32, 0.3, 1.0, vecSegPtr, neededSegs, vecStatsPtr),
        neededSegs,
      );
    }).ms;

    // 12) Streaming PSD/PSB Header Parser
    const psbBytes = buildSyntheticPsbBytes(40_000, 30_000);
    const psbPtr = arena.u8(psbBytes);
    const metaPtr = arena.u64Zero(16);
    timings.parse_psd_header_ms = measure("parse_psd", () => {
      assert.equal(e.wasm_parse_psd_header(psbPtr, psbBytes.length, metaPtr), 2);
      const meta = new BigUint64Array(e.memory.buffer, metaPtr, 16);
      assert.equal(meta[3], 40_000n);
      assert.equal(meta[4], 30_000n);
      assert.equal(meta[15], 1n); // requires_memory64
    }).ms;

    // 13) Flood Fill + Magic Wand + Marching Ants (64x64 enclosed box with 2px gap!)
    const cw = 64;
    const ch = 64;
    const cPx = cw * ch;
    const canvas = new Uint8Array(cPx * 4);
    canvas.fill(255);
    for (let x = 8; x <= 55; x++) {
      for (const y of [8, 55]) {
        const off = (y * cw + x) * 4;
        canvas[off] = 0;
        canvas[off + 1] = 0;
        canvas[off + 2] = 0;
      }
    }
    for (let y = 8; y <= 55; y++) {
      for (const x of [8, 55]) {
        if (x === 55 && (y === 30 || y === 31)) continue; // 2px gap!
        const off = (y * cw + x) * 4;
        canvas[off] = 0;
        canvas[off + 1] = 0;
        canvas[off + 2] = 0;
      }
    }
    const canvasPtr = arena.u8(canvas);
    const dirtyPtr = arena.u32(new Uint32Array(4));
    timings.flood_fill_64x64_gapclose_ms = measure("flood_fill", () => {
      const filled = e.wasm_flood_fill_rgba(canvasPtr, 0, cw, ch, 32, 32, 0xfffa8c14, 0, 1, dirtyPtr);
      // 46 x 46 = 2,116 interior pixels sealed with gap_closing_radius = 1
      assert.equal(filled, 46 * 46);
      const dr = new Uint32Array(e.memory.buffer, dirtyPtr, 4);
      assert.deepEqual(Array.from(dr), [9, 9, 46, 46]);
    }).ms;

    const maskPtr = arena.u8Zero(cPx);
    timings.magic_wand_64x64_ms = measure("magic_wand", () => {
      const sel = e.wasm_magic_wand_mask(canvasPtr, 0, maskPtr, cw, ch, 32, 32, 0, 0, 0, dirtyPtr);
      assert.equal(sel, 46 * 46);
    }).ms;

    timings.marching_ants_64x64_ms = measure("marching_ants", () => {
      const segCnt = e.wasm_extract_marching_ants_segments(maskPtr, cw, ch, 1, 0, 0);
      assert.equal(segCnt, 4);
      const segOut = arena.u32(new Uint32Array(segCnt * 4));
      assert.equal(e.wasm_extract_marching_ants_segments(maskPtr, cw, ch, 1, segOut, segCnt), 4);
    }).ms;

    // 14) OKLCH Batch Roundtrip (4,096 pixels)
    const oklchPtr = arena.f32(new Float32Array(cPx * 4));
    const backRgbaPtr = arena.u8Zero(cPx * 4);
    timings.oklch_roundtrip_4096px_ms = measure("oklch_roundtrip", () => {
      assert.equal(e.wasm_rgba_to_oklch_batch(canvasPtr, oklchPtr, cPx), cPx);
      assert.equal(e.wasm_oklch_to_rgba_batch(oklchPtr, backRgbaPtr, cPx), cPx);
      const orig = new Uint8Array(e.memory.buffer, canvasPtr, 16);
      const back = new Uint8Array(e.memory.buffer, backRgbaPtr, 16);
      for (let i = 0; i < 16; i++) {
        assert.ok(Math.abs(orig[i] - back[i]) <= 1);
      }
    }).ms;

    // 15) Print CMYK Batch (4,096 pixels)
    const cmykPtr = arena.u8Zero(cPx * 4);
    timings.cmyk_batch_4096px_ms = measure("cmyk_batch", () => {
      assert.equal(e.wasm_rgba_to_cmyk_batch(canvasPtr, cmykPtr, cPx, 0.75), cPx);
      const firstWhite = new Uint8Array(e.memory.buffer, cmykPtr, 4);
      assert.deepEqual(Array.from(firstWhite), [0, 0, 0, 0]);
    }).ms;

    // 16) Procedural Halftone Screentone (64x64)
    const htOutPtr = arena.u8Zero(cPx * 4);
    const htParamsPtr = arena.f32(new Float32Array([8.0, 45.0, 0.4, 0.06]));
    timings.halftone_64x64_ms = measure("halftone", () => {
      assert.equal(
        e.wasm_render_halftone_screentone(
          canvasPtr,
          htOutPtr,
          cw,
          ch,
          0,
          0xff000000,
          0xffffffff,
          htParamsPtr,
        ),
        cPx,
      );
    }).ms;

    // 17) Radial Liquify Brush (64x64)
    const liqOutPtr = arena.u8Zero(cPx * 4);
    const liqParamsPtr = arena.f32(new Float32Array([32.0, 32.0, 16.0, 0.85, 5.0, -3.0]));
    timings.liquify_64x64_ms = measure("liquify", () => {
      const aff = e.wasm_liquify_displace_rgba(canvasPtr, liqOutPtr, cw, ch, 0, liqParamsPtr, dirtyPtr);
      assert.ok(aff > 700);
    }).ms;

    // 18) Wave-2: PackBits RLE Encode & Decode (4,096 B 혼합 스캔라인 0-diff + 오버런 차단)
    const rleSrc = new Uint8Array(4096);
    for (let i = 0; i < rleSrc.length; i++) {
      rleSrc[i] = i % 64 < 48 ? (i >>> 6) & 255 : (i * 37) & 255;
    }
    const rleSrcPtr = arena.u8(rleSrc);
    const maxRleCap = e.wasm_packbits_rle_encode(rleSrcPtr, rleSrc.length, 0, 0);
    assert.ok(maxRleCap >= rleSrc.length);
    const rleEncPtr = arena.u8Zero(maxRleCap);
    const rleDecPtr = arena.u8Zero(rleSrc.length);
    timings.wave2_packbits_rle_4k_ms = measure("wave2_packbits_rle", () => {
      const encLen = e.wasm_packbits_rle_encode(rleSrcPtr, rleSrc.length, rleEncPtr, maxRleCap);
      assert.ok(encLen > 0 && encLen < rleSrc.length);
      const decLen = e.wasm_packbits_rle_decode(rleEncPtr, encLen, rleDecPtr, rleSrc.length);
      assert.equal(decLen, rleSrc.length);
      const decView = new Uint8Array(e.memory.buffer, rleDecPtr, rleSrc.length);
      for (let i = 0; i < rleSrc.length; i++) {
        assert.equal(decView[i], rleSrc[i]);
      }
      // 오버런 차단(-4) 확인
      const tinyPtr = arena.u8Zero(4);
      assert.equal(e.wasm_packbits_rle_decode(rleEncPtr, encLen, tinyPtr, 4), -4);
    }).ms;

    // 19) Wave-2: 3D SAH Triangle BVH Raycast (16x16 하이트필드 = 512 삼각형)
    const gn = 16;
    const gStride = gn + 1;
    const gVerts = new Float32Array(gStride * gStride * 3);
    for (let iz = 0; iz <= gn; iz++) {
      for (let ix = 0; ix <= gn; ix++) {
        const vi = (iz * gStride + ix) * 3;
        const x = ix * 0.25 - gn * 0.125;
        const z = iz * 0.25 - gn * 0.125;
        gVerts[vi] = x;
        gVerts[vi + 1] = Math.sin(x * 1.2) * Math.cos(z * 1.1) * 0.25;
        gVerts[vi + 2] = z;
      }
    }
    const gTris = gn * gn * 2;
    const gIdx = new Uint32Array(gTris * 3);
    let gi = 0;
    for (let iz = 0; iz < gn; iz++) {
      for (let ix = 0; ix < gn; ix++) {
        const a = iz * gStride + ix;
        const b = a + 1;
        const c = a + gStride;
        const d = c + 1;
        gIdx[gi++] = a;
        gIdx[gi++] = c;
        gIdx[gi++] = b;
        gIdx[gi++] = b;
        gIdx[gi++] = c;
        gIdx[gi++] = d;
      }
    }
    const bvhPosPtr = arena.f32(gVerts);
    const bvhIdxPtr = arena.u32(gIdx);
    const bvhRayPtr = arena.f32(new Float32Array([0.1, 3.0, -0.1, 0.0, -1.0, 0.0, 0.01, 20.0]));
    const bvhOutPtr = arena.f32(new Float32Array(12));
    timings.wave2_sah_bvh_512tri_raycast_ms = measure("wave2_sah_bvh", () => {
      const hit = e.wasm_raycast_mesh_sah_bvh_3d(
        bvhPosPtr,
        gStride * gStride,
        bvhIdxPtr,
        gTris,
        bvhRayPtr,
        1,
        bvhOutPtr,
      );
      assert.equal(hit, 1);
      const out = new Float32Array(e.memory.buffer, bvhOutPtr, 12);
      assert.ok(out[1] > 2.5 && out[1] < 3.5);
      assert.ok(out[8] > 0.5); // +Y normal
      assert.ok(out[11] > 0 && out[11] < 64); // SAH 프루닝 확인
    }).ms;

    // 20) Wave-2: Analytical 2-Bone IK (폴 벡터 + 소프트 과신전 + 바닥 접지 클램프)
    const twoBoneParamsPtr = arena.f32(
      new Float32Array([
        0.0, 0.9, 0.0, // root (hip)
        0.0, 0.5, 1.0, // pole (knee forward)
        0.0, -0.25, 0.0, // target (지하 → 바닥 접지 클램프 트리거)
        0.45, 0.45, // upper_len, lower_len
        0.98, 0.02, // soft_extension_ratio, min_bend_angle_rad
        0.0, 0.08, // floor_y, foot_sole_offset
      ]),
    );
    const twoBoneOutPtr = arena.f32(new Float32Array(12));
    timings.wave2_two_bone_ik_ms = measure("wave2_two_bone_ik", () => {
      const status = e.wasm_solve_two_bone_ik_3d(twoBoneParamsPtr, 1, twoBoneOutPtr);
      assert.equal(status, 1); // floor_clamped
      const out = new Float32Array(e.memory.buffer, twoBoneOutPtr, 12);
      assert.ok(Math.abs(out[4] - 0.08) < 1e-4);
      assert.ok(out[2] > 0.05); // +Z 무릎 굴곡 방향
    }).ms;

    // 21) Wave-2: Damped CCD Multi-Joint Spine IK (6관절 척추 + 바닥 여유 높이)
    const spineJointsPtr = arena.f32(
      new Float32Array([
        0.0, 0.9, 0.0,
        0.0, 1.05, 0.0,
        0.0, 1.2, 0.0,
        0.0, 1.35, 0.0,
        0.0, 1.47, 0.0,
        0.0, 1.6, 0.0,
      ]),
    );
    const spineTargetPtr = arena.f32(new Float32Array([0.3, 1.38, 0.22]));
    const spineParamsPtr = arena.f32(new Float32Array([1e-3, 0.35, 0.75, 0.65, 0.0, 0.05]));
    timings.wave2_ccd_spine_ik_6j_ms = measure("wave2_ccd_spine_ik", () => {
      const iters = e.wasm_solve_ccd_spine_ik_3d(
        spineJointsPtr,
        6,
        spineTargetPtr,
        48,
        1,
        spineParamsPtr,
      );
      assert.ok(iters > 0 && iters <= 48);
      const solved = new Float32Array(e.memory.buffer, spineJointsPtr, 18);
      const dx = solved[15] - 0.3;
      const dy = solved[16] - 1.38;
      const dz = solved[17] - 0.22;
      assert.ok(Math.hypot(dx, dy, dz) <= 2e-3);
    }).ms;

    Object.assign(timings, runWave3Smoke(e, arena, measure));

    return timings;
  } finally {
    arena.freeAll();
  }
}
