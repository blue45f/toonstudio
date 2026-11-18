import { beforeEach, expect, it, vi } from "vitest";

import { createBg3dBundleProjectFixture } from "../../bg3d/studio-bg3d-bundle-project.test-fixture";
import type { StudioBackground3DInsertResult } from "../../scene-3d/studio-3d-insert-contract";
import { createStudioShared3dSceneSession } from "../../studio-shared-3d-scene-bridge";
import { studioTeamCutVrmDocumentScope } from "../../studio-shared-3d-scene-runtime";
import { createStudioVrmSceneDocument } from "../../vrm/studio-vrm-scene-document";
import { createStudioScene3dDocument } from "../studio-scene3d-document";
import { createStudioScene3dVersionedCut } from "../studio-scene3d-shot-versions";
import { sealStudioSixPassVrmSource, studioFrozenSixPassRevisionKey } from "./studio-bg3d-six-pass-vrm-source";

const { read, write, capabilities } = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), capabilities: vi.fn() }));
vi.mock("../studio-team-vrm-cut-client", () => ({ readTeamVrmCutReceipt: read, writeTeamVrmCut: write }));
vi.mock("./studio-bg3d-six-pass-bundle-api", () => ({ getStudioBg3dSixPassRemoteCapabilities: capabilities }));
const ref = { anchorId: "vrmcut-11111111-1111-8111-a111-111111111111", sceneSha256: "a".repeat(64), compositeSha256: "b".repeat(64) };
async function take(): Promise<StudioBackground3DInsertResult> {
  const { scene, manifest, authority } = await createBg3dBundleProjectFixture();
  const vrmScene = createStudioVrmSceneDocument();
  const actor = { elementId: "hero", label: "루미", stageTransform: { position: [0, 0, 0] as const, rotationY: 0 }, vrmScene };
  const pinnedVersionedCut = createStudioScene3dVersionedCut({ id: "pinned", name: "원본", characters: {}, scene: createStudioScene3dDocument("work", "2026-11-19T00:00:00Z"),
    linkedVrm: { version: 1, documentScope: studioTeamCutVrmDocumentScope("work", "page-1"), characters: [actor] } });
  const [runtime] = createStudioShared3dSceneSession([{ ...actor, scene: vrmScene }]).characters;
  const layers = await Promise.all(manifest.layers.map(async ({ role, artifact }) => ({ role, width: 1, height: 1,
    pngDataUrl: `data:image/png;base64,${Buffer.from((await authority.get(artifact.contentHash))!).toString("base64")}` })));
  return { kind: "separated", width: 1, height: 1, layers, compositePngDataUrl: layers[0].pngDataUrl, perspectiveGuides: [],
    bg3dScene: { ...scene, pinnedVersionedCut }, frozenVrmSixPassCapture: { sourceHash: pinnedVersionedCut.sourceHash,
      actors: [{ elementId: actor.elementId, sourceHash: runtime.sourceHash, placementHash: runtime.placementHash, pixels: 1 }] } };
}
beforeEach(() => { vi.resetAllMocks(); capabilities.mockResolvedValue({ enabled: true, readerCapability: "bg3d-sixpass-bundle.v2" }); });

it("기존 팀 컷의 실제 모델·채색·배치가 일치하면 새 레이어나 모델 업로드 없이 영수증을 재사용한다", async () => {
  const result = await take();
  read.mockResolvedValue({ scene: result.bg3dScene, sceneSha256: ref.sceneSha256, manifest: { sha256: ref.compositeSha256 } });
  const input = { workId: "work", pageId: "page-1", current: () => true, result, previous: ref };
  expect(await sealStudioSixPassVrmSource(input)).toEqual(ref);
  expect(read).toHaveBeenCalledWith({ workId: "work", pageId: "page-1", anchorId: ref.anchorId }, expect.any(AbortSignal));
  expect(write).not.toHaveBeenCalled();
  await expect(sealStudioSixPassVrmSource({ ...input, previous: { ...ref, sceneSha256: "c".repeat(64) } })).rejects.toThrow(/영수증/);
  const scope = { workId: "work", pageId: "page-1", targetId: ref.anchorId };
  const key = await studioFrozenSixPassRevisionKey(result, scope);
  expect(await studioFrozenSixPassRevisionKey(result, scope)).toBe(key);
  expect(await studioFrozenSixPassRevisionKey(result, { ...scope, parent: "r2" })).not.toBe(key);
  expect(await studioFrozenSixPassRevisionKey({ ...result, layers: result.layers.slice(1) }, scope)).not.toBe(key);
});
it("구 서버·회수된 권한·픽셀 없는 배우는 원본을 업로드하기 전에 중단한다", async () => {
  const result = await take();
  const input = { workId: "work", pageId: "page-1", result, current: () => true };
  capabilities.mockResolvedValueOnce({ enabled: true, readerCapability: "bg3d-sixpass-bundle.v1" });
  await expect(sealStudioSixPassVrmSource(input)).rejects.toThrow(/서버/);
  let current = true; capabilities.mockImplementation(async () => { current = false; return { enabled: true, readerCapability: "bg3d-sixpass-bundle.v2" }; });
  await expect(sealStudioSixPassVrmSource({ ...input, current: () => current })).rejects.toThrow(/권한/);
  await expect(sealStudioSixPassVrmSource({ ...input, result: { ...result, frozenVrmSixPassCapture: { ...result.frozenVrmSixPassCapture!,
    actors: result.frozenVrmSixPassCapture!.actors.map(actor => ({ ...actor, pixels: 0 })) } } })).rejects.toThrow(/화면/);
  expect(write).not.toHaveBeenCalled();
});
