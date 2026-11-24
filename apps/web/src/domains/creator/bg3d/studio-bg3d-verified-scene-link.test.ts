import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioBg3dCacheTestRecord } from "./studio-bg3d-model-cache.test-fixture";
import { importVerifiedBg3dModelsAtomicallyV12, resolveBg3dModelHashV12 } from "./studio-bg3d-model-library-loader";
import type { Bg3dVerifiedStoredRecord } from "./studio-bg3d-model-library-loader";
import { createSyntheticGlb } from "./studio-bg3d-skp.test-fixture";
import { STUDIO_BG3D_VERIFIED_LOCAL_SCENES } from "./studio-bg3d-verified-local-scenes";
import { linkStudioBg3dVerifiedScene } from "./studio-bg3d-verified-scene-link";

vi.mock("./studio-bg3d-model-library-loader", async (loadOriginal) => ({
  ...await loadOriginal<typeof import("./studio-bg3d-model-library-loader")>(),
  resolveBg3dModelHashV12: vi.fn(),
  importVerifiedBg3dModelsAtomicallyV12: vi.fn(),
}));

function fixture() {
  const bench = STUDIO_BG3D_VERIFIED_LOCAL_SCENES.find(preset => preset.id === "park-bench");
  if (!bench?.attributionText) throw new Error("벤치의 원안 출처가 필요합니다.");
  const bytes = Uint8Array.from(createSyntheticGlb({ nodes: [{}], bin: null }));
  const hash = `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;
  const scene = { ...bench, byteSize: bytes.byteLength, hash };
  const file = new File([bytes], "renamed.glb", { type: "model/gltf-binary" });
  const base = createStudioBg3dCacheTestRecord("device-bench", hash);
  const record: Bg3dVerifiedStoredRecord = {
    ...base, blob: file, byteSize: bytes.byteLength,
    validatorMetrics: { ...base.validatorMetrics, byteSize: bytes.byteLength },
    sourceRestriction: { version: 1, modelFileExport: "unknown", origin: { kind: "user-file", recordId: base.id, sha256: hash }, parent: null },
    rights: { status: "unknown", commercialUse: false, attributionRequired: true, attribution: bench.attributionText },
  };
  return { bytes, scene, file, record };
}

beforeEach(() => {
  vi.mocked(resolveBg3dModelHashV12).mockReset().mockResolvedValue({ record: null, deletionReceipt: null });
  vi.mocked(importVerifiedBg3dModelsAtomicallyV12).mockReset();
});

describe("3D 장면과 기기의 GLB 연결", () => {
  it("파일명과 바이트 수만 맞는 파일은 라이브러리에 쓰거나 기존 장면에 연결하지 않는다", async () => {
    const { scene, bytes } = fixture();
    bytes[0] = 0;
    await expect(linkStudioBg3dVerifiedScene(scene, new File([bytes], scene.fileName))).rejects.toThrow(/SHA-256/);
    expect(resolveBg3dModelHashV12).not.toHaveBeenCalled();
    expect(importVerifiedBg3dModelsAtomicallyV12).not.toHaveBeenCalled();
  });

  it("파일 누락 후 이름이 바뀐 올바른 GLB로 재시도하면 원안 출처와 내보내기 제한을 함께 등록한다", async () => {
    const { scene, file, record } = fixture();
    await expect(linkStudioBg3dVerifiedScene(scene, null)).rejects.toThrow();
    expect(importVerifiedBg3dModelsAtomicallyV12).not.toHaveBeenCalled();
    vi.mocked(importVerifiedBg3dModelsAtomicallyV12).mockResolvedValue([record]);
    const entry = await linkStudioBg3dVerifiedScene(scene, file);
    expect(importVerifiedBg3dModelsAtomicallyV12).toHaveBeenCalledWith([{
      file, expectedSha256: scene.hash, rights: record.rights,
      ingress: { kind: "user-file", modelFileExport: "unknown" },
    }], expect.anything());
    expect(entry.document.attachments[0]).toMatchObject({ hash: scene.hash, rights: record.rights });
    expect(entry.commercialUse).toBe(false);
    vi.mocked(resolveBg3dModelHashV12).mockResolvedValue({ record, deletionReceipt: null });
    const reused = await linkStudioBg3dVerifiedScene(scene, null);
    expect(reused.document).toEqual(entry.document);
    expect(importVerifiedBg3dModelsAtomicallyV12).toHaveBeenCalledTimes(1);
  });

  it("기존 기록의 출처 문구와 별도 허가는 덮어쓰지 않고, 필수 저작자가 빠지면 적용을 거부한다", async () => {
    const { scene, record } = fixture();
    const existing: Bg3dVerifiedStoredRecord = {
      ...record,
      rights: { status: "licensed", commercialUse: true, attributionRequired: true, licenseName: "개별 허가",
        attribution: "WOODEN PARK BENCH / BLUE45F · 경량화 · VARCO 3D · CC BY 4.0 · 작품 내 추가 표기" },
      sourceRestriction: { version: 1, modelFileExport: "allowed",
        origin: { kind: "user-file", recordId: record.id, sha256: record.contentHash }, parent: null },
    };
    vi.mocked(resolveBg3dModelHashV12).mockResolvedValue({ record: existing, deletionReceipt: null });
    const entry = await linkStudioBg3dVerifiedScene(scene, null);
    expect(entry.document.attachments[0]?.rights).toEqual(existing.rights);
    expect(entry.commercialUse).toBe(true);

    const withoutCreator = { ...existing, rights: { ...existing.rights, attribution: "Wooden Park Bench, VARCO 3D, CC BY 4.0; 경량화" } };
    vi.mocked(resolveBg3dModelHashV12).mockResolvedValue({ record: withoutCreator, deletionReceipt: null });
    await expect(linkStudioBg3dVerifiedScene(scene, null)).rejects.toThrow(/출처/);
    expect(importVerifiedBg3dModelsAtomicallyV12).not.toHaveBeenCalled();
  });
});
