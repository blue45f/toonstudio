import { describe, expect, it } from "vitest";

import { HUMANOID_BONE_NAMES, PHYSICS_BUDGET, SLOT_PRESET_IDS, paramMorphName, validateMeshPartData } from "../../contracts";
import { fnv1a64HexBytes } from "../../shared/hash";

import { scalpSurfaceFixture } from "./fixtures";
import {
  HEAD_BONE_INDEX,
  OUTFIT_AUX_BONE_INDEX_BASE,
  SHAPER_HAIR_BASE_ZONE_CALIBRATIONS,
  SHAPER_HAIR_JOINT_SPEC,
  SHAPER_HAIR_PHYSICS_LERP,
  SHAPER_HAIR_RIDGE_SHARPNESS,
  alignShaperHairControlRotations,
  applyShaperHairAddShortcutAdjustment,
  assumedHeadPivot,
  buildHair,
  buildPlantedHairControlChain,
  buildShaperHairStrandTube,
  computeShaperHairBaseUvTransform,
  computeShaperSymmetricRay,
  evaluateShaperHairSplinePoint,
  hairStrands,
  mirrorShaperHairRootAngles,
  reanchorPlantedHairRoot,
  sampleShaperHairSpline,
  simulateShaperHairPhysicsStep,
} from "./hair-builder";
import { HAIR_STYLE_SPECS, hairChainBudget } from "./hair-styles";

import type { HairStyleId, OutfitBuildContext, OutfitBuildResult } from "../../contracts";

const STYLES: readonly HairStyleId[] = SLOT_PRESET_IDS.hair;

function context(seed = 7, headSize = 1): OutfitBuildContext {
  return {
    seed,
    headSize,
    colors: { skin: "#f1c9a5", iris: "#3a5a98", hair: "#2b1d12", brow: "#2b1d12", top: "#ffffff", bottom: "#223355", shoes: "#111111", accessory: "#aa3344" },
  };
}

function resultBytes(result: OutfitBuildResult): string {
  const chunks = result.parts.flatMap((part) => [part.positions, part.normals, part.uvs, ...part.morphs.map((m) => m.deltaPositions)]);
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return fnv1a64HexBytes(new Uint8Array(merged.buffer));
}

describe("outfit/hair-builder", () => {
  it("7 스타일 모두 메시 유효성(validateMeshPartData)·partId 0·role hair·헤어 색 키를 만족한다", () => {
    const scalp = scalpSurfaceFixture();
    for (const style of STYLES) {
      const result = buildHair(style, scalp, context());
      expect(result.parts.length).toBe(2);
      for (const [index, part] of result.parts.entries()) {
        expect(part.partId).toBe(0);
        expect(part.materialId).toBe(0);
        expect(part.role).toBe("hair");
        expect(part.colorKey).toBe("hair");
        expect(part.materialPreset).toBe("hair-aniso");
        expect(part.morphs.map((m) => m.name)).toEqual([paramMorphName("headSize", "+"), paramMorphName("headSize", "-")]);
        const failure = validateMeshPartData({ ...part, partId: index + 1 });
        expect(failure, `${style}/${part.id}: ${failure?.reasonKo ?? ""}`).toBeNull();
        expect(part.indices.length).toBeGreaterThan(0);
      }
    }
  });

  it("앵커가 두피 근방이고 스트랜드가 두피 안으로 들어가지 않으며 머리 크기에 추종한다", () => {
    const base = scalpSurfaceFixture();
    const big = scalpSurfaceFixture(1.2);
    for (const style of STYLES) {
      const strands = hairStrands(style, base, 7);
      expect(strands.length).toBe(HAIR_STYLE_SPECS[style].zones.reduce((n, z) => n + z.count, 0));
      for (const strand of strands) {
        const root = strand.points[0];
        const rootDist = Math.hypot(root[0] - base.center[0], root[1] - base.center[1], root[2] - base.center[2]);
        expect(Math.abs(rootDist - base.radius)).toBeLessThan(base.radius * 0.1);
        for (const p of strand.points) {
          const d = Math.hypot(p[0] - base.center[0], p[1] - base.center[1], p[2] - base.center[2]);
          expect(d).toBeGreaterThanOrEqual(base.radius * 1.01 - 1e-6);
        }
      }
      const bigStrands = hairStrands(style, big, 7);
      const bigRoot = bigStrands[0].points[0];
      const bigDist = Math.hypot(bigRoot[0] - big.center[0], bigRoot[1] - big.center[1], bigRoot[2] - big.center[2]);
      expect(bigDist).toBeGreaterThan(base.radius * 1.1);
    }
  });

  it("체인 구역은 보조 본 hair_<style>_<i>_<j>·ChainAnchor를 만들고 예산 안이며 스킨 인덱스 규약을 지킨다", () => {
    const scalp = scalpSurfaceFixture();
    for (const style of STYLES) {
      const result = buildHair(style, scalp, context());
      const budget = hairChainBudget(HAIR_STYLE_SPECS[style]);
      expect(result.chains.length).toBe(budget.chains);
      expect(result.chains.length).toBeGreaterThan(0);
      expect(result.chains.length).toBeLessThanOrEqual(PHYSICS_BUDGET.maxChains - 16);
      let particles = 0;
      for (const chain of result.chains) {
        expect(chain.role).toBe("hair");
        expect(chain.boneNames.length).toBe(chain.restPoints.length);
        expect(chain.boneNames.length).toBeLessThanOrEqual(PHYSICS_BUDGET.maxParticlesPerChain);
        particles += chain.boneNames.length;
        chain.boneNames.forEach((name, j) => {
          expect(name).toMatch(new RegExp(`^hair_${style}_\\d+_${j}$`, "u"));
        });
      }
      expect(particles).toBe(budget.particles);
      expect(particles).toBeLessThanOrEqual(PHYSICS_BUDGET.maxChainParticles);
      expect(result.bones.length).toBe(particles);
      const names = new Set(result.bones.map((b) => b.name));
      expect(names.size).toBe(result.bones.length);
      for (const bone of result.bones) {
        expect(bone.auxiliary).toBe(true);
        expect(bone.parent === "head" || names.has(bone.parent ?? "")).toBe(true);
      }
      // 루트 본 restTranslation + 추정 피벗 = 체인 rest 첫 점
      const pivot = assumedHeadPivot(scalp);
      for (const chain of result.chains) {
        const root = result.bones.find((b) => b.name === chain.boneNames[0]);
        expect(root?.parent).toBe("head");
        expect(root?.restTranslation[1]).toBeCloseTo(chain.restPoints[0][1] - pivot[1], 6);
      }
      // 스킨: 보조 본 인덱스는 55 + bones 범위 안, 그 외는 head
      const strands = result.parts[1];
      const joints = strands.jointIndices as Uint16Array;
      for (let i = 0; i < joints.length; i += 1) {
        const j = joints[i];
        if (j >= OUTFIT_AUX_BONE_INDEX_BASE) expect(j - OUTFIT_AUX_BONE_INDEX_BASE).toBeLessThan(result.bones.length);
        else expect(j === HEAD_BONE_INDEX || j === 0).toBe(true);
      }
      expect(OUTFIT_AUX_BONE_INDEX_BASE).toBe(HUMANOID_BONE_NAMES.length);
    }
  });

  it("같은 입력은 같은 바이트, 시드가 다르면 다른 바이트(결정성)", () => {
    const scalp = scalpSurfaceFixture();
    for (const style of STYLES) {
      const a = buildHair(style, scalp, context(7));
      const b = buildHair(style, scalp, context(7));
      const c = buildHair(style, scalp, context(8));
      expect(resultBytes(a)).toBe(resultBytes(b));
      expect(resultBytes(a)).not.toBe(resultBytes(c));
      expect(a.chains.map((ch) => ch.id)).toEqual(b.chains.map((ch) => ch.id));
    }
  });

  it("twin-tail은 Blender kit 밖이며 번들 2개가 좌우 대칭 방위에 있다", () => {
    expect(HAIR_STYLE_SPECS["twin-tail"].blenderKit).toBe(false);
    const bundles = HAIR_STYLE_SPECS["twin-tail"].zones.filter((z) => z.kind === "bundle");
    expect(bundles.length).toBe(2);
    expect(bundles.map((z) => z.gather?.azimuth)).toEqual([115, 245]);
    const scalp = scalpSurfaceFixture();
    const strands = hairStrands("twin-tail", scalp, 1).filter((s) => s.kind === "bundle");
    expect(strands.length).toBe(8);
    const left = strands.slice(0, 4).map((s) => s.points[0][0]);
    const right = strands.slice(4).map((s) => s.points[0][0]);
    expect(Math.min(...left)).toBeGreaterThan(0);
    expect(Math.max(...right)).toBeLessThan(0);
  });

  describe("SHAPER 텐션 카디널 스플라인 헤어 튜브 및 반-샤프 능선(HairData)", () => {
    it("선형-외삽 하이브리드 스플라인 C(t) = 0.5*L(t) + 0.5*E(t)는 양 끝점을 통과하고 곡률을 반영한다", () => {
      const p0 = [0, 0, 0] as const;
      const p1 = [1, 1, 0] as const;
      const p2 = [2, 1, 0] as const;
      const p3 = [3, 0, 0] as const;
      expect(evaluateShaperHairSplinePoint(p0, p1, p2, p3, 0)).toEqual([1, 1, 0]);
      expect(evaluateShaperHairSplinePoint(p0, p1, p2, p3, 1)).toEqual([2, 1, 0]);
      const mid = evaluateShaperHairSplinePoint(p0, p1, p2, p3, 0.5);
      // L(0.5) = [1.5, 1.0, 0], E(0.5) = [1.5, 1.25, 0] -> C(0.5) = [1.5, 1.125, 0]
      expect(mid[0]).toBeCloseTo(1.5, 6);
      expect(mid[1]).toBeCloseTo(1.125, 6);

      const sampled = sampleShaperHairSpline(
        [{ position: p0 }, { position: p1 }, { position: p2 }],
        4,
      );
      expect(sampled.length).toBe(9);
      expect(sampled[0].center).toEqual(p0);
      expect(sampled[4].center).toEqual(p1);
      expect(sampled[8].center).toEqual(p2);
    });

    it("사인 곡선 테이퍼링과 다이아몬드 양옆 능선(k=0,2) power=0.8 및 모근/끝점 power=1.0을 부여한다", () => {
      expect(SHAPER_HAIR_RIDGE_SHARPNESS).toBeCloseTo(0.8, 6);
      const tube = buildShaperHairStrandTube({
        controlPoints: [
          { position: [0, 1.6, 0] },
          { position: [0, 1.4, 0.05] },
          { position: [0, 1.2, 0.02] },
        ],
        stepsPerSegment: 2,
        sharp: true,
      });
      // ringCount = 5 (0..4)
      expect(tube.ringTaperFactors.length).toBe(5);
      expect(tube.ringTaperFactors[0]).toBeCloseTo(0, 6);
      expect(tube.ringTaperFactors[2]).toBeCloseTo(1, 6);
      expect(tube.ringTaperFactors[4]).toBeCloseTo(0, 6);

      // 모근(r=0)과 끝점(r=4)은 모두 1.0
      for (let k = 0; k < 4; k += 1) {
        expect(tube.vertexSharpness[k]).toBe(1.0);
        expect(tube.vertexSharpness[4 * 4 + k]).toBe(1.0);
      }
      // 중간 링(r=2): k=0, 2는 0.8(능선), k=1, 3은 0.0
      expect(tube.vertexSharpness[2 * 4 + 0]).toBeCloseTo(0.8, 6);
      expect(tube.vertexSharpness[2 * 4 + 1]).toBe(0.0);
      expect(tube.vertexSharpness[2 * 4 + 2]).toBeCloseTo(0.8, 6);
      expect(tube.vertexSharpness[2 * 4 + 3]).toBe(0.0);
    });

    it("준-정적 물리 스텝(PhysicsStart): 0.2 보간 및 두상 구체 콜라이더 반경 밖 밀어내기를 수행한다", () => {
      expect(SHAPER_HAIR_PHYSICS_LERP).toBeCloseTo(0.2, 6);
      const stepped = simulateShaperHairPhysicsStep({
        points: [
          [0, 1.6, 0.12],
          [0, 1.5, 0.05], // 두상 중심 [0, 1.5, 0] 반경 0.1 안으로 침투
        ],
        gravityStep: [0, -0.05, 0],
        headCollider: { center: [0, 1.5, 0], radius: 0.1 },
      });
      expect(stepped[0]).toEqual([0, 1.6, 0.12]);
      const distFromHead = Math.hypot(
        stepped[1][0] - 0,
        stepped[1][1] - 1.5,
        stepped[1][2] - 0,
      );
      expect(distFromHead).toBeGreaterThanOrEqual(0.1 - 1e-6);
    });

    it("HairBaseData 4-구간 두피(Scalp) UV 변환(_Tex0_ST.._Tex3_ST)을 SHAPER 수식 그대로 계산한다", () => {
      expect(SHAPER_HAIR_BASE_ZONE_CALIBRATIONS[0].yOrg).toBeCloseTo(-0.36, 6);
      const uv0 = computeShaperHairBaseUvTransform({
        zone: 0,
        xUi: 1.0,
        yUi: 2.0,
        widthUi: 0.8,
        heightUi: 0.5,
      });
      // w = 2 - 0.8 = 1.2, h = 2 - 0.5 = 1.5
      // tx0 = 0 + 1 * 0.01 = 0.01 -> tx = 1.2 * 0.01 + 0.5 * (1 - 1.2) = 0.012 - 0.1 = -0.088
      // ty0 = -0.36 + 2 * (-0.05) = -0.46 -> ty = 1.5 * (-0.46) + 0.5 * (1 - 1.5) = -0.69 - 0.25 = -0.94
      expect(uv0.uniformName).toBe("_Tex0_ST");
      expect(uv0.scaleW).toBeCloseTo(1.2, 6);
      expect(uv0.scaleH).toBeCloseTo(1.5, 6);
      expect(uv0.offsetTx).toBeCloseTo(-0.088, 6);
      expect(uv0.offsetTy).toBeCloseTo(-0.94, 6);
    });

    it("인터랙티브 헤어 심기(CreateHair), 회전 스무딩(AlignHairRotation), 모근 재앵커링(AlignHairsByPartMesh)을 수행한다", () => {
      const chain = buildPlantedHairControlChain({
        rootPosition: [0, 1.6, 0],
        hairLength: 0.7,
        hairStep: 3,
        hairBendDeg: 40,
      });
      // step=3 -> 총 제어점 5개 (0..4), 첫 세그먼트 0.1, 나머지 segLen = (0.7 - 0.1)/3 = 0.2
      expect(chain.nodes.length).toBe(5);
      expect(chain.firstSegmentOffset).toBeCloseTo(0.1, 6);
      expect(chain.segmentLength).toBeCloseTo(0.2, 6);
      expect(chain.bendStepDeg).toBeCloseTo(10, 6);
      expect(chain.nodes[0].jointSpec).toBeNull();
      expect(chain.nodes[1].jointSpec).toEqual(SHAPER_HAIR_JOINT_SPEC);

      const aligned = alignShaperHairControlRotations(chain.nodes);
      expect(aligned.length).toBe(5);

      const reanchored = reanchorPlantedHairRoot({
        triangleVertices: [
          [0, 1.7, 0],
          [1, 1.7, 0],
          [0, 1.7, 1],
        ],
        v0d: 0.25,
        v1d: 0.25,
        nodes: aligned,
      });
      expect(reanchored.rootPosition).toEqual([0.25, 1.7, 0.25]);
      expect(reanchored.nodes[0].position).toEqual([0.25, 1.7, 0.25]);
    });

    it("좌우 대칭 레이(symmetryHairHelper/symmetryLineHelper), 모근 각도 반전, 식모 휠/단축키 조정을 수행한다", () => {
      const symRay = computeShaperSymmetricRay([0.25, 1.6, 0.01], [0.25, 1.6, 0.02]);
      expect(symRay.origin).toEqual([-0.25, 1.6, 0.01]);
      expect(symRay.direction).toEqual([0, 0, 1]);

      expect(mirrorShaperHairRootAngles([15, 30, -45])).toEqual([15, -30, 45]);

      const adjusted = applyShaperHairAddShortcutAdjustment(
        { hairLength: 1.0, hairWidth: 0.5, hairBend: 20, hairRootAngleZ: 350 },
        { scrollDeltaY: 2, shiftKey: true, altKey: true, ctrlKey: true, keyPressed: "=" },
      );
      expect(adjusted.hairLength).toBeCloseTo(1.4, 5);
      expect(adjusted.hairBend).toBeCloseTo(40, 5);
      expect(adjusted.hairRootAngleZ).toBeCloseTo(10, 5);
      expect(adjusted.hairWidth).toBeCloseTo(0.6, 5);
    });
  });
});
