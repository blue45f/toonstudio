import { defineBilingualText } from "@/shared/lib/i18n-bilingual-copy";

const copy = (id: string, ko: string, en: string) => defineBilingualText("OfflineSyncStorage", id, ko, en);
export const OFFLINE_SYNC_COPY = {
  title: copy("title", "오프라인 동기화 시연", "Offline synchronization demo"),
  session: copy("session", "샘플 데이터로 동기화를 시연합니다. 현재 세션 메모리에만 유지되며 화면을 닫으면 사라집니다. 실제 원고 저장이나 서버 동기화는 수행하지 않습니다.", "Synchronization uses sample data held only in this session's memory and lost when this view closes. It does not save artwork or synchronize with a server."),
  run: copy("run", "시연 동기화", "Simulate synchronization"),
  add: copy("add", "샘플 변경 기록", "Record a sample change"),
  reflected: copy("reflected", "시연 반영", "Simulated changes"),
  recovery: copy("recovery", "이전 브라우저 사본 내보내기", "Export an earlier browser copy"),
  recoveryHint: copy("recoveryHint", "이전 시연이 남긴 저장 위치를 각각 확인합니다. 최신 여부를 판단하거나 원고에 자동 적용하지 않으며 원본은 변경하지 않습니다.", "Inspect each storage location used by the earlier demo. This does not determine which copy is current, apply it to artwork, or change the original."),
  localStorage: copy("localStorage", "localStorage 사본 JSON 내보내기", "Export the localStorage copy as JSON"),
  indexeddb: copy("indexeddb", "IndexedDB 사본 JSON 내보내기", "Export the IndexedDB copy as JSON"),
  reading: copy("reading", "선택한 저장 위치의 사본을 확인하고 있습니다.", "Checking the copy in the selected storage location."),
  exported: copy("exported", "검증한 원문 JSON의 다운로드를 요청했습니다. 원본은 그대로 유지됩니다.", "Requested download of the validated original JSON. The stored original is unchanged."),
  absent: copy("absent", "이 작품에 해당하는 사본이 없습니다. 원본은 변경하지 않았습니다.", "No copy exists for this project in this location. Stored data is unchanged."),
  unavailable: copy("unavailable", "선택한 저장 위치를 읽지 못했습니다. IndexedDB 목록 조회 미지원 또는 접근 제한을 확인해 주세요. 원본은 유지됩니다.", "Could not read the selected storage location. Check IndexedDB database-list support or access restrictions. Originals are unchanged."),
  format: copy("format", "사본 형식을 확인하지 못해 내보내지 않았습니다. 원본은 유지됩니다.", "The copy's format could not be verified, so it was not exported. Originals are unchanged."),
  scope: copy("scope", "현재 작품과 다른 사본이어서 내보내지 않았습니다. 원본은 유지됩니다.", "The copy belongs to a different project and was not exported. Originals are unchanged."),
  size: copy("size", "사본이 8MiB를 초과해 내보내지 않았습니다. 잘라내거나 덮어쓰지 않았으며 원본은 유지됩니다.", "The copy exceeds 8 MiB and was not exported. It was not truncated or overwritten; originals are unchanged."),
} as const;
