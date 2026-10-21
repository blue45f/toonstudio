import { describe, expect, it } from "vitest";

import {
  appendStudioBg3dGlbPaintStroke,
  countStudioBg3dGlbPaintMeshOrdinal,
  findStudioBg3dGlbPaintEntityRoot,
  resolveStudioBg3dGlbPaintTargetKey,
  type StudioBg3dGlbPaintHitObjectLike,
} from "./studio-bg3d-glb-texture-paint-host-logic";
import type { StudioBg3dTexturePaintStroke } from "./studio-bg3d-texture-paint";

type Node = StudioBg3dGlbPaintHitObjectLike & {
  children: StudioBg3dGlbPaintHitObjectLike[];
  parent: StudioBg3dGlbPaintHitObjectLike | null;
};

function node(partial: Partial<Node> = {}): Node {
  return { children: [], parent: null, ...partial } as Node;
}

function attach(parent: Node, child: Node): Node {
  parent.children.push(child);
  (child as { parent: Node | null }).parent = parent;
  return child;
}

function mesh(partial: Partial<Node> = {}): Node {
  return node({ isMesh: true, ...partial });
}

/** 엔티티 그룹 > 클론 루트 > 메시2 + 중첩 자식 엔티티(메시1) 구조를 만든다. */
function buildScene() {
  const entity = node({ userData: { studioBg3dEntityId: "model-1" } });
  const cloneRoot = attach(entity, node());
  const first = attach(cloneRoot, mesh());
  const second = attach(cloneRoot, mesh());
  const childEntity = attach(entity, node({ userData: { studioBg3dEntityId: "model-2" } }));
  const childMesh = attach(childEntity, mesh());
  return { entity, cloneRoot, first, second, childEntity, childMesh };
}

describe("GLB 페인트 호스트 대상 판정 (D4)", () => {
  it("가장 가까운 엔티티 그룹을 루트로 찾는다", () => {
    const { entity, second, childMesh } = buildScene();
    expect(findStudioBg3dGlbPaintEntityRoot(second)?.entityId).toBe("model-1");
    expect(findStudioBg3dGlbPaintEntityRoot(second)?.root).toBe(entity);
    expect(findStudioBg3dGlbPaintEntityRoot(childMesh)?.entityId).toBe("model-2");
    expect(findStudioBg3dGlbPaintEntityRoot(node())).toBeNull();
  });

  it("ordinal은 클론 순회 순서와 같고 중첩 엔티티 서브트리를 세지 않는다", () => {
    const { entity, first, second, childEntity } = buildScene();
    expect(countStudioBg3dGlbPaintMeshOrdinal(entity, first)).toBe(0);
    expect(countStudioBg3dGlbPaintMeshOrdinal(entity, second)).toBe(1);
    // 자식 엔티티의 메시는 부모 순회 범위 밖이다.
    expect(countStudioBg3dGlbPaintMeshOrdinal(entity, childEntity.children[0]!)).toBeNull();
  });

  it("이벤트 교차에서 엔티티 대상 키를 만든다 — 가린 다른 엔티티 교차는 건너뛴다", () => {
    const { second, childMesh } = buildScene();
    expect(
      resolveStudioBg3dGlbPaintTargetKey({ object: second, face: null }, "model-1"),
    ).toBe("mesh-1");
    expect(
      resolveStudioBg3dGlbPaintTargetKey(
        {
          object: childMesh,
          face: null,
          intersections: [
            { object: childMesh, face: null },
            { object: second, face: null },
          ],
        },
        "model-1",
      ),
    ).toBe("mesh-1");
    expect(resolveStudioBg3dGlbPaintTargetKey({ object: second }, "model-2")).toBeNull();
    expect(resolveStudioBg3dGlbPaintTargetKey(null, "model-1")).toBeNull();
  });

  it("재질 배열 메시에서는 face의 materialIndex가 슬롯이 된다", () => {
    const { entity } = buildScene();
    const grouped = attach(entity, mesh({ material: [{}, {}] }));
    expect(
      resolveStudioBg3dGlbPaintTargetKey(
        { object: grouped, face: { materialIndex: 1 } },
        "model-1",
      ),
    ).toBe("mesh-2:slot-1");
    // 단일 재질이면 face 정보가 있어도 슬롯 0이다.
    const { second } = buildScene();
    expect(
      resolveStudioBg3dGlbPaintTargetKey(
        { object: second, face: { materialIndex: 1 } },
        "model-1",
      ),
    ).toBe("mesh-1");
  });
});

describe("appendStudioBg3dGlbPaintStroke", () => {
  const stroke: StudioBg3dTexturePaintStroke = {
    color: "#e11d48",
    size: 0.04,
    opacity: 1,
    points: [[0.5, 0.5]],
  };

  it("빈 페인트에 첫 획을 만들고, 대상별로 누적한다", () => {
    const first = appendStudioBg3dGlbPaintStroke(null, "mesh-0", stroke);
    expect(first?.targets).toHaveLength(1);
    expect(first?.targets[0]?.targetKey).toBe("mesh-0");
    expect(first?.targets[0]?.paint.strokes).toHaveLength(1);
    const second = appendStudioBg3dGlbPaintStroke(first, "mesh-1", stroke);
    expect(second?.targets.map((target) => target.targetKey)).toEqual(["mesh-0", "mesh-1"]);
    // 같은 대상에 다른 획을 덧붙이면 누적된다(upsert는 갱신 대상을 끝으로 옮기므로 키로 찾는다).
    const otherStroke: StudioBg3dTexturePaintStroke = { ...stroke, points: [[0.25, 0.75]] };
    const again = appendStudioBg3dGlbPaintStroke(second, "mesh-0", otherStroke);
    expect(
      again?.targets.find((target) => target.targetKey === "mesh-0")?.paint.strokes,
    ).toHaveLength(2);
  });

  it("정규형이 아닌 대상 키는 거부한다", () => {
    expect(appendStudioBg3dGlbPaintStroke(null, "bogus", stroke)).toBeNull();
  });
});
