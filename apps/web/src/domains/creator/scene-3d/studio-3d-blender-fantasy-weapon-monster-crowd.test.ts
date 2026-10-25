import { describe, expect, it } from "vitest";

import {
  BLENDER_FANTASY_CROWD_PRESETS,
  BLENDER_FANTASY_MONSTER_PRESETS,
  BLENDER_FANTASY_WEAPON_PRESETS,
  simulateBlenderGeometryNodesBoidCrowd,
  solveBlenderItascMultiLimbMonsterIk,
  solveBlenderWeaponConstraintRig,
} from "./studio-3d-blender-fantasy-weapon-monster-crowd";

describe("studio-3d-blender-fantasy-weapon-monster-crowd", () => {
  it("solves ChildOf, FollowPath, TrackTo, and ActionConstraint for fantasy weapons and 12-sword arrays", () => {
    const swordArrayPreset = BLENDER_FANTASY_WEAPON_PRESETS.find(
      (p) => p.id === "celestial-floating-sword-array",
    )!;
    const dormant = solveBlenderWeaponConstraintRig({
      preset: swordArrayPreset,
      childOfInfluence: 0.2,
      awakeningFactor: 0.0,
      orbitPhase: 0.0,
      targetPosition: [0, 1.5, 10],
    });
    const awakened = solveBlenderWeaponConstraintRig({
      preset: swordArrayPreset,
      childOfInfluence: 0.2,
      awakeningFactor: 1.0,
      orbitPhase: 0.25,
      targetPosition: [0, 1.5, 10],
    });

    expect(dormant.blades).toHaveLength(12);
    expect(awakened.blades).toHaveLength(12);
    expect(awakened.totalRunePowerWatts).toBeGreaterThan(dormant.totalRunePowerWatts);
    expect(awakened.boundingRadiusMeters).toBeGreaterThan(dormant.boundingRadiusMeters);
    // TrackTo aims forward (+Z toward [0, 1.5, 10])
    expect(awakened.blades[0]!.aimDirection[2]).toBeGreaterThan(0.8);
  });

  it("solves Blender iTaSC multi-limb Jacobian IK and RotLimitConstraint for dragons and arachnids", () => {
    for (const monster of BLENDER_FANTASY_MONSTER_PRESETS) {
      const idleSolve = solveBlenderItascMultiLimbMonsterIk(monster, "idle-menace", 0);
      const wingBreathSolve = solveBlenderItascMultiLimbMonsterIk(
        monster,
        "wing-buffet-breath",
        0.2,
      );

      expect(idleSolve.solvedLimbs).toHaveLength(monster.limbs.length);
      expect(idleSolve.jacobianConverged).toBe(true);
      expect(wingBreathSolve.coreAuraIntensity).toBeGreaterThan(
        idleSolve.coreAuraIntensity,
      );

      for (let i = 0; i < monster.limbs.length; i++) {
        const spec = monster.limbs[i]!;
        const chain = wingBreathSolve.solvedLimbs[i]!;
        for (const angle of chain.clampedJointAnglesDeg) {
          expect(angle).toBeGreaterThanOrEqual(spec.minJointAngleDeg);
          expect(angle).toBeLessThanOrEqual(spec.maxJointAngleDeg);
        }
      }
    }
  });

  it("simulates GeometryNodes InstanceReference LODs and BoidBrain crowd/army rules", () => {
    for (const crowdPreset of BLENDER_FANTASY_CROWD_PRESETS) {
      const result = simulateBlenderGeometryNodesBoidCrowd(crowdPreset, 80, 1.2);
      expect(result.presetId).toBe(crowdPreset.id);
      expect(result.totalAgents).toBe(80);
      expect(
        result.lodCounts.lod0 + result.lodCounts.lod1 + result.lodCounts.lod2,
      ).toBe(80);
      expect(
        result.stateCounts.marching +
          result.stateCounts.charging +
          result.stateCounts.engagedCombat +
          result.stateCounts.evading,
      ).toBe(80);
      expect(result.vramReductionPercent).toBeGreaterThan(50);
    }

    // Two-faction siege clash should produce both ALLIED and HOSTILE agents and combat states
    const siegePreset = BLENDER_FANTASY_CROWD_PRESETS.find(
      (p) => p.id === "citadel-siege-battlefield-clash",
    )!;
    const siegeResult = simulateBlenderGeometryNodesBoidCrowd(siegePreset, 100, 1.0);
    const alliedCount = siegeResult.agents.filter((a) => a.faction === "ALLIED").length;
    const hostileCount = siegeResult.agents.filter((a) => a.faction === "HOSTILE").length;
    expect(alliedCount).toBe(50);
    expect(hostileCount).toBe(50);
    expect(
      siegeResult.stateCounts.engagedCombat + siegeResult.stateCounts.charging,
    ).toBeGreaterThan(0);
  });
});
