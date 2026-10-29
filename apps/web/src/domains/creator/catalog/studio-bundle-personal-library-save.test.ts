import { beforeEach, describe, expect, it, vi } from "vitest";

import { saveStudioBundleToPersonalLibrary } from "./studio-bundle-personal-library-save";
import { requireStudioBundleSourceCredit } from "./studio-bundle-source-credit";

import type { StudioAsset, StudioAssetContentHash, StudioAssetSaveInput } from "../studio-asset-library";

const persistence = vi.hoisted(() => ({find: vi.fn(), save: vi.fn()}));
vi.mock("../studio-asset-library", async (importOriginal) => ({
  ...await importOriginal<typeof import("../studio-asset-library")>(),
  findStudioAssetCandidatesByContentIdentity: persistence.find,
  saveAsset: persistence.save,
}));

const HASH: StudioAssetContentHash = `sha256:${"a".repeat(64)}`;
function record(): StudioAsset {
  const credit = requireStudioBundleSourceCredit({
    schema: "toonstudio.bundle-source-credit.v1", assetId: "cbv1-008-bench-1-1",
    ledgerPackId: "cbv1-008-cute-park-pack", contentHash: HASH,
    renderPath: "/assets/studio/bundle-renders-v1/assets/cbv1-008-bench-1-1/prop.webp",
    sourceUrl: "https://rg-poly.itch.io/cute-park-pack", provider: "RG Poly",
    licenseId: "CC0-1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    licenseName: "CC0-1.0", serve: "allow", status: "public-domain",
    commercialUse: true, attributionRequired: false,
  });
  return {
    id: "bundle:cbv1-008-bench-1-1", name: "공원 벤치", dataUrl: "data:image/webp;base64,YQ==",
    width: 1536, height: 1536, contentHash: HASH, createdAt: 1, kind: "imported", bundleSourceCredit: credit,
    rights: {sourceKind: "imported", sourceId: credit.assetId, licenseId: `creator-bundle-ledger:${credit.ledgerPackId}`,
      licenseLabel: "CC0-1.0", licenseUrl: credit.licenseUrl, attributionRequired: false,
      attributionText: "RG Poly — https://rg-poly.itch.io/cute-park-pack", rightsConfirmed: true},
  };
}

beforeEach(() => {
  persistence.find.mockReset().mockResolvedValue([]);
  persistence.save.mockReset().mockImplementation(async (input: StudioAssetSaveInput) => ({...record(), ...input, id: "personal-asset-001", contentHash: HASH}));
});

describe("번들 렌더의 개인 라이브러리 저장", () => {
  it("검증된 콘텐츠 해시·권리·출처 기록을 기존 제품 저장 포트에 함께 전달한다", async () => {
    const incoming = record();
    const result = await saveStudioBundleToPersonalLibrary(incoming);
    expect(persistence.find).toHaveBeenCalledWith({contentHash: HASH, signal: undefined});
    expect(persistence.save).toHaveBeenCalledExactlyOnceWith({
      name: incoming.name, dataUrl: incoming.dataUrl, width: 1536, height: 1536,
      kind: "imported", contentHash: HASH, rights: incoming.rights, bundleSourceCredit: incoming.bundleSourceCredit,
    });
    expect(result.reused).toBe(false);
    expect(result.asset.id).toBe("personal-asset-001");
    expect(result.asset.bundleSourceCredit?.assetId).toBe("cbv1-008-bench-1-1");
  });

  it("같은 콘텐츠·권리·출처이면 사용자가 바꾼 이름과 저장 id를 보존해 재사용한다", async () => {
    const existing = {...record(), id: "already-saved", name: "내가 이름을 바꾼 벤치"};
    persistence.find.mockResolvedValue([existing]);
    const result = await saveStudioBundleToPersonalLibrary(record());
    expect(result).toEqual({asset: existing, reused: true});
    expect(persistence.save).not.toHaveBeenCalled();
  });

  it.each(["missing-credit", "different-source", "different-rights", "different-hash"])("해시만 같은 다른 기록을 중복으로 합치지 않는다 (%s)", async difference => {
    const candidate = record();
    if (difference === "missing-credit") delete candidate.bundleSourceCredit;
    if (difference === "different-source") candidate.bundleSourceCredit = requireStudioBundleSourceCredit({
      ...candidate.bundleSourceCredit, sourceUrl: "https://rg-poly.itch.io/farmland",
    });
    if (difference === "different-rights") candidate.rights = {...candidate.rights, sourceKind: "unknown", sourceId: null, licenseId: "different", licenseLabel: "다른 권리",
      licenseUrl: null, attributionRequired: false, attributionText: "", rightsConfirmed: true};
    if (difference === "different-hash") candidate.contentHash = `sha256:${"b".repeat(64)}`;
    persistence.find.mockResolvedValue([candidate]);
    const result = await saveStudioBundleToPersonalLibrary(record());
    expect(result.reused).toBe(false);
    expect(persistence.save).toHaveBeenCalledTimes(1);
  });

  it("CC0라는 표시 이름만 있고 typed 출처 기록이 없는 입력은 저장하지 않는다", async () => {
    const incoming = record();
    delete incoming.bundleSourceCredit;
    await expect(saveStudioBundleToPersonalLibrary(incoming)).rejects.toThrow();
    expect(persistence.find).not.toHaveBeenCalled();
    expect(persistence.save).not.toHaveBeenCalled();
  });

  it("중복 조회 중 취소되면 새 저장을 시작하지 않는다", async () => {
    const controller = new AbortController();
    persistence.find.mockImplementation(async () => {controller.abort(); return [];});
    await expect(saveStudioBundleToPersonalLibrary(record(), controller.signal)).rejects.toMatchObject({name: "AbortError"});
    expect(persistence.save).not.toHaveBeenCalled();
  });

  it("저장 포트가 출처 기록을 잃은 결과를 반환하면 성공으로 보고하지 않는다", async () => {
    const incomplete = record();
    delete incomplete.bundleSourceCredit;
    persistence.save.mockResolvedValue(incomplete);
    await expect(saveStudioBundleToPersonalLibrary(record())).rejects.toThrow("권리·출처 기록을 확인하지 못했습니다");
  });

  it("저장 실패를 자동 재시도하거나 메모리 성공으로 바꾸지 않는다", async () => {
    persistence.save.mockRejectedValue(new Error("storage unavailable"));
    await expect(saveStudioBundleToPersonalLibrary(record())).rejects.toThrow("storage unavailable");
    expect(persistence.save).toHaveBeenCalledTimes(1);
  });
});
