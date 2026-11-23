/**
 * WebGPU Compute WGSL 셰이더 3종 및 GPU Compute / Subgroups 기능 프로브.
 *
 * 1. `WGSL_GAP_CLOSE_MORPH_SHADER`: 선화 마스크에 대해 `radius_px (0~16px)` 원형 팽창(`gap_close_dilate`)과
 *    원본 선화 보존 침식(`gap_close_erode`)으로 열린 틈새를 병렬 봉합한다.
 * 2. `WGSL_JUMP_FLOOD_STEP_SHADER`: O(log N) 패스로 전 캔버스 최근접 시드/영역 경계 거리를 전파하는
 *    Jump Flooding Algorithm(`jump_flood_step`) 컴퓨트 셰이더.
 * 3. `WGSL_REGION_FLATTING_SHADER`: 봉합된 영역 ID와 팔레트 색상을 매핑하고 선화 경계 아래 1px
 *    Anti-Aliased Under-Stroke 트랩(`flatting_region_fill`)을 병렬 적용한다.
 */

export const WGSL_WORKGROUP_SIZE = 16;
export const MAX_WEBGPU_GAP_CLOSE_PX = 16;
export const EMPTY_JFA_COORD = 0xffffffff;

export const WGSL_GAP_CLOSE_MORPH_SHADER = /* wgsl */ `
struct GapCloseParams {
  width: u32,
  height: u32,
  radius_px: u32,
  pass_mode: u32,
};

@group(0) @binding(0) var<uniform> params: GapCloseParams;
@group(0) @binding(1) var<storage, read> src_mask: array<u32>;
@group(0) @binding(2) var<storage, read> orig_ink: array<u32>;
@group(0) @binding(3) var<storage, read_write> dst_mask: array<u32>;

@compute @workgroup_size(16, 16)
fn gap_close_dilate(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }

  let idx = gid.y * params.width + gid.x;
  if (src_mask[idx] != 0u) {
    dst_mask[idx] = 1u;
    return;
  }

  let r = i32(min(params.radius_px, 16u));
  if (r <= 0) {
    dst_mask[idx] = 0u;
    return;
  }

  let r_sq = r * r;
  let w = i32(params.width);
  let h = i32(params.height);
  let cx = i32(gid.x);
  let cy = i32(gid.y);
  var hit: u32 = 0u;

  for (var dy: i32 = -r; dy <= r; dy = dy + 1) {
    let ny = cy + dy;
    if (ny < 0 || ny >= h) {
      continue;
    }
    let dy_sq = dy * dy;
    let row_off = u32(ny) * params.width;
    for (var dx: i32 = -r; dx <= r; dx = dx + 1) {
      if (dx * dx + dy_sq > r_sq) {
        continue;
      }
      let nx = cx + dx;
      if (nx < 0 || nx >= w) {
        continue;
      }
      if (src_mask[row_off + u32(nx)] != 0u) {
        hit = 1u;
        break;
      }
    }
    if (hit != 0u) {
      break;
    }
  }

  dst_mask[idx] = hit;
}

@compute @workgroup_size(16, 16)
fn gap_close_erode(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }

  let idx = gid.y * params.width + gid.x;
  if (orig_ink[idx] != 0u) {
    dst_mask[idx] = 1u;
    return;
  }

  if (src_mask[idx] == 0u) {
    dst_mask[idx] = 0u;
    return;
  }

  let r = i32(min(params.radius_px, 16u));
  if (r <= 0) {
    dst_mask[idx] = src_mask[idx];
    return;
  }

  let r_sq = r * r;
  let w = i32(params.width);
  let h = i32(params.height);
  let cx = i32(gid.x);
  let cy = i32(gid.y);
  var all_solid: u32 = 1u;

  for (var dy: i32 = -r; dy <= r; dy = dy + 1) {
    let ny = cy + dy;
    let dy_sq = dy * dy;
    for (var dx: i32 = -r; dx <= r; dx = dx + 1) {
      if (dx * dx + dy_sq > r_sq) {
        continue;
      }
      let nx = cx + dx;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
        all_solid = 0u;
        break;
      }
      if (src_mask[u32(ny) * params.width + u32(nx)] == 0u) {
        all_solid = 0u;
        break;
      }
    }
    if (all_solid == 0u) {
      break;
    }
  }

  dst_mask[idx] = all_solid;
}
`.trim();

export const WGSL_JUMP_FLOOD_STEP_SHADER = /* wgsl */ `
struct JfaParams {
  width: u32,
  height: u32,
  step_size: u32,
  respect_ink_mask: u32,
};

struct JfaCell {
  coord: u32,
  label: u32,
};

@group(0) @binding(0) var<uniform> params: JfaParams;
@group(0) @binding(1) var<storage, read> src_cells: array<JfaCell>;
@group(0) @binding(2) var<storage, read_write> dst_cells: array<JfaCell>;
@group(0) @binding(3) var<storage, read> ink_mask: array<u32>;

const EMPTY_COORD: u32 = 0xffffffffu;

fn squared_dist(px: i32, py: i32, packed_coord: u32) -> u32 {
  if (packed_coord == EMPTY_COORD) {
    return 0xffffffffu;
  }
  let sx = i32(packed_coord & 0xffffu);
  let sy = i32(packed_coord >> 16u);
  let dx = px - sx;
  let dy = py - sy;
  return u32(dx * dx + dy * dy);
}

fn segment_blocked_by_ink(x0: i32, y0: i32, x1: i32, y1: i32) -> bool {
  let dx = abs(x1 - x0);
  let dy = abs(y1 - y0);
  let steps = max(dx, dy);
  if (steps == 0) {
    return false;
  }
  let sx = select(-1, 1, x1 >= x0);
  let sy = select(-1, 1, y1 >= y0);
  var cx = x0;
  var cy = y0;
  var err = dx - dy;
  let max_iter = min(steps * 2 + 2, 2048);

  for (var iter: i32 = 0; iter < max_iter; iter = iter + 1) {
    if (cx == x1 && cy == y1) {
      return false;
    }
    let e2 = err * 2;
    let step_x = e2 > -dy && cx != x1;
    let step_y = e2 < dx && cy != y1;
    if (step_x && step_y) {
      let nx = cx + sx;
      let ny = cy + sy;
      let side_x_ink = ink_mask[u32(cy) * params.width + u32(nx)] != 0u;
      let side_y_ink = ink_mask[u32(ny) * params.width + u32(cx)] != 0u;
      let diag_ink = ink_mask[u32(ny) * params.width + u32(nx)] != 0u;
      if (diag_ink || (side_x_ink && side_y_ink)) {
        return true;
      }
      err = err - dy + dx;
      cx = nx;
      cy = ny;
    } else if (step_x) {
      err = err - dy;
      cx = cx + sx;
      if (ink_mask[u32(cy) * params.width + u32(cx)] != 0u) {
        return true;
      }
    } else if (step_y) {
      err = err + dx;
      cy = cy + sy;
      if (ink_mask[u32(cy) * params.width + u32(cx)] != 0u) {
        return true;
      }
    }
  }
  return false;
}

@compute @workgroup_size(16, 16)
fn jump_flood_step(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }

  let idx = gid.y * params.width + gid.x;
  let current = src_cells[idx];
  if (params.respect_ink_mask != 0u && ink_mask[idx] != 0u) {
    dst_cells[idx] = current;
    return;
  }

  let px = i32(gid.x);
  let py = i32(gid.y);
  var best = current;
  var best_dist = squared_dist(px, py, current.coord);
  if (best_dist == 0u) {
    dst_cells[idx] = best;
    return;
  }

  let step = i32(max(params.step_size, 1u));
  let w = i32(params.width);
  let h = i32(params.height);

  for (var oy: i32 = -1; oy <= 1; oy = oy + 1) {
    let ny = py + oy * step;
    if (ny < 0 || ny >= h) {
      continue;
    }
    let row_off = u32(ny) * params.width;
    for (var ox: i32 = -1; ox <= 1; ox = ox + 1) {
      let nx = px + ox * step;
      if (nx < 0 || nx >= w) {
        continue;
      }
      let cand = src_cells[row_off + u32(nx)];
      if (cand.coord == EMPTY_COORD) {
        continue;
      }
      let d2 = squared_dist(px, py, cand.coord);
      let is_better_dist = d2 < best_dist;
      let is_tie_better =
        d2 == best_dist &&
        (cand.label < best.label || (cand.label == best.label && cand.coord < best.coord));
      if (is_better_dist || is_tie_better) {
        if (params.respect_ink_mask != 0u && segment_blocked_by_ink(px, py, nx, ny)) {
          continue;
        }
        best_dist = d2;
        best = cand;
      }
    }
  }

  dst_cells[idx] = best;
}
`.trim();

export const WGSL_REGION_FLATTING_SHADER = /* wgsl */ `
struct FlattingParams {
  width: u32,
  height: u32,
  palette_count: u32,
  trap_radius_px: u32,
};

@group(0) @binding(0) var<uniform> params: FlattingParams;
@group(0) @binding(1) var<storage, read> region_ids: array<u32>;
@group(0) @binding(2) var<storage, read> lineart_rgba: array<u32>;
@group(0) @binding(3) var<storage, read> palette_rgba: array<u32>;
@group(0) @binding(4) var<storage, read_write> out_flat_rgba: array<u32>;

fn is_stroke_or_aa_pixel(packed_rgba: u32) -> bool {
  let r = f32(packed_rgba & 0xffu);
  let g = f32((packed_rgba >> 8u) & 0xffu);
  let b = f32((packed_rgba >> 16u) & 0xffu);
  let a = f32((packed_rgba >> 24u) & 0xffu) / 255.0;
  let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  let paper_lum = 255.0 - a * (255.0 - lum);
  return paper_lum <= 240.0;
}

@compute @workgroup_size(16, 16)
fn flatting_region_fill(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }

  let idx = gid.y * params.width + gid.x;
  let rid = region_ids[idx];
  if (rid > 0u && rid < params.palette_count) {
    out_flat_rgba[idx] = palette_rgba[rid];
    return;
  }

  if (params.trap_radius_px == 0u || !is_stroke_or_aa_pixel(lineart_rgba[idx])) {
    out_flat_rgba[idx] = 0u;
    return;
  }

  let w = i32(params.width);
  let h = i32(params.height);
  let cx = i32(gid.x);
  let cy = i32(gid.y);
  var sum_r: u32 = 0u;
  var sum_g: u32 = 0u;
  var sum_b: u32 = 0u;
  var hits: u32 = 0u;

  for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
    let ny = cy + dy;
    if (ny < 0 || ny >= h) {
      continue;
    }
    let row_off = u32(ny) * params.width;
    for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
      if (dx == 0 && dy == 0) {
        continue;
      }
      let nx = cx + dx;
      if (nx < 0 || nx >= w) {
        continue;
      }
      let n_rid = region_ids[row_off + u32(nx)];
      if (n_rid > 0u && n_rid < params.palette_count) {
        let col = palette_rgba[n_rid];
        let weight = select(1u, 2u, dx == 0 || dy == 0);
        sum_r = sum_r + (col & 0xffu) * weight;
        sum_g = sum_g + ((col >> 8u) & 0xffu) * weight;
        sum_b = sum_b + ((col >> 16u) & 0xffu) * weight;
        hits = hits + weight;
      }
    }
  }

  if (hits == 0u) {
    out_flat_rgba[idx] = 0u;
    return;
  }

  let out_r = min(sum_r / hits, 255u);
  let out_g = min(sum_g / hits, 255u);
  let out_b = min(sum_b / hits, 255u);
  out_flat_rgba[idx] = out_r | (out_g << 8u) | (out_b << 16u) | (255u << 24u);
}
`.trim();

export type WgslFlattingShaderId =
  | "gap_close_morph"
  | "jump_flood_step"
  | "region_flatting";

export interface WgslFlattingShaderSpec {
  readonly id: WgslFlattingShaderId;
  readonly entryPoints: readonly string[];
  readonly workgroupSize: readonly [number, number, number];
  readonly bindingCount: number;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly source: string;
}

export const WGSL_FLATTING_SHADER_SPECS: readonly WgslFlattingShaderSpec[] = Object.freeze([
  Object.freeze({
    id: "gap_close_morph",
    entryPoints: Object.freeze(["gap_close_dilate", "gap_close_erode"]),
    workgroupSize: Object.freeze([WGSL_WORKGROUP_SIZE, WGSL_WORKGROUP_SIZE, 1] as const),
    bindingCount: 4,
    titleKo: "1단계 · 형태학적 틈새 봉합",
    titleEn: "Stage 1 · Morphological Gap Close",
    summaryKo: "0~16px 원형 팽창·침식으로 열린 선화 틈새를 병렬 봉합합니다.",
    summaryEn: "Seals open 0–16px lineart gaps in parallel with circular dilate and erode passes.",
    source: WGSL_GAP_CLOSE_MORPH_SHADER,
  }),
  Object.freeze({
    id: "jump_flood_step",
    entryPoints: Object.freeze(["jump_flood_step"]),
    workgroupSize: Object.freeze([WGSL_WORKGROUP_SIZE, WGSL_WORKGROUP_SIZE, 1] as const),
    bindingCount: 4,
    titleKo: "2단계 · Jump Flooding (JFA)",
    titleEn: "Stage 2 · Jump Flooding (JFA)",
    summaryKo: "O(log N) 핑퐁 패스로 최근접 영역 시드와 보로노이 경계를 전파합니다.",
    summaryEn: "Propagates nearest region seeds and Voronoi bisectors in O(log N) ping-pong passes.",
    source: WGSL_JUMP_FLOOD_STEP_SHADER,
  }),
  Object.freeze({
    id: "region_flatting",
    entryPoints: Object.freeze(["flatting_region_fill"]),
    workgroupSize: Object.freeze([WGSL_WORKGROUP_SIZE, WGSL_WORKGROUP_SIZE, 1] as const),
    bindingCount: 5,
    titleKo: "3단계 · 밑색 플랫팅 & 1px 트랩",
    titleEn: "Stage 3 · Region Flatting & 1px Trap",
    summaryKo: "영역 팔레트를 채우고 안티앨리어싱 선화 아래 1px 번짐 방지 트랩을 확장합니다.",
    summaryEn: "Applies region palette colors and extends a 1px anti-aliased under-stroke trap.",
    source: WGSL_REGION_FLATTING_SHADER,
  }),
]);

export interface WgslShaderContractInspection {
  readonly hasComputeAttribute: boolean;
  readonly hasWorkgroup16x16: boolean;
  readonly hasGroupZero: boolean;
  readonly bindingIndices: readonly number[];
  readonly entryPoints: readonly string[];
  readonly balancedBraces: boolean;
  readonly valid: boolean;
}

export function inspectWgslShaderContract(source: string): WgslShaderContractInspection {
  const hasComputeAttribute = /@compute\b/.test(source);
  const hasWorkgroup16x16 = /@workgroup_size\(\s*16\s*,\s*16(?:\s*,\s*1)?\s*\)/.test(source);
  const hasGroupZero = /@group\(\s*0\s*\)/.test(source);

  const bindingMatches = Array.from(source.matchAll(/@binding\(\s*(\d+)\s*\)/g));
  const bindingIndices = bindingMatches
    .map((m) => Number.parseInt(m[1] ?? "-1", 10))
    .filter((n) => Number.isInteger(n) && n >= 0);

  const entryMatches = Array.from(
    source.matchAll(/@compute[\s\S]*?fn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g),
  );
  const entryPoints = entryMatches
    .map((m) => m[1] ?? "")
    .filter((name) => name.length > 0);

  let depth = 0;
  let balanced = true;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth < 0) {
        balanced = false;
        break;
      }
    }
  }
  const balancedBraces = balanced && depth === 0;

  return {
    hasComputeAttribute,
    hasWorkgroup16x16,
    hasGroupZero,
    bindingIndices,
    entryPoints,
    balancedBraces,
    valid:
      hasComputeAttribute &&
      hasWorkgroup16x16 &&
      hasGroupZero &&
      bindingIndices.length > 0 &&
      entryPoints.length > 0 &&
      balancedBraces,
  };
}

export type WebGpuCapabilityReasonCode =
  | "ready"
  | "navigator_gpu_missing"
  | "adapter_unavailable"
  | "workgroup_limit_too_small"
  | "probe_error";

export interface WebGpuComputeCapabilities {
  readonly available: boolean;
  readonly hasNavigatorGpu: boolean;
  readonly adapterName: string;
  readonly architecture: string;
  readonly vendor: string;
  readonly supportsSubgroups: boolean;
  readonly supportsTimestampQuery: boolean;
  readonly maxComputeWorkgroupSizeX: number;
  readonly maxComputeWorkgroupSizeY: number;
  readonly maxComputeInvocationsPerWorkgroup: number;
  readonly maxStorageBufferBindingSize: number;
  readonly maxBufferSize: number;
  readonly recommendedBackend: "webgpu-compute" | "typed-array-fallback";
  readonly probeDurationMs: number;
  readonly reasonCode: WebGpuCapabilityReasonCode;
}

export interface ProbeWebGpuOptions {
  readonly gpu?: GPU | null;
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function resolveNavigatorGpu(overrideGpu?: GPU | null): GPU | null {
  if (overrideGpu !== undefined) return overrideGpu;
  if (typeof navigator === "undefined") return null;
  const navWithGpu = navigator as Navigator & { readonly gpu?: GPU };
  return navWithGpu.gpu ?? null;
}

function readAdapterInfoField(adapter: GPUAdapter, key: "description" | "architecture" | "vendor"): string {
  const info = (adapter as GPUAdapter & { readonly info?: Readonly<Record<string, unknown>> }).info;
  if (!info || typeof info !== "object") return "";
  const val = info[key];
  return typeof val === "string" ? val : "";
}

function hasAdapterFeature(adapter: GPUAdapter, featureName: string): boolean {
  const features = adapter.features as ReadonlySet<string> | undefined;
  return Boolean(features && typeof features.has === "function" && features.has(featureName));
}

function buildUnavailableCapabilities(
  hasNavigatorGpu: boolean,
  reasonCode: Exclude<WebGpuCapabilityReasonCode, "ready">,
  startedAt: number,
): WebGpuComputeCapabilities {
  return {
    available: false,
    hasNavigatorGpu,
    adapterName: "Fallback CPU",
    architecture: "typed-array",
    vendor: "local",
    supportsSubgroups: false,
    supportsTimestampQuery: false,
    maxComputeWorkgroupSizeX: 0,
    maxComputeWorkgroupSizeY: 0,
    maxComputeInvocationsPerWorkgroup: 0,
    maxStorageBufferBindingSize: 0,
    maxBufferSize: 0,
    recommendedBackend: "typed-array-fallback",
    probeDurationMs: Math.max(0, nowMs() - startedAt),
    reasonCode,
  };
}

/**
 * `navigator.gpu` 어댑터·`subgroups` 확장·Compute 한계치를 예외 없이 안전하게 프로브한다.
 */
export async function probeWebGpuComputeCapabilities(
  options?: ProbeWebGpuOptions,
): Promise<WebGpuComputeCapabilities> {
  const startedAt = nowMs();
  const gpu = resolveNavigatorGpu(options?.gpu);
  if (!gpu || typeof gpu.requestAdapter !== "function") {
    return buildUnavailableCapabilities(false, "navigator_gpu_missing", startedAt);
  }

  try {
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) {
      return buildUnavailableCapabilities(true, "adapter_unavailable", startedAt);
    }

    const limits = adapter.limits;
    const maxComputeWorkgroupSizeX = limits?.maxComputeWorkgroupSizeX ?? 0;
    const maxComputeWorkgroupSizeY = limits?.maxComputeWorkgroupSizeY ?? 0;
    const maxComputeInvocationsPerWorkgroup = limits?.maxComputeInvocationsPerWorkgroup ?? 0;
    const maxStorageBufferBindingSize = limits?.maxStorageBufferBindingSize ?? 0;
    const maxBufferSize = limits?.maxBufferSize ?? 0;

    const canDispatch =
      maxComputeWorkgroupSizeX >= WGSL_WORKGROUP_SIZE &&
      maxComputeWorkgroupSizeY >= WGSL_WORKGROUP_SIZE &&
      maxComputeInvocationsPerWorkgroup >= WGSL_WORKGROUP_SIZE * WGSL_WORKGROUP_SIZE &&
      maxStorageBufferBindingSize >= 1024 * 1024;

    const vendor = readAdapterInfoField(adapter, "vendor") || "webgpu";
    const architecture = readAdapterInfoField(adapter, "architecture") || "compute";
    const description = readAdapterInfoField(adapter, "description");
    const adapterName = description || `${vendor} ${architecture}`.trim();

    return {
      available: canDispatch,
      hasNavigatorGpu: true,
      adapterName,
      architecture,
      vendor,
      supportsSubgroups: hasAdapterFeature(adapter, "subgroups"),
      supportsTimestampQuery: hasAdapterFeature(adapter, "timestamp-query"),
      maxComputeWorkgroupSizeX,
      maxComputeWorkgroupSizeY,
      maxComputeInvocationsPerWorkgroup,
      maxStorageBufferBindingSize,
      maxBufferSize,
      recommendedBackend: canDispatch ? "webgpu-compute" : "typed-array-fallback",
      probeDurationMs: Math.max(0, nowMs() - startedAt),
      reasonCode: canDispatch ? "ready" : "workgroup_limit_too_small",
    };
  } catch {
    return buildUnavailableCapabilities(true, "probe_error", startedAt);
  }
}
