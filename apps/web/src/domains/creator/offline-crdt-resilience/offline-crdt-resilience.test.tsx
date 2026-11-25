// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  compactCrdtOpLog,
  compareVectorClocks,
  computeCrc32,
  computeCrc32Hex,
  computeSha256Hex,
  corruptManuscriptChunk,
  createDefaultCrdtOpLog,
  createDefaultManuscriptParityStripe,
  createInitialTabWriterLeaseState,
  incrementVectorClock,
  mergeVectorClocks,
  stepTabWriterLease,
  StudioOfflineResiliencePanel,
  verifyAndRepairManuscriptChunks,
  type CrdtOperation,
} from "./index";

const MODULE_DIR = resolve(
  process.cwd(),
  "apps/web/src/domains/creator/offline-crdt-resilience",
);

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("Wave 42D: 오프라인 CRDT 벡터시계 · OPFS 16K 패리티 복구 · 멀티탭 단일 쓰기 잠금", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("1. compareVectorClocks는 before/after/equal/concurrent 4가지 인과 관계를 정확히 판정한다", () => {
    expect(compareVectorClocks({ a: 1, b: 0 }, { a: 1 })).toBe("equal");
    expect(compareVectorClocks({}, { a: 0, b: 0 })).toBe("equal");
    expect(compareVectorClocks({ a: 1, b: 2 }, { a: 2, b: 2 })).toBe("before");
    expect(compareVectorClocks({ a: 3, b: 2 }, { a: 2, b: 2 })).toBe("after");
    expect(compareVectorClocks({ a: 2, b: 1 }, { a: 1, b: 2 })).toBe("concurrent");
  });

  it("2. mergeVectorClocks와 incrementVectorClock는 비음수 정수로 결정론적 조인·증가를 수행한다", () => {
    const merged = mergeVectorClocks({ ipad: 3, desktop: 1 }, { desktop: 4, pen: 2 });
    expect(merged).toEqual({ desktop: 4, ipad: 3, pen: 2 });
    const bumped = incrementVectorClock(merged, "ipad");
    expect(bumped).toEqual({ desktop: 4, ipad: 4, pen: 2 });
    expect(compareVectorClocks(merged, bumped)).toBe("before");
  });

  it("3. compactCrdtOpLog는 인과적으로 덮어써진 중복 연산을 안전 병합해 오프라인 큐 용량을 절감한다", () => {
    const log = createDefaultCrdtOpLog();
    const result = compactCrdtOpLog(log);

    expect(result.originalCount).toBe(7);
    expect(result.compactedCount).toBe(3);
    expect(result.savedBytes).toBeGreaterThan(35000);
    expect(result.reductionPct).toBeGreaterThan(55);
    expect(result.compactedOps.map((o) => o.opId)).toEqual(["op-03", "op-05", "op-07"]);
    expect(result.droppedOpIds).toEqual(["op-01", "op-02", "op-04", "op-06"]);
  });

  it("4. 동시 편집 충돌 시 (lamport, actorId) LWW 타이브레이커가 결정론적 승자를 선출한다", () => {
    const log = createDefaultCrdtOpLog();
    const result = compactCrdtOpLog(log);

    expect(result.conflicts).toHaveLength(1);
    const conflict = result.conflicts[0];
    if (!conflict) throw new Error("동시 충돌 레코드 누락");
    expect(conflict.entityKey).toBe("cut-02:balloon-lead:text");
    expect(conflict.relation).toBe("concurrent");
    expect(conflict.winnerLamport).toBe(4);
    expect(conflict.loserLamport).toBe(4);
    expect(conflict.tieBreaker).toBe("actorId");
    expect(conflict.winnerActorId).toBe("ipad-main");
    expect(conflict.loserActorId).toBe("desktop-studio");
  });

  it("5. 동시 편집 충돌에서 lamport가 다르면 더 높은 lamport 연산이 actorId와 무관하게 승리한다", () => {
    const ops: CrdtOperation[] = [
      {
        opId: "a1", entityKey: "cut-09:layout", cutId: "cut-09", kind: "panel-layout",
        actorId: "z-tablet", lamport: 7, clock: { "z-tablet": 2, "a-desktop": 0 },
        payloadSummary: "구 레이아웃", payloadBytes: 900,
      },
      {
        opId: "a2", entityKey: "cut-09:layout", cutId: "cut-09", kind: "panel-layout",
        actorId: "a-desktop", lamport: 9, clock: { "z-tablet": 0, "a-desktop": 3 },
        payloadSummary: "신 레이아웃", payloadBytes: 960,
      },
    ];
    const compacted = compactCrdtOpLog(ops);
    expect(compacted.compactedOps[0]?.opId).toBe("a2");
    expect(compacted.conflicts[0]?.tieBreaker).toBe("lamport");
  });

  it("6. compactCrdtOpLog는 입력 로그 순서를 무작위로 뒤집어도 동일한 결과와 다이제스트를 보장한다(교환법칙)", () => {
    const forward = createDefaultCrdtOpLog();
    const reversed = [...forward].reverse();
    const shuffled = [forward[4], forward[1], forward[6], forward[0], forward[3], forward[5], forward[2]].filter(
      (item): item is CrdtOperation => item !== undefined,
    );

    const r1 = compactCrdtOpLog(forward);
    const r2 = compactCrdtOpLog(reversed);
    const r3 = compactCrdtOpLog(shuffled);

    expect(r1.deterministicDigest).toBe(r2.deterministicDigest);
    expect(r1.deterministicDigest).toBe(r3.deterministicDigest);
    expect(r1.compactedOps.map((o) => o.opId)).toEqual(r3.compactedOps.map((o) => o.opId));
    expect(r1.mergedClock).toEqual(r3.mergedClock);
  });

  it("7. 중복 opId 재전송 및 tombstone 삭제 연산도 안전하게 압축·보존된다", () => {
    const ops: CrdtOperation[] = [
      {
        opId: "t-1", entityKey: "cut-05:balloon-temp", cutId: "cut-05", kind: "balloon-text",
        actorId: "ipad-main", lamport: 1, clock: { "ipad-main": 1 },
        payloadSummary: "임시 대사", payloadBytes: 420,
      },
      {
        opId: "t-2", entityKey: "cut-05:balloon-temp", cutId: "cut-05", kind: "tombstone",
        actorId: "ipad-main", lamport: 2, clock: { "ipad-main": 2 },
        payloadSummary: "말풍선 삭제 tombstone", payloadBytes: 120, tombstone: true,
      },
      {
        opId: "t-2", entityKey: "cut-05:balloon-temp", cutId: "cut-05", kind: "tombstone",
        actorId: "ipad-main", lamport: 2, clock: { "ipad-main": 2 },
        payloadSummary: "말풍선 삭제 tombstone", payloadBytes: 120, tombstone: true,
      },
    ];
    const res = compactCrdtOpLog(ops);
    expect(res.compactedCount).toBe(1);
    expect(res.compactedOps[0]?.tombstone).toBe(true);
    expect(res.droppedOpIds).toEqual(["t-1", "t-2"]);
  });

  it("8. 순수 32-bit CRC32와 SHA-256 구현이 IEEE 802.3 및 NIST FIPS 180-4 표준 테스트 벡터와 정확히 일치한다", () => {
    expect(computeCrc32(utf8("123456789"))).toBe(0xcbf43926);
    expect(computeCrc32Hex(utf8("123456789"))).toBe("cbf43926");
    expect(computeSha256Hex(utf8(""))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(computeSha256Hex(utf8("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("9. 정상 OPFS 16K 원고 스트라이프는 전체 청크와 패리티 검증을 healthy 상태로 통과한다", () => {
    const stripe = createDefaultManuscriptParityStripe(256);
    const report = verifyAndRepairManuscriptChunks(stripe);

    expect(report.overallStatus).toBe("healthy");
    expect(report.losslessVerified).toBe(true);
    expect(report.corruptedChunkIds).toEqual([]);
    expect(report.chunkResults).toHaveLength(4);
    expect(report.chunkResults.every((c) => c.crc32Valid && c.sha256Valid && c.status === "healthy")).toBe(true);
  });

  it("10. 단일 16K 원고 청크가 손상되면 XOR 패리티로 비트 단위 무손실 복구 후 CRC32·SHA-256을 검증한다", () => {
    const clean = createDefaultManuscriptParityStripe(256);
    const originalChunkBytes = new Uint8Array(clean.chunks[1]?.data ?? []);
    const damaged = corruptManuscriptChunk(clean, "chunk-01", 24, 0xd3);

    expect(computeSha256Hex(damaged.chunks[1]?.data ?? new Uint8Array())).not.toBe(clean.chunks[1]?.expectedSha256);

    const report = verifyAndRepairManuscriptChunks(damaged);
    expect(report.overallStatus).toBe("repaired");
    expect(report.losslessVerified).toBe(true);
    expect(report.corruptedChunkIds).toEqual(["chunk-01"]);
    expect(report.repairedChunkIds).toEqual(["chunk-01"]);
    expect(report.unrecoverableChunkIds).toEqual([]);

    const repairedItem = report.chunkResults.find((item) => item.chunkId === "chunk-01");
    expect(repairedItem?.status).toBe("repaired");
    expect(repairedItem?.repairedByteDiffCount).toBe(4);
    expect(Array.from(report.repairedStripe.chunks[1]?.data ?? [])).toEqual(Array.from(originalChunkBytes));
  });

  it("11. XOR 패리티 블록만 단독 손상된 경우 정상 청크 XOR 합산으로 패리티를 무손실 재구축한다", () => {
    const clean = createDefaultManuscriptParityStripe(256);
    const damagedParity = corruptManuscriptChunk(clean, "parity", 16, 0x7f);
    const report = verifyAndRepairManuscriptChunks(damagedParity);

    expect(report.overallStatus).toBe("parity-rebuilt");
    expect(report.parityValidBefore).toBe(false);
    expect(report.parityValidAfter).toBe(true);
    expect(report.losslessVerified).toBe(true);
    expect(Array.from(report.repairedStripe.parityData)).toEqual(Array.from(clean.parityData));
  });

  it("12. 2개 이상 청크가 동시 손상되면 단일 XOR 한계를 명시하고 fail-closed(degraded-unrecoverable)로 처리한다", () => {
    const clean = createDefaultManuscriptParityStripe(256);
    const twoCorrupted = corruptManuscriptChunk(corruptManuscriptChunk(clean, "chunk-00", 8, 0x33), "chunk-02", 40, 0x99);
    const report = verifyAndRepairManuscriptChunks(twoCorrupted);

    expect(report.overallStatus).toBe("degraded-unrecoverable");
    expect(report.losslessVerified).toBe(false);
    expect(report.repairedChunkIds).toEqual([]);
    expect(report.unrecoverableChunkIds).toEqual(["chunk-00", "chunk-02"]);
  });

  it("13. 데이터 청크와 패리티 블록이 동시 손상되면 임의 복구를 금지하고 복구 불가로 보고한다", () => {
    const clean = createDefaultManuscriptParityStripe(256);
    const bothDamaged = corruptManuscriptChunk(corruptManuscriptChunk(clean, "chunk-03", 12, 0x44), "parity", 12, 0x44);
    const report = verifyAndRepairManuscriptChunks(bothDamaged);

    expect(report.overallStatus).toBe("degraded-unrecoverable");
    expect(report.parityValidBefore).toBe(false);
    expect(report.losslessVerified).toBe(false);
    expect(report.unrecoverableChunkIds).toEqual(["chunk-03"]);
  });

  it("14. 멀티탭 잠금 상태기계는 하트비트 갱신으로 TTL을 연장하되 에폭을 불필요하게 올리지 않는다", () => {
    let state = createInitialTabWriterLeaseState(5000);
    expect(state.activeWriterTabId).toBe("tab-main");
    expect(state.fencingEpoch).toBe(1);

    state = stepTabWriterLease(state, { type: "tick", deltaMs: 3000 });
    expect(state.activeWriterTabId).toBe("tab-main");
    state = stepTabWriterLease(state, { type: "heartbeat", tabId: "tab-main" });
    expect(state.fencingEpoch).toBe(1);
    expect(state.leaseExpiresAtMs).toBe(9000);
    expect(state.auditLog[0]?.kind).toBe("renewed");
  });

  it("15. 하트비트 만료 감지 후 다른 탭이 잠금을 획득하면 fencingEpoch가 단조 증가하고 구 탭은 읽기 전용으로 강등된다", () => {
    let state = createInitialTabWriterLeaseState(5000);
    state = stepTabWriterLease(state, { type: "tick", deltaMs: 5500 });

    expect(state.activeWriterTabId).toBeNull();
    expect(state.tabs.find((t) => t.tabId === "tab-main")?.role).toBe("read-only");
    expect(state.auditLog[0]?.kind).toBe("heartbeat-expired");

    state = stepTabWriterLease(state, { type: "request-write-lease", tabId: "tab-ref" });
    expect(state.activeWriterTabId).toBe("tab-ref");
    expect(state.fencingEpoch).toBe(2);
    expect(state.tabs.find((t) => t.tabId === "tab-ref")?.role).toBe("writer");
  });

  it("16. 활성 쓰기 잠금 중 다른 탭의 일반 요청은 비파괴 읽기 전용 폴백을 유지하고 강제 인계 시에만 에폭이 증가한다", () => {
    let state = createInitialTabWriterLeaseState(5000);
    state = stepTabWriterLease(state, { type: "request-write-lease", tabId: "tab-ref" });

    expect(state.activeWriterTabId).toBe("tab-main");
    expect(state.fencingEpoch).toBe(1);
    expect(state.tabs.find((t) => t.tabId === "tab-ref")?.role).toBe("read-only");
    expect(state.auditLog[0]?.kind).toBe("read-only-fallback");

    state = stepTabWriterLease(state, { type: "request-write-lease", tabId: "tab-ref", forceTakeover: true });
    expect(state.activeWriterTabId).toBe("tab-ref");
    expect(state.fencingEpoch).toBe(2);
    expect(state.tabs.find((t) => t.tabId === "tab-main")?.role).toBe("read-only");
    expect(state.auditLog[0]?.kind).toBe("handoff");
  });

  it("17. 구 fencingEpoch를 제출한 지연 쓰기는 즉시 차단(write-fenced)되고 비파괴 초안 버퍼에 안전 격리된다", () => {
    let state = createInitialTabWriterLeaseState(5000);
    state = stepTabWriterLease(state, { type: "request-write-lease", tabId: "tab-ref", forceTakeover: true });
    expect(state.fencingEpoch).toBe(2);

    // 구 쓰기 탭 tab-main이 예전 Epoch 1 토큰으로 쓰기 시도 -> 차단 + 초안 보존
    state = stepTabWriterLease(state, {
      type: "attempt-write", tabId: "tab-main", submittedEpoch: 1, payloadLabel: "지연 스트로크",
    });
    expect(state.committedWriteSequence).toBe(0);
    expect(state.auditLog[0]?.kind).toBe("write-fenced");
    const demotedMain = state.tabs.find((t) => t.tabId === "tab-main");
    expect(demotedMain?.blockedWriteAttempts).toBe(1);
    expect(demotedMain?.pendingReadOnlyDraftCount).toBe(1);

    // 현 쓰기 탭 tab-ref가 Epoch 2로 쓰기 시도 -> 승인
    state = stepTabWriterLease(state, {
      type: "attempt-write", tabId: "tab-ref", submittedEpoch: 2, payloadLabel: "정상 커밋",
    });
    expect(state.committedWriteSequence).toBe(1);
    expect(state.auditLog[0]?.kind).toBe("write-accepted");
  });

  it("18. 신규 탭 합류(register-tab)와 자진 반납(release-lease)은 쓰기 소유권 안전 불변식을 유지한다", () => {
    let state = createInitialTabWriterLeaseState(5000);
    state = stepTabWriterLease(state, {
      type: "register-tab", tabId: "tab-export", labelKo: "탭 D · 내보내기", labelEn: "Tab D · Export",
    });
    expect(state.tabs).toHaveLength(4);
    expect(state.tabs.find((t) => t.tabId === "tab-export")?.role).toBe("read-only");
    expect(state.activeWriterTabId).toBe("tab-main");

    state = stepTabWriterLease(state, { type: "release-lease", tabId: "tab-main" });
    expect(state.activeWriterTabId).toBeNull();
    state = stepTabWriterLease(state, { type: "request-write-lease", tabId: "tab-export" });
    expect(state.activeWriterTabId).toBe("tab-export");
    expect(state.fencingEpoch).toBe(2);
  });

  it("19. StudioOfflineResiliencePanel은 Props 없이 단독 렌더링되며 탭 1에서 벡터시계 비교·큐 추가·CRDT 압축이 동작한다", () => {
    const onCompaction = vi.fn();
    render(<StudioOfflineResiliencePanel />);
    expect(screen.getByTestId("offline-resilience-panel")).toBeTruthy();
    expect(screen.getByTestId("tab-crdt-vclock").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("vclock-relation-badge").textContent).toContain("concurrent");

    cleanup();
    render(<StudioOfflineResiliencePanel onCompactionChange={onCompaction} />);
    fireEvent.click(screen.getByTestId("btn-append-overwrite"));
    fireEvent.click(screen.getByTestId("btn-inject-conflict"));
    fireEvent.click(screen.getByTestId("btn-compact-crdt"));

    expect(onCompaction).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("crdt-op-count").textContent).toContain("4 → 4");
    expect(screen.getByTestId("resilience-notice-banner").textContent).toContain("CRDT 큐 압축 완료");
  });

  it("20. 탭 2(OPFS 16K 무결성·XOR 복구)에서 단일 손상 무손실 복구와 이중 손상 fail-closed 경고가 동작한다", () => {
    const onReport = vi.fn();
    render(<StudioOfflineResiliencePanel initialTab="opfs-parity" onRecoveryReportChange={onReport} />);

    expect(screen.getByTestId("panel-opfs-parity")).toBeTruthy();
    fireEvent.click(screen.getByTestId("btn-corrupt-chunk-01"));
    expect(screen.getByTestId("chunk-status-chunk-01").textContent).toContain("손상됨");

    fireEvent.click(screen.getByTestId("btn-verify-repair-opfs"));
    expect(onReport).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("opfs-lossless-badge").textContent).toContain("통과");
    expect(screen.getByTestId("chunk-status-chunk-01").textContent).toContain("복구됨");

    fireEvent.click(screen.getByTestId("btn-corrupt-chunk-00"));
    fireEvent.click(screen.getByTestId("btn-corrupt-chunk-02"));
    fireEvent.click(screen.getByTestId("btn-verify-repair-opfs"));
    expect(screen.getByTestId("opfs-lossless-badge").textContent).toContain("복구 한계 초과");
  });

  it("21. 탭 3(멀티탭 쓰기 잠금·펜싱 토큰)에서 하트비트 만료·새 에폭 획득·구 에폭 쓰기 차단 및 초안 보존이 동작한다", () => {
    const onLease = vi.fn();
    render(<StudioOfflineResiliencePanel initialTab="tab-lease" onLeaseStateChange={onLease} />);

    expect(screen.getByTestId("lease-active-writer").textContent).toBe("tab-main");
    expect(screen.getByTestId("lease-fencing-epoch").textContent).toContain("Epoch 1");

    fireEvent.click(screen.getByTestId("btn-lease-tick-expire"));
    expect(screen.getByTestId("lease-active-writer").textContent).toContain("없음");

    fireEvent.click(screen.getByTestId("btn-acquire-tab-ref"));
    expect(screen.getByTestId("lease-active-writer").textContent).toBe("tab-ref");
    expect(screen.getByTestId("lease-fencing-epoch").textContent).toContain("Epoch 2");

    // 구 쓰기 탭 tab-main(known Epoch 1)에서 쓰기 시도 -> 차단 + 초안 보존 1건
    fireEvent.click(screen.getByTestId("btn-write-tab-main"));
    expect(screen.getByTestId("lease-fenced-summary").textContent).toContain("차단 1 · 초안 1");
    expect(screen.getByTestId("lease-drafts-tab-main").textContent).toContain("1");
    expect(onLease).toHaveBeenCalled();
  });

  it("22. 영문 로케일 렌더링 및 모듈 전체 엄격 정적 위생 규칙(800줄·원시색상0건·무스토리지·무BigInt·props규칙)을 통과한다", () => {
    render(<StudioOfflineResiliencePanel locale="en" />);
    expect(screen.getByTestId("btn-compact-crdt").textContent).toContain("Run CRDT Compaction");

    const files = [
      "offline-resilience-engine.ts",
      "StudioOfflineResiliencePanel.tsx",
      "index.ts",
      "offline-crdt-resilience.test.tsx",
    ];
    const storageRe = new RegExp(["local", "Storage", "|", "session", "Storage"].join(""));
    const bigintHexRe = new RegExp(["0x[0-9a-fA-F]+", "n\\b"].join(""));
    const privateStoreRe = new RegExp(["private\\s+", "(?:readonly\\s+)?", "store\\b"].join(""));
    const rawColorRe = new RegExp(["#[0-9a-fA-F]{3,8}\\b", "|\\brgba?\\s*\\(", "|\\bhsla?\\s*\\("].join(""));

    for (const file of files) {
      const content = readFileSync(resolve(MODULE_DIR, file), "utf8");
      expect(content.split("\n").length, `${file} 800줄 제한 위반`).toBeLessThanOrEqual(800);
      expect(storageRe.test(content), `${file} 브라우저 스토리지 금지 위반`).toBe(false);
      expect(bigintHexRe.test(content), `${file} 0x...n BigInt 리터럴 금지 위반`).toBe(false);
      expect(privateStoreRe.test(content), `${file} private Map store 금지 위반`).toBe(false);
    }

    const panelSrc = readFileSync(resolve(MODULE_DIR, "StudioOfflineResiliencePanel.tsx"), "utf8");
    expect(rawColorRe.test(panelSrc), "UI panel must contain zero raw hex/rgb/hsl colors").toBe(false);
    expect(panelSrc.includes("[word-break:keep-all]")).toBe(true);
    expect(panelSrc.includes("tabular-nums")).toBe(true);
    expect(panelSrc.includes("min-h-11")).toBe(true);
    expect(/:\s*StudioOfflineResiliencePanelProps\s*=\s*\{\s*\}/.test(panelSrc)).toBe(false);
  });
});
