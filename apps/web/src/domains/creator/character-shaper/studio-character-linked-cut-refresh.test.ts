import { describe, expect, it, vi } from "vitest";

import { createStudioVrmSceneDocument } from "../vrm/studio-vrm-scene-document";
import { applyStudioCharacterCutRefresh, planStudioCharacterCutRefresh } from "./studio-character-linked-cut-refresh";

import type { El } from "../studio-element-model";
import type { PageState } from "../studio-page-state";
import type { StudioVrmPoserInsertResult } from "../scene-3d/studio-3d-insert-contract";

const red = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABAAQMAAACQp+OdAAAAA1BMVEX/AAAZ4gk3AAAADklEQVR4AWMYBaOAAgAAAkAAAZJBeAIAAAAASUVORK5CYII=";
const green = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABAAQMAAACQp+OdAAAAA1BMVEUA/wA0XsCoAAAADklEQVR4AWMYBaOAAgAAAkAAAZJBeAIAAAAASUVORK5CYII=";
const source = createStudioVrmSceneDocument({ source: "bundled", id: "hero", name: "인물" });
const character = { documentId: "character:a", revision: 4 };
type Cut = Extract<El, { type: "image" }>;
function cut(index: number, id = character.documentId) {
  return {
    type: "image" as const, id: `cut-${index}`, src: red, x: index, y: 2, width: 81, height: 83, rotation: 7,
    vrmScene: { ...source, characterDocumentId: id, pose: { ...source.pose, yOffset: index * 0.05 },
      camera: { ...source.camera, fovDegrees: 30 + index },
      render: { ...source.render, width: 64, height: 64 } },
  } satisfies Cut;
}
function page(elements: El[]): PageState {
  return { id: "page-a", elements, bg: "#ffffff", bgGrad: null, canvasH: 1280 };
}
function render(original: ReturnType<typeof cut>): StudioVrmPoserInsertResult {
  return { pngDataUrl: green, width: 64, height: 64, displayWidth: 64, displayHeight: 64,
    scene: { ...original.vrmScene, appearance: { ...original.vrmScene.appearance, customColors: { hair: "#234567" } } } };
}

describe("연결된 컷의 래스터 일괄 갱신", () => {
  it("같은 모델을 쓰는 두 캐릭터의 8개 컷에서 대상만 한 번에 갱신하고 구도와 편집을 보존한다", () => {
    const cuts = Array.from({ length: 8 }, (_, i) => cut(i, i % 2 ? "character:b" : character.documentId));
    const before = page(cuts);
    const plan = planStudioCharacterCutRefresh(before, character.documentId, character.revision);
    expect(plan.targets.map(item => item.elementId)).toEqual(["cut-0", "cut-2", "cut-4", "cut-6"]);
    const changed = page(cuts.map((c, i) => i === 2 ? { ...c, x: 450 } : c));
    const results = new Map(cuts.map(c => [c.id, render(c)]));
    const commit = vi.fn((_elements: El[], _patch?: undefined, _pageId?: string) => true);
    expect(applyStudioCharacterCutRefresh(changed, plan, results, commit, character)).toEqual({ updated: 3, skipped: 1 });
    expect(commit).toHaveBeenCalledTimes(1);
    const [updated, , pageId] = commit.mock.calls[0]!;
    expect(pageId).toBe(changed.id);
    updated.forEach((e, i) => {
      const c = cuts[i]!;
      if (i % 2 || i === 2) {
        expect(e).toBe(changed.elements[i]);
      } else {
        expect(e).toEqual({ ...c, src: green, vrmScene: { ...c.vrmScene, appearance: render(c).scene.appearance } });
      }
    });
    expect(before.elements.every(e => e.type === "image" && e.src === red)).toBe(true);
  });

  it("잠긴 그룹·보호 원본·중복 ID를 제외하고 캡처 중 바뀐 포즈나 다른 컷의 결과를 폐기한다", () => {
    const [a, b, c, d, e, f] = [cut(0), cut(1), cut(2), cut(3), cut(4), cut(5)] as const;
    const initial = page([a, b, { ...c, groupId: "locked" }, { ...d, src: "studio-opfs-cas:sealed" }, e, e, f]);
    initial.groups = [{ id: "locked", name: "확정 컷", locked: true }];
    const plan = planStudioCharacterCutRefresh(initial, character.documentId, character.revision);
    expect(plan.targets.map(item => item.elementId)).toEqual([a.id, b.id, f.id]);
    expect(plan.skipped).toBe(4);
    const latest = { ...initial, elements: initial.elements.map(item => item.id === a.id
      ? { ...a, vrmScene: { ...a.vrmScene, expressions: { happy: 0.6 } } }
      : item.id === f.id ? { ...f, locked: true } : item) };
    const results = new Map([[a.id, render(a)], [b.id, render(a)], [f.id, render(f)]]);
    const commit = vi.fn(() => true);
    expect(applyStudioCharacterCutRefresh(latest, plan, results, commit, character)).toEqual({ updated: 0, skipped: 7 });
    expect(commit).not.toHaveBeenCalled();
  });

  it("페이지·캐릭터 revision·PNG 크기가 달라지거나 승인된 커밋이 실패하면 갱신으로 세지 않는다", () => {
    const a = cut(0);
    const active = page([a]);
    const plan = planStudioCharacterCutRefresh(active, character.documentId, character.revision);
    const result = render(a);
    const results = new Map([[a.id, result]]);
    const commit = vi.fn(() => false);
    expect(applyStudioCharacterCutRefresh({ ...active, id: "another" }, plan, results, commit, character).updated).toBe(0);
    expect(applyStudioCharacterCutRefresh(active, plan, results, commit, { ...character, revision: 5 }).updated).toBe(0);
    expect(applyStudioCharacterCutRefresh(active, plan, results, commit, { ...character, documentId: "character:b" }).updated).toBe(0);
    expect(applyStudioCharacterCutRefresh(active, plan, new Map([[a.id, { ...result, width: 32 }]]), commit, character).updated).toBe(0);
    expect(commit).not.toHaveBeenCalled();
    expect(applyStudioCharacterCutRefresh(active, plan, results, commit, character)).toEqual({ updated: 0, skipped: 1 });
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
