import { describe, expect, it } from "vitest";
import {
  SHADOW_GUIDE_UNIFORM_BYTE_LENGTH,
  angularDistanceDeg,
  auditSceneLightingConsistency,
  buildShadowGuideOverlayWgsl,
  canonicalizeLightingJson,
  computeLightingManifestSha256Hex,
  computeSolarEphemeris,
  correctCutShadowDirections,
  escapeShadowXml,
  packShadowGuideUniformBuffer,
  projectWorldLightToCutScreen,
  renderMultiCutShadowAuditSvg,
  sha256LightingUtf8Hex,
  summarizeMultiCutShadowAuditKo,
  validateShadowGuideOverlayWgsl,
  type CutLightingInput,
  type SceneLightingBible,
} from "./index";

const SEOUL_LAT = 37.5665;
const SUMMER_DAY = 172;
const WINTER_DAY = 355;
const EQUINOX_DAY = 80;

describe("Wave 141 — 천문 태양·달 위치 계산기 및 물리 그림자 수학", () => {
  it("서울 하지 정오 태양 고도각은 약 75.9°이고 방위각은 정남(180°), 색온도는 정오 대역(5500~6500K)이다", () => {
    const res = computeSolarEphemeris({ latitudeDeg: SEOUL_LAT, dayOfYear: SUMMER_DAY, localSolarHour: 12, objectHeightM: 1.7 });
    expect(res.elevationDeg).toBeGreaterThan(75.5);
    expect(res.elevationDeg).toBeLessThan(76.3);
    expect(angularDistanceDeg(res.azimuthDeg, 180)).toBeLessThan(0.5);
    expect(angularDistanceDeg(res.worldShadowAzimuthDeg, 0)).toBeLessThan(0.5);
    expect(res.colorTemperatureK).toBeGreaterThanOrEqual(5500);
    expect(res.colorTemperatureK).toBeLessThanOrEqual(6500);
    expect(res.shadowLengthRatio).toBeGreaterThan(0.2);
    expect(res.shadowLengthRatio).toBeLessThan(0.32);
    expect(res.isAboveHorizon).toBe(true);
  });

  it("서울 동지 정오 태양 고도각은 약 29.0°이고 하지 정오보다 그림자가 훨씬 길다", () => {
    const winter = computeSolarEphemeris({ latitudeDeg: SEOUL_LAT, dayOfYear: WINTER_DAY, localSolarHour: 12, objectHeightM: 1.7 });
    const summer = computeSolarEphemeris({ latitudeDeg: SEOUL_LAT, dayOfYear: SUMMER_DAY, localSolarHour: 12, objectHeightM: 1.7 });
    expect(winter.elevationDeg).toBeGreaterThan(28.5);
    expect(winter.elevationDeg).toBeLessThan(29.5);
    expect(angularDistanceDeg(winter.azimuthDeg, 180)).toBeLessThan(0.5);
    expect(winter.shadowLengthRatio).toBeGreaterThan(1.7);
    expect(winter.shadowLengthRatio).toBeLessThan(1.9);
    expect(winter.shadowLengthM).toBeGreaterThan(summer.shadowLengthM * 6);
  });

  it("서울 춘분 정오 태양 고도각은 (90° - 위도) ≈ 52.4°에 근접한다", () => {
    const res = computeSolarEphemeris({ latitudeDeg: SEOUL_LAT, dayOfYear: EQUINOX_DAY, localSolarHour: 12 });
    expect(res.elevationDeg).toBeGreaterThan(51.5);
    expect(res.elevationDeg).toBeLessThan(53.0);
  });

  it("오전 9시 태양은 동쪽 방위(60°~150°)에 위치해 서쪽 방위(240°~330°)로 그림자를 투사한다", () => {
    const morning = computeSolarEphemeris({ latitudeDeg: SEOUL_LAT, dayOfYear: EQUINOX_DAY, localSolarHour: 9 });
    expect(morning.azimuthDeg).toBeGreaterThan(60);
    expect(morning.azimuthDeg).toBeLessThan(150);
    expect(morning.worldShadowAzimuthDeg).toBeGreaterThan(240);
    expect(morning.worldShadowAzimuthDeg).toBeLessThan(330);
    expect(morning.shadowDirectionWorldEnu.east).toBeLessThan(0);
  });

  it("오후 3시 태양은 서쪽 방위(210°~300°)에 위치해 동쪽 방위(30°~120°)로 그림자를 투사한다", () => {
    const afternoon = computeSolarEphemeris({ latitudeDeg: SEOUL_LAT, dayOfYear: EQUINOX_DAY, localSolarHour: 15 });
    expect(afternoon.azimuthDeg).toBeGreaterThan(210);
    expect(afternoon.azimuthDeg).toBeLessThan(300);
    expect(afternoon.worldShadowAzimuthDeg).toBeGreaterThan(30);
    expect(afternoon.worldShadowAzimuthDeg).toBeLessThan(120);
    expect(afternoon.shadowDirectionWorldEnu.east).toBeGreaterThan(0);
  });

  it("일몰 직전 저고도 태양은 골든아워 색온도(2700~3800K)와 긴 그림자를 산출하며 저고도 클램프로 폭주를 막는다", () => {
    const sunset = computeSolarEphemeris({
      latitudeDeg: SEOUL_LAT,
      dayOfYear: EQUINOX_DAY,
      localSolarHour: 17.6,
      objectHeightM: 1.8,
      minElevationClampDeg: 4,
      maxShadowLengthRatio: 12,
    });
    expect(sunset.elevationDeg).toBeGreaterThan(0);
    expect(sunset.elevationDeg).toBeLessThan(15);
    expect(sunset.timeOfDayBand).toBe("golden-hour");
    expect(sunset.colorTemperatureK).toBeGreaterThanOrEqual(2700);
    expect(sunset.colorTemperatureK).toBeLessThanOrEqual(3800);
    expect(Number.isFinite(sunset.shadowLengthM)).toBe(true);
    expect(sunset.shadowLengthRatio).toBeLessThanOrEqual(12);
    expect(sunset.shadowLengthRatio).toBeGreaterThan(3);
  });

  it("박명 및 야간 태양 고도(<=0°)에서는 차가운 색온도(7500~9500K)를 반환한다", () => {
    const twilight = computeSolarEphemeris({ latitudeDeg: SEOUL_LAT, dayOfYear: EQUINOX_DAY, localSolarHour: 18.3 });
    const night = computeSolarEphemeris({ latitudeDeg: SEOUL_LAT, dayOfYear: EQUINOX_DAY, localSolarHour: 23.0 });
    expect(twilight.elevationDeg).toBeLessThanOrEqual(0);
    expect(twilight.colorTemperatureK).toBeGreaterThanOrEqual(7500);
    expect(twilight.colorTemperatureK).toBeLessThanOrEqual(9500);
    expect(night.colorTemperatureK).toBeGreaterThanOrEqual(7500);
    expect(night.colorTemperatureK).toBeLessThanOrEqual(9500);
  });

  it("남반구(시드니 -33.87°) 정오 태양은 북쪽(0°)에 있어 그림자가 남쪽(180°)으로 떨어진다", () => {
    const sydney = computeSolarEphemeris({ latitudeDeg: -33.8688, dayOfYear: EQUINOX_DAY, localSolarHour: 12 });
    expect(angularDistanceDeg(sydney.azimuthDeg, 0)).toBeLessThan(1);
    expect(angularDistanceDeg(sydney.worldShadowAzimuthDeg, 180)).toBeLessThan(1);
  });

  it("야외 보름달(celestialBody='moon') 자정 계산은 지평선 위로 떠 있고 달빛 색온도(7500~9500K)를 반환한다", () => {
    const moon = computeSolarEphemeris({
      latitudeDeg: SEOUL_LAT,
      dayOfYear: WINTER_DAY,
      localSolarHour: 0,
      celestialBody: "moon",
      lunarPhaseDay: 14.765,
    });
    expect(moon.celestialBody).toBe("moon");
    expect(moon.isAboveHorizon).toBe(true);
    expect(moon.elevationDeg).toBeGreaterThan(55);
    expect(moon.colorTemperatureK).toBeGreaterThanOrEqual(7500);
    expect(moon.colorTemperatureK).toBeLessThanOrEqual(9500);
  });

  it("피사체 키와 고도각으로부터 물리 그림자 길이 공식 h / tan(elev)이 정확히 성립한다", () => {
    const res = computeSolarEphemeris({ latitudeDeg: SEOUL_LAT, dayOfYear: EQUINOX_DAY, localSolarHour: 10.5, objectHeightM: 2.0 });
    const expectedRatio = 1 / Math.tan((res.elevationDeg * Math.PI) / 180);
    expect(res.shadowLengthRatio).toBeCloseTo(expectedRatio, 4);
    expect(res.shadowLengthM).toBeCloseTo(2.0 * expectedRatio, 4);
  });
});

describe("Wave 141 — 3D→2D 카메라 투영 및 리버스 샷 반전 정합성", () => {
  it("북향 카메라(Yaw 0°) + 동쪽 광원(Az 90°)은 화면 좌측(180°) 그림자와 우측 림라이트를 투영한다", () => {
    const proj = projectWorldLightToCutScreen({
      lightAzimuthDeg: 90, lightElevationDeg: 35, worldShadowLengthRatio: 1.4, cameraYawDeg: 0, cameraPitchDeg: -10,
    });
    expect(angularDistanceDeg(proj.expectedScreenShadowAngleDeg, 180)).toBeLessThan(0.1);
    expect(proj.expectedRimSide).toBe("right");
    expect(proj.expectedScreenShadowLengthRatio).toBeCloseTo(1.4, 3);
  });

  it("카메라를 180° 리버스 샷(Yaw 180°)으로 회전하면 2D 기대 그림자 각도가 정확히 180° 반전되고 림라이트도 좌측으로 바뀐다", () => {
    const shotA = projectWorldLightToCutScreen({ lightAzimuthDeg: 90, lightElevationDeg: 35, worldShadowLengthRatio: 1.4, cameraYawDeg: 0, cameraPitchDeg: -10 });
    const shotB = projectWorldLightToCutScreen({ lightAzimuthDeg: 90, lightElevationDeg: 35, worldShadowLengthRatio: 1.4, cameraYawDeg: 180, cameraPitchDeg: -10 });
    expect(angularDistanceDeg(shotB.expectedScreenShadowAngleDeg, 0)).toBeLessThan(0.1);
    expect(angularDistanceDeg(shotA.expectedScreenShadowAngleDeg, shotB.expectedScreenShadowAngleDeg)).toBeCloseTo(180, 4);
    expect(shotB.expectedRimSide).toBe("left");
  });

  it("임의 사선 광원 방위(132°)에서도 180° 리버스 샷은 화면 2D 그림자 각도를 정확히 180° 대칭 반전한다", () => {
    const shot1 = projectWorldLightToCutScreen({ lightAzimuthDeg: 132, lightElevationDeg: 28, worldShadowLengthRatio: 1.88, cameraYawDeg: 37, cameraPitchDeg: -14 });
    const shot2 = projectWorldLightToCutScreen({ lightAzimuthDeg: 132, lightElevationDeg: 28, worldShadowLengthRatio: 1.88, cameraYawDeg: 217, cameraPitchDeg: -14 });
    expect(angularDistanceDeg(shot1.expectedScreenShadowAngleDeg, shot2.expectedScreenShadowAngleDeg)).toBeCloseTo(180, 3);
    expect(shot1.expectedScreenShadowLengthRatio).toBeCloseTo(shot2.expectedScreenShadowLengthRatio, 4);
  });

  it("부감 앵글(Pitch -55°)은 아이레벨(Pitch 0°)보다 깊이 축 그림자 원근 길이를 더 길게 투영한다", () => {
    const eyeLevel = projectWorldLightToCutScreen({ lightAzimuthDeg: 180, lightElevationDeg: 30, worldShadowLengthRatio: 1.73, cameraYawDeg: 0, cameraPitchDeg: 0 });
    const birdsEye = projectWorldLightToCutScreen({ lightAzimuthDeg: 180, lightElevationDeg: 30, worldShadowLengthRatio: 1.73, cameraYawDeg: 0, cameraPitchDeg: -55 });
    expect(birdsEye.depthForeshorteningFactor).toBeGreaterThan(eyeLevel.depthForeshorteningFactor);
    expect(birdsEye.expectedScreenShadowLengthRatio).toBeGreaterThan(eyeLevel.expectedScreenShadowLengthRatio);
  });

  it("천정 고고도 태양(>=68°)은 상단(top) 림라이트, 카메라 정면 뒤쪽 태양은 역광(back) 림라이트를 산출한다", () => {
    const overhead = projectWorldLightToCutScreen({ lightAzimuthDeg: 180, lightElevationDeg: 76, worldShadowLengthRatio: 0.25, cameraYawDeg: 0 });
    const backlit = projectWorldLightToCutScreen({ lightAzimuthDeg: 0, lightElevationDeg: 22, worldShadowLengthRatio: 2.4, cameraYawDeg: 0 });
    expect(overhead.expectedRimSide).toBe("top");
    expect(backlit.expectedRimSide).toBe("back");
  });

  it("NaN이나 Infinity 같은 비유한 입력이 들어와도 유한 수치로 안전하게 복구한다", () => {
    const eph = computeSolarEphemeris({ latitudeDeg: Number.NaN, dayOfYear: Number.POSITIVE_INFINITY, localSolarHour: Number.NaN, objectHeightM: -5 });
    const proj = projectWorldLightToCutScreen({
      lightAzimuthDeg: Number.NaN, lightElevationDeg: Number.NEGATIVE_INFINITY, worldShadowLengthRatio: Number.NaN, cameraYawDeg: Number.POSITIVE_INFINITY, cameraPitchDeg: Number.NaN,
    });
    expect(Number.isFinite(eph.elevationDeg)).toBe(true);
    expect(Number.isFinite(eph.shadowLengthM)).toBe(true);
    expect(Number.isFinite(proj.expectedScreenShadowAngleDeg)).toBe(true);
    expect(Number.isFinite(proj.expectedScreenShadowLengthRatio)).toBe(true);
  });
});

describe("Wave 141 — 연속 컷 다중 광원 일관성 감사 및 자동 교정 솔버", () => {
  const morningScene: SceneLightingBible = {
    sceneId: "EP14-SC02",
    sceneTitle: "한강 옥상 오전 대치 씬",
    latitudeDeg: SEOUL_LAT,
    dayOfYear: EQUINOX_DAY,
    defaultLocalSolarHour: 9,
    defaultLightSourceType: "outdoor-solar",
  };

  function makeExpectedCut(
    scene: SceneLightingBible,
    cutId: string,
    cutNumber: number,
    cameraYawDeg: number,
    overrides: Partial<CutLightingInput> = {},
  ): CutLightingInput {
    const hour = overrides.localSolarHour ?? scene.defaultLocalSolarHour;
    const eph = computeSolarEphemeris({
      latitudeDeg: scene.latitudeDeg,
      dayOfYear: scene.dayOfYear,
      localSolarHour: hour,
      celestialBody: overrides.lightSourceType === "outdoor-lunar" ? "moon" : "sun",
    });
    const proj = projectWorldLightToCutScreen({
      lightAzimuthDeg: eph.azimuthDeg,
      lightElevationDeg: eph.elevationDeg,
      worldShadowLengthRatio: eph.shadowLengthRatio,
      cameraYawDeg,
      cameraPitchDeg: overrides.cameraPitchDeg ?? -10,
    });
    return {
      cutId,
      cutNumber,
      cameraYawDeg,
      drawnShadowAngleDeg: proj.expectedScreenShadowAngleDeg,
      drawnShadowLengthRatio: proj.expectedScreenShadowLengthRatio,
      drawnRimSide: proj.expectedRimSide,
      ...overrides,
    };
  }

  it("리버스 샷을 정확히 반영한 연속 야외 컷 시퀀스는 위반 0건과 일관성 100점을 통과한다", () => {
    const cuts: readonly CutLightingInput[] = [
      makeExpectedCut(morningScene, "c1", 1, 0, { cutLabel: "주인공 투샷" }),
      makeExpectedCut(morningScene, "c2", 2, 180, { cutLabel: "상대방 리버스 샷" }),
      makeExpectedCut(morningScene, "c3", 3, 45, { cutLabel: "측면 클로즈업" }),
    ];
    const report = auditSceneLightingConsistency(morningScene, cuts);
    expect(report.passed).toBe(true);
    expect(report.violations).toHaveLength(0);
    expect(report.blockerCount).toBe(0);
    expect(report.warningCount).toBe(0);
    expect(report.continuityScore).toBe(100);
  });

  it("그림자 각도가 허용 오차(25°)를 살짝 넘은 42° 편차는 warning 등급 shadow-direction-flip을 탐지한다", () => {
    const base = makeExpectedCut(morningScene, "c1", 1, 0);
    const report = auditSceneLightingConsistency(morningScene, [{ ...base, drawnShadowAngleDeg: (base.drawnShadowAngleDeg + 42) % 360 }]);
    const dirViol = report.violations.find((v) => v.kind === "shadow-direction-flip");
    expect(dirViol?.severity).toBe("warning");
    expect(report.passed).toBe(false);
  });

  it("180° 리버스 샷에서 그림자를 반전하지 않아 정반대(>120°)로 그려진 컷은 blocker 등급 shadow-direction-flip을 탐지한다", () => {
    const cut1 = makeExpectedCut(morningScene, "c1", 1, 0);
    const cut2Broken: CutLightingInput = { ...makeExpectedCut(morningScene, "c2", 2, 180), drawnShadowAngleDeg: cut1.drawnShadowAngleDeg };
    const report = auditSceneLightingConsistency(morningScene, [cut1, cut2Broken]);
    const flip = report.violations.find((v) => v.cutId === "c2" && v.kind === "shadow-direction-flip");
    expect(flip?.severity).toBe("blocker");
    expect(flip?.deltaMagnitude).toBeGreaterThan(150);
  });

  it("하지 정오 컷에 노을처럼 3.8배 길이 그림자를 그리면 shadow-length-anachronism을 탐지한다", () => {
    const noonScene: SceneLightingBible = { ...morningScene, dayOfYear: SUMMER_DAY, defaultLocalSolarHour: 12 };
    const cut = makeExpectedCut(noonScene, "c1", 1, 90, { drawnShadowLengthRatio: 3.8 });
    const report = auditSceneLightingConsistency(noonScene, [cut]);
    expect(report.violations.find((v) => v.kind === "shadow-length-anachronism")?.severity).toBe("blocker");
  });

  it("골든아워 저고도 컷에 정오처럼 0.15배 짧은 그림자를 그리면 shadow-length-anachronism을 탐지한다", () => {
    const sunsetScene: SceneLightingBible = { ...morningScene, defaultLocalSolarHour: 17.4 };
    const report = auditSceneLightingConsistency(sunsetScene, [makeExpectedCut(sunsetScene, "c1", 1, 0, { drawnShadowLengthRatio: 0.15 })]);
    expect(report.violations.some((v) => v.kind === "shadow-length-anachronism")).toBe(true);
  });

  it("키라이트가 화면 우측인데 림라이트를 좌측에 찍으면 blocker 등급 rim-light-side-conflict를 탐지한다", () => {
    const report = auditSceneLightingConsistency(morningScene, [makeExpectedCut(morningScene, "c1", 1, 0, { drawnRimSide: "left" })]);
    expect(report.violations.find((v) => v.kind === "rim-light-side-conflict")?.severity).toBe("blocker");
  });

  it("isTimeJumpCut 없이 연속 컷 사이 태양시가 12:00→17:30으로 급변하면 unexplained-time-jump를 탐지한다", () => {
    const noonScene: SceneLightingBible = { ...morningScene, defaultLocalSolarHour: 12 };
    const c1 = makeExpectedCut(noonScene, "c1", 1, 0, { localSolarHour: 12 });
    const c2 = makeExpectedCut(noonScene, "c2", 2, 0, { localSolarHour: 17.5, isTimeJumpCut: false });
    const report = auditSceneLightingConsistency(noonScene, [c1, c2]);
    expect(report.violations.find((v) => v.cutId === "c2" && v.kind === "unexplained-time-jump")?.severity).toBe("blocker");
  });

  it("isTimeJumpCut=true로 시간 경과를 명시한 컷은 unexplained-time-jump를 발생시키지 않는다", () => {
    const noonScene: SceneLightingBible = { ...morningScene, defaultLocalSolarHour: 12 };
    const c1 = makeExpectedCut(noonScene, "c1", 1, 0, { localSolarHour: 12 });
    const c2 = makeExpectedCut(noonScene, "c2", 2, 0, { localSolarHour: 17.5, isTimeJumpCut: true });
    const report = auditSceneLightingConsistency(noonScene, [c1, c2]);
    expect(report.violations.filter((v) => v.kind === "unexplained-time-jump")).toHaveLength(0);
    expect(report.passed).toBe(true);
  });

  it("야외 달빛 씬(outdoor-lunar)은 달 방위각·고도각 및 야간 색온도 기준으로 그림자 일관성을 감사한다", () => {
    const lunarScene: SceneLightingBible = {
      sceneId: "EP14-NIGHT", sceneTitle: "보름달 골목 추격전", latitudeDeg: SEOUL_LAT, dayOfYear: WINTER_DAY,
      defaultLocalSolarHour: 22, defaultLightSourceType: "outdoor-lunar", lunarPhaseDay: 14.765,
    };
    const okCut = makeExpectedCut(lunarScene, "n1", 1, 0, { lightSourceType: "outdoor-lunar" });
    const flippedCut: CutLightingInput = { ...makeExpectedCut(lunarScene, "n2", 2, 180, { lightSourceType: "outdoor-lunar" }), drawnShadowAngleDeg: okCut.drawnShadowAngleDeg };
    const report = auditSceneLightingConsistency(lunarScene, [okCut, flippedCut]);
    expect(report.cutEvaluations[0]?.colorTemperatureK).toBeGreaterThanOrEqual(7500);
    expect(report.violations.some((v) => v.cutId === "n2" && v.kind === "shadow-direction-flip")).toBe(true);
  });

  it("실내 창문광(indoor-window)은 창문 벽면 방위각 기준으로 컷별 카메라 회전을 투영하고 역전을 탐지한다", () => {
    const classroomScene: SceneLightingBible = {
      sceneId: "EP05-CLASSROOM", sceneTitle: "오후 교실 창가 대화", latitudeDeg: SEOUL_LAT, dayOfYear: EQUINOX_DAY,
      defaultLocalSolarHour: 15, defaultLightSourceType: "indoor-window", defaultWindowFacingAzimuthDeg: 270, defaultWindowElevationDeg: 34,
    };
    const projNorth = projectWorldLightToCutScreen({
      lightAzimuthDeg: 270, lightElevationDeg: 34, worldShadowLengthRatio: 1 / Math.tan((34 * Math.PI) / 180), cameraYawDeg: 0, cameraPitchDeg: -10,
    });
    const c1: CutLightingInput = {
      cutId: "w1", cutNumber: 1, cameraYawDeg: 0,
      drawnShadowAngleDeg: projNorth.expectedScreenShadowAngleDeg, drawnShadowLengthRatio: projNorth.expectedScreenShadowLengthRatio, drawnRimSide: projNorth.expectedRimSide,
    };
    const c2Wrong: CutLightingInput = {
      cutId: "w2", cutNumber: 2, cameraYawDeg: 180,
      drawnShadowAngleDeg: projNorth.expectedScreenShadowAngleDeg, drawnShadowLengthRatio: projNorth.expectedScreenShadowLengthRatio, drawnRimSide: "left",
    };
    const report = auditSceneLightingConsistency(classroomScene, [c1, c2Wrong]);
    expect(report.cutEvaluations[0]?.lightSourceType).toBe("indoor-window");
    expect(report.violations.some((v) => v.cutId === "w2" && v.kind === "shadow-direction-flip")).toBe(true);
    expect(report.violations.some((v) => v.cutId === "w2" && v.kind === "rim-light-side-conflict")).toBe(true);
  });

  it("실내 포인트 조명(indoor-practical)은 천장등·네온 방위·고도·색온도로 감사하고 교정할 수 있다", () => {
    const neonScene: SceneLightingBible = {
      sceneId: "EP09-BAR", sceneTitle: "네온 골목 카페 내부", latitudeDeg: SEOUL_LAT, dayOfYear: EQUINOX_DAY,
      defaultLocalSolarHour: 21, defaultLightSourceType: "indoor-practical",
      defaultPracticalLightAzimuthDeg: 90, defaultPracticalLightElevationDeg: 45, defaultPracticalColorTemperatureK: 3000,
    };
    const badCut: CutLightingInput = { cutId: "p1", cutNumber: 1, cameraYawDeg: 0, drawnShadowAngleDeg: 0, drawnShadowLengthRatio: 4.5, drawnRimSide: "left" };
    const report = auditSceneLightingConsistency(neonScene, [badCut]);
    expect(report.cutEvaluations[0]?.colorTemperatureK).toBe(3000);
    expect(report.violations.length).toBeGreaterThanOrEqual(3);
    const fixed = correctCutShadowDirections(neonScene, [badCut]);
    expect(fixed.correctedReport.violations).toHaveLength(0);
    expect(fixed.correctedReport.continuityScore).toBe(100);
  });

  it("자동 교정 솔버(correctCutShadowDirections)는 4종 위반이 동시에 발생한 씬을 위반 0건·연속성 100점으로 복구한다", () => {
    const c1 = makeExpectedCut(morningScene, "c1", 1, 0, { localSolarHour: 9 });
    // 오후 17.4시(서쪽 저고도) + 남향 카메라(180°)의 기대 그림자는 좌측(~180°)·긴 길이·우측 림이므로
    // 정반대 각도(0°)·짧은 길이(0.25x)·좌측 림·미표기 시간 급변으로 4종 위반 동시 유발
    const c2AllBroken: CutLightingInput = {
      cutId: "c2",
      cutNumber: 2,
      cutLabel: "문제 리버스 샷",
      localSolarHour: 17.4,
      isTimeJumpCut: false,
      cameraYawDeg: 180,
      drawnShadowAngleDeg: 0,
      drawnShadowLengthRatio: 0.25,
      drawnRimSide: "left",
    };

    const result = correctCutShadowDirections(morningScene, [c1, c2AllBroken]);
    const kinds = new Set(result.originalReport.violations.map((v) => v.kind));
    expect(kinds.has("shadow-direction-flip")).toBe(true);
    expect(kinds.has("shadow-length-anachronism")).toBe(true);
    expect(kinds.has("rim-light-side-conflict")).toBe(true);
    expect(kinds.has("unexplained-time-jump")).toBe(true);

    expect(result.correctedReport.passed).toBe(true);
    expect(result.correctedReport.violations).toHaveLength(0);
    expect(result.correctedReport.continuityScore).toBe(100);
    expect(result.resolvedViolationCount).toBe(result.originalReport.violations.length);
    expect(result.patches[1]?.changedFields).toContain("localSolarHour");
    expect(result.patches[1]?.changedFields).toContain("drawnShadowAngleDeg");
  });

  it("자동 교정 솔버는 의도된 시간 경과 컷(isTimeJumpCut=true)의 새 시간대를 보존하면서 그림자만 교정한다", () => {
    const c1 = makeExpectedCut(morningScene, "c1", 1, 0, { localSolarHour: 9 });
    const c2JumpBadShadow: CutLightingInput = {
      cutId: "c2", cutNumber: 2, localSolarHour: 16.5, isTimeJumpCut: true, cameraYawDeg: 0,
      drawnShadowAngleDeg: 180, drawnShadowLengthRatio: 0.2, drawnRimSide: "right",
    };
    const result = correctCutShadowDirections(morningScene, [c1, c2JumpBadShadow]);
    expect(result.correctedCuts[1]?.localSolarHour).toBeCloseTo(16.5, 2);
    expect(result.correctedReport.violations).toHaveLength(0);
    expect(result.correctedReport.continuityScore).toBe(100);
  });

  it("순수 ES2017 SHA-256 구현이 FIPS 180-4 표준 테스트 벡터 및 키 순서 무관 결정론을 만족한다", () => {
    expect(sha256LightingUtf8Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256LightingUtf8Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const h1 = computeLightingManifestSha256Hex({ b: 2, a: { y: 1.23456, x: "서울" } });
    const h2 = computeLightingManifestSha256Hex({ a: { x: "서울", y: 1.23456 }, b: 2 });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/u);
    expect(canonicalizeLightingJson({ z: 1, a: 2 })).toBe('{"a":2,"z":1}');
  });

  it("동일 씬 재감사 시 lightingManifestSha256Hex는 불변이며 컷 각도가 바뀌면 해시가 달라진다", () => {
    const c1 = makeExpectedCut(morningScene, "c1", 1, 0);
    const r1 = auditSceneLightingConsistency(morningScene, [c1]);
    const r2 = auditSceneLightingConsistency(morningScene, [c1]);
    const r3 = auditSceneLightingConsistency(morningScene, [{ ...c1, drawnShadowAngleDeg: (c1.drawnShadowAngleDeg + 2) % 360 }]);
    expect(r1.lightingManifestSha256Hex).toBe(r2.lightingManifestSha256Hex);
    expect(r1.lightingManifestSha256Hex).not.toBe(r3.lightingManifestSha256Hex);
  });
});

describe("Wave 141 — WebGPU WGSL 조광 가이드 오버레이 생성기 및 검증기", () => {
  it("기본 WGSL 오버레이는 16B 정렬(64B)·바인딩·괄호·GLSL 금지어 검증을 0에러로 통과한다", () => {
    const bundle = buildShadowGuideOverlayWgsl();
    const validation = validateShadowGuideOverlayWgsl(bundle.wgslSource);
    expect(bundle.uniformByteLength).toBe(SHADOW_GUIDE_UNIFORM_BYTE_LENGTH);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(validation.uniformStructBytes).toBe(64);
    expect(validation.uniformStructBytes % 16).toBe(0);
    expect(validation.bindingCount).toBe(2);
    expect(validation.entryPoint).toBe("render_shadow_guide_overlay");
    expect(validation.workgroupSize).toEqual([8, 8, 1]);
  });

  it("커스텀 워크그룹(16x16)과 옵션 토글 조합에서도 유효한 WGSL을 생성한다", () => {
    const bundle = buildShadowGuideOverlayWgsl({ workgroupSizeX: 16, workgroupSizeY: 16, includeRimBand: false, includeDeviationHeatmap: false });
    const validation = validateShadowGuideOverlayWgsl(bundle.wgslSource);
    expect(validation.valid).toBe(true);
    expect(validation.workgroupSize).toEqual([16, 16, 1]);
  });

  it("packShadowGuideUniformBuffer는 64바이트(16개 f32)의 유한 유니폼 버퍼를 패킹한다", () => {
    const report = auditSceneLightingConsistency(
      { sceneId: "WGSL-PACK", sceneTitle: "유니폼 패킹 테스트", latitudeDeg: SEOUL_LAT, dayOfYear: SUMMER_DAY, defaultLocalSolarHour: 10 },
      [{ cutId: "u1", cutNumber: 1, cameraYawDeg: 0, drawnShadowAngleDeg: 180, drawnShadowLengthRatio: 1.0, drawnRimSide: "right" }],
    );
    const ev = report.cutEvaluations[0];
    expect(ev).toBeDefined();
    if (!ev) return;
    const buf = packShadowGuideUniformBuffer(ev, 1600, 900, 25, 0.6);
    expect(buf.byteLength).toBe(64);
    expect(buf.length).toBe(16);
    for (let i = 0; i < buf.length; i += 1) expect(Number.isFinite(buf[i])).toBe(true);
    expect(buf[0]).toBe(1600);
    expect(buf[1]).toBe(900);
  });

  it("닫히지 않은 중괄호로 손상된 WGSL은 검증에 실패한다", () => {
    const validation = validateShadowGuideOverlayWgsl(buildShadowGuideOverlayWgsl().wgslSource.slice(0, -10));
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.startsWith("delimiters-balanced"))).toBe(true);
  });

  it("GLSL 금지어(gl_FragColor, sampler2D, texture2D)가 섞인 WGSL은 검증에 실패한다", () => {
    const validation = validateShadowGuideOverlayWgsl(`${buildShadowGuideOverlayWgsl().wgslSource}\n// gl_FragColor sampler2D texture2D\n`);
    expect(validation.valid).toBe(false);
    expect(validation.forbiddenGlslHits).toContain("gl_FragColor");
    expect(validation.forbiddenGlslHits).toContain("sampler2D");
    expect(validation.forbiddenGlslHits).toContain("texture2D");
  });

  it("16바이트 정렬이 깨진 유니폼 구조체와 중복 바인딩은 검증에 실패한다", () => {
    const misaligned = buildShadowGuideOverlayWgsl()
      .wgslSource.replace("solar_meta_and_kelvin: vec4<f32>,", "solar_meta_and_kelvin: f32,")
      .replace("@binding(1)", "@binding(0)");
    const validation = validateShadowGuideOverlayWgsl(misaligned);
    expect(validation.valid).toBe(false);
    expect(validation.uniformStructBytes).toBe(52);
    expect(validation.errors.some((e) => e.startsWith("uniform-16b-alignment"))).toBe(true);
    expect(validation.errors.some((e) => e.startsWith("bindings-unique"))).toBe(true);
  });

  it("WGSL 예약어를 변수명으로 사용한 셰이더는 예약어 충돌 검증에 실패한다", () => {
    const validation = validateShadowGuideOverlayWgsl(buildShadowGuideOverlayWgsl().wgslSource.replace("let tint =", "let abstract ="));
    expect(validation.valid).toBe(false);
    expect(validation.reservedKeywordHits).toContain("abstract");
  });
});

describe("Wave 141 — 순수 OKLCH 나침반 SVG 렌더러·XSS 방어 및 한국어 QA 브리프", () => {
  it("renderMultiCutShadowAuditSvg는 순수 oklch(...) 색상만 사용하고 원시 hex/rgb/hsl 및 NaN이 0건이다", () => {
    const report = auditSceneLightingConsistency(
      { sceneId: "SVG-01", sceneTitle: "석양 골목 추격 씬", latitudeDeg: SEOUL_LAT, dayOfYear: EQUINOX_DAY, defaultLocalSolarHour: 17 },
      [
        { cutId: "s1", cutNumber: 1, cutLabel: "골목 진입", cameraYawDeg: 0, drawnShadowAngleDeg: 10, drawnShadowLengthRatio: 2.5, drawnRimSide: "left" },
        { cutId: "s2", cutNumber: 2, cutLabel: "리버스 추격", cameraYawDeg: 180, drawnShadowAngleDeg: 10, drawnShadowLengthRatio: 0.4, drawnRimSide: "left" },
      ],
    );
    const svg = renderMultiCutShadowAuditSvg(report);
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("oklch(");
    expect(svg).toContain("천문 태양·달 궤적 나침반");
    expect(svg).toContain("컷별 기대 그림자 vs 작화 그림자 비교");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(svg).not.toMatch(/\brgba?\s*\(/iu);
    expect(svg).not.toMatch(/\bhsla?\s*\(/iu);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });

  it("씬 제목과 컷 라벨의 XML/XSS 페이로드를 안전하게 이스케이프한다", () => {
    const xssPayload = `<script>alert("xss")</script> & 'quote'`;
    const report = auditSceneLightingConsistency(
      { sceneId: `SC<1>&"2"`, sceneTitle: xssPayload, latitudeDeg: SEOUL_LAT, dayOfYear: SUMMER_DAY, defaultLocalSolarHour: 11 },
      [{ cutId: "x1", cutNumber: 1, cutLabel: `<img src=x onerror="bad()">`, cameraYawDeg: 0, drawnShadowAngleDeg: 180, drawnShadowLengthRatio: 0.4, drawnRimSide: "right" }],
    );
    const svg = renderMultiCutShadowAuditSvg(report);
    expect(escapeShadowXml(xssPayload)).toBe("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &apos;quote&apos;");
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<img ");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&lt;img ");
  });

  it("summarizeMultiCutShadowAuditKo는 번역투 없는 한국어 조명·채색 QA 브리프와 자동 교정 결과를 출력한다", () => {
    const correction = correctCutShadowDirections(
      { sceneId: "QA-KO-01", sceneTitle: "도심 옥상 오후 대치", latitudeDeg: SEOUL_LAT, dayOfYear: EQUINOX_DAY, defaultLocalSolarHour: 15 },
      [{ cutId: "q1", cutNumber: 1, cameraYawDeg: 0, drawnShadowAngleDeg: 210, drawnShadowLengthRatio: 0.2, drawnRimSide: "right" }],
    );
    const brief = summarizeMultiCutShadowAuditKo(correction.originalReport, correction);
    expect(brief).toContain("[조명·채색 QA 브리프]");
    expect(brief).toContain("도심 옥상 오후 대치");
    expect(brief).toContain("조광 바이블 지문(SHA-256)");
    expect(brief).toContain("수정 지시 목록:");
    expect(brief).toContain("자동 교정 검증:");
    expect(brief).toContain("연속성 100점");
    expect(brief).not.toContain("하는 것을 가능하게");
    expect(brief).not.toContain("직관적인 경험을 제공");
  });
});
