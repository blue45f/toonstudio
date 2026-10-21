/**
 * Studio BG3D 3D 표면 직접 그리기 2단계 — GLB 모델 텍스처 페인팅 엔진 (순수 모듈).
 *
 * 1단계(프리미티브 UV 페인팅, studio-bg3d-texture-paint)와의 관계:
 * - 획(stroke) 벡터가 정본이라는 결정, 획 정규화·한도·래스터화는 1단계 엔진을 그대로 재사용한다.
 * - 2단계가 더하는 것은 (1) 대상이 프리미티브 1개가 아니라 GLB 안의 메시/텍스처 여럿이라는 점,
 *   (2) 캐릭터 스킨처럼 UV 아일랜드가 갈라진 표면의 심(seam) 보정, (3) 원본 텍스처 해상도에
 *   맞춘 래스터 크기, (4) 칠할 수 없는 모델에 대한 정직한 안내 판정이다.
 *
 * 심 보정은 세 층으로 이뤄진다.
 * 1. 랩(wrap) 심: 텍스처 wrap이 repeat( glTF 기본값)면 u=0과 u=1은 표면에서 같은 자리다.
 *    경계 근처 획은 반대편 타일에 고스트 획을 함께 찍어 경계에서 색이 끊기지 않게 한다.
 * 2. 아일랜드 점프 절단: 포인터가 3D 표면을 연속으로 이동해도 UV 공간에서는 아일랜드 사이를
 *    순간이동한다. 점프가 임계값을 넘으면 획을 그 자리에서 끊어, 두 아일랜드를 잇는
 *    긴 직선이 텍스처를 가로질러 번지는 것을 막는다(캐릭터 스킨에서 가장 눈에 띄는 결함).
 * 3. 경계 블리드(dilate): 획 레이어의 칠해진 텍셀을 바깥으로 N 텍셀 밀어낸다. 밉맵·바이리니어가
 *    아일랜드 경계 바깥(거터)을 섞어 읽어도 획 색이 이어져 심 라인이 뜨지 않는다. 의미론은
 *    VRM 딜레이션(studio-vrm-texture-dilate)과 같다: 칠해진 텍셀은 절대 바뀌지 않고, 채우는 색은
 *    이웃의 알파 가중 평균, 알파는 이웃 최댓값이다.
 *
 * 안내 판정: 런타임 GLB 검증기(studio-bg3d-glb-validation)는 외부 리소스 `uri`를 가진 모델을
 * 거부한다(external-resource-uri). 그런 모델은 애초에 장면에 들어오지 못하므로 페인트도
 * "검증에서 제외됨"으로 안내한다. 텍스처가 없는 모델, baseColor 텍스처는 있으나 UV가 없는
 * 모델도 그릴 수 없음을 숨기지 않고 상태로 돌려준다.
 */

import {
  normalizeStudioBg3dTexturePaint,
  paintStudioBg3dTextureStroke,
  removeLastStudioBg3dTexturePaintStroke,
  appendStudioBg3dTexturePaintStroke,
  type StudioBg3dPaintCanvas,
  type StudioBg3dPaintCanvas2d,
  type StudioBg3dPaintCanvasFactory,
  type StudioBg3dTexturePaint,
  type StudioBg3dTexturePaintStroke,
} from "./studio-bg3d-texture-paint";
import { createStudioBg3dModelTexturePaintTargetKey } from "../studio-bg3d-model-texture-paint";

export {
  STUDIO_BG3D_MODEL_TEXTURE_PAINT_MAX_TARGETS,
  countStudioBg3dModelTexturePaintPoints,
  createStudioBg3dModelTexturePaintTargetKey,
  getStudioBg3dModelTexturePaintForTarget,
  normalizeStudioBg3dModelTexturePaint,
  parseStudioBg3dModelTexturePaintTargetKey,
  upsertStudioBg3dModelTexturePaintTarget,
} from "../studio-bg3d-model-texture-paint";

export type {
  StudioBg3dModelTexturePaint,
  StudioBg3dModelTexturePaintTarget,
} from "./studio-bg3d-scene-document-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}


/* ── GLB 페인트 가능 판정 ────────────────────────────────────────────────── */

export type StudioBg3dGlbPaintStatus =
  | "paintable"
  | "external-resource"
  | "no-texture"
  | "no-uv"
  | "invalid";

/** 상태별 정직한 안내 문구. 그릴 수 없는 이유와 사용자가 할 수 있는 일을 함께 말한다. */
export const STUDIO_BG3D_GLB_PAINT_STATUS_MESSAGES: Readonly<
  Record<StudioBg3dGlbPaintStatus, string>
> = Object.freeze({
  paintable: "이 모델의 텍스처에 직접 그릴 수 있습니다.",
  "external-resource":
    "외부 파일이나 네트워크 텍스처를 참조하는 모델은 불러오기 검증에서 제외되어 표면에 그릴 수 없습니다. 텍스처를 GLB 안에 포함해 다시 내보낸 모델을 사용해 주세요.",
  "no-texture":
    "이 모델에는 칠할 기본 색상(base color) 텍스처가 없습니다. 단색 재질만 있는 모델은 텍스처 페인팅 대상이 아니므로, 텍스처를 포함한 GLB에서만 표면에 직접 그릴 수 있습니다.",
  "no-uv":
    "이 모델의 메시에는 UV 좌표가 없어 텍스처에 그릴 위치를 정할 수 없습니다. UV를 포함해 다시 내보낸 모델을 사용해 주세요.",
  invalid:
    "모델 구조를 확인할 수 없어 표면 그리기를 시작할 수 없습니다. 모델을 다시 불러와 주세요.",
});

export interface StudioBg3dGlbPaintTargetInfo {
  readonly targetKey: string;
  readonly meshOrdinal: number;
  /** glTF 메시 인덱스 / 프리미티브 인덱스 (런타임 수집분에서는 -1일 수 있다). */
  readonly meshIndex: number;
  readonly primitiveIndex: number;
  readonly materialIndex: number;
  readonly textureIndex: number;
  readonly imageIndex: number | null;
  /** 스킨(캐릭터) 메시 소속 — 심 보정 강도를 올리는 근거. */
  readonly skinned: boolean;
  /** 텍스처 wrap이 repeat라 랩 심 보정이 필요한지. glTF 기본 wrap은 repeat다. */
  readonly wrapRepeat: boolean;
}

export interface StudioBg3dGlbPaintability {
  readonly status: StudioBg3dGlbPaintStatus;
  readonly message: string;
  readonly targets: readonly StudioBg3dGlbPaintTargetInfo[];
  readonly meshPrimitiveCount: number;
  readonly texturedPrimitiveCount: number;
  readonly skinCount: number;
}

function paintability(
  status: StudioBg3dGlbPaintStatus,
  partial: Partial<StudioBg3dGlbPaintability> = {},
): StudioBg3dGlbPaintability {
  return {
    status,
    message: STUDIO_BG3D_GLB_PAINT_STATUS_MESSAGES[status],
    targets: partial.targets ?? [],
    meshPrimitiveCount: partial.meshPrimitiveCount ?? 0,
    texturedPrimitiveCount: partial.texturedPrimitiveCount ?? 0,
    skinCount: partial.skinCount ?? 0,
  };
}

/** 검증기의 external-resource-uri 판정과 같은 범위: 임의 깊이의 `uri` 키 존재를 찾는다(상한 내). */
function containsExternalUri(value: unknown, depth: number, budget: { nodes: number }): boolean {
  if (depth > 24 || budget.nodes <= 0) return false;
  if (Array.isArray(value)) {
    for (const item of value) {
      budget.nodes -= 1;
      if (containsExternalUri(item, depth + 1, budget)) return true;
    }
    return false;
  }
  if (!isRecord(value)) return false;
  if (Object.hasOwn(value, "uri")) return true;
  for (const item of Object.values(value)) {
    budget.nodes -= 1;
    if (containsExternalUri(item, depth + 1, budget)) return true;
  }
  return false;
}

function indexOrNull(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null;
}

/**
 * glTF JSON만으로 페인트 가능 여부를 판정한다(파일 바이트·Three 불필요).
 * 대상 순서는 장면 DFS → 노드 → 메시 프리미티브 순으로, Three 수집기와 같은 규칙이다.
 * 판정은 "칠할 텍스처가 실제로 존재하는가"까지만 본다: baseColor 텍스처가 있고 그 프리미티브에
 * TEXCOORD_0이 있는 경우에만 대상이 된다.
 */
export function analyzeStudioBg3dGlbPaintability(gltf: unknown): StudioBg3dGlbPaintability {
  if (!isRecord(gltf)) return paintability("invalid");
  if (containsExternalUri(gltf, 0, { nodes: 200_000 })) {
    return paintability("external-resource");
  }
  const meshes = Array.isArray(gltf.meshes) ? gltf.meshes : null;
  const materials = Array.isArray(gltf.materials) ? gltf.materials : [];
  const textures = Array.isArray(gltf.textures) ? gltf.textures : [];
  const samplers = Array.isArray(gltf.samplers) ? gltf.samplers : [];
  const skins = Array.isArray(gltf.skins) ? gltf.skins : [];
  const nodes = Array.isArray(gltf.nodes) ? gltf.nodes : null;
  const scenes = Array.isArray(gltf.scenes) ? gltf.scenes : null;
  if (!meshes || !nodes || !scenes || scenes.length === 0) return paintability("invalid");
  const sceneIndex = indexOrNull(gltf.scene) ?? 0;
  const scene = isRecord(scenes[sceneIndex]) ? (scenes[sceneIndex] as Record<string, unknown>) : null;
  if (!scene || !Array.isArray(scene.nodes)) return paintability("invalid");

  const targets: StudioBg3dGlbPaintTargetInfo[] = [];
  let meshPrimitiveCount = 0;
  let texturedPrimitiveCount = 0;
  let sawPrimitiveWithoutUv = false;

  const visitNode = (nodeIndex: number, depth: number): void => {
    if (depth > 64) return;
    const node = isRecord(nodes[nodeIndex]) ? (nodes[nodeIndex] as Record<string, unknown>) : null;
    if (!node) return;
    const meshIndex = indexOrNull(node.mesh);
    const skinned = indexOrNull(node.skin) !== null;
    if (meshIndex !== null) {
      const mesh = isRecord(meshes[meshIndex]) ? (meshes[meshIndex] as Record<string, unknown>) : null;
      const primitives = mesh && Array.isArray(mesh.primitives) ? mesh.primitives : [];
      primitives.forEach((primitiveValue, primitiveIndex) => {
        if (!isRecord(primitiveValue)) return;
        const ordinal = meshPrimitiveCount;
        meshPrimitiveCount += 1;
        const attributes = isRecord(primitiveValue.attributes) ? primitiveValue.attributes : {};
        const hasUv = Object.hasOwn(attributes, "TEXCOORD_0");
        if (!hasUv) sawPrimitiveWithoutUv = true;
        const materialIndex = indexOrNull(primitiveValue.material);
        const material = materialIndex !== null && isRecord(materials[materialIndex])
          ? (materials[materialIndex] as Record<string, unknown>)
          : null;
        const pbr = material && isRecord(material.pbrMetallicRoughness)
          ? material.pbrMetallicRoughness
          : null;
        const baseColor = pbr && isRecord(pbr.baseColorTexture) ? pbr.baseColorTexture : null;
        const textureIndex = baseColor ? indexOrNull(baseColor.index) : null;
        if (textureIndex === null) return;
        texturedPrimitiveCount += 1;
        if (!hasUv) return;
        const texture = isRecord(textures[textureIndex])
          ? (textures[textureIndex] as Record<string, unknown>)
          : null;
        const imageIndex = texture ? indexOrNull(texture.source) : null;
        const samplerIndex = texture ? indexOrNull(texture.sampler) : null;
        const sampler = samplerIndex !== null && isRecord(samplers[samplerIndex])
          ? (samplers[samplerIndex] as Record<string, unknown>)
          : null;
        // glTF sampler 기본 wrapS/wrapT는 REPEAT(10497). 명시된 경우만 그 값을 따른다.
        const wrapRepeat = !sampler
          || ((sampler.wrapS === undefined || sampler.wrapS === 10497)
            && (sampler.wrapT === undefined || sampler.wrapT === 10497));
        targets.push({
          targetKey: createStudioBg3dModelTexturePaintTargetKey(ordinal),
          meshOrdinal: ordinal,
          meshIndex,
          primitiveIndex,
          materialIndex: materialIndex ?? -1,
          textureIndex,
          imageIndex,
          skinned,
          wrapRepeat,
        });
      });
    }
    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) {
      const childIndex = indexOrNull(child);
      if (childIndex !== null) visitNode(childIndex, depth + 1);
    }
  };
  for (const root of scene.nodes) {
    const rootIndex = indexOrNull(root);
    if (rootIndex !== null) visitNode(rootIndex, 0);
  }

  const partial = {
    targets,
    meshPrimitiveCount,
    texturedPrimitiveCount,
    skinCount: skins.length,
  };
  if (targets.length > 0) return paintability("paintable", partial);
  if (texturedPrimitiveCount > 0) return paintability("no-uv", partial);
  if (meshPrimitiveCount > 0 && sawPrimitiveWithoutUv && texturedPrimitiveCount === 0) {
    // 텍스처 자체가 없는 모델은 no-texture가 1차 사유다(UV 유무와 무관하게 칠할 캔버스가 없다).
    return paintability("no-texture", partial);
  }
  return paintability(meshPrimitiveCount > 0 ? "no-texture" : "invalid", partial);
}

const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;
const GLB_MAX_JSON_BYTES = 4 * 1024 * 1024;

/**
 * 검증이 끝난 GLB 바이트에서 JSON 청크만 꺼내 판정한다. 여기서의 파싱은 페인트 판정 전용이며
 * 장면 편입 검증(해시·예산·구조)은 studio-bg3d-glb-validation가 계속 맡는다.
 * 읽을 수 없으면 "invalid" 상태로 정직하게 떨어진다.
 */
export function analyzeStudioBg3dGlbPaintabilityFromBytes(
  bytes: Uint8Array,
): StudioBg3dGlbPaintability {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 20) return paintability("invalid");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== 2) {
      return paintability("invalid");
    }
    if (view.getUint32(8, true) !== bytes.byteLength) return paintability("invalid");
    const jsonLength = view.getUint32(12, true);
    if (
      jsonLength <= 0 || jsonLength > GLB_MAX_JSON_BYTES
      || view.getUint32(16, true) !== GLB_JSON_CHUNK_TYPE
      || 20 + jsonLength > bytes.byteLength
    ) {
      return paintability("invalid");
    }
    const jsonText = new TextDecoder("utf-8", { fatal: true })
      .decode(bytes.subarray(20, 20 + jsonLength));
    return analyzeStudioBg3dGlbPaintability(JSON.parse(jsonText) as unknown);
  } catch {
    return paintability("invalid");
  }
}

/* ── 텍스처 해상도 정책 ──────────────────────────────────────────────────── */

/** GLB 페인트 래스터 허용 한 변 크기. 원본이 이보다 크면 캡이 걸렸음을 함께 알린다. */
export const STUDIO_BG3D_GLB_TEXTURE_PAINT_RESOLUTIONS = [256, 512, 1024, 2048] as const;
export const STUDIO_BG3D_GLB_TEXTURE_PAINT_DEFAULT_RESOLUTION = 512;
export const STUDIO_BG3D_GLB_TEXTURE_PAINT_MAX_RESOLUTION = 2048;

export interface StudioBg3dGlbTexturePaintSize {
  readonly width: number;
  readonly height: number;
  /** 원본 최대 변이 캡(2048)을 넘어 축소 래스터화가 됐는지. */
  readonly capped: boolean;
}

/**
 * 원본 텍스처 크기에 맞춰 페인트 캔버스 크기를 정한다. 종횡비는 원본을 유지하고,
 * 최대 변을 허용 해상도 버킷(256/512/1024/2048)으로 올림한다 — 원본보다 작은 캔버스에
 * 획을 굽고 다시 원본에 합성하면 획이 번지기 때문이다. 크기를 모르면 기본 512 정사각.
 */
export function resolveStudioBg3dGlbTexturePaintSize(
  sourceWidth: unknown,
  sourceHeight: unknown,
): StudioBg3dGlbTexturePaintSize {
  const width = typeof sourceWidth === "number" && Number.isFinite(sourceWidth) && sourceWidth > 0
    ? Math.floor(sourceWidth)
    : 0;
  const height = typeof sourceHeight === "number" && Number.isFinite(sourceHeight) && sourceHeight > 0
    ? Math.floor(sourceHeight)
    : 0;
  if (width === 0 || height === 0) {
    return {
      width: STUDIO_BG3D_GLB_TEXTURE_PAINT_DEFAULT_RESOLUTION,
      height: STUDIO_BG3D_GLB_TEXTURE_PAINT_DEFAULT_RESOLUTION,
      capped: false,
    };
  }
  const maxDimension = Math.max(width, height);
  const capped = maxDimension > STUDIO_BG3D_GLB_TEXTURE_PAINT_MAX_RESOLUTION;
  const bucket = capped
    ? STUDIO_BG3D_GLB_TEXTURE_PAINT_MAX_RESOLUTION
    : (STUDIO_BG3D_GLB_TEXTURE_PAINT_RESOLUTIONS.find((size) => size >= maxDimension)
      ?? STUDIO_BG3D_GLB_TEXTURE_PAINT_MAX_RESOLUTION);
  const scale = bucket / maxDimension;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    capped,
  };
}

/* ── 심 보정: 랩 오프셋·점프 절단·블리드 ─────────────────────────────────── */

/**
 * 획이 닿은 UV 경계마다 반대편 타일 고스트 오프셋을 만든다. 항상 (0,0)을 포함한다.
 * 브러시 반경이 경계에 닿지 않는 획은 오프셋이 (0,0)뿐이라 비용이 늘지 않는다.
 */
export function resolveStudioBg3dSeamWrapOffsets(
  stroke: StudioBg3dTexturePaintStroke,
  options: { readonly wrapU?: boolean; readonly wrapV?: boolean } = {},
): readonly (readonly [number, number])[] {
  const wrapU = options.wrapU !== false;
  const wrapV = options.wrapV !== false;
  const radius = stroke.size / 2;
  let minU = 1;
  let maxU = 0;
  let minV = 1;
  let maxV = 0;
  for (const [u, v] of stroke.points) {
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  const uOffsets = [0];
  if (wrapU && minU - radius < 0) uOffsets.push(1);
  if (wrapU && maxU + radius > 1) uOffsets.push(-1);
  const vOffsets = [0];
  if (wrapV && minV - radius < 0) vOffsets.push(1);
  if (wrapV && maxV + radius > 1) vOffsets.push(-1);
  const offsets: (readonly [number, number])[] = [];
  for (const offsetU of uOffsets) {
    for (const offsetV of vOffsets) offsets.push([offsetU, offsetV] as const);
  }
  return offsets;
}

/** 아일랜드 점프로 판정하는 기본 UV 거리. 브러시 지름의 3배와 0.25 중 큰 값. */
export function resolveStudioBg3dUvJumpThreshold(strokeSize: number): number {
  const size = Number.isFinite(strokeSize) && strokeSize > 0 ? strokeSize : 0.04;
  return Math.max(0.25, size * 3);
}

/**
 * UV 점프 지점에서 획을 끊는다. 포인터 드래그가 아일랜드를 건너뛴 자리에 직선을 그으면
 * 텍스처 전체를 가로지르는 번짐이 생기므로, 점프 양쪽을 별도 획으로 나눠 각각의 아일랜드
 * 안에만 남긴다. 점프가 없으면 원래 획 1개를 그대로 돌려준다(참조 유지).
 */
export function splitStudioBg3dTexturePaintStrokeAtUvJumps(
  stroke: StudioBg3dTexturePaintStroke,
  maxJump?: number,
): readonly StudioBg3dTexturePaintStroke[] {
  const threshold = typeof maxJump === "number" && Number.isFinite(maxJump) && maxJump > 0
    ? maxJump
    : resolveStudioBg3dUvJumpThreshold(stroke.size);
  if (stroke.points.length < 2) return [stroke];
  const pieces: StudioBg3dTexturePaintStroke[] = [];
  let start = 0;
  for (let index = 1; index < stroke.points.length; index += 1) {
    const previous = stroke.points[index - 1]!;
    const current = stroke.points[index]!;
    const distance = Math.hypot(current[0] - previous[0], current[1] - previous[1]);
    if (distance > threshold) {
      pieces.push({ ...stroke, points: stroke.points.slice(start, index) });
      start = index;
    }
  }
  if (pieces.length === 0) return [stroke];
  pieces.push({ ...stroke, points: stroke.points.slice(start) });
  return pieces;
}

/** 심 블리드 패스 상한. 그 이상은 보정이 아니라 뭉개기다(VRM 딜레이션과 같은 취지). */
export const STUDIO_BG3D_SEAM_PADDING_MAX_PASSES = 16;

/**
 * 심 블리드 패스 수 정책. 캐릭터 스킨(스키닝 메시)은 아일랜드가 촘촘해 일반 모델보다
 * 넓게 밀어내고, 해상도가 높을수록 같은 밉 레벨에서 닿는 텍셀 수가 많아 패스를 키운다.
 */
export function resolveStudioBg3dSeamPaddingPasses(input: {
  readonly skinned: boolean;
  readonly width: number;
  readonly height: number;
}): number {
  const maxDimension = Math.max(input.width, input.height);
  const highResolution = maxDimension >= 1024;
  const passes = input.skinned
    ? (highResolution ? 8 : 4)
    : (highResolution ? 4 : 2);
  return Math.min(STUDIO_BG3D_SEAM_PADDING_MAX_PASSES, passes);
}

/**
 * 획 레이어 RGBA를 바깥으로 밀어내는 순수 딜레이션. 칠해진(알파>0) 텍셀은 절대 바꾸지 않고,
 * 빈 텍셀은 이웃 중 칠해진 텍셀들의 알파 가중 평균 색 + 이웃 최대 알파로 채운다.
 * 패스 1회당 정확히 한 링(체비쇼프 거리 1)만 자란다. 원본 버퍼는 변경되지 않는다.
 */
export function dilateStudioBg3dPaintLayer(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  passes: number,
): { readonly data: Uint8ClampedArray; readonly filledTexels: number } | null {
  if (
    !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width <= 0 || height <= 0
    || !(source instanceof Uint8ClampedArray)
    || source.length !== width * height * 4
  ) {
    return null;
  }
  const safePasses = Number.isFinite(passes)
    ? Math.max(0, Math.min(STUDIO_BG3D_SEAM_PADDING_MAX_PASSES, Math.floor(passes)))
    : 0;
  let current = new Uint8ClampedArray(source);
  if (safePasses === 0) return { data: current, filledTexels: 0 };
  let filledTexels = 0;
  for (let pass = 0; pass < safePasses; pass += 1) {
    const next = new Uint8ClampedArray(current);
    let filledThisPass = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        if (current[offset + 3]! > 0) continue;
        let weight = 0;
        let red = 0;
        let green = 0;
        let blue = 0;
        let maxAlpha = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const neighbourOffset = (ny * width + nx) * 4;
            const alpha = current[neighbourOffset + 3]!;
            if (alpha <= 0) continue;
            red += current[neighbourOffset]! * alpha;
            green += current[neighbourOffset + 1]! * alpha;
            blue += current[neighbourOffset + 2]! * alpha;
            weight += alpha;
            if (alpha > maxAlpha) maxAlpha = alpha;
          }
        }
        if (weight <= 0) continue;
        next[offset] = Math.round(red / weight);
        next[offset + 1] = Math.round(green / weight);
        next[offset + 2] = Math.round(blue / weight);
        next[offset + 3] = maxAlpha;
        filledThisPass += 1;
      }
    }
    filledTexels += filledThisPass;
    current = next;
    if (filledThisPass === 0) break;
  }
  return { data: current, filledTexels };
}

/* ── GLB 페인트 표면 ─────────────────────────────────────────────────────── */

/** GLB 표면이 추가로 요구하는 2D 컨텍스트 계약(원본 이미지 합성·픽셀 블리드용). */
export interface StudioBg3dGlbPaintCanvas2d extends StudioBg3dPaintCanvas2d {
  clearRect(x: number, y: number, width: number, height: number): void;
  drawImage(source: unknown, dx: number, dy: number, width: number, height: number): void;
  getImageData?(x: number, y: number, width: number, height: number): { data: Uint8ClampedArray };
  putImageData?(imageData: { data: Uint8ClampedArray; width: number; height: number }, dx: number, dy: number): void;
}

export interface StudioBg3dGlbPaintCanvas {
  width: number;
  height: number;
  getContext(contextId: "2d"): StudioBg3dGlbPaintCanvas2d | null;
  toDataURL?: (type?: string) => string;
}

export type StudioBg3dGlbPaintCanvasFactory = (
  width: number,
  height: number,
) => StudioBg3dGlbPaintCanvas;

/**
 * GLB 텍스처 페인트 표면 — 합성 캔버스(원본 텍스처 + 획)가 정본 획으로부터 결정적으로
 * 재생성되는 단위. 1단계 표면과의 차이:
 * - 바탕이 단색이 아니라 원본 텍스처 이미지다(`drawBase` 주입 — Three 어댑터가 원본
 *   텍스처 이미지를 그려 넣는다). 원본이 없으면 이 표면 자체를 만들지 않는 것이 원칙이다.
 * - 획은 별도 레이어 캔버스에 쌓고, 합성 시 랩 고스트 + 심 블리드(픽셀 경로가 있을 때)를
 *   적용한다. 블리드된 레이어는 획이 바뀔 때만 다시 만든다.
 * - device lost 복구는 1단계와 같은 계약: 획으로 전체를 다시 그린다.
 */
export class StudioBg3dGlbTexturePaintSurface {
  readonly canvas: StudioBg3dGlbPaintCanvas;
  private readonly context: StudioBg3dGlbPaintCanvas2d;
  private readonly strokeCanvas: StudioBg3dGlbPaintCanvas;
  private readonly strokeContext: StudioBg3dGlbPaintCanvas2d;
  private readonly bleedCanvas: StudioBg3dGlbPaintCanvas | null;
  private readonly bleedContext: StudioBg3dGlbPaintCanvas2d | null;
  private readonly drawBase: (context: StudioBg3dGlbPaintCanvas2d, width: number, height: number) => void;
  private readonly seamPasses: number;
  private readonly wrapU: boolean;
  private readonly wrapV: boolean;
  private paint: StudioBg3dTexturePaint | null;
  private bleedDirty = true;
  /** 마지막 합성에서 픽셀 블리드가 실제로 적용됐는지(미지원 환경이면 false로 정직하게 남는다). */
  seamBleedApplied = false;

  constructor(input: {
    readonly createCanvas: StudioBg3dGlbPaintCanvasFactory;
    readonly width: number;
    readonly height: number;
    readonly drawBase: (context: StudioBg3dGlbPaintCanvas2d, width: number, height: number) => void;
    readonly paint?: StudioBg3dTexturePaint | null;
    readonly seamPasses?: number;
    readonly wrapU?: boolean;
    readonly wrapV?: boolean;
  }) {
    this.width = input.width;
    this.height = input.height;
    this.drawBase = input.drawBase;
    this.seamPasses = typeof input.seamPasses === "number" && Number.isFinite(input.seamPasses)
      ? Math.max(0, Math.min(STUDIO_BG3D_SEAM_PADDING_MAX_PASSES, Math.floor(input.seamPasses)))
      : 4;
    this.wrapU = input.wrapU !== false;
    this.wrapV = input.wrapV !== false;
    this.canvas = input.createCanvas(this.width, this.height);
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("studio-bg3d glb texture paint: 2d context unavailable");
    this.context = context;
    this.strokeCanvas = input.createCanvas(this.width, this.height);
    const strokeContext = this.strokeCanvas.getContext("2d");
    if (!strokeContext) throw new Error("studio-bg3d glb texture paint: stroke 2d context unavailable");
    this.strokeContext = strokeContext;
    // 블리드 레이어는 픽셀 읽기/쓰기가 모두 되는 환경에서만 만든다.
    const canBleed = this.seamPasses > 0
      && typeof strokeContext.getImageData === "function"
      && typeof strokeContext.putImageData === "function";
    this.bleedCanvas = canBleed ? input.createCanvas(this.width, this.height) : null;
    this.bleedContext = this.bleedCanvas ? this.bleedCanvas.getContext("2d") : null;
    this.paint = input.paint ? normalizeStudioBg3dTexturePaint(input.paint) : null;
    this.repaintStrokeLayer();
    this.composite();
  }

  readonly width: number;
  readonly height: number;

  get currentPaint(): StudioBg3dTexturePaint | null {
    return this.paint;
  }

  private paintStrokeWithSeam(stroke: StudioBg3dTexturePaintStroke): void {
    const offsets = resolveStudioBg3dSeamWrapOffsets(stroke, {
      wrapU: this.wrapU,
      wrapV: this.wrapV,
    });
    for (const [offsetU, offsetV] of offsets) {
      paintStudioBg3dTextureStroke(this.strokeContext, stroke, this.width, this.height, offsetU, offsetV);
    }
    this.strokeContext.globalAlpha = 1;
  }

  private repaintStrokeLayer(): void {
    this.strokeContext.clearRect(0, 0, this.width, this.height);
    if (this.paint) {
      for (const stroke of this.paint.strokes) this.paintStrokeWithSeam(stroke);
    }
    this.bleedDirty = true;
  }

  private refreshBleedLayer(): void {
    if (!this.bleedCanvas || !this.bleedContext || !this.bleedDirty) return;
    const read = this.strokeContext.getImageData?.(0, 0, this.width, this.height);
    if (!read) {
      this.seamBleedApplied = false;
      return;
    }
    const dilated = dilateStudioBg3dPaintLayer(read.data, this.width, this.height, this.seamPasses);
    if (!dilated) {
      this.seamBleedApplied = false;
      return;
    }
    this.bleedContext.clearRect(0, 0, this.width, this.height);
    // Create a fresh ArrayBuffer-backed buffer: dilated.data may be typed as
    // Uint8ClampedArray<ArrayBufferLike>, while the DOM ImageData overload requires ArrayBuffer.
    const pixels = new Uint8ClampedArray(dilated.data);
    // Node 등 ImageData가 없는 환경(테스트 가짜)에서는 구조적으로 같은 객체로 대체한다.
    const imageData = typeof ImageData !== "undefined"
      ? new ImageData(pixels, this.width, this.height)
      : { data: pixels, width: this.width, height: this.height };
    this.bleedContext.putImageData?.(imageData, 0, 0);
    this.seamBleedApplied = true;
    this.bleedDirty = false;
  }

  private composite(): void {
    this.context.clearRect(0, 0, this.width, this.height);
    this.drawBase(this.context, this.width, this.height);
    this.refreshBleedLayer();
    const layer = this.seamBleedApplied && this.bleedCanvas ? this.bleedCanvas : this.strokeCanvas;
    this.context.drawImage(layer, 0, 0, this.width, this.height);
    this.context.globalAlpha = 1;
  }

  /**
   * 획 1개를 확정한다. UV 점프는 먼저 절단해 조각별로 넣는다 — 한 번의 드래그가
   * 아일랜드를 건너면 조각 수만큼 획이 늘 수 있다. 한도에 닿으면 false.
   */
  commitStroke(stroke: StudioBg3dTexturePaintStroke): boolean {
    const pieces = splitStudioBg3dTexturePaintStrokeAtUvJumps(stroke);
    let next = this.paint;
    for (const piece of pieces) {
      const appended = appendStudioBg3dTexturePaintStroke(next, piece);
      if (!appended) return false;
      next = appended;
    }
    this.paint = next;
    // 증분: 새 조각만 획 레이어에 그리고 다시 합성한다(바탕은 합성 단계가 다시 깐다).
    for (const piece of pieces) this.paintStrokeWithSeam(piece);
    this.bleedDirty = true;
    this.composite();
    return true;
  }

  setPaint(paint: StudioBg3dTexturePaint | null): void {
    this.paint = paint ? normalizeStudioBg3dTexturePaint(paint) : null;
    this.repaintStrokeLayer();
    this.composite();
  }

  undoLastStroke(): StudioBg3dTexturePaintStroke | null {
    const { paint, removed } = removeLastStudioBg3dTexturePaintStroke(this.paint);
    if (!removed) return null;
    this.paint = paint;
    this.repaintStrokeLayer();
    this.composite();
    return removed;
  }

  /** WebGL 컨텍스트 상실 후 복구: 정본 획으로 획 레이어와 합성을 통째로 재생성한다. */
  recoverFromContextLoss(): void {
    this.repaintStrokeLayer();
    this.composite();
  }

  exportPngDataUrl(): string {
    if (typeof this.canvas.toDataURL !== "function") {
      throw new Error("studio-bg3d glb texture paint: canvas export unsupported");
    }
    return this.canvas.toDataURL("image/png");
  }
}

export type { StudioBg3dPaintCanvas, StudioBg3dPaintCanvas2d, StudioBg3dPaintCanvasFactory };
