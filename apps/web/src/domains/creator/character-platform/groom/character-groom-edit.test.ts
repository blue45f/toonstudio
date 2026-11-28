import { describe, expect, it } from "vitest";

import { createEmptyCharacterGroomDocument } from "./character-groom-document";
import { addCharacterGroomGroup, addCharacterGroomGuide, duplicateCharacterGroomGroup, duplicateCharacterGroomGuide, editCharacterGroomGroup } from "./character-groom-edit";

describe("헤어 원본 편집", () => {
  it.each([1, -1] as const)("머리 전방 %i에서 추가와 반복 복제 시 같은 뿌리에 겹치지 않고 기존 곡선을 유지한다", (frontSign) => {
    const fit = {
      source: "mesh" as const, center: [0.006, 0.12, 0.01] as const,
      eyeCenter: [0.006, 0.03, frontSign * 0.09] as const, frontSign,
      radiusX: 0.1, radiusY: 0.13, radiusZ: 0.105, faceFront: 0.11,
    };
    let groom = addCharacterGroomGroup(createEmptyCharacterGroomDocument(), "앞머리", fit);
    const groupId = groom.groups[0].groupId;
    const original = groom.groups[0].guides[0];
    for (let index = 1; index < 9; index++) groom = addCharacterGroomGuide(groom, groupId, fit);
    const beforeCopies = groom.groups[0].guides;
    for (let index = 0; index < 2; index++) groom = duplicateCharacterGroomGuide(groom, groupId, original.guideId, fit);
    expect(groom.groups[0].guides.slice(0, 9)).toEqual(beforeCopies);
    groom = addCharacterGroomGroup(groom, "옆 가닥", fit);
    const guides = groom.groups.flatMap((group) => group.guides);
    const roots = guides.map((guide) => guide.points[0].position[0]);
    expect(new Set(roots).size).toBe(guides.length);
    expect(roots.every((x) => Math.abs(x - frontSign * fit.center[0]) < fit.radiusX * 0.75)).toBe(true);
    expect(roots[1]).toBeLessThan(roots[0]);
    expect(roots[2]).toBeGreaterThan(roots[0]);
    expect(guides[0]).toEqual(original);
    for (const copy of guides.slice(9, 11)) {
      const shiftX = copy.points[0].position[0] - original.points[0].position[0];
      for (const [index, point] of copy.points.entries()) {
        const source = original.points[index];
        expect(point.position[0] - source.position[0]).toBeCloseTo(shiftX, 8);
        expect(point.position.slice(1)).toEqual(source.position.slice(1));
        expect([point.width, point.twist]).toEqual([source.width, source.twist]);
      }
    }
  });

  it("추가와 복제는 모든 그룹의 고유 ID를 유지하고 원본 제어점을 보존한다", () => {
    const original = addCharacterGroomGroup(createEmptyCharacterGroomDocument("topology:edit"), "앞머리");
    const group = original.groups[0];
    const guide = group?.guides[0];
    if (!group || !guide) throw new Error("헤어 원본이 없습니다.");
    const serialized = JSON.stringify(original);
    const added = addCharacterGroomGuide(original, group.groupId);
    const copied = duplicateCharacterGroomGuide(added, group.groupId, guide.guideId);
    const duplicated = duplicateCharacterGroomGroup(copied, group.groupId);
    const ids = duplicated.groups.flatMap((entry) => entry.guides.map((curve) => curve.guideId));
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect(new Set(duplicated.groups.map((entry) => entry.groupId)).size).toBe(2);
    expect(copied.groups[0]?.guides[2]?.points[0]?.position[0]).toBeCloseTo(0.025);
    expect(JSON.stringify(original)).toBe(serialized);
  });

  it("잠긴 그룹과 확인되지 않은 표면 앵커 가이드의 위치를 덮어쓰지 않는다", () => {
    const original = addCharacterGroomGroup(createEmptyCharacterGroomDocument("topology:edit"), "앞머리");
    const groupId = original.groups[0]?.groupId ?? "missing";
    const locked = { ...original, groups: original.groups.map((group) => ({ ...group, locked: true })) };
    expect(() => editCharacterGroomGroup(locked, groupId, (group) => ({ ...group, name: "변경" }))).toThrow("잠긴");
    const anchored = { ...original, groups: original.groups.map((group) => ({ ...group, guides: group.guides.map((guide) => ({ ...guide, points: guide.points.map((point) => ({ ...point, surfaceAnchor: {
      meshAssetId: "mesh:head", topologyRevision: "topology:edit", primitiveIndex: 0, triangleIndex: 0,
      barycentric: [1, 0, 0] as const, localNormal: [0, 0, 1] as const,
    } })) })) })) };
    expect(() => duplicateCharacterGroomGuide(anchored, groupId, anchored.groups[0]?.guides[0]?.guideId ?? "missing")).toThrow("다시 투영");
  });
});
