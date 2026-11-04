import { expect, it } from "vitest";
import { createBg3dBundleProjectFixture } from "../../../bg3d/studio-bg3d-bundle-project.test-fixture";
import { studioBg3dSixPassEditReason } from "./studio-bg3d-six-pass-edit-guard";
import { studioBg3dSixPassManifestHash } from "./studio-bg3d-six-pass-manifest-hash";
import { hashStudioBg3dSixPassBundleManifest, studioBg3dSixPassArtifactSourceUri } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import type { El } from "../../../studio-element-model";
import type { PageState } from "../../../studio-page-state";

it.each(["detach-group", "move-group", "replace-pixels", "drop-marker", "change-role", "change-id", "change-hash", "remove-group"])("native %s는 원본 입장 없이 허용하지 않는다", async (operation) => {
  const fixture = await createBg3dBundleProjectFixture();
  const before: PageState = fixture.project.pagesList[0];
  const image = before.elements[0];
  if (image?.type !== "image") throw new Error("fixture 이미지가 없습니다.");
  const changed: Extract<El, { type: "image" }> = { ...image };
  if (operation === "detach-group") delete changed.groupId;
  if (operation === "move-group") changed.groupId = "different-group";
  if (operation === "replace-pixels") changed.src = "data:image/png;base64,AA==";
  if (operation === "drop-marker") { changed.bg3dLtBundleReference = undefined; changed.src = "data:image/png;base64,AA=="; }
  if (operation === "change-role") changed.bg3dLtRole = "shadow";
  if (operation === "change-id") changed.id = "different-element";
  if (operation === "change-hash" && changed.bg3dLtBundleReference) changed.bg3dLtBundleReference = { ...changed.bg3dLtBundleReference, manifestHash: `sha256:${"f".repeat(64)}` };
  const next: PageState = { ...before, elements: [changed, ...before.elements.slice(1)], groups: operation === "remove-group" ? [] : before.groups };
  expect(studioBg3dSixPassEditReason(before, next)).toContain("그룹·역할·픽셀");
});
it("레이어 삭제와 작가의 명칭·배치·opacity·blend·visible 편집을 유지한다", async () => {
  const fixture = await createBg3dBundleProjectFixture(), before = fixture.project.pagesList[0];
  const next = { ...before, elements: before.elements.slice(1).map((element) => ({ ...element, name: "작가 이름", x: 10, y: 20,
    opacity: .35, blendMode: "screen" as const, hidden: false })) };
  expect(studioBg3dSixPassEditReason(before, next)).toBeNull();
  expect(studioBg3dSixPassEditReason(before, { ...before, elements: [] })).toBeNull();
});
it("정상 봉인 recapture와 가벼운 canonical hash가 기존 계약과 일치한다", async () => {
  const fixture = await createBg3dBundleProjectFixture(true), next = fixture.project.pagesList[0], previous = fixture.state.bundles[0].revisions[0];
  const manifestHash = hashStudioBg3dSixPassBundleManifest(previous);
  const before = { ...next, bg3dLtBundles: { ...fixture.state, bundles: [{ ...fixture.state.bundles[0], activeRevisionId: previous.renderRevisionId }] },
    elements: next.elements.map((element) => {
      const layer = previous.layers.find((entry) => entry.elementId === element.id)!;
      return { ...element, src: layer.role === "main-line" ? `studio-opfs-cas:${layer.artifact.contentHash}` : studioBg3dSixPassArtifactSourceUri(layer.artifact.contentHash),
        bg3dLtBundleReference: { ...element.bg3dLtBundleReference!, manifestHash, renderRevisionId: previous.renderRevisionId } };
    }) };
  expect(studioBg3dSixPassEditReason(before, next)).toBeNull();
  expect(studioBg3dSixPassManifestHash(fixture.manifest)).toBe(hashStudioBg3dSixPassBundleManifest(fixture.manifest));
});
