/** 복구 정본을 확인하기 전에는 임시 bootstrap을 사용자 백업으로 내보내지 않는다. */
export interface StudioProjectBackupReadiness {
  readonly documentKey: string;
  readonly workHydrated: boolean;
  readonly autosaveChecked: boolean;
  readonly autosaveCheckedDocumentKey: string | null;
  readonly autosaveCheckFailed: boolean;
  readonly hasAutosave: boolean;
}

/** 요소 수는 권위의 증거가 아니다. 확인을 마친 새 빈 문서는 정상적으로 백업한다. */
export function studioProjectBackupUnavailableReason(
  state: StudioProjectBackupReadiness,
  requestedDocumentKey = state.documentKey,
): string | null {
  if (state.documentKey !== requestedDocumentKey) {
    return "열린 그림이 바뀌어 백업을 멈췄어요. 현재 그림에서 다시 시도해 주세요.";
  }
  if (state.autosaveCheckedDocumentKey === state.documentKey && state.autosaveCheckFailed) {
    return "저장된 그림을 확인하지 못했어요. 새로고침해 다시 확인해 주세요. 이전 저장본은 유지됩니다.";
  }
  if (!state.workHydrated || !state.autosaveChecked || state.autosaveCheckedDocumentKey !== state.documentKey) {
    return "저장된 그림을 확인하는 중이에요. 확인이 끝나면 백업할 수 있어요.";
  }
  if (state.hasAutosave) {
    return "저장된 그림을 이어 연 뒤 백업할 수 있어요. 캔버스 위 복구 안내를 확인해 주세요.";
  }
  return null;
}
