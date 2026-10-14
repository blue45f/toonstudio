/**
 * Studio BG3D Phase 0 PoC 계약 — 편의점 야경 고품질 플레이트.
 *
 * 근거: bg3d 조사 보고서 §6. 기존 번들 환경 1종(`korean_convenience_store_night`)을
 * PBR + HDRI + Cycles 패스 방식으로 다시 만들었을 때 현재 플레이트보다 확실히
 * 사실적이고, LT(선화·톤)를 입혀도 무너지지 않는지를 증명하는 것이 PoC의 목적이다.
 *
 * 이 모듈은 제품 렌더 경로를 바꾸지 않는다. 오프라인 PoC 스크립트
 * (`scripts/blender/render_convenience_store_night_plate_poc.py`)가 배출하는
 * 매니페스트(manifest)의 정본 계약과 성공 기준 판정기를 제공한다. 스크립트와
 * 이 모듈은 각도 ID·해상도·샘플 수·시간 예산 상수를 문자열/수치 단위로 공유하며,
 * 한쪽만 바꾸면 동반 테스트가 실패한다.
 *
 * 현재값(baseline)은 main 실측이다:
 * - 에셋 카탈로그 `studio-bg3d-environment-catalog.ts`의
 *   `ts-bg3d-korean_convenience_store_night-v1` 항목 (byteSize·sha256·bounds·camera).
 * - 생성 스크립트 `scripts/blender/generate_environment_pack_v5.py`:
 *   임베드 텍스처 상한 128px(`TEXTURE_DIMENSION = 128`), 썸네일은 EEVEE 640×400,
 *   월드 배경 단색, Cycles 패스(beauty/depth/normal/AO) 자체가 파이프라인에 없음.
 */

export const STUDIO_BG3D_PLATE_POC_ASSET_ID = "korean_convenience_store_night" as const;

/** 카탈로그 정본 ID. `studio-bg3d-environment-catalog.ts`의 V5 항목과 일치해야 한다. */
export const STUDIO_BG3D_PLATE_POC_CATALOG_ID =
  "ts-bg3d-korean_convenience_store_night-v1" as const;

export const STUDIO_BG3D_PLATE_POC_CATALOG_SHA256 =
  "sha256:e31665694ca5ab05e09736d24623a4bfe14cc07b9f60bec261445f7dcf6f476e" as const;

export const STUDIO_BG3D_PLATE_POC_CATALOG_BYTE_SIZE = 3_748_664 as const;

/** §6 성공 기준 "렌더 각도당 수 분 이내"를 판정 가능한 수치로 고정한다. */
export const STUDIO_BG3D_PLATE_POC_RENDER_TIME_BUDGET_SECONDS = 300 as const;

/** LT 적용 후 엣지 유지율 하한. 합성 하네스가 측정한 값을 이 값과 비교한다. */
export const STUDIO_BG3D_PLATE_POC_LT_EDGE_RETENTION_MIN = 0.85 as const;

export interface StudioBg3dPlatePocAngle {
  readonly id: "exterior-front" | "interior-aisle";
  /** Blender 월드 좌표(미터). v5 썸네일 카메라와 같은 축 규약을 쓴다. */
  readonly cameraLocation: readonly [number, number, number];
  readonly cameraTarget: readonly [number, number, number];
  readonly lensMm: number;
}

export interface StudioBg3dPlatePocSpec {
  readonly assetId: typeof STUDIO_BG3D_PLATE_POC_ASSET_ID;
  readonly catalogId: typeof STUDIO_BG3D_PLATE_POC_CATALOG_ID;
  readonly baseline: {
    /** generate_environment_pack_v5.py의 TEXTURE_DIMENSION. */
    readonly textureDimensionPx: 128;
    readonly thumbnailEngine: "BLENDER_EEVEE";
    readonly thumbnailWidthPx: 640;
    readonly thumbnailHeightPx: 400;
    /** 월드 배경은 단색(solid color)이며 HDRI 환경광이 없다. */
    readonly world: "solid-color";
    readonly passes: readonly [];
  };
  readonly target: {
    /** PoC 절차 텍스처 해상도. Phase 1의 외부 CC0 세트(1K/2K)와 같은 하한이다. */
    readonly textureDimensionPx: 1024;
    readonly engine: "CYCLES";
    readonly samples: 256;
    readonly denoiser: "OPENIMAGEDENOISE";
    readonly viewTransform: "AgX";
    /** 긴 변 2560px (§6 지정). 종횡비는 기존 썸네일 640×400의 8:5를 유지한다. */
    readonly widthPx: 2560;
    readonly heightPx: 1600;
    /** 카탈로그 HDRI 정본 중 야간 거리 항목. 편의점 전면 유리 반사의 환경광 기준이다. */
    readonly hdriAssetId: "cobblestone-street-night";
    readonly hdriPolyHavenId: "cobblestone_street_night";
    readonly passes: readonly ["beauty", "depth", "normal", "ao"];
  };
  readonly angles: readonly StudioBg3dPlatePocAngle[];
}

export const STUDIO_BG3D_PLATE_POC_SPEC: StudioBg3dPlatePocSpec = Object.freeze({
  assetId: STUDIO_BG3D_PLATE_POC_ASSET_ID,
  catalogId: STUDIO_BG3D_PLATE_POC_CATALOG_ID,
  baseline: Object.freeze({
    textureDimensionPx: 128,
    thumbnailEngine: "BLENDER_EEVEE",
    thumbnailWidthPx: 640,
    thumbnailHeightPx: 400,
    world: "solid-color",
    passes: Object.freeze([]) as readonly [],
  }),
  target: Object.freeze({
    textureDimensionPx: 1024,
    engine: "CYCLES",
    samples: 256,
    denoiser: "OPENIMAGEDENOISE",
    viewTransform: "AgX",
    widthPx: 2560,
    heightPx: 1600,
    hdriAssetId: "cobblestone-street-night",
    hdriPolyHavenId: "cobblestone_street_night",
    passes: Object.freeze(["beauty", "depth", "normal", "ao"] as const),
  }),
  angles: Object.freeze([
    Object.freeze({
      // v5 render_thumbnail 호출값과 동일: 매장 전면을 밖에서 보는 정본 각도.
      id: "exterior-front",
      cameraLocation: Object.freeze([8.8, -17.8, 8.4]) as readonly [number, number, number],
      cameraTarget: Object.freeze([0, -0.15, 1.35]) as readonly [number, number, number],
      lensMm: 43,
    }),
    Object.freeze({
      // 매장 안쪽 대각선: 곤돌라 3열·냉장고 뱅크·계산대가 한 프레임에 들어오는 각도.
      id: "interior-aisle",
      cameraLocation: Object.freeze([-3.4, -2.6, 1.7]) as readonly [number, number, number],
      cameraTarget: Object.freeze([1.2, 1.6, 1.0]) as readonly [number, number, number],
      lensMm: 46,
    }),
  ]),
});

/** 렌더 스크립트가 배출하고 합성 하네스가 보강하는 PoC 매니페스트. */
export interface StudioBg3dPlatePocManifest {
  readonly schemaVersion: 1;
  readonly assetId: string;
  readonly textureDimensionPx: number;
  readonly samples: number;
  readonly hdri: {
    /** 실제 HDRI 파일로 렌더했으면 "file", 절차 폴백이면 "procedural-fallback". */
    readonly mode: "file" | "procedural-fallback";
    readonly polyHavenId: string | null;
  };
  readonly angles: readonly {
    readonly id: string;
    readonly widthPx: number;
    readonly heightPx: number;
    readonly renderSeconds: number;
    readonly passes: readonly string[];
  }[];
  /** 합성 하네스(compose_plate_poc_comparison.py)가 채우는 선택 구간. */
  readonly lt?: {
    readonly edgeRetention: number;
    readonly compositePresent: boolean;
  };
}

export type StudioBg3dPlatePocCheckId =
  | "asset-match"
  | "texture-upgrade"
  | "samples"
  | "passes-complete"
  | "resolution"
  | "render-time"
  | "hdri-real"
  | "lt-edge-retention";

export interface StudioBg3dPlatePocCheck {
  readonly id: StudioBg3dPlatePocCheckId;
  readonly passed: boolean;
  readonly detail: string;
}

export interface StudioBg3dPlatePocVerdict {
  readonly status: "pass" | "fail";
  readonly checks: readonly StudioBg3dPlatePocCheck[];
}

/**
 * §6 성공 기준을 매니페스트 수치만으로 판정한다.
 * 정성 기준(재질·반사·그림자 개선)은 3자 비교 시트를 사람이 보되, 그 전제인
 * 해상도·패스·시간·엣지 유지율은 여기서 기계적으로 고정한다.
 */
export function evaluateStudioBg3dPlatePocManifest(
  manifest: StudioBg3dPlatePocManifest,
): StudioBg3dPlatePocVerdict {
  const spec = STUDIO_BG3D_PLATE_POC_SPEC;
  const checks: StudioBg3dPlatePocCheck[] = [];

  checks.push({
    id: "asset-match",
    passed: manifest.assetId === spec.assetId,
    detail: `assetId=${manifest.assetId}`,
  });
  checks.push({
    id: "texture-upgrade",
    passed:
      manifest.textureDimensionPx >= spec.target.textureDimensionPx &&
      manifest.textureDimensionPx > spec.baseline.textureDimensionPx,
    detail: `texture=${manifest.textureDimensionPx}px (baseline ${spec.baseline.textureDimensionPx}px, target >=${spec.target.textureDimensionPx}px)`,
  });
  checks.push({
    id: "samples",
    passed: manifest.samples >= 128,
    detail: `samples=${manifest.samples} (target ${spec.target.samples}, min 128)`,
  });

  const expectedAngleIds = spec.angles.map((angle) => angle.id) as readonly string[];
  const passesComplete =
    manifest.angles.length === expectedAngleIds.length &&
    expectedAngleIds.every((angleId) => {
      const angle = manifest.angles.find((entry) => entry.id === angleId);
      return (
        angle !== undefined &&
        spec.target.passes.every((pass) => angle.passes.includes(pass))
      );
    });
  checks.push({
    id: "passes-complete",
    passed: passesComplete,
    detail: `angles=${manifest.angles.map((a) => `${a.id}:[${a.passes.join(",")}]`).join(" ")}`,
  });

  const resolutionOk =
    manifest.angles.length > 0 &&
    manifest.angles.every(
      (angle) =>
        Math.max(angle.widthPx, angle.heightPx) >= spec.target.widthPx &&
        Math.min(angle.widthPx, angle.heightPx) >= spec.target.heightPx,
    );
  checks.push({
    id: "resolution",
    passed: resolutionOk,
    detail: `target long-side >=${spec.target.widthPx}px`,
  });

  const renderTimeOk =
    manifest.angles.length > 0 &&
    manifest.angles.every(
      (angle) =>
        Number.isFinite(angle.renderSeconds) &&
        angle.renderSeconds > 0 &&
        angle.renderSeconds < STUDIO_BG3D_PLATE_POC_RENDER_TIME_BUDGET_SECONDS,
    );
  checks.push({
    id: "render-time",
    passed: renderTimeOk,
    detail: `budget <${STUDIO_BG3D_PLATE_POC_RENDER_TIME_BUDGET_SECONDS}s/angle, actual=${manifest.angles
      .map((a) => `${a.id}:${a.renderSeconds}s`)
      .join(" ")}`,
  });

  checks.push({
    id: "hdri-real",
    passed:
      manifest.hdri.mode === "file" &&
      manifest.hdri.polyHavenId === spec.target.hdriPolyHavenId,
    detail: `hdri mode=${manifest.hdri.mode} id=${manifest.hdri.polyHavenId ?? "null"}`,
  });

  const lt = manifest.lt;
  checks.push({
    id: "lt-edge-retention",
    passed:
      lt !== undefined &&
      lt.compositePresent &&
      Number.isFinite(lt.edgeRetention) &&
      lt.edgeRetention >= STUDIO_BG3D_PLATE_POC_LT_EDGE_RETENTION_MIN,
    detail:
      lt === undefined
        ? "lt section missing"
        : `edgeRetention=${lt.edgeRetention} (min ${STUDIO_BG3D_PLATE_POC_LT_EDGE_RETENTION_MIN}), composite=${lt.compositePresent}`,
  });

  return Object.freeze({
    status: checks.every((check) => check.passed) ? "pass" : "fail",
    checks: Object.freeze(checks),
  });
}

/**
 * 기준 엣지 맵의 엣지 픽셀 중 LT 결과에도 남아 있는 비율(0..1).
 * 입력은 같은 크기(width×height)의 단채널 맵이며 0이 아닌 값을 엣지로 본다.
 *
 * 유지는 ±1px(Chebyshev) 이웃 안에서 판정한다. 잉크선의 엣지 응답은 선 자체가
 * 아니라 그 양옆에 생기고 LT 선화는 1px 안팎으로 이동할 수 있어, 픽셀 정확
 * 일치를 요구하면 실제 LT 결과에서도 유지율이 0으로 무너진다(합성 픽스처 실측).
 * 합성 하네스(Python)는 더 너그러운 ±2px 팽창을 쓰므로, 이 함수의 값이
 * 하네스 값보다 낮게 나오는 것이 정상이다.
 */
export function computeStudioBg3dPlateEdgeRetention(
  referenceEdges: Uint8Array,
  ltEdges: Uint8Array,
  width: number,
  height: number,
): number {
  if (!(referenceEdges instanceof Uint8Array) || !(ltEdges instanceof Uint8Array)) {
    throw new TypeError("Edge retention inputs must be Uint8Array.");
  }
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) {
    throw new RangeError("Edge retention dimensions must be positive safe integers.");
  }
  if (referenceEdges.length !== width * height || ltEdges.length !== width * height) {
    throw new RangeError("Edge retention input length must equal width * height.");
  }
  let referenceCount = 0;
  let retainedCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (referenceEdges[y * width + x] === 0) continue;
      referenceCount += 1;
      let retained = false;
      for (let dy = -1; dy <= 1 && !retained; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          if (ltEdges[ny * width + nx] !== 0) {
            retained = true;
            break;
          }
        }
      }
      if (retained) retainedCount += 1;
    }
  }
  if (referenceCount === 0) return 1;
  return retainedCount / referenceCount;
}
