import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  httpStatus: vi.fn((_error: unknown): number | null => null),
}));

vi.mock("@/platform/api", () => ({
  api: { get: apiMocks.get, put: apiMocks.put },
  httpStatus: apiMocks.httpStatus,
  toApiError: async (error: unknown, fallback: string) =>
    error instanceof Error ? error : new Error(fallback),
}));

import {
  fetchGodotSpaceCatalog,
  fetchGodotSpaceLayout,
  isGodotSpaceLayoutConflict,
  saveGodotSpaceLayout,
} from "./studio-godot-space";

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
