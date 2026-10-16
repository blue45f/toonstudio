/**
 * 가져오기 직후 메타데이터 저장의 취소·시간 한도.
 *
 * 저장은 장면 반영이 끝난 뒤에 하지만, 저장소(SQLite/OPFS·IndexedDB)가 응답하지 않으면 그 뒤의 일(썸네일 시작, 결과 안내)이
 * 함께 멈춘다. 그래서 두 저장 경로(AI 표기만 남기는 경로, .skp 변환 보고서와 함께 남기는 경로)가 같은 규칙을 쓴다.
 * - 가져오기 취소 신호가 서면 저장을 멈춘다.
 * - 저장소가 한도(기본 15초) 안에 답하지 않으면 멈춘다.
 * 멈춘 뒤에도 저장소 쪽 작업이 이미 쓰고 있을 수 있어 "쓰지 않았다"를 보장하지는 않는다. 그래서 호출한 쪽은 결과를 "저장하지
 * 못했을 수 있다"로 알린다.
 *
 * 이 모듈은 의존하는 모듈이 없다.
 */

export const STUDIO_BG3D_IMPORT_SAVE_TIMEOUT_MS = 15_000;

export type StudioBg3dImportSaveInterruptReason = "cancelled" | "timeout";

export class StudioBg3dImportSaveInterrupted extends Error {
  readonly reason: StudioBg3dImportSaveInterruptReason;

  constructor(reason: StudioBg3dImportSaveInterruptReason) {
    super(reason);
    this.name = "StudioBg3dImportSaveInterrupted";
    this.reason = reason;
  }
}

export interface StudioBg3dImportSaveScope {
  /** 저장소 호출에 넘기는 신호. 취소나 시간 한도에서 선다. */
  readonly signal: AbortSignal;
  readonly reason: () => StudioBg3dImportSaveInterruptReason | null;
  /** 타이머와 바깥 신호 구독을 푼다. 반드시 부른다. */
  readonly dispose: () => void;
}

/** 취소·시간 한도를 하나의 내부 신호로 합친다. */
export function createStudioBg3dImportSaveScope(external: AbortSignal | undefined, timeoutMs: number): StudioBg3dImportSaveScope {
  const controller = new AbortController();
  let reason: StudioBg3dImportSaveInterruptReason | null = null;
  const interrupt = (next: StudioBg3dImportSaveInterruptReason) => {
    if (reason !== null) return;
    reason = next;
    controller.abort();
  };
  const onExternalAbort = () => interrupt("cancelled");
  if (external?.aborted) interrupt("cancelled");
  else external?.addEventListener("abort", onExternalAbort, { once: true });
  const timer = setTimeout(() => interrupt("timeout"), timeoutMs);
  return {
    signal: controller.signal,
    reason: () => reason,
    dispose: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", onExternalAbort);
    },
  };
}

/** 저장소 작업이 끝나기를 기다리되 취소·시간 한도에서는 기다림을 멈추고 `StudioBg3dImportSaveInterrupted` 로 거절한다. */
export function raceStudioBg3dImportSave<T>(work: Promise<T>, scope: StudioBg3dImportSaveScope): Promise<T> {
  const interrupted = () => new StudioBg3dImportSaveInterrupted(scope.reason() ?? "cancelled");
  if (scope.signal.aborted) return Promise.reject(interrupted());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(interrupted());
    scope.signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        scope.signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (cause) => {
        scope.signal.removeEventListener("abort", onAbort);
        reject(cause);
      },
    );
  });
}
