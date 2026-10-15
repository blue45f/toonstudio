import { describe, expect, it, vi } from "vitest";

import { beginStudioBg3dSkpImportRun, collectStudioBg3dSkpImportedAssets } from "./studio-bg3d-skp-import-run";
import { createStudioBg3dSkpImportSession } from "./studio-bg3d-skp-import-session";
import { assessStudioBg3dSkpSize } from "./studio-bg3d-skp-unit";
import { createSkpReportFixture } from "./studio-bg3d-skp.test-fixture";

import type { StudioBg3dSkpImportedAsset, StudioBg3dSkpMetadataStatus } from "./studio-bg3d-skp-asset-metadata";
import type { StudioBg3dSkpImportReport } from "./studio-bg3d-skp-import-report";
import type { StudioBg3dSkpStoredRecordLike } from "./studio-bg3d-skp-import-run";

function record(name: string): StudioBg3dSkpStoredRecordLike {
  return {
    name,
    contentHash: `sha256:${"e".repeat(64)}`,
    byteSize: 1_000,
    validatorMetrics: { triangles: 80, textures: 0 },
    rights: { status: "owned", commercialUse: true },
  };
}

function setup(persist?: (asset: StudioBg3dSkpImportedAsset, report: StudioBg3dSkpImportReport) => Promise<StudioBg3dSkpMetadataStatus>) {
  const session = createStudioBg3dSkpImportSession();
  const persistSpy = vi.fn(persist ?? (() => Promise.resolve<StudioBg3dSkpMetadataStatus>("saved")));
  const run = beginStudioBg3dSkpImportRun({ session, persist: persistSpy });
  return { session, persistSpy, run };
}

describe("beginStudioBg3dSkpImportRun", () => {
  it("shows the conversion stage while it runs and clears it when the import is complete", async () => {
    const { session, run } = setup();
    run.options.onStage?.({
      sourcePath: "a.skp",
      sourceName: "a.skp",
      progress: { stage: "building-scene", fraction: null, execution: "worker" },
    });
    expect(session.getSnapshot().activity).toMatchObject({ sourceName: "a.skp", progress: { stage: "building-scene" } });
    await run.complete({ status: "failed", reason: "실패" });
    expect(session.getSnapshot().activity).toBeNull();
  });

  it("hands the unit question to the screen and answers keep when no screen is open", async () => {
    const { session, run } = setup();
    const report = createSkpReportFixture();
    const request = { sourceName: "tiny.skp", report, assessment: assessStudioBg3dSkpSize([0.005, 0, 0.005], null) };
    await expect(run.options.resolveUnit?.(request)).resolves.toEqual({ kind: "keep" });

    session.registerHost();
    const pending = run.options.resolveUnit?.(request);
    expect(session.getSnapshot().question?.sourceName).toBe("tiny.skp");
    session.answerUnit(session.getSnapshot().question?.id ?? 0, { kind: "unit", unit: "m" });
    await expect(pending).resolves.toEqual({ kind: "unit", unit: "m" });
  });

  it("publishes each imported file's report with the outcome of recording it, in import order", async () => {
    const { session, persistSpy, run } = setup((candidate) =>
      Promise.resolve(candidate.name === "의자" ? "existing" : "saved"));
    const first = createSkpReportFixture();
    const second = createSkpReportFixture({ counts: { ...first.counts, triangles: 12 } });
    run.options.onReport?.({ sourcePath: "set/room.skp", sourceName: "room.skp", report: first });
    run.options.onReport?.({ sourcePath: "set/chair.skp", sourceName: "chair.skp", report: second });

    await run.complete({
      status: "imported",
      records: [record("의자"), record("방")],
      sourcePaths: ["set/chair.skp", "set/room.skp"],
    });

    expect(persistSpy).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot().results.map((entry) => [entry.sourceName, entry.status, entry.metadata])).toEqual([
      ["room.skp", "imported", "saved"],
      ["chair.skp", "imported", "existing"],
    ]);
    expect(session.getSnapshot().results[1].report.counts.triangles).toBe(12);
  });

  it("shows the report of a model that was converted but not imported, with the reason, and records nothing", async () => {
    const { session, persistSpy, run } = setup();
    run.options.onReport?.({ sourcePath: "room.skp", sourceName: "room.skp", report: createSkpReportFixture() });
    await run.complete({ status: "failed", reason: "기기 복잡도 기준을 통과하지 못했습니다." });
    expect(persistSpy).not.toHaveBeenCalled();
    expect(session.getSnapshot().results).toMatchObject([{
      sourceName: "room.skp",
      status: "not-imported",
      reason: "기기 복잡도 기준을 통과하지 못했습니다.",
      metadata: "skipped",
    }]);
  });

  it("says so when several files fail together, since none of them was saved", async () => {
    const { session, run } = setup();
    run.options.onReport?.({ sourcePath: "a.skp", sourceName: "a.skp", report: createSkpReportFixture() });
    run.options.onReport?.({ sourcePath: "b.skp", sourceName: "b.skp", report: createSkpReportFixture() });
    await run.complete({ status: "failed", reason: "b.skp에는 가져올 형상이 없습니다." });
    const reasons = session.getSnapshot().results.map((entry) => entry.reason);
    expect(reasons).toHaveLength(2);
    for (const reason of reasons) {
      expect(reason).toBe("함께 선택한 파일과 같이 저장되지 않았습니다 — b.skp에는 가져올 형상이 없습니다.");
    }
  });

  it("does not claim an import for a report that has no saved model", async () => {
    const { session, run } = setup();
    run.options.onReport?.({ sourcePath: "room.skp", sourceName: "room.skp", report: createSkpReportFixture() });
    await run.complete({ status: "imported", records: [], sourcePaths: [] });
    expect(session.getSnapshot().results[0]).toMatchObject({ status: "not-imported", metadata: "skipped" });
  });

  it("publishes nothing when no .skp report was produced (for example a GLB-only import)", async () => {
    const { session, persistSpy, run } = setup();
    await run.complete({ status: "imported", records: [], sourcePaths: [] });
    expect(session.getSnapshot().results).toEqual([]);
    expect(persistSpy).not.toHaveBeenCalled();
  });

  it("never throws when recording the report fails; the screen says it could not be saved", async () => {
    const { session, run } = setup(() => Promise.reject(new Error("boom")));
    run.options.onReport?.({ sourcePath: "room.skp", sourceName: "room.skp", report: createSkpReportFixture() });
    await expect(run.complete({ status: "imported", records: [record("방")], sourcePaths: ["room.skp"] })).resolves.toBeUndefined();
    expect(session.getSnapshot().results[0]).toMatchObject({ status: "imported", metadata: "failed" });
  });
});

describe("collectStudioBg3dSkpImportedAssets", () => {
  it("pairs stored records with their .skp source paths by plan position and skips other formats", () => {
    const assets = collectStudioBg3dSkpImportedAssets(
      [record("소품"), record("방"), record("의자")],
      [null, "set/room.skp", "set/chair.skp"],
    );
    expect(assets.map((asset) => [asset.sourcePath, asset.name])).toEqual([
      ["set/room.skp", "방"],
      ["set/chair.skp", "의자"],
    ]);
    expect(assets[0]).toMatchObject({ byteSize: 1_000, triangles: 80, textures: 0, rights: { status: "owned" } });
  });

  it("ignores records beyond the planned paths instead of guessing a source", () => {
    expect(collectStudioBg3dSkpImportedAssets([record("방"), record("여분")], ["room.skp"]).map((asset) => asset.name))
      .toEqual(["방"]);
  });
});
