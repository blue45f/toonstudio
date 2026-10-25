/**
 * Blender 5.2 (EEVEE Next / Cycles) 광원·라이트 프로브·IES·색온도 조명 엔진.
 *
 * REA 정적 역공학 근거:
 * - `/Applications/Blender.app/Contents/MacOS/Blender` (`ev_fd18384d554a9f3b4468d3a4f857d63b125d2a883e1ba046b5a891f6da972821`):
 *   `RNA_SceneEEVEE`, `RNA_RaytraceEEVEE`, `SceneEEVEE_use_fast_gi`, `SceneEEVEE_use_shadows`,
 *   `EEVEE_lightbake_job_create`, `ccl::IESLightNode`, `ccl::PointLight::get_radius_socket`
 * - `properties_data_light.cpython-313.pyc` (`ev_f1fcd4d9626d767dc5600c0a6eaa90e29da78a283d375339176d7d6179de0bcd`):
 *   `POINT`, `SUN`, `SPOT`, `AREA` (`RECTANGLE`, `DISK`), `use_temperature`, `temperature`,
 *   `shadow_soft_size`, `spot_size`, `spot_blend`, `exposure`, `diffuse_factor`, `specular_factor`, `volume_factor`
 * - `properties_data_lightprobe.cpython-313.pyc` (`ev_a54fc5a37a5d729da7281f8a0d240805d3286087b1e5b277fe6094c31eefd479`):
 *   `VOLUME`, `SPHERE`, `PLANE`, `influence_distance`, `falloff`, `intensity`, `surfel_density`
 */

export type BlenderLightType = "POINT" | "SUN" | "SPOT" | "AREA";

export type BlenderAreaLightShape = "SQUARE" | "RECTANGLE" | "DISK" | "ELLIPSE";

export type BlenderIesProfileKind =
  | "omni-uniform"
  | "narrow-spot-15"
  | "gothic-window-slit"
  | "magic-pillar-beam"
  | "torch-lantern-ring"
  | "dungeon-grate-gobo";

export type BlenderLightProbeType = "VOLUME" | "SPHERE" | "PLANE";

export interface BlenderEeveeLightSpec {
  readonly id: string;
  readonly labelKo: string;
  readonly type: BlenderLightType;
  readonly position: readonly [number, number, number];
  /** 광원이 비추는 방향 벡터 (광원 → 피사체 방향) */
  readonly direction: readonly [number, number, number];
  readonly baseColorHex: string;
  readonly useTemperature: boolean;
  /** 흑체 복사 색온도 (1000K ~ 12000K) */
  readonly temperatureKelvin: number;
  /** 색조 보정 (-1.0 마젠타 ~ +1.0 그린) */
  readonly tint: number;
  /** 광원 에너지 (W 또는 W/m^2) */
  readonly energyWatts: number;
  /** EEVEE 노출 보정 (2^exposure 배율) */
  readonly exposure: number;
  /** 구면 반경 (POINT/SPOT soft shadow radius, m) */
  readonly shadowSoftSize: number;
  /** SPOT 원뿔 각도 (도, 1 ~ 180) */
  readonly spotSizeDeg?: number;
  /** SPOT 가장자리 블렌드 (0.0 ~ 1.0) */
  readonly spotBlend?: number;
  /** AREA 광원 형상 */
  readonly areaShape?: BlenderAreaLightShape;
  readonly areaSizeX?: number;
  readonly areaSizeY?: number;
  /** IES 배광 프로파일 */
  readonly iesProfile: BlenderIesProfileKind;
  readonly diffuseFactor: number;
  readonly specularFactor: number;
  readonly volumeFactor: number;
  readonly castsShadow: boolean;
}

export interface BlenderLightProbeVolumeSpec {
  readonly id: string;
  readonly labelKo: string;
  readonly type: BlenderLightProbeType;
  readonly center: readonly [number, number, number];
  readonly halfExtents: readonly [number, number, number];
  readonly influenceDistance: number;
  /** 감쇠 비율 (0.0 ~ 1.0) */
  readonly falloff: number;
  readonly intensity: number;
  readonly gridResolution: readonly [number, number, number];
  readonly surfelDensity: number;
  readonly ambientSkyColorHex: string;
  readonly groundBounceColorHex: string;
  readonly fastGiEnabled: boolean;
  readonly raytraceGiBounceIntensity: number;
}

export interface BlenderFantasyLightingRigPreset {
  readonly id: string;
  readonly nameKo: string;
  readonly categoryKo: string;
  readonly descriptionKo: string;
  readonly lights: readonly BlenderEeveeLightSpec[];
  readonly lightProbe: BlenderLightProbeVolumeSpec;
  readonly eeveeRaytraceEnabled: boolean;
  readonly volumetricFogDensity: number;
  readonly volumetricAnisotropy: number;
  readonly shadowCascadeCount: 1 | 2 | 4;
}

export interface BlenderEeveeLightSampleResult {
  readonly lightId: string;
  readonly effectiveColorRgb: readonly [number, number, number];
  readonly effectiveColorHex: string;
  readonly distanceAttenuation: number;
  readonly iesAttenuation: number;
  readonly spotConeAttenuation: number;
  readonly diffuseIrradiance: number;
  readonly specularHighlight: number;
  readonly rimContribution: number;
  readonly volumetricScatter: number;
}

export interface BlenderLightProbeSampleResult {
  readonly probeId: string;
  readonly weight: number;
  readonly irradianceRgb: readonly [number, number, number];
  readonly irradianceHex: string;
  readonly fastGiBounceFactor: number;
  readonly totalSurfelCountEstimate: number;
}

export interface BlenderFantasyLightingEvaluation {
  readonly rigId: string;
  readonly lightSamples: readonly BlenderEeveeLightSampleResult[];
  readonly probeSample: BlenderLightProbeSampleResult;
  readonly combinedDiffuseRgb: readonly [number, number, number];
  readonly combinedDiffuseHex: string;
  readonly combinedSpecularIntensity: number;
  readonly combinedRimIntensity: number;
  readonly combinedVolumetricGlow: number;
  readonly contrastRatio: number;
  readonly webtoonReadabilityGrade: "S" | "A" | "B";
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

export function hexToRgbNormalized(hex: string): [number, number, number] {
  const cleaned = hex.replace(/^#/, "").trim();
  if (cleaned.length !== 6) return [1, 1, 1];
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return [1, 1, 1];
  return [r / 255, g / 255, b / 255];
}

export function rgbNormalizedToHex(rgb: readonly [number, number, number]): string {
  const toByte = (c: number) =>
    Math.round(clamp(c, 0, 1) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toByte(rgb[0])}${toByte(rgb[1])}${toByte(rgb[2])}`;
}

/**
 * Blender `use_temperature` / `ShaderNodeBlackbody` 기반 색온도(Kelvin) → RGB 변환.
 * 플랑크 흑체 복사 근사식과 그린-마젠타 Tint 보정을 함께 적용한다.
 */
export function kelvinToLinearRgb(
  kelvinInput: number,
  tintInput = 0,
): [number, number, number] {
  const kelvin = clamp(kelvinInput, 1000, 12000);
  const temp = kelvin / 100;
  let r: number;
  let g: number;
  let b: number;

  if (temp <= 66) {
    r = 1.0;
    g = clamp((99.4708025861 * Math.log(temp) - 161.1195681661) / 255, 0, 1);
    if (temp <= 19) {
      b = 0.0;
    } else {
      b = clamp((138.5177312231 * Math.log(temp - 10) - 305.0447927307) / 255, 0, 1);
    }
  } else {
    r = clamp((329.698727446 * Math.pow(temp - 60, -0.1332047592)) / 255, 0, 1);
    g = clamp((288.1221695283 * Math.pow(temp - 60, -0.0755148492)) / 255, 0, 1);
    b = 1.0;
  }

  const tint = clamp(tintInput, -1, 1);
  const rTinted = clamp(r - tint * 0.12, 0, 1);
  const gTinted = clamp(g + tint * 0.16, 0, 1);
  const bTinted = clamp(b - tint * 0.12, 0, 1);

  return [
    Number(rTinted.toFixed(4)),
    Number(gTinted.toFixed(4)),
    Number(bTinted.toFixed(4)),
  ];
}

/**
 * Blender `ccl::IESLightNode` 배광(Photometric) 프로파일 감쇠율 계산.
 * @param profile IES 프로파일 종류
 * @param cosAngle 광축과 샘플 방향 사이 코사인 값 (-1.0 ~ 1.0)
 * @param azimuthRad 수평 방위각 (라디안, 고보/창문 슬릿 패턴용)
 */
export function evaluateIesProfileAttenuation(
  profile: BlenderIesProfileKind,
  cosAngle: number,
  azimuthRad = 0,
): number {
  const c = clamp(cosAngle, -1, 1);
  switch (profile) {
    case "omni-uniform":
      return 1.0;
    case "narrow-spot-15": {
      if (c <= 0.85) return 0;
      return Number(Math.pow((c - 0.85) / 0.15, 2.2).toFixed(4));
    }
    case "magic-pillar-beam": {
      const core = Math.pow(Math.max(0, c), 6);
      const ring = Math.exp(-Math.pow((c - 0.72) / 0.08, 2)) * 0.65;
      return Number(clamp(core + ring, 0, 1).toFixed(4));
    }
    case "torch-lantern-ring": {
      // 등불/횃불: 상하 극점보다 측면 링 대역이 밝은 배광
      const equatorial = 1 - Math.abs(c) * 0.55;
      const flickerBand = 0.85 + 0.15 * Math.cos(azimuthRad * 3);
      return Number(clamp(equatorial * flickerBand, 0.1, 1).toFixed(4));
    }
    case "gothic-window-slit": {
      if (c <= 0.25) return 0;
      const slitMask = 0.5 + 0.5 * Math.cos(azimuthRad * 4);
      return Number(clamp(Math.pow(c, 1.8) * slitMask, 0, 1).toFixed(4));
    }
    case "dungeon-grate-gobo": {
      if (c <= 0.1) return 0;
      const grateX = Math.sin(azimuthRad * 6) > -0.25 ? 1 : 0.18;
      const grateY = Math.cos(c * 18) > -0.3 ? 1 : 0.22;
      return Number(clamp(c * grateX * grateY, 0, 1).toFixed(4));
    }
  }
}

/**
 * 개별 Blender EEVEE 광원이 표면 지점에 기여하는 조도·하이라이트·림·볼륨 산란을 계산한다.
 */
export function evaluateEeveeLightContribution(
  light: BlenderEeveeLightSpec,
  surfacePoint: readonly [number, number, number],
  surfaceNormal: readonly [number, number, number],
  viewDir: readonly [number, number, number],
): BlenderEeveeLightSampleResult {
  const normal = normalize3(surfaceNormal);
  const view = normalize3(viewDir);
  const baseRgb = hexToRgbNormalized(light.baseColorHex);
  const tempRgb = light.useTemperature
    ? kelvinToLinearRgb(light.temperatureKelvin, light.tint)
    : ([1, 1, 1] as const);

  const effectiveColorRgb: [number, number, number] = [
    Number(clamp(baseRgb[0] * tempRgb[0], 0, 1).toFixed(4)),
    Number(clamp(baseRgb[1] * tempRgb[1], 0, 1).toFixed(4)),
    Number(clamp(baseRgb[2] * tempRgb[2], 0, 1).toFixed(4)),
  ];

  const exposureScale = Math.pow(2, clamp(light.exposure, -10, 10));
  const rawPower = Math.max(0, light.energyWatts) * exposureScale;

  let lightToSurfaceDir: [number, number, number];
  let distanceAttenuation: number;

  if (light.type === "SUN") {
    lightToSurfaceDir = normalize3(light.direction);
    distanceAttenuation = 1.0;
  } else {
    const dx = surfacePoint[0] - light.position[0];
    const dy = surfacePoint[1] - light.position[1];
    const dz = surfacePoint[2] - light.position[2];
    const distSq = dx * dx + dy * dy + dz * dz;
    const radiusSq = Math.max(0.01, light.shadowSoftSize * light.shadowSoftSize);
    // Blender PointLight sphere radius 부드러운 역제곱 감쇠
    distanceAttenuation = Number((1 / (1 + distSq / (radiusSq + 4))).toFixed(4));
    lightToSurfaceDir = normalize3([dx, dy, dz]);
  }

  // 광원 방향 벡터(surface -> light)는 -lightToSurfaceDir
  const surfaceToLight: [number, number, number] = [
    -lightToSurfaceDir[0],
    -lightToSurfaceDir[1],
    -lightToSurfaceDir[2],
  ];

  const axisDir = normalize3(light.direction);
  const cosToAxis = dot3(lightToSurfaceDir, axisDir);
  const azimuth = Math.atan2(lightToSurfaceDir[2], lightToSurfaceDir[0]);
  const iesAttenuation = evaluateIesProfileAttenuation(
    light.iesProfile,
    cosToAxis,
    azimuth,
  );

  let spotConeAttenuation = 1.0;
  if (light.type === "SPOT") {
    const halfConeRad = (clamp(light.spotSizeDeg ?? 45, 1, 180) * 0.5 * Math.PI) / 180;
    const cosOuter = Math.cos(halfConeRad);
    const blend = clamp(light.spotBlend ?? 0.25, 0.01, 1);
    const cosInner = Math.cos(halfConeRad * (1 - blend));
    if (cosToAxis <= cosOuter) {
      spotConeAttenuation = 0;
    } else if (cosToAxis >= cosInner) {
      spotConeAttenuation = 1;
    } else {
      spotConeAttenuation = Number(
        ((cosToAxis - cosOuter) / Math.max(1e-5, cosInner - cosOuter)).toFixed(4),
      );
    }
  } else if (light.type === "AREA") {
    const areaArea = Math.max(0.1, (light.areaSizeX ?? 1) * (light.areaSizeY ?? 1));
    spotConeAttenuation = Number((Math.max(0, cosToAxis) * Math.min(2.0, Math.sqrt(areaArea))).toFixed(4));
  }

  const nDotL = Math.max(0, dot3(normal, surfaceToLight));
  const halfVec = normalize3([
    surfaceToLight[0] + view[0],
    surfaceToLight[1] + view[1],
    surfaceToLight[2] + view[2],
  ]);
  const nDotH = Math.max(0, dot3(normal, halfVec));
  const nDotV = Math.max(0, dot3(normal, view));

  const totalFlux =
    (rawPower / 100) * distanceAttenuation * iesAttenuation * spotConeAttenuation;

  const diffuseIrradiance = Number(
    (totalFlux * nDotL * clamp(light.diffuseFactor, 0, 2)).toFixed(4),
  );
  const specularHighlight = Number(
    (
      totalFlux *
      Math.pow(nDotH, 24) *
      clamp(light.specularFactor, 0, 2)
    ).toFixed(4),
  );
  // 역광(Rim) 기여도: 시선 가장자리(1 - N·V)와 후방 광원 정렬 결합
  const backLightAlignment = Math.max(0, -dot3(view, surfaceToLight));
  const rimContribution = Number(
    (
      totalFlux *
      Math.pow(1 - nDotV, 2.2) *
      (0.35 + 0.65 * backLightAlignment)
    ).toFixed(4),
  );
  const volumetricScatter = Number(
    (totalFlux * 0.35 * clamp(light.volumeFactor, 0, 2)).toFixed(4),
  );

  return {
    lightId: light.id,
    effectiveColorRgb,
    effectiveColorHex: rgbNormalizedToHex(effectiveColorRgb),
    distanceAttenuation,
    iesAttenuation,
    spotConeAttenuation,
    diffuseIrradiance,
    specularHighlight,
    rimContribution,
    volumetricScatter,
  };
}

/**
 * Blender `LightProbe` (`VOLUME` / `SPHERE` / `PLANE`) 및 EEVEE Fast GI 볼륨 조도 평가.
 */
export function evaluateLightProbeVolumeIrradiance(
  probe: BlenderLightProbeVolumeSpec,
  samplePoint: readonly [number, number, number],
): BlenderLightProbeSampleResult {
  const dx = Math.max(
    0,
    Math.abs(samplePoint[0] - probe.center[0]) - probe.halfExtents[0],
  );
  const dy = Math.max(
    0,
    Math.abs(samplePoint[1] - probe.center[1]) - probe.halfExtents[1],
  );
  const dz = Math.max(
    0,
    Math.abs(samplePoint[2] - probe.center[2]) - probe.halfExtents[2],
  );
  const outsideDist = Math.hypot(dx, dy, dz);
  const maxDist = Math.max(0.01, probe.influenceDistance);
  const falloffScale = Math.max(0.05, probe.falloff);

  const rawWeight =
    outsideDist <= 0
      ? 1.0
      : clamp(1 - outsideDist / (maxDist * falloffScale), 0, 1);

  const skyRgb = hexToRgbNormalized(probe.ambientSkyColorHex);
  const groundRgb = hexToRgbNormalized(probe.groundBounceColorHex);
  const fastGiBoost = probe.fastGiEnabled
    ? 1 + clamp(probe.raytraceGiBounceIntensity, 0, 2) * 0.35
    : 1.0;

  const scale = rawWeight * clamp(probe.intensity, 0, 5) * fastGiBoost;
  const irradianceRgb: [number, number, number] = [
    Number(clamp((skyRgb[0] * 0.65 + groundRgb[0] * 0.35) * scale, 0, 1).toFixed(4)),
    Number(clamp((skyRgb[1] * 0.65 + groundRgb[1] * 0.35) * scale, 0, 1).toFixed(4)),
    Number(clamp((skyRgb[2] * 0.65 + groundRgb[2] * 0.35) * scale, 0, 1).toFixed(4)),
  ];

  const [rx, ry, rz] = probe.gridResolution;
  const totalSurfelCountEstimate = Math.round(
    rx * ry * rz * Math.max(1, probe.surfelDensity),
  );

  return {
    probeId: probe.id,
    weight: Number(rawWeight.toFixed(4)),
    irradianceRgb,
    irradianceHex: rgbNormalizedToHex(irradianceRgb),
    fastGiBounceFactor: Number(fastGiBoost.toFixed(4)),
    totalSurfelCountEstimate,
  };
}

/**
 * 판타지 웹툰 조명 리그 전체(다중 EEVEE 광원 + 라이트 프로브 + 볼륨 산란)를 통합 평가한다.
 */
export function evaluateBlenderFantasyLightingRig(
  rig: BlenderFantasyLightingRigPreset,
  samplePoint: readonly [number, number, number] = [0, 1.4, 0],
  surfaceNormal: readonly [number, number, number] = [0, 0.3, 0.95],
  viewDir: readonly [number, number, number] = [0, 0.1, 1],
): BlenderFantasyLightingEvaluation {
  const lightSamples = rig.lights.map((light) =>
    evaluateEeveeLightContribution(light, samplePoint, surfaceNormal, viewDir),
  );
  const probeSample = evaluateLightProbeVolumeIrradiance(
    rig.lightProbe,
    samplePoint,
  );

  let r = probeSample.irradianceRgb[0] * 0.35;
  let g = probeSample.irradianceRgb[1] * 0.35;
  let b = probeSample.irradianceRgb[2] * 0.35;
  let specSum = 0;
  let rimSum = 0;
  let volSum = 0;

  for (const s of lightSamples) {
    r += s.effectiveColorRgb[0] * s.diffuseIrradiance;
    g += s.effectiveColorRgb[1] * s.diffuseIrradiance;
    b += s.effectiveColorRgb[2] * s.diffuseIrradiance;
    specSum += s.specularHighlight;
    rimSum += s.rimContribution;
    volSum += s.volumetricScatter;
  }

  const combinedDiffuseRgb: [number, number, number] = [
    Number(clamp(r, 0, 1).toFixed(4)),
    Number(clamp(g, 0, 1).toFixed(4)),
    Number(clamp(b, 0, 1).toFixed(4)),
  ];

  const volumetricMultiplier =
    1 + rig.volumetricFogDensity * 4.5 + Math.abs(rig.volumetricAnisotropy) * 0.4;
  const combinedVolumetricGlow = Number(
    (volSum * volumetricMultiplier).toFixed(4),
  );

  const keyLum = Math.max(
    0.05,
    ...lightSamples.map((s) => s.diffuseIrradiance + s.rimContribution),
  );
  const ambientLum = Math.max(
    0.04,
    (probeSample.irradianceRgb[0] +
      probeSample.irradianceRgb[1] +
      probeSample.irradianceRgb[2]) /
      3,
  );
  const contrastRatio = Number((keyLum / ambientLum).toFixed(2));
  const webtoonReadabilityGrade: "S" | "A" | "B" =
    rimSum >= 0.25 && contrastRatio >= 1.8
      ? "S"
      : contrastRatio >= 1.2
        ? "A"
        : "B";

  return {
    rigId: rig.id,
    lightSamples,
    probeSample,
    combinedDiffuseRgb,
    combinedDiffuseHex: rgbNormalizedToHex(combinedDiffuseRgb),
    combinedSpecularIntensity: Number(specSum.toFixed(4)),
    combinedRimIntensity: Number(rimSum.toFixed(4)),
    combinedVolumetricGlow,
    contrastRatio,
    webtoonReadabilityGrade,
  };
}

export {
  BLENDER_FANTASY_LIGHTING_RIG_PRESETS,
  findBlenderFantasyLightingRigPreset,
} from "./studio-3d-blender-eevee-lighting-presets";
