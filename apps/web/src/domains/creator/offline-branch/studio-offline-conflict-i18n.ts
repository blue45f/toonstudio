import { FALLBACK_CHAIN, getLang, registerI18nLocaleEntries, resolveTranslationForDisplay } from "@/shared/lib/i18n";

const COPY = {
  title: ["오프라인 변경 검토", "Review offline changes"],
  intro: ["공유 원고와 달라진 변경을 하나씩 선택해 주세요. 선택 전까지 원본 변경은 이 기기에 보관됩니다.", "Review each change that differs from the shared manuscript. Original changes stay on this device until you decide."],
  keep: ["공유본 유지", "Keep shared version"],
  reapply: ["내 변경 다시 적용", "Reapply my change"],
  keepHelp: ["이 변경을 공유 원고에 보내지 않고, 원본은 복구 기록에 남깁니다.", "Do not send this change to the shared manuscript; keep its original in the recovery record."],
  reapplyHelp: ["현재 공유본을 기준으로 이 변경을 다시 적용합니다. 서버 승인 전까지 반영 대기로 표시됩니다.", "Reapply this change against the current shared version. It stays pending until the server acknowledges it."],
  changeNumber: ["변경 {number}", "Change {number}"],
  pageNumber: ["{number}페이지", "Page {number}"],
  deletedPage: ["삭제된 페이지", "Deleted page"],
  notOwned: ["현재 사용자에게 속한 변경이 아닙니다.", "This change does not belong to the current user."],
  published: ["이미 공유한 변경이어서 여기서 다시 처리할 수 없습니다.", "This change has already been shared and cannot be processed again here."],
  offline: ["공유 원고에 연결한 뒤 내 변경을 다시 적용할 수 있습니다.", "Connect to the shared manuscript before reapplying your change."],
  pageMissing: ["공유 원고에서 페이지가 삭제되어 다시 적용할 수 없습니다.", "The page was deleted from the shared manuscript, so this change cannot be reapplied."],
  payloadUnavailable: ["변경 자료를 확인할 수 없어 다시 적용할 수 없습니다.", "The change data could not be verified and cannot be reapplied."],
  resolutionUnavailable: ["현재 이 변경을 처리할 수 없습니다. 원본 변경은 보관됩니다.", "This change cannot be processed right now. The original change is kept."],
  unknownPage: ["이름 없는 페이지", "Untitled page"],
  stroke: ["선", "Stroke"],
  element: ["요소", "Element"],
  group: ["레이어 그룹", "Layer group"],
  upsert: ["추가·수정", "Add or edit"],
  remove: ["삭제", "Delete"],
  targetChanged: ["다른 작업으로 공유본의 대상이 변경됐습니다.", "The target was changed in the shared version."],
  targetMissing: ["수정한 대상이 공유본에서 삭제됐습니다.", "The edited target was deleted from the shared version."],
  targetExists: ["공유본에 같은 대상이 이미 있습니다.", "The target already exists in the shared version."],
  payloadMissing: ["이 기기에서 변경 원본을 찾지 못해 다시 적용할 수 없습니다.", "The original change is missing on this device and cannot be reapplied."],
  payloadCorrupt: ["변경 원본을 검증하지 못해 다시 적용할 수 없습니다.", "The original change could not be verified and cannot be reapplied."],
  unsupported: ["이 변경은 자동 적용할 수 없어 공유본과 복구 기록을 유지합니다.", "This change cannot be applied automatically. The shared version and recovery record are kept."],
  busy: ["선택 저장 중…", "Saving decision…"],
  failed: ["선택을 저장하지 못했습니다. 원본 변경을 유지했습니다. 다시 시도해 주세요.", "Could not save the decision. Your original change is kept. Try again."],
  kept: ["공유본 유지 결정을 저장했습니다. 원본 변경은 복구 기록에 남아 있습니다.", "The decision to keep the shared version is saved. The original change remains in the recovery record."],
  reapplied: ["다시 적용 결정을 저장했습니다. 서버 승인 여부는 동기화 상태에서 확인해 주세요.", "The reapply decision is saved. Check synchronization status for server acknowledgement."],
  showMore: ["다음 변경 더 보기", "Show more changes"],
  shown: ["{total}개 중 {count}개 표시", "Showing {count} of {total} changes"],
  conflictLabel: ["오프라인 변경 {count}개 검토 필요", "Review {count} offline changes"],
  conflictHeadline: ["공유본과 다른 오프라인 변경을 검토해 주세요", "Review offline changes that differ from the shared version"],
  conflictDetail: ["오프라인 변경 {count}개는 자동으로 덮어쓰지 않고 보관했습니다. 아래에서 공유본 유지 또는 내 변경 다시 적용을 선택해 주세요.", "Kept {count} offline changes without overwriting the shared version. Choose to keep the shared version or reapply each change below."],
  pendingLabel: ["오프라인 변경 {count}개 반영 대기", "{count} offline changes pending"],
  pendingHeadline: ["기기에 보관한 오프라인 변경의 서버 승인을 기다립니다", "Waiting for server acknowledgement of offline changes kept on this device"],
  pendingDetail: ["오프라인 변경 {count}개가 아직 서버 승인을 받지 못했습니다. 기기 보관과 서버 반영은 서로 다른 단계입니다.", "{count} offline changes have not been acknowledged by the server. Device storage and server delivery are separate stages."],
  serverPending: ["공유 원고 버전은 유지됩니다. 보관한 오프라인 변경의 서버 반영은 아직 확인되지 않았습니다.", "The shared manuscript version is kept. Server delivery of the offline changes has not been confirmed."],
  unavailable: ["현재 원고 또는 편집 권한이 달라져 이 변경을 처리할 수 없습니다.", "The manuscript or editing permission changed; this change cannot be processed now."],
} as const;

type CopyKey = keyof typeof COPY;
const PREFIX = "studio.offlineConflict.";
registerI18nLocaleEntries("ko", Object.fromEntries(Object.entries(COPY).map(([key, value]) => [PREFIX + key, value[0]])));
registerI18nLocaleEntries("en", Object.fromEntries(Object.entries(COPY).map(([key, value]) => [PREFIX + key, value[1]])));

export function offlineConflictText(key: CopyKey, params: Readonly<Record<string, string | number>> = {}): string {
  const text = resolveTranslationForDisplay(getLang(), PREFIX + key, FALLBACK_CHAIN, COPY[key][0]);
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) => Object.hasOwn(params, token) ? String(params[token]) : placeholder);
}
