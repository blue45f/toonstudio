/**
 * Substance 3D Painter 클린룸 — 곡률(Curvature)·AO 기반 웹툰 스마트 마스크 생성기 및
 * UV 무이음 Tri-Planar 투영 셰이더 파라미터 빌더.
 *
 * - 1-링 인접 정점 법선·위치로부터 이산 평균 곡률(볼록 모서리 `+`, 오목 틈 `-`)과 기하 AO 베이킹
 * - 5종 웹툰 스마트 마스크 프리셋(모서리 마모 하이라이트, 틈새 잉크 해칭, 구석 먼지/오염, 상단 림라이트 먼지, 의상 주름 음영)
 * - UV 없이도 건축 벽·바위·클레이 소품에 심리스 질감을 입히는 Tri-Planar 가중치 및 GLSL 청크 빌더
 */

export type Vec3Tuple = readonly [number, number, number];

export type WebtoonSmartMaskPresetId =
  | "edge-wear-highlight"
  | "crevice-ink-hatch"
  | "cavity-dirt-grime"
  | "top-dust-rim"
  | "fabric-seam-shadow";

export interface SmartMaskGeometryInput {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
}

export interface BakedMeshCurvatureAo {
  readonly vertexCount: number;
  /** `-1` (깊은 오목 틈새) ~ `0` (평면) ~ `+1` (날카로운 볼록 모서리). */
  readonly curvature: Float32Array;
  /** `0` (완전 차폐 구석) ~ `1` (완전 개방 표면). */
  readonly ambientOcclusion: Float32Array;
}

export interface WebtoonSmartMaskConfig {
  readonly presetId: WebtoonSmartMaskPresetId;
  /** 마스크 발현 중심 이동 (`0..1`, 기본 `0.5`). */
  readonly balance: number;
  /** 마스크 경계 대비 (`0.5..4.0`). */
  readonly contrast: number;
  /** 결정적 3D 프로시저럴 그런지 노이즈 변조 강도 (`0..1`). */
  readonly grungeStrength: number;
  readonly grungeScale: number;
  readonly invert: boolean;
}

export interface SmartMaskPresetMeta {
  readonly id: WebtoonSmartMaskPresetId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly defaults: WebtoonSmartMaskConfig;
}

export interface TriPlanarProjectionConfig {
  readonly worldTilingScale: number;
  /** X/Y/Z 평면 블렌드 날카로움 지수 (`1.0` 부드러움 ~ `16.0` 칼같은 전환). */
  readonly blendSharpness: number;
  readonly offsetWorldM: Vec3Tuple;
  readonly enableStochasticRotation: boolean;
}

export interface TriPlanarUniformPayload {
  readonly uTriPlanarScale: number;
  readonly uTriPlanarSharpness: number;
  readonly uTriPlanarOffset: Vec3Tuple;
  readonly uTriPlanarStochastic: number;
}

export const WEBTOON_SMART_MASK_PRESETS: Readonly<Record<WebtoonSmartMaskPresetId, SmartMaskPresetMeta>> = Object.freeze({
  "edge-wear-highlight": {
    id: "edge-wear-highlight",
    labelKo: "모서리 마모 하이라이트",
    descriptionKo: "볼록한 모서리와 갑옷·가구 능선에 밝은 툰 하이라이트를 얹습니다.",
    defaults: { presetId: "edge-wear-highlight", balance: 0.52, contrast: 2.1, grungeStrength: 0.25, grungeScale: 6, invert: false },
  },
  "crevice-ink-hatch": {
    id: "crevice-ink-hatch",
    labelKo: "틈새 잉크 해칭",
    descriptionKo: "오목하게 접힌 틈새와 관절 구석에 만화 해칭 톤을 집중시킵니다.",
    defaults: { presetId: "crevice-ink-hatch", balance: 0.48, contrast: 2.4, grungeStrength: 0.2, grungeScale: 9, invert: false },
  },
  "cavity-dirt-grime": {
    id: "cavity-dirt-grime",
    labelKo: "구석 때·오염 웨더링",
    descriptionKo: "AO가 낮은 골목 벽 하단과 바닥 틈새에 거친 오염 질감을 입힙니다.",
    defaults: { presetId: "cavity-dirt-grime", balance: 0.55, contrast: 1.8, grungeStrength: 0.45, grungeScale: 5, invert: false },
  },
  "top-dust-rim": {
    id: "top-dust-rim",
    labelKo: "상단 면 먼지·눈 쌓임",
    descriptionKo: "위쪽(+Y)을 향하는 지붕·어깨·난간 윗면만 선별해 마스크를 만듭니다.",
    defaults: { presetId: "top-dust-rim", balance: 0.5, contrast: 2.0, grungeStrength: 0.15, grungeScale: 4, invert: false },
  },
  "fabric-seam-shadow": {
    id: "fabric-seam-shadow",
    labelKo: "의상 주름·재봉선 음영",
    descriptionKo: "오목 곡률과 AO를 결합해 옷 주름 속 부드러운 그림자 톤을 생성합니다.",
    defaults: { presetId: "fabric-seam-shadow", balance: 0.5, contrast: 1.9, grungeStrength: 0.1, grungeScale: 8, invert: false },
  },
});

const EPS = 1e-8;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** 결정적 3D 해시 기반 연속 노이즈(비결정 난수 미사용, `[0..1]`). */
export function deterministicValueNoise3D(x: number, y: number, z: number): number {
  const hash = (ix: number, iy: number, iz: number) => {
    const h = Math.sin(ix * 127.1 + iy * 311.7 + iz * 74.7) * 43758.5453123;
    return h - Math.floor(h);
  };
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

  const n000 = hash(ix, iy, iz);
  const n100 = hash(ix + 1, iy, iz);
  const n010 = hash(ix, iy + 1, iz);
  const n110 = hash(ix + 1, iy + 1, iz);
  const n001 = hash(ix, iy, iz + 1);
  const n101 = hash(ix + 1, iy, iz + 1);
  const n011 = hash(ix, iy + 1, iz + 1);
  const n111 = hash(ix + 1, iy + 1, iz + 1);

  const nx00 = n000 + (n100 - n000) * ux;
  const nx10 = n010 + (n110 - n010) * ux;
  const nx01 = n001 + (n101 - n001) * ux;
  const nx11 = n011 + (n111 - n011) * ux;
  const nxy0 = nx00 + (nx10 - nx00) * uy;
  const nxy1 = nx01 + (nx11 - nx01) * uy;
  return nxy0 + (nxy1 - nxy0) * uz;
}

/**
 * 1-링 인접 토폴로지를 이용해 정점별 이산 곡률(`[-1, 1]`)과 기하 AO(`[0, 1]`)를 베이킹한다.
 */
export function bakeVertexCurvatureAndAo(
  geometry: SmartMaskGeometryInput,
): BakedMeshCurvatureAo {
  const vertexCount = Math.floor(geometry.positions.length / 3);
  const curvature = new Float32Array(vertexCount);
  const ambientOcclusion = new Float32Array(vertexCount).fill(1);
  if (vertexCount === 0) return { vertexCount: 0, curvature, ambientOcclusion };

  const neighbors: Set<number>[] = Array.from({ length: vertexCount }, () => new Set<number>());
  for (let i = 0; i < geometry.indices.length; i += 3) {
    const a = geometry.indices[i];
    const b = geometry.indices[i + 1];
    const c = geometry.indices[i + 2];
    if (a < vertexCount && b < vertexCount && c < vertexCount) {
      neighbors[a].add(b);
      neighbors[a].add(c);
      neighbors[b].add(a);
      neighbors[b].add(c);
      neighbors[c].add(a);
      neighbors[c].add(b);
    }
  }

  const pos = geometry.positions;
  const norm = geometry.normals;

  for (let v = 0; v < vertexCount; v += 1) {
    const ring = neighbors[v];
    if (ring.size === 0) continue;

    const v3 = v * 3;
    const px = pos[v3];
    const py = pos[v3 + 1];
    const pz = pos[v3 + 2];
    let nx = norm[v3];
    let ny = norm[v3 + 1];
    let nz = norm[v3 + 2];
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (nLen > EPS) {
      nx /= nLen;
      ny /= nLen;
      nz /= nLen;
    }

    let curvSum = 0;
    let occlSum = 0;
    let count = 0;
    for (const nb of ring) {
      const nb3 = nb * 3;
      const dx = pos[nb3] - px;
      const dy = pos[nb3 + 1] - py;
      const dz = pos[nb3 + 2] - pz;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist <= EPS) continue;
      const dirX = dx / dist;
      const dirY = dy / dist;
      const dirZ = dz / dist;

      // 인접점이 현재 법선 뒤쪽(음수 투영)에 있으면 볼록(+curvature), 앞쪽(양수 투영)이면 오목(-curvature & 차폐)
      const proj = dirX * nx + dirY * ny + dirZ * nz;
      curvSum += -proj;
      occlSum += Math.max(0, proj);
      count += 1;
    }

    if (count > 0) {
      curvature[v] = clamp((curvSum / count) * 1.8, -1, 1);
      ambientOcclusion[v] = clamp(1 - (occlSum / count) * 1.35, 0, 1);
    }
  }

  return { vertexCount, curvature, ambientOcclusion };
}

/**
 * 베이킹된 곡률·AO 및 월드 법선으로 웹툰 스마트 마스크(`[0..1]` per vertex)를 생성한다.
 */
export function generateWebtoonSmartMask(
  geometry: SmartMaskGeometryInput,
  baked: BakedMeshCurvatureAo,
  config: WebtoonSmartMaskConfig,
): Float32Array {
  const mask = new Float32Array(baked.vertexCount);
  const balance = clamp(config.balance, 0.05, 0.95);
  const contrast = clamp(config.contrast, 0.25, 5);
  const grungeStrength = clamp(config.grungeStrength, 0, 1);
  const grungeScale = Math.max(0.1, config.grungeScale);

  for (let v = 0; v < baked.vertexCount; v += 1) {
    const v3 = v * 3;
    const curv = baked.curvature[v];
    const ao = baked.ambientOcclusion[v];
    const ny = geometry.normals[v3 + 1];

    let raw: number;
    if (config.presetId === "edge-wear-highlight") {
      raw = clamp(curv, 0, 1);
    } else if (config.presetId === "crevice-ink-hatch") {
      raw = clamp(-curv * 0.7 + (1 - ao) * 0.5, 0, 1);
    } else if (config.presetId === "cavity-dirt-grime") {
      raw = clamp((1 - ao) * 0.85 + Math.max(0, -curv) * 0.35, 0, 1);
    } else if (config.presetId === "top-dust-rim") {
      raw = clamp((ny - 0.15) / 0.85, 0, 1);
    } else {
      // fabric-seam-shadow
      raw = clamp(Math.max(0, -curv) * 0.6 + (1 - ao) * 0.6, 0, 1);
    }

    if (grungeStrength > 0) {
      const nVal = deterministicValueNoise3D(
        geometry.positions[v3] * grungeScale,
        geometry.positions[v3 + 1] * grungeScale,
        geometry.positions[v3 + 2] * grungeScale,
      );
      raw = clamp(raw * (1 - grungeStrength * 0.5) + raw * nVal * grungeStrength, 0, 1);
    }

    // Balance & Contrast 곡선 적용
    let shaped = clamp((raw - (1 - balance)) * contrast + 0.5, 0, 1);
    if (config.invert) shaped = 1 - shaped;
    mask[v] = shaped;
  }

  return mask;
}

/**
 * 월드 공간 법선으로부터 합이 정확히 `1.0`인 무이음 Tri-Planar 투영 가중치 `[wx, wy, wz]`를 계산한다.
 */
export function evaluateTriPlanarWeights(
  worldNormal: Vec3Tuple,
  blendSharpness = 4,
): Vec3Tuple {
  const power = clamp(blendSharpness, 1, 16);
  const wx = Math.pow(Math.abs(worldNormal[0]), power);
  const wy = Math.pow(Math.abs(worldNormal[1]), power);
  const wz = Math.pow(Math.abs(worldNormal[2]), power);
  const sum = wx + wy + wz;
  if (sum <= EPS) return [0, 1, 0];
  return [wx / sum, wy / sum, wz / sum];
}

export function buildTriPlanarUniformPayload(
  config: TriPlanarProjectionConfig,
): TriPlanarUniformPayload {
  return {
    uTriPlanarScale: Math.max(0.01, config.worldTilingScale),
    uTriPlanarSharpness: clamp(config.blendSharpness, 1, 16),
    uTriPlanarOffset: config.offsetWorldM,
    uTriPlanarStochastic: config.enableStochasticRotation ? 1 : 0,
  };
}

/** UV 없이 월드 좌표와 법선만으로 심리스 텍스처를 샘플링하는 GLSL 프래그먼트 청크를 생성한다. */
export function createTriPlanarGlslChunk(): string {
  return /* glsl */ `
uniform float uTriPlanarScale;
uniform float uTriPlanarSharpness;
uniform vec3 uTriPlanarOffset;

vec4 sampleStudioTriPlanar(sampler2D texMap, vec3 worldPos, vec3 worldNormal) {
  vec3 blending = pow(abs(normalize(worldNormal)), vec3(uTriPlanarSharpness));
  blending /= max(blending.x + blending.y + blending.z, 0.0001);
  vec3 p = (worldPos + uTriPlanarOffset) * uTriPlanarScale;
  vec4 xProj = texture2D(texMap, p.zy);
  vec4 yProj = texture2D(texMap, p.xz);
  vec4 zProj = texture2D(texMap, p.xy);
  return xProj * blending.x + yProj * blending.y + zProj * blending.z;
}
`.trim();
}
