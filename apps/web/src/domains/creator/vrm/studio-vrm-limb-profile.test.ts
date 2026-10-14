import { describe, expect, it } from "vitest";

import {
  buildLimbSegmentProfile,
  limbProfilesSignature,
  maxLimbCircumferenceM,
  maxLimbRadiusBetween,
  projectLimbSample,
  sampleLimbRadius,
  sanitizeLimbProfiles,
  type LimbProfileSample,
  type LimbProfiles,
} from "./studio-vrm-limb-profile";

/** 구간마다 일정 반경의 표본을 골고루 뿌린다 — 분위수가 어디에 떨어지든 그 반경이 나와야 한다. */
function uniformSamples(radiusM: number, perRing = 8): LimbProfileSample[] {
  const samples: LimbProfileSample[] = [];
  for (let ring = 0; ring < 4; ring += 1) {
    for (let index = 0; index < perRing; index += 1) {
      samples.push({ s: (ring + 0.5) / 4, radialM: radiusM });
    }
  }
  return samples;
}

function profilesWith(upperArmRadiusM: number): LimbProfiles {
  const segment = buildLimbSegmentProfile(uniformSamples(upperArmRadiusM));
  if (!segment) throw new Error("fixture profile must measure");
  const empty = { upperArm: null, lowerArm: null, upperLeg: null, lowerLeg: null } as const;
  return {
    left: { ...empty, upperArm: segment },
    right: { ...empty },
  };
}

describe("팔다리 둘레 실측 프로파일", () => {
  it("일정 반경 표본에서는 모든 링이 그 반경으로 재어진다", () => {
    const profile = buildLimbSegmentProfile(uniformSamples(0.055));
    expect(profile).not.toBeNull();
    expect(profile?.rings).toHaveLength(4);
    for (const ring of profile?.rings ?? []) {
      expect(ring.radiusM).toBeCloseTo(0.055, 6);
    }
    expect(profile?.measuredRingCount).toBe(4);
  });

  it("이물 표본(극단 반경 소수)은 분위수가 잘라내 링을 끌고 가지 않는다", () => {
    const samples = uniformSamples(0.05, 24);
    samples.push({ s: 0.125, radialM: 0.5 }, { s: 0.125, radialM: 0.48 });
    const profile = buildLimbSegmentProfile(samples);
    expect(profile?.rings[0].radiusM).toBeCloseTo(0.05, 6);
  });

  it("표본이 모자라면 실측 실패로 null을 돌려준다 — 없는 둘레를 지어내지 않는다", () => {
    expect(buildLimbSegmentProfile(uniformSamples(0.05, 2))).toBeNull();
    expect(buildLimbSegmentProfile([])).toBeNull();
  });

  it("구간 최대 반경과 둘레는 가장 굵은 위치 기준이다", () => {
    const samples: LimbProfileSample[] = [];
    const radii = [0.04, 0.07, 0.05, 0.035];
    radii.forEach((radiusM, ring) => {
      for (let index = 0; index < 8; index += 1) {
        samples.push({ s: (ring + 0.5) / 4, radialM: radiusM });
      }
    });
    const profile = buildLimbSegmentProfile(samples);
    if (!profile) throw new Error("fixture profile must measure");
    expect(maxLimbRadiusBetween(profile, 0, 1)).toBeCloseTo(0.07, 6);
    // 구간 경계(0.5)는 이웃 링 보간값 0.06이 구간 안 링 최대(0.05)보다 크므로 경계가 이긴다.
    expect(maxLimbRadiusBetween(profile, 0.5, 1)).toBeCloseTo(0.06, 6);
    expect(maxLimbCircumferenceM(profile)).toBeCloseTo(2 * Math.PI * 0.07, 6);
    expect(sampleLimbRadius(profile, 0.375)).toBeCloseTo(0.07, 6);
  });

  it("정규화는 깨진 세그먼트만 버리고 나머지는 살린다(부분 실측)", () => {
    const good = profilesWith(0.05);
    const raw = {
      left: { ...good.left, lowerArm: { version: 99, source: "measured", rings: [] } },
      right: good.right,
    };
    const sanitized = sanitizeLimbProfiles(raw);
    expect(sanitized?.left.upperArm).not.toBeNull();
    expect(sanitized?.left.lowerArm).toBeNull();
    expect(sanitizeLimbProfiles(null)).toBeNull();
    expect(sanitizeLimbProfiles({ left: {}, right: {} })).toBeNull();
  });

  it("본 로컬 점 투영은 축 거리(s)와 축 반경(radial)을 분리한다", () => {
    // 축 +Y, 길이 0.3. 점 (0.04, 0.15, 0.03)은 중간 지점에서 축에서 0.05 떨어져 있다.
    const sample = projectLimbSample([0, 1, 0], 0.3, 0.04, 0.15, 0.03);
    expect(sample?.s).toBeCloseTo(0.5, 6);
    expect(sample?.radialM).toBeCloseTo(0.05, 6);
    // 구간을 크게 벗어난 점(손·몸통 표면)은 재료가 아니다.
    expect(projectLimbSample([0, 1, 0], 0.3, 0, 0.45, 0)).toBeNull();
    expect(projectLimbSample([0, 1, 0], 0.3, 0, -0.1, 0)).toBeNull();
    // 관절 너머로 살짝 벗어난 점은 끝 링 재료로 클램프된다.
    expect(projectLimbSample([0, 1, 0], 0.3, 0.02, 0.31, 0)?.s).toBe(1);
    expect(projectLimbSample([0, 1, 0], Number.NaN, 0, 0.1, 0)).toBeNull();
  });

  it("서명은 둘레가 바뀌면 바뀌고 같으면 같다 — 재측정 캐시 무효화의 기준이다", () => {
    expect(limbProfilesSignature(profilesWith(0.05)))
      .toBe(limbProfilesSignature(profilesWith(0.05)));
    expect(limbProfilesSignature(profilesWith(0.08)))
      .not.toBe(limbProfilesSignature(profilesWith(0.05)));
    expect(limbProfilesSignature(null)).toBe("none");
  });
});
