import { describe, expect, it } from "vitest";

import { hasContiguousLayerGroups } from "../studio-layers";

import {
  BUILTIN_STUDIO_LAYER_TEMPLATES,
  captureLayerStructureAsTemplate,
  deleteSavedLayerTemplate,
  instantiateLayerTemplate,
  listAllLayerTemplates,
  loadSavedLayerTemplates,
  saveLayerTemplateToStorage,
  serializeVectorsToClipboardSvg,
  STUDIO_LAYER_TEMPLATE_STORAGE_KEY,
  updateSavedLayerTemplate,
  validateStudioLayerTemplate,
} from "./studio-layer-template";

import type { StudioLayerTemplateStorageLike } from "./studio-layer-template";

function createMemoryStorage(): StudioLayerTemplateStorageLike & {
  readonly dump: Map<string, string>;
} {
  const dump = new Map<string, string>();
  return {
    dump,
    getItem: (key) => dump.get(key) ?? null,
    setItem: (key, value) => {
      dump.set(key, value);
    },
    removeItem: (key) => {
      dump.delete(key);
    },
  };
}

describe("studio-layer-template", () => {
  it("4종의 한국어 웹툰·만화 내장 레이어 템플릿을 제공한다", () => {
    expect(BUILTIN_STUDIO_LAYER_TEMPLATES.map((tpl) => tpl.name)).toEqual([
      "표준 웹툰 컷 6단",
      "로판 화려 효과 컷",
      "흑백 출판 만화",
      "배경+인물 분리",
    ]);

    for (const tpl of BUILTIN_STUDIO_LAYER_TEMPLATES) {
      expect(tpl.builtin).toBe(true);
      expect(tpl.layers.length).toBeGreaterThanOrEqual(4);
      const instantiated = instantiateLayerTemplate(tpl);
      expect(hasContiguousLayerGroups(instantiated.layers)).toBe(true);
    }
  });

  it("무거운 픽셀 data URL이나 획 포인트 배열을 버리고 순수 계층 구조만 캡처한다", () => {
    const captured = captureLayerStructureAsTemplate({
      id: "tpl-clean-capture",
      name: "내 작업방 템플릿",
      groups: [{ id: "g1", name: "인물 폴더", collapsed: false }],
      elements: [
        {
          id: "el-img",
          name: "인물 채색",
          type: "image",
          groupId: "g1",
          role: "color",
          color: "yellow",
          clipBelow: true,
          src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA" + "A".repeat(4096),
          maskSrc: "data:image/png;base64,MASK_HEAVY",
          frames: [{ id: "f1", src: "data:image/png;base64,FRAME" }],
        },
        {
          id: "el-vec",
          name: "인물 선화",
          type: "draw",
          groupId: "g1",
          role: "lineart",
          fillReference: true,
          points: [10, 20, 30, 40, 50, 60],
        },
      ],
    });

    const serialized = JSON.stringify(captured);
    expect(serialized).not.toContain("data:image/png");
    expect(serialized).not.toContain("MASK_HEAVY");
    expect(serialized).not.toContain("points");
    expect(captured.groups).toHaveLength(1);
    expect(captured.layers).toHaveLength(2);
    expect(captured.layers[0]?.clipBelow).toBe(true);
    expect(captured.layers[1]?.fillReference).toBe(true);
  });

  it("localStorage CRUD와 스키마 검증이 손상된 JSON을 안전하게 방어한다", () => {
    const storage = createMemoryStorage();
    storage.setItem(STUDIO_LAYER_TEMPLATE_STORAGE_KEY, "{broken-json");
    expect(loadSavedLayerTemplates(storage)).toEqual([]);

    storage.setItem(
      STUDIO_LAYER_TEMPLATE_STORAGE_KEY,
      JSON.stringify([{ id: "", name: "" }, { id: "bad", name: "빈 레이어", layers: [] }]),
    );
    expect(loadSavedLayerTemplates(storage)).toEqual([]);
    expect(validateStudioLayerTemplate(null)).toBeNull();

    const custom = captureLayerStructureAsTemplate({
      id: "tpl-user-1",
      name: "액션 컷 세트",
      description: "집중선+타격 레이어",
      groups: [{ id: "g-act", name: "액션" }],
      elements: [{ id: "e1", name: "타격 선화", type: "draw", groupId: "g-act" }],
    });

    const afterSave = saveLayerTemplateToStorage(custom, storage);
    expect(afterSave).toHaveLength(1);
    expect(listAllLayerTemplates(storage)).toHaveLength(5);

    const afterUpdate = updateSavedLayerTemplate(
      "tpl-user-1",
      { name: "액션 컷 세트 v2" },
      storage,
    );
    expect(afterUpdate[0]?.name).toBe("액션 컷 세트 v2");

    const afterDelete = deleteSavedLayerTemplate("tpl-user-1", storage);
    expect(afterDelete).toEqual([]);
  });

  it("기존 문서 ID와 충돌하지 않는 새 ID를 발급하며 그룹 연속성을 지킨다", () => {
    const existingGroupIds = new Set(["tpl-group-1", "tpl-group-2"]);
    const existingLayerIds = new Set(["tpl-layer-1", "tpl-layer-2", "tpl-layer-3"]);

    const first = instantiateLayerTemplate(BUILTIN_STUDIO_LAYER_TEMPLATES[0]!, {
      existingGroupIds,
      existingLayerIds,
      idPrefix: "tpl",
    });

    for (const group of first.groups) {
      expect(existingGroupIds.has(group.id)).toBe(false);
    }
    for (const layer of first.layers) {
      expect(existingLayerIds.has(layer.id)).toBe(false);
    }
    expect(hasContiguousLayerGroups(first.layers)).toBe(true);
  });

  it("선택한 벡터 획을 XML 이스케이프된 유효한 클립보드 SVG 마크업으로 직렬화한다", () => {
    const svg = serializeVectorsToClipboardSvg(
      [
        {
          id: 'ink-"1" & <main>',
          points: [10, 20, 110, 70, 150, 40],
          stroke: "#111827",
          strokeWidth: 4,
          opacity: 0.85,
        },
        {
          id: "dot",
          points: [30, 35],
          stroke: "#ef4444",
          strokeWidth: 6,
        },
      ],
      { title: "선화 <클립보드>" },
    );

    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain("<title>선화 &lt;클립보드&gt;</title>");
    expect(svg).toContain('id="ink-&quot;1&quot; &amp; &lt;main&gt;"');
    expect(svg).toContain('d="M 10 20 L 110 70 L 150 40"');
    expect(svg).toContain('opacity="0.85"');
    expect(svg).toContain('<circle id="dot" cx="30" cy="35" r="3" fill="#ef4444" />');
  });
});
