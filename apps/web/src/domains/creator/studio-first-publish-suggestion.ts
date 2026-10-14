/**
 * studio-first-publish-suggestion — "게시 준비 확인하기" 후속 제안의 순수 판정 (first-run F6.2)
 *
 * 배경 (first-run 감사 F6.2):
 * - QuickStart 코치의 4단계는 "저장·되돌리기"에서 끝나고, 게시 준비(사전검사·게시
 *   센터)로 가는 안내는 첫 실행 맥락 어디에도 없다. 첫 10분을 마친 사용자가
 *   "다 그리면 뭘 눌러야 세상에 나가는지"를 스스로 찾아야 한다.
 * - 해소안: 첫 회차의 컷이 일정 수 이상 쌓이면(또는 첫 저장 완료 시) 코치/상태
 *   표시에 "게시 준비 확인하기" 후속 단계를 **한 번만** 제안한다.
 *
 * 이 모듈이 고정하는 계약:
 * - 발동 조건은 둘 중 하나다: ① 첫 저장이 실제로 완료됨(firstSaveCompleted)
 *   ② 컷이 FIRST_PUBLISH_SUGGESTION_CUT_THRESHOLD개 이상 쌓임.
 *   "첫 저장 완료"는 추측이 아니라 오토세이브 receipt가 확인된 경우만 true다
 *   (studio-save-sync-signals의 lastReceipt). lastSavedAt은 receipt가 없어도
 *   기본값이 채워지므로 완료 판정에 쓰지 않는다.
 * - 이미 게시한 문서(alreadyPublished)에는 제안하지 않는다 — 게시 준비는
 *   첫 게시 전용 후속 단계다.
 * - 닫으면(또는 CTA를 누르면) 문서(scope) 단위로 기기에 기억하고 다시는
 *   띄우지 않는다. 기억은 계정이 아니라 기기(localStorage)에 남는다:
 *   제안은 "이 기기에서 이 문서를 처음 만든 흐름"에 대한 안내이기 때문이다.
 *
 * 스토리지는 인자로 주입한다(레포 관용구: resolveStudioProjectResumeTarget가
 * window.localStorage를 인자로 받는 것과 동일). 읽기/쓰기 실패(프라이빗
 * 모드·차단)는 "닫지 않음"으로 안전하게 떨어진다 — 제안이 안 뜨는 것보다
 * 매번 다시 뜨는 쪽이 덜 나쁘지 않으므로, 실패 시 숨기지 않는다.
 */

export const FIRST_PUBLISH_SUGGESTION_CUT_THRESHOLD = 4;

const STORAGE_KEY_PREFIX = "toonstudio:first-publish-suggestion-dismissed:v1:";

export interface FirstPublishSuggestionStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export interface FirstPublishSuggestionSignals {
  /** 오토세이브 receipt로 확인된 첫 저장 완료 여부. */
  readonly firstSaveCompleted: boolean;
  /** 현재 회차에 쌓인 컷 수. 모르면 0. */
  readonly cutCount: number;
  /** 이미 게시된 문서면 제안 대상이 아니다. */
  readonly alreadyPublished?: boolean;
}

export function firstPublishSuggestionStorageKey(scope: string): string {
  const normalized = scope.trim() || "unsaved-document";
  return `${STORAGE_KEY_PREFIX}${normalized}`;
}

/** 조건 판정만 한다. dismissed는 호출자가 스토리지에서 읽어 합친다. */
export function shouldSuggestFirstPublish(
  signals: FirstPublishSuggestionSignals & { readonly dismissed: boolean },
): boolean {
  if (signals.dismissed) return false;
  if (signals.alreadyPublished) return false;
  if (signals.firstSaveCompleted) return true;
  return signals.cutCount >= FIRST_PUBLISH_SUGGESTION_CUT_THRESHOLD;
}

export function readFirstPublishSuggestionDismissed(
  storage: FirstPublishSuggestionStorage | null,
  scope: string,
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(firstPublishSuggestionStorageKey(scope)) === "1";
  } catch {
    return false;
  }
}

export function markFirstPublishSuggestionDismissed(
  storage: FirstPublishSuggestionStorage | null,
  scope: string,
): void {
  if (!storage) return;
  try {
    storage.setItem(firstPublishSuggestionStorageKey(scope), "1");
  } catch {
    // 저장 실패 시 이번 세션에서는 컴포넌트 상태로 숨긴다. 다음 세션에 다시
    // 뜰 수 있지만, 실패를 숨김으로 위장하지는 않는다.
  }
}

export function browserFirstPublishSuggestionStorage(): FirstPublishSuggestionStorage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}
