/**
 * WebAssembly `memory64` (`flags & 0x04 === 0x04`, `i64` 선형 메모리 주소 공간) 바이너리 섹션 검사기 및
 * Node V8 런타임 듀얼 주소 폭(`i64` BigInt / `i32` Number) FFI 어댑터.
 */

export const WASM_MEMORY64_FLAG = 0x04;

function readU32Leb128(bytes, startOffset) {
  let result = 0;
  let shift = 0;
  let offset = startOffset;
  while (offset < bytes.length && shift < 35) {
    const byte = bytes[offset] ?? 0;
    offset += 1;
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return [result >>> 0, offset];
    }
    shift += 7;
  }
  return null;
}

function readU64Leb128(bytes, startOffset) {
  let result = 0n;
  let shift = 0n;
  let offset = startOffset;
  while (offset < bytes.length && shift < 70n) {
    const byte = bytes[offset] ?? 0;
    offset += 1;
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return [result, offset];
    }
    shift += 7n;
  }
  return null;
}

function parseMemoryLimitsEntry(bytes, entryOffset, sectionEnd) {
  if (entryOffset >= sectionEnd) return null;
  const flagsRead = readU32Leb128(bytes, entryOffset);
  if (!flagsRead) return null;
  const [flags, afterFlags] = flagsRead;
  const hasMaximum = (flags & 0x01) !== 0;
  const isShared = (flags & 0x02) !== 0;
  const isMemory64 = (flags & WASM_MEMORY64_FLAG) === WASM_MEMORY64_FLAG;
  const initRead = readU64Leb128(bytes, afterFlags);
  if (!initRead) return null;
  const [initialPages, afterInit] = initRead;
  let maximumPages = null;
  if (hasMaximum) {
    const maxRead = readU64Leb128(bytes, afterInit);
    if (!maxRead) return null;
    maximumPages = maxRead[0];
  }
  return {
    flags,
    hasMaximum,
    isShared,
    isMemory64,
    addressBits: isMemory64 ? 64 : 32,
    initialPages,
    maximumPages,
  };
}

/**
 * `.wasm` 바이너리의 매직 헤더와 Section 5(Memory, 폴백으로 Section 2 Import Memory)를 파싱해
 * `memory64` (`flags & 0x04`) 활성화 여부를 바이트 단위로 판정한다.
 */
export function inspectWasmBinaryMemorySection(bytes) {
  const validWasmHeader =
    bytes.byteLength >= 8 &&
    bytes[0] === 0x00 &&
    bytes[1] === 0x61 &&
    bytes[2] === 0x73 &&
    bytes[3] === 0x6d &&
    bytes[4] === 0x01 &&
    bytes[5] === 0x00 &&
    bytes[6] === 0x00 &&
    bytes[7] === 0x00;

  if (!validWasmHeader) {
    return {
      validWasmHeader: false,
      hasMemorySection: false,
      memoryCount: 0,
      flags: null,
      isMemory64: false,
      hasMaximum: false,
      isShared: false,
      addressBits: 32,
      initialPages: null,
      maximumPages: null,
    };
  }

  let offset = 8;
  let importedMemoryEntry = null;

  while (offset < bytes.byteLength) {
    const sectionId = bytes[offset] ?? 0;
    offset += 1;
    const sizeRead = readU32Leb128(bytes, offset);
    if (!sizeRead) break;
    const [sectionSize, payloadStart] = sizeRead;
    const payloadEnd = payloadStart + sectionSize;
    if (payloadEnd > bytes.byteLength) break;

    if (sectionId === 5) {
      const countRead = readU32Leb128(bytes, payloadStart);
      if (countRead && countRead[0] >= 1) {
        const parsed = parseMemoryLimitsEntry(bytes, countRead[1], payloadEnd);
        if (parsed) {
          return {
            validWasmHeader: true,
            hasMemorySection: true,
            memoryCount: countRead[0],
            ...parsed,
          };
        }
      }
    } else if (sectionId === 2 && !importedMemoryEntry) {
      const countRead = readU32Leb128(bytes, payloadStart);
      if (countRead) {
        let p = countRead[1];
        for (let i = 0; i < countRead[0] && p < payloadEnd; i += 1) {
          const modRead = readU32Leb128(bytes, p);
          if (!modRead) break;
          p = modRead[1] + modRead[0];
          const nameRead = readU32Leb128(bytes, p);
          if (!nameRead) break;
          p = nameRead[1] + nameRead[0];
          const kind = bytes[p] ?? 255;
          p += 1;
          if (kind === 2) {
            importedMemoryEntry = parseMemoryLimitsEntry(bytes, p, payloadEnd);
            break;
          }
          break;
        }
      }
    }

    offset = payloadEnd;
  }

  if (importedMemoryEntry) {
    return {
      validWasmHeader: true,
      hasMemorySection: true,
      memoryCount: 1,
      ...importedMemoryEntry,
    };
  }

  return {
    validWasmHeader: true,
    hasMemorySection: false,
    memoryCount: 0,
    flags: null,
    isMemory64: false,
    hasMaximum: false,
    isShared: false,
    addressBits: 32,
    initialPages: null,
    maximumPages: null,
  };
}

/**
 * `crates/studio-wasm64-drawing-core` 전체 61개 C-ABI 함수 중
 * `wasm64-unknown-unknown`에서 `i64`로 매핑되는 포인터/`usize` 인자 인덱스 테이블.
 */
export const WASM64_PTR_PARAM_INDICES = Object.freeze({
  wasm_apply_impasto_lighting_rgba: [0, 1, 4],
  wasm_audio_biquad_eq_stereo: [0, 1, 4, 5],
  wasm_audio_mix_master_stereo: [0, 3, 4, 5, 6, 7],
  wasm_audio_resample_mono: [0, 2],
  wasm_audio_schroeder_reverb_stereo: [0, 1, 2, 3, 5],
  wasm_color_extract_palette_median_cut: [0, 4],
  wasm_color_p3_to_srgb_batch: [0, 1],
  wasm_color_rgba_to_cmyk_tac_batch: [0, 1, 3, 4],
  wasm_color_srgb_to_p3_batch: [0, 1],
  wasm_composite_tile_dirty_rect: [0, 1],
  wasm_cull_stage_frustum_hiz: [0, 1, 2, 4, 5, 6],
  wasm_evaluate_stage_acoustics_and_lighting: [0, 1, 2, 3, 7, 8],
  wasm_extract_lt_lineart_from_gbuffer: [0, 1, 2, 5],
  wasm_extract_marching_ants_segments: [0, 4],
  wasm_flood_fill_rgba: [0, 1, 9],
  wasm_fnv1a_checksum: [0],
  wasm_gaussian_blur_rgba: [0, 1, 2],
  wasm_liquify_displace_rgba: [0, 1, 5, 6],
  wasm_magic_wand_mask: [0, 1, 2, 10],
  wasm_mix_pigments_km16_strip: [0, 1],
  wasm_oklch_to_rgba_batch: [0, 1],
  wasm_packbits_rle_decode: [0, 2],
  wasm_packbits_rle_encode: [0, 2],
  wasm_parse_psd_header: [0, 2],
  wasm_raycast_mesh_sah_bvh_3d: [0, 2, 4, 6],
  wasm_render_foley_biquad_block: [0, 1, 2, 3, 6],
  wasm_render_halftone_screentone: [0, 1, 7],
  wasm_resolve_stage_sphere_overlaps: [0],
  wasm_rgba_to_cmyk_batch: [0, 1],
  wasm_rgba_to_oklch_batch: [0, 1],
  wasm_skin_vrm_mesh_4bone_soa: [0, 1, 2, 3, 4, 5, 6],
  wasm_solve_ccd_spine_ik_3d: [0, 2, 5],
  wasm_solve_finger_fabrik_chain: [0, 1, 2, 4],
  wasm_solve_two_bone_ik_3d: [0, 2],
  wasm_stamp_tactile_bristle: [0, 1, 8],
  wasm_step_verlet_spring_chains_soa: [0, 1, 2, 3, 4, 8],
  wasm_unsharp_mask_rgba: [0, 1],
  wasm_vector_expand_stroke_outline: [0, 4],
  wasm_vector_flatten_bezier_arc_len: [0, 2, 3],
  wasm_vector_hit_test_batch: [0, 2, 5],
  wasm_vector_simplify_rdp: [0, 3],
  wasm_vector_smooth_chaikin: [0, 5],
  wasm_vectorize_stroke_cubic: [0, 4, 6],
  wasm_warp_mesh_rigid_mls: [0, 2, 5],
  wasm_webtoon_dedup_tiles_fnv64: [0, 4, 5],
  wasm_webtoon_plan_smart_slices: [0, 3, 4],
  wasm_xor_tile_delta_bytes: [0, 1, 2],
});

function toI64Arg(val) {
  if (typeof val === "bigint") return val;
  if (!Number.isFinite(val) || val < 0) return 0n;
  return BigInt(Math.trunc(val));
}

function toSafeOffsetNumber(ptrBigInt) {
  if (ptrBigInt <= 0n) return 0;
  if (ptrBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`Wasm64 포인터가 JS 안전 정수 범위를 초과했습니다: ${ptrBigInt.toString()}`);
  }
  return Number(ptrBigInt);
}

/**
 * `memory64` (`i64`) 및 `wasm32` (`i32`) 인스턴스를 모두 래핑하여
 * TypedArray 뷰 오프셋 호환 숫자 포인터 ABI와 원시 `BigInt` 할당기를 동시에 제공한다.
 */
export function createDualWidthExportsAdapter(rawExports, isMemory64) {
  if (!isMemory64) {
    return {
      isMemory64: false,
      addressBits: 32,
      rawExports,
      allocBigInt: (byteLen) => BigInt(rawExports.wasm_alloc(Number(byteLen) >>> 0) >>> 0),
      freeBigInt: (ptr, byteLen) => rawExports.wasm_free(Number(ptr) >>> 0, Number(byteLen) >>> 0),
      exports: rawExports,
    };
  }

  const adapted = { memory: rawExports.memory };
  for (const [key, value] of Object.entries(rawExports)) {
    if (key === "memory" || typeof value !== "function") {
      adapted[key] = value;
      continue;
    }
    if (key === "wasm_alloc") {
      adapted[key] = (byteLen) => {
        const ptr = value(toI64Arg(byteLen));
        return toSafeOffsetNumber(typeof ptr === "bigint" ? ptr : BigInt(ptr >>> 0));
      };
      continue;
    }
    if (key === "wasm_free") {
      adapted[key] = (ptr, byteLen) => {
        value(toI64Arg(ptr), toI64Arg(byteLen));
      };
      continue;
    }
    const ptrIndices = WASM64_PTR_PARAM_INDICES[key];
    if (!ptrIndices || ptrIndices.length === 0) {
      adapted[key] = (...args) => value(...args.map((a) => Number(a)));
      continue;
    }
    const ptrSet = new Set(ptrIndices);
    adapted[key] = (...args) => {
      const marshaled = args.map((arg, idx) => (ptrSet.has(idx) ? toI64Arg(arg) : Number(arg)));
      return value(...marshaled);
    };
  }

  return {
    isMemory64: true,
    addressBits: 64,
    rawExports,
    allocBigInt: (byteLen) => rawExports.wasm_alloc(toI64Arg(byteLen)),
    freeBigInt: (ptr, byteLen) => rawExports.wasm_free(toI64Arg(ptr), toI64Arg(byteLen)),
    exports: Object.freeze(adapted),
  };
}
