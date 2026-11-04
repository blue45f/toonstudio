import { describe, expect, it, vi } from "vitest";
import { bindStudioBg3dRenderedImage } from "../studio-cuttoon-editor/studio-cuttoon-bg3d-insert";
import { createStudioBg3dShotBatchPlan } from "./studio-bg3d-shot-batch-plan";
import { createDefaultStudioBg3dSceneDocument, normalizeStudioBg3dSceneDocument, serializeStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { DEFAULT_STUDIO_BG3D_SIX_PASS_LT_SETTINGS } from "../contracts/studio-bg3d-six-pass-settings";
import type { StudioBackground3DInsertResult } from "../scene-3d/studio-3d-insert-contract";

function scene() {
  const base = createDefaultStudioBg3dSceneDocument();
  return normalizeStudioBg3dSceneDocument({ ...base, output: { ...base.output, sixPassLt: DEFAULT_STUDIO_BG3D_SIX_PASS_LT_SETTINGS } });
}

describe("6패스 LT 지원 표면 경계", () => {
  it.each(["realtime", "master"])("%s 표면에서 6패스를 병합 저장으로 바꾸지 않고 거부한다", async (surface) => {
    const commit = vi.fn();
    const setError = vi.fn();
    const insert = bindStudioBg3dRenderedImage({ isRealtimeTeamSession: surface === "realtime", masterEditMode: surface === "master",
      setError, setStatusNotice: vi.fn(), commit });
    const result: StudioBackground3DInsertResult = {
      kind: "separated", width: 1, height: 1, layers: [], compositePngDataUrl: "data:image/png;base64,AA==",
      perspectiveGuides: [], bg3dScene: scene(),
    };
    expect(await insert(result)).toBe(false);
    expect(setError).toHaveBeenLastCalledWith(expect.stringContaining("6패스 LT의 분리 레이어는 일반 페이지"));
    expect(commit).not.toHaveBeenCalled();
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
