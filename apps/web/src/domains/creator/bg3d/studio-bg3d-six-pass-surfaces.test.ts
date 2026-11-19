import { describe, expect, it, vi } from "vitest";
import { bindStudioBg3dRenderedImage } from "../studio-cuttoon-editor/studio-cuttoon-bg3d-insert";
import { createStudioBg3dShotBatchPlan } from "./studio-bg3d-shot-batch-plan";
import { createDefaultStudioBg3dSceneDocument, normalizeStudioBg3dSceneDocument, serializeStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { DEFAULT_STUDIO_BG3D_SIX_PASS_LT_SETTINGS } from "../contracts/studio-bg3d-six-pass-settings";
import { createStudioScene3dDocument } from "../scene3d/studio-scene3d-document";
import { createStudioScene3dVersionedCut } from "../scene3d/studio-scene3d-shot-versions";
import { studioCutVrmDocumentScope, studioTeamCutVrmDocumentScope } from "../studio-shared-3d-scene-runtime";
import { createStudioVrmSceneDocument } from "../vrm/studio-vrm-scene-document";
import type { StudioBackground3DInsertResult } from "../scene-3d/studio-3d-insert-contract";

function scene() {
  const base = createDefaultStudioBg3dSceneDocument();
  return normalizeStudioBg3dSceneDocument({ ...base, output: { ...base.output, sixPassLt: DEFAULT_STUDIO_BG3D_SIX_PASS_LT_SETTINGS } });
}

describe("6패스 LT 지원 표면 경계", () => {
  it("문서 마스터는 6패스를 병합 저장으로 바꾸지 않고 거부한다", async () => {
    const commit = vi.fn();
    const setError = vi.fn();
    const insert = bindStudioBg3dRenderedImage({ isRealtimeTeamSession: false, masterEditMode: true,
      activePage: { id: "master-page", elements: [] }, cutDocumentKey: "master-draft",
      bg3dMutationTicketRef: { current: null },
      setError, setStatusNotice: vi.fn(), commit });
    const result: StudioBackground3DInsertResult = {
      kind: "separated", width: 1, height: 1, layers: [], compositePngDataUrl: "data:image/png;base64,AA==",
      perspectiveGuides: [], bg3dScene: scene(),
    };
    expect(await insert(result)).toBe(false);
    expect(setError).toHaveBeenLastCalledWith(expect.stringContaining("6패스 묶음 v1은 일반 원고"));
    expect(commit).not.toHaveBeenCalled();
  });

  it.each([
    { scope: "로컬 원고", workId: undefined, documentScope: studioCutVrmDocumentScope("other-document", "page-a") },
    { scope: "팀 페이지", workId: "work-a", documentScope: studioTeamCutVrmDocumentScope("work-a", "other-page") },
  ])("고정 VRM의 $scope 범위가 다르면 원고와 레이어 변경 전에 거부한다", async ({ workId, documentScope }) => {
    if (!documentScope) throw new Error("고정 VRM 회귀의 문서 범위가 없습니다.");
    const commit = vi.fn(), addEl = vi.fn(), patchEl = vi.fn(), setError = vi.fn();
    const insert = bindStudioBg3dRenderedImage({ isRealtimeTeamSession: false, masterEditMode: true,
      setError, setStatusNotice: vi.fn(), commit, addEl, patchEl, workId,
      cutDocumentKey: "document-a", activePage: { id: "page-a" } });
    const pinnedVersionedCut = createStudioScene3dVersionedCut({ id: "cut", name: "고정 컷",
      scene: createStudioScene3dDocument("scope-guard", "2026-11-18T00:00:00Z"), characters: {},
      linkedVrm: { version: 1, documentScope, characters: [{ elementId: "hero", label: "주인공",
        stageTransform: { position: [0, 0, 0], rotationY: 0 }, vrmScene: createStudioVrmSceneDocument() }] } });
    const result: StudioBackground3DInsertResult = {
      kind: "separated", width: 1, height: 1, layers: [], compositePngDataUrl: "data:image/png;base64,AA==",
      perspectiveGuides: [], bg3dScene: { ...scene(), pinnedVersionedCut },
    };
    expect(await insert(result)).toBe(false);
    expect(setError).toHaveBeenLastCalledWith("고정한 VRM 컷과 현재 원고·페이지가 달라 적용하지 않았습니다.");
    expect(commit).not.toHaveBeenCalled();
    expect(addEl).not.toHaveBeenCalled();
    expect(patchEl).not.toHaveBeenCalled();
  });

  it("컷 배치 계획은 6패스 장면을 기존 LT로 내려 출력하지 않는다", async () => {
    const revision = serializeStudioBg3dSceneDocument(scene());
    if (!revision) throw new Error("6패스 테스트 장면 직렬화 실패");
    const result = await createStudioBg3dShotBatchPlan([{ id: "shot-a", name: "첫 컷" }], {
      sourceRevision: revision, scope: { durability: "memory", authUserId: "anonymous", workId: "local-draft", pageId: "page-a", elementId: "new-bg3d" },
      capture: { owner: { backend: "three-webgl", engineId: "three", engineRevision: "186", implementationRevision: "test", graphicsApi: "webgl2",
        profileId: "test", sourceWidth: 1, sourceHeight: 1, maxPixels: 1, maxEdge: 1, deviceProfile: "desktop", textureScale: 1, lodBias: 0,
        ltPipelineId: "test", pngEncodingId: "test", psdEncodingId: "test" }, shots: [] },
    });
    expect(result).toEqual({ ok: false, code: "invalid-pass", subcode: "sixPassUnsupported" });
  });
});
