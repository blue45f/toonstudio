import { describe, expect, it } from "vitest";

import fixtureFile from "./__fixtures__/studio-vrm-head-profiles.json";
import { AVATAR_FORGE_CAP_MIN_SHELL } from "./studio-vrm-avatar-forge-hair-object";
import {
  buildStudioVrmHeadProfile,
  legacyStudioVrmEyeSpacingHeadFit,
  measureStudioVrmHeadCapCoverage,
  resolveStudioVrmHeadFit,
  type StudioVrmHeadFitInput,
  type StudioVrmHeadProfile,
  type StudioVrmHeadVec3,
} from "./studio-vrm-head-fit";

/**
 * fixture 는 번들 VRM GLB 를 직접 파싱해 뽑은 실측값이다(`scripts/generate-vrm-head-profile-fixtures.mts`).
 * crownSamples 는 프로필과 독립된 이마 위 두개골 원본 점이라, 프로필로 맞춘 캡이 실제 두피를 덮는지
 * 프로필 바깥의 증거로 확인할 수 있다.
 */
interface HeadFixture {
  readonly id: string;
  readonly label: string;
  readonly vrmVersion: "0" | "1";
  readonly modelHeight: number;
  readonly eyeCenter: StudioVrmHeadVec3 | null;
  readonly eyeDistance: number;
  readonly frontSign: 1 | -1;
  readonly profile: StudioVrmHeadProfile;
  readonly crownSamples: readonly StudioVrmHeadVec3[];
}

const FIXTURES = (fixtureFile as unknown as { models: readonly HeadFixture[] }).models;
/**
 * 캡 반경 배율. 캡은 두개골 타원체 바깥 껍질이고 볼륨 1 에서 +5%, 볼륨을 최소로 줄여도 +2.5%
 * 아래로는 내려가지 않는다(`studio-vrm-avatar-forge-hair-object.ts`).
 */
const DEFAULT_CAP = 1 + AVATAR_FORGE_CAP_MIN_SHELL;
const THINNEST_CAP = 1 + AVATAR_FORGE_CAP_MIN_SHELL * 0.5;
/** 감사 A-01 에서 헤어 프리셋이 민머리로 보인 5개 모델. */
const AUDIT_BALD_MODELS = ["sample-vrm", "shion", "vita", "vivi", "quaternius-modular-female-casual"] as const;

function inputOf(fixture: HeadFixture): StudioVrmHeadFitInput {
  return {
    profile: fixture.profile,
    eyeCenter: fixture.eyeCenter,
    eyeDistance: fixture.eyeDistance,
    frontSign: fixture.frontSign,
    modelHeight: fixture.modelHeight,
  };
}

function fixture(id: string): HeadFixture {
  const found = FIXTURES.find((item) => item.id === id);
  if (!found) throw new Error(`fixture 없음: ${id}`);
  return found;
}

/** 프로필 띠에서 좌우 중 짧은 쪽 반폭의 최댓값(한쪽 장식을 뺀 실측 두상 반폭). */
function measuredCoreHalfWidth(profile: StudioVrmHeadProfile): number {
  return Math.max(...profile.slabs.filter((slab) => slab.count >= 3).map((slab) => Math.min(-slab.minX, slab.maxX)));
}

function measuredTop(profile: StudioVrmHeadProfile): number {
  return Math.max(...profile.slabs.filter((slab) => slab.count >= 3).map((slab) => slab.y1));
}

describe("resolveStudioVrmHeadFit — 실측 VRM 두상", () => {
  it("fixture 는 감사 대상 5개 모델과 대조군을 포함한 12개 모델의 실측이다", () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(10);
    for (const id of AUDIT_BALD_MODELS) expect(fixture(id).profile.sampleCount).toBeGreaterThan(48);
    expect(fixture("orion").label).toBe("오리온 (로봇)");
    expect(fixture("seedsan").label).toBe("시드상 (마스코트)");
    expect(fixture("quaternius-modular-male-suit").label).toBe("쿼터니어스 정장 (남성)");
  });

  it.each(FIXTURES.map((item) => [item.label, item] as const))("%s: 실측 경로로 맞추고 캡이 이마 위 두개골 점을 덮는다", (_label, item) => {
    const fit = resolveStudioVrmHeadFit(inputOf(item));
    expect(fit.source).toBe("mesh");
    // 안나는 머리 본에 묶인 한쪽 머리 장식이 두개골 점에 섞여 있다. 그 장식까지 덮으려고 머리 전체를
    // 키우지 않는 것이 의도다.
    const anna = item.id === "anna";
    expect(measureStudioVrmHeadCapCoverage(fit, item.crownSamples, DEFAULT_CAP).ratio).toBeGreaterThanOrEqual(anna ? 0.85 : 0.97);
    // 가장 얇은 캡: 얼굴 가면형 메시(쿼터니어스)의 이마 모서리 몇 점만 1mm 안쪽으로 걸칠 수 있다.
    expect(measureStudioVrmHeadCapCoverage(fit, item.crownSamples, THINNEST_CAP).ratio).toBeGreaterThanOrEqual(anna ? 0.85 : 0.93);
  });

  it.each(FIXTURES.map((item) => [item.label, item] as const))("%s: 캡이 헬멧처럼 부풀지 않는다(반폭 1.35배·정수리 4cm 이내)", (_label, item) => {
    const fit = resolveStudioVrmHeadFit(inputOf(item));
    const core = measuredCoreHalfWidth(item.profile);
    expect(fit.radiusX).toBeLessThanOrEqual(core * 1.35);
    expect(fit.center[1] + fit.radiusY - measuredTop(item.profile)).toBeLessThanOrEqual(0.04);
  });

  it.each(FIXTURES.map((item) => [item.label, item] as const))("%s: 앞머리를 걸 얼굴 앞면은 두개골 중심 앞, 실측 얼굴 앞끝 안쪽이다", (_label, item) => {
    const fit = resolveStudioVrmHeadFit(inputOf(item));
    const maxD = Math.max(...item.profile.slabs.filter((slab) => slab.count >= 3).map((slab) => slab.maxD));
    expect(fit.faceFront).toBeGreaterThan(fit.frontSign * fit.center[2] + fit.radiusZ * 0.5);
    expect(fit.faceFront).toBeLessThanOrEqual(maxD + 1e-9);
  });

  it("얼굴 방향 부호를 지킨다: 눈은 두개골 중심보다 얼굴 쪽에 있다", () => {
    for (const item of FIXTURES.filter((entry) => entry.eyeCenter)) {
      const fit = resolveStudioVrmHeadFit(inputOf(item));
      expect(fit.frontSign).toBe(item.vrmVersion === "0" ? -1 : 1);
      expect(item.eyeCenter![2] * fit.frontSign).toBeGreaterThan(fit.center[2] * fit.frontSign);
    }
  });
});

describe("legacyStudioVrmEyeSpacingHeadFit — A-01 원인 고정", () => {
  it.each(AUDIT_BALD_MODELS.map((id) => [fixture(id).label, id] as const))("%s: 눈 간격 추정 반경이 실측 두상 반폭보다 작아 캡이 두피 안에 묻혔다", (_label, id) => {
    const item = fixture(id);
    const legacy = legacyStudioVrmEyeSpacingHeadFit(inputOf(item));
    expect(legacy.radiusX).toBeLessThan(measuredCoreHalfWidth(item.profile) * 0.92);
    // 옛 경로에는 캡 껍질 규칙도 없었다(캡 반경 = 추정 반경 × 볼륨).
    expect(measureStudioVrmHeadCapCoverage(legacy, item.crownSamples).ratio).toBeLessThanOrEqual(0.1);
    // 새 맞춤은 같은 점을 거의 전부 덮는다.
    expect(measureStudioVrmHeadCapCoverage(resolveStudioVrmHeadFit(inputOf(item)), item.crownSamples, DEFAULT_CAP).ratio)
      .toBeGreaterThanOrEqual(0.97);
  });

  it("루미의 실측 수치를 그대로 고정한다(눈 간격 0.0346 m → 옛 반경 0.0745 m, 두상 반폭 0.1088 m)", () => {
    const lumi = fixture("sample-vrm");
    expect(lumi.eyeDistance).toBeCloseTo(0.0346, 4);
    expect(legacyStudioVrmEyeSpacingHeadFit(inputOf(lumi)).radiusX).toBeCloseTo(0.0745, 3);
    expect(Math.max(...lumi.profile.slabs.map((slab) => slab.maxX))).toBeCloseTo(0.1088, 4);
  });
});

/* ── 합성 두상: 프로필 요약과 이상치 내성 ─────────────────────────────────── */

function ellipsoidPoints(rx: number, ry: number, rz: number, cy = 0.09, count = 1600): number[] {
  const points: number[] = [];
  for (let index = 0; index < count; index += 1) {
    // 결정적 피보나치 구면 분포.
    const t = (index + 0.5) / count;
    const polar = Math.acos(1 - 2 * t);
    const azimuth = Math.PI * (1 + Math.sqrt(5)) * index;
    const y = cy + ry * Math.cos(polar);
    if (y < -0.03) continue;
    points.push(rx * Math.sin(polar) * Math.cos(azimuth), y, rz * Math.sin(polar) * Math.sin(azimuth));
  }
  return points;
}

describe("buildStudioVrmHeadProfile", () => {
  it("점이 48개 미만이거나 높이가 없으면 실측을 포기한다", () => {
    expect(buildStudioVrmHeadProfile(new Float32Array(47 * 3), 1)).toBeNull();
    expect(buildStudioVrmHeadProfile(new Float32Array(200 * 3), 1)).toBeNull();
  });

  it("띠마다 좌우·깊이 끝과 8방위 끝점을 요약하고 깊이는 얼굴 쪽을 + 로 둔다", () => {
    const points = ellipsoidPoints(0.09, 0.12, 0.1);
    const front = buildStudioVrmHeadProfile(points, 1)!;
    const back = buildStudioVrmHeadProfile(points.map((value, index) => (index % 3 === 2 ? -value : value)), -1)!;
    expect(front.slabs).toHaveLength(16);
    const widest = Math.max(...front.slabs.map((slab) => slab.maxX));
    expect(widest).toBeGreaterThan(0.085);
    expect(widest).toBeLessThanOrEqual(0.09 + 1e-6);
    // z 를 뒤집고 frontSign −1 로 요약하면 같은 프로필이다.
    expect(back.slabs.map((slab) => slab.maxD)).toEqual(front.slabs.map((slab) => slab.maxD));
    expect(front.slabs.some((slab) => slab.rim.every((point) => point !== null))).toBe(true);
  });
});

describe("resolveStudioVrmHeadFit — 이상치 내성", () => {
  const base = ellipsoidPoints(0.09, 0.12, 0.1);
  const input = (points: number[]): StudioVrmHeadFitInput => ({
    profile: buildStudioVrmHeadProfile(points, 1),
    eyeCenter: [0, 0.06, 0.02],
    eyeDistance: 0.035,
    frontSign: 1,
    modelHeight: 1.6,
  });

  it("한쪽에만 달린 장식(리본)은 두상 폭을 키우지 않는다", () => {
    const plain = resolveStudioVrmHeadFit(input(base));
    const ribbon: number[] = [...base];
    for (let index = 0; index < 120; index += 1) ribbon.push(0.15 + (index % 10) * 0.004, 0.16 + Math.floor(index / 10) * 0.003, 0.0);
    const decorated = resolveStudioVrmHeadFit(input(ribbon));
    expect(decorated.radiusX).toBeLessThanOrEqual(plain.radiusX * 1.05);
  });

  it("정수리에 선 가는 뿔은 캡 높이를 끌어올리지 않는다", () => {
    const plain = resolveStudioVrmHeadFit(input(base));
    const horn: number[] = [...base];
    for (let index = 0; index < 160; index += 1) horn.push(Math.sin(index) * 0.006, 0.21 + index * 0.0012, Math.cos(index) * 0.006);
    const horned = resolveStudioVrmHeadFit(input(horn));
    expect(horned.center[1] + horned.radiusY).toBeLessThanOrEqual(plain.center[1] + plain.radiusY + 0.01);
  });

  it("실측이 없으면 눈 간격·키 대체로 떨어지되 예전보다 작은 쪽으로 치우치지 않는다", () => {
    const eyes = resolveStudioVrmHeadFit({ profile: null, eyeCenter: [0, 0.0626, 0.0214], eyeDistance: 0.0346, frontSign: 1, modelHeight: 1.6154 });
    expect(eyes.source).toBe("eyes");
    expect(eyes.radiusX).toBeGreaterThanOrEqual(1.6154 * 0.05);
    const height = resolveStudioVrmHeadFit({ profile: null, eyeCenter: null, eyeDistance: 0, frontSign: -1, modelHeight: 1.85 });
    expect(height.source).toBe("height");
    expect(height.radiusX).toBeCloseTo(1.85 * 0.06, 6);
    expect(height.frontSign).toBe(-1);
  });
});
