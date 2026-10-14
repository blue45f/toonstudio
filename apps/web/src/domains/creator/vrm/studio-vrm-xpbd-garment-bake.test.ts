import { describe, expect, it } from "vitest";

import {
  STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS,
  STUDIO_VRM_XPBD_GARMENT_SIMULATION_MODE,
  bakeStudioVrmXpbdGarmentPose,
  createStudioVrmXpbdGarmentTopology,
  planStudioVrmXpbdGarmentBake,
  resolveStudioVrmXpbdGarmentKindForWardrobeItem,
  type StudioVrmXpbdGarmentAnchorFrame,
  type StudioVrmXpbdGarmentBakeInput,
  type StudioVrmXpbdGarmentBodyProxies,
  type StudioVrmXpbdGarmentCapsuleProxy,
  type StudioVrmXpbdGarmentKind,
  type StudioVrmXpbdGarmentMetrics,
  type StudioVrmXpbdGarmentTopology,
  type StudioVrmXpbdGarmentVec3,
} from "./studio-vrm-xpbd-garment-bake";

const METRICS: StudioVrmXpbdGarmentMetrics = {
  totalHeight: 1.6,
  headUnits: 8,
  hipsHeight: 0.95,
  legLength: 0.86,
  shoulderSpan: 0.18,
};

const REST_CHEST: StudioVrmXpbdGarmentAnchorFrame = {
  center: [0, 1.42, 0],
  right: [1, 0, 0],
  up: [0, 1, 0],
  forward: [0, 0, 1],
};

const CURRENT_CHEST: StudioVrmXpbdGarmentAnchorFrame = {
  center: [0.03, 1.45, 0.02],
  right: [0.98, 0, -0.2],
  up: [0, 1, 0],
  forward: [0.2, 0, 0.98],
};

const REST_WAIST: StudioVrmXpbdGarmentAnchorFrame = {
  center: [0, 0.95, 0],
  right: [1, 0, 0],
  up: [0, 1, 0],
  forward: [0, 0, 1],
};

const CURRENT_WAIST: StudioVrmXpbdGarmentAnchorFrame = {
  center: [0.03, 0.98, 0.02],
  right: [0.98, 0, -0.2],
  up: [0, 1, 0],
  forward: [0.2, 0, 0.98],
};

function capsule(
  restHead: StudioVrmXpbdGarmentVec3,
  restTail: StudioVrmXpbdGarmentVec3,
  currentHead: StudioVrmXpbdGarmentVec3,
  currentTail: StudioVrmXpbdGarmentVec3,
  radius: number,
): StudioVrmXpbdGarmentCapsuleProxy {
  return { restHead, restTail, currentHead, currentTail, radius, friction: 0.4 };
}

function torsoBody(): StudioVrmXpbdGarmentBodyProxies {
  return {
    torso: capsule([0, 1.02, 0], [0, 1.46, 0], [0.03, 1.05, 0.02], [0.03, 1.49, 0.02], 0.125),
    hips: capsule([-0.1, 0.92, 0], [0.1, 0.92, 0], [-0.07, 0.95, 0.02], [0.13, 0.95, 0.02], 0.11),
    leftThigh: capsule(
      [-0.08, 0.88, 0],
      [-0.08, 0.5, 0],
      [-0.05, 0.91, 0.02],
      [-0.22, 0.56, 0.1],
      0.075,
    ),
    rightThigh: capsule(
      [0.08, 0.88, 0],
      [0.08, 0.5, 0],
      [0.11, 0.91, 0.02],
      [0.22, 0.56, -0.08],
      0.075,
    ),
    leftCalf: capsule(
      [-0.08, 0.5, 0],
      [-0.08, 0.14, 0],
      [-0.22, 0.56, 0.1],
      [-0.18, 0.17, 0.18],
      0.065,
    ),
    rightCalf: capsule(
      [0.08, 0.5, 0],
      [0.08, 0.14, 0],
      [0.22, 0.56, -0.08],
      [0.2, 0.17, -0.16],
      0.065,
    ),
    leftUpperArm: capsule(
      [-0.19, 1.42, 0],
      [-0.21, 1.16, 0],
      [-0.16, 1.45, 0.02],
      [-0.26, 1.2, 0.06],
      0.05,
    ),
    rightUpperArm: capsule(
      [0.19, 1.42, 0],
      [0.21, 1.16, 0],
      [0.22, 1.45, 0.02],
      [0.3, 1.2, -0.04],
      0.05,
    ),
  };
}

function legBody(): StudioVrmXpbdGarmentBodyProxies {
  const body = torsoBody();
  return {
    hips: body.hips,
    leftThigh: body.leftThigh,
    rightThigh: body.rightThigh,
    leftCalf: body.leftCalf,
    rightCalf: body.rightCalf,
  };
}

function createTopology(
  kind: StudioVrmXpbdGarmentKind,
  anchor: StudioVrmXpbdGarmentAnchorFrame,
  body: StudioVrmXpbdGarmentBodyProxies,
): StudioVrmXpbdGarmentTopology {
  const result = createStudioVrmXpbdGarmentTopology({
    kind,
    metrics: METRICS,
    restAnchor: anchor,
    restBody: body,
  });
  if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
  return result.topology;
}

function bakeInput(
  topology: StudioVrmXpbdGarmentTopology,
  currentAnchor: StudioVrmXpbdGarmentAnchorFrame,
  body: StudioVrmXpbdGarmentBodyProxies,
  overrides: Partial<StudioVrmXpbdGarmentBakeInput> = {},
): StudioVrmXpbdGarmentBakeInput {
  return {
    expectedPoseGeneration: 7,
    poseGeneration: 7,
    expectedTopologySha256: topology.topologySha256,
    currentAnchor,
    body,
    ...overrides,
  };
}

describe("bake gate (포즈 확정 시 베이크 정책)", () => {
  it("포즈 미확정에서는 절대 굽지 않는다", () => {
    expect(planStudioVrmXpbdGarmentBake({ poseConfirmed: false, poseGeneration: 3 })).toEqual({
      bake: false,
      reason: "pose-not-confirmed",
    });
  });

  it("포즈 확정 시 세대당 한 번만 굽는다", () => {
    expect(
      planStudioVrmXpbdGarmentBake({
        poseConfirmed: true,
        poseGeneration: 3,
        lastBakedPoseGeneration: 2,
      }),
    ).toEqual({ bake: true, reason: "pose-confirmed" });
    expect(
      planStudioVrmXpbdGarmentBake({
        poseConfirmed: true,
        poseGeneration: 3,
        lastBakedPoseGeneration: 3,
      }),
    ).toEqual({ bake: false, reason: "already-baked-for-generation" });
    expect(planStudioVrmXpbdGarmentBake({ poseConfirmed: true, poseGeneration: -1 })).toEqual({
      bake: false,
      reason: "invalid-generation",
    });
  });
});

describe("wardrobe routing", () => {
  it("상의/하의/아우터를 베이크 종류로, 스커트는 기존 권위로 보낸다", () => {
    expect(resolveStudioVrmXpbdGarmentKindForWardrobeItem("tshirt", "top")).toBe("top");
    expect(resolveStudioVrmXpbdGarmentKindForWardrobeItem("shirt", "top")).toBe("top");
    expect(resolveStudioVrmXpbdGarmentKindForWardrobeItem("pants", "bottom")).toBe("bottom-pants");
    expect(resolveStudioVrmXpbdGarmentKindForWardrobeItem("jeans", "bottom")).toBe("bottom-pants");
    expect(resolveStudioVrmXpbdGarmentKindForWardrobeItem("shorts", "bottom")).toBe(
      "bottom-shorts",
    );
    expect(resolveStudioVrmXpbdGarmentKindForWardrobeItem("coat", "outer")).toBe("outer-long");
    expect(resolveStudioVrmXpbdGarmentKindForWardrobeItem("blazer", "outer")).toBe("outer-short");
    expect(resolveStudioVrmXpbdGarmentKindForWardrobeItem("pleated", "bottom")).toBe(
      "skirt-authority",
    );
    expect(resolveStudioVrmXpbdGarmentKindForWardrobeItem("longskirt", "bottom")).toBe(
      "skirt-authority",
    );
    expect(resolveStudioVrmXpbdGarmentKindForWardrobeItem("sneakers", "shoes")).toBeNull();
    expect(resolveStudioVrmXpbdGarmentKindForWardrobeItem("dress", "top")).toBeNull();
  });
});

describe("topology", () => {
  it("상의 토폴로지는 예산 안에서 한 개의 몸통 튜브로 만들어진다", () => {
    const topology = createTopology("top", REST_CHEST, torsoBody());
    expect(topology.mode).toBe(STUDIO_VRM_XPBD_GARMENT_SIMULATION_MODE);
    expect(topology.slot).toBe("top");
    expect(topology.tubeCount).toBe(1);
    expect(topology.particleCount).toBe(40 * 8);
    expect(topology.particleCount).toBeLessThanOrEqual(
      STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS.maxParticles,
    );
    expect(topology.pinnedParticleIndices).toHaveLength(40);
  });

  it("하의 토폴로지는 다리 튜브 두 개로 만들어진다", () => {
    const topology = createTopology("bottom-pants", REST_WAIST, legBody());
    expect(topology.slot).toBe("bottom");
    expect(topology.tubeCount).toBe(2);
    expect(topology.particleCount).toBe(24 * 9 * 2);
    expect(topology.pinnedParticleIndices).toHaveLength(48);
  });

  it("다리 의상은 restBody 실측 없이는 fail-closed 한다", () => {
    const result = createStudioVrmXpbdGarmentTopology({
      kind: "bottom-pants",
      metrics: METRICS,
      restAnchor: REST_WAIST,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("missing-input");
  });

  it("예산 초과 토폴로지는 budget-exceeded 로 거절된다", () => {
    const result = createStudioVrmXpbdGarmentTopology({
      kind: "bottom-pants",
      metrics: METRICS,
      restAnchor: REST_WAIST,
      restBody: legBody(),
      segmentCount: 64,
      ringCount: 16,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("budget-exceeded");
  });
});

describe("bake", () => {
  it("상의 베이크가 확정 포즈에서 동작하고 관통 1mm 이내로 끝난다", () => {
    const topology = createTopology("top", REST_CHEST, torsoBody());
    const result = bakeStudioVrmXpbdGarmentPose(
      topology,
      bakeInput(topology, CURRENT_CHEST, torsoBody()),
    );
    if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
    expect(result.mesh.receipt.mode).toBe("bake-on-pose-confirm");
    expect(result.mesh.receipt.garmentKind).toBe("top");
    expect(result.mesh.receipt.diagnostics.bakeWorkUnits).toBe(40 * 8 * 8 * 12);
    expect(result.mesh.receipt.diagnostics.bakeWorkUnits).toBeLessThanOrEqual(
      STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS.maxBakeWorkUnits,
    );
    for (const penetration of Object.values(
      result.mesh.receipt.diagnostics.finalCapsulePenetrationById,
    )) {
      expect(penetration).toBeLessThanOrEqual(0.001);
    }
    expect(result.mesh.positions.length).toBe(topology.particleCount * 3);
    expect(result.mesh.positions.every((value) => Number.isFinite(value))).toBe(true);
  });

  it("하의(팬츠) 베이크가 굽힌 무릎 포즈에서도 동작한다", () => {
    const topology = createTopology("bottom-pants", REST_WAIST, legBody());
    const result = bakeStudioVrmXpbdGarmentPose(
      topology,
      bakeInput(topology, CURRENT_WAIST, legBody()),
    );
    if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
    expect(result.mesh.receipt.garmentKind).toBe("bottom-pants");
    expect(result.mesh.receipt.capsuleIds).toEqual([
      "hips",
      "leftThigh",
      "rightThigh",
      "leftCalf",
      "rightCalf",
    ]);
    for (const penetration of Object.values(
      result.mesh.receipt.diagnostics.finalCapsulePenetrationById,
    )) {
      expect(penetration).toBeLessThanOrEqual(0.001);
    }
  });

  it("반바지와 롱아우터 베이크도 동작한다", () => {
    const shorts = createTopology("bottom-shorts", REST_WAIST, legBody());
    const shortsResult = bakeStudioVrmXpbdGarmentPose(
      shorts,
      bakeInput(shorts, CURRENT_WAIST, legBody()),
    );
    if (!shortsResult.ok) throw new Error(`${shortsResult.code}: ${shortsResult.detail}`);
    expect(shortsResult.mesh.receipt.garmentKind).toBe("bottom-shorts");

    const outer = createTopology("outer-long", REST_CHEST, torsoBody());
    const outerResult = bakeStudioVrmXpbdGarmentPose(
      outer,
      bakeInput(outer, CURRENT_CHEST, torsoBody()),
    );
    if (!outerResult.ok) throw new Error(`${outerResult.code}: ${outerResult.detail}`);
    expect(outerResult.mesh.receipt.garmentKind).toBe("outer-long");
    expect(outerResult.mesh.receipt.slot).toBe("outer");
  });

  it("베이크는 결정적이다 — 같은 입력은 같은 출력 해시를 낸다", () => {
    const topology = createTopology("top", REST_CHEST, torsoBody());
    const first = bakeStudioVrmXpbdGarmentPose(
      topology,
      bakeInput(topology, CURRENT_CHEST, torsoBody()),
    );
    const second = bakeStudioVrmXpbdGarmentPose(
      topology,
      bakeInput(topology, CURRENT_CHEST, torsoBody()),
    );
    if (!first.ok || !second.ok) throw new Error("bake failed");
    expect(second.mesh.receipt.outputSha256).toBe(first.mesh.receipt.outputSha256);
    expect(second.mesh.receipt.receiptSha256).toBe(first.mesh.receipt.receiptSha256);
  });

  it("오래된 포즈 세대나 토폴로지 해시는 stale-input 으로 거절된다", () => {
    const topology = createTopology("top", REST_CHEST, torsoBody());
    const stale = bakeStudioVrmXpbdGarmentPose(
      topology,
      bakeInput(topology, CURRENT_CHEST, torsoBody(), {
        expectedPoseGeneration: 6,
        poseGeneration: 7,
      }),
    );
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.code).toBe("stale-input");
    const wrongHash = bakeStudioVrmXpbdGarmentPose(
      topology,
      bakeInput(topology, CURRENT_CHEST, torsoBody(), { expectedTopologySha256: "0".repeat(64) }),
    );
    expect(wrongHash.ok).toBe(false);
    if (!wrongHash.ok) expect(wrongHash.code).toBe("stale-input");
  });

  it("팬츠 베이크에 종아리 캡슐이 없으면 missing-input 이다", () => {
    const topology = createTopology("bottom-pants", REST_WAIST, legBody());
    const body = legBody();
    const result = bakeStudioVrmXpbdGarmentPose(
      topology,
      bakeInput(topology, CURRENT_WAIST, {
        hips: body.hips,
        leftThigh: body.leftThigh,
        rightThigh: body.rightThigh,
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("missing-input");
  });
});
