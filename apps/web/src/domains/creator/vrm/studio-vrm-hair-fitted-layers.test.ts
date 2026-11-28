import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { mergeStudioVrmAuthoredHairGeometry } from "./studio-vrm-authored-hair-geometry";
import { applyAvatarForgeHairStyleRecipe, buildAvatarForgeHairParts, createAvatarForgeState, type AvatarForgeHairStyle } from "./studio-vrm-avatar-forge";
import { expandAvatarForgeHairPartsForRender, fitAvatarForgeHairParts } from "./studio-vrm-avatar-forge-hair-object";
import type { StudioVrmHeadFit } from "./studio-vrm-head-fit";

const head: StudioVrmHeadFit = {
  source: "mesh", center: [0, 0.09, 0], radiusX: 0.1, radiusY: 0.13, radiusZ: 0.115,
  frontSign: 1, eyeCenter: [0, 0.06, 0.08], faceFront: 0.1,
};

function fitCut(style: AvatarForgeHairStyle, fit = head) {
  const state = applyAvatarForgeHairStyleRecipe(createAvatarForgeState(), style);
  return fitAvatarForgeHairParts(buildAvatarForgeHairParts(state, expandAvatarForgeHairPartsForRender), fit);
}

describe("두상 맞춤 헤어 레이어", () => {
  it("픽시는 귀 위를 자르고 앞머리의 가로 쓸림을 살린다", () => {
    const short = fitCut("short");
    const pixie = fitCut("pixie");
    const brim = (cut: typeof pixie) => {
      const cap = cut.find(({ part }) => part.role === "cap")!;
      const mesh = mergeStudioVrmAuthoredHairGeometry([cap])!;
      const y = mesh.getAttribute("position").getY(mesh.getAttribute("position").count - 1);
      mesh.dispose();
      return y;
    };
    expect(brim(pixie) - brim(short)).toBeGreaterThan(0.18 * head.radiusY);
    const wisps = (cut: typeof pixie) => cut.find(({ part }) => part.id === "cheek-wisp-right")!.spine!.points;
    expect(wisps(pixie).at(-1)!.y - wisps(short).at(-1)!.y).toBeGreaterThan(0.35 * head.radiusY);
    const fringe = pixie.find(({ part }) => part.id === "bang-sweep-fill-center")!.spine!.points;
    expect(fringe.at(-1)!.x - fringe[0]!.x).toBeGreaterThan(0.28 * head.radiusX);
  });

  it("외땋기와 양갈래땋기는 매듭부터 마지막 마디까지 끊김 없이 맞물린다", () => {
    for (const style of ["braid", "twin-braid"] as const) {
      const cut = fitCut(style);
      for (const tie of cut.filter(({ part }) => part.role === "bun")) {
        const prefix = tie.part.id.replace(/tie$/, "seg-");
        const chain = [tie, ...cut.filter(({ part }) => part.id.startsWith(prefix))];
        expect(chain.length).toBeGreaterThan(4);
        for (let i = 1; i < chain.length; i++) {
          const matrices = [chain[i - 1]!.matrix, chain[i]!.matrix];
          const [a, b] = matrices.map((m) => new THREE.Vector3().setFromMatrixPosition(m));
          const inverse = matrices.map((m) => m.clone().invert());
          const overlap = Array.from({ length: 51 }, (_, sample) => a!.clone().lerp(b!, sample / 50))
            .some((p) => inverse.every((m) => p.clone().applyMatrix4(m).length() <= 1));
          expect(overlap, chain[i]!.part.id).toBe(true);
        }
      }
    }
  });

  it("앞·옆·뒤 가닥의 시작 단면을 좁히고 VRM0과 VRM1의 흐름을 같은 방향으로 맞춘다", () => {
    const positive = fitCut("long");
    const negative = fitCut("long", { ...head, frontSign: -1 });
    for (const id of ["bang-curtain-temple-left", "side-left", "back-drape-center"]) {
      const a = positive.find(({ part }) => part.id === id);
      const b = negative.find(({ part }) => part.id === id);
      expect(a?.rootGirthScale).toBeLessThan(0.1);
      if (!a?.spine || !b?.spine) throw new Error(id);
      expect(b.spine.points).toHaveLength(a.spine.points.length);
      a.spine.points.forEach((point, i) => {
        expect(b.spine?.points[i]?.distanceTo(new THREE.Vector3(-point.x, point.y, -point.z))).toBeLessThan(1e-6);
      });
    }
  });

  it("양갈래가 어깨 높이에서 뒤통수 뒤로 흐르고 울프컷의 목덜미가 본체에 이어진다", () => {
    for (const frontSign of [1, -1] as const) {
      const tails = fitCut("twintail", { ...head, frontSign }).filter(({ part }) => part.role === "tail");
      expect(tails).toHaveLength(2);
      for (const tail of tails) {
        const shoulder = tail.spine?.points.filter((point) => point.y < head.center[1] - 1.25 * head.radiusY);
        expect(shoulder?.length).toBeGreaterThan(0);
        for (const point of shoulder ?? []) expect(point.z * frontSign).toBeLessThan(-1.4 * head.radiusZ);
      }
    }
    const nape = fitCut("wolf");
    expect(nape.find(({ part }) => part.id === "wolf-layer")?.drapeLength).toBeGreaterThan(1);
    expect(nape.filter(({ part, spine }) => part.id.startsWith("wolf-nape-") && spine)).toHaveLength(3);
  });

  it("단발은 롱보다 턱에 가깝고 뒷머리 아래가 넓은 시점 범위에서 하나의 면으로 이어진다", () => {
    const bob = fitCut("bob").find(({ drapeLength }) => drapeLength !== undefined);
    const long = fitCut("long").find(({ drapeLength }) => drapeLength !== undefined);
    if (!bob?.drapeLength || !long?.drapeLength) throw new Error("뒷머리 안쪽 층 누락");
    expect(bob.drapeLength).toBeLessThan(long.drapeLength * 0.65);
    const geometry = mergeStudioVrmAuthoredHairGeometry([bob]);
    if (!geometry) throw new Error("드레이프 병합 실패");
    const material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
    const mesh = new THREE.Mesh(geometry, material);
    // 관자 쪽 밑단은 짧게 잘리므로 모든 방위가 공유하는 드레이프 중단에서 빈틈을 잰다.
    const origin = new THREE.Vector3(0, head.center[1] - head.radiusY * bob.drapeLength * 0.55, 0);
    for (let degrees = 90; degrees <= 270; degrees += 10) {
      const angle = THREE.MathUtils.degToRad(degrees);
      const direction = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
      const ray = new THREE.Raycaster(origin.clone().addScaledVector(direction, 0.4), direction.negate(), 0, 0.4);
      expect(ray.intersectObject(mesh).length, String(degrees)).toBeGreaterThan(0);
    }
    material.dispose();
    geometry.dispose();
  });
});
