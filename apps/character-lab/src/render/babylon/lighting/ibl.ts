/**
 * 절차 스카이 IBL: procedural-sky.ts(순수)의 6면 float 큐브를 RawCubeTexture로 올리고 HDRFiltering.prefilter로
 * 거칠기별 프리필터 밉 + SH를 만든 뒤 scene.environmentTexture로 쓴다. 외부 HDR 없음.
 * NullEngine·필터 가능한 float 큐브 미지원 엔진에서는 unavailable 상태와 사유를 돌려준다(무음 생략 금지).
 *
 * 큐브 형식(F-02, 2026-10-23 실측 Chrome 156·M2 Max): 예전 rgba32float 큐브는 WebGPU 코어에서 필터링 샘플러로 읽을 수 없고
 * (`float32-filterable` 기능 없이 UnfilterableFloat) Babylon이 밉을 끈 채(1단계) 만들어, 프리필터가 밉 1~6단계 뷰를 만들다 검증 오류 146건
 * (경고 168건)을 냈고 IBL이 깨져 PBR이 WebGL2보다 어두웠다. 이제 필터·밉·렌더가 모두 되는 rgba16float(half float, 밉 포함)로 올린다.
 * half float이 안 되고 float32 선형 필터가 되는 엔진만 float32를 쓴다.
 */
import { Constants } from "@babylonjs/core/Engines/constants.js";
import { HDRFiltering } from "@babylonjs/core/Materials/Textures/Filtering/hdrFiltering.js";
import { RawCubeTexture } from "@babylonjs/core/Materials/Textures/rawCubeTexture.js";

import { describeDetail } from "../../../contracts";
import { toHalfFloatArray } from "../../half-float";
import { generateSkyFaces, skyAverageColor } from "../../procedural-sky";
import { featureActive, featureUnavailable } from "../../scene-features";

import type { SkyParams } from "../../procedural-sky";
import type { SceneFeatureState } from "../../scene-features";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import type { Scene } from "@babylonjs/core/scene.js";

export interface ProceduralIbl {
  readonly texture: BaseTexture | null;
  readonly state: SceneFeatureState;
  /** 툰 모드 ambient(태양 제외 평균 복사) */
  readonly averageColor: readonly [number, number, number];
  dispose(): void;
}

export const IBL_CUBE_SIZE = 64;

export async function createProceduralIbl(scene: Scene, params?: SkyParams, size = IBL_CUBE_SIZE): Promise<ProceduralIbl> {
  const averageColor = skyAverageColor(params);
  const engine = scene.getEngine();
  const caps = engine.getCaps();
  const halfFloat = caps.textureHalfFloat && caps.textureHalfFloatLinearFiltering;
  const fullFloat = caps.textureFloat && caps.textureFloatLinearFiltering;
  if (!halfFloat && !fullFloat) {
    return {
      texture: null,
      state: featureUnavailable("엔진이 필터 가능한 float 큐브 텍스처(rgba16float, 또는 float32 선형 필터)를 지원하지 않아 절차 스카이 IBL을 만들 수 없습니다."),
      averageColor,
      dispose: () => undefined,
    };
  }
  let texture: RawCubeTexture | null = null;
  try {
    const faces = generateSkyFaces(size, params);
    const type = halfFloat ? Constants.TEXTURETYPE_HALF_FLOAT : Constants.TEXTURETYPE_FLOAT;
    // 밉을 처음부터 만들어 둔다: WebGPU 텍스처는 생성 때 밉 수가 고정이라 프리필터가 나중에 밉을 만들 자리가 있어야 한다.
    texture = new RawCubeTexture(scene, halfFloat ? faces.map(toHalfFloatArray) : faces, size, Constants.TEXTUREFORMAT_RGBA, type, true, false, Constants.TEXTURE_TRILINEAR_SAMPLINGMODE);
    const filtering = new HDRFiltering(engine, { quality: Constants.TEXTURE_FILTERING_QUALITY_MEDIUM });
    await filtering.prefilter(texture);
    // 프리필터가 끝났는데도 준비되지 않은 환경 텍스처를 scene.environmentTexture로 쓰면 모든 PBR 재질이 isReady=false로 영원히 그려지지 않는다
    // (실브라우저 실측 결함). 준비되지 않았으면 쓰지 않고 사유를 보고한다.
    if (!texture.isReady()) {
      texture.dispose();
      return { texture: null, state: featureUnavailable("프리필터가 끝났지만 환경 텍스처가 준비되지 않아 IBL을 쓰지 않습니다(PBR이 텍스처 대기에서 멈추는 것을 막기 위함)."), averageColor, dispose: () => undefined };
    }
    return {
      texture,
      state: featureActive(`${size}² 절차 스카이(${halfFloat ? "rgba16float" : "rgba32float"}), HDRFiltering 프리필터`),
      averageColor,
      dispose() {
        texture?.dispose();
      },
    };
  } catch (error) {
    texture?.dispose();
    return {
      texture: null,
      state: featureUnavailable(`절차 스카이 IBL 생성 실패(${describeDetail(error) ?? "알 수 없는 오류"})`),
      averageColor,
      dispose: () => undefined,
    };
  }
}
