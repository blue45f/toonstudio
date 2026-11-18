import { describe, expect, it, vi } from "vitest";
import { WorkVrmCutAnchorSchema } from "@toonstudio/contracts/studio-work-vrm-cut";
import { createDefaultStudioBg3dSceneDocument } from "../bg3d/studio-bg3d-scene-document";
import { studioTeamCutVrmDocumentScope } from "../studio-shared-3d-scene-runtime";
import { createStudioVrmSceneDocument } from "../vrm/studio-vrm-scene-document";
import { createStudioScene3dDocument } from "./studio-scene3d-document";
import { createStudioScene3dVersionedCut } from "./studio-scene3d-shot-versions";
import { publishTeamVrmCutLayer, teamVrmCutAnchorId } from "./studio-team-vrm-cut-publish";
import type { ImageEl } from "../studio-element-model";

const write = vi.hoisted(() => vi.fn());
vi.mock("./studio-team-vrm-cut-client", () => ({ writeTeamVrmCut: write }));
vi.mock("../vrm/StudioVrmProjectArchiveAttestationHost", () => ({ requestStudioVrmProjectArchiveUseContext: vi.fn() }));
const layout = { x: 1, y: 2, width: 50, height: 50, rotation: 0 };

describe("팀 컷 원본을 게시할 때의 불변 식별자", () => {
  it("작품·페이지·부모·위치·장면·PNG가 같으면 새 세션에서도 같은 UUIDv8을 사용한다", async () => {
    const png = new Blob(["png"]), first = await teamVrmCutAnchorId("A", "p", "layer", layout, "scene", png);
    expect(WorkVrmCutAnchorSchema.safeParse(first).success).toBe(true);
    expect(first.split("-")[3][0]).toBe("8");
    expect(await teamVrmCutAnchorId("A", "p", "layer", { ...layout }, "scene", new Blob(["png"]))).toBe(first);
    const changed = await Promise.all([
      teamVrmCutAnchorId("B", "p", "layer", layout, "scene", png), teamVrmCutAnchorId("A", "p2", "layer", layout, "scene", png),
      teamVrmCutAnchorId("A", "p", "layer2", layout, "scene", png), teamVrmCutAnchorId("A", "p", "layer", { ...layout, x: 3 }, "scene", png),
      teamVrmCutAnchorId("A", "p", "layer", layout, "next", png), teamVrmCutAnchorId("A", "p", "layer", layout, "scene", new Blob(["new"])),
    ]);
    expect(new Set([first, ...changed]).size).toBe(7);
  });
  it("업로드 응답을 받기 전 탭이 종료되어도 같은 저장 예약을 복구하고 원고 레이어를 한 번만 추가한다", async () => {
    const source = createStudioScene3dDocument("team", "2026-11-19T00:00:00Z");
    const pinnedVersionedCut = createStudioScene3dVersionedCut({ id: "cut", name: "한 컷", scene: source, characters: {},
      linkedVrm: { version: 1, documentScope: studioTeamCutVrmDocumentScope("A", "p"), characters: [{
        elementId: "hero", label: "루미", stageTransform: { position: [0, 0, 0], rotationY: 0 },
        vrmScene: createStudioVrmSceneDocument(),
      }] } });
    const rows = new Map<string, ImageEl>(), add = vi.fn((image: ImageEl) => { rows.set(image.id, image); return true; });
    const publish = () => publishTeamVrmCutLayer({ workId: "A", pageId: "p", session: {}, canvasHeight: 500,
      previous: undefined, current: () => true, existing: id => rows.get(id), add,
      result: { kind: "separated", width: 1, height: 1, layers: [], perspectiveGuides: [],
        compositePngDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNYxeDyHwAENAHuKmjE9gAAAABJRU5ErkJggg==",
        bg3dScene: { ...createDefaultStudioBg3dSceneDocument(), pinnedVersionedCut } } });
    write.mockRejectedValueOnce(new Error("응답 유실")).mockResolvedValue(undefined);
    await expect(publish()).rejects.toThrow("응답 유실");
    expect(add).not.toHaveBeenCalled();
    expect(await publish()).toBe(true);
    expect(await publish()).toBe(true);
    expect(new Set(write.mock.calls.map(([scope]) => scope.anchorId)).size).toBe(1);
    expect(add).toHaveBeenCalledOnce();
  });
});
