import { describe, expect, it } from "vitest";

import {
  readStudioBg3dRuntimeNodeExtras,
  studioBg3dNodeOrganizationToRuntime,
  studioBg3dNodeRuntimeExtras,
} from "./studio-bg3d-runtime-organization";
import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  STUDIO_BG3D_GLB_MIME,
  normalizeStudioBg3dGlbAttachment,
  normalizeStudioBg3dSceneDocument,
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
  type StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import {
  adaptStudioBg3dRuntimeToDocument,
  hydrateStudioBg3dDocumentToRuntime,
} from "./studio-bg3d-scene-runtime";

import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { BgPrimitive } from "../studio-background-3d-primitives";

function primitive(id: string, extra: Partial<BgPrimitive> = {}): BgPrimitive {
  return {
    id,
    kind: "box",
    position: [0, 0.5, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: "#c9a876",
    parentId: null,
    ...extra,
  };
}

function customModel(id: string, extra: Partial<BgCustomModelInstance> = {}): BgCustomModelInstance {
  return {
    id,
    modelId: "stored-1",
    position: [0, 0, 1],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    parentId: null,
    ...extra,
  };
}

const ATTACHMENT = normalizeStudioBg3dGlbAttachment({
  id: "model-1",
  name: "의자.glb",
  mime: STUDIO_BG3D_GLB_MIME,
  byteSize: 1_000_000,
  hash: `sha256:${"1".padStart(64, "0")}`,
  rights: { status: "owned", commercialUse: true, attributionRequired: false },
  source: "local-library",
});

function adapt(
  primitives: readonly BgPrimitive[],
  customModels: readonly BgCustomModelInstance[] = [],
  baseDocument?: StudioBg3dSceneDocument,
) {
  if (!ATTACHMENT) throw new Error("첨부 고정 데이터가 올바르지 않습니다.");
  return adaptStudioBg3dRuntimeToDocument({
    primitives,
    customModels,
    attachmentByStorageModelId: new Map([["stored-1", ATTACHMENT]]),
    ...(baseDocument ? { baseDocument } : {}),
  });
}

describe("런타임 노드의 선택 필드 옮기기", () => {
  it("연결 복제 원본은 예전 규칙 그대로 옮기고 자기 자신은 원본이 될 수 없다", () => {
    expect(readStudioBg3dRuntimeNodeExtras({ id: "a", linkedSourceId: "b" })).toEqual({ linkedSourceId: "b" });
    expect(readStudioBg3dRuntimeNodeExtras({ id: "a", linkedSourceId: "a" })).toEqual({});
    expect(readStudioBg3dRuntimeNodeExtras({ id: "a", linkedSourceId: 7 })).toEqual({});
    expect(readStudioBg3dRuntimeNodeExtras({ id: "a" })).toEqual({});
  });

  it("태그는 편집 경계 규칙으로 정리하고 컴포넌트 참조는 올바를 때만 옮긴다", () => {
    const extras = readStudioBg3dRuntimeNodeExtras({
      id: "a",
      tags: ["벽", "https://example.com", "벽", "교실"],
      componentRef: { id: "comp-1", name: "벽체" },
    });
    expect(extras).toEqual({ tags: ["교실", "벽"], componentRef: { id: "comp-1", name: "벽체" } });
    expect(readStudioBg3dRuntimeNodeExtras({ id: "a", tags: [], componentRef: { id: "x y", name: "z" } })).toEqual({});
    const overflow = readStudioBg3dRuntimeNodeExtras({
      id: "a",
      tags: Array.from({ length: 20 }, (_, index) => `t${String(index).padStart(2, "0")}`),
    });
    expect(overflow.tags).toHaveLength(8);
  });

  it("문서 노드의 값을 런타임으로 되돌릴 때 사본을 만든다", () => {
    const tags = ["벽"];
    const componentRef = { id: "c", name: "이름" };
    const restored = studioBg3dNodeOrganizationToRuntime({ tags, componentRef });
    expect(restored).toEqual({ tags: ["벽"], componentRef: { id: "c", name: "이름" } });
    expect(restored.tags).not.toBe(tags);
    expect(restored.componentRef).not.toBe(componentRef);
    expect(studioBg3dNodeOrganizationToRuntime({})).toEqual({});
    expect(studioBg3dNodeRuntimeExtras({ linkedSourceId: "z" })).toEqual({ linkedSourceId: "z" });
  });
});

describe("런타임 ↔ 장면 문서 변환에서 구성 정보 보존", () => {
  it("프리미티브와 모델의 태그·컴포넌트 참조를 문서로 옮기고 되돌린다", () => {
    const result = adapt(
      [primitive("wall", { tags: ["벽", "교실"], componentRef: { id: "comp-wall", name: "벽체" } }), primitive("floor")],
      [customModel("chair", { tags: ["가구"], componentRef: { id: "comp-chair", name: "의자" } })],
    );
    expect(result.diagnostics).toEqual([]);
    const wall = result.document.nodes.find((node) => node.id === "wall");
    expect(wall?.tags).toEqual(["교실", "벽"]);
    expect(wall?.componentRef).toEqual({ id: "comp-wall", name: "벽체" });
    expect(result.document.nodes.find((node) => node.id === "floor")).not.toHaveProperty("tags");
    expect(result.document.nodes.find((node) => node.id === "chair")?.tags).toEqual(["가구"]);

    const hydrated = hydrateStudioBg3dDocumentToRuntime({
      document: result.document,
      storageModelIdByAttachmentId: new Map([[ATTACHMENT?.id ?? "", "stored-1"]]),
    });
    expect(hydrated.ok).toBe(true);
    expect(hydrated.primitives.find((entry) => entry.id === "wall")).toMatchObject({
      tags: ["교실", "벽"],
      componentRef: { id: "comp-wall", name: "벽체" },
    });
    expect(hydrated.primitives.find((entry) => entry.id === "floor")).not.toHaveProperty("tags");
    expect(hydrated.customModels[0]).toMatchObject({ tags: ["가구"], componentRef: { id: "comp-chair", name: "의자" } });
    expect(serializeStudioBg3dSceneDocument(result.document)).toBe(result.serialized);
  });

  it("올바르지 않은 태그 때문에 노드를 잃지 않는다", () => {
    const result = adapt(
      [primitive("a", { tags: ["https://example.com", "정상"] })],
      [customModel("b", { tags: ["__proto__"], componentRef: { id: "bad id", name: "x" } })],
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.document.nodes.map((node) => node.id)).toEqual(["a", "b"]);
    expect(result.document.nodes[0]?.tags).toEqual(["정상"]);
    expect(result.document.nodes[1]).not.toHaveProperty("tags");
    expect(result.document.nodes[1]).not.toHaveProperty("componentRef");
  });

  it("태그가 한도를 넘어도 저장이 막히지 않고 앞쪽만 남는다", () => {
    const tags = Array.from({ length: 12 }, (_, index) => `태그${String(index).padStart(2, "0")}`);
    const result = adapt([primitive("a", { tags })]);
    expect(result.diagnostics).toEqual([]);
    expect(result.document.nodes[0]?.tags).toHaveLength(8);
  });

  it("기준 문서의 장면 메타(이름·메모·숨긴 태그)를 새 문서로 가져간다", () => {
    const base = parseStudioBg3dSceneDocument(
      serializeStudioBg3dSceneDocument(
        normalizeStudioBg3dSceneDocument({
          ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
          meta: { name: "교실", memo: "아침", hiddenTags: ["벽"] },
        }),
      ) ?? "",
    );
    expect(base?.meta).toEqual({ name: "교실", memo: "아침", hiddenTags: ["벽"] });
    const result = adapt([primitive("wall", { tags: ["벽"] })], [], base ?? undefined);
    expect(result.document.meta).toEqual({ name: "교실", memo: "아침", hiddenTags: ["벽"] });
    expect(result.serialized).toContain('"hiddenTags":["벽"]');
    // 메타가 없던 기준 문서는 메타 없이 남는다(예전과 같은 바이트).
    const plain = adapt([primitive("wall")]);
    expect(plain.document.meta).toBeUndefined();
    expect(plain.serialized).not.toContain('"meta"');
  });

  it("연결 복제 원본과 태그를 함께 옮겨도 서로 간섭하지 않는다", () => {
    const result = adapt([
      primitive("source", { tags: ["원본"] }),
      primitive("clone", { linkedSourceId: "source", tags: ["복제"] }),
    ]);
    const clone = result.document.nodes.find((node) => node.id === "clone");
    expect(clone?.linkedSourceId).toBe("source");
    expect(clone?.tags).toEqual(["복제"]);
    const hydrated = hydrateStudioBg3dDocumentToRuntime({
      document: result.document,
      storageModelIdByAttachmentId: new Map(),
    });
    expect(hydrated.primitives.find((entry) => entry.id === "clone")).toMatchObject({
      linkedSourceId: "source",
      tags: ["복제"],
    });
  });
});
