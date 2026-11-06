/**
 * First mounted standalone local draft only. Null leaves other document policies unchanged. Once opened, or once navigation leaves that document, this gate
 * never closes again. Later accepted-input recovery and in-flight writes need a separate protocol.
 */
export function createStudioInitialRecoveryAdmission(initialDocumentKey: string | null) {
  let pending = true;
  const blocked = (documentKey: string) => pending && documentKey === initialDocumentKey;
  return {
    blocked,
    renderBlocked: (documentKey: string, recoveryReady: boolean) => (
      blocked(documentKey) && !recoveryReady
    ),
    /** Publish only committed readiness, never a speculative React render. */
    commit(documentKey: string, recoveryReady: boolean): void {
      if (documentKey !== initialDocumentKey || recoveryReady) pending = false;
    },
    captureWrite(documentKey: string): () => boolean {
      // Waiting for authority acquisition must not turn a pre-recovery request into a valid write.
      const admitted = !blocked(documentKey);
      return () => admitted;
    },
  };
}

/** Reject the contact before invoking any stroke/provider/CRDT admission code. */
export function guardStudioInitialRecoveryPointer<Event>(
  blocked: () => boolean,
  explain: () => void,
  admit: (event: Event) => void,
): (event: Event) => void {
  return (event) => {
    if (blocked()) { explain(); return; }
    admit(event);
  };
}
