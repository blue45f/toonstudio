import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { createStudioInitialRecoveryAdmission, guardStudioInitialRecoveryPointer } from "./initial-recovery";
import { isStudioJoinedLiveJamRoom, shouldRequireStudioLiveServer } from "../live/studio-live-jam-session";
import { projectStudioCollaborationAccessPolicy } from "../studio-cuttoon-editor/runtime/studio-collaboration-access-policy";
import { bindStudioScopedWriteAuthority } from "../studio-collab/studio-scoped-write-authority";
import { createStudioScopedWriteFixture } from "../studio-collab/studio-scoped-write.test-fixture";
import { canStartStudioScopedDrawing } from "../studio-collab/studio-scoped-drawing-boundary";
import { studioProjectBackupUnavailableReason } from "./backup-readiness";

const key = "synthetic-first-visit";
const ready = (gate: ReturnType<typeof createStudioInitialRecoveryAdmission>) => {
  gate.commit(key, true);
};

describe("최초 문서 방문의 입력 admission", () => {
  it("첫 render와 passive 복구 검사 전부터 실제 admit/provider/CRDT 호출을 0회로 유지한다", () => {
    const gate = createStudioInitialRecoveryAdmission(key);
    const provider = vi.fn(), crdt = vi.fn(), createStroke = vi.fn(), notice = vi.fn();
    const admit = vi.fn((event: object) => { provider(event); crdt(event); createStroke(event); });
    const down = guardStudioInitialRecoveryPointer(() => gate.blocked(key), notice, admit);
    for (let i = 0; i < 3; i++) down({ pointerId: i });
    expect(notice).toHaveBeenCalledTimes(3);
    expect(admit).not.toHaveBeenCalled(); expect(provider).not.toHaveBeenCalled();
    expect(crdt).not.toHaveBeenCalled(); expect(createStroke).not.toHaveBeenCalled();
  });
  it("실제 읽기 provenance 없는 locked-branch 완료 플래그로는 열리지 않는다", () => {
    const gate = createStudioInitialRecoveryAdmission(key);
    const syntheticLocked = { documentKey: key, autosaveCheckedDocumentKey: key, autosaveChecked: true, workHydrated: true, autosaveCheckFailed: false, hasAutosave: false };
    expect(studioProjectBackupUnavailableReason(syntheticLocked)).toBeNull();
    const actualReadSucceeded = false;
    const verifiedReady = actualReadSucceeded && studioProjectBackupUnavailableReason(syntheticLocked) === null;
    gate.commit(key, verifiedReady);
    expect(gate.renderBlocked(key, verifiedReady)).toBe(true);
    expect(gate.blocked(key)).toBe(true);
  });
  it("실제 읽기 성공 이후에도 복구 pending·실패·취소 동안 admission을 열지 않는다", () => {
    const gate = createStudioInitialRecoveryAdmission(key);
    for (const _state of ["pending", "restore-failed", "restore-cancelled", "delete-cancelled"]) {
      gate.commit(key, false); expect(gate.blocked(key)).toBe(true);
    }
    gate.commit(key, true); expect(gate.blocked(key)).toBe(false);
  });
  it("읽기 실패는 ready로 표시해도 차단하고 명시 재확인 성공 뒤에만 연다", () => {
    const gate = createStudioInitialRecoveryAdmission(key);
    gate.commit(key, false);
    expect(gate.blocked(key)).toBe(true);
    ready(gate); expect(gate.blocked(key)).toBe(false);
  });
  it("성공한 ready render는 표시를 풀되 실제 callback은 layout commit까지 차단한다", () => {
    const gate = createStudioInitialRecoveryAdmission(key);
    expect(gate.renderBlocked(key, true)).toBe(false);
    expect(gate.blocked(key)).toBe(true);
    gate.commit(key, true); expect(gate.blocked(key)).toBe(false);
  });
  it("복구 완료 또는 정상 fresh empty 이후 pointer를 원래 함수에 정확히 전달한다", () => {
    for (const _kind of ["restored", "fresh-empty", "confirmed-clear"]) {
      const gate = createStudioInitialRecoveryAdmission(key), admit = vi.fn(), notice = vi.fn();
      const event = { pointerId: 1 };
      const down = guardStudioInitialRecoveryPointer(() => gate.blocked(key), notice, admit);
      ready(gate); down(event);
      expect(admit).toHaveBeenCalledExactlyOnceWith(event); expect(notice).not.toHaveBeenCalled();
    }
  });
  it("한 번 연 gate는 다시 닫지 않아 이미 accepted된 입력에 새 return 경계를 만들지 않는다", () => {
    const gate = createStudioInitialRecoveryAdmission(key), admit = vi.fn();
    const down = guardStudioInitialRecoveryPointer(() => gate.blocked(key), () => {}, admit);
    ready(gate); down({ phase: "down" });
    gate.commit(key, false);
    down({ phase: "continuation" });
    expect(admit).toHaveBeenCalledTimes(2); expect(gate.captureWrite(key)()).toBe(true);
  });
  it("첫 문서를 떠나면 영구 은퇴하므로 A→B→A에서 후속 accepted 입력에 개입하지 않는다", () => {
    const gate = createStudioInitialRecoveryAdmission(key);
    gate.commit("other-synthetic", false);
    gate.commit(key, false);
    expect(gate.blocked(key)).toBe(false);
    expect(gate.captureWrite(key)()).toBe(true);
  });
});

describe("최초 복구의 쓰기 admission", () => {
  it("미결 상태에 준비한 요청은 authority acquisition 뒤 ready가 되어도 쓰기를 얻지 못한다", async () => {
    const gate = createStudioInitialRecoveryAdmission(key);
    const allowed = gate.captureWrite(key);
    let release!: () => void;
    const acquisition = new Promise<void>((resolve) => { release = resolve; });
    const opfs = vi.fn(), sqlite = vi.fn(), receipt = vi.fn();
    const pending = acquisition.then(() => {
      if (!allowed()) return;
      opfs(); sqlite(); if (allowed()) receipt();
    });
    ready(gate); release(); await pending;
    expect(opfs).not.toHaveBeenCalled(); expect(sqlite).not.toHaveBeenCalled(); expect(receipt).not.toHaveBeenCalled();
  });
  it("초기 ready 뒤 요청은 후속 상태 변화로 drop하지 않는다: broader drain 보장 아님", () => {
    const gate = createStudioInitialRecoveryAdmission(key); ready(gate);
    const allowed = gate.captureWrite(key);
    gate.commit(key, false);
    expect(allowed()).toBe(true);
  });
});

describe("Host의 B 전용 연결 및 C/D 비변경 계약", () => {
  const host = readFileSync(new URL("../StudioCuttoonEditorHost.tsx", import.meta.url), "utf8");
  it("첫 포인터를 binder 앞에서 감싸고 canvas/scoped 우회도 차단한다", () => {
    expect(host).toContain("const onStageDown = guardStudioInitialRecoveryPointer(");
    expect(host).toContain("onStageDown: onReadyStageDown,");
    expect(host).toContain("if (initialRecoveryAdmission.blocked(autosaveKey)) return false;");
    expect(host).toContain("const canvasInteractionBlocked = initialRecoveryBlocked ||");
    expect(host).toContain("|| initialRecoveryBlocked;\n  scopedCanvasBoundaryRef");
    expect(host).toContain("initialRecoveryAdmission.commit(autosaveKey, initialRecoveryReady)");
  });
  it("실제 reconciliation이 끝나고 cancelled를 확인한 경로만 성공 provenance를 기록한다", () => {
    expect(host).toContain("if (cancelled) return;\n        setInitialRecoveryChecked(!recoveryCheckFailed);\n        autosaveRecoveryCandidateRef.current = saved;");
    const effect = host.slice(host.indexOf("// 로드 시 임시저장 확인 리스너"), host.indexOf("// Autosave runtime owns these actions"));
    const locked = effect.slice(effect.indexOf("if (collaborationDocumentLocked)"), effect.indexOf("let cancelled = false"));
    expect(locked).toContain("setAutosaveCheckedDocumentKey(autosaveKey)");
    expect(locked).not.toContain("setInitialRecoveryChecked(true)");
    expect(effect).toContain("setInitialRecoveryChecked(false)");
  });
  it("normal/tombstone 및 emergency의 dispatch와 receipt에 captured admission을 재사용한다", () => {
    const normal = host.slice(host.indexOf("// 오토세이브 임시저장 리스너"), host.indexOf("// 서버 자동저장"));
    const emergency = host.slice(host.indexOf("persistPendingStrokeEmergencyAutosaveRef.current ="), host.indexOf("function applyStudioProjectSnapshotWithPreparedDocuments("));
    expect(normal).toContain("const initialWriteAllowed = initialRecoveryAdmission.captureWrite(autosaveKey)");
    expect(normal).toContain("&& initialWriteAllowed()");
    expect(emergency).toContain("if (!initialWriteAllowed()) return;");
    expect(emergency).toContain('if (!initialWriteAllowed()) throw new Error("Initial recovery write was not admitted");');
    expect(emergency).toContain(".then((authority) => {\n            if (!initialWriteAllowed()) return;");
  });
  it("기존 accepted completion/queue/checkpoint 경로와 sidecar 실험을 변경하지 않는다", () => {
    const queue = host.slice(host.indexOf("function queueDeferredStrokeCommit("), host.indexOf("function invalidatePendingRetainedRedo("));
    expect(queue).not.toContain("initialRecoveryAdmission");
    expect(host).not.toContain("preserveUnresolvedRecoveryStroke");
    expect(host).not.toContain("appendStudioUnresolvedRecoveryPage");
    expect(host).not.toContain("restoreDetachedRecovery");
  });
});


describe("협업 권한과 최초 local-draft 범위 분리", () => {
  const host = readFileSync(new URL("../StudioCuttoonEditorHost.tsx", import.meta.url), "utf8");
  // Execute the exact Host eligibility expression, not a second policy implementation.
  const expression = host.match(/const initialRecoveryLocalDraft = ([\s\S]*?);/)?.[1];
  if (!expression) throw new Error("Host eligibility expression missing");
  const eligible = new Function("studioRoute", "workId", "remixId", "expectsSharedDocument", "joinedStudioLiveJam", `return ${expression}`) as (...values: unknown[]) => boolean;
  it("명시적 standalone draft만 대상이며 hydrated reader/scoped writer/live/project/work는 기존 경계를 유지한다", () => {
    expect(eligible({ draftId: key }, null, null, false, false)).toBe(true);
    for (const args of [
      [{ draftId: null }, null, null, false, false],
      [{ draftId: key }, "work", null, false, false],
      [{ draftId: key }, null, "remix", false, false],
      [{ draftId: key }, null, null, true, false],
      [{ draftId: key }, null, null, false, true],
    ]) {
      expect(eligible(...args)).toBe(false);
      const gate = createStudioInitialRecoveryAdmission(eligible(...args) ? key : null);
      expect(gate.blocked(key)).toBe(false);
      expect(gate.captureWrite(key)()).toBe(true);
      const scopedAdmit = vi.fn();
      guardStudioInitialRecoveryPointer(() => gate.blocked(key), () => {}, scopedAdmit)({});
      expect(scopedAdmit).toHaveBeenCalledOnce();
    }
  });
  it("local owner의 background transport와 자동 게시된 자기 room은 최초 복구를 우회하지 않는다", () => {
    expect(shouldRequireStudioLiveServer({ expectsSharedDocument: false, draftCollaborationReady: false, liveJam: true })).toBe(true);
    for (const roomId of [null, "owner-room"]) {
      const joined = isStudioJoinedLiveJamRoom({ roomId, instantWorkId: "owner-room" });
      expect(joined).toBe(false);
      expect(eligible({ draftId: key }, null, null, false, joined)).toBe(true);
    }
    const joined = isStudioJoinedLiveJamRoom({ roomId: "remote-room", instantWorkId: "owner-room" });
    expect(joined).toBe(true);
    expect(eligible({ draftId: key }, null, null, false, joined)).toBe(false);
  });
  it("실제 reader 정책의 잠금을 보존하면서 JSON/ZIP 공통 backup readiness는 정상이다", () => {
    const policy = projectStudioCollaborationAccessPolicy({ expectsSharedDocument: true, joinedLiveJam: false,
      realtimeSession: true, participantCanEdit: false, documentReady: true, editsDurablyProtected: true, documentAccessLocked: true });
    expect(policy.documentLocked).toBe(true);
    const gate = createStudioInitialRecoveryAdmission(eligible({ draftId: null }, "work", null, true, false) ? key : null);
    expect(gate.renderBlocked(key, false)).toBe(false);
    expect(studioProjectBackupUnavailableReason({ documentKey: key, workHydrated: true, autosaveChecked: true,
      autosaveCheckedDocumentKey: key, autosaveCheckFailed: false, hasAutosave: false })).toBeNull();
  });
  it("실제 scoped target 권한은 global lock 아래에서도 B 때문에 막히지 않는다", () => {
    const f = createStudioScopedWriteFixture(), owner = { current: { locked: true } };
    const gate = createStudioInitialRecoveryAdmission(eligible({ draftId: null }, "work", null, true, false) ? key : null);
    const boundary = { current: { pageId: "page-1", locked: gate.renderBlocked(key, false) } };
    const unbind = bindStudioScopedWriteAuthority(owner, f.authority);
    try {
      f.choose();
      expect(canStartStudioScopedDrawing(owner, boundary, "draw")).toBe(true);
      const admit = vi.fn();
      guardStudioInitialRecoveryPointer(() => gate.blocked(key), () => {}, admit)({});
      expect(admit).toHaveBeenCalledOnce();
      expect(owner.current.locked).toBe(true);
    } finally { unbind(); }
  });
  it("local→shared 역할 전환의 speculative render는 latch를 바꾸지 않고 commit에서만 은퇴한다", () => {
    const gate = createStudioInitialRecoveryAdmission(key);
    expect(gate.renderBlocked(key, true)).toBe(false);
    expect(gate.blocked(key)).toBe(true);
    gate.commit(key, true);
    gate.commit(key, false);
    expect(gate.blocked(key)).toBe(false);
  });
  it("read-only export metadata는 B 전용 read 성공 state와 분리되어 있다", () => {
    expect(host).toContain("initialRecoveryLocalDraft ? autosaveKey : null");
    expect(host).toContain("|| (initialRecoveryChecked && projectBackupUnavailableReason === null)");
    expect(host).not.toContain("initialRecoveryLocalDraft = !collaborationDocumentLocked");
    const snapshot = host.slice(host.indexOf("const projectBackupSnapshot ="), host.indexOf("const projectBackupUnavailableReason ="));
    expect(snapshot).not.toContain("initialRecoveryChecked");
  });
});
