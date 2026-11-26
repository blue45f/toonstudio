/**
 * 3D 멀티컷 샷 시퀀서 · WebGPU LT 변환 v2(실루엣/크리즈 + 셀 섀도우 스크린톤) ·
 * 240Hz 병합/예측 스타일러스 및 배럴-롤 엔진.
 *
 * - `ShotRailSequencer`: 단일 3D 스테이지 위에 최대 60컷의 카메라 레일·조명·LT 프리셋을
 *   저장하고 컷 간 보간 카메라 포즈와 뷰/투영 행렬을 생성한다.
 * - `WGSL_LT_CONVERSION_V2` & `extractLtLayersCpu`: Depth · Normal · Object-ID G-버퍼에서
 *   실루엣/크리즈 선화, 단계형 셀 섀도우, 45° 하프톤 스크린톤을 추출한다.
 * - `Stylus240HzPredictor`: 240Hz 병합·예측 포인터 샘플(필압·기울기·배럴-롤)을 처리해
 *   1~2 세그먼트 저지연 오버레이를 외삽하고, 확정 샘플 도착 시 잔상(ghost) 없이 교체한다.
 */

export const MAX_EPISODE_SHOTS = 60;
export const STYLUS_TARGET_HZ = 240;
export const STYLUS_DEFAULT_STEP_MS = 1000 / STYLUS_TARGET_HZ;

export type Vec3Tuple = readonly [number, number, number];
export type RailEasingMode = "linear" | "ease-in-out" | "cubic";

export interface ShotCameraRig {
  readonly position: Vec3Tuple; readonly target: Vec3Tuple; readonly up: Vec3Tuple;
  readonly fovDeg: number; readonly near: number; readonly far: number; readonly rollDeg?: number;
}

export interface ShotLightingRig {
  readonly keyDirection: Vec3Tuple; readonly ambientFloor: number;
  readonly shadowThreshold: number; readonly celBands: number;
}

export interface ShotLtProfile {
  readonly depthThreshold: number; readonly normalThreshold: number;
  readonly lineWidthPx: number; readonly halftonePitchPx: number; readonly halftoneAngleDeg: number;
}

export interface EpisodeCameraShot {
  readonly id: string; readonly cutNumber: number; readonly label: string;
  readonly camera: ShotCameraRig; readonly lighting: ShotLightingRig; readonly ltProfile: ShotLtProfile;
  readonly durationMs: number; readonly easing: RailEasingMode;
}

export interface InterpolatedRailPose {
  readonly fromShotId: string; readonly toShotId: string;
  readonly rawT: number; readonly easedT: number;
  readonly camera: ShotCameraRig; readonly lighting: ShotLightingRig;
  readonly viewMatrix: Float32Array;
}

function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function normalizeVec3(v: Vec3Tuple): Vec3Tuple {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len <= 1e-8 ? [0, 1, 0] : [v[0] / len, v[1] / len, v[2] / len];
}

function applyRailEasing(t: number, mode: RailEasingMode): number {
  const c = clamp(t, 0, 1);
  if (mode === "linear") return c;
  if (mode === "ease-in-out") return c * c * (3 - 2 * c);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/** 오른손 좌표계 열 우선 LookAt 뷰 행렬을 생성한다. */
export function buildShotViewMatrix(camera: ShotCameraRig): Float32Array {
  const [ex, ey, ez] = camera.position;
  const [tx, ty, tz] = camera.target;
  const [ux, uy, uz] = camera.up;

  let zx = ex - tx, zy = ey - ty, zz = ez - tz;
  const zLen = Math.hypot(zx, zy, zz) || 1;
  zx /= zLen; zy /= zLen; zz /= zLen;

  let xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx;
  const xLen = Math.hypot(xx, xy, xz);
  if (xLen <= 1e-6) { xx = 1; xy = 0; xz = 0; }
  else { xx /= xLen; xy /= xLen; xz /= xLen; }

  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  const out = new Float32Array(16);
  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * ex + xy * ey + xz * ez);
  out[13] = -(yx * ex + yy * ey + yz * ez);
  out[14] = -(zx * ex + zy * ey + zz * ez);
  out[15] = 1;
  return out;
}

/** 열 우선 원근 투영 행렬(NDC Z ∈ [-1, 1])을 생성한다. */
export function buildShotProjectionMatrix(fovDeg: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan((clamp(fovDeg, 5, 165) * Math.PI) / 360);
  const safeNear = Math.max(0.01, near);
  const safeFar = Math.max(safeNear + 0.1, far);
  const nf = 1 / (safeNear - safeFar);
  const out = new Float32Array(16);
  out[0] = f / Math.max(0.1, aspect);
  out[5] = f;
  out[10] = (safeFar + safeNear) * nf;
  out[11] = -1;
  out[14] = 2 * safeFar * safeNear * nf;
  return out;
}

/** 단일 3D 배경 스테이지를 공유하는 최대 60컷 에피소드 카메라 레일 시퀀서. */
export class ShotRailSequencer {
  readonly stageId: string;
  readonly maxShots: number;
  private readonly shots: EpisodeCameraShot[] = [];

  constructor(stageId: string, maxShots = MAX_EPISODE_SHOTS) {
    this.stageId = stageId;
    this.maxShots = clamp(Math.floor(maxShots), 1, MAX_EPISODE_SHOTS);
  }

  get shotCount(): number { return this.shots.length; }

  addShot(shot: Omit<EpisodeCameraShot, "cutNumber"> & { readonly cutNumber?: number }): EpisodeCameraShot {
    if (this.shots.length >= this.maxShots) {
      throw new Error(`단일 스테이지 최대 컷 수(${this.maxShots}컷)를 초과했습니다.`);
    }
    if (this.shots.some((existing) => existing.id === shot.id)) {
      throw new Error(`중복된 샷 ID입니다: ${shot.id}`);
    }
    this.shots.push({
      ...shot,
      cutNumber: shot.cutNumber ?? this.shots.length + 1,
      lighting: {
        ...shot.lighting,
        keyDirection: normalizeVec3(shot.lighting.keyDirection),
        celBands: clamp(Math.round(shot.lighting.celBands), 2, 5),
      },
    });
    this.reindexCutNumbers();
    return this.shots[this.shots.length - 1];
  }

  updateShot(id: string, patch: Partial<Omit<EpisodeCameraShot, "id">>): EpisodeCameraShot {
    const idx = this.shots.findIndex((s) => s.id === id);
    if (idx < 0) throw new Error(`존재하지 않는 샷 ID입니다: ${id}`);
    const cur = this.shots[idx];
    const nextLighting = patch.lighting
      ? {
          ...patch.lighting,
          keyDirection: normalizeVec3(patch.lighting.keyDirection),
          celBands: clamp(Math.round(patch.lighting.celBands), 2, 5),
        }
      : cur.lighting;
    this.shots[idx] = { ...cur, ...patch, id: cur.id, lighting: nextLighting };
    return this.shots[idx];
  }

  removeShot(id: string): boolean {
    const idx = this.shots.findIndex((s) => s.id === id);
    if (idx < 0) return false;
    this.shots.splice(idx, 1);
    this.reindexCutNumbers();
    return true;
  }

  reorderShot(id: string, targetIndex: number): readonly EpisodeCameraShot[] {
    const idx = this.shots.findIndex((s) => s.id === id);
    if (idx < 0) throw new Error(`존재하지 않는 샷 ID입니다: ${id}`);
    const [moved] = this.shots.splice(idx, 1);
    this.shots.splice(clamp(Math.floor(targetIndex), 0, this.shots.length), 0, moved);
    this.reindexCutNumbers();
    return this.listShots();
  }

  getShot(id: string): EpisodeCameraShot | undefined { return this.shots.find((s) => s.id === id); }
  listShots(): readonly EpisodeCameraShot[] { return [...this.shots]; }

  evaluateRailAt(indexA: number, indexB: number, t: number): InterpolatedRailPose {
    const a = this.shots[indexA], b = this.shots[indexB];
    if (!a || !b) throw new RangeError(`유효하지 않은 샷 레일 인덱스입니다: (${indexA}, ${indexB})`);
    const rawT = clamp(t, 0, 1);
    const easedT = applyRailEasing(rawT, a.easing);
    const camera: ShotCameraRig = {
      position: [
        lerp(a.camera.position[0], b.camera.position[0], easedT),
        lerp(a.camera.position[1], b.camera.position[1], easedT),
        lerp(a.camera.position[2], b.camera.position[2], easedT),
      ],
      target: [
        lerp(a.camera.target[0], b.camera.target[0], easedT),
        lerp(a.camera.target[1], b.camera.target[1], easedT),
        lerp(a.camera.target[2], b.camera.target[2], easedT),
      ],
      up: normalizeVec3([
        lerp(a.camera.up[0], b.camera.up[0], easedT),
        lerp(a.camera.up[1], b.camera.up[1], easedT),
        lerp(a.camera.up[2], b.camera.up[2], easedT),
      ]),
      fovDeg: lerp(a.camera.fovDeg, b.camera.fovDeg, easedT),
      near: lerp(a.camera.near, b.camera.near, easedT),
      far: lerp(a.camera.far, b.camera.far, easedT),
      rollDeg: lerp(a.camera.rollDeg ?? 0, b.camera.rollDeg ?? 0, easedT),
    };
    const lighting: ShotLightingRig = {
      keyDirection: normalizeVec3([
        lerp(a.lighting.keyDirection[0], b.lighting.keyDirection[0], easedT),
        lerp(a.lighting.keyDirection[1], b.lighting.keyDirection[1], easedT),
        lerp(a.lighting.keyDirection[2], b.lighting.keyDirection[2], easedT),
      ]),
      ambientFloor: lerp(a.lighting.ambientFloor, b.lighting.ambientFloor, easedT),
      shadowThreshold: lerp(a.lighting.shadowThreshold, b.lighting.shadowThreshold, easedT),
      celBands: easedT < 0.5 ? a.lighting.celBands : b.lighting.celBands,
    };
    return { fromShotId: a.id, toShotId: b.id, rawT, easedT, camera, lighting, viewMatrix: buildShotViewMatrix(camera) };
  }

  private reindexCutNumbers(): void {
    for (let i = 0; i < this.shots.length; i += 1) this.shots[i] = { ...this.shots[i], cutNumber: i + 1 };
  }
}

/* -------------------------------------------------------------------------- */
/* 2. WebGPU LT Conversion v2 (WGSL + Deterministic CPU Parity)               */
/* -------------------------------------------------------------------------- */

export interface LtGbufferInput {
  readonly width: number; readonly height: number;
  readonly depth: Float32Array; readonly normals: Float32Array; readonly objectIds: Uint32Array;
}

export interface LtExtractionOptions {
  readonly depthThreshold?: number; readonly normalThreshold?: number;
  readonly objectIdWeight?: number; readonly lightDirection?: Vec3Tuple;
  readonly celBands?: number; readonly halftonePitchPx?: number;
  readonly halftoneAngleDeg?: number; readonly lineGain?: number;
}

export interface LtExtractionMetrics {
  readonly silhouettePixels: number; readonly creasePixels: number;
  readonly lineArtPixels: number; readonly screentoneDotPixels: number;
  readonly celBandHistogram: readonly number[]; readonly elapsedMs: number;
}

export interface LtExtractedLayers {
  readonly width: number; readonly height: number;
  readonly silhouetteMask: Uint8Array; readonly creaseMask: Uint8Array;
  readonly combinedLineArt: Uint8Array; readonly celShadowBands: Uint8Array;
  readonly screentoneLayer: Uint8Array; readonly metrics: LtExtractionMetrics;
}

export interface WgslLtValidationResult {
  readonly valid: boolean; readonly hasComputeEntry: boolean; readonly hasWorkgroup16x16: boolean;
  readonly bindingCount: number; readonly balancedBraces: boolean; readonly errors: readonly string[];
}

export const WGSL_LT_CONVERSION_V2: string = /* wgsl */ `
struct LtV2Params {
  width: u32, height: u32, cel_bands: u32, pad0: u32,
  depth_threshold: f32, normal_threshold: f32, object_id_weight: f32, line_gain: f32,
  light_x: f32, light_y: f32, light_z: f32, halftone_pitch: f32,
  halftone_cos: f32, halftone_sin: f32, pad1: f32, pad2: f32,
}
@group(0) @binding(0) var<uniform> params: LtV2Params;
@group(0) @binding(1) var<storage, read> depth_buf: array<f32>;
@group(0) @binding(2) var<storage, read> normal_buf: array<f32>;
@group(0) @binding(3) var<storage, read> object_id_buf: array<u32>;
@group(0) @binding(4) var<storage, read_write> line_art_out: array<u32>;
@group(0) @binding(5) var<storage, read_write> screentone_out: array<u32>;

fn idx_clamped(x: i32, y: i32) -> u32 {
  let cx = u32(clamp(x, 0, i32(params.width) - 1));
  let cy = u32(clamp(y, 0, i32(params.height) - 1));
  return cy * params.width + cx;
}
fn load_normal(idx: u32) -> vec3<f32> {
  let b = idx * 3u;
  return vec3<f32>(normal_buf[b], normal_buf[b + 1u], normal_buf[b + 2u]);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  let x = i32(gid.x); let y = i32(gid.y);
  let c_idx = gid.y * params.width + gid.x;
  let c_obj = object_id_buf[c_idx];
  let i_l = idx_clamped(x - 1, y); let i_r = idx_clamped(x + 1, y);
  let i_u = idx_clamped(x, y - 1); let i_d = idx_clamped(x, y + 1);
  let d_grad = hypot(depth_buf[i_r] - depth_buf[i_l], depth_buf[i_d] - depth_buf[i_u]);
  let id_diff = select(0.0, 1.0,
    object_id_buf[i_l] != c_obj || object_id_buf[i_r] != c_obj ||
    object_id_buf[i_u] != c_obj || object_id_buf[i_d] != c_obj);
  let sil = clamp(max(smoothstep(params.depth_threshold * 0.5, params.depth_threshold * 1.5, d_grad), id_diff * params.object_id_weight) * params.line_gain, 0.0, 1.0);
  let n_grad = length(load_normal(i_r) - load_normal(i_l)) + length(load_normal(i_d) - load_normal(i_u));
  let crease = select(0.0, clamp(smoothstep(params.normal_threshold * 0.6, params.normal_threshold * 1.6, n_grad) * params.line_gain, 0.0, 1.0), c_obj != 0u);
  let light_dir = normalize(vec3<f32>(params.light_x, params.light_y, params.light_z));
  let ndl = clamp(dot(normalize(load_normal(c_idx)), light_dir), 0.0, 1.0);
  let bands_f = f32(max(params.cel_bands, 2u));
  let cel_step = floor(ndl * bands_f) / (bands_f - 1.0);
  let density = select(0.0, clamp(1.0 - cel_step, 0.0, 1.0), c_obj != 0u);
  let fx = f32(gid.x); let fy = f32(gid.y);
  let rx = (fx * params.halftone_cos - fy * params.halftone_sin) / max(params.halftone_pitch, 1.0);
  let ry = (fx * params.halftone_sin + fy * params.halftone_cos) / max(params.halftone_pitch, 1.0);
  let dot_hit = density > 0.05 && length(vec2<f32>(fract(rx) - 0.5, fract(ry) - 0.5)) <= sqrt(density) * 0.52;
  line_art_out[c_idx] = u32(round(max(sil, crease) * 255.0));
  screentone_out[c_idx] = select(0u, 255u, dot_hit);
}
`;

export function validateLtV2WgslSource(source = WGSL_LT_CONVERSION_V2): WgslLtValidationResult {
  const errors: string[] = [];
  const hasComputeEntry = /@compute[\s\S]*?fn\s+main\s*\(/.test(source);
  const hasWorkgroup16x16 = /@workgroup_size\(\s*16\s*,\s*16\s*\)/.test(source);
  const bindingCount = (source.match(/@group\(\d+\)\s*@binding\(\d+\)/g) ?? []).length;
  let depth = 0, balancedBraces = true;
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") { depth -= 1; if (depth < 0) balancedBraces = false; }
  }
  if (depth !== 0) balancedBraces = false;
  if (!hasComputeEntry) errors.push("컴퓨트 엔트리 포인트 `@compute fn main`이 누락되었습니다.");
  if (!hasWorkgroup16x16) errors.push("`@workgroup_size(16, 16)` 선언이 누락되었습니다.");
  if (bindingCount < 6) errors.push("LT v2 G-버퍼 바인딩 슬롯(6개)이 부족합니다.");
  if (!balancedBraces) errors.push("WGSL 중괄호 짝이 일치하지 않습니다.");
  return { valid: errors.length === 0, hasComputeEntry, hasWorkgroup16x16, bindingCount, balancedBraces, errors };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const denom = edge1 - edge0;
  if (Math.abs(denom) <= 1e-8) return x >= edge1 ? 1 : 0;
  const t = clamp((x - edge0) / denom, 0, 1);
  return t * t * (3 - 2 * t);
}

/** `WGSL_LT_CONVERSION_V2`와 동일 수식의 결정론적 CPU 레퍼런스 LT v2 추출기. */
export function extractLtLayersCpu(
  gbuffer: LtGbufferInput,
  options: LtExtractionOptions = {},
): LtExtractedLayers {
  const startMs = nowMs();
  const { width, height, depth, normals, objectIds } = gbuffer;
  const pixelCount = width * height;
  if (width <= 0 || height <= 0) throw new RangeError(`유효하지 않은 G-버퍼 해상도입니다: ${width}x${height}`);
  if (depth.length < pixelCount || normals.length < pixelCount * 3 || objectIds.length < pixelCount) {
    throw new RangeError("G-버퍼 배열 길이가 해상도보다 작습니다.");
  }

  const depthThreshold = Math.max(1e-4, options.depthThreshold ?? 0.035);
  const normalThreshold = Math.max(1e-4, options.normalThreshold ?? 0.35);
  const objectIdWeight = clamp(options.objectIdWeight ?? 1.0, 0, 1);
  const lineGain = Math.max(0.1, options.lineGain ?? 1.0);
  const celBands = clamp(Math.round(options.celBands ?? 3), 2, 5);
  const halftonePitch = Math.max(1.5, options.halftonePitchPx ?? 4.0);
  const angleRad = ((options.halftoneAngleDeg ?? 45) * Math.PI) / 180;
  const htCos = Math.cos(angleRad), htSin = Math.sin(angleRad);
  const [lx, ly, lz] = normalizeVec3(options.lightDirection ?? [0.45, 0.72, 0.52]);

  const silhouetteMask = new Uint8Array(pixelCount);
  const creaseMask = new Uint8Array(pixelCount);
  const combinedLineArt = new Uint8Array(pixelCount);
  const celShadowBands = new Uint8Array(pixelCount);
  const screentoneLayer = new Uint8Array(pixelCount);
  const celBandHistogram = new Array<number>(celBands).fill(0);
  let silhouettePixels = 0, creasePixels = 0, lineArtPixels = 0, screentoneDotPixels = 0;

  const idxOf = (px: number, py: number): number =>
    (py < 0 ? 0 : py >= height ? height - 1 : py) * width + (px < 0 ? 0 : px >= width ? width - 1 : px);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const objId = objectIds[idx];
      const iL = idxOf(x - 1, y), iR = idxOf(x + 1, y), iU = idxOf(x, y - 1), iD = idxOf(x, y + 1);

      const dGrad = Math.hypot(depth[iR] - depth[iL], depth[iD] - depth[iU]);
      const idBoundary = objectIds[iL] !== objId || objectIds[iR] !== objId || objectIds[iU] !== objId || objectIds[iD] !== objId ? 1 : 0;
      const silF = clamp(Math.max(smoothstep(depthThreshold * 0.5, depthThreshold * 1.5, dGrad), idBoundary * objectIdWeight) * lineGain, 0, 1);

      let creaseF = 0;
      if (objId !== 0) {
        const l3 = iL * 3, r3 = iR * 3, u3 = iU * 3, d3 = iD * 3;
        const nGrad =
          Math.hypot(normals[r3] - normals[l3], normals[r3 + 1] - normals[l3 + 1], normals[r3 + 2] - normals[l3 + 2]) +
          Math.hypot(normals[d3] - normals[u3], normals[d3 + 1] - normals[u3 + 1], normals[d3 + 2] - normals[u3 + 2]);
        const rawCrease = smoothstep(normalThreshold * 0.6, normalThreshold * 1.6, nGrad);
        creaseF = clamp((idBoundary === 0 ? rawCrease : rawCrease * 0.5) * lineGain, 0, 1);
      }

      const silByte = Math.round(silF * 255);
      const creaseByte = Math.round(creaseF * 255);
      const lineByte = silByte >= creaseByte ? silByte : creaseByte;
      silhouetteMask[idx] = silByte;
      creaseMask[idx] = creaseByte;
      combinedLineArt[idx] = lineByte;
      if (silByte >= 128) silhouettePixels += 1;
      if (creaseByte >= 128) creasePixels += 1;
      if (lineByte >= 128) lineArtPixels += 1;

      if (objId !== 0) {
        const n3 = idx * 3;
        const nLen = Math.hypot(normals[n3], normals[n3 + 1], normals[n3 + 2]) || 1;
        const ndl = clamp((normals[n3] * lx + normals[n3 + 1] * ly + normals[n3 + 2] * lz) / nLen, 0, 1);
        const bandIndex = Math.min(celBands - 1, Math.floor(ndl * celBands));
        celBandHistogram[bandIndex] += 1;
        const celLevel = bandIndex / (celBands - 1);
        celShadowBands[idx] = Math.round(celLevel * 255);

        const density = clamp(1 - celLevel, 0, 1);
        if (density > 0.05) {
          const rx = (x * htCos - y * htSin) / halftonePitch;
          const ry = (x * htSin + y * htCos) / halftonePitch;
          const dist = Math.hypot(rx - Math.floor(rx) - 0.5, ry - Math.floor(ry) - 0.5);
          if (dist <= Math.sqrt(density) * 0.52) {
            screentoneLayer[idx] = 255;
            screentoneDotPixels += 1;
          }
        }
      } else {
        celShadowBands[idx] = 255;
      }
    }
  }

  return {
    width, height, silhouetteMask, creaseMask, combinedLineArt, celShadowBands, screentoneLayer,
    metrics: {
      silhouettePixels, creasePixels, lineArtPixels, screentoneDotPixels,
      celBandHistogram, elapsedMs: Math.max(0, nowMs() - startMs),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* 3. 240Hz Coalesced/Predicted Stylus & Barrel-Roll Engine                   */
/* -------------------------------------------------------------------------- */

export interface StylusSample {
  readonly x: number; readonly y: number; readonly timestampMs: number;
  readonly pressure: number; readonly tiltX: number; readonly tiltY: number;
  /** 배럴-롤(스타일러스 축 회전) 각도 `0..360`도. */
  readonly twist: number;
  readonly source?: "coalesced" | "predicted" | "committed";
}

export interface StylusRenderSegment {
  readonly id: number;
  readonly fromX: number; readonly fromY: number; readonly toX: number; readonly toY: number;
  readonly pressureStart: number; readonly pressureEnd: number;
  readonly tiltX: number; readonly tiltY: number;
  readonly twistStartDeg: number; readonly twistEndDeg: number;
  readonly nibAxisX: number; readonly nibAxisY: number;
  readonly velocityPxPerMs: number; readonly provisional: boolean; readonly generation: number;
}

export interface StylusFrameUpdate {
  readonly strokeActive: boolean; readonly generation: number;
  readonly newlyCommitted: readonly StylusRenderSegment[];
  readonly clearedPredictedIds: readonly number[];
  readonly predictedOverlay: readonly StylusRenderSegment[];
  readonly activeGhostCount: number;
}

export interface StylusReconciliationMetrics {
  readonly totalCoalescedSamples: number; readonly totalCommittedSegments: number;
  readonly totalPredictedGenerated: number; readonly totalPredictedCleared: number;
  readonly activePredictedCount: number; readonly activeGhostCount: number;
  readonly measuredHz: number; readonly meanPredictionErrorPx: number;
}

export interface Stylus240HzPredictorOptions {
  readonly predictionSteps?: 0 | 1 | 2;
  readonly stepMs?: number;
  readonly accelDamping?: number;
  readonly osBlendWeight?: number;
}

/** 각도를 `[0, 360)` 범위로 정규화한다. */
export function normalizeAngle360(deg: number): number {
  const m = deg % 360;
  return m < 0 ? m + 360 : m;
}

/** 배럴-롤 회전의 최단 부호 있는 각도 차이(`-180..180`)를 계산한다. */
export function shortestAngleDeltaDeg(fromDeg: number, toDeg: number): number {
  const diff = ((toDeg - fromDeg + 540) % 360) - 180;
  return diff < -180 ? diff + 360 : diff;
}

function sanitizeSample(sample: StylusSample, source: "coalesced" | "committed"): StylusSample {
  return {
    x: Number.isFinite(sample.x) ? sample.x : 0,
    y: Number.isFinite(sample.y) ? sample.y : 0,
    timestampMs: Number.isFinite(sample.timestampMs) ? sample.timestampMs : 0,
    pressure: clamp(Number.isFinite(sample.pressure) ? sample.pressure : 0.5, 0, 1),
    tiltX: clamp(Number.isFinite(sample.tiltX) ? sample.tiltX : 0, -90, 90),
    tiltY: clamp(Number.isFinite(sample.tiltY) ? sample.tiltY : 0, -90, 90),
    twist: normalizeAngle360(Number.isFinite(sample.twist) ? sample.twist : 0),
    source,
  };
}

/**
 * 240Hz 병합/예측 포인터 샘플과 배럴-롤 회전을 처리하는 저지연 스타일러스 예측기.
 * 매 배치마다 이전 예측 오버레이를 100% 폐기하고 확정 잉크로 교체해 잔상 0건을 보장한다.
 */
export class Stylus240HzPredictor {
  private readonly predictionSteps: number;
  private readonly defaultStepMs: number;
  private readonly accelDamping: number;
  private readonly osBlendWeight: number;

  private active = false;
  private generation = 0;
  private nextSegmentId = 1;
  private readonly committedSamples: StylusSample[] = [];
  private readonly committedSegments: StylusRenderSegment[] = [];
  private predictedOverlay: StylusRenderSegment[] = [];

  private totalCoalescedSamples = 0;
  private totalPredictedGenerated = 0;
  private totalPredictedCleared = 0;
  private dtAccumMs = 0;
  private dtSampleCount = 0;
  private predictionErrorSumPx = 0;
  private predictionErrorCount = 0;

  constructor(options: Stylus240HzPredictorOptions = {}) {
    this.predictionSteps = clamp(Math.round(options.predictionSteps ?? 2), 0, 2);
    this.defaultStepMs = Math.max(1, options.stepMs ?? STYLUS_DEFAULT_STEP_MS);
    this.accelDamping = clamp(options.accelDamping ?? 0.35, 0, 1);
    this.osBlendWeight = clamp(options.osBlendWeight ?? 0.45, 0, 1);
  }

  beginStroke(initialSample: StylusSample): StylusFrameUpdate {
    const clearedPredictedIds = this.clearCurrentPredictedOverlay();
    this.committedSamples.length = 0;
    this.committedSegments.length = 0;
    this.active = true;
    this.generation += 1;
    this.committedSamples.push(sanitizeSample(initialSample, "committed"));
    this.totalCoalescedSamples += 1;
    return { strokeActive: true, generation: this.generation, newlyCommitted: [], clearedPredictedIds, predictedOverlay: [], activeGhostCount: 0 };
  }

  ingestPointerBatch(
    coalescedSamples: readonly StylusSample[],
    osPredictedSamples: readonly StylusSample[] = [],
  ): StylusFrameUpdate {
    if (!this.active) {
      if (coalescedSamples.length === 0) {
        return { strokeActive: false, generation: this.generation, newlyCommitted: [], clearedPredictedIds: [], predictedOverlay: [], activeGhostCount: 0 };
      }
      this.beginStroke(coalescedSamples[0]);
      return this.ingestPointerBatch(coalescedSamples.slice(1), osPredictedSamples);
    }

    this.generation += 1;
    const prevFirstPredicted = this.predictedOverlay[0];
    const clearedPredictedIds = this.clearCurrentPredictedOverlay();
    const sorted = [...coalescedSamples].sort((a, b) => a.timestampMs - b.timestampMs);
    const newlyCommitted: StylusRenderSegment[] = [];

    for (const raw of sorted) {
      const sample = sanitizeSample(raw, "coalesced");
      this.totalCoalescedSamples += 1;
      const prev = this.committedSamples[this.committedSamples.length - 1];
      if (prevFirstPredicted && newlyCommitted.length === 0) {
        this.predictionErrorSumPx += Math.hypot(sample.x - prevFirstPredicted.toX, sample.y - prevFirstPredicted.toY);
        this.predictionErrorCount += 1;
      }
      if (prev) {
        const dt = Math.max(0.25, sample.timestampMs - prev.timestampMs);
        if (sample.timestampMs > prev.timestampMs) { this.dtAccumMs += dt; this.dtSampleCount += 1; }
        if (Math.hypot(sample.x - prev.x, sample.y - prev.y) < 1e-4 && Math.abs(sample.pressure - prev.pressure) < 1e-4) continue;
        const seg = this.createSegment(prev, sample, dt, false);
        this.committedSegments.push(seg);
        newlyCommitted.push(seg);
      }
      this.committedSamples.push(sample);
    }

    const nextPredicted = this.extrapolateOverlay(osPredictedSamples);
    this.predictedOverlay = nextPredicted;
    this.totalPredictedGenerated += nextPredicted.length;
    return {
      strokeActive: true, generation: this.generation, newlyCommitted, clearedPredictedIds,
      predictedOverlay: [...nextPredicted], activeGhostCount: 0,
    };
  }

  endStroke(finalSample?: StylusSample): StylusFrameUpdate {
    if (!this.active) {
      return { strokeActive: false, generation: this.generation, newlyCommitted: [], clearedPredictedIds: [], predictedOverlay: [], activeGhostCount: 0 };
    }
    this.generation += 1;
    const clearedPredictedIds = this.clearCurrentPredictedOverlay();
    const newlyCommitted: StylusRenderSegment[] = [];
    if (finalSample) {
      const clean = sanitizeSample(finalSample, "committed");
      const prev = this.committedSamples[this.committedSamples.length - 1];
      if (prev && Math.hypot(clean.x - prev.x, clean.y - prev.y) >= 1e-4) {
        const seg = this.createSegment(prev, clean, Math.max(0.25, clean.timestampMs - prev.timestampMs), false);
        this.committedSegments.push(seg);
        newlyCommitted.push(seg);
      }
      this.committedSamples.push(clean);
      this.totalCoalescedSamples += 1;
    }
    this.active = false;
    return { strokeActive: false, generation: this.generation, newlyCommitted, clearedPredictedIds, predictedOverlay: [], activeGhostCount: 0 };
  }

  getCommittedSegments(): readonly StylusRenderSegment[] { return [...this.committedSegments]; }
  getPredictedOverlay(): readonly StylusRenderSegment[] { return [...this.predictedOverlay]; }

  getMetrics(): StylusReconciliationMetrics {
    const avgDt = this.dtSampleCount > 0 ? this.dtAccumMs / this.dtSampleCount : this.defaultStepMs;
    const activeGhostCount = this.predictedOverlay.filter((s) => s.generation !== this.generation || !this.active).length;
    return {
      totalCoalescedSamples: this.totalCoalescedSamples,
      totalCommittedSegments: this.committedSegments.length,
      totalPredictedGenerated: this.totalPredictedGenerated,
      totalPredictedCleared: this.totalPredictedCleared,
      activePredictedCount: this.predictedOverlay.length,
      activeGhostCount,
      measuredHz: avgDt > 0 ? 1000 / avgDt : STYLUS_TARGET_HZ,
      meanPredictionErrorPx: this.predictionErrorCount > 0 ? this.predictionErrorSumPx / this.predictionErrorCount : 0,
    };
  }

  private clearCurrentPredictedOverlay(): number[] {
    if (this.predictedOverlay.length === 0) return [];
    const ids = this.predictedOverlay.map((seg) => seg.id);
    this.totalPredictedCleared += ids.length;
    this.predictedOverlay = [];
    return ids;
  }

  private extrapolateOverlay(osPredicted: readonly StylusSample[]): StylusRenderSegment[] {
    if (!this.active || this.predictionSteps <= 0 || this.committedSamples.length < 2) return [];
    const len = this.committedSamples.length;
    const s2 = this.committedSamples[len - 1], s1 = this.committedSamples[len - 2];
    const dt1 = Math.max(0.5, s2.timestampMs - s1.timestampMs);
    const vx = (s2.x - s1.x) / dt1, vy = (s2.y - s1.y) / dt1;
    const vPressure = (s2.pressure - s1.pressure) / dt1;
    const vTwist = shortestAngleDeltaDeg(s1.twist, s2.twist) / dt1;

    let ax = 0, ay = 0;
    if (len >= 3) {
      const s0 = this.committedSamples[len - 3];
      const dt0 = Math.max(0.5, s1.timestampMs - s0.timestampMs);
      const avgDt = 0.5 * (dt0 + dt1);
      ax = (((vx - (s1.x - s0.x) / dt0) / avgDt) * this.accelDamping);
      ay = (((vy - (s1.y - s0.y) / dt0) / avgDt) * this.accelDamping);
    }

    const stepMs = clamp(dt1, 2.0, this.defaultStepMs * 2);
    const segments: StylusRenderSegment[] = [];
    let anchor = s2;
    for (let step = 1; step <= this.predictionSteps; step += 1) {
      const t = stepMs * step;
      let predX = s2.x + vx * t + 0.5 * ax * t * t;
      let predY = s2.y + vy * t + 0.5 * ay * t * t;
      let predPressure = clamp(s2.pressure + vPressure * t * 0.5, 0.02, 1);
      let predTwist = normalizeAngle360(s2.twist + vTwist * t);

      const osSample = osPredicted[step - 1];
      if (osSample) {
        const w = this.osBlendWeight;
        predX = lerp(predX, osSample.x, w);
        predY = lerp(predY, osSample.y, w);
        predPressure = clamp(lerp(predPressure, osSample.pressure, w), 0.02, 1);
        predTwist = normalizeAngle360(predTwist + shortestAngleDeltaDeg(predTwist, normalizeAngle360(osSample.twist)) * w);
      }

      const nextPoint: StylusSample = {
        x: predX, y: predY, timestampMs: s2.timestampMs + t,
        pressure: predPressure, tiltX: s2.tiltX, tiltY: s2.tiltY, twist: predTwist, source: "predicted",
      };
      segments.push(this.createSegment(anchor, nextPoint, stepMs, true));
      anchor = nextPoint;
    }
    return segments;
  }

  private createSegment(from: StylusSample, to: StylusSample, dtMs: number, provisional: boolean): StylusRenderSegment {
    const twistEnd = normalizeAngle360(from.twist + shortestAngleDeltaDeg(from.twist, to.twist));
    const nibRad = (twistEnd * Math.PI) / 180;
    const id = this.nextSegmentId++;
    return {
      id, fromX: from.x, fromY: from.y, toX: to.x, toY: to.y,
      pressureStart: from.pressure, pressureEnd: to.pressure,
      tiltX: to.tiltX, tiltY: to.tiltY, twistStartDeg: from.twist, twistEndDeg: twistEnd,
      nibAxisX: Math.cos(nibRad), nibAxisY: Math.sin(nibRad),
      velocityPxPerMs: Math.hypot(to.x - from.x, to.y - from.y) / Math.max(0.25, dtMs),
      provisional, generation: this.generation,
    };
  }
}
