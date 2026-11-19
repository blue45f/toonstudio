// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";
import { reloadStudioWorldAfterDraftSave } from "./studio-world-authoring-reload";
import { readStudioWorldAuthoringDraftRecord, writeStudioWorldAuthoringDraft } from "./studio-virtual-space-world-authoring";
import { createSpaceDeviceRecordFixture } from "./studio-space-device-record.test-fixture";

const db = createSpaceDeviceRecordFixture();
vi.mock("../studio-local-database-runtime", () => ({ acquireStudioLocalDatabase: async () => db }));
beforeEach(() => { db.records.clear(); vi.clearAllMocks(); });


afterEach(() => localStorage.clear());
describe("safe module-failure document reload", () => {
  it("reloads only after an actual local draft roundtrip with the exact publication base", async () => {
    const reload = vi.fn();
    expect(await reloadStudioWorldAfterDraftSave("work", DEFAULT_STUDIO_WORLD_MANIFEST, "rev-1", { write: writeStudioWorldAuthoringDraft, read: readStudioWorldAuthoringDraftRecord, reload })).toBe(true);
    expect(await readStudioWorldAuthoringDraftRecord("work")).toEqual({ manifest: DEFAULT_STUDIO_WORLD_MANIFEST, basePublishedRevisionId: "rev-1" });
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it.each(["write", "read", "scope", "content", "exception"])("never reloads when %s cannot be verified", async (failure) => {
    const reload = vi.fn();
    const write = vi.fn(async () => { if (failure === "exception") throw new Error("storage unavailable"); return failure !== "write"; });
    const read = vi.fn(async () => failure === "read" ? null : ({ manifest: failure === "content" ? { ...DEFAULT_STUDIO_WORLD_MANIFEST, version: 999 } : DEFAULT_STUDIO_WORLD_MANIFEST,
      basePublishedRevisionId: failure === "scope" ? "other-revision" : "rev-1" }));
    expect(await reloadStudioWorldAfterDraftSave("work", DEFAULT_STUDIO_WORLD_MANIFEST, "rev-1", { write, read, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
