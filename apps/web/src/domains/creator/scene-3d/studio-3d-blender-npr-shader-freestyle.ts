/**
 * Blender 5.2 NPR ShaderNodeTree (`ShaderToRGB` + `ValToRGB` + `BsdfToon` + `Fresnel`/`AO`/`Bevel`)
 * 및 `Freestyle` ViewMap / `LineArt` 스트로크 모디파이어 엔진.
 *
 * REA 정적 역공학 근거:
 * - `/Applications/Blender.app/Contents/MacOS/Blender` (`ev_fd18384d554a9f3b4468d3a4f857d63b125d2a883e1ba046b5a891f6da972821`):
 *   `ccl::ToonBsdfNode` (`RNA_ShaderNodeBsdfToon`), `RNA_ShaderNodeShaderToRGB`,
 *   `RNA_ShaderNodeValToRGB`, `RNA_ShaderNodeAmbientOcclusion`, `RNA_ShaderNodeBevel`,
 *   `RNA_ShaderNodeFresnel`, `RNA_ShaderNodeLayerWeight`, `Freestyle::Controller::ComputeViewMap`,
 *   `Freestyle::FEdgeXDetector::ProcessSilhouetteEdge`, `ProcessSuggestiveContourFace`,
 *   `Freestyle::CalligraphicShader`, `Freestyle::BackboneStretcherShader`,
 *   `Freestyle::SpatialNoiseShader`, `Freestyle::IncreasingThicknessShader`,
 *   `Freestyle::LineStyleThicknessModifier_CreaseAngle`, `RNA_ObjectLineArt`, `RNA_MaterialLineArt`
 * - `node_add_menu_shader.cpython-313.pyc` (`ev_9ad5e9663a6392cf3143eeacf82341ee73dd5ff7816c1ee091c812cfa214d6ed`)
 * - `properties_freestyle.cpython-313.pyc` (`ev_463f657bbba506b7446e5595494fad1fd73f1c83afb18673689fdbe072c556ba`)
 * - `properties_data_grease_pencil.cpython-313.pyc` (`ev_b6e4c388edcf8ff8d869fefd94ae7bfee267fc0414836fede2a794e08706b88d`)
 */

import {
  hexToRgbNormalized,
  rgbNormalizedToHex,
} from "./studio-3d-blender-eevee-lighting-rig";

export type BlenderToonBsdfComponent = "DIFFUSE" | "GLOSSY";

export type BlenderColorRampInterpolation =
  | "CONSTANT"
  | "LINEAR"
  | "EASE"
  | "B_SPLINE";

export interface BlenderColorRampStop {
  /** 0.0 (완전 암부) ~ 1.0 (완전 명부) */
  readonly position: number;
  readonly colorHex: string;
  readonly alpha?: number;
}

export interface BlenderNprShaderPreset {
  readonly id: string;
  readonly nameKo: string;
  readonly categoryKo: string;
  readonly descriptionKo: string;
  /** `ShaderNodeBsdfToon` 컴포넌트 */
  readonly toonComponent: BlenderToonBsdfComponent;
  /** `ShaderNodeBsdfToon` size (0.01 ~ 1.0) */
  readonly toonSize: number;
  /** `ShaderNodeBsdfToon` smooth (0.0 ~ 1.0) */
  readonly toonSmooth: number;
  /** `ShaderNodeValToRGB` 보간 모드 */
  readonly rampInterpolation: BlenderColorRampInterpolation;
  /** `ShaderNodeValToRGB` 멀티스톱 컬러램프 */
  readonly colorRampStops: readonly BlenderColorRampStop[];
  /** `ShaderNodeAmbientOcclusion` 캐비티 암부 강도 (0.0 ~ 1.0) */
  readonly ambientOcclusionWeight: number;
  readonly ambientOcclusionDistance: number;
  /** `ShaderNodeFresnel` IOR (굴절률, 1.0 ~ 3.0) */
  readonly fresnelIor: number;
  /** `ShaderNodeLayerWeight` Facing blend (0.0 ~ 1.0) */
  readonly layerWeightBlend: number;
  readonly rimTintHex: string;
  readonly rimStrength: number;
  /** `ShaderNodeBevel` 모서리 하이라이트 반경 (m) */
  readonly bevelRadius: number;
  readonly bevelHighlightStrength: number;
  /** 마력·보석·룬 자체 발광 */
  readonly emissionColorHex: string;
  readonly emissionStrength: number;
}

export interface BlenderNprShaderSampleInput {
  readonly normal: readonly [number, number, number];
  readonly lightDir: readonly [number, number, number];
  readonly viewDir: readonly [number, number, number];
  /** 표면 곡률/모서리 노출도 (0.0 평면 ~ 1.0 날카로운 모서리, `ShaderNodeBevel` 입력) */
  readonly edgeCurvature?: number;
  /** 틈새 차폐도 (0.0 개방 ~ 1.0 깊은 틈새, `ShaderNodeAmbientOcclusion` 입력) */
  readonly cavityOcclusion?: number;
}

export interface BlenderNprShaderEvaluationResult {
  readonly presetId: string;
  /** `ShaderNodeBsdfToon` 출력 스칼라 (0.0 ~ 1.0) */
  readonly toonBsdfScalar: number;
  /** `ShaderNodeShaderToRGB` (AO·Bevel 결합 후 컬러램프 입력 팩터) */
  readonly shaderToRgbFactor: number;
  /** `ShaderNodeValToRGB` 램프 평가 RGB */
  readonly rampColorRgb: readonly [number, number, number];
  readonly rampColorHex: string;
  /** `ShaderNodeFresnel` + `ShaderNodeLayerWeight` 시선 가장자리 계수 */
  readonly fresnelFactor: number;
  readonly layerFacingFactor: number;
  /** `ShaderNodeBevel` 모서리 하이라이트 기여도 */
  readonly bevelHighlight: number;
  /** 최종 합성 NPR 표면 색상 */
  readonly finalSurfaceRgb: readonly [number, number, number];
  readonly finalSurfaceHex: string;
  readonly activeRampStopIndex: number;
}

export type FreestyleEdgeNature =
  | "SILHOUETTE"
  | "CREASE"
  | "SUGGESTIVE_CONTOUR"
  | "BORDER"
  | "MATERIAL_BOUNDARY";

export interface BlenderFreestyleInkPreset {
  readonly id: string;
  readonly nameKo: string;
  readonly descriptionKo: string;
  readonly enabledEdgeTypes: readonly FreestyleEdgeNature[];
  /** `Freestyle::FEdgeSharp` 크리즈 임계각 (도, 0 ~ 180) */
  readonly creaseAngleDeg: number;
  /** `SuggestiveContour` Kr 미분 임계값 */
  readonly suggestiveContourKrEpsilon: number;
  /** `RNA_ObjectLineArt` / `RNA_MaterialLineArt` 차폐 레벨 (0 = 가시선만, 1~3 = 투시선 허용) */
  readonly lineArtMaxOcclusion: 0 | 1 | 2 | 3;
  readonly baseThicknessPx: number;
  readonly strokeColorHex: string;
  /** `CalligraphicShader` 펜촉 각도 (도, 0 ~ 180) */
  readonly calligraphicOrientationDeg: number;
  readonly calligraphicMinThicknessRatio: number;
  readonly calligraphicMaxThicknessRatio: number;
  /** `BackboneStretcherShader` 선분 양끝 오버슈트 길이 (px) */
  readonly backboneStretchPx: number;
  /** `SpatialNoiseShader` 손그림 떨림 진폭 (px) */
  readonly spatialNoiseAmplitudePx: number;
  readonly spatialNoiseScale: number;
  readonly spatialNoiseOctaves: number;
  /** `IncreasingThicknessShader` 스트로크 진행에 따른 두께 배율 */
  readonly taperStartRatio: number;
  readonly taperEndRatio: number;
}

export interface FreestyleEdgeCandidate {
  readonly id: string;
  readonly startPoint2d: readonly [number, number];
  readonly endPoint2d: readonly [number, number];
  readonly dihedralAngleDeg: number;
  readonly isSilhouette: boolean;
  readonly isBorder: boolean;
  readonly isMaterialBoundary: boolean;
  readonly radialCurvatureDerivative: number;
  readonly occlusionLevel: number;
}

export interface FreestyleEvaluatedStroke {
  readonly edgeId: string;
  readonly classifiedNature: FreestyleEdgeNature;
  readonly stretchedStart2d: readonly [number, number];
  readonly stretchedEnd2d: readonly [number, number];
  readonly startThicknessPx: number;
  readonly midThicknessPx: number;
  readonly endThicknessPx: number;
  readonly calligraphicFactor: number;
  readonly midpointNoiseOffsetPx: readonly [number, number];
  readonly strokeColorHex: string;
}

export interface FreestyleViewMapEvaluation {
  readonly presetId: string;
  readonly totalCandidateEdges: number;
  readonly selectedStrokeCount: number;
  readonly strokes: readonly FreestyleEvaluatedStroke[];
  readonly averageThicknessPx: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function normalize3(v: readonly [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-8) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function dot3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (Math.abs(edge1 - edge0) < 1e-6) return x >= edge0 ? 1 : 0;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Blender `ccl::ToonBsdfNode` (`ShaderNodeBsdfToon`) 평가.
 * `size`와 `smooth` 파라미터를 이용해 각도 기반 만화 계조 스칼라를 반환한다.
 */
export function evaluateBlenderToonBsdf(
  component: BlenderToonBsdfComponent,
  size: number,
  smooth: number,
  normal: readonly [number, number, number],
  lightDir: readonly [number, number, number],
  viewDir: readonly [number, number, number],
): number {
  const n = normalize3(normal);
  const l = normalize3(lightDir);
  const v = normalize3(viewDir);

  let cosTheta: number;
  if (component === "GLOSSY") {
    const h = normalize3([l[0] + v[0], l[1] + v[1], l[2] + v[2]]);
    cosTheta = clamp(dot3(n, h), -1, 1);
  } else {
    cosTheta = clamp(dot3(n, l), -1, 1);
  }

  // 각도 (0 = 정면 일치, pi/2 = 수직)
  const angle = Math.acos(clamp(cosTheta, 0, 1));
  const maxAngle = clamp(size, 0.01, 1.0) * (Math.PI * 0.5);
  const smoothRange = clamp(smooth, 0, 1.0) * (Math.PI * 0.25);

  if (angle <= maxAngle) {
    return 1.0;
  }
  if (smoothRange <= 1e-5 || angle >= maxAngle + smoothRange) {
    return 0.0;
  }
  return Number((1 - (angle - maxAngle) / smoothRange).toFixed(4));
}

/**
 * Blender `ShaderNodeValToRGB` (ColorRamp) 멀티스톱 보간 평가.
 */
export function evaluateBlenderColorRamp(
  factorInput: number,
  stops: readonly BlenderColorRampStop[],
  interpolation: BlenderColorRampInterpolation,
): {
  readonly rgb: [number, number, number];
  readonly hex: string;
  readonly stopIndex: number;
} {
  if (stops.length === 0) {
    return { rgb: [1, 1, 1], hex: "#ffffff", stopIndex: 0 };
  }
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const f = clamp(factorInput, 0, 1);

  if (f <= sorted[0]!.position) {
    const rgb = hexToRgbNormalized(sorted[0]!.colorHex);
    return { rgb, hex: rgbNormalizedToHex(rgb), stopIndex: 0 };
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const left = sorted[i]!;
    const right = sorted[i + 1]!;
    if (f >= left.position && f <= right.position) {
      if (interpolation === "CONSTANT") {
        const rgb = hexToRgbNormalized(left.colorHex);
        return { rgb, hex: rgbNormalizedToHex(rgb), stopIndex: i };
      }
      const span = Math.max(1e-6, right.position - left.position);
      const rawT = clamp((f - left.position) / span, 0, 1);
      let t = rawT;
      if (interpolation === "EASE") {
        t = rawT * rawT * (3 - 2 * rawT);
      } else if (interpolation === "B_SPLINE") {
        t = 0.5 - 0.5 * Math.cos(rawT * Math.PI);
      }
      const c0 = hexToRgbNormalized(left.colorHex);
      const c1 = hexToRgbNormalized(right.colorHex);
      const rgb: [number, number, number] = [
        Number((c0[0] + (c1[0] - c0[0]) * t).toFixed(4)),
        Number((c0[1] + (c1[1] - c0[1]) * t).toFixed(4)),
        Number((c0[2] + (c1[2] - c0[2]) * t).toFixed(4)),
      ];
      return { rgb, hex: rgbNormalizedToHex(rgb), stopIndex: i };
    }
  }

  const lastIdx = sorted.length - 1;
  const lastRgb = hexToRgbNormalized(sorted[lastIdx]!.colorHex);
  return {
    rgb: lastRgb,
    hex: rgbNormalizedToHex(lastRgb),
    stopIndex: lastIdx,
  };
}

/**
 * Blender `ShaderNodeTree` (Toon BSDF → ShaderToRGB → ValToRGB + AO + Bevel + Fresnel/LayerWeight) 통합 평가.
 */
export function evaluateBlenderNprShaderTree(
  preset: BlenderNprShaderPreset,
  input: BlenderNprShaderSampleInput,
): BlenderNprShaderEvaluationResult {
  const n = normalize3(input.normal);
  const l = normalize3(input.lightDir);
  const v = normalize3(input.viewDir);

  const toonBsdfScalar = evaluateBlenderToonBsdf(
    preset.toonComponent,
    preset.toonSize,
    preset.toonSmooth,
    n,
    l,
    v,
  );

  const rawNdotL = clamp(dot3(n, l) * 0.5 + 0.5, 0, 1);
  const cavity = clamp(input.cavityOcclusion ?? 0, 0, 1);
  const aoAttenuation = 1 - cavity * clamp(preset.ambientOcclusionWeight, 0, 1);
  const curvature = clamp(input.edgeCurvature ?? 0, 0, 1);
  const bevelHighlight = Number(
    (
      curvature *
      clamp(preset.bevelRadius * 12, 0, 1) *
      clamp(preset.bevelHighlightStrength, 0, 2)
    ).toFixed(4),
  );

  // ShaderToRGB: ToonBSDF와 연속 램버트 조도를 블렌드한 뒤 AO 및 Bevel 모서리 광택 결합
  const shaderToRgbFactor = Number(
    clamp(
      (toonBsdfScalar * 0.65 + rawNdotL * 0.35) * aoAttenuation +
        bevelHighlight * 0.25,
      0,
      1,
    ).toFixed(4),
  );

  const rampEval = evaluateBlenderColorRamp(
    shaderToRgbFactor,
    preset.colorRampStops,
    preset.rampInterpolation,
  );

  // Schlick Fresnel (`ShaderNodeFresnel`) 및 LayerWeight (`ShaderNodeLayerWeight`)
  const nDotV = clamp(Math.abs(dot3(n, v)), 0, 1);
  const ior = Math.max(1.01, preset.fresnelIor);
  const r0 = Math.pow((ior - 1) / (ior + 1), 2);
  const fresnelFactor = Number(
    clamp(r0 + (1 - r0) * Math.pow(1 - nDotV, 5), 0, 1).toFixed(4),
  );
  const blend = clamp(preset.layerWeightBlend, 0.01, 0.99);
  const layerFacingFactor = Number(
    clamp(Math.pow(1 - nDotV, 1 / (1 - blend * 0.85)), 0, 1).toFixed(4),
  );

  const rimColor = hexToRgbNormalized(preset.rimTintHex);
  const emissionColor = hexToRgbNormalized(preset.emissionColorHex);
  const rimWeight =
    (fresnelFactor * 0.5 + layerFacingFactor * 0.5) *
    clamp(preset.rimStrength, 0, 2);
  const emitWeight = clamp(preset.emissionStrength, 0, 3) * 0.25;

  const finalSurfaceRgb: [number, number, number] = [
    Number(
      clamp(
        rampEval.rgb[0] +
          rimColor[0] * rimWeight +
          bevelHighlight * 0.2 +
          emissionColor[0] * emitWeight,
        0,
        1,
      ).toFixed(4),
    ),
    Number(
      clamp(
        rampEval.rgb[1] +
          rimColor[1] * rimWeight +
          bevelHighlight * 0.2 +
          emissionColor[1] * emitWeight,
        0,
        1,
      ).toFixed(4),
    ),
    Number(
      clamp(
        rampEval.rgb[2] +
          rimColor[2] * rimWeight +
          bevelHighlight * 0.2 +
          emissionColor[2] * emitWeight,
        0,
        1,
      ).toFixed(4),
    ),
  ];

  return {
    presetId: preset.id,
    toonBsdfScalar,
    shaderToRgbFactor,
    rampColorRgb: rampEval.rgb,
    rampColorHex: rampEval.hex,
    fresnelFactor,
    layerFacingFactor,
    bevelHighlight,
    finalSurfaceRgb,
    finalSurfaceHex: rgbNormalizedToHex(finalSurfaceRgb),
    activeRampStopIndex: rampEval.stopIndex,
  };
}

/**
 * Blender `Freestyle::Controller::ComputeViewMap` 및 스트로크 모디파이어
 * (`CalligraphicShader`, `BackboneStretcherShader`, `SpatialNoiseShader`, `IncreasingThicknessShader`) 평가.
 */
export function evaluateFreestyleViewMapStrokes(
  preset: BlenderFreestyleInkPreset,
  candidates: readonly FreestyleEdgeCandidate[],
): FreestyleViewMapEvaluation {
  const strokes: FreestyleEvaluatedStroke[] = [];
  const enabledSet = new Set(preset.enabledEdgeTypes);

  for (const edge of candidates) {
    if (edge.occlusionLevel > preset.lineArtMaxOcclusion) {
      continue;
    }

    let nature: FreestyleEdgeNature | null = null;
    if (edge.isSilhouette && enabledSet.has("SILHOUETTE")) {
      nature = "SILHOUETTE";
    } else if (edge.isBorder && enabledSet.has("BORDER")) {
      nature = "BORDER";
    } else if (edge.isMaterialBoundary && enabledSet.has("MATERIAL_BOUNDARY")) {
      nature = "MATERIAL_BOUNDARY";
    } else if (
      edge.dihedralAngleDeg >= preset.creaseAngleDeg &&
      enabledSet.has("CREASE")
    ) {
      nature = "CREASE";
    } else if (
      edge.radialCurvatureDerivative >= preset.suggestiveContourKrEpsilon &&
      enabledSet.has("SUGGESTIVE_CONTOUR")
    ) {
      nature = "SUGGESTIVE_CONTOUR";
    }

    if (!nature) continue;

    const dx = edge.endPoint2d[0] - edge.startPoint2d[0];
    const dy = edge.endPoint2d[1] - edge.startPoint2d[1];
    const len = Math.hypot(dx, dy);
    const tx = len > 1e-5 ? dx / len : 1;
    const ty = len > 1e-5 ? dy / len : 0;

    // 1. BackboneStretcherShader: 양 끝점을 접선 방향으로 오버슈트 연장
    const stretch = Math.max(0, preset.backboneStretchPx);
    const stretchedStart2d: [number, number] = [
      Number((edge.startPoint2d[0] - tx * stretch).toFixed(2)),
      Number((edge.startPoint2d[1] - ty * stretch).toFixed(2)),
    ];
    const stretchedEnd2d: [number, number] = [
      Number((edge.endPoint2d[0] + tx * stretch).toFixed(2)),
      Number((edge.endPoint2d[1] + ty * stretch).toFixed(2)),
    ];

    // 2. CalligraphicShader: 펜촉 각도와 스트로크 법선 방향의 내적으로 두께 변조
    const nibAngleRad = (preset.calligraphicOrientationDeg * Math.PI) / 180;
    const nibX = Math.cos(nibAngleRad);
    const nibY = Math.sin(nibAngleRad);
    const alignment = Math.abs(tx * nibX + ty * nibY);
    const calligraphicFactor = Number(
      (
        preset.calligraphicMinThicknessRatio +
        (preset.calligraphicMaxThicknessRatio -
          preset.calligraphicMinThicknessRatio) *
          alignment
      ).toFixed(4),
    );

    // 3. CreaseAngle / Nature 가중치 + IncreasingThicknessShader 테이퍼링
    const natureBoost =
      nature === "SILHOUETTE"
        ? 1.25
        : nature === "BORDER"
          ? 1.15
          : nature === "CREASE"
            ? 0.9 + smoothstep(preset.creaseAngleDeg, 180, edge.dihedralAngleDeg) * 0.25
            : 0.8;

    const midThicknessPx = Number(
      (preset.baseThicknessPx * calligraphicFactor * natureBoost).toFixed(2),
    );
    const startThicknessPx = Number(
      (midThicknessPx * preset.taperStartRatio).toFixed(2),
    );
    const endThicknessPx = Number(
      (midThicknessPx * preset.taperEndRatio).toFixed(2),
    );

    // 4. SpatialNoiseShader: 중점 법선 방향 결정론적 손그림 떨림 오프셋
    const seedPhase =
      (edge.startPoint2d[0] * 0.13 + edge.endPoint2d[1] * 0.29) *
      Math.max(0.1, preset.spatialNoiseScale);
    const wave =
      Math.sin(seedPhase) * 0.65 +
      Math.cos(seedPhase * Math.max(1, preset.spatialNoiseOctaves)) * 0.35;
    const normal2dX = -ty;
    const normal2dY = tx;
    const noiseMag = preset.spatialNoiseAmplitudePx * wave;
    const midpointNoiseOffsetPx: [number, number] = [
      Number((normal2dX * noiseMag).toFixed(2)),
      Number((normal2dY * noiseMag).toFixed(2)),
    ];

    strokes.push({
      edgeId: edge.id,
      classifiedNature: nature,
      stretchedStart2d,
      stretchedEnd2d,
      startThicknessPx,
      midThicknessPx,
      endThicknessPx,
      calligraphicFactor,
      midpointNoiseOffsetPx,
      strokeColorHex: preset.strokeColorHex,
    });
  }

  const averageThicknessPx =
    strokes.length > 0
      ? Number(
          (
            strokes.reduce((acc, s) => acc + s.midThicknessPx, 0) /
            strokes.length
          ).toFixed(2),
        )
      : 0;

  return {
    presetId: preset.id,
    totalCandidateEdges: candidates.length,
    selectedStrokeCount: strokes.length,
    strokes,
    averageThicknessPx,
  };
}

export {
  BLENDER_FREESTYLE_INK_PRESETS,
  BLENDER_NPR_SHADER_PRESETS,
  DEFAULT_FREESTYLE_SAMPLE_EDGES,
} from "./studio-3d-blender-npr-shader-freestyle-presets";
