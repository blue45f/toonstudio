import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteGodotSpaceBackground,
  fetchGodotSpaceBackgrounds,
  fetchGodotSpaceCatalog,
  fetchGodotSpaceLayout,
  godotSpaceBackgroundContentUrl,
  isGodotSpaceLayoutConflict,
  resolveGodotBackgroundForStage,
  restoreGodotBackgroundReference,
  saveGodotSpaceLayout,
  uploadGodotSpaceBackground,
  type GodotSpaceDefinition,
} from "./studio-godot-space";

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  fetch: vi.fn(),
  httpStatus: vi.fn((_error: unknown): number | null => null),
}));

vi.mock("@/platform/api", () => ({
  api: { get: apiMocks.get, put: apiMocks.put, delete: apiMocks.delete },
  apiFetch: apiMocks.fetch,
  apiPath: (path: string) => `/api${path}`,
  httpStatus: apiMocks.httpStatus,
  toApiError: async (error: unknown, fallback: string) =>
    error instanceof Error ? error : new Error(fallback),
}));

const DEFINITION = {
  v: 1 as const,
  id: "street",
  name: "거리",
  size: [2400, 1200] as [number, number],
  zones: [],
  props: [],
};

const LAYOUT_RESPONSE = {
  workId: "work-1",
  spaceId: "street",
  definition: DEFINITION,
  revision: 4,
  updatedByUserId: "user-1",
  updatedAt: "2026-10-11T00:00:00.000Z",
};

describe("studio-godot-space client", () => {
  beforeEach(() => {
    apiMocks.get.mockReset();
    apiMocks.put.mockReset();
    apiMocks.httpStatus.mockReset().mockReturnValue(null);
  });

  it("loads the static catalog of built-in space definitions", async () => {
    const fetchStub = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ v: 1, spaces: [DEFINITION] }),
    });
    vi.stubGlobal("fetch", fetchStub);
    const spaces = await fetchGodotSpaceCatalog();
    expect(fetchStub).toHaveBeenCalledWith("/godot-space/spaces.json", {
      signal: undefined,
    });
    expect(spaces).toHaveLength(1);
    expect(spaces[0]?.id).toBe("street");
    vi.unstubAllGlobals();
  });

  it("returns null (not an error) when no layout is saved yet", async () => {
    const notFound = new Error("not found");
    apiMocks.get.mockRejectedValue(notFound);
    apiMocks.httpStatus.mockReturnValue(404);
    await expect(fetchGodotSpaceLayout("work-1", "street")).resolves.toBeNull();
  });

  it("returns the saved layout with its revision", async () => {
    apiMocks.get.mockResolvedValue(LAYOUT_RESPONSE);
    const layout = await fetchGodotSpaceLayout("work-1", "street");
    expect(layout?.revision).toBe(4);
    expect(layout?.definition.id).toBe("street");
    expect(apiMocks.get).toHaveBeenCalledWith(
      "/creator/works/work-1/godot-space-layouts/street",
      expect.objectContaining({ timeout: 10_000 }),
    );
  });

  it("propagates non-404 failures instead of swallowing them", async () => {
    apiMocks.get.mockRejectedValue(new Error("network down"));
    apiMocks.httpStatus.mockReturnValue(503);
    await expect(fetchGodotSpaceLayout("work-1", "street")).rejects.toThrow(
      "network down",
    );
  });

  it("saves with the expected revision and detects conflicts by status", async () => {
    apiMocks.put.mockResolvedValue({ ...LAYOUT_RESPONSE, revision: 5 });
    const saved = await saveGodotSpaceLayout("work-1", "street", DEFINITION, 4);
    expect(saved.revision).toBe(5);
    expect(apiMocks.put).toHaveBeenCalledWith(
      "/creator/works/work-1/godot-space-layouts/street",
      { definition: DEFINITION, expectedRevision: 4 },
      expect.objectContaining({ timeout: 10_000 }),
    );

    const conflict = new Error("conflict");
    apiMocks.httpStatus.mockReturnValue(409);
    expect(isGodotSpaceLayoutConflict(conflict)).toBe(true);
    apiMocks.httpStatus.mockReturnValue(500);
    expect(isGodotSpaceLayoutConflict(conflict)).toBe(false);
  });

  it("rejects a malformed catalog instead of trusting it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ v: 2, spaces: [] }),
      }),
    );
    await expect(fetchGodotSpaceCatalog()).rejects.toThrow();
    vi.unstubAllGlobals();
  });
});

const UPLOAD_ASSET_ID = "11111111-2222-4333-8444-555555555555";
const UPLOAD_ASSET = {
  assetId: UPLOAD_ASSET_ID,
  glbRef: `uploads/${UPLOAD_ASSET_ID}.glb`,
  fileName: "room.glb",
  byteSize: 1024,
  sha256: "a".repeat(64),
  uploadedByUserId: "user-1",
  createdAt: "2026-10-12T00:00:00.000Z",
};

function definitionWithBackground(
  background: GodotSpaceDefinition["background"],
): GodotSpaceDefinition {
  return { ...DEFINITION, background };
}

describe("godot space background references (§14)", () => {
  beforeEach(() => {
    apiMocks.get.mockReset();
    apiMocks.delete.mockReset();
    apiMocks.fetch.mockReset();
  });

  it("builds an absolute content URL for an uploaded asset", () => {
    const url = godotSpaceBackgroundContentUrl("work-1", UPLOAD_ASSET_ID);
    expect(url).toContain(
      `/api/creator/works/work-1/godot-space-backgrounds/${UPLOAD_ASSET_ID}/content`,
    );
    expect(url.startsWith("http")).toBe(true);
  });

  it("resolves uploads/ references for the stage without mutating the original", () => {
    const definition = definitionWithBackground({
      glb: UPLOAD_ASSET.glbRef,
      camHeight: 9,
    });
    const resolved = resolveGodotBackgroundForStage(definition, "work-1");
    expect(resolved.background?.glb).toBe(
      godotSpaceBackgroundContentUrl("work-1", UPLOAD_ASSET_ID),
    );
    expect(resolved.background?.camHeight).toBe(9);
    expect(definition.background?.glb).toBe(UPLOAD_ASSET.glbRef);
  });

  it("leaves catalog references and empty backgrounds untouched", () => {
    const catalog = definitionWithBackground({ glb: "spaces/street.glb" });
    expect(resolveGodotBackgroundForStage(catalog, "work-1")).toBe(catalog);
    const none = definitionWithBackground(null);
    expect(resolveGodotBackgroundForStage(none, "work-1")).toBe(none);
  });

  it("restores the canonical reference from a stage round-trip (resolve → restore)", () => {
    const definition = definitionWithBackground({ glb: UPLOAD_ASSET.glbRef });
    const staged = resolveGodotBackgroundForStage(definition, "work-1");
    const restored = restoreGodotBackgroundReference(staged, "work-1");
    expect(restored.background?.glb).toBe(UPLOAD_ASSET.glbRef);
  });

  it("does not restore content URLs of another work", () => {
    const staged = resolveGodotBackgroundForStage(
      definitionWithBackground({ glb: UPLOAD_ASSET.glbRef }),
      "work-1",
    );
    const restored = restoreGodotBackgroundReference(staged, "work-2");
    expect(restored.background?.glb).toContain("/content");
  });

  it("lists uploaded backgrounds through the api client", async () => {
    apiMocks.get.mockResolvedValue([UPLOAD_ASSET]);
    const assets = await fetchGodotSpaceBackgrounds("work-1");
    expect(assets).toHaveLength(1);
    expect(assets[0]?.glbRef).toBe(UPLOAD_ASSET.glbRef);
    expect(apiMocks.get).toHaveBeenCalledWith(
      "/creator/works/work-1/godot-space-backgrounds",
      expect.objectContaining({ timeout: 10_000 }),
    );
  });

  it("uploads via multipart apiFetch and parses the asset", async () => {
    apiMocks.fetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => UPLOAD_ASSET,
    });
    const file = new File([new Uint8Array([1])], "room.glb");
    const asset = await uploadGodotSpaceBackground("work-1", file);
    expect(asset.assetId).toBe(UPLOAD_ASSET_ID);
    const [path, init] = apiMocks.fetch.mock.calls[0] as [
      string,
      { method: string; body: FormData },
    ];
    expect(path).toBe("/creator/works/work-1/godot-space-backgrounds");
    expect(init.method).toBe("POST");
    expect(init.body.get("file")).toBe(file);
  });

  it("surfaces the server validation reason on upload failure", async () => {
    apiMocks.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        statusCode: 400,
        message: "이 GLB는 Godot 무대가 읽을 수 없는 압축 확장(EXT_meshopt_compression)을 필수로 요구합니다.",
      }),
    });
    const file = new File([new Uint8Array([1])], "room-web.glb");
    await expect(uploadGodotSpaceBackground("work-1", file)).rejects.toThrow(
      "EXT_meshopt_compression",
    );
  });

  it("deletes an uploaded background through the api client", async () => {
    apiMocks.delete.mockResolvedValue({ deleted: true });
    await deleteGodotSpaceBackground("work-1", UPLOAD_ASSET_ID);
    expect(apiMocks.delete).toHaveBeenCalledWith(
      `/creator/works/work-1/godot-space-backgrounds/${UPLOAD_ASSET_ID}`,
      expect.objectContaining({ timeout: 10_000 }),
    );
  });
});
