import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_BG3D_SKP_FALLBACK_COMPONENT_NAME,
  STUDIO_BG3D_SKP_MEMO_LINE_PREFIX,
  buildStudioBg3dSkpMemoCandidates,
  collectStudioBg3dSkpSources,
  createStudioBg3dSkpComponentRef,
  linkStudioBg3dSkpPlacement,
  loadStudioBg3dSkpSidecar,
  partitionStudioBg3dSkpTagNames,
  studioBg3dSkpComponentId,
  studioBg3dSkpSidecarSearchText,
  suggestStudioBg3dSkpTags,
  toStudioBg3dSkpSidecar,
  type StudioBg3dSkpSidecar,
  type StudioBg3dSkpSidecarSource,
} from "./studio-bg3d-skp-sidecar";

import type { StudioBg3dComponentRef } from "./studio-bg3d-scene-document-types";

const HASH = `sha256:${"ab12".repeat(16)}`;

function nameList(items: readonly string[], extra: { total?: number; truncated?: boolean; available?: boolean } = {}) {
  return {
    available: extra.available ?? true,
    items: [...items],
    total: extra.total ?? items.length,
    truncated: extra.truncated ?? false,
  };
}

function metadataWithNames(names: {
  components?: readonly string[];
  tags?: readonly string[];
  scenes?: readonly string[];
}): StudioBg3dSkpSidecarSource {
  return {
    contentHash: HASH,
    skpImport: {
      names: {
        components: nameList(names.components ?? []),
        tags: nameList(names.tags ?? []),
        scenes: nameList(names.scenes ?? []),
      },
    },
  };
}

function sidecar(names: Parameters<typeof metadataWithNames>[0]): StudioBg3dSkpSidecar {
  const value = toStudioBg3dSkpSidecar(metadataWithNames(names));
  if (!value) throw new Error("사이드카를 만들지 못했습니다.");
  return value;
}

describe("toStudioBg3dSkpSidecar", () => {
  it("보고서 이름 목록만 얼려서 뽑는다", () => {
    const value = sidecar({ components: ["의자", "책상"], tags: ["벽"], scenes: ["정면"] });
    expect(value.contentHash).toBe(HASH);
    expect(value.components.items).toEqual(["의자", "책상"]);
    expect(value.tags.items).toEqual(["벽"]);
    expect(value.scenes.items).toEqual(["정면"]);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.components.items)).toBe(true);
  });

  it("SKP 가져오기 기록이 아니면 null 이다", () => {
    expect(toStudioBg3dSkpSidecar(null)).toBeNull();
    expect(toStudioBg3dSkpSidecar({ contentHash: HASH })).toBeNull();
  });

  it("전체 개수와 잘림 표시를 그대로 옮긴다", () => {
    const value = toStudioBg3dSkpSidecar({
      contentHash: HASH,
      skpImport: {
        names: {
          components: nameList(["a"], { total: 40, truncated: true }),
          tags: nameList([], { available: false }),
          scenes: nameList([]),
        },
      },
    });
    expect(value?.components).toMatchObject({ total: 40, truncated: true });
    expect(value?.tags.available).toBe(false);
  });
});

describe("loadStudioBg3dSkpSidecar", () => {
  it("저장소 기록을 읽어 found 로 돌려준다", async () => {
    const get = vi.fn(async () => metadataWithNames({ components: ["의자"] }));
    const result = await loadStudioBg3dSkpSidecar(HASH, { loadStore: async () => ({ get }) });
    expect(result.status).toBe("found");
    expect(get).toHaveBeenCalledWith(HASH, undefined);
  });

  it("기록이 없거나 SKP 기록이 아니면 missing 이다", async () => {
    expect(await loadStudioBg3dSkpSidecar(HASH, { loadStore: async () => ({ get: async () => null }) })).toEqual({
      status: "missing",
    });
    const plain: StudioBg3dSkpSidecarSource = { contentHash: HASH };
    expect(await loadStudioBg3dSkpSidecar(HASH, { loadStore: async () => ({ get: async () => plain }) })).toEqual({
      status: "missing",
    });
  });

  it("해시 모양이 올바르지 않으면 저장소를 열지 않고 missing 이다", async () => {
    const loadStore = vi.fn(async () => ({ get: async () => null }));
    expect(await loadStudioBg3dSkpSidecar("not-a-hash", { loadStore })).toEqual({ status: "missing" });
    expect(loadStore).not.toHaveBeenCalled();
  });

  it("저장소를 열거나 읽다가 던지면 failed 로 알린다", async () => {
    expect(
      await loadStudioBg3dSkpSidecar(HASH, {
        loadStore: async () => {
          throw new Error("opfs");
        },
      }),
    ).toEqual({ status: "failed" });
    expect(
      await loadStudioBg3dSkpSidecar(HASH, {
        loadStore: async () => ({
          get: async () => {
            throw new Error("read");
          },
        }),
      }),
    ).toEqual({ status: "failed" });
  });
});

describe("컴포넌트 참조 잇기", () => {
  it("같은 해시는 같은 컴포넌트 id 가 되고 다른 해시는 다르다", () => {
    expect(studioBg3dSkpComponentId(HASH)).toBe(`skp-${"ab12".repeat(4)}`);
    expect(studioBg3dSkpComponentId(`sha256:${"cd34".repeat(16)}`)).not.toBe(studioBg3dSkpComponentId(HASH));
    expect(studioBg3dSkpComponentId("sha256:zz")).toBeNull();
    expect(studioBg3dSkpComponentId("")).toBeNull();
  });

  it("자료 이름을 문서 규칙으로 정리해 이름을 만들고 규칙에 걸리면 일반 이름을 쓴다", () => {
    expect(createStudioBg3dSkpComponentRef(HASH, "  교실   의자 ")).toEqual({
      id: `skp-${"ab12".repeat(4)}`,
      name: "교실 의자",
    });
    expect(createStudioBg3dSkpComponentRef(HASH, "https://example.com/model")?.name).toBe(
      STUDIO_BG3D_SKP_FALLBACK_COMPONENT_NAME,
    );
    expect(createStudioBg3dSkpComponentRef(HASH, "x".repeat(60))?.name).toBe(STUDIO_BG3D_SKP_FALLBACK_COMPONENT_NAME);
    expect(createStudioBg3dSkpComponentRef("bad", "의자")).toBeNull();
  });

  it("SKP 배치에만 참조를 붙이고 이미 있는 참조는 덮어쓰지 않는다", () => {
    const instance: { id: string; modelId: string; componentRef?: StudioBg3dComponentRef } = { id: "m1", modelId: "stored-1" };
    const linked = linkStudioBg3dSkpPlacement(instance, { contentHash: HASH, name: "의자.skp" });
    expect(linked.componentRef).toEqual({ id: `skp-${"ab12".repeat(4)}`, name: "의자.skp" });
    expect(instance).not.toHaveProperty("componentRef");
    expect(linkStudioBg3dSkpPlacement(instance, null)).toBe(instance);
    const own = { ...instance, componentRef: { id: "mine", name: "내 묶음" } };
    expect(linkStudioBg3dSkpPlacement(own, { contentHash: HASH, name: "의자" })).toBe(own);
    expect(linkStudioBg3dSkpPlacement(instance, { contentHash: "bad", name: "의자" })).toBe(instance);
  });
});

describe("이름 제안", () => {
  it("태그 이름 중 문서 규칙을 통과하는 것만 중복 없이 제안한다", () => {
    const value = sidecar({ tags: ["벽", "벽", "https://example.com", "  바닥 ", "x".repeat(40), "__proto__"] });
    expect(suggestStudioBg3dSkpTags(value)).toEqual(["벽", "바닥"]);
  });

  it("규칙에 걸려 제안하지 않는 태그 이름은 개수로 알린다(중복은 걸린 것이 아니다)", () => {
    const value = sidecar({ tags: ["벽", "벽", "https://example.com", "", "바닥"] });
    expect(partitionStudioBg3dSkpTagNames(value)).toEqual({ suggestions: ["벽", "바닥"], rejected: 2 });
  });

  it("장면 이름은 메모 후보 줄이 될 뿐 카메라 복원을 뜻하지 않는다", () => {
    const value = sidecar({ scenes: ["정면 뷰", "정면 뷰", "https://example.com", "측면"] });
    expect(buildStudioBg3dSkpMemoCandidates(value)).toEqual([
      `${STUDIO_BG3D_SKP_MEMO_LINE_PREFIX}정면 뷰`,
      `${STUDIO_BG3D_SKP_MEMO_LINE_PREFIX}측면`,
    ]);
    expect(buildStudioBg3dSkpMemoCandidates(sidecar({}))).toEqual([]);
  });

  it("검색 글자에 컴포넌트·태그·장면 이름이 소문자로 모인다", () => {
    const value = sidecar({ components: ["Chair"], tags: ["Walls"], scenes: ["정면 뷰"] });
    expect(studioBg3dSkpSidecarSearchText(value)).toBe("chair\nwalls\n정면 뷰");
    expect(studioBg3dSkpSidecarSearchText(sidecar({}))).toBe("");
  });
});

describe("collectStudioBg3dSkpSources", () => {
  it("첨부 자료의 원본 형식이 skp 인 모델 노드만 해시와 이름으로 모은다", () => {
    const attachments = new Map([
      ["stored-skp", { hash: HASH, name: "의자.skp", generic3dWorkflow: { sourceFormat: "skp" } }],
      ["stored-glb", { hash: `sha256:${"cd34".repeat(16)}`, name: "책상.glb", generic3dWorkflow: { sourceFormat: "glb" } }],
      ["stored-bare", { hash: `sha256:${"ef56".repeat(16)}`, name: "이름만 skp.skp" }],
    ]);
    const sources = collectStudioBg3dSkpSources({
      customModels: [
        { id: "a", modelId: "stored-skp" },
        { id: "b", modelId: "stored-glb" },
        { id: "c", modelId: "stored-bare" },
        { id: "d", modelId: "stored-missing" },
        { id: "e", modelId: "stored-skp" },
      ],
      attachmentByStorageModelId: attachments,
    });
    expect([...sources.keys()]).toEqual(["a", "e"]);
    expect(sources.get("a")).toEqual({ contentHash: HASH, name: "의자.skp" });
    expect(Object.isFrozen(sources.get("a"))).toBe(true);
  });
});
