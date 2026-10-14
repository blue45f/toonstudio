import { describe, expect, it } from "vitest";

import type { StudioConnectivitySnapshot } from "./offline/studio-connectivity";
import {
  resolveSaveRecoveryView,
  saveRecoveryAnnouncement,
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
