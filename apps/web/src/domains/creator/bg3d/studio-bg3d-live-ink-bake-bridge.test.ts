import { describe, expect, it, vi } from "vitest";

import {
  buildBakedManuscriptCutLayer,
  clampInkLineWeight,
  clampSplitWipeRatio,
  clearBakedManuscriptCutLayers,
  listBakedManuscriptCutLayers,
  saveBakedManuscriptCutLayer,
  STUDIO_BG3D_BAKED_CUT_STORAGE_KEY_PREFIX,
} from "./studio-bg3d-live-ink-bake-bridge";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
    clear: () => { values.clear(); },
    key: index => [...values.keys()][index] ?? null,
  };
}

function bakedLayer(documentId: string, cut = 0) {
  const result = buildBakedManuscriptCutLayer({
    capture: { sceneId: "scene", cameraId: "camera", stage: "live-ink", widthPx: 800, heightPx: 600,
      inkPassRef: "opfs://ink.png", shadedPassRef: "opfs://shaded.png", inkLineWeightPx: 1.5,
      assetIds: ["licensed-asset"], capturedAt: "2026-11-21T00:00:00.000Z", sceneDocumentJson: "scene-copy" },
    targetDocumentId: documentId, targetCutIndex: cut, previewMode: "split-wipe", splitWipeRatio: 0.5,
  });
  if (!result.ok) throw new Error(result.messageKo);
  return result.layer;
}

describe("3D 인계 사본의 문서 범위와 저장 실패 보존", () => {
  it("최초 읽기가 실패하면 재읽기로 덮어쓰지 않고 재시도에서 기존·메모리 사본을 합친다", () => {
    const storage = memoryStorage(), doc = "bake-transient-read", key = `${STUDIO_BG3D_BAKED_CUT_STORAGE_KEY_PREFIX}${doc}`;
    const saved = [bakedLayer(doc, 0), bakedLayer(doc, 1)], fresh = bakedLayer(doc, 2);
    const original = JSON.stringify(saved);
    clearBakedManuscriptCutLayers(doc, null);
    storage.setItem(key, original);
    const read = vi.spyOn(storage, "getItem").mockImplementationOnce(() => { throw new Error("일시적 읽기 거부"); });
    const write = vi.spyOn(storage, "setItem");
    expect(saveBakedManuscriptCutLayer(fresh, storage)).toEqual({ persistedToStorage: false, totalLayers: 1 });
    expect(read).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
    expect(storage.getItem(key)).toBe(original);
    expect(listBakedManuscriptCutLayers(doc, storage)).toEqual([fresh]);
    expect(saveBakedManuscriptCutLayer(fresh, storage)).toEqual({ persistedToStorage: true, totalLayers: 3 });
    expect(JSON.parse(storage.getItem(key) ?? "null")).toEqual([fresh, ...saved]);
    clearBakedManuscriptCutLayers(doc, null);
    expect(listBakedManuscriptCutLayers(doc, storage)).toEqual([fresh, ...saved]);
  });

  it("메모리 캐시 뒤에 저장된 다른 사본도 최신 읽기와 합쳐 보존한다", () => {
    const storage = memoryStorage(), doc = "bake-stale-cache", key = `${STUDIO_BG3D_BAKED_CUT_STORAGE_KEY_PREFIX}${doc}`;
    const first = bakedLayer(doc, 0), external = bakedLayer(doc, 1), fresh = bakedLayer(doc, 2);
    saveBakedManuscriptCutLayer(first, storage);
    storage.setItem(key, JSON.stringify([external, first]));
    expect(saveBakedManuscriptCutLayer(fresh, storage)).toEqual({ persistedToStorage: true, totalLayers: 3 });
    const persisted = JSON.parse(storage.getItem(key) ?? "null");
    expect(persisted).toHaveLength(3);
    expect(persisted).toEqual(expect.arrayContaining([first, external, fresh]));
    clearBakedManuscriptCutLayers(doc, null);
  });

  it("이미 저장한 캐시와 같은 캡처가 다른 탭에서 갱신되면 최신 저장본을 유지한다", () => {
    const storage = memoryStorage(), doc = "bake-refreshed-capture", key = `${STUDIO_BG3D_BAKED_CUT_STORAGE_KEY_PREFIX}${doc}`;
    const first = bakedLayer(doc, 0), refreshed = { ...first, inkPassRef: "opfs://refreshed-ink.png" }, fresh = bakedLayer(doc, 1);
    saveBakedManuscriptCutLayer(first, storage);
    storage.setItem(key, JSON.stringify([refreshed]));
    expect(saveBakedManuscriptCutLayer(fresh, storage)).toEqual({ persistedToStorage: true, totalLayers: 2 });
    expect(JSON.parse(storage.getItem(key) ?? "null")).toEqual([fresh, refreshed]);
    clearBakedManuscriptCutLayers(doc, null);
  });

  it("저장 거부된 재촬영은 다음 캡처를 저장할 때도 오래된 저장본으로 되돌리지 않는다", () => {
    const storage = memoryStorage(), doc = "bake-pending-recapture", key = `${STUDIO_BG3D_BAKED_CUT_STORAGE_KEY_PREFIX}${doc}`;
    const first = bakedLayer(doc, 0), pending = { ...first, inkPassRef: "opfs://pending-ink.png" }, fresh = bakedLayer(doc, 1);
    saveBakedManuscriptCutLayer(first, storage);
    const original = storage.getItem(key);
    vi.spyOn(storage, "setItem").mockImplementationOnce(() => { throw new Error("quota"); });
    expect(saveBakedManuscriptCutLayer(pending, storage).persistedToStorage).toBe(false);
    expect(storage.getItem(key)).toBe(original);
    expect(saveBakedManuscriptCutLayer(fresh, storage)).toEqual({ persistedToStorage: true, totalLayers: 2 });
    expect(JSON.parse(storage.getItem(key) ?? "null")).toEqual([fresh, pending]);
    clearBakedManuscriptCutLayers(doc, null);
  });

  it("쓰기 후 재읽기가 일치하지 않으면 미저장 재촬영을 다음 저장까지 보존한다", () => {
    const storage = memoryStorage(), doc = "bake-unconfirmed-write", key = `${STUDIO_BG3D_BAKED_CUT_STORAGE_KEY_PREFIX}${doc}`;
    const first = bakedLayer(doc, 0), pending = { ...first, shadedPassRef: "opfs://pending-shaded.png" }, fresh = bakedLayer(doc, 1);
    saveBakedManuscriptCutLayer(first, storage);
    const original = storage.getItem(key);
    vi.spyOn(storage, "setItem").mockImplementationOnce(() => undefined);
    expect(saveBakedManuscriptCutLayer(pending, storage).persistedToStorage).toBe(false);
    expect(storage.getItem(key)).toBe(original);
    expect(saveBakedManuscriptCutLayer(fresh, storage)).toEqual({ persistedToStorage: true, totalLayers: 2 });
    expect(JSON.parse(storage.getItem(key) ?? "null")).toEqual([fresh, pending]);
    clearBakedManuscriptCutLayers(doc, null);
  });

  it("메모리 캐시를 비운 뒤에도 해당 문서의 캡처·출처·재촬영 사본만 복원한다", () => {
    const storage = memoryStorage(), doc = "bake/roundtrip", layer = bakedLayer(doc);
    expect(saveBakedManuscriptCutLayer(layer, storage)).toEqual({ persistedToStorage: true, totalLayers: 1 });
    clearBakedManuscriptCutLayers(doc, null);
    expect(listBakedManuscriptCutLayers(doc, storage)).toEqual([layer]);
    expect(listBakedManuscriptCutLayers("bake/other", storage)).toEqual([]);
    expect(storage.key(0)).toBe(`${STUDIO_BG3D_BAKED_CUT_STORAGE_KEY_PREFIX}${encodeURIComponent(doc)}`);
  });

  it.each(["{broken", "{}", JSON.stringify([bakedLayer("foreign")])])("손상되거나 다른 문서의 원본을 덮어쓰지 않는다: %s", original => {
    const storage = memoryStorage(), doc = `protected-${original.length}`, key = `${STUDIO_BG3D_BAKED_CUT_STORAGE_KEY_PREFIX}${encodeURIComponent(doc)}`;
    clearBakedManuscriptCutLayers(doc, null);
    storage.setItem(key, original);
    expect(listBakedManuscriptCutLayers(doc, storage)).toEqual([]);
    const layer = bakedLayer(doc);
    expect(saveBakedManuscriptCutLayer(layer, storage).persistedToStorage).toBe(false);
    expect(storage.getItem(key)).toBe(original);
    expect(listBakedManuscriptCutLayers(doc, storage)).toEqual([layer]);
    clearBakedManuscriptCutLayers(doc, null);
  });

  it("용량 초과 때 기존5개 사본을4개로 잘라 덮지 않고 새 사본은 메모리에 유지한다", () => {
    const storage = memoryStorage(), doc = "bake-quota", key = `${STUDIO_BG3D_BAKED_CUT_STORAGE_KEY_PREFIX}${doc}`;
    for (let cut = 0; cut < 5; cut += 1) saveBakedManuscriptCutLayer(bakedLayer(doc, cut), storage);
    const original = storage.getItem(key);
    const write = vi.spyOn(storage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(saveBakedManuscriptCutLayer(bakedLayer(doc, 5), storage)).toEqual({ persistedToStorage: false, totalLayers: 6 });
    expect(write).toHaveBeenCalledTimes(1);
    expect(storage.getItem(key)).toBe(original);
    expect(listBakedManuscriptCutLayers(doc, storage)).toHaveLength(6);
    clearBakedManuscriptCutLayers(doc, null);
    expect(listBakedManuscriptCutLayers(doc, storage)).toHaveLength(5);
  });

  it("저장이 조용히 무시되면 성공으로 보고하지 않고 새 기록은24개까지만 유지한다", () => {
    const ignored = memoryStorage();
    vi.spyOn(ignored, "setItem").mockImplementation(() => undefined);
    expect(saveBakedManuscriptCutLayer(bakedLayer("bake-ignored"), ignored).persistedToStorage).toBe(false);
    const storage = memoryStorage();
    for (let cut = 0; cut < 25; cut += 1) saveBakedManuscriptCutLayer(bakedLayer("bake-bounded", cut), storage);
    clearBakedManuscriptCutLayers("bake-bounded", null);
    expect(listBakedManuscriptCutLayers("bake-bounded", storage)).toHaveLength(24);
  });
});

describe("studio-bg3d-live-ink-bake-bridge (AC-017)", () => {
  it("유효한 3D 캡처를 비파괴 2D 컷 레이어로 변환하고 Rights BOM 에셋 ID를 중복 제거해 보존한다", () => {
    const result = buildBakedManuscriptCutLayer({
      capture: {
        sceneId: "classroom-01",
        cameraId: "cam-hero",
        stage: "live-ink",
        widthPx: 1600,
        heightPx: 1200,
        inkPassRef: "opfs://captures/classroom-ink.png",
        shadedPassRef: "opfs://captures/classroom-shaded.png",
        inkLineWeightPx: 2.25,
        assetIds: ["desk-01", "window-02", "desk-01"],
        capturedAt: "2026-11-19T10:30:00.000Z",
      },
      targetDocumentId: "doc-ep01",
      targetCutIndex: 3,
      previewMode: "split-wipe",
      splitWipeRatio: 0.62,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.layer.nonDestructive).toBe(true);
      expect(result.layer.rightsBomAssetIds).toEqual(["desk-01", "window-02"]);
      expect(result.layer.splitWipeRatio).toBe(0.62);
      expect(result.layer.inkLineWeightPx).toBe(2.25);
    }
  });

  it("캡처 누락·0 해상도를 안전하게 차단하고 Split-Wipe 및 선 두께를 안전 범위로 클램프한다", () => {
    expect(clampSplitWipeRatio(1.4)).toBe(1);
    expect(clampSplitWipeRatio(-0.2)).toBe(0);
    expect(clampInkLineWeight(0.01)).toBe(0.25);
    expect(clampInkLineWeight(40)).toBe(8);

    const missing = buildBakedManuscriptCutLayer({
      capture: {
        sceneId: "s1",
        cameraId: "c1",
        stage: "shot",
        widthPx: 800,
        heightPx: 600,
        inkPassRef: "",
        shadedPassRef: "opfs://shaded.png",
        inkLineWeightPx: 1.5,
        assetIds: [],
        capturedAt: "2026-11-19T10:30:00.000Z",
      },
      targetDocumentId: "doc-ep01",
      targetCutIndex: 0,
      previewMode: "live-ink-only",
      splitWipeRatio: 0.5,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.code).toBe("MISSING_CAPTURE");
    }
  });
});
