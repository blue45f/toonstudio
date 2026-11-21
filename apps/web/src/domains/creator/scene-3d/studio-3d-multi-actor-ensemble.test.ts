import { describe, expect, it } from "vitest";

import {
  MAX_ENSEMBLE_ACTORS,
  addActorToEnsembleStage,
  attachPropToActorJoint,
  buildEnsembleComicLighting,
  createEmptyEnsembleStage,
  evaluateEnsemblePropTransforms,
  solveInterActorContactConstraints,
} from "./studio-3d-multi-actor-ensemble";

describe("studio-3d-multi-actor-ensemble", () => {
  it("enforces max 6 actors cleanly and computes 3-point comic lighting around centroid", () => {
    let stage = createEmptyEnsembleStage("action-hard-rim");
    for (let i = 0; i < MAX_ENSEMBLE_ACTORS; i += 1) {
      const res = addActorToEnsembleStage(stage, {
        id: `actor-${i + 1}`,
        labelKo: `인물 ${i + 1}`,
        rootPosition: [i * 0.8, 0, 0],
        yawRad: 0,
        heightM: 1.72,
        jointWorldOffsets: {},
      });
      expect(res.ok).toBe(true);
      if (res.ok) stage = res.stage;
    }

    const overflow = addActorToEnsembleStage(stage, {
      id: "actor-7",
      labelKo: "인물 7",
      rootPosition: [5, 0, 0],
      yawRad: 0,
      heightM: 1.7,
      jointWorldOffsets: {},
    });
    expect(overflow.ok).toBe(false);

    const lighting = buildEnsembleComicLighting(stage, [0, 0, -1]);
    expect(lighting.lights).toHaveLength(3);
    expect(lighting.lights[0].castShadow).toBe(true);
    expect(lighting.lights[2].role).toBe("rim");
    expect(lighting.ensembleCentroid[0]).toBeCloseTo(2.0, 4);
  });

  it("solves inter-actor handshake & collar-grab contacts and attaches props to joints", () => {
    let stage = createEmptyEnsembleStage("drama-soft");
    const a1 = addActorToEnsembleStage(stage, {
      id: "hero",
      labelKo: "주인공",
      rootPosition: [0, 0, 0],
      yawRad: 0,
      heightM: 1.78,
      jointWorldOffsets: {},
    });
    if (a1.ok) stage = a1.stage;

    const a2 = addActorToEnsembleStage(stage, {
      id: "rival",
      labelKo: "라이벌",
      rootPosition: [0, 0, 0.9],
      yawRad: Math.PI,
      heightM: 1.8,
      jointWorldOffsets: {},
    });
    if (a2.ok) stage = a2.stage;

    stage = {
      ...stage,
      contacts: [
        { id: "c-shake", kind: "handshake", actorAId: "hero", actorBId: "rival", strength: 1 },
        { id: "c-collar", kind: "collar-grab", actorAId: "hero", actorBId: "rival", strength: 1 },
      ],
    };

    const solved = solveInterActorContactConstraints(stage);
    expect(solved).toHaveLength(2);
    const shake = solved[0];
    const handDist = Math.hypot(
      shake.actorATargetWorld[0] - shake.actorBTargetWorld[0],
      shake.actorATargetWorld[1] - shake.actorBTargetWorld[1],
      shake.actorATargetWorld[2] - shake.actorBTargetWorld[2],
    );
    expect(handDist).toBeCloseTo(0.036, 3);

    const collar = solved[1];
    expect(collar.suggestedTorsoPullB[2]).toBeLessThan(0);

    stage = attachPropToActorJoint(stage, {
      propId: "prop-katana",
      labelKo: "장검",
      actorId: "hero",
      jointSlot: "rightHand",
      localOffsetM: [0, 0.05, 0.12],
      propCategory: "sword",
    });
    const propTransforms = evaluateEnsemblePropTransforms(stage);
    expect(propTransforms).toHaveLength(1);
    expect(propTransforms[0].recommendedHandPose).toBe("holding");
    expect(propTransforms[0].worldPosition[2]).toBeGreaterThan(0.3);
  });
});
