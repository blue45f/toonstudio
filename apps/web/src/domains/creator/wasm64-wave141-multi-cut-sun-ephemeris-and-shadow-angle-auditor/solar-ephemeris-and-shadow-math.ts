/**
 * Wave 141 — 천문 태양·달 위치 계산기 및 3D→2D 카메라 그림자 투영 엔진.
 *
 * - 위도, 연중 일수(1..365), 태양시(0..24)로부터 순수 삼각함수로 적위·시간각·고도각·방위각·색온도를 산출한다.
 * - ENU(East-North-Up) 3D 광원·그림자 벡터를 카메라 방위각(Yaw)·앙각(Pitch)으로 투영해
 *   웹툰 컷 2D 캔버스 상 기대 그림자 각도, 길이 비율, 림라이트 방향을 결정론적으로 계산한다.
 */

export type CelestialBody = "sun" | "moon";

export type LightSourceType =
  | "outdoor-solar"
  | "outdoor-lunar"
  | "indoor-window"
  | "indoor-practical";

export type RimLightSide = "left" | "right" | "top" | "back";

export type TimeOfDayBand =
  | "night"
  | "twilight"
  | "golden-hour"
  | "morning-afternoon"
  | "midday";

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Vec3Enu {
  readonly east: number;
  readonly north: number;
  readonly up: number;
}

export interface SolarEphemerisInput {
  /** 위도 (도, 북위 양수, 예: 서울 37.5665). */
  readonly latitudeDeg: number;
  /** 연중 일수 (1..365, 하지 172, 동지 355). */
  readonly dayOfYear: number;
  /** 태양시 (0..24, 12.0 = 남중 정오). */
  readonly localSolarHour: number;
  /** 천체 종류 (기본값: "sun"). */
  readonly celestialBody?: CelestialBody;
  /** 음력 위상 일수 (0..29.53059, 보름달 기본값 14.765). */
  readonly lunarPhaseDay?: number;
  /** 피사체 키 (미터, 기본값 1.7m). */
  readonly objectHeightM?: number;
  /** 저고도 그림자 길이 폭주 방지 최소 고도 클램프 (도, 기본값 4°). */
  readonly minElevationClampDeg?: number;
  /** 그림자 길이 대 키 최대 배율 클램프 (기본값 12.0배). */
  readonly maxShadowLengthRatio?: number;
}

export interface SolarEphemerisResult {
  readonly celestialBody: CelestialBody;
  readonly latitudeDeg: number;
  readonly dayOfYear: number;
  readonly localSolarHour: number;
  readonly declinationDeg: number;
  readonly hourAngleDeg: number;
  readonly elevationDeg: number;
  /** 북=0° 시계방향 방위각 (동=90°, 남=180°, 서=270°). */
  readonly azimuthDeg: number;
  /** 월드 바닥면 그림자 투사 방위각 ((azimuthDeg + 180) % 360). */
  readonly worldShadowAzimuthDeg: number;
  readonly isAboveHorizon: boolean;
  readonly timeOfDayBand: TimeOfDayBand;
  /** 물리 기반 자연광 색온도 (Kelvin). */
  readonly colorTemperatureK: number;
  readonly objectHeightM: number;
  readonly shadowLengthM: number;
  /** 그림자 길이 / 피사체 키 비율. */
  readonly shadowLengthRatio: number;
  /** 광원 방향 단위 벡터 (피사체 -> 광원, ENU). */
  readonly lightDirectionWorldEnu: Vec3Enu;
  /** 바닥면 그림자 방향 단위 벡터 (피사체 -> 그림자 끝, ENU). */
  readonly shadowDirectionWorldEnu: Vec3Enu;
}

export interface CutLightScreenProjectionInput {
  /** 광원 방위각 (북=0° 시계방향). */
  readonly lightAzimuthDeg: number;
  /** 광원 고도각 (도, 지평선 0°, 천정 90°). */
  readonly lightElevationDeg: number;
  /** 월드 바닥 그림자 길이 비율 (shadowLengthM / objectHeightM). */
  readonly worldShadowLengthRatio: number;
  /** 카메라 수평 시선 방위각 (북=0° 시계방향). */
  readonly cameraYawDeg: number;
  /** 카메라 수직 앙각/부감각 (도, 수평 0°, 내려다봄 음수, 올려다봄 양수, 기본 -10°). */
  readonly cameraPitchDeg?: number;
}

export interface CutLightScreenProjectionResult {
  /** 2D 캔버스 기대 그림자 각도 (도, 우=0°, 하=90°, 좌=180°, 상=270°). */
  readonly expectedScreenShadowAngleDeg: number;
  /** 2D 캔버스 기대 그림자 단위 벡터 (+x 우측, +y 하단). */
  readonly expectedScreenShadowDir: Vec2;
  /** 원근 단축을 반영한 2D 캔버스 기대 그림자 길이 비율. */
  readonly expectedScreenShadowLengthRatio: number;
  /** 카메라 기준 기대 림라이트/키라이트 방향. */
  readonly expectedRimSide: RimLightSide;
  /** 카메라 우측 축(+1=화면 우측 광원, -1=화면 좌측 광원) 광원 성분. */
  readonly lightRightComponent: number;
  /** 카메라 전방 축(+1=피사체 뒤 역광, -1=카메라 뒤 순광) 광원 성분. */
  readonly lightForwardComponent: number;
  /** 카메라 상단 축(+1=천정) 광원 성분. */
  readonly lightUpComponent: number;
  /** 깊이 축 단축 계수 (0.14..1.0). */
  readonly depthForeshorteningFactor: number;
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EARTH_AXIAL_TILT_DEG = 23.44;
const SYNODIC_MONTH_DAYS = 29.53059;
const SIDEREAL_MONTH_DAYS = 27.32166;
const LUNAR_ORBITAL_INCLINATION_DEG = 5.14;

/** 유한 수치를 범위로 클램프하고 비유한 입력은 기본값으로 복구한다. */
export function clampFiniteNumber(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** 각도를 [0, 360) 범위로 정규화한다. */
export function normalizeDegrees360(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const mod = ((deg % 360) + 360) % 360;
  return Object.is(mod, -0) || mod >= 360 ? 0 : mod;
}

/** 각도를 (-180, 180] 범위의 부호 있는 각도로 정규화한다. */
export function normalizeSignedAngleDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const mod = normalizeDegrees360(deg);
  return mod > 180 ? mod - 360 : mod;
}

/** 두 각도 사이의 최단 각거리([0, 180])를 반환한다. */
export function angularDistanceDeg(aDeg: number, bDeg: number): number {
  const diff = Math.abs(normalizeSignedAngleDeg(aDeg - bDeg));
  return diff > 180 ? 360 - diff : diff;
}

/** 도(degree)를 라디안(radian)으로 변환한다. */
export function degToRad(deg: number): number {
  return (Number.isFinite(deg) ? deg : 0) * DEG_TO_RAD;
}

/** 라디안(radian)을 도(degree)로 변환한다. */
export function radToDeg(rad: number): number {
  return (Number.isFinite(rad) ? rad : 0) * RAD_TO_DEG;
}

/** 선형 보간(t는 [0, 1]로 클램프). */
function lerpClamped(a: number, b: number, t: number): number {
  const u = clampFiniteNumber(t, 0, 1, 0);
  return a + (b - a) * u;
}

/**
 * 태양 또는 달 고도각에 따른 물리 기반 자연광 색온도(Kelvin)와 시간대 구간을 산출한다.
 * - 일출·일몰 저고도 태양(0°..15°): 2700~3800K
 * - 정오 고고도 태양(30°..90°): 5500~6500K
 * - 박명·야간·달빛: 7500~9500K
 */
export function estimateNaturalColorTemperatureK(
  elevationDeg: number,
  celestialBody: CelestialBody,
): { readonly colorTemperatureK: number; readonly timeOfDayBand: TimeOfDayBand } {
  const elev = clampFiniteNumber(elevationDeg, -90, 90, 0);

  if (celestialBody === "moon") {
    if (elev <= 0) {
      return {
        colorTemperatureK: Math.round(lerpClamped(8900, 9500, Math.min(1, Math.abs(elev) / 30))),
        timeOfDayBand: "night",
      };
    }
    const moonKelvin = lerpClamped(7600, 9100, elev / 75);
    return {
      colorTemperatureK: Math.round(moonKelvin),
      timeOfDayBand: "night",
    };
  }

  if (elev <= -6) {
    const nightKelvin = lerpClamped(8500, 9400, Math.min(1, (Math.abs(elev) - 6) / 24));
    return {
      colorTemperatureK: Math.round(nightKelvin),
      timeOfDayBand: "night",
    };
  }
  if (elev <= 0) {
    const twilightKelvin = lerpClamped(7500, 8500, Math.abs(elev) / 6);
    return {
      colorTemperatureK: Math.round(twilightKelvin),
      timeOfDayBand: "twilight",
    };
  }
  if (elev <= 15) {
    const goldenKelvin = lerpClamped(2700, 3800, elev / 15);
    return {
      colorTemperatureK: Math.round(goldenKelvin),
      timeOfDayBand: "golden-hour",
    };
  }
  if (elev < 30) {
    const morningKelvin = lerpClamped(3800, 5500, (elev - 15) / 15);
    return {
      colorTemperatureK: Math.round(morningKelvin),
      timeOfDayBand: "morning-afternoon",
    };
  }
  const middayKelvin = lerpClamped(5500, 6500, (elev - 30) / 60);
  return {
    colorTemperatureK: Math.round(middayKelvin),
    timeOfDayBand: elev >= 42 ? "midday" : "morning-afternoon",
  };
}

/**
 * 위도, 연중 일수, 태양시로부터 태양(또는 달)의 천문 위치와 물리 그림자 지표를 계산한다.
 */
export function computeSolarEphemeris(input: SolarEphemerisInput): SolarEphemerisResult {
  const celestialBody: CelestialBody = input.celestialBody === "moon" ? "moon" : "sun";
  const latitudeDeg = clampFiniteNumber(input.latitudeDeg, -89.9, 89.9, 37.5665);
  const dayOfYear = Math.round(clampFiniteNumber(input.dayOfYear, 1, 365, 172));
  const rawHour = Number.isFinite(input.localSolarHour) ? input.localSolarHour : 12;
  const localSolarHour = ((rawHour % 24) + 24) % 24;
  const objectHeightM = clampFiniteNumber(input.objectHeightM ?? 1.7, 0.05, 500, 1.7);
  const minElevationClampDeg = clampFiniteNumber(input.minElevationClampDeg ?? 4, 1, 45, 4);
  const maxShadowLengthRatio = clampFiniteNumber(input.maxShadowLengthRatio ?? 12, 0.5, 40, 12);

  // Cooper 식 기반 태양 적위 (하지 day 172 ≈ +23.44°, 동지 day 355 ≈ -23.44°)
  const solarDeclinationDeg =
    EARTH_AXIAL_TILT_DEG * Math.sin(((2 * Math.PI) / 365) * (284 + dayOfYear));
  const solarHourAngleDeg = 15 * (localSolarHour - 12);

  let declinationDeg = solarDeclinationDeg;
  let hourAngleDeg = solarHourAngleDeg;

  if (celestialBody === "moon") {
    const lunarPhaseDay = clampFiniteNumber(
      input.lunarPhaseDay ?? SYNODIC_MONTH_DAYS * 0.5,
      0,
      SYNODIC_MONTH_DAYS,
      SYNODIC_MONTH_DAYS * 0.5,
    );
    const phaseAngleDeg = (lunarPhaseDay / SYNODIC_MONTH_DAYS) * 360;
    const phaseAngleRad = degToRad(phaseAngleDeg);
    hourAngleDeg = normalizeSignedAngleDeg(solarHourAngleDeg - phaseAngleDeg);
    const orbitalInclinationOffset =
      LUNAR_ORBITAL_INCLINATION_DEG *
      Math.sin(((2 * Math.PI) / SIDEREAL_MONTH_DAYS) * (dayOfYear + lunarPhaseDay));
    declinationDeg = clampFiniteNumber(
      solarDeclinationDeg * Math.cos(phaseAngleRad) + orbitalInclinationOffset,
      -28.6,
      28.6,
      0,
    );
  }

  const latRad = degToRad(latitudeDeg);
  const decRad = degToRad(declinationDeg);
  const haRad = degToRad(hourAngleDeg);

  // ENU(East, North, Up) 천체 방향 단위 벡터
  const lightEast = -Math.cos(decRad) * Math.sin(haRad);
  const lightNorth =
    Math.sin(decRad) * Math.cos(latRad) - Math.cos(decRad) * Math.sin(latRad) * Math.cos(haRad);
  const lightUp = clampFiniteNumber(
    Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad),
    -1,
    1,
    0,
  );

  const elevationDeg = radToDeg(Math.asin(lightUp));
  const horizNorm = Math.hypot(lightEast, lightNorth);
  const azimuthDeg =
    horizNorm < 1e-7
      ? latitudeDeg >= 0
        ? 180
        : 0
      : normalizeDegrees360(radToDeg(Math.atan2(lightEast, lightNorth)));

  const worldShadowAzimuthDeg = normalizeDegrees360(azimuthDeg + 180);
  const shadowAzRad = degToRad(worldShadowAzimuthDeg);
  const shadowDirectionWorldEnu: Vec3Enu = {
    east: Math.sin(shadowAzRad),
    north: Math.cos(shadowAzRad),
    up: 0,
  };

  const isAboveHorizon = elevationDeg > 0;
  const effectiveElevDeg = clampFiniteNumber(
    Math.max(minElevationClampDeg, elevationDeg),
    minElevationClampDeg,
    89.5,
    minElevationClampDeg,
  );
  const rawRatio = 1 / Math.tan(degToRad(effectiveElevDeg));
  const shadowLengthRatio = clampFiniteNumber(rawRatio, 0.01, maxShadowLengthRatio, 1);
  const shadowLengthM = objectHeightM * shadowLengthRatio;

  const { colorTemperatureK, timeOfDayBand } = estimateNaturalColorTemperatureK(
    elevationDeg,
    celestialBody,
  );

  return {
    celestialBody,
    latitudeDeg,
    dayOfYear,
    localSolarHour,
    declinationDeg,
    hourAngleDeg,
    elevationDeg,
    azimuthDeg,
    worldShadowAzimuthDeg,
    isAboveHorizon,
    timeOfDayBand,
    colorTemperatureK,
    objectHeightM,
    shadowLengthM,
    shadowLengthRatio,
    lightDirectionWorldEnu: {
      east: lightEast,
      north: lightNorth,
      up: lightUp,
    },
    shadowDirectionWorldEnu,
  };
}

/**
 * 3D 월드 광원 방위·고도와 그림자 길이 비율을 카메라 시선(Yaw/Pitch) 기준으로
 * 웹툰 2D 캔버스 기대 그림자 각도·길이·림라이트 방향으로 투영한다.
 *
 * - 카메라 Yaw가 180° 회전(리버스 샷)하면 2D 기대 그림자 각도는 정확히 180° 반전되고
 *   좌/우 림라이트 방향도 자동으로 맞바뀐다.
 */
export function projectWorldLightToCutScreen(
  input: CutLightScreenProjectionInput,
): CutLightScreenProjectionResult {
  const lightAzDeg = normalizeDegrees360(input.lightAzimuthDeg);
  const lightElevDeg = clampFiniteNumber(input.lightElevationDeg, -89, 89.5, 35);
  const worldShadowLengthRatio = clampFiniteNumber(input.worldShadowLengthRatio, 0.02, 40, 1);
  const cameraYawDeg = normalizeDegrees360(input.cameraYawDeg);
  const cameraPitchDeg = clampFiniteNumber(input.cameraPitchDeg ?? -10, -85, 85, -10);

  const lightAzRad = degToRad(lightAzDeg);
  const lightElevRad = degToRad(lightElevDeg);
  const cosElev = Math.cos(lightElevRad);

  // 피사체 -> 광원 단위 벡터 (ENU)
  const lightE = cosElev * Math.sin(lightAzRad);
  const lightN = cosElev * Math.cos(lightAzRad);
  const lightU = Math.sin(lightElevRad);

  // 바닥면 그림자 단위 벡터 (광원의 정확히 반대 수평 방위)
  const shadowAzRad = degToRad(normalizeDegrees360(lightAzDeg + 180));
  const shadowE = Math.sin(shadowAzRad);
  const shadowN = Math.cos(shadowAzRad);

  // 카메라 수평 전방(F_h)과 수평 우측(R) 기저 벡터 (ENU)
  const yawRad = degToRad(cameraYawDeg);
  const forwardE = Math.sin(yawRad);
  const forwardN = Math.cos(yawRad);
  const rightE = Math.cos(yawRad);
  const rightN = -Math.sin(yawRad);

  // 그림자 벡터의 화면 우측(sx) 및 깊이(sDepth) 성분
  const sx = shadowE * rightE + shadowN * rightN;
  const sDepth = shadowE * forwardE + shadowN * forwardN;

  // 카메라 부감각과 눈높이 원근 저하각을 반영한 바닥면 깊이 단축 계수
  const effectiveDepressionDeg = clampFiniteNumber(-cameraPitchDeg + 18, 8, 88, 28);
  const depthForeshorteningFactor = Math.sin(degToRad(effectiveDepressionDeg));

  // 2D 캔버스 좌표계: +x 우측, +y 하단 (멀어지는 그림자는 화면 위쪽 -y, 다가오는 그림자는 +y)
  const sy = -sDepth * depthForeshorteningFactor;
  const projectedNorm = Math.hypot(sx, sy);

  const expectedScreenShadowDir: Vec2 =
    projectedNorm < 1e-7
      ? { x: 0, y: 1 }
      : { x: sx / projectedNorm, y: sy / projectedNorm };

  const expectedScreenShadowAngleDeg = normalizeDegrees360(
    radToDeg(Math.atan2(expectedScreenShadowDir.y, expectedScreenShadowDir.x)),
  );
  const expectedScreenShadowLengthRatio = clampFiniteNumber(
    worldShadowLengthRatio * Math.max(0.14, projectedNorm),
    0.02,
    40,
    worldShadowLengthRatio,
  );

  // 광원의 카메라 기준 성분으로 림라이트 방향 결정
  const lightRightComponent = lightE * rightE + lightN * rightN;
  const lightForwardComponent = lightE * forwardE + lightN * forwardN;
  const lightUpComponent = lightU;

  let expectedRimSide: RimLightSide;
  if (lightElevDeg >= 68 && Math.abs(lightRightComponent) < 0.35) {
    expectedRimSide = "top";
  } else if (lightForwardComponent > 0.65 && Math.abs(lightRightComponent) < 0.45) {
    expectedRimSide = "back";
  } else if (lightRightComponent >= 0) {
    expectedRimSide = "right";
  } else {
    expectedRimSide = "left";
  }

  return {
    expectedScreenShadowAngleDeg,
    expectedScreenShadowDir,
    expectedScreenShadowLengthRatio,
    expectedRimSide,
    lightRightComponent,
    lightForwardComponent,
    lightUpComponent,
    depthForeshorteningFactor,
  };
}
