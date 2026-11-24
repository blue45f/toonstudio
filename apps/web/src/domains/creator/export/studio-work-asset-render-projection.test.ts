import { describe, expect, it } from "vitest";

import { collectStudioCaptureAssetSources, waitForStudioCaptureReady } from "../studio-capture-readiness";

import {
  areStudioWorkAssetSceneReferencesEqual,
  collectStudioWorkAssetSceneReferences,
  projectStudioWorkAssetPageForReadOnlyPreview,
  projectStudioWorkAssetPageForRender,
  resolveStudioWorkAssetReadableImageSource,
  resolveStudioWorkAssetHydrationScope,
  STUDIO_WORK_ASSET_PLACEHOLDER_NODE,
} from "../studio-work-asset-render-projection";

import type { StudioWorkAssetHydrationState } from "../studio-work-asset-hydrator";
import { studioBg3dSixPassArtifactSourceUri } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";

const record = (overrides: Record<string, unknown> = {}) => ({
  id: "asset-1",
  pageId: "page-1",
  orderIndex: 2,
  deleted: false,
  payload: {
    type: "reference",
    props: {
      elementType: "image",
      x: 10,
      y: 20,
      width: 300,
      height: 400,
      rotation: 0,
    },
  },
  ...overrides,
});

const ready: StudioWorkAssetHydrationState = {
  status: "ready",
  reference: { assetId: "asset-1", elementType: "image" },
  manifest: {
    version: 1,
    assetId: "asset-1",
    elementType: "image",
    mimeType: "image/png",
    byteSize: 100,
    sha256: "a".repeat(64),
    intrinsicImage: { width: 300, height: 400, decodedRgbaBytes: 480_000 },
    descriptor: {
      version: 1,
      element: {
        id: "asset-1",
        type: "image",
        x: 10,
        y: 20,
        width: 300,
        height: 400,
        rotation: 0,
      },
    },
    updatedAt: "2026-07-16T00:00:00.000Z",
  },
  source: {
    id: "asset-1",
    type: "image",
    src: "work-asset://image/asset-1",
    x: 10,
    y: 20,
    width: 300,
    height: 400,
    rotation: 0,
  },
  resourceUrl: "blob:render-only",
};

describe("studio work asset render projection", () => {
  it.each([true, false])("로컬 이미지의 CRDT 가시성(%s)은 서버 자산을 요구하지 않고 원본 포즈를 보존한다", (hidden) => {
    const actor = { id: "asset-1", type: "image", src: "data:image/png;base64,YWN0b3I=", hidden };
    const page = { id: "page-1", elements: [actor] };
    const topology = record({ payload: { type: "reference", props: { elementType: "image", hidden } } });
    const references = collectStudioWorkAssetSceneReferences([topology], [page]);
    expect(references).toEqual([]);
    const view = projectStudioWorkAssetPageForRender({
      pageId: page.id, elements: page.elements, references, hydrationRevision: 1,
      resolveState: () => { throw new Error("로컬 원본의 서버 에셋을 요청함"); },
    });
    expect(view.elements[0]).toBe(actor);
    expect(view.placeholders).toEqual([]);
    expect(collectStudioCaptureAssetSources(page)).toEqual(hidden ? [] : [actor.src]);
    expect(collectStudioWorkAssetSceneReferences([topology], [{ ...page, elements: [ready.source] }]))
      .toEqual([{ pageId: page.id, orderIndex: 0, reference: ready.reference }]);
  });

  it.each(["element", "group"])("숨긴 서버 자산(%s)은 진단 상자나 캡처 입력에 남지 않는다", (hiddenBy) => {
    const group = { id: "actors", name: "인물", hidden: hiddenBy === "group" };
    const actor = { ...ready.source, groupId: group.id, hidden: hiddenBy === "element" };
    const page = { id: "page-1", groups: [group], elements: [actor] };
    const references = collectStudioWorkAssetSceneReferences([record({ layerId: group.id, payload: {
      type: "reference", props: { elementType: "image", x: 10, hidden: actor.hidden },
    } })], [page]);
    for (const elements of [page.elements, []]) {
      const view = projectStudioWorkAssetPageForRender({
        pageId: page.id, elements, groups: page.groups, references, hydrationRevision: 1, resolveState: () => null,
      });
      expect(view.placeholders).toEqual([]);
    }
    expect(collectStudioCaptureAssetSources(page)).toEqual([]);
    expect(actor.src).toBe(ready.source.src);
  });

  it("가시 진단 노드가 그려진 캔버스는 미리 읽은 로컬 본문이 있어도 캡처하지 않는다", async () => {
    const stage = { batchDraw() {}, findOne: (selector: string) => selector === `.${STUDIO_WORK_ASSET_PLACEHOLDER_NODE}` ? {} : null };
    const page = { id: "page-1", elements: [{ ...ready.source, src: "data:image/png;base64,YWN0b3I=" }] };
    const options = { pageId: page.id, sourcePage: page, assetSources: collectStudioCaptureAssetSources(page),
      getStage: () => stage, getRenderedPageId: () => page.id,
      nextFrame: async () => {}, waitForFonts: async () => {}, preloadImage: async () => {} };
    await expect(waitForStudioCaptureReady(options)).rejects.toMatchObject({ code: "asset-load" });
    expect(page.elements[0]?.src).toBe("data:image/png;base64,YWN0b3I=");
  });

  it("원고가 먼저 받은 에셋을 복원하고 삭제·다른 레이어 참조는 제외한다", () => {
    const page = { id: "page-1", elements: [ready.source] };
    const expected = [{ pageId: page.id, orderIndex: 0, reference: ready.reference }];
    expect(collectStudioWorkAssetSceneReferences([], [page])).toEqual(expected);
    expect(collectStudioWorkAssetSceneReferences([record({ payload: { type: "reference", props: { elementType: "image" } } })], [page])).toEqual(expected);
    expect(collectStudioWorkAssetSceneReferences([record({ deleted: true })], [page])).toEqual([]);
    expect(collectStudioWorkAssetSceneReferences([], [{ ...page, elements: [{ ...ready.source, id: "other" }] }])).toEqual([]);
  });

  it("초안 캡처는 현재 작품에서 승인된 표시 URL을 기다리고 권한 변경 때 중단한다", async () => {
    const source = ready.source.src;
    const page = { id: "page-1", elements: [ready.source] };
    const stage = { batchDraw() {} };
    let state: StudioWorkAssetHydrationState | null = { status: "loading", reference: ready.reference,
      placeholder: { ...ready.reference, label: "대기" } };
    const urls: string[] = [];
    const options = { pageId: page.id, sourcePage: page, assetSources: collectStudioCaptureAssetSources(page),
      workAssetHydrator: { get: () => state }, getStage: () => stage, getRenderedPageId: () => page.id,
      nextFrame: async () => { if (state?.status === "loading") state = ready; },
      waitForFonts: async () => {}, preloadImage: async (url: string) => { urls.push(url); } };
    await expect(waitForStudioCaptureReady(options)).resolves.toBe(stage);
    expect(urls).toEqual(["blob:render-only"]);
    expect(page.elements[0]?.src).toBe(source);
    await expect(waitForStudioCaptureReady({ ...options, preloadImage: async () => { state = null; } })).rejects.toMatchObject({ code: "asset-load" });
    await expect(waitForStudioCaptureReady(options)).rejects.toMatchObject({ code: "asset-load" });
    expect(() => collectStudioCaptureAssetSources({ elements: [{ ...ready.source, id: "other" }] })).toThrow();
  });

  it("keeps hydration scoped to an authenticated active document viewer", () => {
    const base = {
      workId: "work-1",
      authUserId: "user-1",
      remixId: null,
      documentStatus: "active",
      canView: true,
    };
    expect(resolveStudioWorkAssetHydrationScope(base)).toBe("work-1");
    expect(resolveStudioWorkAssetHydrationScope({ ...base, canView: false })).toBeNull();
    expect(resolveStudioWorkAssetHydrationScope({ ...base, documentStatus: null })).toBeNull();
    expect(resolveStudioWorkAssetHydrationScope({ ...base, authUserId: null })).toBeNull();
    expect(resolveStudioWorkAssetHydrationScope({ ...base, remixId: "remix-1" })).toBeNull();
  });

  it("collects only active supported reference records in deterministic order", () => {
    const references = collectStudioWorkAssetSceneReferences([
      record({ id: "deleted", deleted: true }),
      record({ id: "text", payload: { type: "text", props: {} } }),
      record({ id: "future", payload: { type: "reference", props: { elementType: "future" } } }),
      record({ id: "legacy", payload: { type: "reference", props: { elementType: "image" } } }),
      record(),
    ]);
    expect(references).toEqual([{
      pageId: "page-1",
      orderIndex: 2,
      reference: { assetId: "asset-1", elementType: "image" },
    }]);
    expect(areStudioWorkAssetSceneReferencesEqual(references, structuredClone(references)))
      .toBe(true);
  });

  it("봉인된 6패스는 CAS 원본을 표시하고 잘못된 역할·주소·요소는 일반 에셋 보호를 유지한다", () => {
    const hash = `sha256:${"a".repeat(64)}` as const;
    const props = { elementType: "image", bg3dLtBundleId: "bundle", bg3dLtRole: "tone", bg3dLtRenderMode: "separated",
      bg3dLtBundleReference: { kind: "bg3d-sixpass-bundle", bundleId: "bundle", renderRevisionId: "rev",
        manifestHash: hash, role: "tone", elementId: "asset-1" }, src: studioBg3dSixPassArtifactSourceUri(hash) };
    const collect = (candidate: Record<string, unknown>) =>
      collectStudioWorkAssetSceneReferences([record({ payload: { type: "reference", props: candidate } })]);
    const references = collect(props);
    expect(references).toEqual([]);
    const image = { id: "asset-1", type: "image", src: props.src };
    expect(projectStudioWorkAssetPageForRender({ pageId: "page-1", elements: [image], references,
      resolveState: () => null, hydrationRevision: 1 })).toEqual({ elements: [image], placeholders: [] });
    expect(collect({ ...props, bg3dLtRole: "color" })).toHaveLength(1);
    expect(collect({ ...props, src: "data:image/png;base64,AAAA" })).toHaveLength(1);
    expect(collect({ ...props, bg3dLtBundleReference: { ...props.bg3dLtBundleReference, elementId: "other" } })).toHaveLength(1);
  });

  it("leaves a topology-only legacy reference and its real local source untouched", () => {
    const persistent = [{
      id: "asset-1",
      type: "image",
      src: "data:image/png;base64,legacy-local-body",
      x: 10,
      y: 20,
      width: 300,
      height: 400,
      rotation: 0,
    }];
    const references = collectStudioWorkAssetSceneReferences([
      record({ payload: { type: "reference", props: { elementType: "image" } } }),
    ]);
    let hydrationReads = 0;
    const projected = projectStudioWorkAssetPageForRender({
      pageId: "page-1",
      elements: persistent,
      references,
      hydrationRevision: 1,
      resolveState: () => {
        hydrationReads += 1;
        return null;
      },
    });

    expect(references).toEqual([]);
    expect(hydrationReads).toBe(0);
    expect(projected.elements).toEqual(persistent);
    expect(projected.elements[0]).toBe(persistent[0]);
    expect(projected.placeholders).toEqual([]);
    expect(projected.elements[0]?.src).toContain("legacy-local-body");
  });

  it("uses a Blob URL only in the returned render element and preserves the stable source", () => {
    const persistent = [{
      id: "asset-1",
      type: "image",
      src: "work-asset://image/asset-1",
      x: 10,
      y: 20,
      width: 300,
      height: 400,
      rotation: 0,
    }];
    const references = collectStudioWorkAssetSceneReferences([record()]);
    const projected = projectStudioWorkAssetPageForRender({
      pageId: "page-1",
      elements: persistent,
      references,
      hydrationRevision: 2,
      resolveState: () => ready,
    });

    expect(projected.elements[0]?.src).toBe("blob:render-only");
    expect(persistent[0]!.src).toBe("work-asset://image/asset-1");
    expect(projected.placeholders).toEqual([]);
  });

  it("renders inert loading/error placeholders without persisting their state", () => {
    const persistent = [{
      id: "asset-1",
      type: "image",
      src: "work-asset://image/asset-1",
      x: 10,
      y: 20,
      width: 300,
      height: 400,
      rotation: 0,
    }];
    const references = collectStudioWorkAssetSceneReferences([record()]);
    const error: StudioWorkAssetHydrationState = {
      status: "error",
      reference: { assetId: "asset-1", elementType: "image" },
      placeholder: { assetId: "asset-1", elementType: "image", label: "오류" },
      code: "missing",
      message: "원본 없음",
    };
    const projected = projectStudioWorkAssetPageForRender({
      pageId: "page-1",
      elements: persistent,
      references,
      hydrationRevision: 3,
      resolveState: () => error,
    });

    expect(projected.elements).toEqual([]);
    expect(projected.placeholders[0]).toMatchObject({
      assetId: "asset-1",
      status: "error",
      x: 10,
      y: 20,
      message: "원본 없음",
    });
    expect(JSON.stringify(persistent)).not.toContain("원본 없음");
  });

  it("hides a stale local data URL until the authoritative server asset is ready", () => {
    const persistent = [{
      id: "asset-1",
      type: "image",
      src: "data:image/png;base64,stale-local-body",
      x: 1,
      y: 2,
      width: 100,
      height: 100,
      rotation: 0,
    }];
    const references = collectStudioWorkAssetSceneReferences([record()]);
    const projected = projectStudioWorkAssetPageForRender({
      pageId: "page-1",
      elements: persistent,
      references,
      hydrationRevision: 1,
      resolveState: () => ({
        status: "loading",
        reference: { assetId: "asset-1", elementType: "image" },
        placeholder: { assetId: "asset-1", elementType: "image", label: "불러오는 중" },
      }),
    });
    expect(projected.elements).toEqual([]);
    expect(projected.placeholders[0]).toMatchObject({ status: "loading", x: 1, y: 2 });
    expect(JSON.stringify(projected)).not.toContain("stale-local-body");
    expect(persistent[0]!.src).toContain("stale-local-body");
  });

  it("materializes a ready remote image for the current render before history catches up", () => {
    const references = collectStudioWorkAssetSceneReferences([record()]);
    const projected = projectStudioWorkAssetPageForRender({
      pageId: "page-1",
      elements: [],
      references,
      hydrationRevision: 4,
      resolveState: () => ready,
    });
    expect(projected.elements[0]).toMatchObject({
      id: "asset-1",
      type: "image",
      src: "blob:render-only",
    });
    expect(projected.placeholders).toEqual([]);
  });

  it("projects Blob URLs into read-only previews without mutating authored CRDT sources", () => {
    const authored = {
      id: "page-1",
      elements: [{
        id: "asset-1",
        type: "image",
        src: "work-asset://image/asset-1",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      }],
    };
    expect(resolveStudioWorkAssetReadableImageSource(authored.elements[0]!, () => ready))
      .toBe("blob:render-only");
    const preview = projectStudioWorkAssetPageForReadOnlyPreview({
      page: authored,
      hydrationRevision: 5,
      resolveState: () => ready,
    });
    expect(preview).not.toBe(authored);
    expect(preview.elements[0]?.src).toBe("blob:render-only");
    expect(authored.elements[0]!.src).toBe("work-asset://image/asset-1");

    const unresolved = projectStudioWorkAssetPageForReadOnlyPreview({
      page: authored,
      hydrationRevision: 6,
      resolveState: () => ({
        status: "loading",
        reference: ready.reference,
        placeholder: { ...ready.reference, label: "불러오는 중" },
      }),
    });
    expect(unresolved).toBe(authored);
    expect(unresolved.elements[0]?.src).toBe("work-asset://image/asset-1");
  });
});
