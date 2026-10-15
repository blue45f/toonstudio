import { describe, expect, it, vi } from "vitest";

import { parseStudioBg3dSkpImportReport } from "./studio-bg3d-skp-import-report";
import {
  STUDIO_BG3D_SKP_SESSION_MAX_RESULTS,
  createStudioBg3dSkpImportSession,
  studioBg3dSkpImportSession,
  type StudioBg3dSkpResultInput,
} from "./studio-bg3d-skp-import-session";
import { assessStudioBg3dSkpSize } from "./studio-bg3d-skp-unit";
import { createSkpReportFixture } from "./studio-bg3d-skp.test-fixture";

import type { StudioBg3dSkpUnitDecision } from "./studio-bg3d-skp-import";

const tinyReport = createSkpReportFixture({
  size: {
    openSkpMeters: [0.005, 0, 0.005],
    meters: [0.005, 0, 0.005],
    maxExtentMeters: 0.005,
    level: "too-small",
    recommendedUnit: "m",
  },
});

function questionRequest() {
  return {
    sourceName: "tiny.skp",
    report: tinyReport,
    assessment: assessStudioBg3dSkpSize([0.005, 0, 0.005], null),
  };
}

function resultInput(name: string, overrides: Partial<StudioBg3dSkpResultInput> = {}): StudioBg3dSkpResultInput {
  return {
    sourceName: name,
    report: createSkpReportFixture(),
    status: "imported",
    reason: null,
    metadata: "saved",
    ...overrides,
  };
}

describe("report fixture", () => {
  it("is a complete report that passes the report schema", () => {
    expect(parseStudioBg3dSkpImportReport(createSkpReportFixture())).not.toBeNull();
    expect(parseStudioBg3dSkpImportReport(tinyReport)).not.toBeNull();
  });
});

describe("studioBg3dSkpImportSession", () => {
  it("exposes one shared instance and starts empty", () => {
    expect(studioBg3dSkpImportSession.getSnapshot()).toEqual({ activity: null, question: null, results: [] });
    expect(studioBg3dSkpImportSession.hasHost()).toBe(false);
  });
});

describe("createStudioBg3dSkpImportSession", () => {
  it("answers keep immediately, without opening a question, when no screen is registered", async () => {
    const session = createStudioBg3dSkpImportSession();
    await expect(session.requestUnit(questionRequest())).resolves.toEqual({ kind: "keep" });
    expect(session.getSnapshot().question).toBeNull();
  });

  it("opens a question for a registered host and resolves it with the user's answer", async () => {
    const session = createStudioBg3dSkpImportSession();
    const listener = vi.fn();
    session.subscribe(listener);
    session.registerHost();

    const pending = session.requestUnit(questionRequest());
    const question = session.getSnapshot().question;
    expect(question).toMatchObject({ sourceName: "tiny.skp", assessment: { recommendedUnit: "m" } });
    expect(listener).toHaveBeenCalledTimes(1);

    expect(session.answerUnit((question?.id ?? 0) + 1, { kind: "cancel" })).toBe(false);
    expect(session.getSnapshot().question).not.toBeNull();

    const decision: StudioBg3dSkpUnitDecision = { kind: "unit", unit: "m" };
    expect(session.answerUnit(question?.id ?? 0, decision)).toBe(true);
    await expect(pending).resolves.toEqual(decision);
    expect(session.getSnapshot().question).toBeNull();
    expect(session.answerUnit(question?.id ?? 0, decision)).toBe(false);
  });

  it("closes an open question with cancel when the import is aborted", async () => {
    const session = createStudioBg3dSkpImportSession();
    session.registerHost();
    const controller = new AbortController();
    const pending = session.requestUnit(questionRequest(), controller.signal);
    expect(session.getSnapshot().question).not.toBeNull();
    controller.abort();
    await expect(pending).resolves.toEqual({ kind: "cancel" });
    expect(session.getSnapshot().question).toBeNull();
  });

  it("cancels at once when asked with a signal that was already aborted", async () => {
    const session = createStudioBg3dSkpImportSession();
    session.registerHost();
    const controller = new AbortController();
    controller.abort();
    await expect(session.requestUnit(questionRequest(), controller.signal)).resolves.toEqual({ kind: "cancel" });
    expect(session.getSnapshot().question).toBeNull();
  });

  it("falls back to keep when the last screen goes away while a question is open", async () => {
    const session = createStudioBg3dSkpImportSession();
    const releaseFirst = session.registerHost();
    const releaseSecond = session.registerHost();
    const pending = session.requestUnit(questionRequest());

    releaseFirst();
    expect(session.getSnapshot().question).not.toBeNull();
    releaseFirst(); // 두 번 해제해도 다른 호스트의 등록을 깨뜨리지 않는다.
    expect(session.hasHost()).toBe(true);

    releaseSecond();
    expect(session.hasHost()).toBe(false);
    await expect(pending).resolves.toEqual({ kind: "keep" });
    expect(session.getSnapshot().question).toBeNull();
  });

  it("settles a leftover question as cancel when a new one is requested", async () => {
    const session = createStudioBg3dSkpImportSession();
    session.registerHost();
    const first = session.requestUnit(questionRequest());
    const firstId = session.getSnapshot().question?.id;
    const second = session.requestUnit(questionRequest());
    await expect(first).resolves.toEqual({ kind: "cancel" });
    expect(session.getSnapshot().question?.id).not.toBe(firstId);
    session.answerUnit(session.getSnapshot().question?.id ?? 0, { kind: "keep" });
    await expect(second).resolves.toEqual({ kind: "keep" });
  });

  it("publishes activity changes and ignores identical updates", () => {
    const session = createStudioBg3dSkpImportSession();
    const listener = vi.fn();
    session.subscribe(listener);
    const activity = {
      sourceName: "room.skp",
      progress: { stage: "building-scene", fraction: null, execution: "worker" },
    } as const;
    session.setActivity(activity);
    session.setActivity(activity);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().activity).toEqual(activity);
    session.setActivity(null);
    expect(session.getSnapshot().activity).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps the snapshot reference stable when nothing changes and stops notifying after unsubscribe", () => {
    const session = createStudioBg3dSkpImportSession();
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    const before = session.getSnapshot();
    session.clearResults();
    session.dismissResult("missing");
    session.publishResults([]);
    expect(session.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
    session.publishResults([resultInput("a.skp")]);
    expect(listener).not.toHaveBeenCalled();
    expect(session.getSnapshot().results).toHaveLength(1);
  });

  it("lists each batch in import order, newest batch first, with unique ids", () => {
    const session = createStudioBg3dSkpImportSession();
    session.publishResults([resultInput("a.skp"), resultInput("b.skp")]);
    session.publishResults([resultInput("c.skp", { status: "not-imported", reason: "가져오지 못했습니다", metadata: "skipped" })]);
    const results = session.getSnapshot().results;
    expect(results.map((entry) => entry.sourceName)).toEqual(["c.skp", "a.skp", "b.skp"]);
    expect(new Set(results.map((entry) => entry.id)).size).toBe(3);
    expect(results[0]).toMatchObject({ status: "not-imported", reason: "가져오지 못했습니다" });
  });

  it("keeps only the most recent results and lets the user dismiss or clear them", () => {
    const session = createStudioBg3dSkpImportSession();
    for (let index = 0; index < STUDIO_BG3D_SKP_SESSION_MAX_RESULTS + 3; index += 1) {
      session.publishResults([resultInput(`model-${index}.skp`)]);
    }
    const results = session.getSnapshot().results;
    expect(results).toHaveLength(STUDIO_BG3D_SKP_SESSION_MAX_RESULTS);
    expect(results[0].sourceName).toBe(`model-${STUDIO_BG3D_SKP_SESSION_MAX_RESULTS + 2}.skp`);

    session.dismissResult(results[0].id);
    expect(session.getSnapshot().results).toHaveLength(STUDIO_BG3D_SKP_SESSION_MAX_RESULTS - 1);
    session.clearResults();
    expect(session.getSnapshot().results).toEqual([]);
  });
});
