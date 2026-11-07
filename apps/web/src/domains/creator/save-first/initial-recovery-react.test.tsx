// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { useEffect, useLayoutEffect, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { createStudioInitialRecoveryAdmission, guardStudioInitialRecoveryPointer } from "./initial-recovery";

const key = "synthetic-batched-initial-read";
afterEach(cleanup);

type Props = { documentKey: string; locked: boolean; local: boolean; fail?: boolean };
function harness(read: (key: string) => Promise<void>, onLayout: (blocked: boolean) => void = () => {}) {
  const provider = vi.fn(), crdt = vi.fn();
  const hook = renderHook(({ documentKey, locked, local, fail }: Props) => {
    const [gate] = useState(() => createStudioInitialRecoveryAdmission(local ? documentKey : null));
    const [checked, setChecked] = useState(true);
    const [checkedKey, setCheckedKey] = useState<string | null>(documentKey);
    const [readSucceeded, setReadSucceeded] = useState(false);
    const ready = !local || (readSucceeded && checked && checkedKey === documentKey);
    const blocked = gate.renderBlocked(documentKey, ready);
    useLayoutEffect(() => { gate.commit(documentKey, ready); }, [gate, documentKey, ready]);
    const down = guardStudioInitialRecoveryPointer(() => gate.blocked(documentKey), () => {}, () => { provider(); crdt(); });
    // This runs before passive reconciliation, exposing unlock-before-effect behavior.
    useLayoutEffect(() => { onLayout(gate.blocked(documentKey)); });
    useEffect(() => {
      let cancelled = false;
      setReadSucceeded(false);
      if (locked) { setCheckedKey(documentKey); setChecked(true); return; }
      setCheckedKey(null); setChecked(false);
      void read(documentKey).then(() => {
        if (cancelled) return;
        setReadSucceeded(!fail);
        setCheckedKey(documentKey); setChecked(true);
      });
      return () => { cancelled = true; };
    }, [documentKey, locked, fail]);
    return { blocked, readSucceeded, down };
  }, { initialProps: { documentKey: key, locked: true, local: true } as Props });
  return { ...hook, provider, crdt };
}

it("locked synthetic backup flags와 실제 read 결과가 같아도 boolean provenance가 React commit을 만든다", async () => {
  const observed: boolean[] = [];
  const h = harness(() => Promise.resolve(), (blocked) => observed.push(blocked));
  act(() => { h.result.current.down(undefined); });
  expect(h.provider).not.toHaveBeenCalled(); expect(h.crdt).not.toHaveBeenCalled();
  expect(h.result.current.blocked).toBe(true);
  observed.length = 0;
  await act(async () => { h.rerender({ documentKey: key, locked: false, local: true }); });
  expect(observed[0]).toBe(true);
  expect(h.result.current.blocked).toBe(false);
  act(() => { h.result.current.down(undefined); });
  expect(h.provider).toHaveBeenCalledTimes(1); expect(h.crdt).toHaveBeenCalledTimes(1);
});

it("같은 local 문서 unlock 뒤 read가 미결이면 synthetic metadata와 무관하게 차단한다", async () => {
  let release!: () => void;
  const h = harness(() => new Promise<void>((resolve) => { release = resolve; }));
  act(() => { h.rerender({ documentKey: key, locked: false, local: true }); });
  act(() => { h.result.current.down(undefined); });
  expect(h.result.current.blocked).toBe(true); expect(h.provider).not.toHaveBeenCalled();
  await act(async () => { release(); });
  expect(h.result.current.readSucceeded).toBe(true); expect(h.result.current.blocked).toBe(false);
});

it("read 실패는 열지 않으며 같은 key에서 실제 read 성공한 재확인만 연다", async () => {
  const h = harness(() => Promise.resolve());
  await act(async () => { h.rerender({ documentKey: key, locked: false, local: true, fail: true }); });
  expect(h.result.current.blocked).toBe(true); expect(h.result.current.readSucceeded).toBe(false);
  await act(async () => { h.rerender({ documentKey: key, locked: false, local: true, fail: false }); });
  expect(h.result.current.blocked).toBe(false);
});

it("이전 문서의 늦은 read는 cancelled guard 뒤 state를 갱신하지 않는다", async () => {
  let release!: () => void;
  const h = harness(() => new Promise<void>((resolve) => { release = resolve; }));
  act(() => { h.rerender({ documentKey: key, locked: false, local: true }); });
  act(() => { h.rerender({ documentKey: "other", locked: true, local: true }); });
  await act(async () => { release(); });
  expect(h.result.current.readSucceeded).toBe(false);
  expect(h.result.current.blocked).toBe(false); // First-document gate retired, not a broad recovery protocol.
});

it("shared/scoped 역할로 바뀌면 storage read 없이 기존 admission 정책으로 돌아간다", () => {
  const h = harness(() => new Promise<void>(() => {}));
  act(() => { h.rerender({ documentKey: key, locked: true, local: false }); });
  act(() => { h.result.current.down(undefined); });
  expect(h.result.current.readSucceeded).toBe(false);
  expect(h.result.current.blocked).toBe(false); expect(h.provider).toHaveBeenCalledOnce();
});
