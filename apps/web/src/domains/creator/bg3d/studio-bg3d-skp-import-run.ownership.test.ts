import { describe, expect, it, vi } from "vitest";

import { beginStudioBg3dSkpImportRun } from "./studio-bg3d-skp-import-run";
import { createStudioBg3dSkpImportSession } from "./studio-bg3d-skp-import-session";
import { assessStudioBg3dSkpSize } from "./studio-bg3d-skp-unit";
import { createSkpReportFixture } from "./studio-bg3d-skp.test-fixture";

import type { StudioBg3dImportAiUseStatus } from "./studio-bg3d-import-ai-use";
import type { StudioBg3dSkpImportedAsset, StudioBg3dSkpMetadataStatus } from "./studio-bg3d-skp-asset-metadata";
import type { StudioBg3dSkpImportReport } from "./studio-bg3d-skp-import-report";
import type { StudioBg3dSkpImportRun, StudioBg3dSkpStoredRecordLike } from "./studio-bg3d-skp-import-run";

function deferred<T>() {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => { resolvePromise = resolve; });
  return {
    promise,
    resolve(value: T) {
      if (!resolvePromise) throw new Error("대기 중인 Promise가 없습니다.");
      resolvePromise(value);
    },
  };
}

function record(name: string): StudioBg3dSkpStoredRecordLike {
  return {
    name,
    contentHash: `sha256:${"e".repeat(64)}`,
    byteSize: 1_000,
    validatorMetrics: { triangles: 80, textures: 0 },
    rights: { status: "owned", commercialUse: true },
  };
}

function stage(run: StudioBg3dSkpImportRun, sourceName: string): void {
  run.options.onStage?.({
    sourcePath: sourceName,
    sourceName,
    progress: { stage: "building-scene", fraction: null, execution: "worker" },
  });
}

function report(run: StudioBg3dSkpImportRun, sourceName: string): void {
  run.options.onReport?.({ sourcePath: sourceName, sourceName, report: createSkpReportFixture() });
}

function question(sourceName: string) {
  return {
    sourceName,
    report: createSkpReportFixture(),
    assessment: assessStudioBg3dSkpSize([0.005, 0, 0.005], null),
  };
}

describe("SKP 실행의 화면 소유권", () => {
  it("lazy 준비가 늦은 stale run의 시작은 현재 run의 단위 질문·진행 권위를 빼앗지 않는다", async () => {
    const session = createStudioBg3dSkpImportSession();
    const releaseHost = session.registerHost();
    try {
      const current = beginStudioBg3dSkpImportRun({ session });
      stage(current, "현재.skp");
      const pending = current.options.resolveUnit?.(question("현재.skp"));
      const before = session.getSnapshot();
      const stale = beginStudioBg3dSkpImportRun({ session, isCurrent: () => false });
      stage(stale, "이전.skp");
      await stale.complete({ status: "abandoned" });
      expect(session.getSnapshot()).toBe(before);
      expect(session.answerUnit(before.question?.id ?? 0, { kind: "unit", unit: "m" })).toBe(true);
      await expect(pending).resolves.toEqual({ kind: "unit", unit: "m" });
      stage(current, "현재-계속.skp");
      expect(session.getSnapshot().activity?.sourceName).toBe("현재-계속.skp");
    } finally {
      releaseHost();
    }
  });

  it("이전 실행의 stage·finally가 다음 실행의 진행 표시를 덮거나 지우지 않는다", async () => {
    const session = createStudioBg3dSkpImportSession();
    const first = beginStudioBg3dSkpImportRun({ session });
    stage(first, "a.skp");
    report(first, "a.skp");
    const second = beginStudioBg3dSkpImportRun({ session });
    stage(second, "b.skp");
    const before = session.getSnapshot();
    stage(first, "늦은-a.skp");
    await first.complete({ status: "failed", reason: "이전 실패" });
    expect(session.getSnapshot()).toBe(before);
    expect(before.activity?.sourceName).toBe("b.skp");
  });

  it("오래된 imported의 메타데이터와 AI 표기 결과는 보존하고 화면에는 게시하지 않는다", async () => {
    const session = createStudioBg3dSkpImportSession();
    const persist = vi.fn((_asset: StudioBg3dSkpImportedAsset, _report: StudioBg3dSkpImportReport) =>
      Promise.resolve<StudioBg3dSkpMetadataStatus>("saved"));
    const first = beginStudioBg3dSkpImportRun({ session, persist });
    report(first, "a.skp");
    const second = beginStudioBg3dSkpImportRun({ session });
    stage(second, "b.skp");
    const before = session.getSnapshot();
    await expect(first.complete({
      status: "imported", records: [record("A")], sourcePaths: ["a.skp"], aiUse: { aiGenerated: "yes" },
    })).resolves.toBe("saved");
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0]?.[0]).toMatchObject({ name: "A", aiUse: { aiGenerated: "yes" } });
    expect(session.getSnapshot()).toBe(before);
  });

  it("persist 대기 중 시작·완료한 다음 결과 뒤로 이전 결과를 다시 게시하지 않는다", async () => {
    const session = createStudioBg3dSkpImportSession();
    const pending = deferred<StudioBg3dSkpMetadataStatus>();
    const persist = vi.fn(() => pending.promise);
    const first = beginStudioBg3dSkpImportRun({ session, persist });
    report(first, "a.skp");
    const completion = first.complete({
      status: "imported", records: [record("A")], sourcePaths: ["a.skp"], aiUse: { aiGenerated: "yes" },
    });
    await Promise.resolve();
    expect(persist).toHaveBeenCalledTimes(1);
    const second = beginStudioBg3dSkpImportRun({ session });
    report(second, "b.skp");
    await second.complete({ status: "failed", reason: "B 결과" });
    const before = session.getSnapshot();
    pending.resolve("saved");
    await expect(completion).resolves.toBe("saved");
    expect(session.getSnapshot()).toBe(before);
    expect(before.results.map((entry) => entry.sourceName)).toEqual(["b.skp"]);
    stage(first, "되살아난-a.skp");
    expect(session.getSnapshot()).toBe(before);
  });

  it("서로 다른 session은 서로의 진행 표시나 결과를 취소하지 않는다", async () => {
    const a = createStudioBg3dSkpImportSession();
    const b = createStudioBg3dSkpImportSession();
    const first = beginStudioBg3dSkpImportRun({ session: a });
    const second = beginStudioBg3dSkpImportRun({ session: b });
    stage(first, "a.skp");
    stage(second, "b.skp");
    report(first, "a.skp");
    report(second, "b.skp");
    await first.complete({ status: "failed", reason: "A 결과" });
    expect(b.getSnapshot().activity?.sourceName).toBe("b.skp");
    await second.complete({ status: "failed", reason: "B 결과" });
    expect(a.getSnapshot().results.map((entry) => entry.sourceName)).toEqual(["a.skp"]);
    expect(b.getSnapshot().results.map((entry) => entry.sourceName)).toEqual(["b.skp"]);
  });

  it("다음 실행이 시작하면 이전 단위 질문만 취소하고 다음 질문은 유지한다", async () => {
    const session = createStudioBg3dSkpImportSession();
    const releaseHost = session.registerHost();
    try {
      const first = beginStudioBg3dSkpImportRun({ session });
      const firstQuestion = first.options.resolveUnit?.(question("a.skp"));
      expect(session.getSnapshot().question?.sourceName).toBe("a.skp");
      const second = beginStudioBg3dSkpImportRun({ session });
      const secondQuestion = second.options.resolveUnit?.(question("b.skp"));
      await expect(firstQuestion).resolves.toEqual({ kind: "cancel" });
      const before = session.getSnapshot();
      await expect(first.options.resolveUnit?.(question("늦은-a.skp"))).resolves.toEqual({ kind: "cancel" });
      await first.complete({ status: "abandoned" });
      expect(session.getSnapshot()).toBe(before);
      expect(session.answerUnit(before.question?.id ?? 0, { kind: "unit", unit: "m" })).toBe(true);
      await expect(secondQuestion).resolves.toEqual({ kind: "unit", unit: "m" });
    } finally {
      releaseHost();
    }
  });

  it("사용자 취소 신호는 현재 단위 질문을 취소한다", async () => {
    const session = createStudioBg3dSkpImportSession();
    const releaseHost = session.registerHost();
    const controller = new AbortController();
    try {
      const run = beginStudioBg3dSkpImportRun({ session });
      const pending = run.options.resolveUnit?.(question("a.skp"), controller.signal);
      controller.abort();
      await expect(pending).resolves.toEqual({ kind: "cancel" });
      expect(session.getSnapshot().question).toBeNull();
    } finally {
      releaseHost();
    }
  });

  it("modal generation이 바뀌면 같은 SKP run이라도 질문·진행·결과 게시를 중단한다", async () => {
    const session = createStudioBg3dSkpImportSession();
    const captured = {};
    let current = captured;
    const run = beginStudioBg3dSkpImportRun({ session, isCurrent: () => current === captured });
    report(run, "a.skp");
    current = {};
    const before = session.getSnapshot();
    stage(run, "a.skp");
    await expect(run.options.resolveUnit?.(question("a.skp"))).resolves.toEqual({ kind: "cancel" });
    await run.complete({ status: "failed", reason: "닫힌 modal" });
    expect(session.getSnapshot()).toBe(before);
  });

  it("complete의 재호출·동기 listener 재진입에서도 같은 Promise와 한 번의 기록을 유지한다", async () => {
    const session = createStudioBg3dSkpImportSession();
    const persist = vi.fn(() => Promise.resolve<StudioBg3dSkpMetadataStatus>("saved"));
    const run = beginStudioBg3dSkpImportRun({ session, persist });
    report(run, "a.skp");
    stage(run, "a.skp");
    const outcome = { status: "imported", records: [record("A")], sourcePaths: ["a.skp"] } as const;
    let reentered: Promise<StudioBg3dImportAiUseStatus> | undefined;
    const unsubscribe = session.subscribe(() => { reentered ??= run.complete(outcome); });
    try {
      const first = run.complete(outcome);
      const second = run.complete({ status: "abandoned" });
      expect(second).toBe(first);
      stage(run, "늦은-a.skp");
      report(run, "늦은-a.skp");
      await expect(first).resolves.toBe("skipped");
      expect(reentered).toBe(first);
      expect(persist).toHaveBeenCalledTimes(1);
      expect(session.getSnapshot().activity).toBeNull();
      expect(session.getSnapshot().results.map((entry) => entry.sourceName)).toEqual(["a.skp"]);
    } finally {
      unsubscribe();
    }
  });

  it("다음 run 없이 modal만 닫혀도 자기 진행 표시는 object identity로 회수한다", async () => {
    const session = createStudioBg3dSkpImportSession();
    const captured = {};
    let current = captured;
    const run = beginStudioBg3dSkpImportRun({ session, isCurrent: () => current === captured });
    stage(run, "a.skp");
    report(run, "a.skp");
    current = {};
    await run.complete({ status: "failed", reason: "닫힌 modal" });
    expect(session.getSnapshot().activity).toBeNull();
    expect(session.getSnapshot().results).toEqual([]);
  });

  it("자기 진행 표시가 다른 주체의 객체로 바뀌었다면 완료해도 지우지 않는다", async () => {
    const session = createStudioBg3dSkpImportSession();
    const run = beginStudioBg3dSkpImportRun({ session });
    stage(run, "a.skp");
    session.setActivity({
      sourceName: "외부 작업.skp",
      progress: { stage: "building-scene", fraction: null, execution: "worker" },
    });
    const before = session.getSnapshot();
    await run.complete({ status: "abandoned" });
    expect(session.getSnapshot()).toBe(before);
  });
});
