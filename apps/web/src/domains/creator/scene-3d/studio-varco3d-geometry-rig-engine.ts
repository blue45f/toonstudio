/**
 * Studio 3D 지오메트리·UV 심·쿼드 토폴로지·리그/페인트·스튜디오 이펙트 엔진 — VARCO 3D 심층 역공학 모듈 (2단계).
 *
 * `https://3d.varco.ai/_assets/uvSeamWorker-c4NtVPu4.js` 및 `index-0_QlvNS9.js`(`WireframeManager`,
 * `LightingManager.bakeEnvironmentMatcap`, `BoneVisualizer`, `CameraTracker`, `RigEditManager`,
 * `StudioSceneManager`, `WaveRevealEffect`, `VoxelGridPreview`)의 핵심 알고리즘과 수식을 역공학하여
 * ToonStudio 3D 뷰포트 및 캐릭터 랩에 이식한 순수 연산 모듈입니다.
 *
 * 주요 역공학 기능:
 * 1. **무할당 오픈 어드레싱 공간 해시 + 엣지 해시 UV 심 검출기 (`computeVarco3dUvSeamLineIndices`)**:
 *    - 3D 정점 좌표를 `1e5` 스케일로 양자화 후 공간 해시(`73856093`, `19349663`, `83492791`)로 중복 정점을 용접(weld)
 *    - 2D UV 좌표를 `1e6` 스케일로 양자화 후 무방향 삼각형 엣지 해시(`2654435761`, `2246822519`)로 인접 삼각형의
 *      동일 3D 엣지에서 UV 불연속이 발생하는 심(seam) 선분 인덱스를 `Uint32Array`로 추출
 *    - 다중 메쉬 배치 처리 시 `modern-web-guidance`(`break-up-long-tasks`) 규칙에 따라 50ms 예산마다
 *      `scheduler.yield()`(미지원 브라우저 `setTimeout(0)` 폴백)로 메인 스레드 양보 (`computeVarco3dUvSeamLineIndicesBatchAsync`)
 * 2. **Triangle vs Quad 와이어프레임 토폴로지 추출기 (`computeVarco3dWireframeLineIndices`)**:
 *    - `triangle` 모드: 삼각형당 3변(`6` 인덱스) 생성
 *    - `quad` 모드: 연속된 두 삼각형 `(v0,v1,v2)`, `(v3,v4,v5)`에서 내부 대각선을 제외한 사각형 외곽 4변
 *      `(v0,v1),(v1,v2),(v2,v5),(v5,v0)`(`8` 인덱스) 추출 및 홀수 잔여 삼각형 3변 폴백
 * 3. **HDRI 환경광 기반 클레이 Matcap 색조·휘도 베이킹 수식 (`evaluateVarco3dEnvironmentMatcapTint`)**:
 *    - Rec.709 휘도(`0.2126 R + 0.7152 G + 0.0722 B`) 대비 평균 환경 휘도 비율(`[0.6, 1.2]`)과 색조(`[0.5, 1.5]`)를 합성
 * 4. **캔버스 `Shift + 우클릭 드래그` 직결 조명 회전 & 브러시/데칼 맵 프리뷰 연동**:
 *    - `bump`/`flatten` 브러시 채널 활성 시 `M` 단축키가 자동으로 `"normal"` 맵 인스펙터를 선호하도록 매핑
 *    - 데칼 가시성(`isTextureOn && (mapPreviewMode === null || mapPreviewMode === "baseColor")`) 자동 판정
 * 5. **`CameraTracker` Y축 클램프 추적 · `BoneVisualizer` 메쉬 채도 감쇠(`0.12`) · 통합 리그 Undo/Redo 스택**:
 *    - 애니메이션 루트 본 추적 시 수직 흔들림을 `±0.3m`(`yFollowRange`)로 제한하고 사용자 조작 시 보간 속도를 `0.1 → 0.03`으로 완화
 *    - 스켈레톤/웨이트 편집 시 메쉬 색상을 휘도 기준 `88%` 탈색(`mix(luma, rgb, 0.12)`)하여 본 기즈모 가독성 극대화
 *    - `"pose" | "skeleton" | "paint"` 3종 태그를 단일 타임라인으로 묶는 `RigEditManager` 통합 히스토리 및
 *      `WaveRevealEffect` / `VoxelGridPreview` 스튜디오 전환 이펙트 곡선 계산
 */

import {
  lightingDialDegToRad,
  lightingRadToDialDeg,
  type StudioMannequinVec3,
  type StudioVarco3dFaceTopology,
  type StudioVarco3dMapPreviewMode,
  type StudioVarco3dViewportHudState,
} from "./studio-varco3d-preview-inspector";

/** 와이어프레임 및 UV 심 라인의 Z-파이팅 방지용 뷰 공간 깊이 스케일 (`mvPosition.xyz *= 0.999`). */
export const STUDIO_VARCO3D_OVERLAY_DEPTH_BIAS = 0.999 as const;

/** VARCO 3D 와이어프레임 기본 색상 (`0x3a3a3a` = `3815994`) 및 불투명도 (`0.45`). */
export const STUDIO_VARCO3D_WIREFRAME_COLOR_HEX = "#3a3a3a" as const;
export const STUDIO_VARCO3D_WIREFRAME_OPACITY = 0.45 as const;

/** `BoneVisualizer` 옥타헤드럴 본 기즈모 비례 상수. */
export const STUDIO_VARCO3D_BONE_VISUALIZER_METRICS = Object.freeze({
  boneWidthRatio: 0.12,
  boneNeckRatio: 0.15,
  unitLength: 1,
  jointGeoRadius: 0.008,
  jointRadiusRatio: 0.12,
  rigDimSaturationMix: 0.12,
  modeJointFactor: Object.freeze({
    default: Object.freeze({ joint: 0, effector: 0 }),
    pose: Object.freeze({ joint: 1.35, effector: 1.35 }),
    skeleton: Object.freeze({ joint: 1.35, effector: 1.35 }),
    weight: Object.freeze({ joint: 1.35, effector: 1.35 }),
  }),
});

/** `CameraTracker` 기본 추적 상수 (`LERP_SPEED = 0.1`, `INTERACTION_LERP_SPEED = 0.03`, `yFollowRange = 0.3`). */
export const STUDIO_VARCO3D_CAMERA_TRACKER_DEFAULTS = Object.freeze({
  lerpSpeed: 0.1,
  interactionLerpSpeed: 0.03,
  yFollowRange: 0.3,
  defaultCameraOffset: Object.freeze({ x: 0, y: 0.5, z: 3 }),
  defaultLookAtOffset: Object.freeze({ x: 0, y: 0.5, z: 0 }),
});

/** `VoxelGridPreview` 스튜디오 로딩/생성 프리뷰 상수. */
export const STUDIO_VARCO3D_VOXEL_PREVIEW_METRICS = Object.freeze({
  resolution: 38,
  maxCells: 10000,
  fadeInMs: 1600,
  entryWobbleAmp: 0.1,
  entryWobbleHz: 1.4,
  entryBreathe: 0.35,
  exitWaitMs: 750,
  loopDecayMs: 300,
  sparkleMs: 1100,
  sweepPeriodMs: 5200,
  sweepRestEnd: 0.12,
  sweepBuildEnd: 0.72,
  sweepStrength: 0.08,
  sweepDim: 0.6,
  sweepSwell: 0.12,
  sweepSwellBand: 0.08,
});

function cleanZero(n: number): number {
  return Object.is(n, -0) ? 0 : n;
}

/**
 * `uvSeamWorker-c4NtVPu4.js` 역공학:
 * 3D 정점 배열(`positions`, 3N)과 2D UV 배열(`uvs`, 2N), 선택적 인덱스 배열(`index`)로부터
 * 동일 3D 공간 엣지를 공유하는 두 삼각형의 UV가 불연속인 **UV 심(Seam) 선분 인덱스 쌍(`Uint32Array`)**을 추출합니다.
 */
export function computeVarco3dUvSeamLineIndices(
  positions: ArrayLike<number>,
  uvs: ArrayLike<number>,
  index?: ArrayLike<number> | null,
): Uint32Array {
  const vertexCount = Math.floor(positions.length / 3);
  if (vertexCount < 3 || uvs.length < vertexCount * 2) {
    return new Uint32Array(0);
  }

  const qx = new Int32Array(vertexCount);
  const qy = new Int32Array(vertexCount);
  const qz = new Int32Array(vertexCount);
  for (let i = 0; i < vertexCount; i += 1) {
    qx[i] = Math.round((positions[i * 3] ?? 0) * 1e5);
    qy[i] = Math.round((positions[i * 3 + 1] ?? 0) * 1e5);
    qz[i] = Math.round((positions[i * 3 + 2] ?? 0) * 1e5);
  }

  let posBucketCount = 1;
  while (posBucketCount < vertexCount * 2) {
    posBucketCount <<= 1;
  }
  const posMask = posBucketCount - 1;
  const posHead = new Int32Array(posBucketCount).fill(-1);
  const weldedId = new Uint32Array(vertexCount);
  let uniqueSpatialCount = 0;

  for (let i = 0; i < vertexCount; i += 1) {
    let slot =
      (Math.imul(qx[i] ?? 0, 73856093) ^
        Math.imul(qy[i] ?? 0, 19349663) ^
        Math.imul(qz[i] ?? 0, 83492791)) &
      posMask;
    for (;;) {
      const existing = posHead[slot] ?? -1;
      if (existing === -1) {
        posHead[slot] = i;
        weldedId[i] = uniqueSpatialCount;
        uniqueSpatialCount += 1;
        break;
      }
      if (qx[existing] === qx[i] && qy[existing] === qy[i] && qz[existing] === qz[i]) {
        weldedId[i] = weldedId[existing] ?? 0;
        break;
      }
      slot = (slot + 1) & posMask;
    }
  }

  const qu = new Int32Array(vertexCount);
  const qv = new Int32Array(vertexCount);
  for (let i = 0; i < vertexCount; i += 1) {
    qu[i] = Math.round((uvs[i * 2] ?? 0) * 1e6);
    qv[i] = Math.round((uvs[i * 2 + 1] ?? 0) * 1e6);
  }

  const indexCount = index ? index.length : vertexCount;
  let edgeBucketCount = 1;
  while (edgeBucketCount < indexCount * 2) {
    edgeBucketCount <<= 1;
  }
  const edgeMask = edgeBucketCount - 1;
  const edgeWeldU = new Int32Array(edgeBucketCount).fill(-1);
  const edgeWeldW = new Uint32Array(edgeBucketCount);
  const edgeOrigA = new Uint32Array(edgeBucketCount);
  const edgeOrigB = new Uint32Array(edgeBucketCount);
  const edgeIsSeam = new Uint8Array(edgeBucketCount);
  let seamEdgeCount = 0;

  for (let triBase = 0; triBase + 2 < indexCount; triBase += 3) {
    for (let edgeOffset = 0; edgeOffset < 3; edgeOffset += 1) {
      const nextOffset = (edgeOffset + 1) % 3;
      let idxA = index ? (index[triBase + edgeOffset] ?? 0) : triBase + edgeOffset;
      let idxB = index ? (index[triBase + nextOffset] ?? 0) : triBase + nextOffset;
      let weldA = weldedId[idxA] ?? 0;
      let weldB = weldedId[idxB] ?? 0;
      if (weldA > weldB) {
        const tmpIdx = idxA;
        idxA = idxB;
        idxB = tmpIdx;
        const tmpWeld = weldA;
        weldA = weldB;
        weldB = tmpWeld;
      }

      let slot = (Math.imul(weldA, 2654435761) ^ Math.imul(weldB, 2246822519)) & edgeMask;
      for (;;) {
        const storedU = edgeWeldU[slot] ?? -1;
        if (storedU === -1) {
          edgeWeldU[slot] = weldA;
          edgeWeldW[slot] = weldB;
          edgeOrigA[slot] = idxA;
          edgeOrigB[slot] = idxB;
          break;
        }
        if (storedU === weldA && edgeWeldW[slot] === weldB) {
          if (edgeIsSeam[slot] === 0) {
            const firstA = edgeOrigA[slot] ?? 0;
            const firstB = edgeOrigB[slot] ?? 0;
            if (
              qu[idxA] !== qu[firstA] ||
              qv[idxA] !== qv[firstA] ||
              qu[idxB] !== qu[firstB] ||
              qv[idxB] !== qv[firstB]
            ) {
              edgeIsSeam[slot] = 1;
              seamEdgeCount += 1;
            }
          }
          break;
        }
        slot = (slot + 1) & edgeMask;
      }
    }
  }

  const out = new Uint32Array(seamEdgeCount * 2);
  let writePos = 0;
  for (let i = 0; i < edgeBucketCount; i += 1) {
    if (edgeIsSeam[i] === 1) {
      out[writePos] = edgeOrigA[i] ?? 0;
      out[writePos + 1] = edgeOrigB[i] ?? 0;
      writePos += 2;
    }
  }
  return out;
}

export interface StudioVarco3dUvSeamMeshInput {
  readonly meshId: string;
  readonly positions: ArrayLike<number>;
  readonly uvs: ArrayLike<number>;
  readonly index?: ArrayLike<number> | null;
}

/**
 * 다중 메쉬 UV 심 검출 시 `modern-web-guidance`(`break-up-long-tasks`) 규칙에 따라
 * 50ms 타임 슬라이스마다 `scheduler.yield()`(또는 미지원 환경 `setTimeout(0)`)로 메인 스레드를 양보합니다.
 */
export async function computeVarco3dUvSeamLineIndicesBatchAsync(
  meshes: readonly StudioVarco3dUvSeamMeshInput[],
  nowFn: () => number = () => performance.now(),
): Promise<ReadonlyMap<string, Uint32Array>> {
  const results = new Map<string, Uint32Array>();
  let deadline = nowFn() + 50;

  for (const mesh of meshes) {
    results.set(mesh.meshId, computeVarco3dUvSeamLineIndices(mesh.positions, mesh.uvs, mesh.index));

    if (nowFn() >= deadline) {
      const globalWithScheduler = globalThis as {
        readonly scheduler?: { readonly yield?: () => Promise<void> };
      };
      if (
        "scheduler" in globalWithScheduler &&
        globalWithScheduler.scheduler !== undefined &&
        "yield" in globalWithScheduler.scheduler &&
        typeof globalWithScheduler.scheduler.yield === "function"
      ) {
        await globalWithScheduler.scheduler.yield();
      } else {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
      }
      deadline = nowFn() + 50;
    }
  }

  return results;
}

/**
 * `WireframeManager.precomputeWireframe` 역공학:
 * `triangle` 또는 `quad` 토폴로지 모드에 맞춰 와이어프레임 `LineSegments`용 인덱스 버퍼(`Uint32Array`)를 생성합니다.
 * - `quad` 모드에서는 연속된 6개 인덱스 `(v0, v1, v2, v3, v4, v5)`에서 내부 대각선을 생략하고
 *   사각형 외곽 4변 `(v0, v1), (v1, v2), (v2, v5), (v5, v0)`만 연결합니다.
 */
export function computeVarco3dWireframeLineIndices(options: {
  readonly vertexCount: number;
  readonly index?: ArrayLike<number> | null;
  readonly faceTopology: StudioVarco3dFaceTopology;
}): Uint32Array {
  const isQuad = options.faceTopology === "quad";
  const index = options.index;

  if (index && index.length > 0) {
    const count = index.length;
    const capacity = isQuad
      ? Math.ceil(count / 6) * 8 + Math.ceil((count % 6) / 3) * 6
      : Math.floor(count / 3) * 6;
    const out = new Uint32Array(Math.max(0, capacity));
    let ptr = 0;

    if (isQuad) {
      for (let i = 0; i < count; ) {
        if (i + 5 < count) {
          const v0 = index[i] ?? 0;
          const v1 = index[i + 1] ?? 0;
          const v2 = index[i + 2] ?? 0;
          const v5 = index[i + 5] ?? 0;
          out[ptr++] = v0;
          out[ptr++] = v1;
          out[ptr++] = v1;
          out[ptr++] = v2;
          out[ptr++] = v2;
          out[ptr++] = v5;
          out[ptr++] = v5;
          out[ptr++] = v0;
          i += 6;
        } else if (i + 2 < count) {
          const v0 = index[i] ?? 0;
          const v1 = index[i + 1] ?? 0;
          const v2 = index[i + 2] ?? 0;
          out[ptr++] = v0;
          out[ptr++] = v1;
          out[ptr++] = v1;
          out[ptr++] = v2;
          out[ptr++] = v2;
          out[ptr++] = v0;
          i += 3;
        } else {
          break;
        }
      }
    } else {
      for (let i = 0; i + 2 < count; i += 3) {
        const v0 = index[i] ?? 0;
        const v1 = index[i + 1] ?? 0;
        const v2 = index[i + 2] ?? 0;
        out[ptr++] = v0;
        out[ptr++] = v1;
        out[ptr++] = v1;
        out[ptr++] = v2;
        out[ptr++] = v2;
        out[ptr++] = v0;
      }
    }
    return out.subarray(0, ptr);
  }

  const count = Math.max(0, Math.floor(options.vertexCount));
  const out = new Uint32Array(count * 2);
  let ptr = 0;
  if (isQuad) {
    for (let i = 0; i < count; ) {
      if (i + 5 < count) {
        out[ptr++] = i;
        out[ptr++] = i + 1;
        out[ptr++] = i + 1;
        out[ptr++] = i + 2;
        out[ptr++] = i + 2;
        out[ptr++] = i + 5;
        out[ptr++] = i + 5;
        out[ptr++] = i;
        i += 6;
      } else if (i + 2 < count) {
        out[ptr++] = i;
        out[ptr++] = i + 1;
        out[ptr++] = i + 1;
        out[ptr++] = i + 2;
        out[ptr++] = i + 2;
        out[ptr++] = i;
        i += 3;
      } else {
        break;
      }
    }
  } else {
    for (let i = 0; i + 2 < count; i += 3) {
      out[ptr++] = i;
      out[ptr++] = i + 1;
      out[ptr++] = i + 1;
      out[ptr++] = i + 2;
      out[ptr++] = i + 2;
      out[ptr++] = i;
    }
  }
  return out.subarray(0, ptr);
}

/**
 * `LightingManager.bakeEnvironmentMatcap` 프래그먼트 셰이더 수식 역공학:
 * 클레이 Matcap 샘플 색상(`clayRgb`)에 HDRI 환경 샘플 색상(`environmentRgb`) 및 환경 평균 휘도(`environmentMeanLuminance`)를
 * 반영해 환경광의 색온도와 밝기가 자연스럽게 묻어나는 클레이 Matcap RGB를 계산합니다.
 */
export function evaluateVarco3dEnvironmentMatcapTint(
  clayRgb: readonly [number, number, number],
  environmentRgb: readonly [number, number, number],
  environmentMeanLuminance: number,
): readonly [number, number, number] {
  const luminance =
    0.2126 * environmentRgb[0] + 0.7152 * environmentRgb[1] + 0.0722 * environmentRgb[2];
  const safeMean = Math.max(environmentMeanLuminance, 1e-4);
  const ratio = Math.min(1.2, Math.max(0.6, luminance / safeMean));
  const safeLuma = Math.max(luminance, 1e-4);

  const tintR = Math.min(1.5, Math.max(0.5, environmentRgb[0] / safeLuma));
  const tintG = Math.min(1.5, Math.max(0.5, environmentRgb[1] / safeLuma));
  const tintB = Math.min(1.5, Math.max(0.5, environmentRgb[2] / safeLuma));

  // mix(vec3(1.0), tint, 0.5) === 0.5 + 0.5 * tint
  const outR = Number((clayRgb[0] * ratio * (0.5 + 0.5 * tintR)).toFixed(4));
  const outG = Number((clayRgb[1] * ratio * (0.5 + 0.5 * tintG)).toFixed(4));
  const outB = Number((clayRgb[2] * ratio * (0.5 + 0.5 * tintB)).toFixed(4));
  return Object.freeze([outR, outG, outB]);
}

/**
 * `BoneVisualizer` 메쉬 채도 감쇠(`rigDimOriginal`) 수식 역공학:
 * 스켈레톤/포즈/웨이트 편집 시 메쉬 본체의 채도를 12%만 남기고 88%를 Rec.601 루마(`0.299 R + 0.587 G + 0.114 B`)로
 * 수렴시켜 본/조인트 기즈모의 시각적 대비를 높입니다.
 */
export function evaluateVarco3dRigMeshDimColor(
  rgb: readonly [number, number, number],
): readonly [number, number, number] {
  const luma = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  const mix = STUDIO_VARCO3D_BONE_VISUALIZER_METRICS.rigDimSaturationMix;
  return Object.freeze([
    Number((luma * (1 - mix) + rgb[0] * mix).toFixed(4)),
    Number((luma * (1 - mix) + rgb[1] * mix).toFixed(4)),
    Number((luma * (1 - mix) + rgb[2] * mix).toFixed(4)),
  ]);
}

/**
 * 캔버스 위에서 `Shift + 우클릭 드래그`(`shiftKey && (buttons & 2)`) 시 조명을 직접 회전시키는
 * `BaseSceneManager.onLightingDragMove` 핸들러 상태 전이를 계산합니다.
 */
export function applyVarco3dCanvasShiftRightLightingDrag(
  state: StudioVarco3dViewportHudState,
  event: {
    readonly shiftKey: boolean;
    readonly buttons: number;
    readonly deltaClientX: number;
  },
): StudioVarco3dViewportHudState {
  if (!event.shiftKey || (event.buttons & 2) === 0 || event.deltaClientX === 0) {
    return state;
  }
  const currentDeg = lightingRadToDialDeg(state.lightingRotationRad);
  return Object.freeze({
    ...state,
    lightingRotationRad: lightingDialDegToRad(currentDeg + event.deltaClientX),
    isLightingAutoRotateOn: false,
  });
}

export type StudioVarco3dPaintBrushChannel =
  | "baseColor"
  | "roughness"
  | "metallic"
  | "bump"
  | "flatten";

/**
 * `StudioSceneManager.getPreferredMapPreviewMode` & `syncDecalVisibility` 역공학:
 * - 현재 페인트 브러시 채널이 `"bump"` 또는 `"flatten"`이면 `"normal"` 맵 프리뷰를 반환하고,
 *   그 외에는 브러시 채널과 동일한 맵 프리뷰 모드를 반환합니다.
 * - 데칼은 `isTextureOn`이 켜져 있고 `mapPreviewMode`가 `null` 또는 `"baseColor"`일 때만 표시됩니다.
 */
export function resolveVarco3dBrushAndDecalPolicy(
  state: StudioVarco3dViewportHudState,
  activeBrushChannel: StudioVarco3dPaintBrushChannel | null,
): {
  readonly preferredMapPreviewMode: StudioVarco3dMapPreviewMode | null;
  readonly decalVisible: boolean;
} {
  const preferredMapPreviewMode: StudioVarco3dMapPreviewMode | null =
    activeBrushChannel === null
      ? null
      : activeBrushChannel === "bump" || activeBrushChannel === "flatten"
        ? "normal"
        : activeBrushChannel;

  const decalVisible =
    state.isTextureOn && (state.mapPreviewMode === null || state.mapPreviewMode === "baseColor");

  return Object.freeze({
    preferredMapPreviewMode,
    decalVisible,
  });
}

export interface StudioVarco3dCameraTrackerState {
  readonly followEnabled: boolean;
  readonly isUserInteracting: boolean;
  readonly initialTargetY: number | null;
  readonly cameraPosition: StudioMannequinVec3;
  readonly controlsTarget: StudioMannequinVec3;
  readonly defaultCameraOffset: StudioMannequinVec3;
}

/**
 * `CameraTracker.update` 역공학:
 * 애니메이션 루트 본의 월드 위치(`targetWorldPos`)를 추적하되, 수직 이동(`deltaY`)은 `±yFollowRange`(`±0.3m`)로 클램프하고
 * 사용자가 카메라를 조작 중일 때는 카메라 위치 강제 보간을 멈춘 채 `controlsTarget`만 느린 속도(`0.03`)로 따라갑니다.
 */
export function stepVarco3dCameraTracker(
  tracker: StudioVarco3dCameraTrackerState,
  targetWorldPos: StudioMannequinVec3,
): StudioVarco3dCameraTrackerState {
  if (!tracker.followEnabled) return tracker;

  const initialY = tracker.initialTargetY ?? targetWorldPos.y;
  const rawDeltaY = targetWorldPos.y - initialY;
  const clampedDeltaY = Math.max(
    -STUDIO_VARCO3D_CAMERA_TRACKER_DEFAULTS.yFollowRange,
    Math.min(STUDIO_VARCO3D_CAMERA_TRACKER_DEFAULTS.yFollowRange, rawDeltaY),
  );

  const lerpSpeed = tracker.isUserInteracting
    ? STUDIO_VARCO3D_CAMERA_TRACKER_DEFAULTS.interactionLerpSpeed
    : STUDIO_VARCO3D_CAMERA_TRACKER_DEFAULTS.lerpSpeed;

  const lookAtGoal: StudioMannequinVec3 = {
    x: targetWorldPos.x + STUDIO_VARCO3D_CAMERA_TRACKER_DEFAULTS.defaultLookAtOffset.x,
    y: STUDIO_VARCO3D_CAMERA_TRACKER_DEFAULTS.defaultLookAtOffset.y + clampedDeltaY,
    z: targetWorldPos.z + STUDIO_VARCO3D_CAMERA_TRACKER_DEFAULTS.defaultLookAtOffset.z,
  };

  const lerpScalar = (a: number, b: number, t: number) => cleanZero(Number((a + (b - a) * t).toFixed(4)));

  const nextControlsTarget: StudioMannequinVec3 = Object.freeze({
    x: lerpScalar(tracker.controlsTarget.x, lookAtGoal.x, lerpSpeed),
    y: lerpScalar(tracker.controlsTarget.y, lookAtGoal.y, lerpSpeed),
    z: lerpScalar(tracker.controlsTarget.z, lookAtGoal.z, lerpSpeed),
  });

  if (tracker.isUserInteracting) {
    return Object.freeze({
      ...tracker,
      initialTargetY: initialY,
      controlsTarget: nextControlsTarget,
    });
  }

  const desiredCameraPos: StudioMannequinVec3 = {
    x: targetWorldPos.x + tracker.defaultCameraOffset.x,
    y: tracker.defaultCameraOffset.y + clampedDeltaY,
    z: targetWorldPos.z + tracker.defaultCameraOffset.z,
  };

  return Object.freeze({
    ...tracker,
    initialTargetY: initialY,
    controlsTarget: nextControlsTarget,
    cameraPosition: Object.freeze({
      x: lerpScalar(tracker.cameraPosition.x, desiredCameraPos.x, lerpSpeed),
      y: lerpScalar(tracker.cameraPosition.y, desiredCameraPos.y, lerpSpeed),
      z: lerpScalar(tracker.cameraPosition.z, desiredCameraPos.z, lerpSpeed),
    }),
  });
}

export type StudioVarco3dRigHistoryDomain = "pose" | "skeleton" | "paint";

export interface StudioVarco3dRigHistoryEntry<TPayload = string> {
  readonly domain: StudioVarco3dRigHistoryDomain;
  readonly payload: TPayload;
}

export interface StudioVarco3dUnifiedRigHistory<TPayload = string> {
  readonly undoStack: readonly StudioVarco3dRigHistoryEntry<TPayload>[];
  readonly redoStack: readonly StudioVarco3dRigHistoryEntry<TPayload>[];
  readonly maxHistory: number;
}

/**
 * `RigEditManager` 통합 Undo/Redo 히스토리 스택(`"pose" | "skeleton" | "paint"`)을 생성합니다.
 */
export function createVarco3dUnifiedRigHistory<TPayload = string>(
  maxHistory = 50,
): StudioVarco3dUnifiedRigHistory<TPayload> {
  return Object.freeze({
    undoStack: Object.freeze([]),
    redoStack: Object.freeze([]),
    maxHistory: Math.max(1, maxHistory),
  });
}

export function pushVarco3dUnifiedRigHistory<TPayload>(
  history: StudioVarco3dUnifiedRigHistory<TPayload>,
  domain: StudioVarco3dRigHistoryDomain,
  payload: TPayload,
): StudioVarco3dUnifiedRigHistory<TPayload> {
  const nextUndo = [...history.undoStack, Object.freeze({ domain, payload })];
  while (nextUndo.length > history.maxHistory) {
    nextUndo.shift();
  }
  return Object.freeze({
    ...history,
    undoStack: Object.freeze(nextUndo),
    redoStack: Object.freeze([]),
  });
}

/**
 * `RigEditManager.undoUnified` 역공학:
 * 현재 활성 도구가 `"skeleton"`일 때는 `"pose"` 엔트리를 건너뛰고 이전 `"skeleton"` 또는 `"paint"` 엔트리를 꺼내는
 * 도메인 인식 통합 Undo를 수행합니다.
 */
export function undoVarco3dUnifiedRigHistory<TPayload>(
  history: StudioVarco3dUnifiedRigHistory<TPayload>,
  activeTool: "pose" | "skeleton" | "weight" | null = null,
): {
  readonly history: StudioVarco3dUnifiedRigHistory<TPayload>;
  readonly applied: StudioVarco3dRigHistoryEntry<TPayload> | null;
} {
  const undoCopy = [...history.undoStack];
  const redoCopy = [...history.redoStack];

  while (undoCopy.length > 0) {
    const candidate = undoCopy.pop()!;
    if (activeTool === "skeleton" && candidate.domain === "pose") {
      continue;
    }
    redoCopy.push(candidate);
    return Object.freeze({
      history: Object.freeze({
        ...history,
        undoStack: Object.freeze(undoCopy),
        redoStack: Object.freeze(redoCopy),
      }),
      applied: candidate,
    });
  }

  return Object.freeze({
    history: Object.freeze({
      ...history,
      undoStack: Object.freeze(undoCopy),
      redoStack: Object.freeze(redoCopy),
    }),
    applied: null,
  });
}

/** `RigEditManager.redoUnified` 역공학. */
export function redoVarco3dUnifiedRigHistory<TPayload>(
  history: StudioVarco3dUnifiedRigHistory<TPayload>,
  activeTool: "pose" | "skeleton" | "weight" | null = null,
): {
  readonly history: StudioVarco3dUnifiedRigHistory<TPayload>;
  readonly applied: StudioVarco3dRigHistoryEntry<TPayload> | null;
} {
  const undoCopy = [...history.undoStack];
  const redoCopy = [...history.redoStack];

  while (redoCopy.length > 0) {
    const candidate = redoCopy.pop()!;
    if (activeTool === "skeleton" && candidate.domain === "pose") {
      continue;
    }
    undoCopy.push(candidate);
    return Object.freeze({
      history: Object.freeze({
        ...history,
        undoStack: Object.freeze(undoCopy),
        redoStack: Object.freeze(redoCopy),
      }),
      applied: candidate,
    });
  }

  return Object.freeze({
    history: Object.freeze({
      ...history,
      undoStack: Object.freeze(undoCopy),
      redoStack: Object.freeze(redoCopy),
    }),
    applied: null,
  });
}

/**
 * `WaveRevealEffect` 및 `VoxelGridPreview` 스튜디오 전환 이펙트 곡선(`uFade`, `uSweep`, `uSweepGain`, `revealWave`)을 계산합니다.
 */
export function evaluateVarco3dStudioTransitionEffects(options: {
  readonly elapsedMs: number;
  readonly normalizedPos: StudioMannequinVec3;
  readonly revealProgress: number;
}): {
  readonly voxelFade: number;
  readonly voxelSweep: number;
  readonly voxelSweepGain: number;
  readonly waveRevealEdge: number;
} {
  const elapsed = Math.max(0, options.elapsedMs);
  const fadeT = Math.min(1, elapsed / STUDIO_VARCO3D_VOXEL_PREVIEW_METRICS.fadeInMs);
  const voxelFade = Number((fadeT * fadeT * (3 - 2 * fadeT)).toFixed(4));

  let voxelSweep = 0;
  let voxelSweepGain = 1;
  if (elapsed >= STUDIO_VARCO3D_VOXEL_PREVIEW_METRICS.fadeInMs) {
    const cyclePhase =
      ((elapsed - STUDIO_VARCO3D_VOXEL_PREVIEW_METRICS.fadeInMs) %
        STUDIO_VARCO3D_VOXEL_PREVIEW_METRICS.sweepPeriodMs) /
      STUDIO_VARCO3D_VOXEL_PREVIEW_METRICS.sweepPeriodMs;
    const restEnd = STUDIO_VARCO3D_VOXEL_PREVIEW_METRICS.sweepRestEnd;
    const buildEnd = STUDIO_VARCO3D_VOXEL_PREVIEW_METRICS.sweepBuildEnd;
    if (cyclePhase < restEnd) {
      voxelSweep = 0;
      voxelSweepGain = 1;
    } else if (cyclePhase < buildEnd) {
      voxelSweep = Number((((cyclePhase - restEnd) / (buildEnd - restEnd)) * 1.1).toFixed(4));
      voxelSweepGain = 1;
    } else {
      const decay = (cyclePhase - buildEnd) / (1 - buildEnd);
      voxelSweep = 1.1;
      voxelSweepGain = Number((1 - decay * decay).toFixed(4));
    }
  }

  const timeSec = elapsed / 1000;
  const p = options.normalizedPos;
  const revealWave =
    0.5 * Math.sin(p.x * 9.0 + timeSec * 2.2) +
    0.35 * Math.sin(p.z * 13.0 - timeSec * 1.7) +
    0.15 * Math.sin((p.x + p.z) * 21.0 + timeSec * 3.1);
  const waveRevealEdge = Number((options.revealProgress + revealWave * 0.035).toFixed(4));

  return Object.freeze({
    voxelFade,
    voxelSweep,
    voxelSweepGain,
    waveRevealEdge,
  });
}
