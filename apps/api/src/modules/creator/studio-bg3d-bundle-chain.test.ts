import { ConflictException, PayloadTooLargeException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { STUDIO_BG3D_SIX_PASS_STATE_MAX_BYTES } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { bg3dBundleFixture } from "./studio-bg3d-bundle.test-fixture";
import { assertStudioBg3dBundleChainByteCount, assertStudioBg3dBundleChainBytes, buildStudioBg3dBundleSealedChain } from "./studio-bg3d-bundle-chain";

const key = { workId: "work-one", bundleId: "bundle-one" };
describe("봉인 이력의 읽기·다음 준비 경계", () => {
  it("비어 있는 새 bundle과 순서가 섞인 완전한 단일 chain을 반환한다", () => {
    expect(buildStudioBg3dBundleSealedChain(key, [])).toEqual({ version: 1, ...key, sealedTipRevisionId: null, revisions: [] });
    const first = bg3dBundleFixture().manifest, second = bg3dBundleFixture("revision-two", first.renderRevisionId).manifest;
    const result = buildStudioBg3dBundleSealedChain(key, [second, first]);
    expect(result.sealedTipRevisionId).toBe(second.renderRevisionId); expect(result.revisions).toEqual([first, second]);
    expect(JSON.stringify(result)).not.toMatch(/objectPath|signedRead|providerId|data:image/);
  });
  it("fork·부모 누락·중복·분리 cycle·다른 bundle의 부분 registry를 거부한다", () => {
    const first = bg3dBundleFixture().manifest, second = bg3dBundleFixture("revision-two", first.renderRevisionId).manifest;
    for (const revisions of [
      [first, second, { ...second, renderRevisionId: "sibling" }], [second], [first, first],
      [first, { ...second, renderRevisionId: "cycle-a", parentRevisionId: "cycle-b" }, { ...second, renderRevisionId: "cycle-b", parentRevisionId: "cycle-a" }],
      [{ ...first, bundleId: "other-bundle" }],
    ]) expect(() => buildStudioBg3dBundleSealedChain(key, revisions)).toThrow(ConflictException);
  });
  it("부모와 역할 ID·group·line revision이 다른 chain은 읽기 단계에서 거부한다", () => {
    const first = bg3dBundleFixture().manifest, second = bg3dBundleFixture("revision-two", first.renderRevisionId).manifest;
    for (const changed of [{ ...second, groupId: "other-group" }, { ...second, linePassRevision: 2 },
      { ...second, layers: second.layers.map((layer) => ({ ...layer, elementId: `new-${layer.elementId}` })), anchorElementId: "new-element-main-line" }])
      expect(() => buildStudioBg3dBundleSealedChain(key, [first, changed])).toThrow(ConflictException);
  });
  it("임의 횟수 cap 없이 정확한 UTF-8 bytes로 16MiB를 제한한다", () => {
    expect(() => assertStudioBg3dBundleChainByteCount(STUDIO_BG3D_SIX_PASS_STATE_MAX_BYTES)).not.toThrow();
    expect(() => assertStudioBg3dBundleChainByteCount(STUDIO_BG3D_SIX_PASS_STATE_MAX_BYTES + 1)).toThrow(PayloadTooLargeException);
    expect(() => assertStudioBg3dBundleChainBytes("가".repeat(Math.floor(STUDIO_BG3D_SIX_PASS_STATE_MAX_BYTES / 3) + 1))).toThrow(PayloadTooLargeException);
    const first = bg3dBundleFixture().manifest;
    const revisions = Array.from({ length: 257 }, (_, index) => ({ ...first, renderRevisionId: `revision-${index}`,
      parentRevisionId: index ? `revision-${index - 1}` : null }));
    expect(buildStudioBg3dBundleSealedChain(key, revisions).revisions).toHaveLength(257);
  });
});
