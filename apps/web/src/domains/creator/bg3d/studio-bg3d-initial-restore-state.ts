/** 초기 복원 시작과 완료를 분리한다. renderer 교체만으로 pending 원본을 완료로 간주하지 않는다. */
export interface StudioBg3dInitialRestoreSource {
  readonly session: object;
  readonly initialScene: unknown;
  readonly initialDataUrl: unknown;
}
export interface StudioBg3dInitialRestoreAttempt {
  readonly kind: "initial-restore" | "renderer-remount";
  readonly source: StudioBg3dInitialRestoreSource;
}
export function createStudioBg3dInitialRestoreState() {
  let source: StudioBg3dInitialRestoreSource | null = null;
  let completed = false;
  let current: StudioBg3dInitialRestoreAttempt | null = null;
  return {
    begin(next: StudioBg3dInitialRestoreSource): StudioBg3dInitialRestoreAttempt {
      const same = source !== null && source.session === next.session
        && source.initialScene === next.initialScene && source.initialDataUrl === next.initialDataUrl;
      if (!same) completed = false;
      source = Object.freeze({ ...next });
      current = Object.freeze({ kind: same && completed ? "renderer-remount" : "initial-restore", source });
      return current;
    },
    isCurrent(attempt: StudioBg3dInitialRestoreAttempt): boolean { return current === attempt; },
    complete(attempt: StudioBg3dInitialRestoreAttempt): boolean {
      if (current !== attempt || attempt.kind !== "initial-restore") return false;
      completed = true; return true;
    },
    cancel(attempt: StudioBg3dInitialRestoreAttempt): void { if (current === attempt) current = null; },
  };
}
