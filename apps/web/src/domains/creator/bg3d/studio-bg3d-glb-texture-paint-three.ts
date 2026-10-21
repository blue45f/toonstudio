/**
 * Studio BG3D 3D 표면 직접 그리기 2단계 — GLB 텍스처 페인트의 Three.js 어댑터.
 *
 * 순수 엔진(studio-bg3d-glb-texture-paint)이 정한 대상 키·해상도·심 정책을 실제 Three 장면에
 * 연결한다. 이 파일만 three에 의존하고, 판정·정규화·심 계산은 순수 모듈이 맡는다.
 *
 * 대상 키 계약: 장면을 깊이 우선으로 순회하며 렌더 가능한 메시 프리미티브가 나올 때마다
 * 순서(ordinal)를 매긴다 — glTF JSON 분석기와 같은 규칙이라, 문서에 저장된 `mesh-<n>` 키가
 * 런타임 수집 결과와 그대로 맞는다. 재질이 배열인 메시(그룹 프리미티브)는 슬롯 키를 쓴다.
 *
 * 소유권: 원본 텍스처와 지오메트리는 모델 캐시가 소유한다. 여기서는 편집 클론이 소유한
 * 재질의 `map`만 페인트 합성 CanvasTexture로 교체하고, dispose에서 원본 map으로 되돌린 뒤
 * 합성 텍스처만 해제한다. 원본 텍스처 이미지 객체는 절대 수정하지 않는다(획은 새 캔버스에
 * 원본을 그려 넣고 그 위에 얹는다).
 */

import * as THREE from "three";

import {
  StudioBg3dGlbTexturePaintSurface,
  getStudioBg3dModelTexturePaintForTarget,
  resolveStudioBg3dGlbTexturePaintSize,
  resolveStudioBg3dSeamPaddingPasses,
  createStudioBg3dModelTexturePaintTargetKey,
  type StudioBg3dGlbPaintCanvas,
  type StudioBg3dModelTexturePaint,
} from "./studio-bg3d-glb-texture-paint";

type PaintableMaterial = THREE.Material & {
  map?: THREE.Texture | null;
};

export interface StudioBg3dGlbThreePaintTarget {
  readonly targetKey: string;
  readonly meshOrdinal: number;
  readonly slot: number;
  readonly mesh: THREE.Object3D;
  readonly material: PaintableMaterial;
  /** 교체 전 원본 base color 텍스처. dispose 복원의 기준. */
  readonly originalMap: THREE.Texture;
  readonly textureWidth: number;
  readonly textureHeight: number;
  readonly skinned: boolean;
  readonly wrapRepeat: boolean;
}

export interface StudioBg3dGlbThreePaintTargetCollection {
  readonly targets: readonly StudioBg3dGlbThreePaintTarget[];
  readonly meshCount: number;
  /** UV가 없어 대상에서 제외된 메시 수(안내 상태의 근거). */
  readonly meshesWithoutUv: number;
  /** base color 텍스처가 없어 제외된 (메시, 슬롯) 수. */
  readonly slotsWithoutTexture: number;
}

function textureImageSize(texture: THREE.Texture): { width: number; height: number } | null {
  const image = (texture as THREE.Texture & { image?: unknown }).image;
  if (!image || typeof image !== "object") return null;
  const record = image as { width?: unknown; height?: unknown; videoWidth?: unknown; videoHeight?: unknown };
  const width = typeof record.width === "number" ? record.width
    : typeof record.videoWidth === "number" ? record.videoWidth : 0;
  const height = typeof record.height === "number" ? record.height
    : typeof record.videoHeight === "number" ? record.videoHeight : 0;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width: Math.floor(width), height: Math.floor(height) };
}

/**
 * 편집 클론 루트에서 페인트 가능한 대상을 수집한다. UV가 없거나 base color 텍스처(map)가
 * 없거나 텍스처 이미지 크기를 알 수 없는 슬롯은 대상이 되지 않는다 — 그릴 캔버스가 없다는
 * 사실을 수집 결과의 제외 카운터로 정직하게 남긴다.
 */
export function collectStudioBg3dGlbTexturePaintTargets(
  root: THREE.Object3D,
): StudioBg3dGlbThreePaintTargetCollection {
  const targets: StudioBg3dGlbThreePaintTarget[] = [];
  let meshCount = 0;
  let meshesWithoutUv = 0;
  let slotsWithoutTexture = 0;
  let ordinal = 0;
  root.traverse((object) => {
    const renderable = object as THREE.Object3D & {
      isMesh?: boolean;
      isSkinnedMesh?: boolean;
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    if (!renderable.isMesh) return;
    meshCount += 1;
    const meshOrdinal = ordinal;
    ordinal += 1;
    const geometry = renderable.geometry;
    const hasUv = Boolean(geometry && typeof geometry.getAttribute === "function" && geometry.getAttribute("uv"));
    if (!hasUv) {
      meshesWithoutUv += 1;
      return;
    }
    const materials = Array.isArray(renderable.material)
      ? renderable.material
      : renderable.material ? [renderable.material] : [];
    materials.forEach((material, slot) => {
      const paintable = material as PaintableMaterial;
      const map = paintable.map ?? null;
      if (!map) {
        slotsWithoutTexture += 1;
        return;
      }
      const size = textureImageSize(map);
      if (!size) {
        slotsWithoutTexture += 1;
        return;
      }
      targets.push({
        targetKey: createStudioBg3dModelTexturePaintTargetKey(meshOrdinal, slot),
        meshOrdinal,
        slot,
        mesh: object,
        material: paintable,
        originalMap: map,
        textureWidth: size.width,
        textureHeight: size.height,
        skinned: renderable.isSkinnedMesh === true,
        wrapRepeat:
          map.wrapS === THREE.RepeatWrapping && map.wrapT === THREE.RepeatWrapping,
      });
    });
  });
  return { targets, meshCount, meshesWithoutUv, slotsWithoutTexture };
}

export interface StudioBg3dGlbTexturePaintApplication {
  readonly appliedTargetKeys: readonly string[];
  /** 원본 텍스처가 2048 캡보다 커서 축소 래스터화된 대상이 있었는지. */
  readonly resolutionCapped: boolean;
  /** 픽셀 블리드가 실제로 적용된 대상 수(미지원 환경이면 0 — 거짓 완료를 막는 근거). */
  readonly seamBleedTargetCount: number;
  dispose(): void;
}

/**
 * 문서의 모델 페인트를 수집된 대상들에 적용한다. 같은 재질을 공유하는 대상이 여럿이면
 * 획을 순서(ordinal)대로 한 캔버스에 합성한다 — 텍스처가 하나인데 캔버스가 갈리면
 * 마지막 것만 남는 결함을 막기 위해서다.
 */
export function applyStudioBg3dGlbTexturePaint(
  targets: readonly StudioBg3dGlbThreePaintTarget[],
  paint: StudioBg3dModelTexturePaint | null | undefined,
  options: {
    readonly createCanvas?: (width: number, height: number) => StudioBg3dGlbPaintCanvas;
  } = {},
): StudioBg3dGlbTexturePaintApplication {
  const createCanvas = options.createCanvas ?? ((width: number, height: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas as unknown as StudioBg3dGlbPaintCanvas;
  });
  const appliedTargetKeys: string[] = [];
  const paintedTextures: THREE.Texture[] = [];
  const touchedMaterials: { material: PaintableMaterial; originalMap: THREE.Texture }[] = [];
  let resolutionCapped = false;
  let seamBleedTargetCount = 0;

  if (paint) {
    const byMaterial = new Map<PaintableMaterial, StudioBg3dGlbThreePaintTarget[]>();
    for (const target of targets) {
      if (!getStudioBg3dModelTexturePaintForTarget(paint, target.targetKey)) continue;
      const group = byMaterial.get(target.material) ?? [];
      group.push(target);
      byMaterial.set(target.material, group);
    }
    for (const [material, group] of byMaterial) {
      const ordered = [...group].sort((a, b) => a.meshOrdinal - b.meshOrdinal || a.slot - b.slot);
      const first = ordered[0]!;
      const size = resolveStudioBg3dGlbTexturePaintSize(first.textureWidth, first.textureHeight);
      if (size.capped) resolutionCapped = true;
      // 공유 텍스처 합성: 대상별 획을 순서대로 겹친 하나의 페인트로 만든다.
      const strokes = ordered.flatMap((target) =>
        getStudioBg3dModelTexturePaintForTarget(paint, target.targetKey)?.strokes ?? []);
      if (strokes.length === 0) continue;
      const originalMap = first.originalMap;
      const surface = new StudioBg3dGlbTexturePaintSurface({
        createCanvas,
        width: size.width,
        height: size.height,
        drawBase: (context) => {
          const image = (originalMap as THREE.Texture & { image?: unknown }).image;
          if (image) context.drawImage(image, 0, 0, size.width, size.height);
        },
        paint: { version: 1, strokes },
        seamPasses: resolveStudioBg3dSeamPaddingPasses({
          skinned: ordered.some((target) => target.skinned),
          width: size.width,
          height: size.height,
        }),
        wrapU: first.wrapRepeat,
        wrapV: first.wrapRepeat,
      });
      if (surface.seamBleedApplied) seamBleedTargetCount += 1;
      const texture = new THREE.CanvasTexture(surface.canvas as unknown as HTMLCanvasElement);
      // 원본 텍스처의 샘플링 계약을 그대로 잇는다. 특히 glTF 텍스처는 flipY=false라
      // CanvasTexture 기본값(true)으로 두면 그림이 상하 반전된 채 합성된다.
      texture.flipY = originalMap.flipY;
      texture.colorSpace = originalMap.colorSpace;
      texture.wrapS = originalMap.wrapS;
      texture.wrapT = originalMap.wrapT;
      texture.repeat.copy(originalMap.repeat);
      texture.offset.copy(originalMap.offset);
      texture.center.copy(originalMap.center);
      texture.rotation = originalMap.rotation;
      texture.anisotropy = originalMap.anisotropy;
      paintedTextures.push(texture);
      touchedMaterials.push({ material, originalMap });
      material.map = texture;
      material.needsUpdate = true;
      for (const target of ordered) appliedTargetKeys.push(target.targetKey);
    }
  }

  let disposed = false;
  return {
    appliedTargetKeys,
    resolutionCapped,
    seamBleedTargetCount,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { material, originalMap } of touchedMaterials) {
        if ((material as PaintableMaterial).map !== originalMap) {
          material.map = originalMap;
          material.needsUpdate = true;
        }
      }
      for (const texture of paintedTextures) texture.dispose();
    },
  };
}
