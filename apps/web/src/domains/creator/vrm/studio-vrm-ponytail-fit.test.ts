import * as THREE from "three";
import { describe, expect, it } from "vitest";

import fixtureFile from "./__fixtures__/studio-vrm-head-profiles.json";
import { mergeStudioVrmAuthoredHairGeometry } from "./studio-vrm-authored-hair-geometry";
import { applyAvatarForgeHairStyleRecipe, buildAvatarForgeHairParts, createAvatarForgeState, type AvatarForgeHairParams } from "./studio-vrm-avatar-forge";
import { avatarForgeHairInstance, expandAvatarForgeHairPartsForRender, fitAvatarForgeHairParts } from "./studio-vrm-avatar-forge-hair-object";
import { resolveStudioVrmHeadFit, type StudioVrmHeadFit, type StudioVrmHeadFitInput } from "./studio-vrm-head-fit";

const models = (fixtureFile as unknown as { models: (StudioVrmHeadFitInput & { id: string })[] }).models;

function samplePonytail(fit: StudioVrmHeadFit, params: Partial<AvatarForgeHairParams> = {}) {
  const pony = applyAvatarForgeHairStyleRecipe(createAvatarForgeState(), "ponytail");
  const state = { ...pony, hair: { ...pony.hair, ...params } };
  const parts = expandAvatarForgeHairPartsForRender(buildAvatarForgeHairParts(state), state.hair);
  const tail = fitAvatarForgeHairParts(parts, fit).find(({ part }) => part.id === "pony-tail")!;
  const geometry = mergeStudioVrmAuthoredHairGeometry([tail])!;
  const positions = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const left = new Map<number, THREE.Vector3>();
  const right = new Map<number, THREE.Vector3>();
  let bodySkullRadius = Infinity;
  for (let i = 0; i < positions.count; i++) {
    const t = uv.getY(i);
    const p = new THREE.Vector3().fromBufferAttribute(positions, i);
    if (uv.getX(i) === 0) left.set(t, p);
    if (uv.getX(i) === 1) right.set(t, p);
    if (t >= 0.2) {
      bodySkullRadius = Math.min(bodySkullRadius, Math.hypot(
        (p.x - fit.center[0]) / fit.radiusX, (p.y - fit.center[1]) / fit.radiusY, (p.z - fit.center[2]) / fit.radiusZ,
      ));
    }
  }
  geometry.dispose();
  const samples = [...left.keys()].sort((a, b) => a - b).map(t => ({
    t, center: left.get(t)!.clone().lerp(right.get(t)!, 0.5), width: left.get(t)!.distanceTo(right.get(t)!),
  }));
  const root = samples[0]!.center;
  const end = samples[samples.length - 1]!.center;
  const length = root.distanceTo(end);
  const offsets = samples.map(({ center, t }) => center.clone().sub(root.clone().lerp(end, t)));
  return {
    length, bodySkullRadius, samples,
    maxBend: Math.max(...offsets.map(offset => offset.length())),
    rearBend: Math.max(...offsets.map(offset => -fit.frontSign * offset.z)),
  };
}

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

  it.each(["sample-vrm", "shion"])("%s에서 컬은 선택한 길이에 비례하고 굵기 조작은 단면만 바꾼다", (id) => {
    const fit = resolveStudioVrmHeadFit(models.find((model) => model.id === id)!);
    const curved = samplePonytail(fit);
    const straight = samplePonytail(fit, { curl: 0, wave: 0 });
    expect(straight.maxBend).toBeLessThan(1e-6);
    expect(curved.rearBend / curved.length).toBeGreaterThan(0.015);
    expect(curved.length).toBeCloseTo(straight.length, 6);
    expect(curved.maxBend / curved.length).toBeLessThan(0.06);
    expect(curved.bodySkullRadius).toBeGreaterThan(1);
    for (let i = 0; i < curved.samples.length; i++) {
      expect(curved.samples[i]!.width).toBeCloseTo(straight.samples[i]!.width, 6);
      if (i > 0) expect(curved.samples[i]!.center.y).toBeLessThan(curved.samples[i - 1]!.center.y);
    }

    const thin = samplePonytail(fit, { strandWidth: 0.68 });
    const thick = samplePonytail(fit, { strandWidth: 1.45 });
    expect(thin.maxBend).toBeCloseTo(thick.maxBend, 6);
    const mid = Math.floor(thin.samples.length / 2);
    expect(thick.samples[mid]!.width).toBeGreaterThan(thin.samples[mid]!.width * 1.9);
    const short = samplePonytail(fit, { length: 0.55 });
    const long = samplePonytail(fit, { length: 1.7 });
    expect(long.length).toBeGreaterThan(short.length * 3);
    expect(long.rearBend / long.length).toBeCloseTo(short.rearBend / short.length, 4);
  });
});
