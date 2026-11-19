import type { StudioLiveRecoveryState } from "./studio-live-collaboration-context";
import type { StudioCrdtRecoveryVaultEntry } from "./studio-crdt-recovery-vault";

export interface StudioLiveRecoveryBoundaryLatch {
  scopeKey: string;
  rejectedUpdateId: string | null;
  recovery: StudioLiveRecoveryState;
}

export function findStudioLiveRecoveryBoundaryEntry(
  entries: readonly StudioCrdtRecoveryVaultEntry[],
  boundary: StudioLiveRecoveryBoundaryLatch
): StudioCrdtRecoveryVaultEntry | null {
  const { vaultId } = boundary.recovery;
  if (vaultId) {
    const exactVault = entries.find((entry) => entry.vaultId === vaultId);
    if (exactVault) return exactVault;
  }
  const rejectedUpdateId = boundary.rejectedUpdateId;
  if (!rejectedUpdateId) return null;
  return entries.find((entry) =>
    entry.rejectedUpdateId === rejectedUpdateId ||
    entry.updates.some((update) => update.updateId === rejectedUpdateId)
  ) ?? null;
}
