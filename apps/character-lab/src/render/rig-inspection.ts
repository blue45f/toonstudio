/**
 * 리그 점검 보고(순수 타입). Babylon 객체를 밖으로 내보내지 않고(React state 금지 규칙) 파츠·본·morph 수를 평문으로 노출한다.
 * NullEngine 테스트는 이 보고로 "메시 이름·morph 수·본 수"를 실제 GLB와 대조하고, UI는 진단 표에 쓸 수 있다.
 */
import type { MaterialPresetId, PartRole } from "../contracts";

export interface RigPartInspection {
  readonly id: string;
  readonly partId: number;
  readonly materialId: number;
  readonly role: PartRole;
  readonly materialPreset: MaterialPresetId;
  readonly colorHex: string;
  readonly visible: boolean;
  /** 헤어 LOD 정책 등으로 항상 숨김 */
  readonly forceHidden: boolean;
  readonly forceHiddenReasonKo: string | null;
  /** 이 파츠를 이루는 메시 이름(멀티 프리미티브면 여러 개) */
  readonly meshNames: readonly string[];
  readonly outlineMeshNames: readonly string[];
  readonly vertexCount: number;
  readonly triangleCount: number;
  /** 메시별 MorphTargetManager의 타깃 수 합 */
  readonly morphTargetCount: number;
  /** 메시별 타깃 수(멀티 프리미티브가 각자 매니저를 갖는지 확인) */
  readonly morphTargetCountsByMesh: readonly number[];
  /** 메시별로 influence > 0인 타깃 수(멀티 프리미티브에 morph가 모두 적용됐는지 확인) */
  readonly activeMorphTargetsByMesh: readonly number[];
  /** 알베도 텍스처가 있는지(키트 `tint`가 없으면 있을 때 레시피 색 틴트를 적용하지 않는다) */
  readonly hasAlbedoTexture: boolean;
  /** 키트 파츠의 색 틴트 모드(절차·제작 패키지는 없음) */
  readonly tintMode?: "recolor" | "fixed";
  /** 메시별 SubMesh 수. 키트 몸 가림도 보이는 삼각형을 이은 인덱스 버퍼 하나라 스킨 몸은 늘 1이다(구간 수는 `BodyMaskReport.visibleRuns`). */
  readonly subMeshCountsByMesh?: readonly number[];
  /** 메시별 `alwaysSelectAsActiveMesh`(키트 몸은 SubMesh가 하나라 false — 엔진이 로더의 값을 덮어쓰지 않는지 확인) */
  readonly alwaysSelectAsActiveByMesh?: readonly boolean[];
  /** 메시별 `metadata.partId`(규약 밖 metadata면 -1) */
  readonly meshMetadataPartIds: readonly number[];
  /** `_Outline` 셸 메시별 `metadata.partId`·outline 플래그 */
  readonly outlineMetadataPartIds: readonly number[];
  readonly skinned: boolean;
  /** 메시들의 `overrideMaterialSideOrientation`(우수 좌표 절차 메시는 CCW = 1이어야 앞면이 그려진다) */
  readonly sideOrientations: readonly (number | null)[];
  /** 현재 재질 클래스 이름(PBRMaterial·ShaderMaterial …) */
  readonly materialClass: string;
  readonly hasToonMaterial: boolean;
  /** 툰 재질이 정점 색(`COLOR_0` AO) define으로 만들어졌는지(툰 재질이 있을 때만) */
  readonly toonVertexColor?: boolean;
  /** 툰 재질에 들어 있는 알파 컷오프(glTF MASK, 0 = 끔; 툰 재질이 있을 때만) */
  readonly toonAlphaCutoff?: number;
  /** 메시별 정점 색 버퍼 유무 */
  readonly meshesHaveVertexColor?: readonly boolean[];
  /** 메시 `renderOutline`(툰 hull 모드) */
  readonly renderOutline: boolean;
  /** 엣지 렌더러가 붙어 있는지(툰 edge 모드) */
  readonly edgesRendering: boolean;
  /** `_Outline` 셸 가시 여부(툰 hull 모드에서만 true) */
  readonly outlineShellVisible: boolean;
}

export interface RigInspection {
  readonly kind: "procedural" | "package" | "kit";
  readonly poseConvention: "bone-local" | "model-space";
  readonly parts: readonly RigPartInspection[];
  readonly boneCount: number;
  readonly humanoidBoneCount: number;
  readonly auxiliaryBoneCount: number;
  readonly skeletonBoneCount: number;
  readonly morphNames: readonly string[];
  /** 매핑된 morph 이름(타깃 객체 수가 아니라 이름 수) */
  readonly morphNameCount: number;
  /** morph 이름 → 현재 influence(같은 이름의 타깃이 여럿이면 최댓값) */
  readonly morphInfluences: Readonly<Record<string, number>>;
  readonly chainCount: number;
  readonly colliderCount: number;
  readonly notes: readonly string[];
}

/** 장면 설정 평문 보고(scene-builder `inspectCharacterScene`). 우수 좌표·투명 clear·톤맵·광원·그림자 생성기를 확인한다. */
export interface SceneInspection {
  readonly rightHanded: boolean;
  readonly clearColor: readonly [number, number, number, number];
  readonly toneMappingEnabled: boolean;
  /** `ImageProcessingConfiguration.TONEMAPPING_*` 상수 값 */
  readonly toneMappingType: number;
  readonly exposure: number;
  readonly environmentIntensity: number;
  readonly cameraNames: readonly string[];
  readonly activeCamera: string | null;
  readonly lightNames: readonly string[];
  /** 그림자 생성기 클래스(CascadedShadowGenerator | ShadowGenerator | none) */
  readonly shadowGenerator: string;
  readonly shadowCascades: number | null;
  /** key 광원의 그림자 사용 여부 */
  readonly shadowEnabled: boolean;
  readonly shadowMapSize: number | null;
  readonly sssPrePass: boolean;
  /** 장면 객체 수(소스 재로드 때 누수가 없는지 확인) */
  readonly meshCount: number;
  /** 메인(뷰포트) 카메라가 그릴 메시 수(가시·활성·레이어 마스크 통과). 썸네일 임시 리그는 여기 포함되지 않는다. */
  readonly viewportMeshCount: number;
  readonly skeletonCount: number;
  readonly materialCount: number;
  readonly textureCount: number;
  readonly transformNodeCount: number;
}

/** 부위별 페인트 텍스처 점검 보고 */
export interface PaintInspection {
  readonly part: PartRole;
  readonly width: number;
  readonly height: number;
  readonly revision: number;
  /** 텍스처 `invertY` — 페인트 규약은 false(레이어 첫 행 = UV v 0) */
  readonly invertY: boolean;
  /** 텍스처가 decalMap으로 연결된 메시 수 */
  readonly decalMeshes: number;
  /** 해당 부위 PBR 재질의 decalMap이 켜졌는지 */
  readonly decalEnabled: boolean;
}

/** VARCO 3D 프리뷰·인스펙터 호환 UV 심 & 토폴로지 점검 보고 */
export interface Varco3dTopologyInspectionReport {
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly weldedSpatialVertexCount: number;
  readonly uvSeamEdgeCount: number;
  readonly uvSeamLineIndices: Uint32Array;
  readonly wireframeLineIndexCount: number;
  readonly faceTopology: "triangle" | "quad";
}

/**
 * 캐릭터 랩 메쉬의 정점·UV·인덱스 버퍼로부터 공간 용접 정점 수, UV 심(Seam) 엣지 선분,
 * Triangle/Quad 와이어프레임 선분 수를 계산합니다 (`uvSeamWorker` 및 `WireframeManager` 규약).
 */
export function inspectCharacterLabMeshTopologyAndUvSeams(options: {
  readonly positions: ArrayLike<number>;
  readonly uvs: ArrayLike<number>;
  readonly indices?: ArrayLike<number> | null;
  readonly faceTopology?: "triangle" | "quad";
}): Varco3dTopologyInspectionReport {
  const vertexCount = Math.floor(options.positions.length / 3);
  const faceTopology = options.faceTopology ?? "triangle";
  const indexCount = options.indices ? options.indices.length : vertexCount;
  const triangleCount = Math.floor(indexCount / 3);

  if (vertexCount < 3 || options.uvs.length < vertexCount * 2) {
    return Object.freeze({
      vertexCount,
      triangleCount,
      weldedSpatialVertexCount: 0,
      uvSeamEdgeCount: 0,
      uvSeamLineIndices: new Uint32Array(0),
      wireframeLineIndexCount: 0,
      faceTopology,
    });
  }

  const qx = new Int32Array(vertexCount);
  const qy = new Int32Array(vertexCount);
  const qz = new Int32Array(vertexCount);
  for (let i = 0; i < vertexCount; i += 1) {
    qx[i] = Math.round((options.positions[i * 3] ?? 0) * 1e5);
    qy[i] = Math.round((options.positions[i * 3 + 1] ?? 0) * 1e5);
    qz[i] = Math.round((options.positions[i * 3 + 2] ?? 0) * 1e5);
  }

  let posBuckets = 1;
  while (posBuckets < vertexCount * 2) posBuckets <<= 1;
  const posMask = posBuckets - 1;
  const posTable = new Int32Array(posBuckets).fill(-1);
  const weldedId = new Uint32Array(vertexCount);
  let weldedSpatialVertexCount = 0;

  for (let i = 0; i < vertexCount; i += 1) {
    let slot =
      (Math.imul(qx[i] ?? 0, 73856093) ^
        Math.imul(qy[i] ?? 0, 19349663) ^
        Math.imul(qz[i] ?? 0, 83492791)) &
      posMask;
    for (;;) {
      const head = posTable[slot] ?? -1;
      if (head === -1) {
        posTable[slot] = i;
        weldedId[i] = weldedSpatialVertexCount++;
        break;
      }
      if (qx[head] === qx[i] && qy[head] === qy[i] && qz[head] === qz[i]) {
        weldedId[i] = weldedId[head] ?? 0;
        break;
      }
      slot = (slot + 1) & posMask;
    }
  }

  const qu = new Int32Array(vertexCount);
  const qv = new Int32Array(vertexCount);
  for (let i = 0; i < vertexCount; i += 1) {
    qu[i] = Math.round((options.uvs[i * 2] ?? 0) * 1e6);
    qv[i] = Math.round((options.uvs[i * 2 + 1] ?? 0) * 1e6);
  }

  let edgeBuckets = 1;
  while (edgeBuckets < indexCount * 2) edgeBuckets <<= 1;
  const edgeMask = edgeBuckets - 1;
  const edgeU = new Int32Array(edgeBuckets).fill(-1);
  const edgeW = new Uint32Array(edgeBuckets);
  const edgeA = new Uint32Array(edgeBuckets);
  const edgeB = new Uint32Array(edgeBuckets);
  const edgeSeam = new Uint8Array(edgeBuckets);
  let uvSeamEdgeCount = 0;

  for (let t = 0; t + 2 < indexCount; t += 3) {
    for (let e = 0; e < 3; e += 1) {
      let a = options.indices ? (options.indices[t + e] ?? 0) : t + e;
      let b = options.indices ? (options.indices[t + ((e + 1) % 3)] ?? 0) : t + ((e + 1) % 3);
      let u = weldedId[a] ?? 0;
      let w = weldedId[b] ?? 0;
      if (u > w) {
        const tmpIdx = a;
        a = b;
        b = tmpIdx;
        const tmpWeld = u;
        u = w;
        w = tmpWeld;
      }
      let slot = (Math.imul(u, 2654435761) ^ Math.imul(w, 2246822519)) & edgeMask;
      for (;;) {
        const curU = edgeU[slot] ?? -1;
        if (curU === -1) {
          edgeU[slot] = u;
          edgeW[slot] = w;
          edgeA[slot] = a;
          edgeB[slot] = b;
          break;
        }
        if (curU === u && edgeW[slot] === w) {
          if (edgeSeam[slot] === 0) {
            const firstA = edgeA[slot] ?? 0;
            const firstB = edgeB[slot] ?? 0;
            if (
              qu[a] !== qu[firstA] ||
              qv[a] !== qv[firstA] ||
              qu[b] !== qu[firstB] ||
              qv[b] !== qv[firstB]
            ) {
              edgeSeam[slot] = 1;
              uvSeamEdgeCount += 1;
            }
          }
          break;
        }
        slot = (slot + 1) & edgeMask;
      }
    }
  }

  const uvSeamLineIndices = new Uint32Array(uvSeamEdgeCount * 2);
  let ptr = 0;
  for (let i = 0; i < edgeBuckets; i += 1) {
    if (edgeSeam[i] === 1) {
      uvSeamLineIndices[ptr++] = edgeA[i] ?? 0;
      uvSeamLineIndices[ptr++] = edgeB[i] ?? 0;
    }
  }

  const wireframeLineIndexCount =
    faceTopology === "quad"
      ? Math.floor(indexCount / 6) * 8 + Math.floor((indexCount % 6) / 3) * 6
      : triangleCount * 6;

  return Object.freeze({
    vertexCount,
    triangleCount,
    weldedSpatialVertexCount,
    uvSeamEdgeCount,
    uvSeamLineIndices,
    wireframeLineIndexCount,
    faceTopology,
  });
}

