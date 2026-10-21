import { describe, expect, it } from "vitest";

import type { StudioConnectivitySnapshot } from "./offline/studio-connectivity";
import {
  advanceSaveRecoveryAnnouncement,
  initialSaveRecoveryAnnouncementState,
  resolveSaveRecoveryView,
  saveRecoveryAnnouncement,
  saveRecoveryAnnouncementForSequence,
  type SaveRecoveryKind,
} from "./studio-save-recovery-ux";
import type { StudioSaveSyncStatus } from "./studio-operation-recovery-coordinator";

function status(patch: Partial<StudioSaveSyncStatus> = {}): StudioSaveSyncStatus {
  return {
    documentId: "doc-1",
    localDurable: true,
    pendingOperationsCount: 0,
    lastSavedAt: 1_700_000_000_000,
    lastCheckpointAt: 1_700_000_000_000,
    cloudSyncStatus: "synced",
    summaryText: "",
    ...patch,
  };
}

function connectivity(
  mode: StudioConnectivitySnapshot["mode"],
  patch: Partial<StudioConnectivitySnapshot> = {},
): StudioConnectivitySnapshot {
  return {
    browserOnline: mode !== "offline",
    serverReachable: mode === "online" ? true : mode === "reconnecting" ? null : false,
    checking: mode === "reconnecting",
    mode,
    serverAvailable: mode === "online",
    localOnly: mode !== "online",
    lastCheckedAt: 1_700_000_000_000,
    consecutiveFailures: mode === "server-unavailable" ? 2 : 0,
    ...patch,
  };
}

describe("resolveSaveRecoveryView", () => {
  it("keeps the legacy kinds when no connectivity snapshot is wired", () => {
    expect(resolveSaveRecoveryView(status(), null).kind).toBe("saved");
    expect(resolveSaveRecoveryView(status({ pendingOperationsCount: 3 }), null).kind).toBe("saving");
    expect(resolveSaveRecoveryView(status({ cloudSyncStatus: "offline" }), null).kind).toBe("offline");
    expect(resolveSaveRecoveryView(status({ localDurable: false }), null).kind).toBe("failed");
  });

  it("never shows saved while the server is unreachable, even with no pending work", () => {
    const view = resolveSaveRecoveryView(status(), connectivity("server-unavailable"));
    expect(view.kind).toBe("server-unavailable");
    expect(view.connectionProblem).toBe(true);
    expect(view.canRecheckConnection).toBe(true);
    expect(view.canRetrySave).toBe(false);
  });

  it("distinguishes browser offline from server failure", () => {
    expect(resolveSaveRecoveryView(status(), connectivity("offline")).kind).toBe("offline");
    expect(
      resolveSaveRecoveryView(status(), connectivity("server-unavailable")).kind,
    ).toBe("server-unavailable");
  });

  it("shows reconnecting while a bounded probe is in flight and blocks duplicate rechecks", () => {
    const view = resolveSaveRecoveryView(status(), connectivity("reconnecting"));
    expect(view.kind).toBe("reconnecting");
    expect(view.checkingConnection).toBe(true);
    expect(view.canRecheckConnection).toBe(false);
  });

  it("lets local durability failure win over connectivity states and offers save retry", () => {
    const view = resolveSaveRecoveryView(
      status({ localDurable: false }),
      connectivity("server-unavailable"),
    );
    expect(view.kind).toBe("failed");
    expect(view.canRetrySave).toBe(true);
    // 실패 중에도 연결 문제가 겹치면 재확인 동선은 함께 열려 있어야 한다.
    expect(view.connectionProblem).toBe(true);
    expect(view.canRecheckConnection).toBe(true);
  });

  it("lets the read-only follower state win over everything", () => {
    const view = resolveSaveRecoveryView(status({ localDurable: false }), connectivity("offline"), {
      readOnlyTab: true,
    });
    expect(view.kind).toBe("readonly");
    expect(view.canRetrySave).toBe(false);
  });

  it("returns to saved only when connectivity is online and nothing is pending", () => {
    expect(resolveSaveRecoveryView(status(), connectivity("online")).kind).toBe("saved");
    expect(
      resolveSaveRecoveryView(status({ pendingOperationsCount: 1 }), connectivity("online")).kind,
    ).toBe("saving");
  });
});

describe("saveRecoveryAnnouncementForSequence (C6 상태 전이열)", () => {
  it("keeps the recovered announcement across the full offline → recheck → syncing → saved path", () => {
    // 실제 복구 동선: 오프라인 감지 → 로컬 보존 표시(offline) → 연결 재확인
    // (reconnecting) → 보류분 동기화(saving) → 동기화 확인(saved).
    // 한 쌍 판정(saving→saved)으로는 "saved"로 뭉개지던 전이열이다.
    expect(
      saveRecoveryAnnouncementForSequence(["saved", "offline", "reconnecting", "saving", "saved"]),
    ).toBe("recovered");
    expect(
      saveRecoveryAnnouncementForSequence(["saved", "server-unavailable", "reconnecting", "saved"]),
    ).toBe("recovered");
  });

  it("announces a plain save when no connection problem preceded it", () => {
    expect(saveRecoveryAnnouncementForSequence(["saved", "saving", "saved"])).toBe("saved");
    expect(saveRecoveryAnnouncementForSequence(["saved"])).toBe("none");
    expect(saveRecoveryAnnouncementForSequence([])).toBe("none");
  });

  it("requires a fresh saved confirmation after a failure before reporting recovery", () => {
    let state = initialSaveRecoveryAnnouncementState("saved");
    let step = advanceSaveRecoveryAnnouncement(state, "failed");
    expect(step.announcement).toBe("failed");
    state = step.state;
    step = advanceSaveRecoveryAnnouncement(state, "saving");
    expect(step.announcement).toBe("none");
    state = step.state;
    step = advanceSaveRecoveryAnnouncement(state, "saved");
    expect(step.announcement).toBe("recovered");
    // 한 번 확인된 뒤의 일반 저장은 다시 "saved"다.
    state = step.state;
    step = advanceSaveRecoveryAnnouncement(state, "saving");
    step = advanceSaveRecoveryAnnouncement(step.state, "saved");
    expect(step.announcement).toBe("saved");
  });

  it("does not announce connection-lost twice for offline → server-unavailable drift", () => {
    let state = initialSaveRecoveryAnnouncementState("saved");
    let step = advanceSaveRecoveryAnnouncement(state, "offline");
    expect(step.announcement).toBe("connection-lost");
    state = step.state;
    step = advanceSaveRecoveryAnnouncement(state, "server-unavailable");
    // 종류가 달라 전이로 잡히지만, 이미 연결 상실을 알린 구간이라 최종
    // 알림은 connection-lost 유지 + 확인 대기도 유지된다.
    expect(step.state.syncConfirmationPending).toBe(true);
    step = advanceSaveRecoveryAnnouncement(step.state, "saved");
    expect(step.announcement).toBe("recovered");
  });
});

describe("saveRecoveryAnnouncement", () => {
  const cases: ReadonlyArray<[SaveRecoveryKind, SaveRecoveryKind, string]> = [
    ["saving", "saved", "saved"],
    ["saved", "failed", "failed"],
    ["saved", "offline", "connection-lost"],
    ["saved", "server-unavailable", "connection-lost"],
    ["offline", "saved", "recovered"],
    ["server-unavailable", "saved", "recovered"],
    ["reconnecting", "saved", "recovered"],
    ["saved", "saving", "none"],
    ["offline", "reconnecting", "none"],
    ["saved", "saved", "none"],
  ];
  it.each(cases)("%s -> %s announces %s", (previous, next, expected) => {
    expect(saveRecoveryAnnouncement(previous, next)).toBe(expected);
  });
});
