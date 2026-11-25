// @vitest-environment jsdom
import { webcrypto } from "node:crypto";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { StudioHumanInkLedgerPanel, buildHumanInkMerkleLedger, buildScenarioHumanInkLedger, computeEventDigestHex, digestHumanInkNoteJson, createNextHumanPenStrokeEvent, computeVelocityVariance, MAX_LEDGER_EVENTS, computePressureEntropyBits, encodeUtf8Bytes, evaluateRightsBomContaminationGate, exportC2paHumanInkManifestJson, getHumanInkScenario, verifyHumanInkLedger, verifyMerkleInclusionProof, type HumanInkLedgerEvent, type HumanInkMerkleLedger } from "./index";

beforeEach(() => { vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("구분자를 포함한 서로 다른 원문 필드가 같은 이벤트 digest로 합쳐지지 않는다", () => {
  const base = getHumanInkScenario("pure-human-ink").events[0];
  const a = { ...base, layerId: "a|b", toolLabel: "c" };
  const b = { ...base, layerId: "a", toolLabel: "b|c" };
  expect(computeEventDigestHex(a)).not.toBe(computeEventDigestHex(b));
});

it("유효 필압의 작은 소수 변조도 반올림으로 숨기지 않는다", () => {
  const ledger = buildScenarioHumanInkLedger("pure-human-ink");
  const changed = ledger.events.map((event, i) => i === 0 ? { ...event, pressureEntropyBits: event.pressureEntropyBits + 0.000001 } : event);
  expect(verifyHumanInkLedger(ledger, changed).valid).toBe(false);
});

it.each(["summary", "gate", "proof", "digests", "chain", "tree", "manuscript"] as const)("외부 원장 %s 메타데이터 변경도 검증 실패로 처리한다", (field) => {
  const ledger = structuredClone(buildScenarioHumanInkLedger("pure-human-ink"));
  if (field === "summary") Reflect.set(ledger.summaryProof, "humanAuthorshipScore", 999);
  if (field === "gate") Reflect.set(ledger.rightsBomGate, "gateReasonEn", "Forged clearance");
  if (field === "proof") Reflect.set(ledger.inclusionProofs[0] ?? {}, "leafIndex", 999);
  if (field === "digests") Reflect.set(ledger.eventDigests, "0", "ffffffffffffffff");
  if (field === "chain") Reflect.set(ledger.chainHashes, "0", "ffffffffffffffff");
  if (field === "tree") Reflect.set(ledger.treeLevels[0] ?? [], "0", "ffffffffffffffff");
  if (field === "manuscript") Reflect.set(ledger, "workId", "다른 원고");
  expect(verifyHumanInkLedger(ledger).valid).toBe(false);
});

it("외부 true 리포트가 변조된 원장 내보내기 검증을 우회하지 못한다", () => {
  const ledger = buildScenarioHumanInkLedger("pure-human-ink");
  const cleanReport = verifyHumanInkLedger(ledger);
  const changed = structuredClone(ledger);
  Reflect.set(changed.events[0] ?? {}, "sourceNoteKo", "변조된 원문");
  expect(() => exportC2paHumanInkManifestJson(changed, cleanReport)).toThrow();
});

it.each(["duplicate", "nonfinite", "count", "enum", "sequence"] as const)("잘못된 이벤트 %s 입력을 생성 전에 거부한다", (field) => {
  const event = getHumanInkScenario("pure-human-ink").events[0];
  const list: HumanInkLedgerEvent[] = [{ ...event }];
  if (field === "duplicate") list.push({ ...event, sequenceIndex: 1 });
  if (field === "nonfinite") Reflect.set(list[0] ?? {}, "timestampMs", Number.NaN);
  if (field === "count") for (let i = 1; i <= 256; i += 1) list.push({ ...event, eventId: `event-${i}`, sequenceIndex: i });
  if (field === "enum") Reflect.set(list[0] ?? {}, "kind", "unknown-event");
  if (field === "sequence") Reflect.set(list[0] ?? {}, "sequenceIndex", 0.5);
  expect(() => buildHumanInkMerkleLedger(list)).toThrow();
});

it("NaN 페이지수·과다 필압 샘플을 제한한다", () => {
  expect(() => buildHumanInkMerkleLedger([], { pageCount: Number.NaN })).toThrow();
  expect(() => computePressureEntropyBits(new Array<number>(4097).fill(0.5))).toThrow();
});

it("서로게이트 단독 코드를 표준 UTF-8 대체 문자로 인코딩한다", () => {
  expect(encodeUtf8Bytes("\ud800")).toEqual([239, 191, 189]);
});

it("머클 proof 범위·깊이·위치 변경을 루트가 같아도 허용하지 않는다", () => {
  const ledger = buildHumanInkMerkleLedger(getHumanInkScenario("pure-human-ink").events.slice(0, 1));
  const proof = ledger.inclusionProofs[0];
  if (!proof) throw new Error("Missing proof");
  expect(verifyMerkleInclusionProof({ ...proof, leafIndex: 99 }).valid).toBe(false);
});

it("자가 신고 표본 태그만으로 상업 출고를 허가하지 않는다", () => {
  for (const id of ["pure-human-ink", "hybrid-human-cc0-3d"] as const) {
    const gate = evaluateRightsBomContaminationGate(getHumanInkScenario(id).events);
    expect(gate.exportAllowed).toBe(false);
    expect(gate.failClosedTriggered).toBe(true);
  }
});

it("unsigned checksum JSON에 인간 저작자·C2PA·권리 정본 검증 증거가 없음을 명시한다", () => {
  const json = JSON.parse(exportC2paHumanInkManifestJson(buildScenarioHumanInkLedger("pure-human-ink"))) as { runtimeEvidence?: Record<string, unknown> };
  expect(json.runtimeEvidence).toMatchObject({ humanAuthorshipVerified: false, copyrightVerified: false, authorityRegistryChecked: false, c2paConformant: false, signed: false, zeroKnowledgeProof: false, canvasEventsCaptured: false, ledgerPersisted: false });
});

it("클립보드 ACK 전에는 복사 성공과 외부 전달을 표시하지 않는다", async () => {
  let complete: (() => void) | undefined;
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(() => new Promise<void>((resolve) => { complete = resolve; })) } });
  const callback = vi.fn();
  render(<StudioHumanInkLedgerPanel onExportJson={callback} />);
  fireEvent.click(screen.getByTestId("human-ink-copy-json-btn"));
  await waitFor(() => expect(complete).toBeTypeOf("function"));
  try { expect(callback).not.toHaveBeenCalled(); expect(screen.getByTestId("human-ink-status-banner").textContent).not.toContain("복사했습니다"); }
  finally { await act(async () => { complete?.(); }); }
});

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve: () => void = () => { throw new Error("Promise not initialized"); };
  const promise = new Promise<void>((complete) => { resolve = complete; });
  return { promise, resolve };
}

async function nativeDigest(_algorithm: string, bytes: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  return webcrypto.subtle.digest("SHA-256", bytes);
}

it("실제 WebCrypto SHA-256의 알려진 벡터·바이트 길이를 검증한다", async () => {
  const digest = await digestHumanInkNoteJson("abc");
  expect(digest).toEqual({ algorithm: "SHA-256", digestHex: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", byteLength: 3, covers: "unsigned-note-json-without-noteDigest", signed: false });
});

it("원문 Unicode·필압 소수와 기존 유효 페이지수 정규화를 보존한다", () => {
  const text = "  e\u0301 / é / 한글 / 🖌️ / | / \ud800  ";
  const source = Object.freeze({ ...getHumanInkScenario("pure-human-ink").events[0], eventId: text, sourceNoteKo: text, pressureEntropyBits: 0.000001 });
  const ledger = buildHumanInkMerkleLedger([source], { workId: text, episodeTitleKo: text, pageCount: 2.9 });
  expect(ledger.events[0]).toEqual(source);
  expect(ledger.pageCount).toBe(2);
  expect(buildHumanInkMerkleLedger([source], { pageCount: -4 }).pageCount).toBe(1);
  const note = JSON.parse(exportC2paHumanInkManifestJson(ledger)) as { manuscript: { workId: string; episodeTitleKo: string } };
  expect(note.manuscript.workId).toBe(text);
  expect(note.manuscript.episodeTitleKo).toBe(text);
  expect(source.sourceNoteKo).toBe(text);
});

it("합법적 재정렬은 원문 sequenceIndex를 보존하며 다른 루트가 된다", () => {
  const original = getHumanInkScenario("pure-human-ink").events;
  const reversed = [...original].reverse();
  const ledger = buildHumanInkMerkleLedger(reversed);
  expect(ledger.events.map((event) => event.sequenceIndex)).toEqual(reversed.map((event) => event.sequenceIndex));
  expect(verifyHumanInkLedger(ledger).valid).toBe(true);
  expect(ledger.merkleRootHex).not.toBe(buildHumanInkMerkleLedger(original).merkleRootHex);
});

it("최대 256건은 생성·검증·내보내기가 모두 가능하고 다음 추가는 거부한다", () => {
  const base = getHumanInkScenario("pure-human-ink").events[0];
  const events = Array.from({ length: MAX_LEDGER_EVENTS }, (_, sequenceIndex) => ({ ...base, eventId: `event-${sequenceIndex}`, sequenceIndex }));
  const before = structuredClone(events);
  const ledger = buildHumanInkMerkleLedger(events);
  expect(ledger.events).toHaveLength(256);
  expect(ledger.treeDepth).toBe(8);
  expect(verifyHumanInkLedger(ledger).valid).toBe(true);
  expect(() => exportC2paHumanInkManifestJson(ledger)).not.toThrow();
  expect(() => createNextHumanPenStrokeEvent(events)).toThrow();
  expect(events).toEqual(before);
});

it("전체 텍스트 상한을 해시 생성 전에 검사하고 입력을 자르지 않는다", () => {
  const base = getHumanInkScenario("pure-human-ink").events[0];
  const events = Array.from({ length: 64 }, (_, sequenceIndex) => ({ ...base, eventId: `event-${sequenceIndex}`, sequenceIndex, sourceNoteKo: "가".repeat(4096), sourceNoteEn: "b".repeat(4096) }));
  expect(() => buildHumanInkMerkleLedger(events)).toThrow(/text limit/u);
  expect(events[0]?.sourceNoteKo).toHaveLength(4096);
});

it("표본 추가 ID는 기존 사용자 ID와 충돌하지 않고 카탈로그 반환값도 격리한다", () => {
  const scenario = getHumanInkScenario("pure-human-ink");
  Reflect.set(scenario.events[0] ?? {}, "eventId", "EVT-INK-009");
  const next = createNextHumanPenStrokeEvent(scenario.events);
  expect(next.eventId).not.toBe("EVT-INK-009");
  expect(getHumanInkScenario("pure-human-ink").events[0]?.eventId).toBe("PURE-001");
});

it("아주 큰 유한 속도 샘플도 overflow 없이 상대 분산을 보존한다", () => {
  expect(computeVelocityVariance([1e308, 5e307])).toBe(computeVelocityVariance([2, 1]));
});

it("외부 원장 배열·리포트 상한과 비정상 proof 깊이를 즉시 거부한다", () => {
  const ledger = buildScenarioHumanInkLedger("pure-human-ink");
  const oversized = { ...ledger, leafHashes: new Array<string>(257).fill("ffffffffffffffff") };
  expect(verifyHumanInkLedger(oversized).valid).toBe(false);
  const report = { ...verifyHumanInkLedger(ledger), valid: false, tamperedLeafIndices: new Array<number>(257).fill(0) };
  expect(() => exportC2paHumanInkManifestJson(ledger, report)).toThrow();
  const proof = ledger.inclusionProofs[0];
  if (!proof) throw new Error("Missing proof");
  expect(verifyMerkleInclusionProof({ ...proof, treeDepth: 999 }).valid).toBe(false);
  expect(verifyMerkleInclusionProof({ ...proof, leafCount: Number.NaN }).valid).toBe(false);
  expect(verifyMerkleInclusionProof({ ...proof, siblings: proof.siblings.map((step, index) => index === 0 ? { ...step, level: 5 } : step) }).valid).toBe(false);
});

it("SHA-256 대기 중 작화 표본이 바뀌어도 원래 요청과 최신 수신자만 사용한다", async () => {
  const gate = deferred();
  const digest = vi.fn(async (algorithm: string, bytes: Uint8Array<ArrayBuffer>) => { await gate.promise; return nativeDigest(algorithm, bytes); });
  vi.stubGlobal("crypto", { subtle: { digest } });
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const oldRecipient = vi.fn();
  const latest = vi.fn();
  const view = render(<StudioHumanInkLedgerPanel onExportJson={oldRecipient} />);
  fireEvent.click(screen.getByTestId("human-ink-copy-json-btn"));
  fireEvent.click(screen.getByTestId("human-ink-add-stroke-btn"));
  view.rerender(<StudioHumanInkLedgerPanel onExportJson={latest} />);
  expect(writeText).not.toHaveBeenCalled();
  expect(latest).not.toHaveBeenCalled();
  expect(screen.getByTestId("human-ink-digest-pending")).toBeTruthy();
  await act(async () => { gate.resolve(); });
  await waitFor(() => expect(latest).toHaveBeenCalledOnce());
  expect(oldRecipient).not.toHaveBeenCalled();
  expect(latest.mock.calls[0]?.[1].events).toHaveLength(8);
  expect(screen.getByTestId("human-ink-merkle-svg").getAttribute("data-leaf-count")).toBe("9");
  const note: Record<string, unknown> = JSON.parse(writeText.mock.calls[0]?.[0] ?? "{}");
  const noteDigest = note.noteDigest;
  delete note.noteDigest;
  expect(noteDigest).toEqual(await digestHumanInkNoteJson(JSON.stringify(note, null, 2)));
  expect(digest).toHaveBeenCalledTimes(2);
});

it("digest 실패는 FNV 성공으로 대체하지 않고 같은 원문으로 재시도한다", async () => {
  const digest = vi.fn(nativeDigest).mockRejectedValueOnce(new Error("digest failed"));
  vi.stubGlobal("crypto", { subtle: { digest } });
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const recipient = vi.fn();
  render(<StudioHumanInkLedgerPanel onExportJson={recipient} />);
  fireEvent.click(screen.getByTestId("human-ink-copy-json-btn"));
  await waitFor(() => expect(screen.getByTestId("human-ink-export-retry-btn")).toBeTruthy());
  expect(writeText).not.toHaveBeenCalled();
  expect(recipient).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId("human-ink-add-stroke-btn"));
  fireEvent.click(screen.getByTestId("human-ink-export-retry-btn"));
  await waitFor(() => expect(recipient).toHaveBeenCalledOnce());
  expect(recipient.mock.calls[0]?.[1].events).toHaveLength(8);
  expect(digest).toHaveBeenCalledTimes(2);
});

it("WebCrypto가 없으면 오류로 남고 가짜 SHA-256 결과를 전달하지 않는다", async () => {
  vi.stubGlobal("crypto", {});
  const writeText = vi.fn();
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const recipient = vi.fn();
  render(<StudioHumanInkLedgerPanel onExportJson={recipient} />);
  fireEvent.click(screen.getByTestId("human-ink-copy-json-btn"));
  await waitFor(() => expect(screen.getByTestId("human-ink-export-retry-btn")).toBeTruthy());
  expect(writeText).not.toHaveBeenCalled();
  expect(recipient).not.toHaveBeenCalled();
});

it("복사 실패 재시도는 digest를 다시 계산하지 않고 같은 JSON과 최신 수신자를 쓴다", async () => {
  const digest = vi.fn(nativeDigest);
  vi.stubGlobal("crypto", { subtle: { digest } });
  const writeText = vi.fn().mockRejectedValueOnce(new Error("denied")).mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const first = vi.fn();
  const latest = vi.fn();
  const view = render(<StudioHumanInkLedgerPanel onExportJson={first} />);
  fireEvent.click(screen.getByTestId("human-ink-copy-json-btn"));
  await waitFor(() => expect(screen.getByTestId("human-ink-export-retry-btn")).toBeTruthy());
  const originalJson = writeText.mock.calls[0]?.[0];
  fireEvent.click(screen.getByTestId("human-ink-add-stroke-btn"));
  view.rerender(<StudioHumanInkLedgerPanel onExportJson={latest} />);
  fireEvent.click(screen.getByTestId("human-ink-export-retry-btn"));
  await waitFor(() => expect(latest).toHaveBeenCalledOnce());
  expect(first).not.toHaveBeenCalled();
  expect(writeText.mock.calls[1]?.[0]).toBe(originalJson);
  expect(latest.mock.calls[0]?.[0]).toBe(originalJson);
  expect(latest.mock.calls[0]?.[1].events).toHaveLength(8);
  expect(digest).toHaveBeenCalledOnce();
});

it("ACK 대기 중 추가된 알림이 거절된 뒤 제거되면 복사 성공으로 바꾸지 않는다", async () => {
  const copyAck = deferred();
  const writeText = vi.fn(() => copyAck.promise);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const rejected = vi.fn(() => Promise.reject(new Error("rejected")));
  const latest = vi.fn();
  const view = render(<StudioHumanInkLedgerPanel />);
  fireEvent.click(screen.getByTestId("human-ink-copy-json-btn"));
  await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
  view.rerender(<StudioHumanInkLedgerPanel onExportJson={rejected} />);
  await act(async () => { copyAck.resolve(); });
  await waitFor(() => expect(screen.getByTestId("human-ink-export-retry-btn")).toBeTruthy());
  view.rerender(<StudioHumanInkLedgerPanel />);
  fireEvent.click(screen.getByTestId("human-ink-export-retry-btn"));
  await waitFor(() => expect(screen.getByTestId("human-ink-export-retry-btn")).toBeTruthy());
  expect(screen.queryByText(/요청한 표본 JSON을 복사했습니다/u)).toBeNull();
  view.rerender(<StudioHumanInkLedgerPanel onExportJson={latest} />);
  fireEvent.click(screen.getByTestId("human-ink-export-retry-btn"));
  await waitFor(() => expect(latest).toHaveBeenCalledOnce());
  expect(writeText).toHaveBeenCalledOnce();
  expect(rejected).toHaveBeenCalledOnce();
});

it.each(["throw", "reject"] as const)("원장 알림 %s에도 원문을 보존하고 최신 수신자에게 재시도한다", async (mode) => {
  const failed = vi.fn(() => {
    if (mode === "throw") throw new Error("failed");
    return Promise.reject(new Error("failed"));
  });
  const latest = vi.fn();
  const view = render(<StudioHumanInkLedgerPanel onLedgerChange={failed} />);
  expect(failed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId("human-ink-add-stroke-btn"));
  await waitFor(() => expect(screen.getByTestId("human-ink-notification-retry-btn")).toBeTruthy());
  expect(screen.getByTestId("human-ink-merkle-svg").getAttribute("data-leaf-count")).toBe("9");
  view.rerender(<StudioHumanInkLedgerPanel onLedgerChange={latest} />);
  expect(latest).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId("human-ink-notification-retry-btn"));
  await waitFor(() => expect(latest).toHaveBeenCalledOnce());
  expect(latest.mock.calls[0]?.[0].events).toHaveLength(9);
});

it("pending 원장 알림은 최신 한 건만 전달하고 수신자의 변조를 UI 원장에 반영하지 않는다", async () => {
  const ack = deferred();
  const first = vi.fn(() => ack.promise);
  const latest = vi.fn((ledger: HumanInkMerkleLedger) => { Reflect.set(ledger.summaryProof, "humanInkStrokeRatioPercent", 999); });
  const view = render(<StudioHumanInkLedgerPanel onLedgerChange={first} />);
  fireEvent.click(screen.getByTestId("human-ink-add-stroke-btn"));
  view.rerender(<StudioHumanInkLedgerPanel onLedgerChange={latest} />);
  fireEvent.click(screen.getByTestId("human-ink-scenario-hybrid-human-cc0-3d"));
  fireEvent.click(screen.getByTestId("human-ink-scenario-contaminated-external-scan"));
  expect(latest).not.toHaveBeenCalled();
  await act(async () => { ack.resolve(); });
  await waitFor(() => expect(latest).toHaveBeenCalledOnce());
  expect(latest.mock.calls[0]?.[0].scenarioId).toBe("contaminated-external-scan");
  expect(screen.getByTestId("human-ink-metric-human-ratio").textContent).toBe("62.5%");
});

it("unmount 뒤 비동기 digest가 끝나도 클립보드와 알림을 실행하지 않는다", async () => {
  const gate = deferred();
  const digest = vi.fn(async (algorithm: string, bytes: Uint8Array<ArrayBuffer>) => { await gate.promise; return nativeDigest(algorithm, bytes); });
  vi.stubGlobal("crypto", { subtle: { digest } });
  const writeText = vi.fn();
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const callback = vi.fn();
  const view = render(<StudioHumanInkLedgerPanel onExportJson={callback} />);
  fireEvent.click(screen.getByTestId("human-ink-copy-json-btn"));
  view.unmount();
  await act(async () => { gate.resolve(); });
  expect(writeText).not.toHaveBeenCalled();
  expect(callback).not.toHaveBeenCalled();
});

it("자체 JSON 내보내기는 유효 소수 원문을 반올림해 잃지 않는다", () => {
  const event = { ...getHumanInkScenario("pure-human-ink").events[0], pressureEntropyBits: 0.000001, velocityVariance: 0.000002 };
  const note = JSON.parse(exportC2paHumanInkManifestJson(buildHumanInkMerkleLedger([event]))) as { assertions: { "c2pa.actions": { actions: { parameters: { pressureEntropyBits: number; velocityVariance: number } }[] } } };
  expect(note.assertions["c2pa.actions"].actions[0]?.parameters).toMatchObject({ pressureEntropyBits: 0.000001, velocityVariance: 0.000002 });
});

it("마지막 허용 날짜 뒤로 표본을 추가할 때 잘못된 날짜를 반환하지 않는다", () => {
  const event = { ...getHumanInkScenario("pure-human-ink").events[0], timestampMs: 8_640_000_000_000_000 };
  expect(() => createNextHumanPenStrokeEvent([event])).toThrow();
});

it("자가 신고 태그만으로 통과·검증 완료 상태 코드를 내보내지 않는다", () => {
  const ledger = buildScenarioHumanInkLedger("hybrid-human-cc0-3d");
  expect(ledger.rightsBomGate.status).toBe("blocked-unverified");
  expect(ledger.summaryProof.humanAuthorshipScore).toBe(0);
});
