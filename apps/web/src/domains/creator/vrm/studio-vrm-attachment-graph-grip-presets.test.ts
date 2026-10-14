import { describe, expect, it } from "vitest";

import {
  createStudioAttachmentNodeFromGripPreset,
  findStudioAttachmentSocket,
  findStudioGripPreset,
  resolveStudioAttachmentWorldTransforms,
  validateStudioAttachmentGraph,
  STUDIO_ATTACHMENT_GRIP_PRESETS,
  STUDIO_ATTACHMENT_SOCKET_CATALOG,
  type StudioAttachmentGraph,
  type StudioTransform3d,
} from "./studio-vrm-attachment-graph";

const identity: StudioTransform3d = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};

const figureNode = {
  id: "figure",
  kind: "figure" as const,
  assetRevisionId: "figure-r1",
  localTransform: identity,
  constraints: [],
  visible: true,
  locked: false,
};

describe("소켓 카탈로그", () => {
  it("소켓 id가 유일하고 한손/양손/어깨 멜빵 접촉 소켓을 포함한다", () => {
    const ids = STUDIO_ATTACHMENT_SOCKET_CATALOG.map((socket) => socket.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [
      "hand-right-grip", "hand-left-grip", "hand-right-support", "hand-left-support",
      "shoulder-strap-right", "shoulder-strap-left", "back-carrier", "neck-loop",
    ]) {
      expect(findStudioAttachmentSocket(id), id).toBeDefined();
    }
    expect(findStudioAttachmentSocket("hand-right-grip")?.contact).toBe("grip");
    expect(findStudioAttachmentSocket("shoulder-strap-left")?.contact).toBe("strap");
    expect(findStudioAttachmentSocket("없는-소켓")).toBeUndefined();
  });

  it("모든 그립 프리셋의 소켓이 카탈로그에 존재한다", () => {
    for (const preset of STUDIO_ATTACHMENT_GRIP_PRESETS) {
      for (const side of ["left", "right"] as const) {
        expect(findStudioAttachmentSocket(preset.primarySocketId(side)), preset.id).toBeDefined();
        if (preset.secondarySocketId) {
          expect(findStudioAttachmentSocket(preset.secondarySocketId(side)), preset.id).toBeDefined();
        }
      }
    }
  });
});

describe("그립 프리셋 기본 장착", () => {
  it("한손 그립은 카탈로그 소켓과 기본 트랜스폼으로 노드를 만든다", () => {
    const node = createStudioAttachmentNodeFromGripPreset({
      id: "sword", assetRevisionId: "sword-r1", presetId: "one-hand-grip",
      side: "right", parentNodeId: "figure",
    });
    expect(node.parentSocket).toBe("hand-right-grip");
    expect(node.parentNodeId).toBe("figure");
    expect(node.kind).toBe("hand");
    expect(node.constraints).toEqual([]);
    expect(node.localTransform).toEqual(identity);
  });

  it("양손 그립은 보조 손 노드가 있을 때만 접촉 간격 distance 제약을 기본으로 단다", () => {
    const withSecondary = createStudioAttachmentNodeFromGripPreset({
      id: "staff", assetRevisionId: "staff-r1", presetId: "two-hand-grip",
      side: "right", parentNodeId: "figure", secondaryParentNodeId: "figure",
    });
    expect(withSecondary.parentSocket).toBe("hand-right-grip");
    expect(withSecondary.constraints).toEqual([
      { type: "distance", targetNodeId: "figure", weight: 1, distance: 0.16 },
    ]);
    expect(findStudioGripPreset("two-hand-grip")?.secondarySocketId?.("right")).toBe("hand-left-grip");

    const withoutSecondary = createStudioAttachmentNodeFromGripPreset({
      id: "staff", assetRevisionId: "staff-r1", presetId: "two-hand-grip",
      side: "left", parentNodeId: "figure",
    });
    expect(withoutSecondary.parentSocket).toBe("hand-left-grip");
    expect(withoutSecondary.constraints).toEqual([]);
  });

  it("어깨 멜빵 프리셋은 멜빵 소켓과 어깨 오프셋 기본값을 쓴다", () => {
    const node = createStudioAttachmentNodeFromGripPreset({
      id: "bag", assetRevisionId: "bag-r1", presetId: "shoulder-strap",
      side: "left", parentNodeId: "figure",
    });
    expect(node.parentSocket).toBe("shoulder-strap-left");
    expect(node.localTransform.position).toEqual({ x: -0.2, y: 0.06, z: 0 });
    expect(node.kind).toBe("prop");
  });

  it("프리셋으로 만든 노드는 그래프 검증과 월드 해석을 통과한다", () => {
    const prop = createStudioAttachmentNodeFromGripPreset({
      id: "sword", assetRevisionId: "sword-r1", presetId: "two-hand-grip",
      side: "right", parentNodeId: "figure", secondaryParentNodeId: "figure",
    });
    const graph: StudioAttachmentGraph = { version: 1, revision: 0, nodes: [figureNode, prop] };
    expect(() => validateStudioAttachmentGraph(graph)).not.toThrow();
    expect(resolveStudioAttachmentWorldTransforms(graph).get("sword")).toBeDefined();
  });

  it("로컬 트랜스폼을 명시하면 프리셋 기본값보다 우선한다", () => {
    const custom: StudioTransform3d = {
      position: { x: 0.01, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    };
    const node = createStudioAttachmentNodeFromGripPreset({
      id: "bag", assetRevisionId: "bag-r1", presetId: "shoulder-strap",
      side: "right", parentNodeId: "figure", localTransform: custom,
    });
    expect(node.localTransform).toBe(custom);
  });
});
