import { describe, expect, it, vi } from "vitest";

import { persistStudioAutosaveWithOpfsPrimary } from "../studio-autosave-opfs-session";
import { isStudioAutosaveSupersededFailure } from "../studio-cuttoon-editor/runtime/studio-autosave-monotonic-gate";
import { FakeAutosaveJournal, payload, session } from "./studio-autosave-opfs-test-fixtures";

function deferred() {
  let finish: () => void = () => undefined;
  let fail: (cause: unknown) => void = () => undefined;
  const promise = new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; });
  return { promise, finish: () => finish(), fail: (cause: unknown) => fail(cause) };
}

function observe<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (cause: unknown) => ({ ok: false as const, cause }),
  );
}

async function blockedSession(key?: string) {
  const journal = new FakeAutosaveJournal();
  const gate = deferred();
  journal.appendGate = gate.promise;
  const append = vi.spyOn(journal, "appendCheckpoint");
  const target = session(journal, key);
  const first = target.write(payload("2026-11-21T01:00:00.000Z", "first"));
  await vi.waitFor(() => expect(append).toHaveBeenCalledTimes(1));
  return { journal, gate, append, target, first };
}

describe("느린 OPFS 자동저장의 대기 스냅샷", () => {
  it("진행 중 저장을 마치고 100개 대기 원고 중 최신 원고만 기록한다", async () => {
    const { gate, append, target, first } = await blockedSession();
    const writes = Array.from({ length: 100 }, (_, index) => target.write(payload(
      new Date(Date.UTC(2026, 10, 21, 1, 0, index + 1)).toISOString(),
      `stroke-${index + 1}`,
    )).then(
      (receipt) => ({ ok: true as const, receipt }),
      (cause: unknown) => ({ ok: false as const, cause }),
    ));

    try {
      gate.finish();
      await expect(first).resolves.toMatchObject({ revision: 1 });
      const results = await Promise.all(writes);
      expect(append).toHaveBeenCalledTimes(2);
      expect(results.slice(0, -1).every((result) => (
        !result.ok && isStudioAutosaveSupersededFailure(result.cause)
      ))).toBe(true);
      expect(results.at(-1)).toMatchObject({ ok: true, receipt: { revision: 2 } });
      expect(await target.readLatest()).toMatchObject({
        payload: { pagesList: [{ elements: [{ id: "stroke-100" }] }] },
      });
    } finally {
      gate.finish();
      await target.dispose();
    }
  });

  it("읽기와 삭제 경계 앞의 원고를 보존하고 삭제 뒤의 편집을 구분한다", async () => {
    const { gate, append, target, first } = await blockedSession();
    const beforeRead = observe(target.write(payload("2026-11-21T01:01:00.000Z", "before-read")));
    const readBefore = target.readLatest();
    const replaced = observe(target.write(payload("2026-11-21T01:02:00.000Z", "replaced")));
    const beforeClear = observe(target.write(payload("2026-11-21T01:03:00.000Z", "before-clear")));
    const clearing = target.clear("2026-11-21T01:04:00.000Z");
    const readCleared = target.readLatest();
    const afterClear = target.write(payload("2026-11-21T01:05:00.000Z", "after-clear"));
    try {
      gate.finish();
      await first;
      expect(await beforeRead).toMatchObject({ ok: true, value: { revision: 2 } });
      expect(await readBefore).toMatchObject({
        payload: { pagesList: [{ elements: [{ id: "before-read" }] }] },
      });
      const skipped = await replaced;
      expect(!skipped.ok && isStudioAutosaveSupersededFailure(skipped.cause)).toBe(true);
      expect(await beforeClear).toMatchObject({ ok: true, value: { revision: 3 } });
      await clearing;
      expect(await readCleared).toMatchObject({ state: "cleared", revision: 4 });
      await afterClear;
      expect(await target.readLatest()).toMatchObject({
        revision: 5, payload: { pagesList: [{ elements: [{ id: "after-clear" }] }] },
      });
      expect(append).toHaveBeenCalledTimes(5);
    } finally {
      gate.finish();
      await target.dispose();
    }
  });

  it("flush 시점까지 받은 원고를 뒤의 편집으로 대체하지 않는다", async () => {
    const { gate, append, target, first } = await blockedSession();
    const before = observe(target.write(payload("2026-11-21T01:01:00.000Z", "before-flush")));
    const flushing = target.flush();
    const replaced = observe(target.write(payload("2026-11-21T01:02:00.000Z", "replaced")));
    const after = target.write(payload("2026-11-21T01:03:00.000Z", "after-flush"));
    try {
      gate.finish();
      await first;
      await flushing;
      expect(await before).toMatchObject({ ok: true, value: { revision: 2 } });
      expect(await replaced).toMatchObject({ ok: false });
      await after;
      expect(append).toHaveBeenCalledTimes(3);
      expect(await target.readLatest()).toMatchObject({
        payload: { pagesList: [{ elements: [{ id: "after-flush" }] }] },
      });
    } finally {
      gate.finish();
      await target.dispose();
    }
  });

  it("명시적 AbortSignal 작업은 앞 원고를 대체하지 않고 자체 취소 결과를 돌려준다", async () => {
    const { gate, append, target, first } = await blockedSession();
    const before = observe(target.write(payload("2026-11-21T01:01:00.000Z", "before-abort")));
    const controller = new AbortController();
    const aborted = observe(target.write(
      payload("2026-11-21T01:02:00.000Z", "aborted"), controller.signal,
    ));
    const after = target.write(payload("2026-11-21T01:03:00.000Z", "after-abort"));
    controller.abort(new DOMException("명시적으로 취소한 저장", "AbortError"));
    try {
      gate.finish();
      await first;
      expect(await before).toMatchObject({ ok: true, value: { revision: 2 } });
      const cancelled = await aborted;
      expect(cancelled).toMatchObject({
        ok: false, cause: { name: "AbortError", message: "명시적으로 취소한 저장" },
      });
      expect(!cancelled.ok && isStudioAutosaveSupersededFailure(cancelled.cause)).toBe(false);
      await after;
      expect(append).toHaveBeenCalledTimes(3);
      expect(await target.readLatest()).toMatchObject({
        payload: { pagesList: [{ elements: [{ id: "after-abort" }] }] },
      });
    } finally {
      gate.finish();
      await target.dispose();
    }
  });

  it("진행 중 쓰기가 실패해도 최신 대기 원고와 후속 재시도를 기록한다", async () => {
    const { journal, gate, append, target, first } = await blockedSession();
    const failed = observe(first);
    const replaced = observe(target.write(payload("2026-11-21T01:01:00.000Z", "replaced")));
    const latest = target.write(payload("2026-11-21T01:02:00.000Z", "latest"));
    journal.appendGate = null;
    try {
      gate.fail(new Error("disk write failed"));
      expect(await failed).toMatchObject({ ok: false, cause: { message: "disk write failed" } });
      expect(await replaced).toMatchObject({ ok: false });
      await expect(latest).resolves.toMatchObject({ revision: 1 });
      await expect(target.write(payload("2026-11-21T01:03:00.000Z", "retry")))
        .resolves.toMatchObject({ revision: 2 });
      expect(append).toHaveBeenCalledTimes(3);
      expect(await target.readLatest()).toMatchObject({
        payload: { pagesList: [{ elements: [{ id: "retry" }] }] },
      });
    } finally {
      gate.finish();
      await target.dispose();
    }
  });

  it("dispose는 새 요청을 닫고 이미 받은 최신 원고까지 저장한 뒤 writer를 반납한다", async () => {
    const { journal, gate, append, target, first } = await blockedSession();
    const replaced = observe(target.write(payload("2026-11-21T01:01:00.000Z", "replaced")));
    const latest = target.write(payload("2026-11-21T01:02:00.000Z", "latest"));
    const disposing = target.dispose();
    try {
      await expect(target.write(payload("2026-11-21T01:03:00.000Z", "after-dispose")))
        .rejects.toThrow("sessionDisposed");
      expect(journal.releaseCount).toBe(0);
      gate.finish();
      await first;
      await latest;
      await disposing;
      expect(await replaced).toMatchObject({ ok: false });
      expect(append).toHaveBeenCalledTimes(2);
      expect(journal.releaseCount).toBe(1);
      const reopened = session(journal);
      expect(await reopened.readLatest()).toMatchObject({
        payload: { pagesList: [{ elements: [{ id: "latest" }] }] },
      });
      await reopened.dispose();
    } finally {
      gate.finish();
      await disposing;
    }
  });

  it("대체된 OPFS 요청을 SQLite 우회 저장이나 성공 영수증으로 승격하지 않는다", async () => {
    const { gate, target, first } = await blockedSession();
    const sqlite = {
      read: vi.fn(async () => null),
      write: vi.fn(async () => undefined),
      clear: vi.fn(async () => undefined),
    };
    const degraded = vi.fn();
    const replaced = observe(persistStudioAutosaveWithOpfsPrimary({
      session: target,
      sqlite,
      storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
      key: "toonstudio-studio-autosave:v12:guest:new",
      payload: payload("2026-11-21T01:01:00.000Z", "replaced"),
      onDurableAuthorityDegraded: degraded,
    }));
    const latest = target.write(payload("2026-11-21T01:02:00.000Z", "latest"));
    try {
      gate.finish();
      await first;
      const skipped = await replaced;
      expect(!skipped.ok && isStudioAutosaveSupersededFailure(skipped.cause)).toBe(true);
      await latest;
      expect(sqlite.write).not.toHaveBeenCalled();
      expect(degraded).not.toHaveBeenCalled();
      expect(await target.readLatest()).toMatchObject({
        savedAt: "2026-11-21T01:02:00.000Z",
        payload: { pagesList: [{ elements: [{ id: "latest" }] }] },
      });
    } finally {
      gate.finish();
      await target.dispose();
    }
  });

  it("서로 다른 원고 세션의 대기 스냅샷을 합치지 않는다", async () => {
    const left = await blockedSession("document-left");
    const right = await blockedSession("document-right");
    const leftLatest = left.target.write(payload("2026-11-21T01:01:00.000Z", "left"));
    const rightLatest = right.target.write(payload("2026-11-21T01:01:00.000Z", "right"));
    try {
      left.gate.finish();
      await left.first;
      await leftLatest;
      expect(right.append).toHaveBeenCalledTimes(1);
      right.gate.finish();
      await right.first;
      await rightLatest;
      expect(await left.target.readLatest()).toMatchObject({
        payload: { pagesList: [{ elements: [{ id: "left" }] }] },
      });
      expect(await right.target.readLatest()).toMatchObject({
        payload: { pagesList: [{ elements: [{ id: "right" }] }] },
      });
    } finally {
      left.gate.finish();
      right.gate.finish();
      await Promise.all([left.target.dispose(), right.target.dispose()]);
    }
  });
});
