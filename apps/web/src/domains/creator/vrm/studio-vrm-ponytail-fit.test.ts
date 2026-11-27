import * as THREE from "three";
import { describe, expect, it } from "vitest";

import fixtureFile from "./__fixtures__/studio-vrm-head-profiles.json";
import { mergeStudioVrmAuthoredHairGeometry } from "./studio-vrm-authored-hair-geometry";
import { applyAvatarForgeHairStyleRecipe, buildAvatarForgeHairParts, createAvatarForgeState } from "./studio-vrm-avatar-forge";
import { avatarForgeHairInstance, expandAvatarForgeHairPartsForRender, fitAvatarForgeHairParts } from "./studio-vrm-avatar-forge-hair-object";
import { resolveStudioVrmHeadFit, type StudioVrmHeadFitInput } from "./studio-vrm-head-fit";

const models = (fixtureFile as unknown as { models: (StudioVrmHeadFitInput & { id: string })[] }).models;

describe("포니테일 매듭과 가닥 피팅", () => {
  it.each(["sample-vrm", "shion", "quaternius-modular-female-casual"])("%s 두상에서 묶음 높이와 모발 굵기가 달라도 뿌리가 매듭 안에 남는다", (id) => {
    const fit = resolveStudioVrmHeadFit(models.find((model) => model.id === id)!);
    const pony = applyAvatarForgeHairStyleRecipe(createAvatarForgeState(), "ponytail");

    for (const tailHeight of [0, 0.5, 1]) {
      for (const shape of [{}, { volume: 0.72, strandWidth: 1.45 }]) {
        const state = { ...pony, hair: { ...pony.hair, ...shape, tailHeight } };
        const parts = expandAvatarForgeHairPartsForRender(buildAvatarForgeHairParts(state), state.hair);
        const fitted = fitAvatarForgeHairParts(parts, fit);
        const knot = fitted.find(({ part }) => part.id === "pony-root")!;
        const tail = fitted.find(({ part }) => part.id === "pony-tail")!;
        const authored = avatarForgeHairInstance(tail.part, fit);
        const root = new THREE.Vector3(0, 1, 0).applyMatrix4(tail.matrix);
        const tip = new THREE.Vector3(0, -1, 0).applyMatrix4(tail.matrix);
        const authoredLength = 2 * new THREE.Vector3().setFromMatrixScale(authored.matrix).y;
        expect(root.distanceTo(tip)).toBeCloseTo(authoredLength, 8);
        expect((tip.z - root.z) * fit.frontSign).toBeLessThan(0);

        const geometry = mergeStudioVrmAuthoredHairGeometry([tail])!;
        const unpinched = mergeStudioVrmAuthoredHairGeometry([{ ...tail, rootGirthScale: 1 }])!;
        const positions = geometry.getAttribute("position");
        const original = unpinched.getAttribute("position");
        const uv = geometry.getAttribute("uv");
        const toKnot = knot.matrix.clone().invert();
        const vertex = new THREE.Vector3();
        const other = new THREE.Vector3();
        let rootVertices = 0;
        let outermostRoot = 0;
        let bodyShift = 0;
        for (let i = 0; i < positions.count; i++) {
          vertex.fromBufferAttribute(positions, i);
          if (uv.getY(i) === 0) {
            rootVertices++;
            outermostRoot = Math.max(outermostRoot, vertex.applyMatrix4(toKnot).length());
          } else if (uv.getY(i) >= 0.2) {
            bodyShift = Math.max(bodyShift, vertex.distanceTo(other.fromBufferAttribute(original, i)));
          }
        }
        geometry.dispose();
        unpinched.dispose();
        expect(rootVertices).toBeGreaterThan(0);
        expect(outermostRoot).toBeLessThan(1);
        expect(bodyShift).toBe(0);
      }
    }
  });
});
