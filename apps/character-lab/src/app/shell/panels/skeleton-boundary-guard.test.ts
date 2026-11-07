import { describe, expect, it } from "vitest";

import { failVisible, isLabFailure } from "../../../contracts";

import {
  classifySkeletonBoundaryError,
  diagnoseSkeletonData,
  isFinitePixelPair,
  postSkeletonFailureOnce,
  reportInvalidPivotWorld,
  safeComputeWorldTransforms,
} from "./skeleton-boundary-guard";

import type { BoneData, LabFailure, Pose, Quat, SkeletonData, Vec3 } from "../../../contracts";

const FIXED_NOW = 1700000010000;

function makeBone(overrides: Partial<BoneData> & { readonly name: string }): BoneData {
  return {
    name: overrides.name,
    parent: overrides.parent !== undefined ? overrides.parent : null,
    restTranslation: overrides.restTranslation ?? [0, 1, 0],
    restRotation: overrides.restRotation ?? [0, 0, 0, 1],
    ...(overrides.auxiliary !== undefined ? { auxiliary: overrides.auxiliary } : {}),
  };
}

describe("skeleton-boundary-guard — diagnoseSkeletonData & safeComputeWorldTransforms 결함 방어 및 경계 계약", () => {
  it("결함 1: restTranslation 구조 불량(비배열·길이 미달·비숫자 원소)은 skeleton-invalid-input으로, 숫자 배열의 NaN/±Infinity만 skeleton-non-finite-rest로 분류한다", () => {
    const malformedShapes: readonly unknown[] = [
      null,
      undefined,
      "0,1,0",
      [0, 1],
      ["0", 1, 0],
      [0, undefined, 0],
      [0, 1, null],
    ];

    for (const badTranslation of malformedShapes) {
      const skeleton = {
        bones: [
          {
            name: "hips",
            parent: null,
            restTranslation: badTranslation as Vec3,
            restRotation: [0, 0, 0, 1] as Quat,
          },
        ],
      } satisfies SkeletonData;

      const failure = diagnoseSkeletonData(skeleton, FIXED_NOW);
      expect(isLabFailure(failure)).toBe(true);
      expect(failure?.code).toBe("skeleton-invalid-input");
      expect(failure?.reasonKo).toBe('본 "hips"의 restTranslation 형식이 올바르지 않습니다.');
      expect(failure?.at).toBe(FIXED_NOW);
    }

    expect(diagnoseSkeletonData(null, FIXED_NOW)?.code).toBe("skeleton-invalid-input");
    expect(diagnoseSkeletonData({ bones: [makeBone({ name: "" })] }, FIXED_NOW)?.code).toBe("skeleton-invalid-input");

    const nonFiniteNumericTranslations: readonly Vec3[] = [
      [Number.NaN, 0, 0],
      [0, Number.POSITIVE_INFINITY, 0],
      [0, 0, Number.NEGATIVE_INFINITY],
    ];

    for (const nonFinite of nonFiniteNumericTranslations) {
      const skeleton: SkeletonData = {
        bones: [makeBone({ name: "hips", restTranslation: nonFinite })],
      };
      const failures: LabFailure[] = [];
      const res = safeComputeWorldTransforms(
        skeleton,
        {},
        {
          now: FIXED_NOW,
          onFailure: (f) => failures.push(f),
        },
      );
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.failure.code).toBe("skeleton-non-finite-rest");
        expect(res.failure.reasonKo).toBe('본 "hips"의 restTranslation이 유한하지 않습니다.');
      }
      expect(failures).toHaveLength(1);
      expect(failures[0]?.code).toBe("skeleton-non-finite-rest");
    }
  });

  it("결함 2: bone.parent가 null도 아니고 비어 있지 않은 문자열도 아니면(빈 문자열·숫자·객체·undefined) skeleton-invalid-input을 반환한다", () => {
    const invalidParents: readonly unknown[] = ["", 123, {}, undefined, true];

    for (const badParent of invalidParents) {
      const skeleton = {
        bones: [
          {
            name: "spine",
            parent: badParent as string | null,
            restTranslation: [0, 0.2, 0] as Vec3,
            restRotation: [0, 0, 0, 1] as Quat,
          },
        ],
      } satisfies SkeletonData;

      const failure = diagnoseSkeletonData(skeleton, FIXED_NOW);
      expect(isLabFailure(failure)).toBe(true);
      expect(failure?.code).toBe("skeleton-invalid-input");
      expect(failure?.reasonKo).toBe('본 "spine"의 parent 형식이 올바르지 않습니다.');
    }
  });

  it("결함 3: bone.restRotation이 비배열·길이 미달·비숫자·비유한(NaN/±Infinity)·영노름(zero-norm)이면 skeleton-invalid-input을 반환한다", () => {
    const invalidRotations: readonly unknown[] = [
      null,
      [0, 0, 1],
      [0, 0, "0", 1],
      [Number.NaN, 0, 0, 1],
      [0, Number.POSITIVE_INFINITY, 0, 1],
      [0, 0, Number.NEGATIVE_INFINITY, 1],
      [0, 0, 0, 0],
      [1e-10, -1e-10, 0, 0],
    ];

    for (const badRotation of invalidRotations) {
      const skeleton = {
        bones: [
          {
            name: "leftUpperArm",
            parent: "hips",
            restTranslation: [0.15, 0, 0] as Vec3,
            restRotation: badRotation as Quat,
          },
        ],
      } satisfies SkeletonData;

      const failures: LabFailure[] = [];
      const res = safeComputeWorldTransforms(
        skeleton,
        {},
        {
          now: FIXED_NOW,
          onFailure: (f) => failures.push(f),
        },
      );
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.failure.code).toBe("skeleton-invalid-input");
        expect(res.failure.reasonKo).toBe('본 "leftUpperArm"의 restRotation 형식이 올바르지 않습니다.');
      }
      expect(failures).toHaveLength(1);
    }
  });

  it("결함 4: 중복된 bone.name이 부모 순환(hips <-> spine)을 덮어써 은폐하는 경우에도 skeleton-invalid-input으로 즉시 거부한다", () => {
    const duplicateMaskingCycleSkeleton: SkeletonData = {
      bones: [
        makeBone({ name: "hips", parent: "spine", restTranslation: [0, 1, 0] }),
        makeBone({ name: "spine", parent: "hips", restTranslation: [0, 0.2, 0] }),
        makeBone({ name: "hips", parent: null, restTranslation: [0, 1, 0] }),
      ],
    };

    const diag = diagnoseSkeletonData(duplicateMaskingCycleSkeleton, FIXED_NOW);
    expect(isLabFailure(diag)).toBe(true);
    expect(diag?.code).toBe("skeleton-invalid-input");
    expect(diag?.reasonKo).toBe('스켈레톤 본 이름 "hips"이(가) 중복되어 있습니다.');

    const failures: LabFailure[] = [];
    const res = safeComputeWorldTransforms(
      duplicateMaskingCycleSkeleton,
      {},
      {
        now: FIXED_NOW,
        onFailure: (f) => failures.push(f),
      },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.failure.code).toBe("skeleton-invalid-input");
      expect(res.failure.reasonKo).toContain("중복");
    }
    expect(failures).toHaveLength(1);
  });

  it("부모 본 순환(hips -> hips, hips -> spine -> hips, aux_1 -> aux_2 -> aux_1)을 O(N)으로 탐지해 skeleton-cycle을 보고한다", () => {
    const selfCycle: SkeletonData = {
      bones: [makeBone({ name: "hips", parent: "hips" })],
    };
    const twoCycle: SkeletonData = {
      bones: [
        makeBone({ name: "hips", parent: "spine" }),
        makeBone({ name: "spine", parent: "hips" }),
      ],
    };
    const auxCycle: SkeletonData = {
      bones: [
        makeBone({ name: "hips", parent: null }),
        makeBone({ name: "aux_1", parent: "aux_2", auxiliary: true }),
        makeBone({ name: "aux_2", parent: "aux_1", auxiliary: true }),
        makeBone({ name: "spine", parent: "aux_1" }),
      ],
    };

    for (const cyclicSkeleton of [selfCycle, twoCycle, auxCycle]) {
      const failures: LabFailure[] = [];
      const res = safeComputeWorldTransforms(
        cyclicSkeleton,
        {},
        {
          now: FIXED_NOW,
          onFailure: (f) => failures.push(f),
        },
      );
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.failure.code).toBe("skeleton-cycle");
      }
      expect(failures).toHaveLength(1);
      expect(failures[0]?.code).toBe("skeleton-cycle");
    }
  });

  it("정상 빈 스켈레톤({ bones: [] })은 null 진단 및 빈 WorldTransformMap을 반환하고 onFailure를 호출하지 않는다", () => {
    const emptySkeleton: SkeletonData = { bones: [] };
    expect(diagnoseSkeletonData(emptySkeleton, FIXED_NOW)).toBeNull();

    const failures: LabFailure[] = [];
    const res = safeComputeWorldTransforms(
      emptySkeleton,
      {},
      {
        now: FIXED_NOW,
        onFailure: (f) => failures.push(f),
      },
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.transforms.size).toBe(0);
    }
    expect(failures).toHaveLength(0);
  });

  it("예기치 않은 프로그래밍 오류(pose getter의 TypeError 등)는 safeComputeWorldTransforms가 삼키지 않고 그대로 재투척하며 onFailure를 호출하지 않는다", () => {
    const validSkeleton: SkeletonData = {
      bones: [makeBone({ name: "hips", parent: null, restTranslation: [0, 1, 0] })],
    };
    const brokenPose = new Proxy({} as Pose, {
      get(): never {
        throw new TypeError("unexpected-programming-bug");
      },
    });

    const failures: LabFailure[] = [];
    expect(() =>
      safeComputeWorldTransforms(validSkeleton, brokenPose, {
        now: FIXED_NOW,
        onFailure: (f) => failures.push(f),
      }),
    ).toThrowError(new TypeError("unexpected-programming-bug"));
    expect(failures).toHaveLength(0);
  });

  it("보조 유틸리티(isFinitePixelPair, classifySkeletonBoundaryError, reportInvalidPivotWorld)가 경계 계약을 준수한다", () => {
    expect(isFinitePixelPair([100, 200])).toBe(true);
    expect(isFinitePixelPair([Number.NaN, 200])).toBe(false);
    expect(isFinitePixelPair([100, Number.POSITIVE_INFINITY])).toBe(false);
    expect(isFinitePixelPair(null)).toBe(false);

    const existingFailure = failVisible("skeleton-cycle", "기존 순환 실패", null, FIXED_NOW);
    expect(classifySkeletonBoundaryError(existingFailure)).toBe(existingFailure);
    expect(classifySkeletonBoundaryError(new Error("스켈레톤에 순환 부모 관계가 있습니다: hips"), FIXED_NOW)?.code).toBe(
      "skeleton-cycle",
    );
    expect(
      classifySkeletonBoundaryError(new Error("스켈레톤 본 hips의 restTranslation이 유한하지 않습니다."), FIXED_NOW)?.code,
    ).toBe("skeleton-non-finite-rest");
    expect(classifySkeletonBoundaryError(new Error("IK 체인은 연속된 부모-자식이어야 합니다."), FIXED_NOW)?.code).toBe(
      "skeleton-invalid-input",
    );
    expect(classifySkeletonBoundaryError(new TypeError("unexpected-programming-bug"), FIXED_NOW)).toBeNull();

    const pivotFailures: LabFailure[] = [];
    const pivotFailure = reportInvalidPivotWorld([Number.NaN, 0, 0], {
      now: FIXED_NOW,
      onFailure: (f) => pivotFailures.push(f),
    });
    expect(pivotFailure.code).toBe("skeleton-invalid-input");
    expect(pivotFailures).toHaveLength(1);
  });

  it("postSkeletonFailureOnce는 동일(code + reasonKo) 실패를 중복 게시하지 않고 다른 실패나 해제 후 재발생은 기록한다", () => {
    const failures: LabFailure[] = [];
    const sink = {
      getState: () => ({ failures }),
      applyEvent: (event: { readonly type: "failure"; readonly failure: LabFailure }) => {
        failures.push(event.failure);
      },
    };

    const cycle1 = failVisible("skeleton-cycle", '스켈레톤 본 "hips"의 부모 관계에 순환이 있습니다.', null, FIXED_NOW);
    const cycle1Duplicate = failVisible("skeleton-cycle", '스켈레톤 본 "hips"의 부모 관계에 순환이 있습니다.', null, FIXED_NOW + 100);
    const nanRest = failVisible("skeleton-non-finite-rest", '본 "hips"의 restTranslation이 유한하지 않습니다.', null, FIXED_NOW + 200);
    const cycle2DifferentReason = failVisible("skeleton-cycle", '스켈레톤 본 "spine"의 부모 관계에 순환이 있습니다.', null, FIXED_NOW + 300);

    expect(postSkeletonFailureOnce(sink, cycle1)).toBe(true);
    expect(postSkeletonFailureOnce(sink, cycle1Duplicate)).toBe(false);
    expect(failures).toHaveLength(1);

    expect(postSkeletonFailureOnce(sink, nanRest)).toBe(true);
    expect(postSkeletonFailureOnce(sink, cycle2DifferentReason)).toBe(true);
    expect(failures).toHaveLength(3);

    // failures 목록이 비워지면(배너 닫기 등) 다시 기록 가능
    failures.length = 0;
    expect(postSkeletonFailureOnce(sink, cycle1Duplicate)).toBe(true);
    expect(failures).toHaveLength(1);
  });
});

